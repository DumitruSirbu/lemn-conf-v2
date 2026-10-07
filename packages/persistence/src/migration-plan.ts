import {
  MigrationChecksumMismatchError,
  MigrationSequenceError,
} from "./migration-errors.js";
import type { MigrationFile } from "./migration-files.js";

/** One row of the `schema_migrations` ledger. */
export interface AppliedMigration {
  readonly version: number;
  readonly fileName: string;
  readonly checksum: string;
}

/**
 * The migrations still to run, in order, given what the ledger says was applied. Pure on purpose: every refusal about
 * what to apply is decided here from two plain lists, testable without a database; `migrate.ts` decides only how.
 */
export function planPendingMigrations(
  files: readonly MigrationFile[],
  applied: readonly AppliedMigration[],
): MigrationFile[] {
  assertEveryAppliedMigrationStillHasItsFile(files, applied);

  const appliedByVersion = new Map(applied.map((row) => [row.version, row]));
  const pending: MigrationFile[] = [];

  for (const file of files) {
    const appliedRow = appliedByVersion.get(file.version);
    if (appliedRow === undefined) {
      pending.push(file);
      continue;
    }
    assertFileNameUnchanged(file, appliedRow);
    assertChecksumUnchanged(file, appliedRow);
    assertNothingEarlierIsStillPending(file, pending);
  }

  return pending;
}

/**
 * A ledger row whose file is missing has two causes, and naming the wrong one misdirects the operator. This checkout
 * may be older than the database (the ledger simply goes further; nothing was deleted), or a ledger version below the
 * highest on disk has no file (a migration that ran was removed or renamed). Both are refused: reporting success on the
 * first would claim the database is at the schema this checkout expects, and this runner cannot know the extra
 * migration is compatible with the code being rolled back to.
 */
function assertEveryAppliedMigrationStillHasItsFile(
  files: readonly MigrationFile[],
  applied: readonly AppliedMigration[],
): void {
  const versionsOnDisk = new Set(files.map((file) => file.version));
  const orphans = applied.filter((row) => !versionsOnDisk.has(row.version));
  if (orphans.length === 0) return;

  const highestVersionOnDisk = Math.max(...files.map((file) => file.version));
  const isLedgerMerelyAhead = orphans.every(
    (row) => row.version > highestVersionOnDisk,
  );
  throw isLedgerMerelyAhead
    ? ledgerAheadOfCheckoutError(orphans, highestVersionOnDisk)
    : missingMigrationFileError(orphans);
}

function ledgerAheadOfCheckoutError(
  orphans: readonly AppliedMigration[],
  highestVersionOnDisk: number,
): MigrationSequenceError {
  return new MigrationSequenceError(
    `This checkout is older than the database. It carries migrations up to ` +
      `${String(highestVersionOnDisk)}, and the database has already applied ` +
      `${describeOrphans(orphans)}. Nothing has been deleted and nothing is wrong with the ` +
      `database — this revision simply does not know about the newer migration. Migrate from the ` +
      `revision that matches the database, or roll the database forward deliberately.`,
  );
}

function missingMigrationFileError(
  orphans: readonly AppliedMigration[],
): MigrationSequenceError {
  return new MigrationSequenceError(
    `The database has ${describeOrphans(orphans)} recorded as applied, but no such migration ` +
      `file exists and later migrations do. A migration that ran must not be deleted or renamed — ` +
      `the schema it produced is still there. Restore the file at its original version.`,
  );
}

function describeOrphans(orphans: readonly AppliedMigration[]): string {
  return orphans
    .map((row) => `migration ${String(row.version)} ("${row.fileName}")`)
    .join(", ");
}

/**
 * The checksum hashes the file's bytes, so renaming a migration without editing it changes nothing it can see. The
 * ledger records `file_name` so a rename is caught here.
 */
function assertFileNameUnchanged(
  file: MigrationFile,
  appliedRow: AppliedMigration,
): void {
  if (appliedRow.fileName === file.fileName) return;
  throw new MigrationSequenceError(
    `Migration ${String(file.version)} was applied as "${appliedRow.fileName}" and is now called ` +
      `"${file.fileName}". A migration that ran must not be renamed: the ledger is the record of ` +
      `what this database did, and the two no longer agree on what version ` +
      `${String(file.version)} was. Restore the original name.`,
  );
}

function assertChecksumUnchanged(
  file: MigrationFile,
  appliedRow: AppliedMigration,
): void {
  if (appliedRow.checksum === file.checksum) return;
  throw checksumMismatchError(file, appliedRow);
}

/**
 * A file already applied after one that is not means the database skipped a step; running the earlier migration now
 * would apply it against a shape it was never written for, so this refuses.
 */
function assertNothingEarlierIsStillPending(
  file: MigrationFile,
  pending: readonly MigrationFile[],
): void {
  const earliestPending = pending[0];
  if (earliestPending === undefined) return;
  throw new MigrationSequenceError(
    `Migration ${String(file.version)} ("${file.fileName}") is recorded as applied, but ` +
      `${String(earliestPending.version)} ("${earliestPending.fileName}") is not. The database ` +
      `skipped a migration, so its schema is not one this repository produces. Resolve the gap by ` +
      `hand before migrating again.`,
  );
}

function checksumMismatchError(
  file: MigrationFile,
  appliedRow: AppliedMigration,
): MigrationChecksumMismatchError {
  return new MigrationChecksumMismatchError(
    `Migration "${file.fileName}" has changed since it was applied: the database recorded ` +
      `checksum ${appliedRow.checksum} and the file now hashes to ${file.checksum}. An applied ` +
      `migration is history and must not be edited — the change it describes has already happened, ` +
      `and re-running it is not what an edit asks for. Revert the file and add a new migration.`,
  );
}
