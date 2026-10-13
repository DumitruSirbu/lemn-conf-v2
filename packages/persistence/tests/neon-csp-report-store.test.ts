import { randomBytes } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { beforeAll, describe, expect, it } from "vitest";

import { CSP_REPORT_CAPACITY } from "../src/csp-report-store.js";
import { runMigrations } from "../src/migrate.js";
import { NeonCspReportStore } from "../src/neon-csp-report-store.js";
import {
  CSP_REPORT_CASES,
  columnsOf,
} from "./support/csp-report-case-table.js";
import type { CspReportColumns } from "./support/csp-report-case-table.js";
import { aBareRow } from "./support/csp-report-fixtures.js";
import { describeCspReportStoreContract } from "./support/csp-report-store-contract.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { holdExclusiveTestSchemaLock } from "./support/test-schema-lock.js";

// Exclusive: the wrap test moves the one shared cursor and the suite asserts a whole-table row count, and neither may
// have another file's writes between its statements.
holdExclusiveTestSchemaLock();

const SUITE_NAME = "NeonCspReportStore (live test database)";

const hasLiveDatabase = isLiveTestDatabaseConfigured;
const testDatabaseUrl = liveTestDatabaseUrl;
if (!hasLiveDatabase) announceSkippedLiveSuite(SUITE_NAME);

const CONCURRENT_WRITES = 20;
const CAPACITY = CSP_REPORT_CAPACITY;
const THIRD_SLOT = 2;

/** Rows this file writes carry marks no deployment and no other run has; the table has no delete for the application
 *  role, so they stay until the guarded test helper removes them by these marks, or the ring overwrites them. */
function newMark(): string {
  return randomBytes(32).toString("hex");
}

const CONTRACT_MARK = newMark();
const RAW_MARK = newMark();
const FOREIGN_MARK = newMark();
const WRAP_MARK = newMark();
const CONCURRENCY_MARK = newMark();

interface StoredRow {
  slot: number;
  report_number: string;
  writer_mark: string;
}

async function storedRowsUnder(mark: string): Promise<StoredRow[]> {
  const rows = await neon(testDatabaseUrl)`
    select slot, report_number, writer_mark from csp_reports where writer_mark = ${mark} order by report_number
  `;
  return rows as StoredRow[];
}

async function rowCount(): Promise<number> {
  const rows = await neon(
    testDatabaseUrl,
  )`select count(*)::int as held from csp_reports`;
  return (rows[0] as { held: number }).held;
}

/** A raw insert, as a writer that is not this store would make it: the table's constraints alone stand in the way.
 *  `on conflict do nothing` leaves a row already in the slot alone, and the constraints are still checked first. */
function insertRaw(columns: CspReportColumns): Promise<unknown> {
  return neon(testDatabaseUrl)`
    insert into csp_reports (
      slot, report_number, received_at, writer_mark, directive, blocked, source,
      line_number, column_number, page, locale, origin, disposition, status_code
    ) values (
      ${columns.slot}, ${columns.report_number}, now(), ${columns.writer_mark}, ${columns.directive},
      ${columns.blocked}, ${columns.source}, ${columns.line_number}, ${columns.column_number}, ${columns.page},
      ${columns.locale}, ${columns.origin}, ${columns.disposition}, ${columns.status_code}
    ) on conflict (slot) do nothing
  `;
}

/** A row of another writer in the third slot, put there whether or not an earlier run left one: only its mark is set. */
function placeForeignRow(): Promise<unknown> {
  const { slot, report_number: reportNumber } = columnsOf({
    slot: THIRD_SLOT,
    report_number: THIRD_SLOT,
  });
  return neon(testDatabaseUrl)`
    insert into csp_reports (
      slot, report_number, received_at, writer_mark, directive, blocked, page, locale, origin, disposition
    ) values (
      ${slot}, ${reportNumber}, now(), ${FOREIGN_MARK}, 'other', 'inline', 'other', 'none', 'none', 'report'
    ) on conflict (slot) do update set writer_mark = excluded.writer_mark
  `;
}

/** Moves the cursor forward, never back, to the next number that leaves the following writes at slots N - 1, 0, 1. */
async function moveCursorToTwoBeforeTheWrap(): Promise<number> {
  const rows = await neon(testDatabaseUrl)`
    update csp_report_cursor
    set last_number = last_number + (((${CAPACITY}::bigint - 2 - last_number % ${CAPACITY}::bigint) % ${CAPACITY}::bigint)
      + ${CAPACITY}::bigint) % ${CAPACITY}::bigint
    where singleton
    returning last_number
  `;
  return Number((rows[0] as { last_number: string }).last_number);
}

describe.skipIf(!hasLiveDatabase)(SUITE_NAME, () => {
  beforeAll(async () => {
    await runMigrations(testDatabaseUrl);
  });

  describeCspReportStoreContract({
    createStore: () => new NeonCspReportStore(testDatabaseUrl),
    mark: CONTRACT_MARK,
  });

  describe("the table's own constraints, for a writer that is not this store (criterion 3)", () => {
    it.each(CSP_REPORT_CASES.filter(({ isAccepted }) => !isAccepted))(
      "refuses $label, naming one of its constraints",
      async ({ overrides, constraints }) => {
        await expect(
          insertRaw(columnsOf({ writer_mark: RAW_MARK, ...overrides })),
        ).rejects.toThrow(new RegExp(constraints.join("|")));
      },
    );

    it.each(CSP_REPORT_CASES.filter(({ isAccepted }) => isAccepted))(
      "accepts $label",
      async ({ overrides }) => {
        await expect(
          insertRaw(columnsOf({ writer_mark: RAW_MARK, ...overrides })),
        ).resolves.toBeDefined();
      },
    );
  });

  describe("the ring wraps (criterion 6a)", () => {
    it("writes the next three reports to the last slot, the first and the second, and leaves the third slot alone", async () => {
      await placeForeignRow();
      const store = new NeonCspReportStore(testDatabaseUrl);
      const cursor = await moveCursorToTwoBeforeTheWrap();

      for (let report = 1; report <= 3; report += 1) {
        await store.recordReport({ ...aBareRow(WRAP_MARK) });
      }

      const written = await storedRowsUnder(WRAP_MARK);
      expect(
        written.map((row) => [row.slot, Number(row.report_number)]),
      ).toEqual([
        [CAPACITY - 1, cursor + 1],
        [0, cursor + 2],
        [1, cursor + 3],
      ]);
      expect(await storedRowsUnder(FOREIGN_MARK)).toMatchObject([
        { slot: THIRD_SLOT },
      ]);
      expect(await rowCount()).toBeLessThanOrEqual(CAPACITY);
    });
  });

  describe("under concurrency (criterion 6b)", () => {
    it("gives 20 concurrent writes 20 distinct report numbers in 20 distinct slots, and never more than N rows", async () => {
      const store = new NeonCspReportStore(testDatabaseUrl);

      await Promise.all(
        Array.from({ length: CONCURRENT_WRITES }, () =>
          store.recordReport(aBareRow(CONCURRENCY_MARK)),
        ),
      );

      const written = await storedRowsUnder(CONCURRENCY_MARK);
      expect(new Set(written.map((row) => row.report_number)).size).toBe(
        CONCURRENT_WRITES,
      );
      expect(new Set(written.map((row) => row.slot)).size).toBe(
        CONCURRENT_WRITES,
      );
      expect(await rowCount()).toBeLessThanOrEqual(CAPACITY);
    });
  });
});
