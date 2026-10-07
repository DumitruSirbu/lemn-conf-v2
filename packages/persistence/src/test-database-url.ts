import type { NeonQueryFunction } from "@neondatabase/serverless";

import { parseConnectionUrl, openDatabase } from "./open-database.js";
import type { ConnectionVariableName } from "./open-database.js";
import { readDatabaseUrl } from "./read-database-url.js";

/**
 * The only database names a destructive suite may ever target: a name allowlist, not a comparison. The application's
 * database cannot be recognised by address (a pooled and a direct Neon endpoint, branch endpoints, raw IPs and CNAMEs
 * all reach the same rows), so only a rule that starts from "refuse everything" refuses a pasted direct connection
 * string. Adding a name is a deliberate one-line change: positive proof of a test database, required before any DELETE
 * (ADR 0006). Exported so `migration-target.ts` lists `test`'s names as this same array, not a second copy.
 */
export const ALLOWED_TEST_DATABASE_NAMES: readonly string[] = [
  // ADR 0006's default: the database `resolveTestDatabaseUrl` derives when nothing overrides it.
  "lemnaria_test",
  // The database `TEST_DATABASE_URL` points at, a named destructive-test target (ADR 0006's amendment). It shares a
  // Neon project with the application database (`lemn-conf-v2`), so the name, not the host, separates them. Despite its
  // name it is NOT a staging environment: every live-suite run deletes design rows from it, and allowlisting a name is
  // what authorises deletion there.
  "lemn-conf-v2-staging",
];

/** The name a test URL derives to when none is supplied. Allowlisted by construction. */
const TEST_DATABASE_NAME = "lemnaria_test";

/** Postgres' default port, used when a URL names none, so an explicit and an implicit port read the same in a refusal.
 */
const DEFAULT_POSTGRES_PORT = "5432";

interface DatabaseIdentity {
  readonly host: string;
  readonly port: string;
  readonly databaseName: string;
}

/**
 * Credentials and query parameters are excluded: a second role on the same database is still that database. The name is
 * read from the path only, which is right for `@neondatabase/serverless`; libpq (`psql`) lets a `?dbname=` parameter
 * override the path, so any second driver must be checked for how it resolves the two, or this guard checks a name
 * nothing connects to. (Only libpq's behaviour is verified.)
 */
function identityOf(
  connectionUrl: string,
  variableName: ConnectionVariableName,
): DatabaseIdentity {
  const url = parseConnectionUrl(connectionUrl, variableName);
  return {
    host: url.hostname.toLowerCase(),
    port: url.port === "" ? DEFAULT_POSTGRES_PORT : url.port,
    databaseName: url.pathname.replace(/^\//, ""),
  };
}

/**
 * The guard: refuses any connection string a destructive suite must not be pointed at. Exported so every destructive
 * path enforces the same rule (the live suites via `resolveTestDatabaseUrl`, `delete-designs-for-tests.ts`, and
 * `apps/web/playwright.config.ts`). The first refusal needs no `DATABASE_URL`, so a missing variable can never let a
 * DELETE through in CI; the second catches an application database that is itself named `lemnaria_test`.
 */
export function assertSafeTestDatabaseUrl(testUrl: string): void {
  const testIdentity = identityOf(testUrl, "TEST_DATABASE_URL");
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
  if (
    test.databaseName !==
    identityOf(applicationUrl, "DATABASE_URL").databaseName
  )
    return;

  throw new Error(
    `Refusing to run live database tests against "${test.databaseName}" on ` +
      `${test.host}:${test.port}: it is the database name DATABASE_URL points at. The host is not ` +
      `compared, because one database is reachable under several hostnames. Live tests write and ` +
      `delete rows, so they must target a separately named database.`,
  );
}

/**
 * Connection string for the live-test database: `DATABASE_URL` with only its database name swapped, so no second copy
 * of the credentials is stored; `TEST_DATABASE_URL` overrides it. Throws unless the result names an allowlisted test
 * database, so a misconfiguration fails loudly instead of running a destructive test against real data.
 */
export function resolveTestDatabaseUrl(): string {
  const override = readTestDatabaseOverride();
  return override === undefined
    ? refuseUnsafeTarget(deriveTestUrlFromApplicationUrl())
    : refuseUnsafeTarget(override);
}

/** The guarded connection the test helpers use. A refusal names the variable the URL came from: the override when one
 *  is set, else `DATABASE_URL`, which the URL was derived from. */
export function openTestDatabase(): NeonQueryFunction<false, false> {
  const sourceVariable =
    readTestDatabaseOverride() === undefined
      ? "DATABASE_URL"
      : "TEST_DATABASE_URL";
  return openDatabase(resolveTestDatabaseUrl(), sourceVariable);
}

function readTestDatabaseOverride(): string | undefined {
  const value = process.env["TEST_DATABASE_URL"]?.trim();
  return value === undefined || value === "" ? undefined : value;
}

/** With no override: `DATABASE_URL` with its database name swapped. It is required here, or there is nothing to derive
 *  from. */
function deriveTestUrlFromApplicationUrl(): string {
  return withDatabaseName(readDatabaseUrl(), TEST_DATABASE_NAME);
}

function refuseUnsafeTarget(testUrl: string): string {
  assertSafeTestDatabaseUrl(testUrl);
  return testUrl;
}

function withDatabaseName(connectionUrl: string, databaseName: string): string {
  const url = parseConnectionUrl(connectionUrl, "DATABASE_URL");
  url.pathname = `/${databaseName}`;
  return url.toString();
}
