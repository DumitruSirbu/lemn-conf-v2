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
const MIGRATION_FILES = ["0001_create_designs.sql"];

/** Idempotent migration runner: each migration file is `create table if not exists`, so re-running
 *  is safe. Defaults to `MIGRATION_DATABASE_URL` rather than `DATABASE_URL` — the application role
 *  has no DDL rights by design, so migrations need their own privileged connection. The live tests
 *  pass their own database explicitly. Callers that need `.env.local` loaded first (a CLI
 *  invocation outside vitest) call `loadEnvLocal()` before this. */
export async function runMigrations(connectionUrl?: string): Promise<void> {
  const sql = neon(connectionUrl ?? readMigrationDatabaseUrl());
  for (const fileName of MIGRATION_FILES) {
    const migrationSql = readFileSync(
      resolve(MIGRATIONS_DIR, fileName),
      "utf8",
    );
    await sql.query(migrationSql);
  }
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
  await runMigrations();
}
