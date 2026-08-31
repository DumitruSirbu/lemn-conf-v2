import { readDatabaseUrl } from "./read-database-url.js";

/**
 * The only database names a destructive suite may ever target.
 *
 * This is the guard's total rule, and it is deliberately a name allowlist rather than a comparison.
 * A comparison can only refuse what it recognises, and there is no reliable way to recognise the
 * application's database by address: Neon fronts one database with a pooled endpoint
 * (`ep-<id>-pooler.<region>...`) and a direct one (`ep-<id>.<region>...`), and branch endpoints,
 * raw IPs and CNAMEs all reach the same rows under different hostnames. Someone pasting the direct
 * connection string from the Neon console into `.env.test.local` must be refused, and only a rule
 * that starts from "refuse everything" refuses it.
 *
 * Adding a name here is a deliberate, reviewable one-line change. It is the third mechanism
 * `docs/decisions/0006-tests-never-touch-the-application-database.md` asks for, in its cheapest
 * form: positive proof that the target is a test database, required before any DELETE.
 */
const ALLOWED_TEST_DATABASE_NAMES: readonly string[] = [
  // ADR 0006's default: the database `resolveTestDatabaseUrl` derives when nothing overrides it.
  "lemnaria_test",
  // What `TEST_DATABASE_URL` has actually pointed at since the live suites were written, and a
  // named destructive-test target since the owner's decision of 2026-08-31 (ADR 0006's amendment).
  // It sits in the same Neon project as the application database (`lemn-conf-v2`) under a different
  // name, which is why the name — not the host — is what separates them. Despite what it is called
  // it is NOT a staging environment: every live-suite run deletes design rows from it, and nothing
  // but those suites may use it. Read that amendment before touching this entry — allowlisting a
  // name is what authorises deletion there, so this list is the only place the rule is visible.
  "lemn-conf-v2-staging",
];

/** The name a test URL derives to when none is supplied. Allowlisted by construction. */
const TEST_DATABASE_NAME = "lemnaria_test";

/** Postgres' own default, used when a connection string names no port, so a URL spelling the port
 *  out and one leaving it implicit read identically in a refusal message. */
const DEFAULT_POSTGRES_PORT = "5432";

interface DatabaseIdentity {
  readonly host: string;
  readonly port: string;
  readonly databaseName: string;
}

/**
 * Credentials and query parameters are deliberately excluded: a second role on the same database is
 * still that database, so they can play no part in deciding what a URL reaches.
 *
 * The database name is read from the path only, which is correct for `@neondatabase/serverless` —
 * the one driver this package uses. libpq (`psql`) applies URI query keywords after the path, so a
 * `?dbname=` parameter *overrides* it and a URL whose path says `lemnaria_test` can reach another
 * database entirely. Anything that adds a second driver has to check how that driver resolves the
 * two, and read the parameter here if it can win — otherwise this guard silently starts checking a
 * name nothing connects to. (Only libpq's behaviour is verified; other clients parse connection
 * strings themselves and were not checked.)
 */
function identityOf(connectionUrl: string): DatabaseIdentity {
  const url = new URL(connectionUrl);
  return {
    host: url.hostname.toLowerCase(),
    port: url.port === "" ? DEFAULT_POSTGRES_PORT : url.port,
    databaseName: url.pathname.replace(/^\//, ""),
  };
}

/**
 * The guard: refuses any connection string a destructive suite must not be pointed at.
 *
 * Exported so every destructive path enforces the same rule — the live suites through
 * `resolveTestDatabaseUrl`, the cleanup helper in `delete-designs-for-tests.ts`, and
 * `apps/web/playwright.config.ts` before it starts a dev server. A guard that only one of those
 * calls is a guard the others can be misconfigured around, which is exactly what happened.
 *
 * Two refusals, in order. The first needs no `DATABASE_URL` and is what makes the guard safe in CI
 * and in a bare `pnpm --filter @lemnaria/persistence test`, where there may be no application
 * connection to compare against; a missing variable must never be what lets a DELETE through. The
 * second catches the remaining case the allowlist cannot see on its own — an application database
 * that is itself named `lemnaria_test`.
 */
export function assertSafeTestDatabaseUrl(testUrl: string): void {
  const testIdentity = identityOf(testUrl);
  refuseUnlessNamedAsATestDatabase(testIdentity);
  refuseTheApplicationDatabaseName(testIdentity);
}

function refuseUnlessNamedAsATestDatabase(test: DatabaseIdentity): void {
  if (ALLOWED_TEST_DATABASE_NAMES.includes(test.databaseName)) return;

  throw new Error(
    `Refusing to run live database tests against "${test.databaseName}" on ` +
      `${test.host}:${test.port}: it is not one of the databases this repository allows a ` +
      `destructive suite to target (${ALLOWED_TEST_DATABASE_NAMES.join(", ")}). Live tests write ` +
      `and delete rows. A pooled and a direct endpoint of the same Neon project are different ` +
      `hostnames reaching the same rows, so the database name is what must prove this is a test ` +
      `database — point TEST_DATABASE_URL at one, or add the name to ALLOWED_TEST_DATABASE_NAMES.`,
  );
}

function refuseTheApplicationDatabaseName(test: DatabaseIdentity): void {
  const applicationUrl = process.env["DATABASE_URL"]?.trim();
  if (applicationUrl === undefined || applicationUrl === "") return;
  if (test.databaseName !== identityOf(applicationUrl).databaseName) return;

  throw new Error(
    `Refusing to run live database tests against "${test.databaseName}" on ` +
      `${test.host}:${test.port}: it is the database name DATABASE_URL points at. The host is not ` +
      `compared, because one database is reachable under several hostnames. Live tests write and ` +
      `delete rows, so they must target a separately named database.`,
  );
}

/**
 * Connection string for the live-test database, derived from `DATABASE_URL` by swapping only the
 * database name so no second copy of the credentials has to be stored. `TEST_DATABASE_URL`
 * overrides it when a wholly separate instance is preferred.
 *
 * Throws rather than falling back unless the result names an allowlisted test database — the whole
 * point of this module is that a misconfiguration fails loudly instead of letting a destructive test
 * run against real data.
 */
export function resolveTestDatabaseUrl(): string {
  const override = readTestDatabaseOverride();
  return override === undefined
    ? refuseUnsafeTarget(deriveTestUrlFromApplicationUrl())
    : refuseUnsafeTarget(override);
}

function readTestDatabaseOverride(): string | undefined {
  const value = process.env["TEST_DATABASE_URL"]?.trim();
  return value === undefined || value === "" ? undefined : value;
}

/** With no override, the test database is `DATABASE_URL` with only its database name swapped, so no
 *  second copy of the credentials has to be stored. `DATABASE_URL` is required here — without it
 *  there is nothing to derive from. */
function deriveTestUrlFromApplicationUrl(): string {
  return withDatabaseName(readDatabaseUrl(), TEST_DATABASE_NAME);
}

function refuseUnsafeTarget(testUrl: string): string {
  assertSafeTestDatabaseUrl(testUrl);
  return testUrl;
}

function withDatabaseName(connectionUrl: string, databaseName: string): string {
  const url = new URL(connectionUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}
