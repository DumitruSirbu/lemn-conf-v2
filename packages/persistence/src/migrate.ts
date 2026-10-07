import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Client, QueryResultRow } from "@neondatabase/serverless";

import { loadEnvLocal } from "./load-env.js";
import {
  MigrationError,
  MigrationExecutionError,
  causeUnlessItShowsTheConnection,
  isPrintableFailure,
} from "./migration-errors.js";
import { readMigrationFiles } from "./migration-files.js";
import type { MigrationFile } from "./migration-files.js";
import {
  ACQUIRE_MIGRATION_LOCK_SQL,
  CREATE_MIGRATION_LEDGER_SQL,
  INSERT_APPLIED_MIGRATION_SQL,
  MIGRATION_ADVISORY_LOCK_KEY,
  SELECT_APPLIED_MIGRATIONS_SQL,
} from "./migration-ledger.js";
import { planPendingMigrations } from "./migration-plan.js";
import type { AppliedMigration } from "./migration-plan.js";
import {
  assertDeclaredEnvironmentReaches,
  readDeclaredEnvironment,
} from "./migration-target.js";
import { databaseNameOf, openDatabaseSession } from "./open-database.js";
import { readMigrationDatabaseUrl } from "./read-database-url.js";

export { databaseNameOf };

/** What a run did, split so "applied nothing because all were already applied" differs from "nothing happened". */
export interface MigrationRunSummary {
  readonly applied: readonly string[];
  readonly alreadyApplied: readonly string[];
}

/**
 * Applies every migration this database has not run, each in its own transaction under an advisory lock together with
 * its ledger row, so it is either applied and recorded or neither. Uses `MIGRATION_DATABASE_URL`, never `DATABASE_URL`
 * (the application role has no DDL rights, ADR 0008); callers outside vitest call `loadEnvLocal()` first. The WebSocket
 * `Client` is required: only a session can hold a lock across a read and a write.
 *
 * Because of that transaction, no file may use a statement Postgres refuses inside one (`create index concurrently`,
 * `reindex concurrently`, `vacuum`, `alter system`, `create database`, `drop database`, `alter type … add value` on
 * older servers). Apply it by hand and record it, with its own decision record rather than an exception in this runner.
 */
export async function runMigrations(
  connectionUrl?: string,
): Promise<MigrationRunSummary> {
  return applyMigrations(
    connectionUrl ?? readMigrationDatabaseUrl(),
    readMigrationFiles(),
  );
}

/** `runMigrations` with the file set supplied, for tests that need a set the repository lacks (a failing migration,
 *  a tampered checksum). */
export async function applyMigrations(
  connectionUrl: string,
  files: readonly MigrationFile[],
): Promise<MigrationRunSummary> {
  const client = openDatabaseSession(connectionUrl, "MIGRATION_DATABASE_URL");
  await connectOrWrapError(client, connectionUrl);
  try {
    return await applyPendingMigrations({ client, connectionUrl }, files);
  } finally {
    await client.end();
  }
}

/**
 * A driver connect failure must not escape raw: Neon's WebSocket errors carry endpoint and host detail (ADR 0008's
 * redaction line). The replacement names only the database and keeps the driver error as `cause` when that error does
 * not show the connection string.
 *
 * `end()` is not awaited here: a failed connect has already emitted the `end` event it waits for
 * (`@neondatabase/serverless@1.1.0`, `index.mjs:1078`), so awaiting it never settles.
 */
async function connectOrWrapError(
  client: Client,
  connectionUrl: string,
): Promise<void> {
  try {
    await client.connect();
  } catch (error) {
    void client.end();
    throw new MigrationExecutionError(
      `Could not connect to "${databaseNameOf(connectionUrl)}" to run migrations. No migration ` +
        `was attempted.`,
      causeUnlessItShowsTheConnection(error, connectionUrl),
    );
  }
}

/** A connected client with the string it connected by, which a failure's `cause` is checked against. */
interface OpenConnection {
  readonly client: Client;
  readonly connectionUrl: string;
}

async function applyPendingMigrations(
  connection: OpenConnection,
  files: readonly MigrationFile[],
): Promise<MigrationRunSummary> {
  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  for (const file of files) {
    const wasApplied = await applyIfPending(connection, files, file);
    (wasApplied ? applied : alreadyApplied).push(file.fileName);
  }

  return { applied, alreadyApplied };
}

/** One transaction per migration, reporting whether this run is the one that applied it. */
async function applyIfPending(
  { client, connectionUrl }: OpenConnection,
  files: readonly MigrationFile[],
  file: MigrationFile,
): Promise<boolean> {
  try {
    await client.query("begin");
    const isPending = await lockLedgerAndCheckPending(client, files, file);
    if (isPending) await applyWithinTransaction(client, file);
    await client.query(isPending ? "commit" : "rollback");
    return isPending;
  } catch (error) {
    await rollbackQuietly(client);
    throw asMigrationError(error, file, connectionUrl);
  }
}

/**
 * Lock first, then bootstrap the ledger, then decide, all in the caller's transaction. The ledger is re-read here, not
 * once per run, so a concurrent runner's committed work is visible.
 */
async function lockLedgerAndCheckPending(
  client: Client,
  files: readonly MigrationFile[],
  file: MigrationFile,
): Promise<boolean> {
  await client.query(ACQUIRE_MIGRATION_LOCK_SQL, [MIGRATION_ADVISORY_LOCK_KEY]);
  await client.query(CREATE_MIGRATION_LEDGER_SQL);

  const pending = planPendingMigrations(
    files,
    await readAppliedMigrations(client),
  );
  return pending.some((candidate) => candidate.version === file.version);
}

async function applyWithinTransaction(
  client: Client,
  file: MigrationFile,
): Promise<void> {
  await client.query(file.sql);
  await client.query(INSERT_APPLIED_MIGRATION_SQL, [
    file.version,
    file.fileName,
    file.checksum,
  ]);
}

/** The driver's query generic needs an index-signature row type, which a plain interface is not assignable to. */
interface MigrationLedgerRow extends QueryResultRow {
  version: number;
  file_name: string;
  checksum: string;
}

async function readAppliedMigrations(
  client: Client,
): Promise<AppliedMigration[]> {
  const result = await client.query<MigrationLedgerRow>(
    SELECT_APPLIED_MIGRATIONS_SQL,
  );
  return result.rows.map((row) => ({
    version: row.version,
    fileName: row.file_name,
    checksum: row.checksum,
  }));
}

/** The failure that brought us here is the one worth reporting. A rollback that itself fails —
 *  because the connection is gone, say — must not replace it with a less informative error. */
async function rollbackQuietly(client: Client): Promise<void> {
  try {
    await client.query("rollback");
  } catch {
    // Deliberately swallowed; see above.
  }
}

function asMigrationError(
  error: unknown,
  file: MigrationFile,
  connectionUrl: string,
): Error {
  if (error instanceof MigrationError) return error;
  return new MigrationExecutionError(
    `Migration "${file.fileName}" failed and was rolled back. The database is unchanged by it and ` +
      `it is not recorded as applied.`,
    causeUnlessItShowsTheConnection(error, connectionUrl),
  );
}

/**
 * The single operator-facing line a migration run prints. It always says what was applied, spelling out "nothing", and
 * how many files were already applied: silence on success reads as a run that did nothing (ADR 0013).
 * It names the database, never the connection string, which carries credentials (ADR 0008).
 */
export function describeMigrationRun(
  summary: MigrationRunSummary,
  databaseName: string,
): string {
  const applied =
    summary.applied.length === 0 ? "nothing" : summary.applied.join(", ");
  return (
    `[migrate] applied ${applied} against ${databaseName} ` +
    `(${String(summary.alreadyApplied.length)} already applied)`
  );
}

/** The one line a failed run prints. Never the error object or its `cause`: a driver error's properties are where a
 *  connection string hides. */
export function describeMigrationFailure(error: unknown): string {
  return isPrintableFailure(error)
    ? `[migrate] ${error.name}: ${error.message}`
    : `[migrate] migration run failed with an unexpected ${describeErrorType(error)}.`;
}

function describeErrorType(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

// Compared as filesystem paths: `import.meta.url` percent-encodes a space and `process.argv[1]` does not, so a string
// comparison exited 0 having done nothing under a checkout path with a space (ADR 0013).
const invokedPath = process.argv[1];
const isDirectCliInvocation =
  invokedPath !== undefined &&
  resolve(fileURLToPath(import.meta.url)) === resolve(invokedPath);

if (isDirectCliInvocation) {
  loadEnvLocal();
  try {
    // Required, and checked before any connect: a silently ignored argument could aim this at production's credential
    // (see docs/milestones/migration-environment-safety-check.md).
    const environment = readDeclaredEnvironment(process.argv, "migrate");
    const connectionUrl = readMigrationDatabaseUrl();
    assertDeclaredEnvironmentReaches({
      environment,
      databaseName: databaseNameOf(connectionUrl),
    });

    const summary = await runMigrations(connectionUrl);
    console.log(describeMigrationRun(summary, databaseNameOf(connectionUrl)));
  } catch (error) {
    // Without this, Node's uncaught-exception printer dumps the driver's error object, which carries endpoint and host
    // detail. Only the error's own name and message reach the operator.
    console.error(describeMigrationFailure(error));
    process.exitCode = 1;
  }
}
