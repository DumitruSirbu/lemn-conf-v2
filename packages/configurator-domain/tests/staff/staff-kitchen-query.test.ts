import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { REQUEST_STATUSES } from "../../src/staff/request-status.js";
import {
  DEFAULT_STAFF_KITCHEN_SEGMENT,
  STAFF_KITCHEN_PAGE_SIZE,
  STAFF_KITCHEN_SEARCH_MAX_LENGTH,
  STAFF_KITCHEN_SEGMENTS,
  readStaffKitchenQuery,
  staffKitchenOffsetOf,
  type StaffKitchenQuery,
  type StaffKitchenQueryIssue,
} from "../../src/staff/staff-kitchen-query.js";

const ASTRAL_CHARACTER = "\u{1F373}";
const LAST_PAGE_WHOSE_ROWS_ARE_COUNTABLE = "450359962737049";
const FIRST_PAGE_PAST_IT = "450359962737050";

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

describe("readStaffKitchenQuery: what staff ask the kitchens list for", () => {
  it("pins the segments, the page size and the search bound", () => {
    expect(STAFF_KITCHEN_SEGMENTS).toEqual(["sent", "drafts", "all"]);
    expect(STAFF_KITCHEN_PAGE_SIZE).toBe(20);
    expect(STAFF_KITCHEN_SEARCH_MAX_LENGTH).toBe(100);
  });

  it("cannot have its segment list edited by a caller that imports it", () => {
    expect(Object.isFrozen(STAFF_KITCHEN_SEGMENTS)).toBe(true);
  });

  it("reads no members as the sent kitchens, unfiltered, first page", () => {
    expect(queryOf({})).toEqual({
      segment: "sent",
      status: null,
      search: null,
      page: 1,
    });
    expect(DEFAULT_STAFF_KITCHEN_SEGMENT).toBe("sent");
  });

  it("reads members that are present but empty as absent", () => {
    expect(queryOf({ segment: "", status: "", q: "", page: "" })).toEqual(
      queryOf({}),
    );
  });

  it("reads a plain object with no prototype", () => {
    const members = Object.assign(Object.create(null) as object, {
      segment: "all",
      page: "3",
    });

    expect(queryOf(members)).toMatchObject({ segment: "all", page: 3 });
  });

  it.each(["segment", "status", "q", "page"])(
    "does not read %s off a polluted Object.prototype",
    (member) => {
      Reflect.defineProperty(Object.prototype, member, {
        value: "Polluted\n",
        configurable: true,
      });
      try {
        expect(queryOf({})).toEqual(queryOf(Object.create(null)));
      } finally {
        Reflect.deleteProperty(Object.prototype, member);
      }
    },
  );

  it("ignores a member it does not name", () => {
    expect(queryOf({ page: "2", utm_source: "mail", locale: 7 })).toMatchObject(
      { page: 2 },
    );
  });

  describe("a request that is not an object is refused", () => {
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["a string", "segment=all"],
      ["a number", 3],
      ["an array", [["segment", "all"]]],
      ["a class instance", new Map([["segment", "all"]])],
    ])("%s", (_label, raw) => {
      expect(issuesOf(raw)).toEqual([
        { field: "query", code: "NOT_AN_OBJECT" },
      ]);
    });
  });

  describe("segment", () => {
    it.each(STAFF_KITCHEN_SEGMENTS)("accepts %s", (segment) => {
      expect(queryOf({ segment }).segment).toBe(segment);
    });

    it.each([
      ["a different case", "Sent"],
      ["the Romanian word", "Trimise"],
      ["the singular", "draft"],
      ["a padded value", " sent"],
      ["an inherited object member", "constructor"],
    ])("refuses %s as UNKNOWN_VALUE", (_label, segment) => {
      expect(issuesOf({ segment })).toEqual([
        { field: "segment", code: "UNKNOWN_VALUE" },
      ]);
    });

    it.each([
      ["a number", 1],
      ["an array, as a repeated parameter arrives", ["sent", "all"]],
      ["null", null],
    ])("refuses %s as NOT_TEXT", (_label, segment) => {
      expect(issuesOf({ segment })).toEqual([
        { field: "segment", code: "NOT_TEXT" },
      ]);
    });
  });

  describe("status is a filter that only the sent segment has", () => {
    it.each(REQUEST_STATUSES)(
      "accepts %s under the explicit sent segment",
      (status) => {
        expect(queryOf({ segment: "sent", status }).status).toBe(status);
      },
    );

    it.each(REQUEST_STATUSES)(
      "accepts %s with no segment, which is sent",
      (status) => {
        expect(queryOf({ status })).toMatchObject({ segment: "sent", status });
      },
    );

    it.each(["drafts", "all"])(
      "refuses a status under the %s segment as STATUS_NEEDS_SENT_SEGMENT",
      (segment) => {
        expect(issuesOf({ segment, status: "new" })).toEqual([
          { field: "status", code: "STATUS_NEEDS_SENT_SEGMENT" },
        ]);
      },
    );

    it.each(["drafts", "all"])(
      "accepts an empty status under the %s segment",
      (segment) => {
        expect(queryOf({ segment, status: "" })).toMatchObject({
          segment,
          status: null,
        });
      },
    );

    it.each([
      ["a status outside the list", "won"],
      ["a different case", "New"],
      ["a display word, not a code", "Noua"],
      ["an inherited object member", "toString"],
    ])("refuses %s as UNKNOWN_VALUE", (_label, status) => {
      expect(issuesOf({ status })).toEqual([
        { field: "status", code: "UNKNOWN_VALUE" },
      ]);
    });

    it("refuses an unknown status under drafts once, as UNKNOWN_VALUE", () => {
      expect(issuesOf({ segment: "drafts", status: "won" })).toEqual([
        { field: "status", code: "UNKNOWN_VALUE" },
      ]);
    });

    it("refuses a status that is not text as NOT_TEXT", () => {
      expect(issuesOf({ status: ["new", "closed"] })).toEqual([
        { field: "status", code: "NOT_TEXT" },
      ]);
    });

    it("does not report the status as out of place when the segment itself is wrong", () => {
      expect(issuesOf({ segment: "everything", status: "new" })).toEqual([
        { field: "segment", code: "UNKNOWN_VALUE" },
      ]);
    });
  });

  describe("search", () => {
    it("trims the text and keeps what is inside", () => {
      expect(queryOf({ q: "  Ana  Pop " }).search).toBe("Ana  Pop");
    });

    it.each([
      ["the empty string", ""],
      ["spaces", "   "],
      ["a zero-width space", "\u200B"],
      ["undefined", undefined],
    ])("reads %s as no search", (_label, q) => {
      expect(queryOf({ q }).search).toBeNull();
    });

    it("accepts 100 characters and refuses 101", () => {
      expect(queryOf({ q: "a".repeat(100) }).search).toBe("a".repeat(100));
      expect(issuesOf({ q: "a".repeat(101) })).toEqual([
        { field: "q", code: "TOO_LONG" },
      ]);
    });

    it("counts an astral character once, so 100 of them fit and 101 do not", () => {
      expect(queryOf({ q: ASTRAL_CHARACTER.repeat(100) }).search).toBe(
        ASTRAL_CHARACTER.repeat(100),
      );
      expect(issuesOf({ q: ASTRAL_CHARACTER.repeat(101) })).toEqual([
        { field: "q", code: "TOO_LONG" },
      ]);
    });

    it("measures after trimming, so 100 characters with spaces around them fit", () => {
      expect(queryOf({ q: ` ${"a".repeat(100)} ` }).search).toBe(
        "a".repeat(100),
      );
    });

    it("passes %, _ and the backslash through unchanged: escaping is the store's", () => {
      expect(queryOf({ q: "100%_\\" }).search).toBe("100%_\\");
      expect(queryOf({ q: "%" }).search).toBe("%");
      expect(queryOf({ q: "_" }).search).toBe("_");
      expect(queryOf({ q: "\\" }).search).toBe("\\");
    });

    it("does not change the case: Postgres folds it, not this", () => {
      expect(queryOf({ q: "Ana@Example.RO" }).search).toBe("Ana@Example.RO");
    });

    it("composes to NFC", () => {
      expect(queryOf({ q: "e\u0301" }).search).toBe("\u00E9");
    });

    it.each([
      ["a line feed", "an\na"],
      ["a tab", "an\ta"],
      ["a NUL", "an\u0000a"],
      ["a lone surrogate", "an\uD800a"],
    ])("refuses %s as FORBIDDEN_CHARACTER", (_label, q) => {
      expect(issuesOf({ q })).toEqual([
        { field: "q", code: "FORBIDDEN_CHARACTER" },
      ]);
    });

    it.each([
      ["a number", 5],
      ["an array", ["a", "b"]],
      ["null", null],
    ])("refuses %s as NOT_TEXT", (_label, q) => {
      expect(issuesOf({ q })).toEqual([{ field: "q", code: "NOT_TEXT" }]);
    });
  });

  describe("page is written as digits, from 1", () => {
    it.each([
      ["1", 1],
      ["2", 2],
      ["10", 10],
      ["20", 20],
      ["143", 143],
      [
        LAST_PAGE_WHOSE_ROWS_ARE_COUNTABLE,
        Number(LAST_PAGE_WHOSE_ROWS_ARE_COUNTABLE),
      ],
    ])("accepts %s", (text, page) => {
      expect(queryOf({ page: text }).page).toBe(page);
    });

    it.each([
      ["zero", "0"],
      ["a negative number", "-1"],
      ["a decimal", "1.5"],
      ["a decimal that equals an integer", "1.0"],
      ["a leading zero", "01"],
      ["a leading plus", "+2"],
      ["a leading space", " 2"],
      ["a trailing space", "2 "],
      ["exponent notation", "1e3"],
      ["hexadecimal", "0x10"],
      ["a digit separator", "1_0"],
      ["a thousands separator", "1,000"],
      ["the word NaN", "NaN"],
      ["the word Infinity", "Infinity"],
      ["an Arabic-Indic digit", "\u0663"],
      ["a fullwidth digit", "\uFF11"],
      ["a trailing line feed", "2\n"],
      ["400 nines, which Number reads as Infinity", "9".repeat(400)],
      ["the first page whose rows cannot be counted", FIRST_PAGE_PAST_IT],
    ])("refuses %s as NOT_A_PAGE_NUMBER", (_label, page) => {
      expect(issuesOf({ page })).toEqual([
        { field: "page", code: "NOT_A_PAGE_NUMBER" },
      ]);
    });

    it.each([
      ["a number", 2],
      ["an array, as a repeated parameter arrives", ["1", "2"]],
      ["null", null],
    ])("refuses %s as NOT_TEXT", (_label, page) => {
      expect(issuesOf({ page })).toEqual([{ field: "page", code: "NOT_TEXT" }]);
    });
  });

  it("reports every wrong field, not only the first", () => {
    expect(
      issuesOf({
        segment: "all",
        status: "new",
        q: "a".repeat(101),
        page: "0",
      }),
    ).toEqual([
      { field: "q", code: "TOO_LONG" },
      { field: "page", code: "NOT_A_PAGE_NUMBER" },
      { field: "status", code: "STATUS_NEEDS_SENT_SEGMENT" },
    ]);
  });

  it("answers with codes and never the text it was given", () => {
    const issues = issuesOf({ q: "secret-search\t", page: "secret-page" });

    expect(JSON.stringify(issues)).not.toContain("secret");
  });

  describe("properties over arbitrary members", () => {
    const anyOtherMember = fc.oneof(
      fc.string({ maxLength: 40 }),
      fc.anything(),
    );
    const anyMembers = fc.record(
      {
        segment: fc.oneof(
          {
            arbitrary: fc.constantFrom(...STAFF_KITCHEN_SEGMENTS, ""),
            weight: 6,
          },
          { arbitrary: anyOtherMember, weight: 1 },
        ),
        status: fc.oneof(
          { arbitrary: fc.constantFrom(...REQUEST_STATUSES, ""), weight: 6 },
          { arbitrary: anyOtherMember, weight: 1 },
        ),
        q: fc.oneof(
          { arbitrary: fc.string({ maxLength: 110 }), weight: 6 },
          { arbitrary: anyOtherMember, weight: 1 },
        ),
        page: fc.oneof(
          { arbitrary: fc.nat().map(String), weight: 6 },
          { arbitrary: anyOtherMember, weight: 1 },
        ),
      },
      { requiredKeys: [] },
    );

    it("accepts only a query whose status sits under sent and whose page is a positive safe integer", () => {
      let acceptedCount = 0;
      fc.assert(
        fc.property(anyMembers, (members) => {
          const reading = readStaffKitchenQuery(members);
          fc.pre(reading.ok);
          acceptedCount += 1;

          expect(STAFF_KITCHEN_SEGMENTS).toContain(reading.query.segment);
          expect(
            reading.query.status === null || reading.query.segment === "sent",
          ).toBe(true);
          expect(Number.isSafeInteger(reading.query.page)).toBe(true);
          expect(reading.query.page).toBeGreaterThanOrEqual(1);
          expect(
            Number.isSafeInteger(staffKitchenOffsetOf(reading.query.page)),
          ).toBe(true);
          expect(reading.query.search).not.toBe("");
        }),
        { numRuns: 2000 },
      );

      expect(acceptedCount).toBeGreaterThan(500);
    });

    it("refuses with at least one issue", () => {
      fc.assert(
        fc.property(anyMembers, (members) => {
          const reading = readStaffKitchenQuery(members);
          fc.pre(!reading.ok);

          expect(reading.issues.length).toBeGreaterThanOrEqual(1);
        }),
      );
    });
  });
});

describe("staffKitchenOffsetOf: the rows before a page", () => {
  it.each([
    [1, 0],
    [2, 20],
    [8, 140],
    [Number(LAST_PAGE_WHOSE_ROWS_ARE_COUNTABLE), 9007199254740960],
  ])("page %i skips %i rows", (page, offset) => {
    expect(staffKitchenOffsetOf(page)).toBe(offset);
  });

  it.each([
    ["zero", 0],
    ["a negative page", -1],
    ["NaN", Number.NaN],
    ["a fraction", 1.5],
    ["infinity", Number.POSITIVE_INFINITY],
    [
      "the largest safe integer, whose rows cannot be counted",
      Number.MAX_SAFE_INTEGER,
    ],
    ["the first page past the countable ones", Number(FIRST_PAGE_PAST_IT)],
  ])(
    "throws a RangeError for %s, so no caller sends a negative or rounded offset",
    (_label, page) => {
      expect(() => staffKitchenOffsetOf(page)).toThrow(RangeError);
    },
  );
});
