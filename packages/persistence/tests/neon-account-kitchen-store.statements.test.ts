import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CURRENT_SCHEMA_VERSION,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AccountKitchenStoreError,
  MAX_EXPORTED_KITCHENS,
  MAX_EXPORTED_NOTES_IN_TOTAL,
  MAX_EXPORTED_NOTES_PER_KITCHEN,
} from "../src/account-kitchen-store.js";
import {
  NeonAccountKitchenStore,
  NeonSentMarkStore,
} from "../src/neon-account-kitchen-store.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  everySentQuery,
  failQueryWith,
  queryDriver,
  resetQueryDriver,
  type SentQuery,
  type SentTransaction,
} from "./support/mocked-neon-query-driver.js";
import { rejectionOf } from "./support/rejection-of.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * The text of every statement `NeonAccountKitchenStore` and `NeonSentMarkStore` send, read as the driver receives it,
 * with no database. Each predicate that makes a statement safe is pinned as text: the account, the listed pair, the
 * `for update` before a mark, the revoke in the same statement as the mark, and `sent_at is null` on `markSent`.
 */
const ACCOUNT_ID = "A".repeat(21);
const DESIGN_ID = "design-under-test";
const CURSOR = { updatedAt: "2026-10-19T09:30:00.123456Z", id: "cursor-id" };
const LISTED_PAIR =
  "hidden_by_client_at is null and deleted_by_client_at is null";
const PAGE_ROW = {
  total: 1,
  id: "k1",
  name: "Casa",
  is_sent: false,
  cursor_updated_at: "2026-10-19T09:30:00.123456Z",
  schema_version: CURRENT_SCHEMA_VERSION,
  document: KITCHEN_L_DESIGN,
};
/** The only columns any statement here assigns: the name, the three marks, and the share link's revoke mark. */
const WRITABLE_COLUMNS = [
  "name",
  "sent_at",
  "hidden_by_client_at",
  "deleted_by_client_at",
  "revoked_at",
];
const NO_KITCHEN_ROW = { total: 0, id: null };
const NOTE_ROW = { design_id: DESIGN_ID, body: "A text", created_ms: "1000" };
const MARKED_REPORT = [
  { is_marked: true, is_sent: true, is_already_marked: false },
];

function normalised(statement: SentQuery): string {
  return statement.text.replace(/\s+/g, " ").trim().toLowerCase();
}

function newStore(): NeonAccountKitchenStore {
  return new NeonAccountKitchenStore(WELL_FORMED_UNREACHABLE_VALUE);
}

function occurrencesOf(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

/** Plays `reply`, runs one call, and answers the one lone statement it sent. */
async function loneStatementOf(
  call: () => Promise<unknown>,
  reply: unknown,
): Promise<SentQuery> {
  resetQueryDriver();
  answerQueryWith(reply);
  await call();
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

/** Plays `reply`, runs one call, and answers the one transaction it sent. */
async function transactionOf(
  call: () => Promise<unknown>,
  reply: unknown,
): Promise<SentTransaction> {
  resetQueryDriver();
  answerQueryWith(reply);
  await call();
  const [transaction, ...others] = queryDriver.transactions;
  if (
    transaction === undefined ||
    others.length > 0 ||
    queryDriver.statements.length > 0
  ) {
    throw new Error("the call did not send exactly one transaction");
  }
  return transaction;
}

interface EveryStatement {
  readonly firstPage: SentQuery;
  readonly pageAfter: SentQuery;
  readonly count: SentQuery;
  readonly measure: SentQuery;
  readonly exportAll: SentQuery;
  readonly exportNotes: SentQuery;
  readonly rename: SentQuery;
  readonly duplicate: SentQuery;
  readonly hide: SentTransaction;
  readonly markDeleted: SentTransaction;
  readonly markSent: SentQuery;
  readonly all: readonly SentQuery[];
}

async function everyStatementTheStoresSend(): Promise<EveryStatement> {
  const store = newStore();
  const sent = {
    firstPage: await loneStatementOf(
      () => store.listPage({ accountId: ACCOUNT_ID, limit: 12 }),
      [NO_KITCHEN_ROW],
    ),
    pageAfter: await loneStatementOf(
      () => store.listPage({ accountId: ACCOUNT_ID, limit: 12, after: CURSOR }),
      [NO_KITCHEN_ROW],
    ),
    count: await loneStatementOf(
      () => store.countListed(ACCOUNT_ID),
      [{ total: 0 }],
    ),
    measure: await loneStatementOf(
      () => store.measureExport(ACCOUNT_ID),
      [{ total: 0 }],
    ),
    exportAll: await loneStatementOf(
      () => store.exportAll(ACCOUNT_ID),
      [NO_KITCHEN_ROW],
    ),
    exportNotes: await loneStatementOf(
      () => store.exportNotes(ACCOUNT_ID, [DESIGN_ID]),
      [],
    ),
    rename: await loneStatementOf(
      () =>
        store.rename({
          accountId: ACCOUNT_ID,
          designId: DESIGN_ID,
          name: "Nou",
        }),
      [{ id: DESIGN_ID }],
    ),
    duplicate: await loneStatementOf(
      () =>
        store.duplicate({
          accountId: ACCOUNT_ID,
          designId: DESIGN_ID,
          name: "Copie",
        }),
      [{ id: "copy" }],
    ),
    hide: await transactionOf(
      () => store.hide({ accountId: ACCOUNT_ID, designId: DESIGN_ID }),
      MARKED_REPORT,
    ),
    markDeleted: await transactionOf(
      () => store.markDeleted({ accountId: ACCOUNT_ID, designId: DESIGN_ID }),
      [{ is_marked: true, is_sent: false, is_already_marked: false }],
    ),
    markSent: await loneStatementOf(
      () =>
        new NeonSentMarkStore(WELL_FORMED_UNREACHABLE_VALUE).markSent(
          DESIGN_ID,
        ),
      [],
    ),
  };
  return {
    ...sent,
    all: [
      sent.firstPage,
      sent.pageAfter,
      sent.count,
      sent.measure,
      sent.exportAll,
      sent.exportNotes,
      sent.rename,
      sent.duplicate,
      ...sent.hide.statements,
      ...sent.markDeleted.statements,
      sent.markSent,
    ],
  };
}

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("the statements of NeonAccountKitchenStore and NeonSentMarkStore", () => {
  it("sends one lone statement per read and rename and duplicate, two per mark, and one for the sent mark", async () => {
    const sent = await everyStatementTheStoresSend();

    expect(sent.hide.statements).toHaveLength(2);
    expect(sent.markDeleted.statements).toHaveLength(2);
    expect(
      [
        sent.firstPage,
        sent.pageAfter,
        sent.count,
        sent.measure,
        sent.exportAll,
        sent.exportNotes,
        sent.rename,
        sent.duplicate,
        sent.markSent,
      ].map((statement) => normalised(statement).split(" ")[0]),
    ).toEqual([
      "select",
      "select",
      "select",
      "select",
      "select",
      "select",
      "update",
      "with",
      "update",
    ]);
  });

  it("sends as many distinct statements as the source writes, so a statement added to the source is read here", async () => {
    const sent = await everyStatementTheStoresSend();

    const written = [
      "neon-account-kitchen-store.ts",
      "account-kitchen-notes-statement.ts",
    ].flatMap(
      (file) =>
        readFileSync(
          join(import.meta.dirname, "..", "src", file),
          "utf8",
        ).match(/(?:this\.|return )sql`/g) ?? [],
    );
    const distinctTexts = new Set(sent.all.map(normalised));

    expect(written.length).toBe(distinctTexts.size);
    expect(distinctTexts.size).toBe(12);
  });

  it("holds no star, no `returning *`, and never writes a column an account kitchen must not change", async () => {
    const { all } = await everyStatementTheStoresSend();

    for (const statement of all) {
      const text = normalised(statement);
      expect(text).not.toMatch(/returning\s+\*|\.\*|select \*/);
      for (const [, assigned] of text.matchAll(/\bset ([a-z_]+) =/g)) {
        expect(WRITABLE_COLUMNS).toContain(assigned);
      }
    }
  });

  it("sends every value as a parameter and never in the text", async () => {
    const sent = await everyStatementTheStoresSend();

    for (const statement of sent.all) {
      for (const secret of [ACCOUNT_ID, DESIGN_ID, "Nou", "Copie", CURSOR.id]) {
        expect(statement.text).not.toContain(secret);
      }
    }
    expect(sent.rename.values).toEqual(["Nou", DESIGN_ID, ACCOUNT_ID]);
  });

  describe("the list", () => {
    it("names the account and the listed pair in both the count and the page, on the first page and after a cursor", async () => {
      const { firstPage, pageAfter } = await everyStatementTheStoresSend();

      for (const page of [firstPage, pageAfter]) {
        const text = normalised(page);
        expect(occurrencesOf(text, "where account_id = ?")).toBe(2);
        expect(occurrencesOf(text, LISTED_PAIR)).toBe(2);
        expect(
          page.values.filter((value) => value === ACCOUNT_ID),
        ).toHaveLength(2);
      }
    });

    it("orders by updated_at desc then id desc in the window, the page and the final order", async () => {
      const { firstPage } = await everyStatementTheStoresSend();
      const text = normalised(firstPage);

      expect(occurrencesOf(text, "order by updated_at desc, id desc")).toBe(2);
      expect(text).toContain(
        "row_number() over (order by updated_at desc, id desc) <= ?::int",
      );
      expect(text).toMatch(
        /order by p\.cursor_updated_at desc nulls last, p\.id desc$/,
      );
    });

    it("asks for one kitchen more than the page, and the extra one's document is not selected", async () => {
      const { firstPage } = await everyStatementTheStoresSend();

      expect(firstPage.values).toEqual([ACCOUNT_ID, 12, ACCOUNT_ID, 13]);
      expect(normalised(firstPage)).toContain("case when row_number() over");
      expect(normalised(firstPage)).toContain("then document end as document");
    });

    it("withholds the extra row's document after a cursor too: the window and the bound are in the later page's text", async () => {
      const { pageAfter } = await everyStatementTheStoresSend();

      expect(pageAfter.values).toEqual([
        ACCOUNT_ID,
        12,
        ACCOUNT_ID,
        CURSOR.updatedAt,
        CURSOR.id,
        13,
      ]);
      expect(normalised(pageAfter)).toContain(
        "case when row_number() over (order by updated_at desc, id desc) <= ?::int then document end as document",
      );
    });

    it("continues after the cursor by the row comparison, with the instant and the id as parameters", async () => {
      const { pageAfter } = await everyStatementTheStoresSend();

      expect(normalised(pageAfter)).toContain(
        "and (updated_at, id) < (?::timestamptz, ?::text)",
      );
      expect(pageAfter.values).toContain(CURSOR.updatedAt);
      expect(pageAfter.values).toContain(CURSOR.id);
      expect(
        normalised((await everyStatementTheStoresSend()).firstPage),
      ).not.toContain("(updated_at, id) <");
    });

    it("keeps an empty page's total with a left join lateral on true", async () => {
      const { firstPage } = await everyStatementTheStoresSend();

      expect(normalised(firstPage)).toContain(") p on true");
      expect(normalised(firstPage)).toContain("left join lateral");
    });

    it("counts with the same predicate", async () => {
      const { count } = await everyStatementTheStoresSend();

      expect(normalised(count)).toBe(
        `select count(*)::int as total from designs where account_id = ? and ${LISTED_PAIR}`,
      );
      expect(count.values).toEqual([ACCOUNT_ID]);
    });
  });

  describe("the export lists a hidden kitchen and leaves out a deleted one", () => {
    it("measure and export read `deleted_by_client_at is null` and never `hidden_by_client_at is null`", async () => {
      const { measure, exportAll } = await everyStatementTheStoresSend();

      for (const statement of [measure, exportAll]) {
        const text = normalised(statement);
        expect(text).toContain(
          "where account_id = ? and deleted_by_client_at is null",
        );
        expect(text).not.toContain("hidden_by_client_at is null");
      }
      expect(normalised(exportAll)).toContain(
        "(hidden_by_client_at is not null) as is_hidden",
      );
    });

    it("measures with a count and selects no document", async () => {
      const { measure } = await everyStatementTheStoresSend();

      expect(normalised(measure)).toBe(
        "select count(*)::int as total from designs where account_id = ? and deleted_by_client_at is null",
      );
    });

    it("selects the rows only while the count is within the bound, which is bound as a parameter", async () => {
      const { exportAll } = await everyStatementTheStoresSend();

      expect(normalised(exportAll)).toContain("and t.total <= ?::int");
      expect(exportAll.values).toEqual([
        ACCOUNT_ID,
        ACCOUNT_ID,
        MAX_EXPORTED_KITCHENS,
      ]);
    });

    it("names its columns: no hash, token, visitor or owner is selected", async () => {
      const { exportAll } = await everyStatementTheStoresSend();
      const words = new Set(normalised(exportAll).match(/[a-z_][a-z0-9_]*/g));

      for (const column of [
        "write_token_hash",
        "visitor_hash",
        "account_id_out",
        "revision",
      ]) {
        expect(words.has(column)).toBe(false);
      }
      expect(normalised(exportAll)).toContain(
        "select id, name, (sent_at is not null) as is_sent",
      );
    });
  });

  describe("the export's notes", () => {
    const PER_KITCHEN_WINDOW = MAX_EXPORTED_NOTES_PER_KITCHEN + 1;

    it("reads design_notes joined to designs for ownership alone, under the account and not-deleted, and not the hidden mark", async () => {
      const { exportNotes } = await everyStatementTheStoresSend();
      const text = normalised(exportNotes);

      expect(text).toContain(
        "from design_notes n join designs d on d.id = n.design_id",
      );
      expect(text).toContain(
        "where d.account_id = ? and d.deleted_by_client_at is null and n.design_id = any(?::text[])",
      );
      expect(text).not.toContain("hidden_by_client_at");
    });

    it("binds the account, the asked ids, the two windows and the row bound as parameters", async () => {
      const { exportNotes } = await everyStatementTheStoresSend();

      expect(exportNotes.values).toEqual([
        MAX_EXPORTED_NOTES_IN_TOTAL,
        MAX_EXPORTED_NOTES_IN_TOTAL,
        ACCOUNT_ID,
        [DESIGN_ID],
        PER_KITCHEN_WINDOW,
        PER_KITCHEN_WINDOW,
      ]);
    });

    it("selects the design, the text and the instant, and no note id, author, account or e-mail", async () => {
      const { exportNotes } = await everyStatementTheStoresSend();
      const text = normalised(exportNotes);
      const compact = text.replace(/\( /g, "(").replace(/ \)/g, ")");
      const words = new Set(text.match(/[a-z_][a-z0-9_]*/g));

      expect(compact).toMatch(
        /^select r\.design_id, case when r\.overall <= \?::int then r\.body end as body, case when r\.overall <= \?::int then floor\(least\(greatest\(extract\(epoch from r\.created_at\) \* 1000, -8640000000000000\), 8640000000000000\)\)::bigint::text end as created_ms from \(/,
      );
      for (const word of [
        "author_account_id",
        "author",
        "accounts",
        "email",
        "name",
        "changed_by_account_id",
        "contact_submissions",
        "design_request_states",
        "staff_audit_events",
      ]) {
        expect(words.has(word), word).toBe(false);
      }
    });

    it("ranks each kitchen's notes newest first with the id as tie-break, then all of them the same way", async () => {
      const { exportNotes } = await everyStatementTheStoresSend();
      const text = normalised(exportNotes);

      expect(text).toContain(
        "row_number() over (partition by n.design_id order by n.created_at desc, n.id desc) as in_kitchen",
      );
      expect(text).toContain(
        "row_number() over (order by k.created_at desc, k.id desc) as overall",
      );
      expect(text).toContain("where k.in_kitchen <= ?::int");
      expect(text).toMatch(
        /order by r\.created_at desc, r\.id desc limit \?::int$/,
      );
    });

    it("sends no statement for no ids, and none for a malformed account, a malformed id or too many ids", async () => {
      const tooMany = Array.from(
        { length: MAX_EXPORTED_KITCHENS + 1 },
        (_, index) => `k${String(index)}`,
      );
      for (const call of [
        () => newStore().exportNotes(ACCOUNT_ID, []),
        () => newStore().exportNotes("short", [DESIGN_ID]),
        () => newStore().exportNotes(ACCOUNT_ID, ["has space"]),
        () => newStore().exportNotes(ACCOUNT_ID, tooMany),
      ]) {
        resetQueryDriver();
        await call().catch(() => undefined);
        expect(everySentQuery()).toEqual([]);
      }
      expect(await newStore().exportNotes(ACCOUNT_ID, [])).toEqual(new Map());
      await expect(newStore().exportNotes("short", [])).rejects.toThrow();
      await expect(
        newStore().exportNotes(ACCOUNT_ID, tooMany),
      ).rejects.toThrow();
    });

    it("sends each asked id once", async () => {
      resetQueryDriver();
      answerQueryWith([]);

      await newStore().exportNotes(ACCOUNT_ID, [DESIGN_ID, DESIGN_ID]);

      expect(queryDriver.statements[0]?.values[3]).toEqual([DESIGN_ID]);
      expect(queryDriver.statements[0]?.values[5]).toBe(PER_KITCHEN_WINDOW);
    });

    it("reads a note as its text and its instant, grouped under its kitchen", async () => {
      resetQueryDriver();
      answerQueryWith([
        NOTE_ROW,
        {
          design_id: DESIGN_ID,
          body: "Older note\nsecond line",
          created_ms: "-5",
        },
      ]);

      const notes = await newStore().exportNotes(ACCOUNT_ID, [DESIGN_ID]);

      expect([...notes]).toEqual([
        [
          DESIGN_ID,
          {
            notes: [
              { text: "A text", createdAt: new Date(1000) },
              { text: "Older note\nsecond line", createdAt: new Date(-5) },
            ],
            isTruncated: false,
          },
        ],
      ]);
    });

    it("marks a kitchen truncated at the extra row, keeps its newest bound, and does not mark one that holds exactly the bound", async () => {
      resetQueryDriver();
      answerQueryWith(
        Array.from({ length: PER_KITCHEN_WINDOW }, (_, index) => ({
          ...NOTE_ROW,
          body: `n${String(index)}`,
        })),
      );
      const over = await newStore().exportNotes(ACCOUNT_ID, [DESIGN_ID]);

      resetQueryDriver();
      answerQueryWith(
        Array.from({ length: MAX_EXPORTED_NOTES_PER_KITCHEN }, () => NOTE_ROW),
      );
      const exactly = await newStore().exportNotes(ACCOUNT_ID, [DESIGN_ID]);

      expect(over.get(DESIGN_ID)?.isTruncated).toBe(true);
      expect(over.get(DESIGN_ID)?.notes).toHaveLength(
        MAX_EXPORTED_NOTES_PER_KITCHEN,
      );
      expect(over.get(DESIGN_ID)?.notes.at(-1)?.text).toBe(
        `n${String(MAX_EXPORTED_NOTES_PER_KITCHEN - 1)}`,
      );
      expect(exactly.get(DESIGN_ID)?.isTruncated).toBe(false);
    });

    it("marks a kitchen truncated when the total bound withheld its notes, even when it kept none", async () => {
      resetQueryDriver();
      answerQueryWith([
        NOTE_ROW,
        { design_id: "other", body: null, created_ms: null },
      ]);

      const notes = await newStore().exportNotes(ACCOUNT_ID, [
        DESIGN_ID,
        "other",
      ]);

      expect(notes.get(DESIGN_ID)).toEqual({
        notes: [{ text: "A text", createdAt: new Date(1000) }],
        isTruncated: false,
      });
      expect(notes.get("other")).toEqual({ notes: [], isTruncated: true });
    });

    it.each([
      ["a kitchen that was not asked for", [{ ...NOTE_ROW, design_id: "x-1" }]],
      ["a half-withheld row", [{ ...NOTE_ROW, created_ms: null }]],
      ["a text that is not a string", [{ ...NOTE_ROW, body: 7 }]],
      [
        "an instant that is not epoch milliseconds",
        [{ ...NOTE_ROW, created_ms: "tomorrow" }],
      ],
      ["a row with no kitchen", [{ ...NOTE_ROW, design_id: null }]],
      [
        "more rows than the statement can yield",
        Array.from({ length: PER_KITCHEN_WINDOW + 1 }, () => NOTE_ROW),
      ],
    ])(
      "is the store error for %s, and returns no notes",
      async (_label, reply) => {
        resetQueryDriver();
        answerQueryWith(reply);

        const failure = await rejectionOf(
          newStore().exportNotes(ACCOUNT_ID, [DESIGN_ID]),
        );

        expect(failure).toBeInstanceOf(AccountKitchenStoreError);
        expect((failure as AccountKitchenStoreError).operation).toBe(
          "export kitchen notes",
        );
      },
    );

    it("lets a driver failure leave as the store error, holding no id or text", async () => {
      resetQueryDriver();
      failQueryWith(new Error(`boom ${DESIGN_ID} ${ACCOUNT_ID}`));

      const failure = await rejectionOf(
        newStore().exportNotes(ACCOUNT_ID, [DESIGN_ID]),
      );

      expect(failure).toBeInstanceOf(AccountKitchenStoreError);
      expect((failure as Error).message).not.toContain(DESIGN_ID);
      expect((failure as Error).message).not.toContain(ACCOUNT_ID);
    });
  });

  describe("rename", () => {
    it("sets the name alone, under the account and the listed pair, and returns the id", async () => {
      const { rename } = await everyStatementTheStoresSend();

      expect(normalised(rename)).toBe(
        `update designs set name = ? where id = ? and account_id = ? and ${LISTED_PAIR} returning id`,
      );
    });
  });

  describe("duplicate", () => {
    it("inserts from a select of the source under the account and the listed pair, in one statement", async () => {
      const { duplicate } = await everyStatementTheStoresSend();
      const text = normalised(duplicate);

      expect(text).toContain(
        "insert into designs (id, schema_version, document, account_id, name)",
      );
      expect(text).toContain(
        "select ?::text, schema_version, document, account_id, ?::text from designs",
      );
      expect(text).toContain(
        `where id = ? and account_id = ? and ${LISTED_PAIR}`,
      );
      expect(text).toContain("on conflict (id) do nothing");
    });

    it("leaves the write token, the visitor, the sent mark, both marks and the revision to their defaults", async () => {
      const { duplicate } = await everyStatementTheStoresSend();
      const insertedColumns =
        /insert into designs \(([^)]*)\)/.exec(normalised(duplicate))?.[1] ??
        "";

      expect(insertedColumns.split(",").map((column) => column.trim())).toEqual(
        ["id", "schema_version", "document", "account_id", "name"],
      );
    });

    it("finds a row its own earlier attempt inserted only under the same id and the same account", async () => {
      const { duplicate } = await everyStatementTheStoresSend();

      expect(normalised(duplicate)).toMatch(
        /union select id from designs where id = \? and account_id = \?$/,
      );
    });

    it("draws the copy's id before the statement, binds it twice and answers it", async () => {
      const store = newStore();
      resetQueryDriver();
      answerQueryWith([{ id: "x" }]);

      const outcome = await store.duplicate({
        accountId: ACCOUNT_ID,
        designId: DESIGN_ID,
        name: "Copie",
      });

      const [statement] = queryDriver.statements;
      expect(outcome.kind).toBe("duplicated");
      const copyId = statement?.values[0];
      expect(copyId).toMatch(/^[A-Za-z0-9_-]{21}$/);
      expect(statement?.values).toEqual([
        copyId,
        "Copie",
        DESIGN_ID,
        ACCOUNT_ID,
        copyId,
        ACCOUNT_ID,
      ]);
      expect(outcome).toEqual({ kind: "duplicated", id: copyId });
    });

    it("answers none when the statement inserted and found nothing", async () => {
      const store = newStore();
      resetQueryDriver();
      answerQueryWith([]);

      expect(
        await store.duplicate({
          accountId: ACCOUNT_ID,
          designId: DESIGN_ID,
          name: "Copie",
        }),
      ).toEqual({ kind: "none" });
    });
  });

  describe.each([
    [
      "hide",
      "hidden_by_client_at",
      "sent_at is not null",
      "hidden_by_client_at is not null and deleted_by_client_at is null",
    ],
    [
      "markDeleted",
      "deleted_by_client_at",
      "sent_at is null",
      "deleted_by_client_at is not null",
    ],
  ] as const)("%s", (operation, markColumn, sentPredicate, alreadyMarked) => {
    async function theTransaction(): Promise<SentTransaction> {
      const sent = await everyStatementTheStoresSend();
      return sent[operation];
    }

    it("is one transaction of two statements, ReadCommitted, and the lock comes first", async () => {
      const transaction = await theTransaction();
      const [lock, mark] = transaction.statements;

      expect(transaction.options).toEqual({ isolationLevel: "ReadCommitted" });
      expect(normalised(lock ?? { text: "", values: [] })).toBe(
        "select 1 from designs where id = ? and account_id = ? for update",
      );
      expect(normalised(mark ?? { text: "", values: [] })).toMatch(
        /^with marked as \(/,
      );
    });

    it("locks the row under the account alone, without the marks, so a refused mark still waits its turn", async () => {
      const [lock] = (await theTransaction()).statements;

      expect(lock?.values).toEqual([DESIGN_ID, ACCOUNT_ID]);
      expect(normalised(lock ?? { text: "", values: [] })).not.toContain(
        "by_client_at",
      );
    });

    it("marks under the account, the sent predicate and the listed pair, and returns the id it marked", async () => {
      const mark = (await theTransaction()).statements[1];

      expect(normalised(mark ?? { text: "", values: [] })).toContain(
        `update designs set ${markColumn} = now() where id = ? and account_id = ? and ${sentPredicate} and ${LISTED_PAIR} returning id`,
      );
    });

    it("revokes the active share links of the rows it marked, in the same statement as the mark", async () => {
      const text = normalised(
        (await theTransaction()).statements[1] ?? { text: "", values: [] },
      );

      expect(text).toContain(
        "revoked as ( update design_share_links set revoked_at = now() where design_id in (select id from marked) and revoked_at is null returning token_hash )",
      );
      expect(occurrencesOf(text, "update ")).toBe(2);
    });

    it("reads back the sent state under the account and the listed pair, and the repeat only on a retry", async () => {
      const text = normalised(
        (await theTransaction()).statements[1] ?? { text: "", values: [] },
      );

      expect(text).toContain(
        `(select d.sent_at is not null from designs d where d.id = ? and d.account_id = ? and d.${LISTED_PAIR.replace(" and ", " and d.")}) as is_sent`,
      );
      expect(text).toContain(
        `exists (select 1 from designs d where ? and d.id = ? and d.account_id = ? and d.${alreadyMarked.replace(" and ", " and d.")}) as is_already_marked`,
      );
    });

    it("binds the retry flag false on a first attempt", async () => {
      const mark = (await theTransaction()).statements[1];

      expect(mark?.values).toEqual([
        DESIGN_ID,
        ACCOUNT_ID,
        DESIGN_ID,
        ACCOUNT_ID,
        false,
        DESIGN_ID,
        ACCOUNT_ID,
      ]);
    });

    it("writes nothing the mark does not mean: no document, no revision, no updated_at, no sent_at", async () => {
      const text = normalised(
        (await theTransaction()).statements[1] ?? { text: "", values: [] },
      );
      const setClauses = [...text.matchAll(/\bset ([a-z_]+) =/g)].map(
        (match) => match[1],
      );

      expect(setClauses).toEqual([markColumn, "revoked_at"]);
    });
  });

  describe("the sent mark", () => {
    it("sets sent_at once and only on a listed draft, under no account", async () => {
      const { markSent } = await everyStatementTheStoresSend();

      expect(normalised(markSent)).toBe(
        `update designs set sent_at = now() where id = ? and sent_at is null and ${LISTED_PAIR}`,
      );
      expect(markSent.values).toEqual([DESIGN_ID]);
      expect(normalised(markSent)).not.toContain("account_id");
      expect(normalised(markSent)).not.toContain("updated_at");
    });
  });

  describe("what it makes of the database's answer", () => {
    function pageRow(
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> {
      return { ...PAGE_ROW, ...overrides };
    }

    it("reads a kitchen with its name, its sent flag, its instant to the millisecond and its migrated document", async () => {
      resetQueryDriver();
      answerQueryWith([pageRow({ is_sent: true })]);

      const page = await newStore().listPage({
        accountId: ACCOUNT_ID,
        limit: 12,
      });

      expect(page).toEqual({
        kitchens: [
          {
            id: "k1",
            name: "Casa",
            updatedAt: new Date("2026-10-19T09:30:00.123Z"),
            isSent: true,
            design: KITCHEN_L_DESIGN,
          },
        ],
        nextCursor: null,
        total: 1,
        skippedCount: 0,
      });
    });

    it("has a next cursor from the last kitchen of the page when the extra row came back, and drops the extra row", async () => {
      resetQueryDriver();
      answerQueryWith([
        pageRow({
          total: 3,
          id: "k1",
          cursor_updated_at: "2026-10-19T09:30:03.000001Z",
        }),
        pageRow({
          total: 3,
          id: "k2",
          cursor_updated_at: "2026-10-19T09:30:02.000002Z",
        }),
        pageRow({
          total: 3,
          id: "k3",
          cursor_updated_at: "2026-10-19T09:30:01.000003Z",
          document: null,
        }),
      ]);

      const page = await newStore().listPage({
        accountId: ACCOUNT_ID,
        limit: 2,
      });

      expect(page.kitchens.map((kitchen) => kitchen.id)).toEqual(["k1", "k2"]);
      expect(page.nextCursor).toEqual({
        updatedAt: "2026-10-19T09:30:02.000002Z",
        id: "k2",
      });
      expect(page.total).toBe(3);
    });

    it("skips a kitchen whose document cannot be read, counts it, and still moves the cursor past it", async () => {
      resetQueryDriver();
      answerQueryWith([
        pageRow({ total: 3, id: "k1" }),
        pageRow({
          total: 3,
          id: "k2",
          cursor_updated_at: "2026-10-19T09:30:02.000002Z",
          document: { not: "a design" },
        }),
        pageRow({ total: 3, id: "k3", document: null }),
      ]);

      const page = await newStore().listPage({
        accountId: ACCOUNT_ID,
        limit: 2,
      });

      expect(page.kitchens.map((kitchen) => kitchen.id)).toEqual(["k1"]);
      expect(page.skippedCount).toBe(1);
      expect(page.total).toBe(3);
      expect(page.nextCursor).toEqual({
        updatedAt: "2026-10-19T09:30:02.000002Z",
        id: "k2",
      });
      expect(JSON.stringify(page)).not.toContain("a design");
    });

    it("reports a total for an account with no kitchens", async () => {
      resetQueryDriver();
      answerQueryWith([NO_KITCHEN_ROW]);

      expect(
        await newStore().listPage({ accountId: ACCOUNT_ID, limit: 12 }),
      ).toEqual({
        kitchens: [],
        nextCursor: null,
        total: 0,
        skippedCount: 0,
      });
    });

    it.each([
      ["no row at all", []],
      ["a total that is not a count", [pageRow({ total: -1 })]],
      ["a total that is text", [pageRow({ total: "1" })]],
      ["a name that is a number", [pageRow({ name: 5 })]],
      ["a sent flag that is text", [pageRow({ is_sent: "t" })]],
      [
        "an instant that is not a cursor instant",
        [pageRow({ cursor_updated_at: "2026-02-31T00:00:00.000000Z" })],
      ],
      [
        "a kitchen row mixed with an empty one",
        [pageRow({ total: 2 }), { total: 2, id: null }],
      ],
      ["a reply that is not rows", "ok"],
    ])("is the store error for %s", async (_label, reply) => {
      resetQueryDriver();
      answerQueryWith(reply);

      const failure = await rejectionOf(
        newStore().listPage({ accountId: ACCOUNT_ID, limit: 12 }),
      );

      expect(failure).toBeInstanceOf(AccountKitchenStoreError);
      expect((failure as AccountKitchenStoreError).operation).toBe(
        "list kitchens",
      );
    });

    it("reads an export row with its hidden flag, and a document that cannot be read as null, never dropping the row", async () => {
      resetQueryDriver();
      answerQueryWith([
        { ...PAGE_ROW, total: 2, is_hidden: true },
        {
          ...PAGE_ROW,
          total: 2,
          id: "k2",
          is_hidden: false,
          document: { not: "a design" },
        },
      ]);

      const exported = await newStore().exportAll(ACCOUNT_ID);

      expect(
        exported.kind === "exported"
          ? exported.kitchens.map((kitchen) => [
              kitchen.id,
              kitchen.isHidden,
              kitchen.design === null,
            ])
          : [],
      ).toEqual([
        ["k1", true, false],
        ["k2", false, true],
      ]);
    });

    it("refuses an export over the bound whole, and one whose row count differs from its total is the store error", async () => {
      resetQueryDriver();
      answerQueryWith([{ total: MAX_EXPORTED_KITCHENS + 1, id: null }]);
      expect(await newStore().exportAll(ACCOUNT_ID)).toEqual({
        kind: "too-many",
      });

      resetQueryDriver();
      answerQueryWith([{ ...PAGE_ROW, total: 2, is_hidden: false }]);
      const failure = await rejectionOf(newStore().exportAll(ACCOUNT_ID));
      expect(failure).toBeInstanceOf(AccountKitchenStoreError);
    });

    it("answers the export size from the count alone, at the bound and one past it", async () => {
      resetQueryDriver();
      answerQueryWith([{ total: MAX_EXPORTED_KITCHENS }]);
      expect(await newStore().measureExport(ACCOUNT_ID)).toEqual({
        kind: "within-bound",
      });

      resetQueryDriver();
      answerQueryWith([{ total: MAX_EXPORTED_KITCHENS + 1 }]);
      expect(await newStore().measureExport(ACCOUNT_ID)).toEqual({
        kind: "too-many",
      });
    });

    it("answers rename and duplicate by whether the statement returned a row", async () => {
      resetQueryDriver();
      answerQueryWith([]);
      expect(
        await newStore().rename({
          accountId: ACCOUNT_ID,
          designId: DESIGN_ID,
          name: "Nou",
        }),
      ).toEqual({ kind: "none" });

      resetQueryDriver();
      answerQueryWith([{ id: DESIGN_ID }]);
      expect(
        await newStore().rename({
          accountId: ACCOUNT_ID,
          designId: DESIGN_ID,
          name: "Nou",
        }),
      ).toEqual({ kind: "renamed" });
    });
  });

  describe("what hide and delete make of the mark statement's report", () => {
    const hide = () =>
      newStore().hide({ accountId: ACCOUNT_ID, designId: DESIGN_ID });
    const markDeleted = () =>
      newStore().markDeleted({ accountId: ACCOUNT_ID, designId: DESIGN_ID });
    const report = (
      isMarked: boolean,
      isSent: boolean | null,
      isAlreadyMarked = false,
    ) => [
      {
        is_marked: isMarked,
        is_sent: isSent,
        is_already_marked: isAlreadyMarked,
      },
    ];

    it.each([
      ["marked", report(true, true), { kind: "hidden" }],
      [
        "a repeat after a lost acknowledgement (already marked)",
        report(false, null, true),
        { kind: "hidden" },
      ],
      [
        "an unsent kitchen of the account",
        report(false, false),
        { kind: "not-sent" },
      ],
      [
        "no listed kitchen under the account",
        report(false, null),
        { kind: "none" },
      ],
    ])("hide: %s", async (_label, reply, expected) => {
      resetQueryDriver();
      answerQueryWith(reply);

      expect(await hide()).toEqual(expected);
    });

    it.each([
      ["marked", report(true, false), { kind: "deleted" }],
      [
        "a repeat after a lost acknowledgement (already marked)",
        report(false, null, true),
        { kind: "deleted" },
      ],
      ["a sent kitchen of the account", report(false, true), { kind: "sent" }],
      [
        "no listed kitchen under the account",
        report(false, null),
        { kind: "none" },
      ],
    ])("delete: %s", async (_label, reply, expected) => {
      resetQueryDriver();
      answerQueryWith(reply);

      expect(await markDeleted()).toEqual(expected);
    });

    it("a kitchen the statement did not mark although it is in the state the mark accepts is the store error, not a guess", async () => {
      resetQueryDriver();
      answerQueryWith(report(false, true));
      expect(await rejectionOf(hide())).toBeInstanceOf(
        AccountKitchenStoreError,
      );

      resetQueryDriver();
      answerQueryWith(report(false, false));
      expect(await rejectionOf(markDeleted())).toBeInstanceOf(
        AccountKitchenStoreError,
      );
    });

    it.each([
      ["no row", []],
      ["two rows", [...report(true, true), ...report(true, true)]],
      [
        "a flag that is text",
        [{ is_marked: "t", is_sent: true, is_already_marked: false }],
      ],
      [
        "a sent state that is text",
        [{ is_marked: true, is_sent: "t", is_already_marked: false }],
      ],
      ["a missing flag", [{ is_marked: true, is_sent: true }]],
    ])("a report with %s is the store error", async (_label, reply) => {
      resetQueryDriver();
      answerQueryWith(reply);

      const failure = await rejectionOf(hide());

      expect(failure).toBeInstanceOf(AccountKitchenStoreError);
      expect((failure as AccountKitchenStoreError).operation).toBe(
        "hide a kitchen",
      );
    });
  });

  describe("the refusals the store makes before it sends anything", () => {
    it.each([
      [
        "a page size of 0",
        () => newStore().listPage({ accountId: ACCOUNT_ID, limit: 0 }),
      ],
      [
        "an account id of the wrong shape",
        () => newStore().countListed("short"),
      ],
      [
        "a rename to an empty name",
        () =>
          newStore().rename({
            accountId: ACCOUNT_ID,
            designId: DESIGN_ID,
            name: "",
          }),
      ],
      [
        "a duplicate with a newline in the name",
        () =>
          newStore().duplicate({
            accountId: ACCOUNT_ID,
            designId: DESIGN_ID,
            name: "a\nb",
          }),
      ],
      [
        "a hide for a wrong account id",
        () => newStore().hide({ accountId: "x", designId: DESIGN_ID }),
      ],
      [
        "a delete for a wrong account id",
        () => newStore().markDeleted({ accountId: "x", designId: DESIGN_ID }),
      ],
      ["an export for a wrong account id", () => newStore().exportAll("x")],
      ["a measure for a wrong account id", () => newStore().measureExport("x")],
    ])("%s sends no statement", async (_label, call) => {
      resetQueryDriver();

      await expect(call()).rejects.toThrow();

      expect(everySentQuery()).toEqual([]);
    });
  });

  describe("a driver failure leaves as the store error, holding no data of the request", () => {
    it.each([
      [
        "a lone read",
        () => newStore().countListed(ACCOUNT_ID),
        "count kitchens",
      ],
      [
        "a rename",
        () =>
          newStore().rename({
            accountId: ACCOUNT_ID,
            designId: DESIGN_ID,
            name: "Numele-secret",
          }),
        "rename a kitchen",
      ],
      [
        "a hide",
        () => newStore().hide({ accountId: ACCOUNT_ID, designId: DESIGN_ID }),
        "hide a kitchen",
      ],
      [
        "a delete",
        () =>
          newStore().markDeleted({
            accountId: ACCOUNT_ID,
            designId: DESIGN_ID,
          }),
        "delete a kitchen",
      ],
      [
        "a sent mark",
        () =>
          new NeonSentMarkStore(WELL_FORMED_UNREACHABLE_VALUE).markSent(
            DESIGN_ID,
          ),
        "mark a kitchen sent",
      ],
    ])("%s", async (_label, call, operation) => {
      resetQueryDriver();
      failQueryWith(
        new Error(`driver said: ${ACCOUNT_ID} ${DESIGN_ID} Numele-secret`),
      );

      const failure = await rejectionOf(call());

      expect(failure).toBeInstanceOf(AccountKitchenStoreError);
      expect((failure as AccountKitchenStoreError).operation).toBe(operation);
      expect((failure as Error).message).not.toContain("Numele-secret");
      expect((failure as Error).message).not.toContain(ACCOUNT_ID);
      expect(JSON.stringify((failure as Error).cause ?? "")).not.toContain(
        "Numele-secret",
      );
    });
  });
});
