import { randomBytes } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CSP_REPORT_CAPACITY } from "../src/csp-report-store.js";
import { deleteCspReportsForTests } from "../src/delete-csp-reports-for-tests.js";
import { runMigrations } from "../src/migrate.js";
import { NeonCspReportStore } from "../src/neon-csp-report-store.js";
import {
  CSP_REPORT_CASES,
  columnsOf,
} from "./support/csp-report-case-table.js";
import type { CspReportColumns } from "./support/csp-report-case-table.js";
import { aBareRow, aFullRow } from "./support/csp-report-fixtures.js";
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
 *  role, so they stay until the guarded test helper removes them by these marks (below), or the ring overwrites them. */
function newMark(): string {
  return randomBytes(32).toString("hex");
}

const CONTRACT_MARK = newMark();
const RAW_MARK = newMark();
const FOREIGN_MARK = newMark();
const WRAP_MARK = newMark();
const CONCURRENCY_MARK = newMark();
const OVERWRITTEN_MARK = newMark();
const OVERWRITING_MARK = newMark();

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

interface StoredColumns extends StoredRow {
  source: string | null;
  line_number: number | null;
  column_number: number | null;
  status_code: number | null;
  page: string;
  origin: string;
}

async function storedColumnsUnder(mark: string): Promise<StoredColumns[]> {
  const rows = await neon(testDatabaseUrl)`
    select slot, report_number, writer_mark, source, line_number, column_number, status_code, page, origin
    from csp_reports where writer_mark = ${mark} order by report_number
  `;
  return rows as StoredColumns[];
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

/** A row of another writer in the third slot: only its mark is set. `do nothing` leaves a row that is already there
 *  untouched, so the guarded cleanup, which removes by this mark, can never remove a row this run did not write. */
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
    ) on conflict (slot) do nothing
  `;
}

/** The contract suite's reports sit in the ring's low slots whenever the cursor is near its start; `do nothing` would
 *  then leave one of them in the third slot instead of the foreign row. Only rows under this run's own marks go. */
function removeThisRunsEarlierRows(): Promise<number> {
  return deleteCspReportsForTests([
    CONTRACT_MARK,
    RAW_MARK,
    CONCURRENCY_MARK,
    OVERWRITTEN_MARK,
    OVERWRITING_MARK,
  ]);
}

/** Moves the cursor forward, never back, so the next report is numbered one lap after the last one written. */
async function moveCursorToTheSlotJustWritten(): Promise<void> {
  await neon(testDatabaseUrl)`
    update csp_report_cursor set last_number = last_number + ${CAPACITY}::bigint - 1 where singleton
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

  afterAll(async () => {
    // The file's own cleanup, through the guarded helper and by the marks it wrote, and by nothing else.
    await deleteCspReportsForTests([
      CONTRACT_MARK,
      RAW_MARK,
      FOREIGN_MARK,
      WRAP_MARK,
      CONCURRENCY_MARK,
      OVERWRITTEN_MARK,
      OVERWRITING_MARK,
    ]);
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
      await removeThisRunsEarlierRows();
      await placeForeignRow();
      expect(await storedRowsUnder(FOREIGN_MARK)).toMatchObject([
        { slot: THIRD_SLOT },
      ]);
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

  describe("an overwrite keeps nothing of the old report (criterion 5)", () => {
    it("reads null in every optional column of a slot whose old report had them all, and the new report's own values", async () => {
      const store = new NeonCspReportStore(testDatabaseUrl);
      await store.recordReport(aFullRow(OVERWRITTEN_MARK));
      const [oldReport] = await storedColumnsUnder(OVERWRITTEN_MARK);
      expect(oldReport).toMatchObject({
        source: "/_next/static/old.js",
        line_number: 11,
        column_number: 22,
        status_code: 200,
      });
      await moveCursorToTheSlotJustWritten();

      await store.recordReport(aBareRow(OVERWRITING_MARK));

      const [newReport] = await storedColumnsUnder(OVERWRITING_MARK);
      expect(await storedColumnsUnder(OVERWRITTEN_MARK)).toEqual([]);
      expect(newReport).toMatchObject({
        slot: oldReport?.slot,
        writer_mark: OVERWRITING_MARK,
        source: null,
        line_number: null,
        column_number: null,
        status_code: null,
        page: "other",
        origin: "none",
      });
      expect(Number(newReport?.report_number)).toBe(
        Number(oldReport?.report_number) + CAPACITY,
      );
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
