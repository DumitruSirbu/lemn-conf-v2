import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inspect } from "node:util";

import { fc } from "@fast-check/vitest";
import {
  STAFF_KITCHEN_PAGE_SIZE,
  STAFF_KITCHEN_SEARCH_MAX_LENGTH,
  isUnstorableText,
  readStaffKitchenQuery,
  staffKitchenOffsetOf,
} from "@lemnaria/configurator-domain";
import type { StaffKitchenQuery } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NeonStaffKitchenReader } from "../src/neon-staff-kitchen-reader.js";
import {
  StaffKitchenReaderError,
  foldRomanianSearchText,
  likePatternContaining,
} from "../src/staff-kitchen-reader.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  failQueryWith,
  queryDriver,
  resetQueryDriver,
} from "./support/mocked-neon-query-driver.js";
import type { SentQuery } from "./support/mocked-neon-query-driver.js";
import { rejectionOf } from "./support/rejection-of.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * Adversarial QA of the staff kitchen reader, with no database: what the reader's statements may name, whatever the query, and what
 * the reader does with a driver or a reply it cannot trust. It adds to `neon-staff-kitchen-reader.statements.test.ts`
 * what that file does not hold: **every** table and column reference of the three statements (the developer's file
 * pins the columns of five aliases; a column named without an alias, a table joined in, or a column of `designs`
 * added would pass it), the grants those references need (read from the migration headers and the ADR that carry them,
 * so each is doc-quoted and a header that changes turns this file red), text that is the same for every query, and the
 * failures a hostile driver can raise.
 *
 * **What this cannot show.** The test database holds no grant for `app_designs` on any table (measured: the role holds
 * no column privilege anywhere there), so no suite on it can prove the reader works under the application role. The
 * grant dependence is checked against the headers' wording only.
 */
const DESIGN_ID = "D".repeat(21);
const NOTHING_FOUND = [{ total: 0, id: null }];
const LAST_COUNTABLE_PAGE = Math.floor(
  Number.MAX_SAFE_INTEGER / STAFF_KITCHEN_PAGE_SIZE,
);
const NUL = String.fromCharCode(0);
const LONE_HIGH_SURROGATE = String.fromCharCode(0xd800);
const LONE_LOW_SURROGATE = String.fromCharCode(0xdc00);
const COMBINING_COMMA_BELOW = String.fromCodePoint(0x326);
const S_COMMA_BELOW_LOWER = String.fromCodePoint(0x219);
const E_ACUTE = String.fromCodePoint(0xe9);
const REPO_ROOT = join(import.meta.dirname, "../../..");
const MIGRATIONS = join(import.meta.dirname, "../src/migrations");

function newReader(): NeonStaffKitchenReader {
  return new NeonStaffKitchenReader(WELL_FORMED_UNREACHABLE_VALUE);
}

function aQuery(overrides: Partial<StaffKitchenQuery> = {}): StaffKitchenQuery {
  return { segment: "sent", status: null, search: null, page: 1, ...overrides };
}

function aKitchenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DESIGN_ID,
    name: null,
    schema_version: 5,
    document: {},
    is_sent: true,
    is_hidden: false,
    sent_ms: "1790000000000",
    updated_ms: "1790000000000",
    client_id: null,
    client_email: null,
    client_name: null,
    client_phone: null,
    request_reference: null,
    request_ms: null,
    sent_schema_version: null,
    sent_document: null,
    stored_status: null,
    changed_by_id: null,
    changed_ms: null,
    changed_by_email: null,
    changed_by_name: null,
    ...overrides,
  };
}

function aListedRow(overrides: Record<string, unknown> = {}) {
  return {
    total: 1,
    id: DESIGN_ID,
    name: null,
    is_sent: true,
    is_hidden: false,
    sent_ms: "1790000000000",
    updated_ms: "1790000000000",
    client_id: null,
    client_email: null,
    client_name: null,
    client_phone: null,
    stored_status: null,
    ...overrides,
  };
}

async function failureOf(
  call: () => Promise<unknown>,
): Promise<StaffKitchenReaderError> {
  const failure = await rejectionOf(call());
  expect(failure).toBeInstanceOf(StaffKitchenReaderError);
  return failure as StaffKitchenReaderError;
}

function migrationText(file: string): string {
  return readFileSync(join(MIGRATIONS, file), "utf8");
}

/** A comment header with its `-- ` prefixes and line breaks folded away, so a wrapped sentence reads as one. */
function foldedHeader(text: string): string {
  return text.replace(/^--\s?/gm, "").replace(/\s+/g, " ");
}

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

// ---------------------------------------------------------------------------------------------------------------------
// Every reference the statements make
// ---------------------------------------------------------------------------------------------------------------------

/** The three statements the reader has, as they are sent: the page, the kitchen, its notes. */
async function theThreeStatements(): Promise<{
  readonly list: string;
  readonly kitchen: string;
  readonly notes: string;
}> {
  resetQueryDriver();
  answerQueryWith(NOTHING_FOUND);
  answerQueryWith([aKitchenRow()]);
  answerQueryWith([]);
  await newReader().listPage(aQuery({ search: "ana" }));
  await newReader().readOne(DESIGN_ID);
  const [list, kitchen, notes] = queryDriver.statements.map(analysedText);
  if (list === undefined || kitchen === undefined || notes === undefined) {
    throw new Error("the reader did not send its three statements");
  }
  return { list, kitchen, notes };
}

function analysedText(statement: SentQuery): string {
  return statement.text.replace(/\s+/g, " ").trim().toLowerCase();
}

const TABLES_THE_READER_MAY_READ = new Set([
  "designs",
  "accounts",
  "design_request_states",
  "contact_submissions",
  "contact_submission_views",
  "design_notes",
]);
/** A name the statements define themselves: the common table expression. */
const OWN_RELATIONS = new Set(["matching"]);
const NOT_AN_ALIAS = new Set([
  "where",
  "on",
  "left",
  "join",
  "order",
  "group",
  "limit",
  "offset",
  "as",
  "lateral",
]);

interface FromItem {
  readonly relation: string;
  readonly alias: string;
}

/** Every `from x a` and `join x a` target, skipping `extract(... from m.col)` and subqueries. */
function fromItemsOf(text: string): FromItem[] {
  const pattern = /\b(?:from|join)\s+([a-z_]+)(?![a-z_.(])(?:\s+([a-z_]+))?/g;
  return [...text.matchAll(pattern)]
    .filter(([, relation]) => relation !== "lateral")
    .map(([, relation, alias]) => ({
      relation: relation ?? "",
      alias:
        alias === undefined || NOT_AN_ALIAS.has(alias)
          ? (relation ?? "")
          : alias,
    }));
}

function withoutStringLiterals(text: string): string {
  return text.replace(/'(?:[^']|'')*'/g, "''");
}

function qualifiedReferencesOf(
  text: string,
): { alias: string; column: string }[] {
  return [...text.matchAll(/\b([a-z_]+)\.([a-z_]+|\*)/g)].map(
    ([, alias, column]) => ({ alias: alias ?? "", column: column ?? "" }),
  );
}

/** Every column the statements name, by relation: the table behind each alias. */
function columnsByRelation(text: string): Map<string, Set<string>> {
  const relationOf = new Map(
    fromItemsOf(text).map(({ relation, alias }) => [alias, relation]),
  );
  const found = new Map<string, Set<string>>();
  for (const { alias, column } of qualifiedReferencesOf(text)) {
    const relation = relationOf.get(alias);
    if (relation === undefined) continue;
    const columns = found.get(relation) ?? new Set<string>();
    columns.add(column);
    found.set(relation, columns);
  }
  return found;
}

/** What the reader is meant to name, by table: the whole of its reading, for a table with a table-wide grant. */
const INTENDED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  designs: [
    "id",
    "name",
    "schema_version",
    "document",
    "sent_at",
    "updated_at",
    "hidden_by_client_at",
    "deleted_by_client_at",
    "account_id",
  ],
  accounts: ["id", "email", "email_normal_form", "name", "phone"],
  design_request_states: [
    "design_id",
    "status",
    "changed_by_account_id",
    "changed_at",
  ],
  contact_submissions: [
    "reference",
    "client_request_id",
    "design_id",
    "created_at",
  ],
  contact_submission_views: [
    "client_request_id",
    "schema_version",
    "design_document",
    "revoked_at",
    "created_at",
    "token_hash",
  ],
  design_notes: ["id", "design_id", "author_account_id", "body", "created_at"],
};

/** The one place `token_hash` may be named: breaking a tie between two copies. It is never selected. */
const ORDER_BY_THE_VIEW_TOKEN_HASH_TIE_BREAK =
  /order by csv\.created_at desc, csv\.token_hash desc/g;

/** Columns that must never be named by a statement of this reader, whatever alias they sit behind. */
const COLUMNS_THE_READER_NEVER_NAMES = [
  "password_hash",
  "address",
  "role",
  "visitor_hash",
  "write_token_hash",
  "token_hash",
  "phone_normal_form",
  "payload_digest",
  "locality",
  "channel",
  "intent",
  "consent_text_version",
  "priced",
  "design_revision",
  "notified_at",
  "revision",
  "email_verified_at",
  "password_changed_at",
  "privacy_notice_version",
];

describe("the tables and columns the three statements name", () => {
  it("reads six tables and its own expression, and no other relation, in any statement", async () => {
    const statements = Object.values(await theThreeStatements());

    const relations = new Set(
      statements.flatMap((text) =>
        fromItemsOf(withoutStringLiterals(text)).map(
          ({ relation }) => relation,
        ),
      ),
    );

    expect([...relations].sort()).toEqual(
      [...TABLES_THE_READER_MAY_READ, ...OWN_RELATIONS].sort(),
    );
  });

  it("names, of each table, only the columns it is meant to read", async () => {
    const statements = Object.values(await theThreeStatements());
    const named = new Map<string, Set<string>>();

    for (const text of statements) {
      for (const [relation, columns] of columnsByRelation(
        withoutStringLiterals(text),
      )) {
        const merged = named.get(relation) ?? new Set<string>();
        for (const column of columns) merged.add(column);
        named.set(relation, merged);
      }
    }

    for (const table of TABLES_THE_READER_MAY_READ) {
      const intended = INTENDED_COLUMNS[table] ?? [];
      const actual = [...(named.get(table) ?? [])];
      expect(
        actual.filter((column) => !intended.includes(column)),
        `${table}: columns outside the intended reading`,
      ).toEqual([]);
      expect(actual.length, `${table}: is read`).toBeGreaterThan(0);
    }
  });

  it("names no column of a credential, an address, a token or a request's personal data, qualified or not, in any statement", async () => {
    const statements = await theThreeStatements();

    for (const [which, text] of Object.entries(statements)) {
      const tokens = new Set(
        withoutStringLiterals(text)
          .replace(ORDER_BY_THE_VIEW_TOKEN_HASH_TIE_BREAK, " ")
          .match(/[a-z_][a-z0-9_]*/g) ?? [],
      );
      for (const forbidden of COLUMNS_THE_READER_NEVER_NAMES) {
        expect(tokens.has(forbidden), `${which}: ${forbidden}`).toBe(false);
      }
    }
  });

  it("names every column behind an alias, and every other word is a keyword, a function, a type or a name the statement gives", async () => {
    const statements = await theThreeStatements();

    for (const [which, text] of Object.entries(statements)) {
      const withoutQualified = withoutStringLiterals(text)
        .replace(/\b[a-z_]+\.[a-z_]+/g, " ")
        .replace(/\$\d+/g, " ");
      const words = new Set(withoutQualified.match(/[a-z_][a-z0-9_]*/g) ?? []);
      const unexplained = [...words].filter(
        (word) => !SQL_WORDS_THE_STATEMENTS_USE.has(word),
      );

      expect(unexplained, which).toEqual([]);
    }
  });

  it("passes every value as a parameter: no search, status, segment, page or id appears in a statement's text", async () => {
    resetQueryDriver();
    answerQueryWith(NOTHING_FOUND);
    answerQueryWith([]);
    const probe = "zq9x7";

    await newReader().listPage(
      aQuery({ segment: "sent", status: "offer-sent", search: probe, page: 7 }),
    );
    await newReader().readOne(`${probe}${DESIGN_ID}`.slice(0, 21));

    for (const statement of queryDriver.statements) {
      expect(statement.text).not.toContain(probe);
      expect(statement.text).not.toContain("offer-sent");
      expect(statement.text).not.toMatch(/\b120\b|\b7\b/);
    }
  });
});

/** Words other than a column behind an alias. Anything else in a statement is a column named bare, and fails. */
const SQL_WORDS_THE_STATEMENTS_USE = new Set([
  "translate",
  "author_id",
  "least",
  "greatest",
  "kitchen",
  "with",
  "as",
  "select",
  "from",
  "left",
  "join",
  "on",
  "where",
  "and",
  "or",
  "is",
  "not",
  "null",
  "case",
  "when",
  "then",
  "else",
  "end",
  "order",
  "by",
  "desc",
  "nulls",
  "last",
  "limit",
  "offset",
  "lateral",
  "true",
  "ilike",
  "escape",
  "coalesce",
  "count",
  "floor",
  "extract",
  "epoch",
  "text",
  "int",
  "bigint",
  "matching",
  "total",
  "is_sent",
  "is_hidden",
  "sent_ms",
  "updated_ms",
  "sorted_at",
  "client_id",
  "client_email",
  "client_name",
  "client_phone",
  "stored_status",
  "request_reference",
  "request_ms",
  "created_ms",
  "sent_schema_version",
  "sent_document",
  "changed_by_id",
  "changed_ms",
  "changed_by_email",
  "changed_by_name",
  "author_email",
  "author_name",
  "designs",
  "accounts",
  "design_request_states",
  "contact_submissions",
  "contact_submission_views",
  "design_notes",
  "request",
  "sent_copy",
  "changer",
  "author",
  "created_at",
  "reference",
  "client_request_id",
  "schema_version",
  "design_document",
  "revoked_at",
  "id",
  "body",
  "author_account_id",
  "t",
  "p",
  "m",
  "a",
  "d",
  "s",
  "n",
  "cs",
  "csv",
]);

// ---------------------------------------------------------------------------------------------------------------------
// The grants those references need
// ---------------------------------------------------------------------------------------------------------------------

describe("the grants the references need, as the headers and the ADR word them (doc-quoted)", () => {
  const TABLE_WIDE_SELECT_SOURCES: readonly (readonly [
    table: string,
    file: string,
    sentence: string,
  ])[] = [
    [
      "accounts",
      "0012_create_accounts.sql",
      "GRANT SELECT ON TABLE public.accounts TO app_designs;",
    ],
    [
      "design_notes",
      "0021_create_design_notes.sql",
      "GRANT SELECT ON TABLE public.design_notes TO app_designs;",
    ],
    [
      "design_request_states",
      "0022_create_design_request_states.sql",
      "GRANT SELECT ON TABLE public.design_request_states TO app_designs;",
    ],
    [
      "contact_submission_views",
      "0010_create_contact_submission_views.sql",
      "The application role needs `INSERT` and `SELECT` on this table",
    ],
  ];

  it.each(TABLE_WIDE_SELECT_SOURCES)(
    "has a table-wide SELECT on %s in the header of %s, which covers every column of it the reader names",
    (table, file, sentence) => {
      const header = foldedHeader(migrationText(file));

      expect(header).toContain(sentence);
      expect(TABLES_THE_READER_MAY_READ.has(table)).toBe(true);
    },
  );

  it("has a table-wide SELECT on designs in ADR 0008, which covers every column of it the reader names", () => {
    const adr = readFileSync(
      join(REPO_ROOT, "docs/decisions/0008-least-privilege-database-role.md"),
      "utf8",
    );

    expect(adr).toContain(
      "GRANT SELECT, INSERT, UPDATE ON TABLE public.designs TO app_designs;",
    );
  });

  it("names, of contact_submissions, only columns among the seven the header of 0008 lets the application role select", async () => {
    const header = foldedHeader(
      migrationText("0008_create_contact_submissions.sql"),
    );
    const firstGroup =
      /The seven readable columns are the first group below: ([^.]*)\./.exec(
        header,
      )?.[1] ?? "";
    const granted = [...firstGroup.matchAll(/`(\w+)`/g)].map(
      ([, column]) => column ?? "",
    );
    const { kitchen } = await theThreeStatements();

    const named = columnsByRelation(withoutStringLiterals(kitchen)).get(
      "contact_submissions",
    );

    expect(granted).toHaveLength(7);
    expect(
      [...(named ?? [])].filter((column) => !granted.includes(column)),
    ).toEqual([]);
    expect(named?.size).toBeGreaterThan(0);
  });

  it("reads contact_submissions in no statement but the kitchen's", async () => {
    const { list, notes } = await theThreeStatements();

    expect(list).not.toContain("contact_submissions");
    expect(notes).not.toContain("contact_submissions");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The text does not depend on the query
// ---------------------------------------------------------------------------------------------------------------------

describe("a list statement that is the same text for every query", () => {
  const searchArbitrary = fc
    .string({ unit: "binary", minLength: 1, maxLength: 100 })
    .filter(
      (search) =>
        !isUnstorableText(search) &&
        Array.from(search).length <= STAFF_KITCHEN_SEARCH_MAX_LENGTH,
    );
  const queryArbitrary = fc.record({
    segment: fc.constantFrom("sent", "drafts", "all"),
    search: fc.option(searchArbitrary, { nil: null }),
    page: fc.oneof(
      fc.integer({ min: 1, max: 50 }),
      fc.constantFrom(LAST_COUNTABLE_PAGE),
    ),
    status: fc.option(
      fc.constantFrom("new", "contacted", "offer-sent", "closed"),
      {
        nil: null,
      },
    ),
  });

  it("sends one text, whatever the segment, status, search and page, with the search only as an escaped value", async () => {
    resetQueryDriver();
    answerQueryWith(NOTHING_FOUND);
    await newReader().listPage(aQuery());
    const baseline = queryDriver.statements[0]?.text ?? "";

    await fc.assert(
      fc.asyncProperty(queryArbitrary, async (raw) => {
        const query: StaffKitchenQuery = {
          ...raw,
          status: raw.segment === "sent" ? raw.status : null,
        };
        resetQueryDriver();
        answerQueryWith(NOTHING_FOUND);

        await newReader().listPage(query);

        const [statement, ...others] = queryDriver.statements;
        expect(others).toEqual([]);
        expect(statement?.text).toBe(baseline);
        expect(statement?.values).toHaveLength(12);
        expect(statement?.values.at(-1)).toBe(staffKitchenOffsetOf(query.page));
        if (query.search !== null) {
          expect(statement?.values.slice(5, 7)).toEqual(
            Array<string>(2).fill(likePatternContaining(query.search)),
          );
          expect(statement?.values[9]).toBe(
            likePatternContaining(foldRomanianSearchText(query.search)),
          );
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Queries and ids the reader refuses before any statement
// ---------------------------------------------------------------------------------------------------------------------

describe("what is refused before any statement", () => {
  it.each([
    ["a page of NaN", aQuery({ page: Number.NaN })],
    ["a page of infinity", aQuery({ page: Number.POSITIVE_INFINITY })],
    ["a negative page", aQuery({ page: -1 })],
    ["a page that is text", aQuery({ page: "2" as unknown as number })],
    ["a page that is null", aQuery({ page: null as unknown as number })],
    [
      "the page after the last countable one",
      aQuery({ page: LAST_COUNTABLE_PAGE + 1 }),
    ],
    ["a segment in capitals", aQuery({ segment: "SENT" as never })],
    ["a status in capitals", aQuery({ status: "NEW" as never })],
    ["a status that is a number", aQuery({ status: 1 as never })],
    ["a search that is a number", aQuery({ search: 1 as never })],
    ["a search that is undefined", aQuery({ search: undefined as never })],
    [
      "a search holding a lone high surrogate",
      aQuery({ search: `a${LONE_HIGH_SURROGATE}` }),
    ],
    [
      "a search holding a lone low surrogate",
      aQuery({ search: `${LONE_LOW_SURROGATE}a` }),
    ],
    ["a search of NUL alone", aQuery({ search: NUL })],
    [
      "a search of 51 decomposed letters (102 code points before composition)",
      aQuery({ search: `s${COMBINING_COMMA_BELOW}`.repeat(51) }),
    ],
  ])("refuses %s", async (_label, query) => {
    const failure = await failureOf(() => newReader().listPage(query));

    expect(failure.failure).toBe("invalid-query");
    expect(queryDriver.statements).toHaveLength(0);
  });

  it("accepts the last countable page and sends its exact offset as a number a bigint can hold", async () => {
    answerQueryWith(NOTHING_FOUND);

    await newReader().listPage(aQuery({ page: LAST_COUNTABLE_PAGE }));

    const offset = queryDriver.statements[0]?.values.at(-1);
    expect(offset).toBe(9_007_199_254_740_960);
    expect(Number.isSafeInteger(offset)).toBe(true);
  });

  it.each([
    ["an id with a trailing line break", "abc\n"],
    ["an id with a non-ASCII letter", `ab${E_ACUTE}`],
    ["an id with a NUL", `ab${NUL}c`],
    ["an id of 65 characters", "x".repeat(65)],
    ["an id of nothing", ""],
    ["an id that is a number", 12345 as unknown as string],
    ["an id that is null", null as unknown as string],
    ["an id that is undefined", undefined as unknown as string],
    ["an id that is a list", ["abc"] as unknown as string],
    [
      "an id that is an object with a toString",
      { toString: () => "abc" } as unknown as string,
    ],
  ])("answers %s as none with no statement", async (_label, id) => {
    const reading = await newReader().readOne(id);

    expect(reading).toStrictEqual({ kind: "none" });
    expect(queryDriver.statements).toHaveLength(0);
  });

  it("sends an id of 64 characters, and of one, as the one value of the kitchen statement", async () => {
    for (const id of ["x".repeat(64), "-", "_"]) {
      resetQueryDriver();
      answerQueryWith([]);

      await newReader().readOne(id);

      expect(queryDriver.statements.map(({ values }) => values)).toEqual([
        [id],
      ]);
    }
  });
});

describe("a search typed in decomposed form reaches the statement composed", () => {
  it("accepts 100 composed letters typed as 200 code points, and sends the composed pattern", async () => {
    const reading = readStaffKitchenQuery({
      q: `s${COMBINING_COMMA_BELOW}`.repeat(100),
    });
    if (!reading.ok) throw new Error("the query was refused");
    answerQueryWith(NOTHING_FOUND);

    await newReader().listPage(reading.query);

    expect(reading.query.search).toBe(S_COMMA_BELOW_LOWER.repeat(100));
    expect(queryDriver.statements[0]?.values[5]).toBe(
      `%${S_COMMA_BELOW_LOWER.repeat(100)}%`,
    );
  });

  it("refuses 101 composed letters at the domain, and the reader would also refuse the same text uncomposed", async () => {
    const decomposed = `s${COMBINING_COMMA_BELOW}`.repeat(101);

    const reading = readStaffKitchenQuery({ q: decomposed });
    const failure = await failureOf(() =>
      newReader().listPage(aQuery({ search: decomposed })),
    );

    expect(reading.ok).toBe(false);
    expect(failure.failure).toBe("invalid-query");
    expect(queryDriver.statements).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Nothing the database or the driver says leaves, and nothing but the four fields of the client is copied
// ---------------------------------------------------------------------------------------------------------------------

const LEAK = "LEAK-MARKER-9f2c";
/** Every key the port's results may carry (array positions aside); a copied column would add one. */
const KEYS_OF_A_READING = new Set([
  "0",
  "1",
  "at",
  "author",
  "asSent",
  "by",
  "change",
  "client",
  "createdAt",
  "design",
  "email",
  "id",
  "isHidden",
  "isSent",
  "kind",
  "kitchen",
  "kitchens",
  "name",
  "notes",
  "notesTruncated",
  "page",
  "pageSize",
  "phone",
  "reference",
  "request",
  "requestStatus",
  "sentAt",
  "status",
  "text",
  "total",
  "updatedAt",
  "value",
]);

function keysDeep(value: unknown, into = new Set<string>()): Set<string> {
  if (value instanceof Date || value === null || typeof value !== "object") {
    return into;
  }
  for (const [key, child] of Object.entries(value)) {
    into.add(key);
    keysDeep(child, into);
  }
  return into;
}

describe("a row that holds more than the statement names", () => {
  it("copies the four fields of the client and no other column the row carries, on the list and on one kitchen", async () => {
    const extras = {
      client_address: LEAK,
      client_password_hash: LEAK,
      client_role: LEAK,
      client_email_normal_form: LEAK,
      cs_name: LEAK,
      cs_phone: LEAK,
      request_name: LEAK,
      request_locality: LEAK,
      sent_token_hash: LEAK,
      visitor_hash: LEAK,
      write_token_hash: LEAK,
    };
    const client = {
      client_id: "C".repeat(21),
      client_email: "Ana@Example.invalid",
      client_name: "Ana",
      client_phone: "+37360111000",
    };
    answerQueryWith([aListedRow({ ...client, ...extras })]);
    answerQueryWith([
      aKitchenRow({
        ...client,
        ...extras,
        request_reference: "REF-1",
        request_ms: "1790000000000",
      }),
    ]);
    answerQueryWith([]);

    const page = await newReader().listPage(aQuery());
    const reading = await newReader().readOne(DESIGN_ID);

    expect(JSON.stringify([page, reading])).not.toContain(LEAK);
    expect(page.kitchens[0]?.client).toStrictEqual({
      id: client.client_id,
      email: client.client_email,
      name: client.client_name,
      phone: client.client_phone,
    });
    const unexpectedKeys = [...keysDeep([page, reading])].filter(
      (key) => !KEYS_OF_A_READING.has(key),
    );
    expect(unexpectedKeys).toEqual([]);
  });
});

describe("a driver or a reply that cannot be trusted", () => {
  const ALLOWED_CAUSE_KEYS = ["code", "name"];

  function throwingGetters(): unknown {
    const hostile = new Error(`${LEAK} secret in the message`);
    for (const key of ["code", "name"]) {
      Object.defineProperty(hostile, key, {
        get() {
          throw new Error(`${LEAK} thrown by a getter`);
        },
      });
    }
    return hostile;
  }

  it.each([
    ["null", null, "database"],
    ["undefined", undefined, "database"],
    ["a string that looks like a state", "42501", "database"],
    [
      "an error whose code is a number",
      Object.assign(new Error(LEAK), { code: 42501 }),
      "database",
    ],
    [
      "an error whose code is in lower case",
      Object.assign(new Error(LEAK), { code: "42p01" }),
      "database",
    ],
    [
      "an error whose code has text after the state",
      Object.assign(new Error(LEAK), { code: "42501 extra" }),
      "database",
    ],
    [
      "an error whose name and code are getters that throw",
      throwingGetters(),
      "database",
    ],
    [
      "an error whose name is long and not an identifier",
      Object.assign(new Error(LEAK), {
        name: `x ${LEAK}`.repeat(40),
        code: "XX000",
      }),
      "database",
    ],
    [
      "an error that is missing a table",
      Object.assign(new Error(LEAK), { code: "42P01" }),
      "unavailable",
    ],
    [
      "an error that is a missing grant",
      Object.assign(new Error(LEAK), { code: "42501" }),
      "unavailable",
    ],
  ])(
    "reads %s on the list and on one kitchen as a reader error with a fixed message and a cause of a name and a state",
    async (_label, thrown, kind) => {
      for (const call of [
        () => newReader().listPage(aQuery({ search: LEAK })),
        () => newReader().readOne(DESIGN_ID),
      ]) {
        resetQueryDriver();
        failQueryWith(thrown);

        const failure = await failureOf(call);

        expect(failure.failure).toBe(kind);
        expect(
          Object.keys((failure.cause ?? {}) as object).filter(
            (key) => !ALLOWED_CAUSE_KEYS.includes(key),
          ),
        ).toEqual([]);
        expect(Object.getPrototypeOf(failure.cause)).toBe(Object.prototype);
        expect(inspect(failure, { depth: 8 })).not.toContain(LEAK);
        expect(failure.message).toMatch(
          /^The staff kitchen reader could not (list staff kitchens|read a staff kitchen): [^:]*\.$/,
        );
      }
    },
  );

  it.each([
    [
      "a row whose field throws when read",
      [
        {
          get total(): number {
            throw new Error(`${LEAK} getter`);
          },
        },
      ],
    ],
    ["a reply that is null", null],
    ["a reply that is an object and not a list", { total: 0, id: null }],
    ["a reply that is text", LEAK],
    ["a list holding a list", [[0, null]]],
  ])(
    "reads %s on the list as an unexpected answer with no cause and no word of the reply",
    async (_label, reply) => {
      answerQueryWith(reply);

      const failure = await failureOf(() => newReader().listPage(aQuery()));

      expect(failure.failure).toBe("unexpected-answer");
      expect(failure.cause).toBeUndefined();
      expect(inspect(failure, { depth: 8 })).not.toContain(LEAK);
    },
  );
});
