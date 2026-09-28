/**
 * The refusal that turns ADR 0096 decision 3's "runs against each deployed environment by name"
 * from a printed line into a checked one.
 *
 * `migrate` and `migrate:status` are both told which environment they are checking, as a required
 * argument. Until now nothing compared that declaration with the database `MIGRATION_DATABASE_URL`
 * actually reaches — `migrate` did not even read its argument (G1 of
 * `docs/milestones/migration-environment-safety-check.md`), and `migrate:status` only printed both
 * names side by side. On 2026-09-28 that gap let `pnpm --filter @lemnaria/persistence run migrate
 * preview`, read as a database selector, apply two migrations to production ahead of schedule
 * because the credential in scope was production's all along.
 *
 * This module holds no I/O and no CLI wiring — see `migrate.ts` and `migrate-status.ts` for where
 * the check is called, always before either command opens a connection or reads anything. It only
 * ever refuses; it never selects or guesses a database, so ADR 0096 decision 3 is extended rather
 * than amended.
 */

import {
  MigrationExecutionError,
  MigrationTargetMismatchError,
} from "./migration-errors.js";
import { ALLOWED_TEST_DATABASE_NAMES } from "./test-database-url.js";

/**
 * The permanent environments this repository deploys to, and the database name(s) each one's
 * credential may legitimately reach.
 *
 * A `Map`, not an object literal, so a declared label of `__proto__`, `constructor` or `toString`
 * is never "listed" by accident. `test` is **the same array reference** as
 * `ALLOWED_TEST_DATABASE_NAMES`, imported rather than copied, so the two can never drift apart
 * (ADR 0102: a second list of test-database names would be a second authority for one fact).
 *
 * No `staging` key, deliberately. `lemn-conf-v2-staging` is not a staging environment — every live
 * suite deletes rows from it, and `.env.example` and `test-database-url.ts` both warn against the
 * misreading a `staging` label would teach. Declared `staging`, a run is refused, and the refusal
 * names `test`, the environment that actually claims that database.
 *
 * Adding a fourth permanent environment is a one-line reviewed edit, exactly as an entry to
 * `ALLOWED_TEST_DATABASE_NAMES` already is. A temporary or ad-hoc database — a restore drill, say —
 * needs no edit here at all: `assertDeclaredEnvironmentReaches` admits it under its own name.
 */
export const DATABASE_NAMES_BY_ENVIRONMENT: ReadonlyMap<
  string,
  readonly string[]
> = new Map([
  ["production", ["lemn-conf-v2"]],
  ["preview", ["lemn-conf-v2-preview"]],
  ["test", ALLOWED_TEST_DATABASE_NAMES],
]);

/** `databaseNameOf`'s own placeholder for a connection string it could not parse (`migrate.ts`),
 *  duplicated here rather than imported. `migrate.ts` imports this module to call the check below,
 *  so importing the placeholder back would put this pure module in an import cycle with a CLI file.
 *  The two are kept from drifting apart by `migration-target.test.ts`, which feeds the check the
 *  placeholder `databaseNameOf` actually returns for a malformed URL rather than asserting this
 *  literal in isolation. */
const UNPARSEABLE_DATABASE_NAME = "<unparseable connection string>";

/** `databaseNameOf`'s placeholder for a connection string that parses but is not a plain
 *  `postgres:`/`postgresql:` URL with a host (Findings A/B, security and logic review) — duplicated
 *  here for the same import-cycle reason as `UNPARSEABLE_DATABASE_NAME` above, and kept from
 *  drifting apart by the same style of test. */
const UNTRUSTED_CONNECTION_SHAPE =
  "<connection string is not a postgres:// or postgresql:// URL with a host>";

/**
 * The environment this run declares it is checking. Required, and never defaulted: ADR 0096
 * decision 3 asks for a guard that runs "against each deployed environment by name", and a default
 * is how a check ends up aimed at whatever the machine happened to hold.
 *
 * `commandName` names the CLI that is asking, so the usage line an operator reads tells them to
 * re-run the command they actually typed — `migrate` never tells them to run `migrate:status`.
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
 * Refuses to proceed when the declared environment and the database
 * `MIGRATION_DATABASE_URL` reaches disagree. Called by both CLIs before they open a connection or
 * read anything, so a mismatch leaks no credential and does no work — see `migrate.ts` and
 * `migrate-status.ts`.
 *
 * The rule, matching `docs/milestones/migration-environment-safety-check.md`'s *Decision* 2:
 * - a **listed** environment (`production`, `preview`, `test`) passes only when the database
 *   reached is one of that environment's own names;
 * - an **unlisted** label passes only as the exact, unclaimed name of the database it reaches — an
 *   ad-hoc database (a restore drill, say) is declared by its own name, and a listed environment's
 *   database can never be reached under any other label, so `migrate lemn-conf-v2` is refused and
 *   told to say `production`;
 * - an empty database name, `databaseNameOf`'s unparseable placeholder, and its untrusted-connection-
 *   shape placeholder (a scheme other than `postgres:`/`postgresql:`, or no host at all) are always
 *   refused;
 * - a database name whose raw path contains `%` or `\` is always refused, regardless of what
 *   environment is declared (see `hasUndecodedPathCharacters` below).
 *
 * Receives only the two names, never a connection string: the refusal this throws is built from
 * `environment` and `databaseName` alone, so it can never quote a credential.
 */
export function assertDeclaredEnvironmentReaches({
  environment,
  databaseName,
}: {
  readonly environment: string;
  readonly databaseName: string;
}): void {
  if (hasUndecodedPathCharacters(databaseName)) {
    throw refuseUndecodedPathCharacters(environment, databaseName);
  }

  const namesForEnvironment = DATABASE_NAMES_BY_ENVIRONMENT.get(environment);
  if (namesForEnvironment !== undefined) {
    if (namesForEnvironment.includes(databaseName)) return;
    throw refuseListedMismatch(environment, databaseName, namesForEnvironment);
  }

  if (reachesItsOwnUnclaimedName(environment, databaseName)) return;
  throw refuseUnlistedMismatch(environment, databaseName);
}

/**
 * `databaseNameOf` returns a connection string's path exactly as written — still percent-encoded,
 * with any backslash untouched — but `@neondatabase/serverless`'s WebSocket `Client` re-parses the
 * URL and decodes the path (`decodeURIComponent`, then `decodeURI`, treating `\` as a path
 * separator) before it connects. A raw path of `/lemn%2Dconf%2Dv2` therefore reaches this check as
 * the literal, unclaimed string `lemn%2Dconf%2Dv2` while the driver actually connects to
 * `lemn-conf-v2` — an unlisted label equal to that raw string would otherwise pass as its own
 * unclaimed ad-hoc database and then reach a listed environment's database at connect time.
 *
 * Refusing every raw path containing either character, unconditionally, closes the
 * percent-encoding/backslash-separator class of bypass rather than only the specific encodings this
 * was found with: a real Neon database name is a plain identifier and never contains `%` or `\`, so
 * a path that does is inherently suspicious regardless of what it would decode to. This deliberately
 * does not reproduce the driver's decode algorithm — a second copy of that logic here could itself
 * drift from a future driver quirk.
 *
 * This is not the only class of check-versus-driver disagreement, and does not claim to be: a
 * connection string with no `//` authority at all (`postgres:/user:pw@host/db`) diverges from the
 * driver in a different way that contains neither `%` nor `\`, and is refused separately —
 * `databaseNameOf` never lets that shape reach this function as a raw name at all (see its own doc
 * comment and `UNTRUSTED_CONNECTION_SHAPE` below).
 */
function hasUndecodedPathCharacters(databaseName: string): boolean {
  return /[%\\]/.test(databaseName);
}

/** The permissive half of the unlisted rule: an ad-hoc label is trusted only as the database's own,
 *  unclaimed name — never as a listed environment's name under a different label. */
function reachesItsOwnUnclaimedName(
  environment: string,
  databaseName: string,
): boolean {
  if (isNeverTrustedShape(databaseName)) return false;
  if (environment !== databaseName) return false;
  return environmentClaiming(databaseName) === undefined;
}

/** The three placeholders `describeReachedDatabase` names below (empty, unparseable, and not a
 *  plain postgres/postgresql URL with a host): no label, listed or unlisted, may ever reach any of
 *  them, and no re-export of the same `MIGRATION_DATABASE_URL` can change that — only a different,
 *  valid connection string can. Shared by the unlisted-label check above and by the retry guidance
 *  in `buildRefusal` below, so the two can never describe this class of value differently. */
function isNeverTrustedShape(databaseName: string): boolean {
  return (
    databaseName === "" ||
    databaseName === UNPARSEABLE_DATABASE_NAME ||
    databaseName === UNTRUSTED_CONNECTION_SHAPE
  );
}

/** The listed environment whose own names include `databaseName`, if any. Consulted both to decide
 *  whether an unlisted label may pass and to name, in a refusal, which environment a mismatched
 *  database actually belongs to. */
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

/** A single name is quoted bare; more than one is quoted as a list, so `production`'s refusal reads
 *  "reaches "lemn-conf-v2"" while `test`'s reads "reaches one of "lemnaria_test", "...-staging"". */
function describeExpectedNames(names: readonly string[]): string {
  const quoted = names.map((name) => `"${name}"`);
  const [onlyName] = quoted;
  return onlyName !== undefined && quoted.length === 1
    ? onlyName
    : `one of ${quoted.join(", ")}`;
}

/** The refusal for a raw path shaped like a decode bypass — see `hasUndecodedPathCharacters`. Named
 *  separately from `refuseUnlistedMismatch` because "an unclaimed name" is the wrong expectation to
 *  print here: no environment may ever declare a name like this, listed or not. */
function refuseUndecodedPathCharacters(
  environment: string,
  databaseName: string,
): MigrationTargetMismatchError {
  return buildRefusal(
    environment,
    databaseName,
    `A raw database name containing "%" or "\\" is never trusted under any label: the driver that ` +
      `actually connects decodes percent-encoding (and treats "\\" as a path separator) before ` +
      `choosing a database, so this check's raw view of the name can differ from the database a ` +
      `connection would really reach.`,
  );
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

/**
 * The retry advice appended to every refusal above.
 *
 * A never-trusted shape (`isNeverTrustedShape`) gets its own sentence rather than the general one
 * below: that sentence's "if this really is your intended target, set MIGRATION_DATABASE_URL…" would
 * wrongly suggest an operator could make an empty, unparseable, or non-postgres connection string
 * pass by re-exporting the same value — no label ever admits one, so the only fix is a different,
 * valid URL.
 */
function describeRetryGuidance(
  environment: string,
  databaseName: string,
  reached: string,
): string {
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

function describeReachedDatabase(databaseName: string): string {
  if (databaseName === "") return "no database at all";
  if (databaseName === UNPARSEABLE_DATABASE_NAME)
    return "an unparseable connection string";
  if (databaseName === UNTRUSTED_CONNECTION_SHAPE) {
    return "a connection string that is not a plain postgres:// or postgresql:// URL with a host";
  }
  if (hasUndecodedPathCharacters(databaseName)) {
    return `a raw database name that is not safe to trust ("${databaseName}")`;
  }
  return `"${databaseName}"`;
}
