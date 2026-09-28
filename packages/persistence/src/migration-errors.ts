/**
 * The failures a migration run can raise, as this package's own types rather than as whatever the
 * Postgres driver happened to throw.
 *
 * Wrapping matters here for a specific reason: a checksum mismatch and a syntax error are both
 * "migrate failed" to a driver, and an operator reading a deploy log has to be able to tell the
 * two apart without reading the stack. Each subclass below names one refusal, and the runner
 * throws nothing else.
 */
export class MigrationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

/** The migration files on disk, or the ledger rows, are not a contiguous run from 0001. */
export class MigrationSequenceError extends MigrationError {}

/** An already-applied migration file no longer hashes to what the ledger recorded for it. */
export class MigrationChecksumMismatchError extends MigrationError {}

/** The database refused a migration, or the ledger insert that goes with it. Carries the driver's
 *  error as `cause` so the underlying SQLSTATE is still reachable, without it being what callers
 *  have to catch. */
export class MigrationExecutionError extends MigrationError {}

/** The declared environment (`migrate`/`migrate:status`'s required argument) and the database
 *  `MIGRATION_DATABASE_URL` actually reaches disagree. Raised by
 *  `assertDeclaredEnvironmentReaches` before either CLI opens a connection or reads anything, so the
 *  incident this guards against (`docs/milestones/migration-environment-safety-check.md`) cannot
 *  repeat one careless argument away. */
export class MigrationTargetMismatchError extends MigrationError {}
