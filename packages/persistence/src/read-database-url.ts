function readRequiredUrl(variableName: string, purpose: string): string {
  const value = process.env[variableName];
  if (!value) {
    throw new Error(
      `${variableName} environment variable is not set. It ${purpose}. Set it in .env.local ` +
        `(or .env.migration.local for migration credentials), or in the deployment environment.`,
    );
  }
  return value;
}

/** Reads `DATABASE_URL`, the application's own connection. No fallback and no override parameter —
 *  deliberate: a silently-accepted alternate value could point at an unintended database. Throws a
 *  named, explicit error rather than letting a missing connection string surface as a cryptic
 *  driver failure. */
export function readDatabaseUrl(): string {
  return readRequiredUrl(
    "DATABASE_URL",
    "is the application's Postgres connection",
  );
}

/**
 * Reads `MIGRATION_DATABASE_URL`, used only to apply migrations.
 *
 * Deliberately a different variable from `DATABASE_URL`: the application connects with a
 * least-privilege role that holds `SELECT, INSERT, UPDATE` on `designs` and nothing else, so it
 * *cannot* run DDL — that is the security property, not an oversight (M2 work item 8, and
 * `docs/decisions/2026-08-25-least-privilege-database-role.md`). Applying schema changes therefore
 * needs a separate, more privileged connection, and keeping it in its own variable means the
 * running application never holds credentials that can drop a table.
 *
 * There is no fallback to `DATABASE_URL`: falling back would silently reintroduce the very
 * privilege separation this exists to enforce, and would fail later with a confusing permission
 * error instead of an explicit one here.
 */
export function readMigrationDatabaseUrl(): string {
  return readRequiredUrl(
    "MIGRATION_DATABASE_URL",
    "carries the privileged credentials migrations need, which the application role deliberately lacks",
  );
}
