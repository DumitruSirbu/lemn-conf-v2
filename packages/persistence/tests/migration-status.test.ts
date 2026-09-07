import { describe, expect, it } from "vitest";

import { readDeclaredEnvironment } from "../src/migrate-status.js";
import type { MigrationFile } from "../src/migration-files.js";
import type { AppliedMigration } from "../src/migration-plan.js";
import {
  REQUIRED_DESIGN_COLUMNS,
  describeDeployedSchemaStatus,
  describeMigrationStatusLine,
  isDeployedSchemaLevel,
} from "../src/migration-status.js";
import type { DeployedSchemaReading } from "../src/migration-status.js";

/**
 * The guard, against fakes and never a database (ADR 0096 decision 3).
 *
 * The first case is production's actual state on 2026-09-07 — a database with no
 * `schema_migrations` table at all — because that is the state that went undetected for seven days
 * and therefore the one the guard most has to name.
 */

function migrationFile(version: number, sql = "select 1"): MigrationFile {
  return {
    version,
    fileName: `${String(version).padStart(4, "0")}_change.sql`,
    sql,
    checksum: `checksum-of-${String(version)}`,
  };
}

function ledgerRowFor(file: MigrationFile): AppliedMigration {
  return {
    version: file.version,
    fileName: file.fileName,
    checksum: file.checksum,
  };
}

/** A database whose columns are complete, so a test about the *ledger* fails for ledger reasons. */
function readingWith(
  ledgerRows: readonly AppliedMigration[],
): DeployedSchemaReading {
  return {
    ledger: { kind: "present", applied: ledgerRows },
    designColumnNames: [...REQUIRED_DESIGN_COLUMNS],
    documentSchemaVersions: [1],
  };
}

const FIRST_FILE = migrationFile(1);
const SECOND_FILE = migrationFile(2);
const THIRD_FILE = migrationFile(3);
const FILES = [FIRST_FILE, SECOND_FILE, THIRD_FILE];
const EVERY_FILE_APPLIED = FILES.map(ledgerRowFor);

describe("describeDeployedSchemaStatus", () => {
  it("names a database with no ledger table as outside the ledger, not as behind", () => {
    const report = describeDeployedSchemaStatus(FILES, {
      ledger: { kind: "absent" },
      designColumnNames: [],
      documentSchemaVersions: [],
    });

    expect(report.outcome).toBe("outside-the-ledger");
    expect(report.detail).toContain("outside the ledger entirely");
    expect(report.detail).toContain("schema_migrations");
    // The distinction is the whole point: the repair is to adopt the database by running every
    // file, not to apply the one migration that looks missing.
    expect(report.detail).not.toContain("behind by");
  });

  it("names the fix command for a database with no ledger table", () => {
    const report = describeDeployedSchemaStatus(FILES, {
      ledger: { kind: "absent" },
      designColumnNames: [],
      documentSchemaVersions: [],
    });

    expect(report.detail).toContain(
      "pnpm --filter @lemnaria/persistence run migrate",
    );
  });

  it("reports level when every file is applied and every column is present", () => {
    const report = describeDeployedSchemaStatus(
      FILES,
      readingWith(EVERY_FILE_APPLIED),
    );

    expect(report.outcome).toBe("level");
    expect(isDeployedSchemaLevel(report)).toBe(true);
  });

  it("reports behind by one, naming the pending file", () => {
    const report = describeDeployedSchemaStatus(
      FILES,
      readingWith([ledgerRowFor(FIRST_FILE), ledgerRowFor(SECOND_FILE)]),
    );

    expect(report.outcome).toBe("behind");
    expect(report.detail).toContain("behind by 1 migration(s)");
    expect(report.detail).toContain("0003_change.sql");
  });

  it("reports behind by several, naming every pending file", () => {
    const report = describeDeployedSchemaStatus(
      FILES,
      readingWith([ledgerRowFor(FIRST_FILE)]),
    );

    expect(report.outcome).toBe("behind");
    expect(report.detail).toContain("behind by 2 migration(s)");
    expect(report.detail).toContain("0002_change.sql");
    expect(report.detail).toContain("0003_change.sql");
  });

  it("reports a changed checksum as diverged rather than as pending work", () => {
    const tampered = [
      ledgerRowFor(FIRST_FILE),
      { ...ledgerRowFor(SECOND_FILE), checksum: "checksum-of-something-else" },
      ledgerRowFor(THIRD_FILE),
    ];

    const report = describeDeployedSchemaStatus(FILES, readingWith(tampered));

    expect(report.outcome).toBe("diverged");
    expect(report.detail).toContain("MigrationChecksumMismatchError");
    expect(report.detail).toContain("has changed since it was applied");
  });

  it("reports a renamed file as diverged", () => {
    const renamed = [
      ledgerRowFor(FIRST_FILE),
      { ...ledgerRowFor(SECOND_FILE), fileName: "0002_change_renamed.sql" },
      ledgerRowFor(THIRD_FILE),
    ];

    const report = describeDeployedSchemaStatus(FILES, readingWith(renamed));

    expect(report.outcome).toBe("diverged");
    expect(report.detail).toContain("must not be renamed");
  });

  it("reports a ledger ahead of the files as diverged, and says the checkout is the old one", () => {
    const ahead = [...EVERY_FILE_APPLIED, ledgerRowFor(migrationFile(4))];

    const report = describeDeployedSchemaStatus(FILES, readingWith(ahead));

    expect(report.outcome).toBe("diverged");
    expect(report.detail).toContain("older than the database");
  });

  it("refuses a complete ledger over a table missing a column the application names", () => {
    const withoutRevision = [...REQUIRED_DESIGN_COLUMNS].filter(
      (column) => column !== "revision",
    );

    const report = describeDeployedSchemaStatus(FILES, {
      ledger: { kind: "present", applied: EVERY_FILE_APPLIED },
      designColumnNames: withoutRevision,
      documentSchemaVersions: [1],
    });

    // ADR 0020 decision 2: a ledger row is evidence about what the runner did, never about the
    // schema. A guard that stopped at the ledger would call this database level.
    expect(report.outcome).toBe("columns-missing");
    expect(report.detail).toContain("revision");
    expect(isDeployedSchemaLevel(report)).toBe(false);
  });

  it("quotes the schema it read on every outcome, including a level one", () => {
    const level = describeDeployedSchemaStatus(
      FILES,
      readingWith(EVERY_FILE_APPLIED),
    );
    const unledgered = describeDeployedSchemaStatus(FILES, {
      ledger: { kind: "absent" },
      designColumnNames: ["id"],
      documentSchemaVersions: [1],
    });

    expect(level.readBack).toContain("ledger [1, 2, 3]");
    expect(level.readBack).toContain("revision");
    expect(level.readBack).toContain("document schema_version(s) [1]");
    expect(unledgered.readBack).toContain(
      "ABSENT (no schema_migrations table)",
    );
  });

  it("treats only level as deployable", () => {
    const outcomes = [
      describeDeployedSchemaStatus(FILES, {
        ledger: { kind: "absent" },
        designColumnNames: [],
        documentSchemaVersions: [],
      }),
      describeDeployedSchemaStatus(FILES, readingWith([])),
    ];

    expect(outcomes.map(isDeployedSchemaLevel)).toEqual([false, false]);
  });
});

describe("describeMigrationStatusLine", () => {
  it("names the declared environment and the database that was actually reached", () => {
    const report = describeDeployedSchemaStatus(
      FILES,
      readingWith(EVERY_FILE_APPLIED),
    );

    const line = describeMigrationStatusLine(report, {
      environment: "production",
      databaseName: "lemn-conf-v2",
    });

    // Both, because the finding behind ADR 0020 was a correct command aimed at the wrong database.
    expect(line).toContain("production");
    expect(line).toContain("lemn-conf-v2");
    expect(line).toContain("read back:");
  });
});

describe("readDeclaredEnvironment", () => {
  it("returns the environment the run declares", () => {
    expect(
      readDeclaredEnvironment(["node", "migrate-status.ts", "preview"]),
    ).toBe("preview");
  });

  it("refuses to guess when no environment is named", () => {
    // ADR 0096 finding 4: a check whose subject depends on the executing machine's environment is
    // a coincidence with a test name.
    expect(() =>
      readDeclaredEnvironment(["node", "migrate-status.ts"]),
    ).toThrow(/needs the name of the environment/);
  });
});
