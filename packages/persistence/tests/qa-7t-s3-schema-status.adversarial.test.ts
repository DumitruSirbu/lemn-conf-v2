import { describe, expect, it } from "vitest";

import { readMigrationFiles } from "../src/migration-files.js";
import type { AppliedMigration } from "../src/migration-plan.js";
import type { MigrationFile } from "../src/migration-files.js";
import {
  REQUIRED_DESIGN_COLUMNS,
  describeDeployedSchemaStatus,
  isDeployedSchemaLevel,
} from "../src/migration-status.js";
import type {
  DeployedColumnReading,
  DeployedSchemaReading,
  MigrationStatusOutcome,
} from "../src/migration-status.js";
import { synthesisedNextMigrationFile } from "./support/synthesised-migration-file.js";

/**
 * Adversarial QA of M7 wave 7T slice S3 — the verdict behind
 * `tests/test-database-schema-status.test.ts` (criterion 16).
 *
 * **Why these are readings rather than a live database.** The live test asserts one verdict about
 * one database that is level; it cannot show *which* departures from level it would catch without
 * making the shared test database not level. So the departures are put to the same function the
 * live test calls, over a reading built from the migration files actually on disk. The live half —
 * that `readDeployedSchema` really reports these facts — was measured separately against
 * `lemn-conf-v2-staging` and is in the QA report, not here.
 *
 * This file names no database URL source and imports no connecting module: it is deliberately
 * outside the census's population, like the other pure suites in this directory.
 */

const LEVEL = "level";

describe("QA 7T S3: what the schema-level verdict catches", () => {
  it("calls a database level when its ledger matches the files and its columns match the requirement", () => {
    expect(
      describeDeployedSchemaStatus(readMigrationFiles(), levelReading()),
    ).toMatchObject({ outcome: LEVEL });
  });

  it("reports a file on disk that the ledger has never recorded as behind, naming it", () => {
    const files = readMigrationFiles();
    const withoutTheLast = {
      ...levelReading(),
      ledger: {
        kind: "present" as const,
        applied: appliedFrom(files.slice(0, -1)),
      },
    };

    const report = describeDeployedSchemaStatus(files, withoutTheLast);

    expect(report.outcome).toBe("behind");
    expect(report.detail).toContain(files.at(-1)?.fileName ?? "");
  });

  it("reports a ledger that has no table at all as outside the ledger", () => {
    const report = describeDeployedSchemaStatus(readMigrationFiles(), {
      ...levelReading(),
      ledger: { kind: "absent" },
    });

    expect(report.outcome).toBe("outside-the-ledger");
  });

  it("reports a recorded version with no file on disk as diverged", () => {
    const files = readMigrationFiles();
    const recordedTooMany = {
      ...levelReading(),
      ledger: {
        kind: "present" as const,
        applied: appliedFrom([...files, oneVersionPast(files)]),
      },
    };

    expect(describeDeployedSchemaStatus(files, recordedTooMany).outcome).toBe(
      "diverged",
    );
  });

  it("reports a ledger row whose checksum no longer matches its file as diverged", () => {
    const files = readMigrationFiles();
    const rewritten = {
      ...levelReading(),
      ledger: {
        kind: "present" as const,
        applied: appliedFrom(files).map((row, index) =>
          index === 0 ? { ...row, checksum: "0".repeat(64) } : row,
        ),
      },
    };

    expect(describeDeployedSchemaStatus(files, rewritten).outcome).toBe(
      "diverged",
    );
  });

  it.each(REQUIRED_DESIGN_COLUMNS.map((column) => column.name))(
    "reports %s under the wrong type as columns-misshapen",
    (name) => {
      const reading = {
        ...levelReading(),
        designColumns: deployedColumns().map((column) =>
          column.name === name
            ? { ...column, dataType: "character varying" }
            : column,
        ),
      };

      expect(
        describeDeployedSchemaStatus(readMigrationFiles(), reading).outcome,
      ).toBe("columns-misshapen");
    },
  );

  it("treats a column the application does not name as no difference at all — the check's stated reach", () => {
    const reading = {
      ...levelReading(),
      designColumns: [
        ...deployedColumns(),
        { name: "qa_extra", dataType: "text", isNullable: true },
      ],
    };

    expect(
      describeDeployedSchemaStatus(readMigrationFiles(), reading).outcome,
    ).toBe(LEVEL);
  });

  it.each<MigrationStatusOutcome>([
    "outside-the-ledger",
    "behind",
    "diverged",
    "columns-missing",
    "columns-misshapen",
  ])("does not call %s deployable", (outcome) => {
    expect(isDeployedSchemaLevel({ outcome, detail: "", readBack: "" })).toBe(
      false,
    );
  });
});

describe("QA 7T S3: the discriminating arm is the path a real extra file takes", () => {
  it("reports the synthesised file as behind, the same outcome an unrecorded real file gives", () => {
    const files = readMigrationFiles();
    const synthesised = describeDeployedSchemaStatus(
      [...files, synthesisedNextMigrationFile(files)],
      levelReading(),
    );
    const realShaped = describeDeployedSchemaStatus(
      [...files, realShapedNextFile(files)],
      levelReading(),
    );

    expect(synthesised.outcome).toBe("behind");
    expect(realShaped.outcome).toBe("behind");
    expect(isDeployedSchemaLevel(synthesised)).toBe(false);
  });

  it("names the synthesised file in the detail, so the arm cannot pass on some other pending file", () => {
    const files = readMigrationFiles();
    const next = synthesisedNextMigrationFile(files);

    const report = describeDeployedSchemaStatus(
      [...files, next],
      levelReading(),
    );

    expect(report.detail).toContain(next.fileName);
    expect(report.detail).toContain("behind by 1 migration");
  });

  it("puts the synthesised version above every real one, so it can never collide with a ledger row", () => {
    const files = readMigrationFiles();

    expect(synthesisedNextMigrationFile(files).version).toBeGreaterThan(
      Math.max(...files.map((file) => file.version)),
    );
  });
});

/** A database that is level: every file on disk recorded, every required column as required. */
function levelReading(): DeployedSchemaReading {
  return {
    ledger: { kind: "present", applied: appliedFrom(readMigrationFiles()) },
    designColumns: deployedColumns(),
    documentSchemaVersions: [1],
  };
}

function deployedColumns(): DeployedColumnReading[] {
  return REQUIRED_DESIGN_COLUMNS.map((column) => ({ ...column }));
}

function appliedFrom(files: readonly MigrationFile[]): AppliedMigration[] {
  return files.map((file) => ({
    version: file.version,
    fileName: file.fileName,
    checksum: file.checksum,
  }));
}

/** The same version carrying a checksum shaped like a real one, to show the arm does not depend on
 *  the synthesised checksum being unlike anything the runner would compute. */
function realShapedNextFile(files: readonly MigrationFile[]): MigrationFile {
  return { ...synthesisedNextMigrationFile(files), checksum: "a".repeat(64) };
}

function oneVersionPast(files: readonly MigrationFile[]): MigrationFile {
  return synthesisedNextMigrationFile(files);
}
