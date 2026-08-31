import { neon } from "@neondatabase/serverless";

import { assertSafeTestDatabaseUrl } from "../../src/test-database-url.js";

/**
 * Direct reads and writes against `schema_migrations`, for tests that have to put a database into a
 * state the runner will never produce on its own — no ledger at all, or a ledger with a hole in it.
 *
 * Production code never deletes a ledger row; these helpers do, which is why every one of them runs
 * `assertSafeTestDatabaseUrl` first. A helper that can forget a migration must be incapable of
 * forgetting one on the application's database.
 */
export interface LedgerRow {
  version: number;
  file_name: string;
  checksum: string;
}

export async function readMigrationLedger(
  databaseUrl: string,
): Promise<LedgerRow[]> {
  assertSafeTestDatabaseUrl(databaseUrl);
  const sql = neon(databaseUrl);
  return (await sql`
    select version, file_name, checksum from schema_migrations order by version
  `) as LedgerRow[];
}

/** Puts the database back to the one state the runner has to bootstrap from: no ledger. */
export async function dropMigrationLedger(databaseUrl: string): Promise<void> {
  assertSafeTestDatabaseUrl(databaseUrl);
  await neon(databaseUrl)`drop table if exists schema_migrations`;
}

/** Makes applied migrations look unapplied, so a test can ask the runner to run them again. */
export async function forgetAppliedMigrations(
  databaseUrl: string,
  versions: readonly number[],
): Promise<void> {
  assertSafeTestDatabaseUrl(databaseUrl);
  await neon(databaseUrl)`
    delete from schema_migrations where version = any(${versions}::integer[])
  `;
}

/**
 * Unconditional cleanup for the tests that synthesise a migration beyond the real set.
 *
 * These tests deliberately hand the runner a file whose whole job is to fail, and one of them makes
 * the *migration* insert its own `version = 4` ledger row. That row is normally rolled back with the
 * transaction under test — but the test's cleanliness must not depend on the very mechanism it is
 * testing. When someone mutates the transaction away to watch the test fail (which this wave's
 * falsifiability table actively invites), the row and the probe table commit and stay, and a ledger
 * row whose version has no file makes every later `runMigrations` throw. That is not a failed test;
 * that is a wedged database, shared by every suite in this package.
 *
 * So this runs in a `finally`, unconditionally, whatever the assertions did.
 */
export async function dropSynthesisedMigrationArtefacts(
  databaseUrl: string,
  probeTableNames: readonly string[],
): Promise<void> {
  assertSafeTestDatabaseUrl(databaseUrl);
  const sql = neon(databaseUrl);
  await sql`delete from schema_migrations where version >= ${FIRST_SYNTHESISED_VERSION}`;
  for (const tableName of probeTableNames) {
    // Interpolated rather than parameterised because a table name is an identifier, not a value.
    // Safe here and only here: every name comes from a constant in the test file, never from data.
    await sql.query(`drop table if exists ${quoteIdentifier(tableName)}`);
  }
}

/** Every real migration is 1..3; anything at or above this was synthesised by a test. */
const FIRST_SYNTHESISED_VERSION = 4;

function quoteIdentifier(name: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(
      `Refusing to build a DROP TABLE for "${name}": probe table names are lower_snake_case literals.`,
    );
  }
  return `"${name}"`;
}

export async function hasTable(
  databaseUrl: string,
  tableName: string,
): Promise<boolean> {
  assertSafeTestDatabaseUrl(databaseUrl);
  const rows = (await neon(databaseUrl)`
    select 1 as present from information_schema.tables
    where table_schema = 'public' and table_name = ${tableName}
  `) as { present: number }[];
  return rows.length === 1;
}
