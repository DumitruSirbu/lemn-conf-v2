import { randomBytes } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { countCspReportsForTests } from "../src/count-csp-reports-for-tests.js";
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

// Shared: this file writes report rows under marks only it makes and needs the schema intact while it does.
holdSharedTestSchemaLock();

const SUITE_NAME = "countCspReportsForTests (live test database)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

const marksWritten: string[] = [];

function newMark(): string {
  const mark = randomBytes(32).toString("hex");
  marksWritten.push(mark);
  return mark;
}

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  /** Opened where used: a skipped suite has no URL, and the driver refuses an empty one even at collection. */
  const sql = () => neon(liveTestDatabaseUrl);

  async function plant(mark: string, reports: number): Promise<void> {
    for (let report = 0; report < reports; report += 1) {
      await new NeonCspReportStore(liveTestDatabaseUrl).recordReport(
        aBareRow(mark),
      );
    }
  }

  beforeAll(async () => {
    await runMigrations(liveTestDatabaseUrl);
  });

  afterAll(async () => {
    // The file's own cleanup, through the guarded helper and by the marks it wrote, and by nothing else.
    await deleteCspReportsForTests(marksWritten);
  });

  it("counts the rows of the marks it is handed and no others, planted beside them", async () => {
    const handed = [newMark(), newMark()];
    const beside = newMark();
    await plant(handed[0] ?? "", 2);
    await plant(handed[1] ?? "", 1);
    await plant(beside, 1);

    expect(await countCspReportsForTests(handed)).toBe(3);
    expect(await countCspReportsForTests([beside])).toBe(1);
    expect(await countCspReportsForTests([...handed, beside])).toBe(4);
  });

  it("counts none for a mark with no row", async () => {
    expect(await countCspReportsForTests([newMark()])).toBe(0);
  });

  it("changes nothing: the rows are the same after it counts them", async () => {
    const mark = newMark();
    await plant(mark, 2);

    await countCspReportsForTests([mark]);
    await countCspReportsForTests([mark]);

    const after = await sql()`
      select slot from csp_reports where writer_mark = ${mark}
    `;
    expect(after).toHaveLength(2);
  });

  it("sends nothing for a mark that is not a digest", async () => {
    await expect(countCspReportsForTests(["%"])).rejects.toThrow(
      /Refusing to count CSP reports/,
    );
  });
});
