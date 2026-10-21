import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  INITIAL_REQUEST_STATUS,
  STAFF_KITCHEN_PAGE_SIZE,
  staffKitchenOffsetOf,
} from "@lemnaria/configurator-domain";
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { StaffKitchenQuery } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NeonStaffKitchenReader } from "../src/neon-staff-kitchen-reader.js";
import {
  NOTES_READ_LIMIT,
  ROMANIAN_CEDILLA_LETTERS,
  ROMANIAN_COMMA_BELOW_LETTERS,
  StaffKitchenReaderError,
} from "../src/staff-kitchen-reader.js";
import type { StaffKitchenReaderFailure } from "../src/staff-kitchen-reader.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  everySentQuery,
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
 * The text of the statements `NeonStaffKitchenReader` sends, read as the driver receives them, with no database. What a
 * statement does with a row is the live file's to show (`neon-staff-kitchen-reader.live.test.ts`, which runs over the
 * owner credential and so cannot see a privilege); this file pins what the live file cannot: that no statement names a
 * column the application role may not select, that none writes, and that the visibility clauses are in the text.
 */
const DESIGN_ID = "D".repeat(21);
const CEDILLA_S = ROMANIAN_CEDILLA_LETTERS.charAt(0);
const CEDILLA_T = ROMANIAN_CEDILLA_LETTERS.charAt(2);
const COMMA_BELOW_S = ROMANIAN_COMMA_BELOW_LETTERS.charAt(0);
const COMMA_BELOW_T = ROMANIAN_COMMA_BELOW_LETTERS.charAt(2);
const OPERATIONS = ["listPage", "readOne"] as const;
const NOTHING_FOUND = [{ total: 0, id: null }];
const READABLE_ACCOUNT_COLUMNS = ["id", "email", "name", "phone"];

function normalised(statement: SentQuery): string {
  return statement.text.replace(/\s+/g, " ").trim().toLowerCase();
}

function newReader(): NeonStaffKitchenReader {
  return new NeonStaffKitchenReader(WELL_FORMED_UNREACHABLE_VALUE);
}

function aQuery(overrides: Partial<StaffKitchenQuery> = {}): StaffKitchenQuery {
  return { segment: "sent", status: null, search: null, page: 1, ...overrides };
}

function loneStatement(): SentQuery {
  const [statement, ...others] = queryDriver.statements;
  if (
    statement === undefined ||
    others.length > 0 ||
    queryDriver.transactions.length > 0
  ) {
    throw new Error("the call did not send exactly one lone statement");
  }
  return statement;
}

async function sentByList(
  query: StaffKitchenQuery,
  rows: unknown = NOTHING_FOUND,
): Promise<SentQuery> {
  resetQueryDriver();
  answerQueryWith(rows);
  await newReader().listPage(query);
  return loneStatement();
}

/** The two statements `readOne` sends for a kitchen that is found: the kitchen's, then its notes. */
async function sentByFoundReadOne(): Promise<{
  readonly kitchen: SentQuery;
  readonly notes: SentQuery;
}> {
  resetQueryDriver();
  answerQueryWith([aKitchenRow()]);
  answerQueryWith([]);
  await newReader().readOne(DESIGN_ID);
  const [kitchen, notes, ...others] = queryDriver.statements;
  if (kitchen === undefined || notes === undefined || others.length > 0) {
    throw new Error("readOne did not send exactly two statements");
  }
  return { kitchen, notes };
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

/** The columns `0008` lets the application role select, read from its header. */
function readableSubmissionColumns(): readonly string[] {
  const migration = readFileSync(
    join(
      import.meta.dirname,
      "../src/migrations/0008_create_contact_submissions.sql",
    ),
    "utf8",
  );
  const group = /first group below:([^.]*)\./s.exec(migration)?.[1] ?? "";
  return [...group.matchAll(/`(\w+)`/g)].map(([, column]) => column ?? "");
}

function columnsReferencedThrough(alias: string, text: string): Set<string> {
  const pattern = new RegExp(`\\b${alias}\\.(\\w+|\\*)`, "g");
  return new Set([...text.matchAll(pattern)].map(([, column]) => column ?? ""));
}

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("the list statement", () => {
  it("is one lone select and not a transaction", async () => {
    await sentByList(aQuery());

    expect(queryDriver.transactions).toHaveLength(0);
    expect(queryDriver.statements).toHaveLength(1);
  });

  it("excludes a kitchen its client deleted and does not exclude one its client hid", async () => {
    const text = normalised(await sentByList(aQuery()));

    expect(text).toContain("where d.deleted_by_client_at is null");
    expect(text).not.toContain("hidden_by_client_at is null");
    expect(text).toContain("(m.hidden_by_client_at is not null) as is_hidden");
  });

  it("states each segment's membership: sent is any sent kitchen, drafts an unsent kitchen of an account, all the union", async () => {
    const text = normalised(await sentByList(aQuery()));

    expect(text).toContain("when 'sent' then d.sent_at is not null");
    expect(text).toContain(
      "when 'drafts' then d.sent_at is null and d.account_id is not null",
    );
    expect(text).toContain(
      "when 'all' then d.sent_at is not null or d.account_id is not null",
    );
  });

  it("walks sent_at in the sent segment and updated_at in the others, ties by id, and repeats the order outside the lateral join", async () => {
    const text = normalised(await sentByList(aQuery()));

    expect(text).toContain(
      "case when ?::text = 'sent' then d.sent_at else d.updated_at end as sorted_at",
    );
    expect(text).toContain("order by m.sorted_at desc, m.id desc limit");
    expect(
      text.endsWith("order by p.sorted_at desc nulls last, p.id desc"),
    ).toBe(true);
  });

  it("joins accounts and the status table on the left only, so a kitchen with no account stays", async () => {
    const text = normalised(await sentByList(aQuery()));

    const joins = text.match(/\b\w+ join\b/g) ?? [];
    expect(joins.every((join) => join === "left join")).toBe(true);
    expect(text).toContain("left join accounts a on a.id = d.account_id");
    expect(text).toContain(
      "left join design_request_states s on s.design_id = d.id",
    );
    expect(text).not.toMatch(/\b(inner|right|full|cross) join\b/);
  });

  it("counts a sent kitchen with no saved status as new when it filters by status", async () => {
    const statement = await sentByList(aQuery({ status: "contacted" }));

    expect(normalised(statement)).toContain(
      "coalesce(s.status, ?::text) = ?::text",
    );
    expect(statement.values).toContain(INITIAL_REQUEST_STATUS);
  });

  it("searches the client's e-mail normal form and name case-insensitively, with an explicit backslash escape", async () => {
    const text = normalised(await sentByList(aQuery({ search: "ana" })));

    expect(text).toContain(
      "a.email_normal_form ilike ?::text escape '\\' or translate(a.name, ?::text, ?::text) ilike ?::text escape '\\'",
    );
    expect(text).not.toContain("d.name ilike");
    expect(text).not.toContain("reference");
  });

  it.each([
    ["a percent sign", "50%", "%50\\%%"],
    ["an underscore", "a_b", "%a\\_b%"],
    ["a backslash", "a\\b", "%a\\\\b%"],
    ["a backslash before a percent sign", "a\\%", "%a\\\\\\%%"],
    ["plain text", "ana", "%ana%"],
  ])(
    "passes %s in the search as an escaped literal",
    async (_label, search, pattern) => {
      const { values } = await sentByList(aQuery({ search }));

      const [emailPattern, namePattern] = [values[5], values[9]];

      expect(values[6]).toBe(emailPattern);
      expect(emailPattern).toBe(pattern);
      expect(namePattern).toBe(pattern);
      expect(values).not.toContain(search);
    },
  );

  it("passes a search of none as nulls so no pattern is applied", async () => {
    const { values } = await sentByList(aQuery({ search: null }));

    expect(values).toEqual([
      "sent",
      "sent",
      null,
      INITIAL_REQUEST_STATUS,
      null,
      null,
      null,
      ROMANIAN_CEDILLA_LETTERS,
      ROMANIAN_COMMA_BELOW_LETTERS,
      null,
      STAFF_KITCHEN_PAGE_SIZE,
      0,
    ]);
  });

  it("passes the segment, status, search and the page's offset as values and nothing as text", async () => {
    const statement = await sentByList(
      aQuery({ segment: "sent", status: "closed", search: "ana", page: 3 }),
    );

    expect(statement.values).toEqual([
      "sent",
      "sent",
      "closed",
      INITIAL_REQUEST_STATUS,
      "closed",
      "%ana%",
      "%ana%",
      ROMANIAN_CEDILLA_LETTERS,
      ROMANIAN_COMMA_BELOW_LETTERS,
      "%ana%",
      STAFF_KITCHEN_PAGE_SIZE,
      staffKitchenOffsetOf(3),
    ]);
    expect(statement.text).not.toContain("closed");
    expect(statement.text).not.toContain("ana");
  });

  it("casts the offset to bigint so the last countable page is an empty page and not an overflow", async () => {
    const lastPage = Math.floor(
      Number.MAX_SAFE_INTEGER / STAFF_KITCHEN_PAGE_SIZE,
    );

    const statement = await sentByList(aQuery({ page: lastPage }));

    expect(normalised(statement)).toContain("offset ?::bigint");
    expect(statement.values.at(-1)).toBe(staffKitchenOffsetOf(lastPage));
  });

  it("folds the cedilla letters of the typed search and of the stored name by parameters, not literals", async () => {
    const search = `${CEDILLA_S}erban ${CEDILLA_T}aru`;
    const statement = await sentByList(aQuery({ search }));

    expect(statement.values[9]).toBe(
      `%${COMMA_BELOW_S}erban ${COMMA_BELOW_T}aru%`,
    );
    expect(statement.values.slice(7, 9)).toEqual([
      ROMANIAN_CEDILLA_LETTERS,
      ROMANIAN_COMMA_BELOW_LETTERS,
    ]);
    expect(statement.text).not.toMatch(
      new RegExp(
        `[${ROMANIAN_CEDILLA_LETTERS}${ROMANIAN_COMMA_BELOW_LETTERS}]`,
      ),
    );
    expect(statement.values[5]).toBe(`%${search}%`);
  });

  it("reads each kitchen's document for the page only, joined back after the count", async () => {
    const text = normalised(await sentByList(aQuery()));

    expect(text).toContain("left join designs kitchen on kitchen.id = m.id");
    expect(text).toContain("kitchen.schema_version, kitchen.document");
    expect(text).not.toContain("d.document");
  });

  it("reads each instant as epoch milliseconds clamped to what a Date holds", async () => {
    const text = normalised(await sentByList(aQuery()));

    const clamp = (column: string) =>
      `floor(least( greatest(extract(epoch from ${column}) * 1000, -8640000000000000), 8640000000000000 ))::bigint::text`;
    expect(text).toContain(clamp("m.updated_at"));
    expect(text).toContain(
      `case when m.sent_at is null then null else ${clamp("m.sent_at")} end as sent_ms`,
    );
  });

  it("reads the client's id, e-mail, name and phone, and no postal address, credential or token", async () => {
    const text = normalised(await sentByList(aQuery({ search: "ana" })));

    expect(columnsReferencedThrough("a", text)).toEqual(
      new Set([...READABLE_ACCOUNT_COLUMNS, "email_normal_form"]),
    );
    for (const forbidden of [
      "address",
      "password",
      "role",
      "token",
      "visitor",
      "hash",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe("the statements for one kitchen", () => {
  it("sends nothing for a malformed id and answers it as none", async () => {
    for (const malformed of ["", "a/b", "x".repeat(65), "a b"]) {
      const reading = await newReader().readOne(malformed);

      expect(reading).toStrictEqual({ kind: "none" });
    }
    expect(queryDriver.statements).toHaveLength(0);
  });

  it("reads no note of a kitchen it does not find", async () => {
    answerQueryWith([]);

    const reading = await newReader().readOne(DESIGN_ID);

    expect(reading).toStrictEqual({ kind: "none" });
    expect(queryDriver.statements).toHaveLength(1);
  });

  it("refuses a kitchen its client deleted and a visitor's unsent draft, and reads one its client hid", async () => {
    const { kitchen } = await sentByFoundReadOne();
    const text = normalised(kitchen);

    expect(text).toContain("where d.id = ? and d.deleted_by_client_at is null");
    expect(text).toContain(
      "and (d.sent_at is not null or d.account_id is not null)",
    );
    expect(text).not.toContain("hidden_by_client_at is null");
    expect(kitchen.values).toEqual([DESIGN_ID]);
  });

  it("takes the notes of the kitchen newest first with the id as the tie-break", async () => {
    const { notes } = await sentByFoundReadOne();
    const text = normalised(notes);

    expect(text).toContain("where n.design_id = ?");
    expect(text).toContain(
      "order by n.created_at desc, n.id desc limit ?::int",
    );
    expect(notes.values).toEqual([DESIGN_ID, NOTES_READ_LIMIT + 1]);
  });

  it("names only columns of contact_submissions that the application role may select", async () => {
    const { kitchen } = await sentByFoundReadOne();
    const text = normalised(kitchen);

    const granted = readableSubmissionColumns();
    expect(granted).toHaveLength(7);
    const referenced = columnsReferencedThrough("cs", text);
    expect(referenced.size).toBeGreaterThan(0);
    for (const column of referenced) expect(granted).toContain(column);
  });

  it("never selects every column of a joined table or a row as one value", async () => {
    const { kitchen, notes } = await sentByFoundReadOne();

    for (const statement of [kitchen, notes]) {
      const text = normalised(statement);
      expect(text).not.toMatch(/\bselect \*/);
      expect(text).not.toMatch(/\b\w+\.\*/);
      expect(text).not.toMatch(/to_jsonb\(|row_to_json\(|to_json\(|json_agg\(/);
    }
  });

  it("names none of the request's personal columns anywhere in the statement", async () => {
    const { kitchen } = await sentByFoundReadOne();
    const text = normalised(kitchen);

    for (const personal of [
      "phone_normal_form",
      "locality",
      "channel",
      "consent_text_version",
      "payload_digest",
      "priced",
    ]) {
      expect(text).not.toContain(personal);
    }
    expect(text).not.toMatch(
      /\bcs\.(name|phone|email|locale|intent|design_document)\b/,
    );
  });

  it("takes the latest request by time then request id, and the newest unrevoked copy of that request", async () => {
    const { kitchen } = await sentByFoundReadOne();
    const text = normalised(kitchen);

    expect(text).toContain(
      "from contact_submissions cs where cs.design_id = d.id order by cs.created_at desc, cs.client_request_id desc limit 1",
    );
    expect(text).toContain(
      "from contact_submission_views csv where csv.client_request_id = request.client_request_id and csv.revoked_at is null order by csv.created_at desc, csv.token_hash desc limit 1",
    );
  });

  it("selects only the schema version and document of a copy, never its token hash", async () => {
    const { kitchen } = await sentByFoundReadOne();
    const text = normalised(kitchen);

    expect(columnsReferencedThrough("csv", text)).toEqual(
      new Set([
        "schema_version",
        "design_document",
        "client_request_id",
        "revoked_at",
        "created_at",
        "token_hash",
      ]),
    );
    const selectList = text.slice(0, text.indexOf(" from designs d "));
    expect(selectList).not.toContain("token_hash");
    expect(text.match(/token_hash/g)).toHaveLength(1);
  });

  it("reads the client's and the account-behind-a-change's e-mail, name and phone only", async () => {
    const { kitchen, notes } = await sentByFoundReadOne();

    for (const [alias, statement, expected] of [
      ["a", kitchen, READABLE_ACCOUNT_COLUMNS],
      ["changer", kitchen, ["id", "email", "name"]],
      ["author", notes, ["id", "email", "name"]],
    ] as const) {
      expect(columnsReferencedThrough(alias, normalised(statement))).toEqual(
        new Set(expected),
      );
    }
    for (const forbidden of ["address", "password", "email_normal_form"]) {
      expect(normalised(kitchen)).not.toContain(forbidden);
      expect(normalised(notes)).not.toContain(forbidden);
    }
  });
});

describe("every statement is a read", () => {
  it("sends only selects, in no transaction, for both operations", async () => {
    resetQueryDriver();
    answerQueryWith(NOTHING_FOUND);
    answerQueryWith([aKitchenRow()]);
    answerQueryWith([]);

    await newReader().listPage(aQuery());
    await newReader().readOne(DESIGN_ID);

    expect(queryDriver.transactions).toHaveLength(0);
    const statements = everySentQuery();
    expect(statements).toHaveLength(3);
    for (const statement of statements) {
      const text = normalised(statement);
      expect(text).toMatch(/^(with .*)?select /);
      expect(text).not.toMatch(
        /\b(insert|update|delete|truncate|alter|drop|create|grant|copy)\b/,
      );
      expect(text).not.toMatch(/\bfor (update|share|no key update)\b/);
    }
  });
});

describe("a query the reader refuses before any statement", () => {
  it.each([
    ["a page of zero", aQuery({ page: 0 })],
    ["a page that is not whole", aQuery({ page: 1.5 })],
    [
      "a page whose rows cannot be counted",
      aQuery({ page: Number.MAX_SAFE_INTEGER }),
    ],
    [
      "a status under the drafts segment",
      aQuery({ segment: "drafts", status: "new" }),
    ],
    [
      "a status under the all segment",
      aQuery({ segment: "all", status: "new" }),
    ],
    [
      "a status outside the list",
      aQuery({ status: "from-a-later-build" as never }),
    ],
    ["a segment outside the list", aQuery({ segment: "everything" as never })],
    ["a search of 101 code points", aQuery({ search: "a".repeat(101) })],
    ["a search holding a NUL", aQuery({ search: "a\u0000b" })],
    ["an empty search", aQuery({ search: "" })],
  ])("refuses %s", async (_label, query) => {
    const failure = await failureOf(() => newReader().listPage(query));

    expect(failure.failure).toBe("invalid-query");
    expect(queryDriver.statements).toHaveLength(0);
  });

  it("accepts a search of exactly 100 code points, counted in code points and not code units", async () => {
    answerQueryWith(NOTHING_FOUND);

    await newReader().listPage(aQuery({ search: "\u{1F373}".repeat(100) }));

    expect(queryDriver.statements).toHaveLength(1);
  });
});

describe("a reply that is not what the statements name", () => {
  it.each([
    ["no rows at all", []],
    ["rows that are not objects", ["x"]],
    ["a total that is not a count", [{ total: "1", id: null }]],
    ["a negative total", [{ total: -1, id: null }]],
    ["a kitchen without a boolean mark", [aListedRow({ is_sent: "yes" })]],
    ["a sent time that is not milliseconds", [aListedRow({ sent_ms: "1.5" })]],
    [
      "an empty page mixed with a kitchen",
      [{ total: 2, id: null }, aListedRow()],
    ],
    [
      "more kitchens than a page",
      Array.from({ length: STAFF_KITCHEN_PAGE_SIZE + 1 }, () =>
        aListedRow({ total: 21 }),
      ),
    ],
    [
      "a client e-mail that is not text",
      [aListedRow({ client_id: DESIGN_ID, client_email: 7 })],
    ],
  ])("reads %s as an unexpected answer on the list", async (_label, rows) => {
    const failure = await failureOf(async () => {
      answerQueryWith(rows);
      return newReader().listPage(aQuery());
    });

    expect(failure.failure).toBe("unexpected-answer");
  });

  it.each([
    ["two kitchens for one id", [aKitchenRow(), aKitchenRow()]],
    ["a kitchen without a boolean mark", [aKitchenRow({ is_hidden: null })]],
    [
      "a request time that is not milliseconds",
      [aKitchenRow({ request_reference: "X", request_ms: "soon" })],
    ],
    [
      "a saved status with no one behind it",
      [
        aKitchenRow({
          stored_status: "closed",
          changed_by_id: null,
          changed_ms: "1790000000000",
        }),
      ],
    ],
  ])(
    "reads %s as an unexpected answer on one kitchen",
    async (_label, rows) => {
      const failure = await failureOf(async () => {
        answerQueryWith(rows);
        answerQueryWith([]);
        return newReader().readOne(DESIGN_ID);
      });

      expect(failure.failure).toBe("unexpected-answer");
    },
  );

  it("reads a note without an author id as an unexpected answer", async () => {
    answerQueryWith([aKitchenRow()]);
    answerQueryWith([
      { id: DESIGN_ID, body: "x", created_ms: "1", author_account_id: null },
    ]);

    const failure = await failureOf(() => newReader().readOne(DESIGN_ID));

    expect(failure.failure).toBe("unexpected-answer");
  });
});

describe("a failure of the database", () => {
  const SQLSTATE_TO_KIND: readonly (readonly [
    string,
    string,
    StaffKitchenReaderFailure,
  ])[] = [
    ["42P01", "a table is missing", "unavailable"],
    ["42501", "the role lacks a grant", "unavailable"],
    ["57014", "a statement timeout", "database"],
    ["23505", "a unique violation", "database"],
    ["08006", "a lost connection", "database"],
  ];

  it.each(SQLSTATE_TO_KIND)(
    "reads SQLSTATE %s (%s) on the list as %s",
    async (code, _why, kind) => {
      failQueryWith(
        Object.assign(new Error("driver text with a secret"), { code }),
      );

      const failure = await failureOf(() => newReader().listPage(aQuery()));

      expect(failure.failure).toBe(kind);
      expect(failure.cause).toEqual({ name: "Error", code });
    },
  );

  it.each(SQLSTATE_TO_KIND)(
    "reads SQLSTATE %s (%s) on one kitchen as %s",
    async (code, _why, kind) => {
      failQueryWith(
        Object.assign(new Error("driver text with a secret"), { code }),
      );

      const failure = await failureOf(() => newReader().readOne(DESIGN_ID));

      expect(failure.failure).toBe(kind);
    },
  );

  it("reads a note statement that fails as the same error, after the kitchen was found", async () => {
    answerQueryWith([aKitchenRow()]);
    failQueryWith(Object.assign(new Error("driver text"), { code: "42P01" }));

    const failure = await failureOf(() => newReader().readOne(DESIGN_ID));

    expect(failure.failure).toBe("unavailable");
    expect(failure.operation).toBe("read a staff kitchen");
  });

  it("holds no driver text, id or search in the message or the cause", async () => {
    failQueryWith(
      Object.assign(new Error(`secret ${DESIGN_ID} ana`), { code: "XX000" }),
    );

    const failure = await failureOf(() =>
      newReader().listPage(aQuery({ search: "ana" })),
    );

    const everything = `${failure.message} ${JSON.stringify(failure.cause)}`;
    expect(everything).not.toContain("secret");
    expect(everything).not.toContain(DESIGN_ID);
    expect(everything).not.toContain("ana");
  });

  it("answers a failure with no SQLSTATE as a database failure", async () => {
    failQueryWith(new Error("x"));

    const failure = await failureOf(() => newReader().listPage(aQuery()));

    expect(failure.failure).toBe("database");
  });
});

describe("the operations the reader offers", () => {
  it("are exactly the two the port names, and no method that writes", () => {
    const methods = Object.getOwnPropertyNames(
      NeonStaffKitchenReader.prototype,
    ).filter((name) => name !== "constructor");

    expect(methods).toEqual(expect.arrayContaining([...OPERATIONS]));
    expect(
      methods.filter((name) =>
        /^(add|set|save|write|update|delete|remove|unhide|record|insert|upsert)/.test(
          name,
        ),
      ),
    ).toEqual([]);
  });
});

describe("the notes a kitchen reads", () => {
  function notesRows(count: number) {
    return Array.from({ length: count }, (_unused, index) => ({
      id: `note-${String(index)}`,
      body: `text ${String(index)}`,
      created_ms: String(1_790_000_000_000 - index),
      author_id: "S".repeat(21),
      author_email: null,
      author_name: null,
    }));
  }

  async function readWithNotes(count: number) {
    answerQueryWith([aKitchenRow()]);
    answerQueryWith(notesRows(count));
    const reading = await newReader().readOne(DESIGN_ID);
    if (reading.kind !== "found") throw new Error("not found");
    return reading.kitchen;
  }

  it("keeps the statement's first hundred and says none were left out when it returned exactly a hundred", async () => {
    const kitchen = await readWithNotes(NOTES_READ_LIMIT);

    expect(kitchen.notes).toHaveLength(NOTES_READ_LIMIT);
    expect(kitchen.notesTruncated).toBe(false);
  });

  it("drops the one note more than the limit and says some were left out", async () => {
    const kitchen = await readWithNotes(NOTES_READ_LIMIT + 1);

    expect(kitchen.notes).toHaveLength(NOTES_READ_LIMIT);
    expect(kitchen.notes.at(-1)?.id).toBe(
      `note-${String(NOTES_READ_LIMIT - 1)}`,
    );
    expect(kitchen.notesTruncated).toBe(true);
  });

  it("says none were left out of a kitchen with no notes", async () => {
    const kitchen = await readWithNotes(0);

    expect(kitchen.notes).toEqual([]);
    expect(kitchen.notesTruncated).toBe(false);
  });
});

describe("the instants a row can hold", () => {
  it.each([
    ["before 1970", "-2208988800000", -2_208_988_800_000],
    ["the latest a Date holds", "8640000000000000", 8.64e15],
    ["the earliest a Date holds", "-8640000000000000", -8.64e15],
  ])(
    "reads an instant %s on the list and on one kitchen",
    async (_label, text, milliseconds) => {
      answerQueryWith([aListedRow({ sent_ms: text, updated_ms: text })]);
      answerQueryWith([aKitchenRow({ sent_ms: text, updated_ms: text })]);
      answerQueryWith([]);

      const page = await newReader().listPage(aQuery());
      const reading = await newReader().readOne(DESIGN_ID);

      expect(page.kitchens[0]?.sentAt?.getTime()).toBe(milliseconds);
      expect(page.kitchens[0]?.updatedAt.getTime()).toBe(milliseconds);
      expect(
        reading.kind === "found" && reading.kitchen.updatedAt.getTime(),
      ).toBe(milliseconds);
    },
  );

  it("holds an instant past what a Date holds to the nearest one rather than failing", async () => {
    answerQueryWith([aListedRow({ updated_ms: "9999999999999999" })]);

    const page = await newReader().listPage(aQuery());

    expect(page.kitchens[0]?.updatedAt.getTime()).toBe(8.64e15);
  });
});

describe("the document of a listed kitchen", () => {
  it("is the migrated design, and null when the stored document cannot be read", async () => {
    answerQueryWith([
      aListedRow({
        id: "A".repeat(21),
        schema_version: 5,
        document: KITCHEN_L_DESIGN,
      }),
      aListedRow({ id: "B".repeat(21), schema_version: 5, document: {} }),
    ]);

    const page = await newReader().listPage(aQuery());

    expect(page.kitchens[0]?.design?.createdAt).toBe(
      KITCHEN_L_DESIGN.createdAt,
    );
    expect(page.kitchens[1]?.design).toBeNull();
  });
});
