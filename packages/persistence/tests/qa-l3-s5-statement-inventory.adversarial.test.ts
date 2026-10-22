import { beforeEach, describe, expect, it, vi } from "vitest";

import { NeonStaffKitchenActionsStore } from "../src/neon-staff-kitchen-actions-store.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  everySentQuery,
  failQueryWith,
  queryDriver,
  resetQueryDriver,
  type SentQuery,
} from "./support/mocked-neon-query-driver.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * Adversarial QA of the staff kitchen actions store (wave L3-S5), part three: an **inventory of every statement** the
 * three writes send, read as the driver receives them, with no database. The developer's statements test pins the clauses
 * the security reviews made conditions; this file asks the open questions of the whole set instead: which tables it
 * names, which columns of a kitchen it can write (plan K-5), whether any value is written into the text of a statement,
 * whether any instant or personal column is bound or selected, and how many round trips each write costs.
 */
const SESSION = {
  sessionTokenHash: "c".repeat(64),
  idleLifetimeSeconds: {
    client: 2_592_000,
    operator: 43_200,
    administrator: 43_200,
  },
};
const DESIGN_ID = "K".repeat(21);
const NOTE_TEXT = "inventory-note-text";

/** The tables the three writes are meant to name, and no others (plan section 2.3 and the store's header). */
const INTENDED_TABLES = [
  "account_sessions",
  "accounts",
  "design_notes",
  "design_request_states",
  "designs",
  "staff_audit_events",
] as const;

/** Columns that hold a person's contact details, a secret or a document: no statement of these writes selects one. */
const FORBIDDEN_COLUMN_WORDS = [
  "phone",
  "locality",
  "address",
  "postal",
  "password_hash",
  "email_normal_form",
  "write_token_hash",
  "visitor_hash",
  "document",
  "payload",
  "privacy_notice",
];

/** The columns of `designs` the plan's K-5 says no staff path writes. */
const KITCHEN_COLUMNS_NO_STAFF_PATH_WRITES = [
  "document",
  "revision",
  "name",
  "updated_at",
  "account_id",
  "sent_at",
  "deleted_by_client_at",
  "visitor_hash",
  "write_token_hash",
];

const DRIVER_FAILURE = Object.assign(new Error("stop"), {
  name: "NeonDbError",
  code: "57P01",
});

function newStore(): NeonStaffKitchenActionsStore {
  return new NeonStaffKitchenActionsStore(WELL_FORMED_UNREACHABLE_VALUE);
}

function captured(match: RegExpMatchArray): string {
  return firstOf(match.slice(1));
}

function firstOf<Item>(items: readonly Item[]): Item {
  const [item] = items;
  if (item === undefined) throw new Error("expected at least one item");
  return item;
}

function normalised(statement: SentQuery): string {
  return statement.text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** What a status save sends before it fails: the read it decides on (a sent kitchen showing `new`), then the batch. */
async function sendEachWriteOnce(): Promise<void> {
  failQueryWith(DRIVER_FAILURE);
  await newStore()
    .addNote({ session: SESSION, designId: DESIGN_ID, text: NOTE_TEXT })
    .catch(() => undefined);
  failQueryWith(DRIVER_FAILURE);
  await newStore()
    .unhide({ session: SESSION, designId: DESIGN_ID })
    .catch(() => undefined);
  answerQueryWith([
    {
      is_session_live: true,
      is_sent: true,
      stored_status: null,
      changed_by_account_id: null,
      changed_ms: null,
      changed_by_email: null,
      changed_by_name: null,
    },
  ]);
  failQueryWith(DRIVER_FAILURE);
  await newStore()
    .setStatus({
      session: SESSION,
      designId: DESIGN_ID,
      status: "contacted",
      seenStatus: "new",
    })
    .catch(() => undefined);
}

beforeEach(() => {
  resetQueryDriver();
});

function everyStatement(): readonly SentQuery[] {
  return everySentQuery();
}

/** The names a statement gives its own common table expressions, which `from` and `join` may name but are no table. */
function commonTableNamesIn(text: string): Set<string> {
  return new Set(
    [...text.matchAll(/(?:\bwith|,)\s+([a-z_][a-z0-9_]*)\s+as\s*\(/g)].map(
      (match) => captured(match),
    ),
  );
}

/** Table names after `from`, `join`, `into` and `update`, with `extract(... from x)`, `do update set` and the
 *  statement's own common table expressions set aside. */
function tablesNamedBy(text: string): string[] {
  const withoutExtract = text.replace(
    /extract\s*\(\s*epoch\s+from\s+[a-z_.]+\s*\)/g,
    " ",
  );
  const ownNames = commonTableNamesIn(withoutExtract);
  const found = new Set<string>();
  for (const match of withoutExtract.matchAll(
    /\b(?:from|join|into|update)\s+([a-z_][a-z0-9_]*)/g,
  )) {
    const word = captured(match);
    if (!ownNames.has(word) && word !== "set") found.add(word);
  }
  return [...found];
}

describe("the statements the three writes send", () => {
  it("are an audit insert and the write in one batch for a note and for an unhide, and a plain read then that batch for a status", async () => {
    await sendEachWriteOnce();

    expect(
      queryDriver.transactions.map(({ statements }) => statements.length),
    ).toEqual([2, 2, 2]);
    expect(queryDriver.statements).toHaveLength(1);
    expect(normalised(firstOf(queryDriver.statements))).toMatch(
      /^select exists/,
    );
  });

  it("name only the six tables the writes are meant to touch, and every one of them", async () => {
    await sendEachWriteOnce();

    const named = new Set(
      everyStatement().flatMap((statement) =>
        tablesNamedBy(normalised(statement)),
      ),
    );

    expect([...named].sort()).toEqual([...INTENDED_TABLES]);
  });

  it("write every value as a parameter: the session hash, the id, the status and the note text are bound and are in no statement's text", async () => {
    await sendEachWriteOnce();

    const sent = everyStatement();
    const boundValues = new Set(sent.flatMap((statement) => statement.values));
    for (const value of [
      SESSION.sessionTokenHash,
      DESIGN_ID,
      NOTE_TEXT,
      "contacted",
    ]) {
      expect(boundValues).toContain(value);
      for (const statement of sent) expect(statement.text).not.toContain(value);
    }
  });

  it("bind no instant: changed_at, created_at and occurred_at are the database's own, never a parameter", async () => {
    await sendEachWriteOnce();

    for (const statement of everyStatement()) {
      for (const value of statement.values) {
        expect(value).not.toBeInstanceOf(Date);
        expect(
          typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value),
        ).toBe(false);
      }
      expect(normalised(statement)).not.toMatch(
        /(changed_at|created_at|occurred_at)\s*=\s*\?/,
      );
    }
  });

  it("select no column that holds a contact detail, a secret or a document", async () => {
    await sendEachWriteOnce();

    for (const statement of everyStatement()) {
      const text = normalised(statement);
      for (const word of FORBIDDEN_COLUMN_WORDS)
        expect(text).not.toContain(word);
    }
  });

  it("delete, truncate and drop nothing, and write a kitchen only by clearing hidden_by_client_at (plan K-5)", async () => {
    await sendEachWriteOnce();

    const texts = everyStatement().map(normalised);
    for (const text of texts) {
      expect(text).not.toMatch(/\b(delete|truncate|drop|alter|create)\b/);
      expect(text).not.toMatch(
        /insert into (designs|accounts|account_sessions|design_share_links)\b/,
      );
    }
    const kitchenWrites = texts.filter((text) =>
      /\bupdate designs\b/.test(text),
    );
    expect(kitchenWrites).toHaveLength(1);
    const assignments = /\bupdate designs set (.*?) where\b/.exec(
      firstOf(kitchenWrites),
    );
    expect(assignments?.[1]).toBe("hidden_by_client_at = null");
    for (const column of KITCHEN_COLUMNS_NO_STAFF_PATH_WRITES) {
      expect(kitchenWrites[0]).not.toMatch(
        new RegExp(`set[^;]*\\b${column}\\b[^;]*where`),
      );
    }
  });

  it("touch design_share_links in none of them", async () => {
    await sendEachWriteOnce();

    for (const statement of everyStatement()) {
      expect(normalised(statement)).not.toContain("design_share_links");
    }
  });
});
