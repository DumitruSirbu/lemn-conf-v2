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
  const applicationUrl = readDatabaseUrl();
  const applicationDatabase = databaseNameOf(applicationUrl);

  const override = process.env["TEST_DATABASE_URL"]?.trim();
  const hasOverride = override !== undefined && override !== "";
  const testUrl = hasOverride ? override : withDatabaseName(applicationUrl, TEST_DATABASE_NAME);
  const testDatabase = databaseNameOf(testUrl);

  if (testDatabase === applicationDatabase) {
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
