// Adversarial tests of the kitchens list query. `staff-kitchen-query.test.ts`
// pins the listed examples. This file adds what a plausible mutant survives: the query carries exactly four
// members (so a caller's key can never reach the store), the page bound across the whole numeric range (the
// existing property draws `fc.nat()`, at most 2**31 - 1, so its "offset is a safe integer" assertion cannot fail),
// the search bound in the stored form, every segment against every status, and hostile objects.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { REQUEST_STATUSES } from "../../src/staff/request-status.js";
import {
  STAFF_KITCHEN_PAGE_SIZE,
  STAFF_KITCHEN_SEARCH_MAX_LENGTH,
  STAFF_KITCHEN_SEGMENTS,
  readStaffKitchenQuery,
  staffKitchenOffsetOf,
  type StaffKitchenQuery,
  type StaffKitchenQueryIssue,
} from "../../src/staff/staff-kitchen-query.js";

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const LAST_ACCEPTED_PAGE = MAX_SAFE / BigInt(STAFF_KITCHEN_PAGE_SIZE);
const QUERY_MEMBERS = ["page", "search", "segment", "status"];
const FIELDS = ["segment", "status", "q", "page", "query"];
const CODES = [
  "NOT_TEXT",
  "TOO_LONG",
  "FORBIDDEN_CHARACTER",
  "NOT_AN_OBJECT",
  "UNKNOWN_VALUE",
  "NOT_A_PAGE_NUMBER",
  "STATUS_NEEDS_SENT_SEGMENT",
];

function queryOf(raw: unknown): StaffKitchenQuery {
  const reading = readStaffKitchenQuery(raw);
  if (!reading.ok) {
    throw new Error(
      `expected a query, refused: ${JSON.stringify(reading.issues)}`,
    );
  }
  return reading.query;
}

function issuesOf(raw: unknown): readonly StaffKitchenQueryIssue[] {
  const reading = readStaffKitchenQuery(raw);
  return reading.ok ? [] : reading.issues;
}

function codePointCount(text: string): number {
  return Array.from(text).length;
}

describe("the query that is returned carries exactly the four members the store reads", () => {
  const hostileMembers: unknown = JSON.parse(
    JSON.stringify({
      segment: "all",
      q: "ana",
      page: "2",
      limit: "100000",
      orderBy: "id; drop table designs",
      offset: "99",
      where: "1=1",
      constructor: "x",
    }).replace("{", '{"__proto__":{"segment":"drafts"},'),
  );

  it("has no member the caller added", () => {
    const query = queryOf(hostileMembers);

    expect(Object.keys(query).sort()).toEqual(QUERY_MEMBERS);
    expect(Reflect.ownKeys(query)).toHaveLength(QUERY_MEMBERS.length);
  });

  it("has only primitive members, so nothing the caller built is shared with the store", () => {
    const query = queryOf(hostileMembers);

    for (const value of Object.values(query)) {
      expect(value === null || typeof value !== "object").toBe(true);
    }
  });

  it("returns the same four members for an object with no prototype, with own __proto__ and constructor keys as JSON.parse makes them", () => {
    const parsed: unknown = JSON.parse(
      '{"__proto__":{"segment":"drafts"},"constructor":{"page":"9"},"page":"3","limit":"7"}',
    );

    const query = queryOf(parsed);

    expect(query).toEqual({
      segment: "sent",
      status: null,
      search: null,
      page: 3,
    });
    expect(Object.keys(query).sort()).toEqual(QUERY_MEMBERS);
  });

  it("does not pollute Object.prototype while reading", () => {
    queryOf(JSON.parse('{"__proto__":{"polluted":"yes"},"segment":"all"}'));

    expect(Reflect.get(Object.prototype, "polluted")).toBeUndefined();
  });

  it("reads each member once, so a member that changes between reads cannot pass one check and store another", () => {
    const reads: Record<string, number> = {};
    const flipping = (name: string, first: string, later: string) => {
      Object.defineProperty(members, name, {
        enumerable: true,
        get() {
          reads[name] = (reads[name] ?? 0) + 1;
          return reads[name] === 1 ? first : later;
        },
      });
    };
    const members: Record<string, unknown> = {};
    flipping("segment", "sent", "drafts");
    flipping("status", "new", "bogus");
    flipping("q", "ana", "ana\u0000");
    flipping("page", "2", "0");

    const query = queryOf(members);

    expect(query).toEqual({
      segment: "sent",
      status: "new",
      search: "ana",
      page: 2,
    });
    expect(reads).toEqual({ segment: 1, status: 1, q: 1, page: 1 });
  });
});

describe("every segment against every status", () => {
  const statusesAndNone = [...REQUEST_STATUSES, "", undefined, "won"] as const;

  it.each(
    STAFF_KITCHEN_SEGMENTS.flatMap((segment) =>
      statusesAndNone.map((status) => [segment, status] as const),
    ),
  )("segment %s with status %s", (segment, status) => {
    const reading = readStaffKitchenQuery({ segment, status });
    const isStatusKnown =
      status === undefined ||
      status === "" ||
      REQUEST_STATUSES.some((known) => known === status);

    if (!isStatusKnown) {
      expect(reading).toEqual({
        ok: false,
        issues: [{ field: "status", code: "UNKNOWN_VALUE" }],
      });
    } else if (segment !== "sent" && status !== undefined && status !== "") {
      expect(reading).toEqual({
        ok: false,
        issues: [{ field: "status", code: "STATUS_NEEDS_SENT_SEGMENT" }],
      });
    } else {
      expect(reading).toEqual({
        ok: true,
        query: {
          segment,
          status: status === "" ? null : (status ?? null),
          search: null,
          page: 1,
        },
      });
    }
  });
});

describe("page across the whole numeric range", () => {
  it("pins the last page whose rows are countable to 450359962737049", () => {
    expect(LAST_ACCEPTED_PAGE).toBe(450359962737049n);
  });

  const digitsOfAnySize = fc
    .bigInt({ min: 1n, max: 10n ** 25n })
    .map((value) => value.toString());
  const digitsAroundTheBound = fc
    .bigInt({ min: -40n, max: 40n })
    .map((offset) => (LAST_ACCEPTED_PAGE + offset).toString());
  const digitsAroundSafeInteger = fc
    .bigInt({ min: -40n, max: 40n })
    .map((offset) => (MAX_SAFE + offset).toString());

  propertyTest.prop(
    [fc.oneof(digitsOfAnySize, digitsAroundTheBound, digitsAroundSafeInteger)],
    { numRuns: 5000 },
  )(
    "is accepted exactly when page times 20 is a safe integer, is never rounded, and always has a safe offset",
    (text) => {
      const reading = readStaffKitchenQuery({ page: text });
      const shouldFit = BigInt(text) <= LAST_ACCEPTED_PAGE;

      expect(reading.ok).toBe(shouldFit);
      if (!reading.ok) {
        expect(reading.issues).toEqual([
          { field: "page", code: "NOT_A_PAGE_NUMBER" },
        ]);
        return;
      }
      expect(String(reading.query.page)).toBe(text);
      const offset = staffKitchenOffsetOf(reading.query.page);
      expect(Number.isSafeInteger(offset)).toBe(true);
      expect(BigInt(offset)).toBe(
        (BigInt(text) - 1n) * BigInt(STAFF_KITCHEN_PAGE_SIZE),
      );
    },
  );

  it.each([
    ["the largest safe integer", "9007199254740991"],
    ["the first integer past it", "9007199254740992"],
    ["a 25-digit number", "1".repeat(25)],
    ["the last page, plus one", (LAST_ACCEPTED_PAGE + 1n).toString()],
  ])("refuses %s", (_label, page) => {
    expect(issuesOf({ page })).toEqual([
      { field: "page", code: "NOT_A_PAGE_NUMBER" },
    ]);
  });

  it("accepts the last page whose rows are countable, and its offset is exact", () => {
    const query = queryOf({ page: LAST_ACCEPTED_PAGE.toString() });

    expect(BigInt(staffKitchenOffsetOf(query.page))).toBe(
      (LAST_ACCEPTED_PAGE - 1n) * BigInt(STAFF_KITCHEN_PAGE_SIZE),
    );
  });

  it.each([
    "\u0661",
    "\u06F1",
    "\u0967",
    "\uFF11",
    "1\u200B",
    "\u200B1",
    "1\u0000",
    "1\n",
    "\n1",
    " 1",
    "1 ",
    "\t1",
    "\u00A01",
    "1\u3000",
    "\u0660",
    "00",
    "-0",
    "+1",
    "1.",
    ".1",
    "1e0",
    "1E3",
    "0b1",
    "0o7",
    "\u0661\u0662\u0663",
  ])("refuses the text %j as not a page number", (page) => {
    expect(issuesOf({ page })).toEqual([
      { field: "page", code: "NOT_A_PAGE_NUMBER" },
    ]);
  });
});

describe("search bound is in the stored form", () => {
  const COMPOSED = "\u00E9";
  const DECOMPOSED = "e\u0301";

  it("counts the stored form: 100 characters written composed or decomposed fit, and 101 of either do not", () => {
    for (const letter of [COMPOSED, DECOMPOSED]) {
      expect(queryOf({ q: letter.repeat(100) }).search).toBe(
        COMPOSED.repeat(100),
      );
      expect(issuesOf({ q: letter.repeat(101) })).toEqual([
        { field: "q", code: "TOO_LONG" },
      ]);
    }
  });

  it("counts a character that GROWS when composed by its stored form: 50 of U+0958 fit, 51 do not", () => {
    expect(codePointCount("\u0958".normalize("NFC"))).toBe(2);
    expect(queryOf({ q: "\u0958".repeat(50) }).search).toHaveLength(100);
    expect(issuesOf({ q: "\u0958".repeat(51) })).toEqual([
      { field: "q", code: "TOO_LONG" },
    ]);
  });

  it("refuses a search past the bound before any control character is considered only when it has none", () => {
    expect(issuesOf({ q: `${"a".repeat(101)}\n` })).toEqual([
      { field: "q", code: "FORBIDDEN_CHARACTER" },
    ]);
  });

  it("trims no-break and ideographic whitespace before it measures", () => {
    expect(queryOf({ q: `\u00A0\u3000${"a".repeat(100)}\u3000` }).search).toBe(
      "a".repeat(100),
    );
  });

  it("refuses any search at the bound that is a lone surrogate half, never repairing it", () => {
    expect(issuesOf({ q: `${"a".repeat(99)}\uD83C` })).toEqual([
      { field: "q", code: "FORBIDDEN_CHARACTER" },
    ]);
  });

  const patternAlphabet = fc.constantFrom(..."%_\\'\";-=() ab\u00E9".split(""));

  propertyTest.prop(
    [fc.array(patternAlphabet, { maxLength: STAFF_KITCHEN_SEARCH_MAX_LENGTH })],
    {
      numRuns: 2000,
    },
  )(
    "hands SQL pattern characters and quotes to the store byte for byte, trimmed and nothing else",
    (characters) => {
      const typed = characters.join("");
      const expected = typed.trim();

      expect(queryOf({ q: typed }).search).toBe(
        expected === "" ? null : expected,
      );
    },
  );
});

describe("a request that is hostile", () => {
  it("answers any value at all without throwing, with the stated shape", () => {
    fc.assert(
      fc.property(
        fc.anything({ withNullPrototype: true, withBigInt: true }),
        (raw) => {
          const reading = readStaffKitchenQuery(raw);

          if (reading.ok) {
            expect(Object.keys(reading.query).sort()).toEqual(QUERY_MEMBERS);
            return;
          }
          expect(reading.issues.length).toBeGreaterThanOrEqual(1);
          for (const issue of reading.issues) {
            expect(Object.keys(issue).sort()).toEqual(["code", "field"]);
            expect(FIELDS).toContain(issue.field);
            expect(CODES).toContain(issue.code);
          }
        },
      ),
      { numRuns: 3000 },
    );
  });

  it("reports a field at most once", () => {
    const issues = issuesOf({
      segment: "x",
      status: "y",
      q: 4,
      page: "0",
    });

    const fields = issues.map((issue) => issue.field);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("refuses an object whose prototype is another object, so inherited members are never in play", () => {
    const foreign = Object.create(Object.create(null) as object) as unknown;

    expect(issuesOf(foreign)).toEqual([
      { field: "query", code: "NOT_AN_OBJECT" },
    ]);
  });
});

describe("nothing a request can reach is shared with the next request", () => {
  // DEFECT (production): STATUS_OUTSIDE_SENT_ISSUE in src/staff/staff-kitchen-query.ts is one module-level,
  // unfrozen object that every refusal returns. A caller that edits an issue it was handed (to translate
  // the code into words, say) rewrites the answer of every later request in the same server process.
  it("returns an issue that a caller can edit without changing a later reading", () => {
    const [firstIssue] = issuesOf({ segment: "all", status: "new" });
    if (firstIssue === undefined) throw new Error("expected an issue");
    Reflect.set(firstIssue, "code", "EDITED_BY_THE_FIRST_CALLER");

    expect(issuesOf({ segment: "all", status: "new" })).toEqual([
      { field: "status", code: "STATUS_NEEDS_SENT_SEGMENT" },
    ]);
  });
});
