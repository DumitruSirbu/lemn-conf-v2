import { beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../src/migrate.js";
import { readDeployedSchema } from "../src/migrate-status.js";
import { readMigrationFiles } from "../src/migration-files.js";
import type { MigrationFile } from "../src/migration-files.js";
import {
  REQUIRED_DESIGN_COLUMNS,
  describeDeployedSchemaStatus,
  describeMigrationStatusLine,
  isDeployedSchemaLevel,
} from "../src/migration-status.js";
import type {
  DeployedSchemaReading,
  MigrationStatusReport,
} from "../src/migration-status.js";
import { databaseNameOf } from "../src/open-database.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { synthesisedNextMigrationFile } from "./support/synthesised-migration-file.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file only reads, but it must not read a schema another run has half mutated
// (M7 wave 7T, T-J5).
holdSharedTestSchemaLock();

/**
 * The migration-state check of M7 wave 7T (criterion 16), as a **live test** rather than a
 * `migrate:status` step in `.github/workflows/ci.yml` — the coordinator's ruling C-7T-1 (b),
 * 2026-09-22.
 *
 * **Why it is a test and not a workflow step.** A workflow step cannot take this package's
 * test-schema lock, so it would read the database while another runner sat inside its
 * forget-a-migration or drop-a-column window and go red for a reason nobody could reproduce. A test
 * holds the shared lock for its whole file, so what it reads is a schema no exclusive holder is
 * rewriting.
 *
 * **It stands beside `deploy.yml`'s gate and never replaces it** (ADR 0020, as amended by ADR 0096:
 * *"A suite-level assertion may stand beside it; it may not be it."*). Nothing here changes that
 * workflow, and this file reaches only the test database.
 *
 * It exercises the same three functions the deploy gate reaches — `readDeployedSchema`,
 * `describeDeployedSchemaStatus` and `isDeployedSchemaLevel` — which until now had no live coverage
 * at all: only the pure verdict was unit tested, against readings built by hand.
 */

const SUITE_NAME = "the test database's schema is level (live test database)";
const DECLARED_ENVIRONMENT = "test";
const REQUIRED_COLUMN_NAMES = REQUIRED_DESIGN_COLUMNS.map(
  (column) => column.name,
);
/** Withheld from the reading by the column arm. `revision` because it is the newest required
 *  column and the one `0004` adds, so a read-back that lost it would look like a database one
 *  migration behind — the confusion the two arms exist to keep apart. */
const WITHHELD_COLUMN = "revision";

const hasLiveDatabase = isLiveTestDatabaseConfigured;
const testDatabaseUrl = liveTestDatabaseUrl;
if (!hasLiveDatabase) announceSkippedLiveSuite(SUITE_NAME);

describe(SUITE_NAME, () => {
  beforeAll(async () => {
    if (hasLiveDatabase) await runMigrations(testDatabaseUrl);
  });

  it.skipIf(!hasLiveDatabase)(
    "is level against the files on disk, and not level missing either a migration or a column",
    async () => {
      const files = readMigrationFiles();
      const reading = await readDeployedSchema(testDatabaseUrl);

      const level = describeDeployedSchemaStatus(files, reading);
      reportStatusLine(level);

      expect(level.outcome).toBe("level");
      expect(isDeployedSchemaLevel(level)).toBe(true);
      // Pins the read-back itself: the verdict above is only evidence if the columns it read are
      // the database's and not a constant the reader could have returned without connecting.
      expect(namesOf(reading.designColumns)).toEqual(
        expect.arrayContaining(REQUIRED_COLUMN_NAMES),
      );

      // Two discriminating arms over that one live reading, because the verdict has two halves and
      // an arm that moves only the ledger leaves the column read-back proving nothing.
      expectBehindTheSynthesisedFile(files, reading);
      expectMissingTheWithheldColumn(files, reading);
    },
  );

  // M7 wave 7E3a, S1: `0005_add_design_visitor_hash.sql`'s column, named on its own rather than
  // only through the generic `arrayContaining` above — the shape the guard needs is `text`
  // nullable, and a read-back that returned the name with the wrong shape would still pass that
  // check while `describeDeployedSchemaStatus` correctly refused it as `columns-misshapen`.
  it.skipIf(!hasLiveDatabase)(
    "reads visitor_hash back as text nullable, the shape 0005 adds",
    async () => {
      const reading = await readDeployedSchema(testDatabaseUrl);

      const visitorHash = reading.designColumns.find(
        (column) => column.name === "visitor_hash",
      );

      expect(visitorHash).toEqual({
        name: "visitor_hash",
        dataType: "text",
        isNullable: true,
      });
    },
  );
});

/** The ledger half: one file on disk the database cannot have applied. */
function expectBehindTheSynthesisedFile(
  files: readonly MigrationFile[],
  reading: DeployedSchemaReading,
): void {
  const neverRun = synthesisedNextMigrationFile(files);
  const report = describeDeployedSchemaStatus([...files, neverRun], reading);

  expect(report.outcome).toBe("behind");
  expect(report.detail).toContain(neverRun.fileName);
  expect(isDeployedSchemaLevel(report)).toBe(false);
}

/** The column half, against the same reading and with no DDL: one required column withheld from
 *  what was read, which is what a regression in the column read-back would look like. */
function expectMissingTheWithheldColumn(
  files: readonly MigrationFile[],
  reading: DeployedSchemaReading,
): void {
  const report = describeDeployedSchemaStatus(files, {
    ...reading,
    designColumns: reading.designColumns.filter(
      (column) => column.name !== WITHHELD_COLUMN,
    ),
  });

  expect(report.outcome).toBe("columns-missing");
  expect(report.detail).toContain(WITHHELD_COLUMN);
  expect(isDeployedSchemaLevel(report)).toBe(false);
}

function namesOf(
  columns: DeployedSchemaReading["designColumns"],
): readonly string[] {
  return columns.map((column) => column.name);
}

/**
 * Prints the operator-facing line criterion 16 asks to be quoted in the wave's close-out, in the
 * form `deploy.yml`'s gate prints it. It is the reason the run is evidence rather than a green tick:
 * the verdict names the database that was actually reached.
 */
function reportStatusLine(report: MigrationStatusReport): void {
  console.info(
    describeMigrationStatusLine(report, {
      environment: DECLARED_ENVIRONMENT,
      databaseName: databaseNameOf(testDatabaseUrl),
    }),
  );
}
