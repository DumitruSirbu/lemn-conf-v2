import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createNeonPriceDashboardRowSource } from "../src/price-dashboard-row-source.js";
import {
  CHANGE_COLUMNS,
  DEFAULTS_COLUMNS,
  HEAD_COLUMNS,
  VERSION_COLUMNS,
} from "./support/price-dashboard-export-columns.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  queryDriver,
  resetQueryDriver,
  type SentQuery,
} from "./support/mocked-neon-query-driver.js";
import { orderByNamesOfAnOutputColumn } from "./support/order-by-output-aliases.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

const PAGE_SIZE = 7;
const AFTER_SEQUENCE_NUMBER = "41";
const AFTER_REVISION = "9007199254740993";

interface Statement {
  readonly name: string;
  readonly table: string;
  readonly columns: readonly string[];
  readonly send: () => Promise<unknown>;
}

const source = () =>
  createNeonPriceDashboardRowSource(WELL_FORMED_UNREACHABLE_VALUE);

const FIRST_VERSION_PAGE: Statement = {
  name: "the first page of versions",
  table: "price_book_versions",
  columns: VERSION_COLUMNS,
  send: () => source().fetchVersionPage({ pageSize: PAGE_SIZE }),
};
const LATER_VERSION_PAGE: Statement = {
  name: "a later page of versions",
  table: "price_book_versions",
  columns: VERSION_COLUMNS,
  send: () =>
    source().fetchVersionPage({
      afterSequenceNumber: AFTER_SEQUENCE_NUMBER,
      pageSize: PAGE_SIZE,
    }),
};
const FIRST_CHANGE_PAGE: Statement = {
  name: "the first page of the availability log",
  table: "catalogue_availability_changes",
  columns: CHANGE_COLUMNS,
  send: () => source().fetchAvailabilityChangePage({ pageSize: PAGE_SIZE }),
};
const LATER_CHANGE_PAGE: Statement = {
  name: "a later page of the availability log",
  table: "catalogue_availability_changes",
  columns: CHANGE_COLUMNS,
  send: () =>
    source().fetchAvailabilityChangePage({
      afterRevision: AFTER_REVISION,
      pageSize: PAGE_SIZE,
    }),
};

const PAGED_STATEMENTS: readonly Statement[] = [
  FIRST_VERSION_PAGE,
  LATER_VERSION_PAGE,
  FIRST_CHANGE_PAGE,
  LATER_CHANGE_PAGE,
];

const SINGLE_ROW_STATEMENTS: readonly Statement[] = [
  {
    name: "the availability head",
    table: "catalogue_availability_head",
    columns: HEAD_COLUMNS,
    send: () => source().fetchAvailabilityHead(),
  },
  {
    name: "the kitchen defaults",
    table: "kitchen_defaults",
    columns: DEFAULTS_COLUMNS,
    send: () => source().fetchKitchenDefaults(),
  },
];

const EVERY_STATEMENT = [...PAGED_STATEMENTS, ...SINGLE_ROW_STATEMENTS];

function normalised(statement: SentQuery): string {
  return statement.text.replace(/\s+/g, " ").trim().toLowerCase();
}

function selectedColumnsOf(statement: SentQuery): string[] {
  const text = normalised(statement);
  const listed = text.slice("select ".length, text.indexOf(" from "));
  return listed.split(",").map((item) => {
    const name = item.trim().split(/ as /).at(-1) ?? "";
    return name.replace(/^[a-z]\./, "");
  });
}

async function sentBy(
  statement: Statement,
  reply: unknown = [],
): Promise<SentQuery> {
  resetQueryDriver();
  answerQueryWith(reply);
  await statement.send().catch(() => undefined);
  return queryDriver.statements[0] ?? { text: "", values: [] };
}

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("the price dashboard export's statements", () => {
  it.each(EVERY_STATEMENT)(
    "$name selects exactly the table's columns",
    async (statement) => {
      expect(selectedColumnsOf(await sentBy(statement))).toEqual(
        statement.columns,
      );
    },
  );

  it.each(EVERY_STATEMENT)(
    "$name names its own table and no other: no join, no designs, no contact table",
    async (statement) => {
      const text = normalised(await sentBy(statement));

      expect(text.match(/\b(?:from|join) ([a-z_]+)/g)).toEqual([
        `from ${statement.table}`,
      ]);
      expect(text).not.toMatch(/designs|contact|draft/);
    },
  );

  it.each(EVERY_STATEMENT)(
    "$name names its columns: no star, nothing computed beyond the text of a bigint",
    async (statement) => {
      const sent = await sentBy(statement);
      const withoutBigintText = normalised(sent).replaceAll("::text", "");

      expect(sent.text).not.toContain("*");
      expect(withoutBigintText).not.toMatch(/\w\(/);
    },
  );

  it.each(EVERY_STATEMENT)(
    "$name reads every row: its only predicate is the keyset bound of a later page",
    async (statement) => {
      const text = normalised(await sentBy(statement));

      expect(text).not.toMatch(/\bis (?:not )?null\b/);
      expect(text.match(/\bwhere\b/g) ?? []).toHaveLength(
        text.includes(" > ?") ? 1 : 0,
      );
    },
  );

  it.each(PAGED_STATEMENTS)(
    "$name sorts by the column, never by the text output of the same name",
    async (statement) => {
      const text = normalised(await sentBy(statement));

      expect(orderByNamesOfAnOutputColumn(text)).toEqual([]);
      expect(text).toMatch(/ order by [a-z]\.(?:sequence_number|revision) /);
    },
  );

  it("pages versions by keyset on sequence_number, as a bigint compared with the text of the last one", async () => {
    const firstSent = await sentBy(FIRST_VERSION_PAGE);
    const laterSent = await sentBy(LATER_VERSION_PAGE);

    expect(firstSent.values).toEqual([PAGE_SIZE]);
    expect(laterSent.values).toEqual([AFTER_SEQUENCE_NUMBER, PAGE_SIZE]);
    expect(normalised(laterSent)).toMatch(
      /where v\.sequence_number > \?::bigint order by v\.sequence_number limit \?$/,
    );
  });

  it("pages the availability log by keyset on revision, without losing digits past 2^53", async () => {
    const firstSent = await sentBy(FIRST_CHANGE_PAGE);
    const laterSent = await sentBy(LATER_CHANGE_PAGE);

    expect(firstSent.values).toEqual([PAGE_SIZE]);
    expect(laterSent.values).toEqual([AFTER_REVISION, PAGE_SIZE]);
    expect(normalised(laterSent)).toMatch(
      /where c\.revision > \?::bigint order by c\.revision limit \?$/,
    );
  });

  it("hands the rows back as the database gave them, nulls included", async () => {
    const defaults = {
      revision: "3",
      defaults: { any: "thing" },
      saved_at: "2026-01-01T00:00:00.000Z",
      saved_by_account_id: null,
    };
    resetQueryDriver();
    answerQueryWith([defaults]);

    expect(await source().fetchKitchenDefaults()).toEqual(defaults);
  });

  it.each(SINGLE_ROW_STATEMENTS)(
    "$name fails the export when the singleton row is absent, instead of exporting nothing",
    async (statement) => {
      resetQueryDriver();
      answerQueryWith([]);

      await expect(statement.send()).rejects.toThrow(/found 0 rows/);
    },
  );

  it.each(SINGLE_ROW_STATEMENTS)(
    "$name fails the export when the singleton holds more than one row",
    async (statement) => {
      resetQueryDriver();
      answerQueryWith([{ revision: "1" }, { revision: "2" }]);

      await expect(statement.send()).rejects.toThrow(/found 2 rows/);
    },
  );
});
