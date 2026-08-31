import { describe, expect, it } from "vitest";

import {
  MigrationChecksumMismatchError,
  MigrationSequenceError,
} from "../src/migration-errors.js";
import type { MigrationFile } from "../src/migration-files.js";
import { planPendingMigrations } from "../src/migration-plan.js";
import type { AppliedMigration } from "../src/migration-plan.js";

function migrationFile(
  version: number,
  checksum = `sum-${String(version)}`,
): MigrationFile {
  return {
    version,
    fileName: `000${String(version)}_migration.sql`,
    sql: `select ${String(version)};`,
    checksum,
  };
}

function appliedRow(
  version: number,
  checksum = `sum-${String(version)}`,
): AppliedMigration {
  return { version, fileName: `000${String(version)}_migration.sql`, checksum };
}

const FILES = [migrationFile(1), migrationFile(2), migrationFile(3)];

describe("planPendingMigrations", () => {
  it("plans every migration when the ledger is empty, which is how an existing database is adopted", () => {
    const pending = planPendingMigrations(FILES, []);

    expect(pending.map((file) => file.version)).toEqual([1, 2, 3]);
  });

  it("plans nothing when every migration is already recorded", () => {
    const pending = planPendingMigrations(FILES, [
      appliedRow(1),
      appliedRow(2),
      appliedRow(3),
    ]);

    expect(pending).toEqual([]);
  });

  it("plans only the migrations added since the last run", () => {
    const pending = planPendingMigrations(FILES, [
      appliedRow(1),
      appliedRow(2),
    ]);

    expect(pending.map((file) => file.version)).toEqual([3]);
  });

  it("refuses an applied migration whose file no longer hashes to what was recorded", () => {
    expect(() =>
      planPendingMigrations(FILES, [appliedRow(1, "a-different-checksum")]),
    ).toThrow(MigrationChecksumMismatchError);
  });

  it("names the file and both checksums when it refuses a changed migration", () => {
    expect(() =>
      planPendingMigrations(FILES, [appliedRow(1, "recorded-checksum")]),
    ).toThrow(/0001_migration\.sql.*recorded-checksum.*sum-1/s);
  });

  it("refuses a gap: a later migration applied while an earlier one is not", () => {
    expect(() =>
      planPendingMigrations(FILES, [appliedRow(1), appliedRow(3)]),
    ).toThrow(MigrationSequenceError);
  });

  it("tells an operator on an older checkout that the database is ahead, not that a file was deleted", () => {
    // 0004 shipped and applied; the deployment was rolled back and `migrate` re-run from the older
    // revision, as the restore runbook's drill step instructs. Nobody deleted anything, and a
    // message about deletion sends the operator looking for something that never happened.
    expect(() =>
      planPendingMigrations(FILES, [
        appliedRow(1),
        appliedRow(2),
        appliedRow(3),
        appliedRow(4),
      ]),
    ).toThrow(/this checkout is older than the database/i);
  });

  it("does not blame a deletion when the ledger is merely ahead", () => {
    expect(() =>
      planPendingMigrations(FILES, [
        appliedRow(1),
        appliedRow(2),
        appliedRow(3),
        appliedRow(4),
      ]),
    ).toThrow(/^(?!.*deleted or renamed).*$/s);
  });

  it("still blames a deletion for a genuine hole: a missing file below one that exists", () => {
    // 0003 was deleted from a checkout that still carries 0004. That is the case the message is
    // actually about, and it must keep saying so.
    const filesWithoutTheThird = [
      migrationFile(1),
      migrationFile(2),
      migrationFile(4),
    ];

    expect(() =>
      planPendingMigrations(filesWithoutTheThird, [
        appliedRow(1),
        appliedRow(2),
        appliedRow(3),
        appliedRow(4),
      ]),
    ).toThrow(/deleted or renamed/);
  });

  it("refuses a migration renamed without being edited, which the checksum alone cannot see", () => {
    const renamed: AppliedMigration = {
      version: 1,
      fileName: "0001_migration_under_its_old_name.sql",
      checksum: "sum-1",
    };

    expect(() => planPendingMigrations(FILES, [renamed])).toThrow(
      /must not be renamed/,
    );
  });

  it("refuses a ledger row whose migration file no longer exists", () => {
    // The database holds a schema change whose definition is gone. Neither "applied" nor "pending"
    // describes it, so guessing is the one thing that must not happen.
    expect(() =>
      planPendingMigrations(
        [migrationFile(1), migrationFile(2), migrationFile(4)],
        [appliedRow(1), appliedRow(2), appliedRow(3), appliedRow(4)],
      ),
    ).toThrow(MigrationSequenceError);
  });

  it("checks the checksum of an applied migration even when nothing is pending", () => {
    expect(() =>
      planPendingMigrations(FILES, [
        appliedRow(1),
        appliedRow(2),
        appliedRow(3, "tampered"),
      ]),
    ).toThrow(MigrationChecksumMismatchError);
  });
});
