import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NeonContactSubmissionStore } from "../src/neon-contact-submission-store.js";
import {
  ALL_COLUMNS,
  READABLE_COLUMNS,
  UNREADABLE_COLUMNS,
} from "./support/contact-submission-columns.js";
import {
  DIGEST_A,
  FAKE_DESIGN_ID,
  FAKE_EMAIL,
  FAKE_LOCALITY,
  FAKE_NAME,
  FAKE_PHONE,
  FAKE_PHONE_NORMAL_FORM,
  aCallbackSubmission,
  aDesignSubmission,
} from "./support/contact-submission-fixtures.js";
import {
  answerWith,
  driver,
  resetDriver,
} from "./support/mocked-neon-driver.js";
import type { SentStatement } from "./support/mocked-neon-driver.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-driver.js")).withMockedDriver(
    await importOriginal<object>(),
  ),
);

/**
 * Every statement the store sends: the text is read as the driver receives it. The columns the
 * role may not read appear in the insert's column list and nowhere else, so none is read, returned, filtered on, sorted
 * by or set; every `on conflict` names its target, the client request id alone; and nothing is computed from a column.
 */
const PROPOSED_REFERENCE = "LM-AAAAAAAA";
const RECORDED_ROW = {
  reference: PROPOSED_REFERENCE,
  is_new: true,
  is_same_payload: true,
  is_notified: false,
};
const LOOKED_UP_ROW = {
  reference: PROPOSED_REFERENCE,
  is_same_payload: true,
  is_notified: false,
};
const CLIENT_REQUEST_ID = "statements-test-request-id";
const STORED_REVISION = "7";

/** Columns the insert writes: every one but the two the database fills. */
const INSERTED_COLUMNS = ALL_COLUMNS.filter(
  (column) => column !== "created_at" && column !== "notified_at",
);

/** Names that may stand before an opening parenthesis in a statement: the insert's alias, `values`, the conflict
 *  target and the two functions the statements call. */
const NAMES_BEFORE_A_PARENTHESIS = [
  "coalesce",
  "conflict",
  "now",
  "submission",
  "values",
];

function normalised(statement: SentStatement): string {
  return statement.text.replace(/\s+/g, " ").trim().toLowerCase();
}

function newStore(): NeonContactSubmissionStore {
  return new NeonContactSubmissionStore(WELL_FORMED_UNREACHABLE_VALUE, {
    proposeReference: () => PROPOSED_REFERENCE,
  });
}

interface StatementsSent {
  readonly designInsert: SentStatement;
  readonly callbackInsert: SentStatement;
  readonly lookup: SentStatement;
  readonly mark: SentStatement;
  readonly sentReference: SentStatement;
  readonly all: readonly SentStatement[];
}

async function everyStatementTheStoreSends(): Promise<StatementsSent> {
  const store = newStore();
  const designInsert = await sent(
    () => store.record(aDesignSubmission(CLIENT_REQUEST_ID)),
    [RECORDED_ROW],
  );
  const callbackInsert = await sent(
    () => store.record(aCallbackSubmission(CLIENT_REQUEST_ID)),
    [RECORDED_ROW],
  );
  const lookup = await sent(
    () =>
      store.lookUp({
        clientRequestId: CLIENT_REQUEST_ID,
        payloadDigest: DIGEST_A,
      }),
    [LOOKED_UP_ROW],
  );
  const mark = await sent(
    () => store.markNotified(CLIENT_REQUEST_ID),
    [{ reference: PROPOSED_REFERENCE }],
  );
  const sentReference = await sent(
    () =>
      store.findSentReference({
        designId: FAKE_DESIGN_ID,
        revision: STORED_REVISION,
      }),
    [{ reference: PROPOSED_REFERENCE }],
  );
  return {
    designInsert,
    callbackInsert,
    lookup,
    mark,
    sentReference,
    all: [designInsert, callbackInsert, lookup, mark, sentReference],
  };
}

/** Plays `reply`, runs one call and answers the one statement it sent. */
async function sent(
  call: () => Promise<unknown>,
  reply: unknown,
): Promise<SentStatement> {
  const before = driver.statements.length;
  answerWith(reply);
  await call();
  const [statement, ...others] = driver.statements.slice(before);
  if (statement === undefined || others.length > 0)
    throw new Error("the call did not send exactly one statement");
  return statement;
}

function withoutTheInsertColumnList(text: string): string {
  return text.replace(
    /insert into contact_submissions as submission \([^)]*\)/,
    "insert",
  );
}

function wordsOf(text: string): Set<string> {
  return new Set(text.match(/[a-z_][a-z0-9_]*/g) ?? []);
}

beforeEach(resetDriver);
afterEach(resetDriver);

describe("every statement the contact submission store sends", () => {
  it("sends five statements for the five calls, so every test below reads all of them", async () => {
    const { all } = await everyStatementTheStoreSends();

    expect(all.map((statement) => normalised(statement).split(" ")[0])).toEqual(
      ["insert", "insert", "select", "update", "select"],
    );
  });

  it("names no column the role may not read outside the insert's column list, and never `returning *`", async () => {
    const { all } = await everyStatementTheStoreSends();

    for (const statement of all) {
      const words = wordsOf(withoutTheInsertColumnList(normalised(statement)));
      expect(UNREADABLE_COLUMNS.filter((column) => words.has(column))).toEqual(
        [],
      );
      expect(normalised(statement)).not.toMatch(
        /returning\s+\*|\.\*|select \*/,
      );
    }
  });

  it("lists in the insert exactly the columns the application writes", async () => {
    const { designInsert, callbackInsert } =
      await everyStatementTheStoreSends();

    for (const insert of [designInsert, callbackInsert]) {
      const listed =
        /insert into contact_submissions as submission \(([^)]*)\)/.exec(
          normalised(insert),
        );
      expect(
        (listed?.[1] ?? "")
          .split(",")
          .map((column) => column.trim())
          .sort(),
      ).toEqual([...INSERTED_COLUMNS].sort());
    }
  });

  it("writes every `on conflict` with its target, the client request id alone, and updates nothing but the mark", async () => {
    const { all, designInsert } = await everyStatementTheStoreSends();

    for (const statement of all) {
      const text = normalised(statement);
      const conflicts = text.match(/on conflict/g) ?? [];
      const targeted =
        text.match(
          /on conflict \(client_request_id\) do update set notified_at = submission\.notified_at returning /g,
        ) ?? [];
      expect(targeted).toHaveLength(conflicts.length);
    }
    expect(normalised(designInsert)).toContain(
      "on conflict (client_request_id)",
    );
  });

  it("returns only the seven readable columns: every column name outside the insert's list is one", async () => {
    const { all } = await everyStatementTheStoreSends();

    for (const statement of all) {
      const words = wordsOf(withoutTheInsertColumnList(normalised(statement)));
      const mentioned = ALL_COLUMNS.filter((column) => words.has(column));
      expect(
        mentioned.filter((column) => !READABLE_COLUMNS.includes(column)),
      ).toEqual([]);
    }
  });

  it("finds a row by its primary key alone, in the lookup and in the mark", async () => {
    const { lookup, mark } = await everyStatementTheStoreSends();

    expect(normalised(lookup)).toMatch(/ where client_request_id = \?$/);
    expect(normalised(mark)).toMatch(
      / where client_request_id = \? returning reference$/,
    );
  });

  it("sets the mark from itself and the database's clock, and nothing else", async () => {
    const { mark } = await everyStatementTheStoreSends();

    expect(normalised(mark)).toContain(
      "set notified_at = coalesce(notified_at, now()) where",
    );
  });

  it("calls no function but coalesce and now, and computes nothing from a column but the three comparisons", async () => {
    const { all } = await everyStatementTheStoreSends();

    const names = new Set(
      all.flatMap((statement) =>
        [...normalised(statement).matchAll(/([a-z_][a-z0-9_]*) ?\(/g)].map(
          (match) => match[1] ?? "",
        ),
      ),
    );
    const comparisons = all.flatMap(
      (statement) =>
        normalised(statement).match(/\([a-z_.]+ (?:=|is) [^)]*\)/g) ?? [],
    );

    expect(
      [...names].filter((name) => !NAMES_BEFORE_A_PARENTHESIS.includes(name)),
    ).toEqual([]);
    expect(
      comparisons.filter(
        (comparison) =>
          !/^\((?:submission\.)?(?:payload_digest = \?|reference = \?|notified_at is not null)\)$/.test(
            comparison,
          ),
      ),
    ).toEqual([]);
  });

  it("sends each personal value in the insert's values and in no other statement", async () => {
    const { designInsert, lookup, mark } = await everyStatementTheStoreSends();

    for (const value of [
      FAKE_NAME,
      FAKE_PHONE,
      FAKE_PHONE_NORMAL_FORM,
      FAKE_EMAIL,
      FAKE_LOCALITY,
    ]) {
      expect(designInsert.values).toContain(value);
      expect(lookup.values).not.toContain(value);
      expect(mark.values).not.toContain(value);
    }
  });

  it("passes the document to jsonb as JSON text of an object and the priced design likewise, never double-encoded", async () => {
    const { designInsert, callbackInsert } =
      await everyStatementTheStoreSends();
    const { snapshot } = aDesignSubmission(CLIENT_REQUEST_ID);

    const jsonTexts = designInsert.values.filter(
      (value): value is string =>
        typeof value === "string" && value.startsWith("{"),
    );

    expect(jsonTexts).toEqual([
      snapshot?.document,
      JSON.stringify(snapshot?.priced),
    ]);
    expect(jsonTexts.map((text) => typeof JSON.parse(text))).toEqual([
      "object",
      "object",
    ]);
    expect(
      callbackInsert.values.filter(
        (value) => typeof value === "string" && value.startsWith("{"),
      ),
    ).toEqual([]);
  });

  it("returns and selects exactly the columns it names, in each statement, and never a star or a row", async () => {
    const { designInsert, callbackInsert, lookup, mark } =
      await everyStatementTheStoreSends();

    for (const insert of [designInsert, callbackInsert]) {
      expect(listAfter(normalised(insert), "returning ")).toBe(
        "submission.reference, (submission.reference = ?) as is_new, " +
          "(submission.payload_digest = ?) as is_same_payload, (submission.notified_at is not null) as is_notified",
      );
    }
    expect(listBetween(normalised(lookup), "select ", " from ")).toBe(
      "reference, (payload_digest = ?) as is_same_payload, (notified_at is not null) as is_notified",
    );
    expect(listAfter(normalised(mark), "returning ")).toBe("reference");
  });

  it("reads the latest sent reference by the design's id and revision as parameters, and only rows whose notice is marked", async () => {
    const { sentReference } = await everyStatementTheStoreSends();

    expect(normalised(sentReference)).toBe(
      "select reference from contact_submissions " +
        "where design_id = ? and design_revision = ?::bigint and notified_at is not null " +
        "order by notified_at desc, reference limit 1",
    );
    expect(sentReference.values).toEqual([FAKE_DESIGN_ID, STORED_REVISION]);
  });

  it("holds no star anywhere in any statement", async () => {
    const { all } = await everyStatementTheStoreSends();

    for (const statement of all) {
      expect(statement.text).not.toContain("*");
    }
  });

  it("sends as many statements as the source writes, so a statement added to the source is read here", async () => {
    const { all } = await everyStatementTheStoreSends();

    const written = readFileSync(
      join(
        import.meta.dirname,
        "..",
        "src",
        "neon-contact-submission-store.ts",
      ),
      "utf8",
    ).match(/this\.sql`/g);
    const distinctStatementsSent = new Set(all.map(normalised));

    expect(written).toHaveLength(distinctStatementsSent.size);
  });
});

/** What follows `marker` in `text`, to its end. */
function listAfter(text: string, marker: string): string {
  return text.slice(text.indexOf(marker) + marker.length);
}

/** What lies between the first `start` and the first `end` after it in `text`. */
function listBetween(text: string, start: string, end: string): string {
  const from = text.indexOf(start) + start.length;
  return text.slice(from, text.indexOf(end, from));
}
