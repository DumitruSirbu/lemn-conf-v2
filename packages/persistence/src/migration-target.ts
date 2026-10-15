/**
 * Turns ADR 0096 decision 3's "runs against each deployed environment by name" from a printed line into a checked one:
 * `migrate` and `migrate:status` take the environment as a required argument, and this compares it with the database
 * `MIGRATION_DATABASE_URL` reaches. Both CLIs call it before they connect. No I/O; it only refuses and never selects
 * or guesses a database. Without it, `migrate preview` could apply migrations to production on a production credential.
 */

import {
  MigrationExecutionError,
  MigrationTargetMismatchError,
} from "./migration-errors.js";
import {
  NO_AGREED_DATABASE_NAME,
  UNPARSEABLE_DATABASE_NAME,
  UNTRUSTED_CONNECTION_SHAPE,
} from "./open-database.js";
import {
  ALLOWED_TEST_DATABASE_NAMES,
  UNLISTED_DATABASE,
  printListedName,
} from "./test-database-url.js";

/**
 * The permanent environments and the database name(s) each one's credential may reach. A `Map`, so a label such as
 * `__proto__` or `toString` is never "listed" by accident. `test` is the same array as `ALLOWED_TEST_DATABASE_NAMES`,
 * imported so the two cannot drift (ADR 0102). No `staging` key: `lemn-conf-v2-staging` is a test database every live
 * suite deletes from, so a `staging` label is refused and told to say `test`.
 */
export const DATABASE_NAMES_BY_ENVIRONMENT: ReadonlyMap<
  string,
  readonly string[]
> = new Map([
  ["production", ["lemn-conf-v2"]],
  ["preview", ["lemn-conf-v2-preview"]],
  ["test", ALLOWED_TEST_DATABASE_NAMES],
]);

const LISTED_DATABASE_NAMES: readonly string[] = [
  ...DATABASE_NAMES_BY_ENVIRONMENT.values(),
].flat();

/**
 * The environment this run declares it is checking. Required and never defaulted (ADR 0096 decision 3): a default is
 * how a check ends up aimed at whatever the machine happened to hold. `commandName` makes the usage line name the
 * command the operator actually typed.
 */
export function readDeclaredEnvironment(
  argv: readonly string[],
  commandName: string,
): string {
  const declared = argv[2]?.trim();
  if (declared === undefined || declared === "") {
    throw new MigrationExecutionError(
      `${commandName} needs the name of the environment it is checking, so its output can be read ` +
        `against the database it actually reached. Usage: pnpm --filter @lemnaria/persistence run ` +
        `${commandName} <environment>, for example "production" or "preview".`,
    );
  }
  return declared;
}

/**
 * Refuses to proceed when the declared environment and the database `MIGRATION_DATABASE_URL` reaches disagree. Both
 * CLIs call it before they open a connection, so a mismatch does no work. The rule
 * (`docs/milestones/migration-environment-safety-check.md`, Decision 2):
 * - a listed environment passes only when the database reached is one of its own names;
 * - an unlisted label passes only as the exact, unclaimed name of the database it reaches, so a listed environment's
 *   database is never reachable under another label;
 * - an empty name, any `databaseNameOf` placeholder (its "no name the readers agree on" included), or a name holding
 *   `%` or `\` is always refused.
 * Receives only the two names, never a connection string, and prints a database name only from the environment map,
 * so a refusal can never quote a credential, a host or a name the operator mistyped into the URL.
 */
export function assertDeclaredEnvironmentReaches({
  environment,
  databaseName,
}: {
  readonly environment: string;
  readonly databaseName: string;
}): void {
  const namesForEnvironment = DATABASE_NAMES_BY_ENVIRONMENT.get(environment);
  if (namesForEnvironment !== undefined) {
    if (namesForEnvironment.includes(databaseName)) return;
    throw refuseListedMismatch(environment, databaseName, namesForEnvironment);
  }

  if (reachesItsOwnUnclaimedName(environment, databaseName)) return;
  throw refuseUnlistedMismatch(environment, databaseName);
}

/**
 * A name that is not one every reader of the connection string reads alike. `databaseNameOf` answers
 * `NO_AGREED_DATABASE_NAME` for a string like that; a name holding `%` or `\` is one a driver decodes or re-reads
 * differently, so a caller that hands one in directly is refused the same way.
 */
function isNotReadAlikeByEveryReader(databaseName: string): boolean {
  return databaseName === NO_AGREED_DATABASE_NAME || /[%\\]/.test(databaseName);
}

/** The permissive half of the unlisted rule: an ad-hoc label is trusted only as the database's own unclaimed name. */
function reachesItsOwnUnclaimedName(
  environment: string,
  databaseName: string,
): boolean {
  if (isNeverTrustedShape(databaseName)) return false;
  if (environment !== databaseName) return false;
  return environmentClaiming(databaseName) === undefined;
}

/** The values no label may reach: an empty name, either shape placeholder, and a name the readers do not read alike.
 *  Re-exporting the same URL cannot help, only a different valid one. Shared by the label check and
 *  `describeRetryGuidance` so they describe this class of value the same way. */
function isNeverTrustedShape(databaseName: string): boolean {
  return (
    databaseName === "" ||
    databaseName === UNPARSEABLE_DATABASE_NAME ||
    databaseName === UNTRUSTED_CONNECTION_SHAPE ||
    isNotReadAlikeByEveryReader(databaseName)
  );
}

/** The listed environment whose own names include `databaseName`: decides whether an unlisted label may pass, and
 *  names the owner in a refusal. */
function environmentClaiming(databaseName: string): string | undefined {
  for (const [environment, names] of DATABASE_NAMES_BY_ENVIRONMENT) {
    if (names.includes(databaseName)) return environment;
  }
  return undefined;
}

function refuseListedMismatch(
  environment: string,
  databaseName: string,
  expectedNames: readonly string[],
): MigrationTargetMismatchError {
  return buildRefusal(
    environment,
    databaseName,
    `"${environment}" is a recorded environment, and it only ever reaches ` +
      `${describeExpectedNames(expectedNames)}.`,
  );
}

/** A single name is quoted bare; several are quoted as a list. */
function describeExpectedNames(names: readonly string[]): string {
  const quoted = names.map((name) => `"${name}"`);
  const [onlyName] = quoted;
  return onlyName !== undefined && quoted.length === 1
    ? onlyName
    : `one of ${quoted.join(", ")}`;
}

function refuseUnlistedMismatch(
  environment: string,
  databaseName: string,
): MigrationTargetMismatchError {
  const claimedBy = environmentClaiming(databaseName);
  const expectation =
    claimedBy === undefined
      ? `An undeclared label may only name the exact, unclaimed database it reaches, and ` +
        `"${environment}" is not that database's name.`
      : `That database belongs to "${claimedBy}"; only "${claimedBy}" may declare it.`;
  return buildRefusal(environment, databaseName, expectation);
}

function buildRefusal(
  environment: string,
  databaseName: string,
  expectation: string,
): MigrationTargetMismatchError {
  const reached = describeReachedDatabase(databaseName);
  const guidance = describeRetryGuidance(environment, databaseName, reached);
  return new MigrationTargetMismatchError(
    `Refusing to proceed: the declared environment is "${environment}", and ` +
      `MIGRATION_DATABASE_URL reaches ${reached}. ${expectation} Nothing was run or read. ${guidance}`,
  );
}

/** The retry advice appended to every refusal. A never-trusted shape gets its own sentence: the general advice would
 *  suggest re-setting the same value, and no label admits one. */
function describeRetryGuidance(
  environment: string,
  databaseName: string,
  reached: string,
): string {
  if (isNotReadAlikeByEveryReader(databaseName)) {
    return (
      "Nothing will make this value acceptable: the database name in MIGRATION_DATABASE_URL is not read the " +
      "same way by every reader of the string (an escape, a backslash or a stray character in the address), so " +
      "it needs to be replaced with a plain postgres or postgresql connection string, not re-set to the same " +
      "value again."
    );
  }
  if (isNeverTrustedShape(databaseName)) {
    return (
      "Nothing will make this value acceptable: MIGRATION_DATABASE_URL needs to be replaced with a " +
      "valid postgres or postgresql connection string that has a real host, not re-set to the same " +
      "value again."
    );
  }
  return (
    `If ${reached} really is this one invocation's intended target, set MIGRATION_DATABASE_URL for ` +
    `that invocation only by exporting it from a file this shell sources, in a subshell — for ` +
    `example "(set -a; . ./.env.oneoff.local; set +a; pnpm --filter @lemnaria/persistence run ` +
    `migrate ${environment})" — rather than pasting a connection string into the command itself, ` +
    `which a shell keeps in its history. Running it outside a subshell would leave the variable ` +
    `exported for the rest of that shell session, shadowing .env.migration.local for every later ` +
    `invocation. Never fix this by editing .env.migration.local, which every other invocation on ` +
    `this machine also reads.`
  );
}

/** The name a line may print for a database already known to be reached: one this repository lists, or the unclaimed
 *  label the operator declared for it, which `assertDeclaredEnvironmentReaches` has accepted as that same name. */
export function printReachedDatabaseName({
  databaseName,
  environment,
}: {
  readonly databaseName: string;
  readonly environment: string;
}): string {
  const listedName = printListedDatabaseName(databaseName);
  return listedName === UNLISTED_DATABASE && databaseName === environment
    ? environment
    : listedName;
}

/** A name this repository lists, copied from its list, or the placeholder: never text taken from a URL. */
export function printListedDatabaseName(databaseName: string): string {
  return printListedName(databaseName, LISTED_DATABASE_NAMES);
}

function describeReachedDatabase(databaseName: string): string {
  if (databaseName === "") return "no database at all";
  if (databaseName === UNPARSEABLE_DATABASE_NAME)
    return "an unparseable connection string";
  if (databaseName === UNTRUSTED_CONNECTION_SHAPE) {
    return "a connection string that is not a plain postgres:// or postgresql:// URL with a host";
  }
  if (isNotReadAlikeByEveryReader(databaseName)) {
    return "a connection string whose database name the readers of it do not read alike";
  }
  const listedName = printListedDatabaseName(databaseName);
  return listedName === UNLISTED_DATABASE ? listedName : `"${listedName}"`;
}
