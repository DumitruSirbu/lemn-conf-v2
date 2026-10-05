/**
 * The `schema_migrations` ledger SQL: the record of which migrations this database has run. The rules for a ledger read
 * live in `migration-plan.ts`, the lock and the transaction in `migrate.ts`.
 */

/**
 *
 * The ledger cannot be introduced by a migration file (a table creating the record of its own creation), so the runner
 * creates it on every run, inside the same transaction and after the advisory lock. `if not exists` makes that safe on
 * a database where migrations already ran, and the lock keeps two runners from racing (a concurrent `create table if
 * not exists` can fail under a race). It lives in TypeScript, not a `.sql` file, because the build copies only
 * `src/migrations` into `dist` (ADR 0013).
 *
 */
export const CREATE_MIGRATION_LEDGER_SQL = `
create table if not exists schema_migrations (
  version integer primary key,
  file_name text not null,
  checksum text not null,
  applied_at timestamptz not null default now()
)`;

/** The ledger is append-only: these two statements are the only ones this package runs against it, and rewriting a row
 *  would make the checksum guard meaningless (the repair for a mismatch is to revert the file). The primary key
 *  guarantees at the database that one version is recorded at most once even if the lock were not held. */
export const SELECT_APPLIED_MIGRATIONS_SQL = `
select version, file_name, checksum from schema_migrations order by version`;

export const INSERT_APPLIED_MIGRATION_SQL = `
insert into schema_migrations (version, file_name, checksum) values ($1, $2, $3)`;

/**
 * Transaction-scoped, not session-scoped: `pg_advisory_xact_lock` is released when the transaction commits or rolls
 * back, so no code path can leave it held after a crash, whereas a session-scoped lock needs an unlock on every path.
 * The lock covers one migration, not the whole run: a second runner can apply a later file between two of this one's
 * transactions, which is safe because each transaction re-reads the ledger inside the lock and both walk the files in
 * the same order.
 */
export const ACQUIRE_MIGRATION_LOCK_SQL = `select pg_advisory_xact_lock($1::bigint)`;

/** An arbitrary, permanently fixed key: advisory locks share one namespace per database, so nothing else may pick the
 *  same number. Written out so it is greppable. */
export const MIGRATION_ADVISORY_LOCK_KEY = 4_207_691_115;
