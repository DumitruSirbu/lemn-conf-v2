import { inspect } from "node:util";

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

/** Errors whose message names no credential by construction, so a CLI may print it. Anything else prints as its type. */
export function isPrintableFailure(error: unknown): error is Error {
  return (
    error instanceof MigrationError ||
    error instanceof InvalidConnectionUrlError
  );
}

/**
 * `{ cause: error }` unless `error` shows the connection string, its user, its password or its host anywhere a logger
 * reads: message, stack, any own property at any depth, or `util.inspect`. A cause that does is dropped, not redacted.
 * Any one part is enough, compared without regard to case, and a credential counts as shown as written, decoded or
 * re-encoded. A fragment of a part is not detected.
 */
export function causeUnlessItShowsTheConnection(
  error: unknown,
  connectionUrl: string,
): ErrorOptions {
  const secrets = secretsOf(connectionUrl).map((secret) =>
    secret.toLowerCase(),
  );
  const surfaces = textSurfacesOf(error).map((surface) =>
    surface.toLowerCase(),
  );
  const isShown = secrets.some((secret) =>
    surfaces.some((surface) => surface.includes(secret)),
  );
  return isShown ? {} : { cause: error };
}

function secretsOf(connectionUrl: string): string[] {
  const candidates = [connectionUrl, ...partsOf(connectionUrl)];
  return candidates.filter((candidate) => candidate !== "");
}

const AUTHORITY_PARTS =
  /^[^:]+:\/\/(?<username>[^:@/]*)(?::(?<password>[^@/]*))?@(?<hostname>[^/:?#]*)/;

function partsOf(connectionUrl: string): string[] {
  const {
    username = "",
    password = "",
    hostname = "",
  } = AUTHORITY_PARTS.exec(connectionUrl)?.groups ?? {};
  return [...spellingsOf(username), ...spellingsOf(password), hostname];
}

function spellingsOf(credential: string): string[] {
  const decoded = decodeQuietly(credential);
  return [credential, decoded, encodeURIComponent(decoded)];
}

function decodeQuietly(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function textSurfacesOf(error: unknown): string[] {
  const surfaces = [inspect(error, { depth: null, showHidden: true })];
  collectOwnStrings(error, new Set(), surfaces);
  return surfaces;
}

function collectOwnStrings(
  value: unknown,
  seen: Set<object>,
  into: string[],
): void {
  if (typeof value === "string") into.push(value);
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  for (const key of Object.getOwnPropertyNames(value))
    collectOwnStrings(readOwn(value, key), seen, into);
}

function readOwn(value: object, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}
