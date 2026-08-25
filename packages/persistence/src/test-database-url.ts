import { readDatabaseUrl } from "./read-database-url.js";

/** The database live tests are allowed to write to. Separate from the application database on
 *  purpose: these tests insert and delete rows, and a suite pointed at the app's own database is one
 *  bad `delete` away from destroying real customer designs. */
const TEST_DATABASE_NAME = "lemnaria_test";

function databaseNameOf(connectionUrl: string): string {
  return new URL(connectionUrl).pathname.replace(/^\//, "");
}

/**
 * Connection string for the live-test database, derived from `DATABASE_URL` by swapping only the
 * database name so no second copy of the credentials has to be stored. `TEST_DATABASE_URL`
 * overrides it when a wholly separate instance is preferred.
 *
 * Throws rather than falling back if the result would point at the application's own database —
 * the whole point of this module is that a misconfiguration fails loudly instead of letting a
 * destructive test run against real data.
 */
export function resolveTestDatabaseUrl(): string {
  const override = readTestDatabaseOverride();
  return override === undefined
    ? refuseApplicationDatabase(deriveTestUrlFromApplicationUrl())
    : refuseApplicationDatabase(override);
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

/**
 * The guard itself: a test database that *is* the application database is refused outright.
 *
 * `DATABASE_URL` is read directly rather than through `readDatabaseUrl()` because it is legitimately
 * absent in some environments — CI runs the live suite with `TEST_DATABASE_URL` and no application
 * connection at all, because no application runs there. When it is absent there is no application
 * database for a test to collide with, and demanding one would only invite a fake value invented to
 * satisfy a comparison against nothing. Whenever it *is* set — every local run, which is the case
 * the incident behind this module actually involved — the comparison is enforced exactly as before.
 */
function refuseApplicationDatabase(testUrl: string): string {
  const applicationUrl = process.env["DATABASE_URL"]?.trim();
  if (applicationUrl === undefined || applicationUrl === "") return testUrl;

  const testDatabase = databaseNameOf(testUrl);
  if (testDatabase === databaseNameOf(applicationUrl)) {
    throw new Error(
      `Refusing to run live database tests against "${testDatabase}": it is the application ` +
        `database named by DATABASE_URL. Live tests write and delete rows, so they must target a ` +
        `separate database (default "${TEST_DATABASE_NAME}", or set TEST_DATABASE_URL).`,
    );
  }
  return testUrl;
}

function withDatabaseName(connectionUrl: string, databaseName: string): string {
  const url = new URL(connectionUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}
