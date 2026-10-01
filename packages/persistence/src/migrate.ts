import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@neondatabase/serverless";
import type { QueryResultRow } from "@neondatabase/serverless";

import { loadEnvLocal } from "./load-env.js";
import { MigrationError, MigrationExecutionError } from "./migration-errors.js";
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
import { readMigrationDatabaseUrl } from "./read-database-url.js";

/** What a run did, split so a caller — and the operator-facing line — can tell "applied nothing
 *  because everything was already applied" from "applied nothing because nothing happened". */
export interface MigrationRunSummary {
  readonly applied: readonly string[];
  readonly alreadyApplied: readonly string[];
}

/**
 * Applies every migration this database has not already run, and records each one it runs.
 *
 * Defaults to `MIGRATION_DATABASE_URL` rather than `DATABASE_URL`: the application role holds no
 * DDL rights by design (ADR 0008), so migrations need their own privileged connection, and there is
 * no fallback between the two. The live tests pass their own database explicitly. Callers that need
 * `.env.local` loaded first (a CLI invocation outside vitest) call `loadEnvLocal()` before this.
 *
 * Each pending migration runs in its own transaction, under an advisory lock, with its ledger row
 * inserted by that same transaction — so a migration either happened and is recorded, or neither.
 * Migrations before it that already committed stay applied and stay recorded, which is the honest
 * account of a run that failed part-way.
 *
 * Uses the WebSocket `Client` rather than the HTTP `neon()` function that the rest of this package
 * uses. The HTTP driver has no session: it cannot hold a lock across a read and a write, and its
 * transactions must be handed every statement up front, so "read the ledger, then decide what to
 * execute" is not expressible over it.
 *
 * **What running inside a transaction forbids, deliberately.** Postgres refuses a handful of
 * statements inside a transaction block, so no migration file may contain one:
 * `create index concurrently`, `reindex concurrently`, `vacuum`, `alter system`, `create database`,
 * `drop database` and `alter type … add value` on older servers. A file using any of them fails
 * with a bare "cannot run inside a transaction block", which says nothing about why this runner is
 * built the way it is — hence this paragraph. The trade is accepted: atomicity of a migration with
 * its ledger row is worth more than the ability to build an index without taking a write lock, on a
 * table this project expects to stay small. A migration that genuinely needs one of these has to be
 * applied by hand and then recorded, which is a deliberate operator action and should get its own
 * decision record rather than a quiet exception carved into this runner.
 */
export async function runMigrations(
  connectionUrl?: string,
): Promise<MigrationRunSummary> {
  return applyMigrations(
    connectionUrl ?? readMigrationDatabaseUrl(),
    readMigrationFiles(),
  );
}

/**
 * `runMigrations` with the file set supplied rather than read from disk.
 *
 * Exported for the tests that have to present a migration set the repository does not contain — a
 * deliberately failing migration, or one whose checksum has been tampered with. Production code
 * calls `runMigrations`, which is the same thing over the real directory.
 */
export async function applyMigrations(
  connectionUrl: string,
  files: readonly MigrationFile[],
): Promise<MigrationRunSummary> {
  const client = new Client(connectionUrl);
  try {
    await connectOrWrapError(client, connectionUrl);
    return await applyPendingMigrations(client, files);
  } finally {
    await client.end();
  }
}

/**
 * A driver connect failure must not escape raw. Neon's WebSocket errors carry endpoint and host
 * detail, and the CLI's uncaught-exception path would print the whole object — below the redaction
 * line this project set after ADR 0008's incident. The replacement names the database and nothing
 * else from the connection string, and keeps the driver error as `cause` for a caller that asks.
 */
async function connectOrWrapError(
  client: Client,
  connectionUrl: string,
): Promise<void> {
  try {
    await client.connect();
  } catch (error) {
    throw new MigrationExecutionError(
      `Could not connect to "${databaseNameOf(connectionUrl)}" to run migrations. No migration ` +
        `was attempted.`,
      { cause: error },
    );
  }
}

async function applyPendingMigrations(
  client: Client,
  files: readonly MigrationFile[],
): Promise<MigrationRunSummary> {
  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  for (const file of files) {
    const wasApplied = await applyIfPending(client, files, file);
    (wasApplied ? applied : alreadyApplied).push(file.fileName);
  }

  return { applied, alreadyApplied };
}

/** One transaction per migration, reporting whether this run is the one that applied it. */
async function applyIfPending(
  client: Client,
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
    throw asMigrationError(error, file);
  }
}

/**
 * Takes the lock first, then bootstraps the ledger, then decides — in that order, and all inside
 * the caller's transaction. Re-reading the ledger here rather than once per run is what makes a
 * concurrent runner's committed work visible: this never decides from a view taken before the lock.
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

/** Extends the driver's row type because its query generic is constrained to an index-signature
 *  type, which a plain interface is not assignable to. */
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

function asMigrationError(error: unknown, file: MigrationFile): Error {
  if (error instanceof MigrationError) return error;
  return new MigrationExecutionError(
    `Migration "${file.fileName}" failed and was rolled back. The database is unchanged by it and ` +
      `it is not recorded as applied.`,
    { cause: error },
  );
}

/**
 * The single operator-facing line a migration run prints.
 *
 * Silence on success is the worst available output here: this command has a recorded history of
 * exiting 0 having done nothing (ADR 0013), and a migration that was never applied to the right
 * database went unnoticed because applying one printed nothing at all (ADR 0020). Both the bug and
 * the fix look identical when the output is empty. The line therefore always says what was applied,
 * spelling out "nothing" when that is the answer, and how many files were already applied — so an
 * empty-handed run reads as "there was nothing to do" and never as "something went wrong quietly".
 *
 * Names the **database**, never the connection string — that carries credentials, and one has
 * already been printed into a transcript on this project (ADR 0008's incident). The database name
 * is the part that matters anyway: the finding behind ADR 0020 was a correct command pointed at
 * the wrong database.
 */
export function describeMigrationRun(
  summary: MigrationRunSummary,
  databaseName: string,
): string {
  // "applied", and now it is true: with a ledger the runner knows which files it executed and which
  // it skipped, which is exactly what ADR 0020 recorded this runner as not being able to say.
  const applied =
    summary.applied.length === 0 ? "nothing" : summary.applied.join(", ");
  return (
    `[migrate] applied ${applied} against ${databaseName} ` +
    `(${String(summary.alreadyApplied.length)} already applied)`
  );
}

/**
 * The one line a failed run prints. Never the error object, never its `cause`: a driver error's
 * properties are exactly where a connection string hides.
 */
export function describeMigrationFailure(error: unknown): string {
  return error instanceof MigrationError
    ? `[migrate] ${error.name}: ${error.message}`
    : `[migrate] migration run failed with an unexpected ${describeErrorType(error)}.`;
}

function describeErrorType(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/**
 * The database a connection string names, and nothing else from it. Exported so the guarantee that
 * no credential reaches a log line can be tested directly rather than by capturing stdout.
 *
 * Never throws. `new URL` on a malformed string raises `ERR_INVALID_URL`, which carries the whole
 * input — password included — as an enumerable property that Node's uncaught-exception printer
 * emits. Since every caller here is building a line for an operator to read, a placeholder is the
 * right answer: the run still fails, and it fails without printing the credential that a
 * misconfigured `MIGRATION_DATABASE_URL` would otherwise leak into a deploy log.
 *
 * A second placeholder guards a narrower input `new URL` accepts without raising: a scheme other
 * than `postgres:`/`postgresql:`, or a URL with no `//` authority at all — for example
 * `postgres:/user:pw@host/lemn-conf-v2`. There, `new URL(...).host` is empty and `pathname` is
 * `/user:pw@host/lemn-conf-v2`, so the naive pathname-strip below would return the credential
 * itself as "the database name" (a leak, found by security review). `@neondatabase/serverless`
 * 1.1.0 re-parses the same string under `http:`, a WHATWG "special" scheme that tolerates the
 * missing second slash, and resolves a real host and database there — so a label equal to that raw
 * fragment would otherwise also pass `assertDeclaredEnvironmentReaches` as its own unclaimed ad-hoc
 * name while the driver actually reaches a listed environment's database (a bypass, found by logic
 * review, same root cause). Refusing every URL shaped like this before any pathname is read closes
 * both at once, rather than trying to enumerate every string that can produce them.
 *
 * Deliberately returns the pathname **still percent-encoded** and with any backslash untouched —
 * this is the raw name a connection string's path spells, not the name a driver would connect to.
 * `assertDeclaredEnvironmentReaches` is what refuses a name shaped like this before it is compared
 * against anything (see its own doc comment): keeping the decode decision out of this function
 * means the one place a raw `%`/`\` gets judged is also the one place that already special-cases the
 * empty and unparseable names, rather than a second copy of that judgment here.
 */
export function databaseNameOf(connectionUrl: string): string {
  try {
    const url = new URL(connectionUrl);
    if (!hasTrustedPostgresAuthority(url)) return UNTRUSTED_CONNECTION_SHAPE;
    return url.pathname.replace(/^\//, "");
  } catch {
    return UNPARSEABLE_DATABASE_NAME;
  }
}

/** Exactly `postgres:` or `postgresql:`, with a non-empty host — see `databaseNameOf`'s doc
 *  comment for why a URL failing either test is never trusted to say what it names. */
function hasTrustedPostgresAuthority(url: URL): boolean {
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:")
    return false;
  return url.host !== "";
}

const UNPARSEABLE_DATABASE_NAME = "<unparseable connection string>";

/** `databaseNameOf`'s placeholder for a URL that parses but is not a plain `postgres:`/`postgresql:`
 *  URL with a host. Duplicated in `migration-target.ts` for the same reason `UNPARSEABLE_DATABASE_NAME`
 *  is there too: importing it back would put this CLI file in an import cycle with the pure module
 *  that calls it. */
const UNTRUSTED_CONNECTION_SHAPE =
  "<connection string is not a postgres:// or postgresql:// URL with a host>";

// Compared as filesystem paths, not by string-splicing a `file://` prefix onto `argv[1]`.
// `import.meta.url` percent-encodes characters that are illegal in a URL — a space becomes `%20` —
// while `process.argv[1]` is a plain path. The two therefore never matched for anyone whose
// checkout sits under a directory containing a space, so `pnpm run migrate` exited 0 having done
// nothing at all: no migration, no output, no error. Found by the 2026-08-25 restore drill on a
// checkout under "Personal Projects"; see ADR 0013.
const invokedPath = process.argv[1];
const isDirectCliInvocation =
  invokedPath !== undefined &&
  resolve(fileURLToPath(import.meta.url)) === resolve(invokedPath);

if (isDirectCliInvocation) {
  loadEnvLocal();
  try {
    // Required, and checked before the connect below ever runs: the 2026-09-28 incident was this
    // argument being silently ignored while the credential in scope happened to be production's.
    // See docs/milestones/migration-environment-safety-check.md.
    const environment = readDeclaredEnvironment(process.argv, "migrate");
    const connectionUrl = readMigrationDatabaseUrl();
    assertDeclaredEnvironmentReaches({
      environment,
      databaseName: databaseNameOf(connectionUrl),
    });

    const summary = await runMigrations(connectionUrl);
    console.log(describeMigrationRun(summary, databaseNameOf(connectionUrl)));
  } catch (error) {
    // Without this, Node's uncaught-exception printer dumps the driver's error object, which for a
    // Neon WebSocket failure carries endpoint and host detail. Only the error's own name and
    // message reach the operator; the `cause` chain stays reachable in code and out of the log.
    console.error(describeMigrationFailure(error));
    process.exitCode = 1;
  }
}
