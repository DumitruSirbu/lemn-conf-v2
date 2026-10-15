import { randomBytes } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deleteCspReportsForTests } from "../src/delete-csp-reports-for-tests.js";
import { runMigrations } from "../src/migrate.js";
import { NeonCspReportStore } from "../src/neon-csp-report-store.js";
import { aBareRow } from "./support/csp-report-fixtures.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file writes report rows under marks only it makes and needs the schema intact while it does. It moves
// the cursor forward by a handful of reports and asserts on no whole-table figure.
holdSharedTestSchemaLock();

const SUITE_NAME = "deleteCspReportsForTests (live test database)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

const marksWritten: string[] = [];

/** A mark no deployment and no other run has, remembered so the file's own cleanup removes it by the helper alone. */
function newMark(): string {
  const mark = randomBytes(32).toString("hex");
  marksWritten.push(mark);
  return mark;
}

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  /** Opened where used: a skipped suite has no URL, and the driver refuses an empty one even at collection. */
  const sql = () => neon(liveTestDatabaseUrl);
  const store = () => new NeonCspReportStore(liveTestDatabaseUrl);

  /** The slots among `marks` that still hold a row, read with the test database's owner credential. */
  async function slotsHeldUnder(marks: readonly string[]): Promise<number[]> {
    const rows = (await sql()`
      select slot from csp_reports where writer_mark = any(${marks}) order by slot
    `) as { slot: number }[];
    return rows.map((row) => row.slot);
  }

  async function plant(mark: string, reports: number): Promise<void> {
    for (let report = 0; report < reports; report += 1) {
      await store().recordReport(aBareRow(mark));
    }
  }

  beforeAll(async () => {
    await runMigrations(liveTestDatabaseUrl);
  });

  afterAll(async () => {
    // The file's own cleanup, through the guarded helper and by the marks it wrote, and by nothing else.
    await deleteCspReportsForTests(marksWritten);
  });

  it("removes the rows of the mark it is handed, and answers how many went", async () => {
    const handed = newMark();
    await plant(handed, 3);

    const removed = await deleteCspReportsForTests([handed]);

    expect(removed).toBe(3);
    expect(await slotsHeldUnder([handed])).toEqual([]);
  });

  it("leaves every row whose mark it was not handed, planted beside the ones it hands over", async () => {
    const handed = newMark();
    const keptOne = newMark();
    const keptTwo = newMark();
    await plant(handed, 2);
    await plant(keptOne, 1);
    await plant(keptTwo, 2);
    const keptBefore = await slotsHeldUnder([keptOne, keptTwo]);

    const removed = await deleteCspReportsForTests([handed]);

    expect(removed).toBe(2);
    expect(await slotsHeldUnder([handed])).toEqual([]);
    expect(keptBefore).toHaveLength(3);
    expect(await slotsHeldUnder([keptOne, keptTwo])).toEqual(keptBefore);
  });

  it("takes no row whose mark differs by a character, and answers none for a mark with no row", async () => {
    const planted = newMark();
    await plant(planted, 1);
    const neighbour = `${planted.slice(0, -1)}${planted.endsWith("0") ? "1" : "0"}`;
    marksWritten.push(neighbour);

    expect(await deleteCspReportsForTests([neighbour])).toBe(0);
    expect(await slotsHeldUnder([planted])).toHaveLength(1);
  });

  it("removes several marks in one call and sums to the rows that held them", async () => {
    const marks = [newMark(), newMark(), newMark()];
    for (const mark of marks) await plant(mark, 1);

    const removed = await deleteCspReportsForTests(marks);

    expect(removed).toBe(3);
    expect(await slotsHeldUnder(marks)).toEqual([]);
  });

  it("answers none for a mark it already removed, and sends nothing for a mark that is not a digest", async () => {
    const once = newMark();
    const beside = newMark();
    await plant(once, 1);
    await plant(beside, 1);

    expect(await deleteCspReportsForTests([once])).toBe(1);
    expect(await deleteCspReportsForTests([once])).toBe(0);
    await expect(deleteCspReportsForTests(["%"])).rejects.toThrow(
      /Refusing to delete CSP reports/,
    );
    expect(await slotsHeldUnder([beside])).toHaveLength(1);
  });
});
