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

const isDirectCliInvocation =
  import.meta.url === `file://${process.argv[1] ?? ""}`;
if (isDirectCliInvocation) {
  loadEnvLocal();
  await runMigrations();
}
