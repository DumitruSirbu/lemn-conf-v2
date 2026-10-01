import { MigrationExecutionError } from "./migration-errors.js";

function missingUrlMessage(variableName: string, purpose: string): string {
  return (
    `${variableName} environment variable is not set. It ${purpose}. Set it in .env.local ` +
    `(or .env.migration.local for migration credentials), or in the deployment environment.`
  );
}

/** Reads `DATABASE_URL`, the application's own connection. No fallback and no override parameter —
 *  deliberate: a silently-accepted alternate value could point at an unintended database. Throws a
 *  named, explicit error rather than letting a missing connection string surface as a cryptic
 *  driver failure. */
export function readDatabaseUrl(): string {
  const value = process.env["DATABASE_URL"];
  if (!value) {
    throw new Error(
      missingUrlMessage(
        "DATABASE_URL",
        "is the application's Postgres connection",
      ),
    );
  }
  return value;
}

/**
 * Reads `MIGRATION_DATABASE_URL`, used only to apply migrations.
 *
 * Deliberately a different variable from `DATABASE_URL`: the application connects with a
 * least-privilege role that holds `SELECT, INSERT, UPDATE` on `designs` and nothing else, so it
 * *cannot* run DDL — that is the security property, not an oversight (M2 work item 8, and
 * `docs/decisions/0008-least-privilege-database-role.md`). Applying schema changes therefore
 * needs a separate, more privileged connection, and keeping it in its own variable means the
 * running application never holds credentials that can drop a table.
 *
 * There is no fallback to `DATABASE_URL`: falling back would silently reintroduce the very
 * privilege separation this exists to enforce, and would fail later with a confusing permission
 * error instead of an explicit one here.
 *
 * Throws `MigrationExecutionError`, not a plain `Error`: `migrate.ts`'s `describeMigrationFailure`
 * deliberately withholds the message of anything that is not a `MigrationError`, so that no raw
 * driver error can leak a credential onto an operator's screen. A missing environment variable
 * carries no credential and is this command's most likely misconfiguration, so it needs to be the
 * one thing that printer is allowed to name — matching `migrate-status.ts`'s own
 * `requireMigrationDatabaseUrl`, which throws the same error type for the same situation.
 */
export function readMigrationDatabaseUrl(): string {
  const value = process.env["MIGRATION_DATABASE_URL"];
  if (!value) {
    throw new MigrationExecutionError(
      missingUrlMessage(
        "MIGRATION_DATABASE_URL",
        "carries the privileged credentials migrations need, which the application role deliberately lacks",
      ),
    );
  }
  return value;
}
