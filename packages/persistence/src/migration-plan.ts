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
 * The migrations still to run, in order, given what the ledger says has already been applied.
 *
 * Pure on purpose: every refusal this runner can make about *what* to apply is decided here, from
 * two plain lists, so each rule can be tested without a database and without racing one. The
 * database-shaped concerns — the advisory lock, the transaction, the insert — live in `migrate.ts`
 * and decide only *how*.
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
 * A ledger row whose file is missing has two very different causes, and telling the operator the
 * wrong one sends them looking for something that never happened.
 *
 * **This checkout is older than the database.** 0004 shipped and applied; the deployment was rolled
 * back for an unrelated reason; the operator ran `migrate` from the older revision as the restore
 * runbook's drill step instructs. Every file this checkout has *is* in the ledger, and the ledger
 * simply goes further. Nobody deleted anything, so a message about deletion misdirects.
 *
 * **A genuine hole.** A ledger version sits below the highest version on disk with no file to match
 * it — the definition of a schema change that ran has been removed or renamed away.
 *
 * Both are refused. The first is benign as a *state* but not as a *result*: reporting success would
 * tell the operator the database is at the schema this checkout expects, which is precisely what it
 * is not, and this runner cannot know whether the extra migration is compatible with the code being
 * rolled back to. So it stops, and says which of the two it is.
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
 * The checksum hashes the file's bytes, so renaming a migration without editing it changes nothing
 * it can see. The ledger records `file_name` precisely so this is answerable — and until it was
 * compared, the refusal message promised to catch a rename that in fact passed silently.
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
 * A file already applied, sitting after one that is not, means the database skipped a step: it
 * holds the later schema change without the earlier one. Running the earlier migration now would
 * apply it against a shape it was never written for, so this refuses instead.
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

/** Built here so the long refusal message stays out of the guard above. */
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
