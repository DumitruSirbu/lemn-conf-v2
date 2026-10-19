import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createNeonDesignRowSource } from "../src/design-row-source.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
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
 * What the scheduled backup reads out of `designs`, as the text that leaves for the database, with no database. A
 * restore can only bring back what was exported, so the column list is the contract: the access-control marks of `0015`
 * and `0016` are in it (a restore without them reopens every kitchen a client hid or deleted), and `account_id` and
 * `name` are not (ADR 0172 D10: they wait for the accounts export).
 */
const BACKUP_COLUMNS = [
  "id",
  "schema_version",
  "document",
  "created_at",
  "updated_at",
  "write_token_hash",
  "visitor_hash",
  "sent_at",
  "hidden_by_client_at",
  "deleted_by_client_at",
];
const COLUMNS_ADDED_BY_LOT_2 = [
  "sent_at",
  "hidden_by_client_at",
  "deleted_by_client_at",
];
const COLUMNS_THAT_STAY_OUT = ["account_id", "name"];
const PAGE_SIZE = 7;
const AFTER_ID = "an-id-from-the-previous-page";
const RUNBOOK = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "docs",
  "runbooks",
  "design-db-restore.md",
);

function normalised(statement: SentQuery): string {
  return statement.text.replace(/\s+/g, " ").trim().toLowerCase();
}

function selectedColumnsOf(statement: SentQuery): string[] {
  const text = normalised(statement);
  const listed = text.slice("select ".length, text.indexOf(" from designs"));
  return listed.split(",").map((column) => column.trim());
}

async function firstPageStatement(): Promise<SentQuery> {
  resetQueryDriver();
  answerQueryWith([]);
  await createNeonDesignRowSource(
    WELL_FORMED_UNREACHABLE_VALUE,
  ).fetchDesignPage({ pageSize: PAGE_SIZE });
  return queryDriver.statements[0] ?? { text: "", values: [] };
}

async function laterPageStatement(): Promise<SentQuery> {
  resetQueryDriver();
  answerQueryWith([]);
  await createNeonDesignRowSource(
    WELL_FORMED_UNREACHABLE_VALUE,
  ).fetchDesignPage({
    afterId: AFTER_ID,
    pageSize: PAGE_SIZE,
  });
  return queryDriver.statements[0] ?? { text: "", values: [] };
}

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("the backup row source's statements", () => {
  it("selects exactly the backup columns, on the first page and on every later page", async () => {
    expect(selectedColumnsOf(await firstPageStatement())).toEqual(
      BACKUP_COLUMNS,
    );
    expect(selectedColumnsOf(await laterPageStatement())).toEqual(
      BACKUP_COLUMNS,
    );
  });

  it("adds sent_at, hidden_by_client_at and deleted_by_client_at, so a restore does not reopen a hidden or deleted kitchen", async () => {
    for (const statement of [
      await firstPageStatement(),
      await laterPageStatement(),
    ]) {
      const columns = selectedColumnsOf(statement);
      for (const column of COLUMNS_ADDED_BY_LOT_2)
        expect(columns).toContain(column);
    }
  });

  it("does not export account_id or name, in the select list or anywhere else in the statement", async () => {
    for (const statement of [
      await firstPageStatement(),
      await laterPageStatement(),
    ]) {
      const words = new Set(normalised(statement).match(/[a-z_][a-z0-9_]*/g));
      for (const column of COLUMNS_THAT_STAY_OUT)
        expect(words.has(column)).toBe(false);
    }
  });

  it("names its columns: no star, and nothing computed", async () => {
    for (const statement of [
      await firstPageStatement(),
      await laterPageStatement(),
    ]) {
      expect(statement.text).not.toContain("*");
      expect(normalised(statement)).not.toMatch(/\w\(/);
    }
  });

  it("reads every row, hidden and deleted ones included: no predicate on a mark, no account, no sent state", async () => {
    for (const statement of [
      await firstPageStatement(),
      await laterPageStatement(),
    ]) {
      const text = normalised(statement);
      expect(text).not.toMatch(/\bis (?:not )?null\b/);
      expect(text).not.toContain("account_id");
      expect(text.match(/\bwhere\b/g) ?? []).toHaveLength(
        text.includes("where id > ?") ? 1 : 0,
      );
    }
  });

  it("pages by keyset on id: the first page has no lower bound, a later one starts after the last id", async () => {
    const first = await firstPageStatement();
    const later = await laterPageStatement();

    expect(normalised(first)).toMatch(/ from designs order by id limit \?$/);
    expect(first.values).toEqual([PAGE_SIZE]);
    expect(normalised(later)).toMatch(
      / from designs where id > \? order by id limit \?$/,
    );
    expect(later.values).toEqual([AFTER_ID, PAGE_SIZE]);
  });

  it("reads only the designs table", async () => {
    for (const statement of [
      await firstPageStatement(),
      await laterPageStatement(),
    ]) {
      expect(normalised(statement).match(/\b(?:from|join) ([a-z_]+)/g)).toEqual(
        ["from designs"],
      );
    }
  });

  it("hands the rows back as the database gave them, nulls included", async () => {
    const row = {
      id: "a",
      schema_version: 5,
      document: { any: "thing" },
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
      write_token_hash: null,
      visitor_hash: null,
      sent_at: "2026-01-03T00:00:00.000Z",
      hidden_by_client_at: null,
      deleted_by_client_at: null,
    };
    resetQueryDriver();
    answerQueryWith([row]);

    const page = await createNeonDesignRowSource(
      WELL_FORMED_UNREACHABLE_VALUE,
    ).fetchDesignPage({ pageSize: 1 });

    expect(page).toEqual([row]);
    expect(Object.keys(page[0] ?? {})).toEqual(BACKUP_COLUMNS);
  });
});

/** What is wrong with the restore statement in a copy of the runbook: empty when it restores what the backup exports. */
function problemsInRestoreOf(markdown: string): string[] {
  const restore = /insert into designs \(([^)]*)\)([\s\S]*?)`;/.exec(markdown);
  if (restore === null) return ["no restore statement found"];
  const inserted = (restore[1] ?? "").split(",").map((column) => column.trim());
  const conflictClause = restore[2] ?? "";
  return [
    ...BACKUP_COLUMNS.filter((column) => !inserted.includes(column)).map(
      (column) => `does not insert ${column}`,
    ),
    ...inserted
      .filter((column) => !BACKUP_COLUMNS.includes(column))
      .map((column) => `inserts ${column}, which is not exported`),
    ...COLUMNS_ADDED_BY_LOT_2.filter(
      (column) =>
        !conflictClause.includes(
          `${column} = coalesce(designs.${column}, excluded.${column})`,
        ),
    ).map((column) => `a re-run can overwrite ${column}`),
    ...["write_token_hash", "visitor_hash"]
      .filter(
        (column) => !conflictClause.includes(`${column} = excluded.${column}`),
      )
      .map((column) => `a re-run does not restore ${column}`),
  ];
}

describe("the restore runbook restores every column the backup exports", () => {
  const runbook = readFileSync(RUNBOOK, "utf8");

  it("inserts every backup column and nothing else, and keeps a mark already set on a re-run", () => {
    expect(problemsInRestoreOf(runbook)).toEqual([]);
  });

  describe("and the check can fail", () => {
    it("when a mark is not inserted", () => {
      expect(
        problemsInRestoreOf(
          runbook.replace(
            "sent_at, hidden_by_client_at, deleted_by_client_at)",
            "hidden_by_client_at, deleted_by_client_at)",
          ),
        ),
      ).toContain("does not insert sent_at");
    });

    it("when a re-run overwrites a mark with the dump's value", () => {
      expect(
        problemsInRestoreOf(
          runbook.replace(
            "hidden_by_client_at = coalesce(designs.hidden_by_client_at, excluded.hidden_by_client_at)",
            "hidden_by_client_at = excluded.hidden_by_client_at",
          ),
        ),
      ).toEqual(["a re-run can overwrite hidden_by_client_at"]);
    });

    it("when the restore inserts a column the backup does not export", () => {
      expect(
        problemsInRestoreOf(
          runbook.replace(
            "deleted_by_client_at)\n",
            "deleted_by_client_at, account_id)\n",
          ),
        ),
      ).toContain("inserts account_id, which is not exported");
    });
  });
});
