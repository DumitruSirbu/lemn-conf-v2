import { InvalidConnectionUrlError } from "./open-database.js";

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

/** The database refused a migration, or the ledger insert that goes with it, or a connection failed. Its `cause`, when
 *  present, is a `ReducedCause` built by `reducedCauseOf`, never the driver's own error. */
export class MigrationExecutionError extends MigrationError {}

/** The declared environment (`migrate`/`migrate:status`'s required argument) and the database
 *  `MIGRATION_DATABASE_URL` actually reaches disagree. Raised by
 *  `assertDeclaredEnvironmentReaches` before either CLI opens a connection or reads anything, so the
 *  incident this guards against (`docs/milestones/migration-environment-safety-check.md`) cannot
 *  repeat one careless argument away. */
export class MigrationTargetMismatchError extends MigrationError {}

/** Errors whose message names no credential by construction, so a CLI may print it. Anything else prints as its type. */
export function isPrintableFailure(error: unknown): error is Error {
  return (
    error instanceof MigrationError ||
    error instanceof InvalidConnectionUrlError
  );
}

/** The same clamp `BackupStageError` applies to a third party's `name`, which is free text. */
const ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const UNKNOWN_ERROR_NAME = "UnknownError";

/** A SQLSTATE (five of 0-9 and A-Z) or a Node error code (`ENOTFOUND`, `ERR_INVALID_URL`). */
const ERROR_CODE_PATTERN = /^(?:[0-9A-Z]{5}|[A-Z][A-Z0-9_]{1,63})$/;

/** All a kept cause carries: no message, stack, property or object a driver or Node produced. */
export interface ReducedCause {
  readonly name: string;
  readonly code?: string;
}

/**
 * `{ cause }` for a `MigrationExecutionError`, built fresh from the two fields of `error` that cannot carry a
 * credential: its type name and its `code`, each only when it has a safe shape. The failure's message is never kept,
 * since a driver echoes its input, so the underlying SQLSTATE stays reachable and nothing else does.
 */
export function reducedCauseOf(error: unknown): ErrorOptions {
  const code = safeCodeOf(error);
  const cause: ReducedCause = {
    name: describeErrorType(error),
    ...(code === undefined ? {} : { code }),
  };
  return { cause };
}

/** The type name of a thrown value, clamped: `typeof` for anything that is not an `Error`, and `UnknownError` when the
 *  name is not a short identifier. Safe to print. */
export function describeErrorType(error: unknown): string {
  const name =
    error instanceof Error ? readQuietly(error, "name") : typeof error;
  return typeof name === "string" && ERROR_NAME_PATTERN.test(name)
    ? name
    : UNKNOWN_ERROR_NAME;
}

function safeCodeOf(error: unknown): string | undefined {
  const code = readQuietly(error, "code");
  return typeof code === "string" && ERROR_CODE_PATTERN.test(code)
    ? code
    : undefined;
}

function readQuietly(value: unknown, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}
