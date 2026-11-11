import { neon } from "@neondatabase/serverless";
import { beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../src/migrate.js";
import { createNeonPriceDashboardRowSource } from "../src/price-dashboard-row-source.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import {
  CHANGE_COLUMNS,
  DEFAULTS_COLUMNS,
  HEAD_COLUMNS,
  VERSION_COLUMNS,
} from "./support/price-dashboard-export-columns.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file only reads, and needs the schema intact.
holdSharedTestSchemaLock();

const SUITE_NAME = "createNeonPriceDashboardRowSource (live test database)";

const hasLiveDatabase = isLiveTestDatabaseConfigured;
const testDatabaseUrl = liveTestDatabaseUrl;
if (!hasLiveDatabase) announceSkippedLiveSuite(SUITE_NAME);

const PAGE_SIZE = 5;

/** The singleton tables' key: `check (singleton)` makes it `true` in the one row, so it carries nothing to restore. */
const CONSTANT_KEY_COLUMN = "singleton";

/** The export's column list against the deployed table: a column a later migration adds must be added to the export
 *  too, or a restore silently loses it. */
async function deployedColumnsOf(tableName: string): Promise<string[]> {
  const rows = await neon(testDatabaseUrl)`
    select column_name from information_schema.columns
    where table_schema = current_schema() and table_name = ${tableName}
  `;
  return rows
    .map((row) => String(row["column_name"]))
    .filter((column) => column !== CONSTANT_KEY_COLUMN)
    .sort();
}

describe.skipIf(!hasLiveDatabase)(SUITE_NAME, () => {
  beforeAll(async () => {
    await runMigrations(testDatabaseUrl);
  });

  it.each([
    ["price_book_versions", VERSION_COLUMNS],
    ["catalogue_availability_changes", CHANGE_COLUMNS],
    ["catalogue_availability_head", HEAD_COLUMNS],
    ["kitchen_defaults", DEFAULTS_COLUMNS],
  ])(
    "the export of %s carries every deployed column but the constant singleton key, and no other",
    async (tableName, exportedColumns) => {
      expect([...exportedColumns].sort()).toEqual(
        await deployedColumnsOf(tableName),
      );
    },
  );

  it("reads the first page of versions, newest last, with the columns the statement names", async () => {
    const rows = await createNeonPriceDashboardRowSource(
      testDatabaseUrl,
    ).fetchVersionPage({ pageSize: PAGE_SIZE });

    expect(rows.length).toBeLessThanOrEqual(PAGE_SIZE);
    const sequenceNumbers = rows.map((row) => BigInt(row.sequence_number));
    expect(sequenceNumbers).toEqual(
      [...sequenceNumbers].sort((left, right) => Number(left - right)),
    );
    for (const row of rows)
      expect(Object.keys(row).sort()).toEqual([...VERSION_COLUMNS].sort());
  });

  it("reads the first page of the availability log with the columns the statement names", async () => {
    const rows = await createNeonPriceDashboardRowSource(
      testDatabaseUrl,
    ).fetchAvailabilityChangePage({ pageSize: PAGE_SIZE });

    expect(rows.length).toBeLessThanOrEqual(PAGE_SIZE);
    for (const row of rows)
      expect(Object.keys(row).sort()).toEqual([...CHANGE_COLUMNS].sort());
  });

  it("reads the availability head and the defaults, each exactly one row with its columns", async () => {
    const source = createNeonPriceDashboardRowSource(testDatabaseUrl);

    const head = await source.fetchAvailabilityHead();
    const defaults = await source.fetchKitchenDefaults();

    expect(Object.keys(head).sort()).toEqual([...HEAD_COLUMNS].sort());
    expect(Object.keys(defaults).sort()).toEqual([...DEFAULTS_COLUMNS].sort());
  });
});

/** Reads the same table with a statement of this test's own, so the source is compared with an oracle it did not write. */
async function oracleKeys(
  statement: "versions" | "log",
  after: string,
  rowCount: number,
): Promise<string[]> {
  const sql = neon(testDatabaseUrl);
  const rows =
    statement === "versions"
      ? await sql`select sequence_number::text as key from price_book_versions
                  where sequence_number > ${after}::bigint order by sequence_number limit ${rowCount}`
      : await sql`select revision::text as key from catalogue_availability_changes
                  where revision > ${after}::bigint order by revision limit ${rowCount}`;
  return rows.map((row) => String(row["key"]));
}

/** The key that leaves exactly `remaining` rows above it: the bound for a walk whose last page ends on the page size. */
async function boundLeaving(
  statement: "versions" | "log",
  remaining: number,
): Promise<string> {
  const sql = neon(testDatabaseUrl);
  const rows =
    statement === "versions"
      ? await sql`select sequence_number::text as key from price_book_versions
                  order by sequence_number desc limit 1 offset ${remaining}`
      : await sql`select revision::text as key from catalogue_availability_changes
                  order by revision desc limit 1 offset ${remaining}`;
  return String(rows[0]?.["key"] ?? "0");
}

const WALK_ROWS = 24;
const TEXT_ORDER_TRANSITION_BOUNDS = ["0", "7", "98", "998"];

describe.skipIf(!hasLiveDatabase)(
  `${SUITE_NAME}: adversarial walks against an independent read`,
  () => {
    it.each(TEXT_ORDER_TRANSITION_BOUNDS)(
      "reads versions after %s in numeric order, the same keys as an oracle that casts to bigint",
      async (bound) => {
        const page = await createNeonPriceDashboardRowSource(
          testDatabaseUrl,
        ).fetchVersionPage({ afterSequenceNumber: bound, pageSize: WALK_ROWS });
        const keys = page.map((row) => row.sequence_number);

        expect(keys).toEqual(await oracleKeys("versions", bound, WALK_ROWS));
        expect(keys.map(BigInt)).toEqual(
          [...keys.map(BigInt)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
        );
        for (const key of keys)
          expect(BigInt(key)).toBeGreaterThan(BigInt(bound));
      },
    );

    it.each(TEXT_ORDER_TRANSITION_BOUNDS)(
      "reads the availability log after %s in numeric order, the same keys as the oracle",
      async (bound) => {
        const page = await createNeonPriceDashboardRowSource(
          testDatabaseUrl,
        ).fetchAvailabilityChangePage({
          afterRevision: bound,
          pageSize: WALK_ROWS,
        });

        expect(page.map((row) => row.revision)).toEqual(
          await oracleKeys("log", bound, WALK_ROWS),
        );
      },
    );

    it.each([1, 3, 7])(
      "walks the first %i-row pages of versions into the oracle's first rows: none repeated, none skipped at a page join",
      async (pageSize) => {
        const source = createNeonPriceDashboardRowSource(testDatabaseUrl);
        const keys: string[] = [];
        let after: string | undefined;
        while (keys.length < WALK_ROWS) {
          const page = await source.fetchVersionPage({
            ...(after === undefined ? {} : { afterSequenceNumber: after }),
            pageSize,
          });
          keys.push(...page.map((row) => row.sequence_number));
          after = page.at(-1)?.sequence_number;
          if (after === undefined) break;
        }

        expect(keys.slice(0, WALK_ROWS)).toEqual(
          await oracleKeys("versions", "0", WALK_ROWS),
        );
      },
    );

    it.each([
      ["versions", 5, 2],
      ["versions", 5, 5],
      ["versions", 5, 6],
      ["log", 5, 2],
      ["log", 5, 5],
      ["log", 5, 6],
    ] as const)(
      "%s: with %i rows above the bound and page size %i, the second page holds the rows the first left, none when it left none",
      async (statement, remaining, pageSize) => {
        const source = createNeonPriceDashboardRowSource(testDatabaseUrl);
        const bound = await boundLeaving(statement, remaining);
        const read = async (after: string) =>
          statement === "versions"
            ? (
                await source.fetchVersionPage({
                  afterSequenceNumber: after,
                  pageSize,
                })
              ).map((row) => row.sequence_number)
            : (
                await source.fetchAvailabilityChangePage({
                  afterRevision: after,
                  pageSize,
                })
              ).map((row) => row.revision);

        const first = await read(bound);
        const second = await read(first.at(-1) ?? bound);

        expect(first).toEqual(await oracleKeys(statement, bound, pageSize));
        expect(first).toHaveLength(Math.min(remaining, pageSize));
        expect(second).toHaveLength(
          Math.min(Math.max(remaining - pageSize, 0), pageSize),
        );
      },
    );

    it("returns every bigint as the decimal text of its digits, never as a number", async () => {
      const source = createNeonPriceDashboardRowSource(testDatabaseUrl);
      const [version] = await source.fetchVersionPage({ pageSize: 1 });
      const [change] = await source.fetchAvailabilityChangePage({
        pageSize: 1,
      });
      const head = await source.fetchAvailabilityHead();
      const defaults = await source.fetchKitchenDefaults();

      for (const digits of [
        version?.sequence_number,
        change?.revision,
        head.revision,
        defaults.revision,
      ])
        expect(digits).toMatch(/^\d+$/);
    });

    it("reads the head's digits as the oracle reads them, one row, whatever the log holds", async () => {
      const head =
        await createNeonPriceDashboardRowSource(
          testDatabaseUrl,
        ).fetchAvailabilityHead();
      const oracle = await neon(testDatabaseUrl)`
        select revision::text as revision from catalogue_availability_head
      `;

      expect([head]).toEqual(oracle);
    });
  },
);
