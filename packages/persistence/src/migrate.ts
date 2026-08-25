import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

import { loadEnvLocal } from "./load-env.js";
import { readMigrationDatabaseUrl } from "./read-database-url.js";

const MIGRATIONS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "migrations",
);
const MIGRATION_FILES = [
  "0001_create_designs.sql",
  "0002_add_write_token_hash.sql",
  "0003_check_write_token_hash_shape.sql",
];

/**
 * Idempotent migration runner: every migration file is written `if not exists`, so re-running is
 * safe. Defaults to `MIGRATION_DATABASE_URL` rather than `DATABASE_URL` — the application role has
 * no DDL rights by design, so migrations need their own privileged connection. The live tests pass
 * their own database explicitly. Callers that need `.env.local` loaded first (a CLI invocation
 * outside vitest) call `loadEnvLocal()` before this.
 *
 * Returns the files it ran, in order — every file, every time, because this runner keeps no ledger
 * and skips nothing. That is what makes "did anything happen?" answerable by a caller rather than
 * only by an operator reading `information_schema` afterwards (ADR 0020 decision 4). It reports
 * what it **executed**, not what it changed: an `add column if not exists` that finds the column
 * already there is indistinguishable from one that adds it without extra queries, and this
 * deliberately does not attempt that distinction.
 */
export async function runMigrations(connectionUrl?: string): Promise<string[]> {
  const sql = neon(connectionUrl ?? readMigrationDatabaseUrl());
  const executed: string[] = [];

  for (const fileName of MIGRATION_FILES) {
    const migrationSql = readFileSync(
      resolve(MIGRATIONS_DIR, fileName),
      "utf8",
    );
    await sql.query(migrationSql);
    executed.push(fileName);
  }

  return executed;
}

/**
 * The single operator-facing line a migration run prints.
 *
 * Silence on success is the worst available output here: this command has a recorded history of
 * exiting 0 having done nothing (ADR 0013), and a migration that was never applied to the right
 * database went unnoticed because applying one printed nothing at all (ADR 0020). Both the bug and
 * the fix look identical when the output is empty.
 *
 * Names the **database**, never the connection string — that carries credentials, and one has
 * already been printed into a transcript on this project (ADR 0008's incident). The database name
 * is the part that matters anyway: the finding behind ADR 0020 was a correct command pointed at
 * the wrong database.
 */
export function describeMigrationRun(
  executed: readonly string[],
  databaseName: string,
): string {
  // "executed", not "applied": this runner has no ledger and skips nothing, so every file runs on
  // every invocation and each is written `if not exists`. "Applied" would imply a schema change
  // happened, and would imply the ledger ADR 0020 records this runner as deliberately not having.
  return `[migrate] executed ${executed.join(", ")} against ${databaseName}`;
}

/** The database a connection string names, and nothing else from it. Exported so the guarantee
 *  that no credential reaches a log line can be tested directly rather than by capturing stdout. */
export function databaseNameOf(connectionUrl: string): string {
  return new URL(connectionUrl).pathname.replace(/^\//, "");
}

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
  const connectionUrl = readMigrationDatabaseUrl();
  const executed = await runMigrations(connectionUrl);
  console.log(describeMigrationRun(executed, databaseNameOf(connectionUrl)));
}
