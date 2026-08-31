/**
 * The `schema_migrations` ledger: the record of which migrations this database has actually run.
 *
 * Everything here is SQL text and one constant. The rules that decide what to do with a ledger read
 * live in `migration-plan.ts`; the lock and the transaction live in `migrate.ts`.
 */

/**
 * **Bootstrapping.** The ledger has to exist before it can be read, so it cannot be introduced by a
 * migration file — that would be a table creating the record of its own creation. It is instead
 * created by the runner, inside the same transaction and *after* the advisory lock, on every run.
 *
 * `if not exists` is what makes that safe on a database where migrations have already run: on the
 * existing databases the statement finds the table (or creates it, once) and changes nothing else.
 * It never touches `designs`. Two runners cannot race on it, because neither reaches this statement
 * without first holding the lock, and concurrent `create table if not exists` is one of the few
 * Postgres statements that genuinely can fail under a race.
 *
 * It lives in TypeScript rather than a `.sql` file because the build copies only `src/migrations`
 * into `dist`, and a loose `.sql` file next to it would be present in the source tree and missing
 * from the published package — the exact shape of the ADR 0013 failure.
 */
export const CREATE_MIGRATION_LEDGER_SQL = `
create table if not exists schema_migrations (
  version integer primary key,
  file_name text not null,
  checksum text not null,
  applied_at timestamptz not null default now()
)`;

/** The ledger is append-only: these two statements are the only ones this package ever runs against
 *  it, and there is no update and no delete anywhere. A row is a fact about something that happened,
 *  and rewriting it would make the checksum guard meaningless — the repair for a mismatch is to
 *  revert the file, not to relabel history. The primary key is a second, database-level guarantee
 *  that one version is recorded at most once even if the lock were somehow not held. */
export const SELECT_APPLIED_MIGRATIONS_SQL = `
select version, file_name, checksum from schema_migrations order by version`;

export const INSERT_APPLIED_MIGRATION_SQL = `
insert into schema_migrations (version, file_name, checksum) values ($1, $2, $3)`;

/**
 * **Transaction-scoped, not session-scoped.** `pg_advisory_xact_lock` is released by Postgres when
 * the transaction commits or rolls back, which answers "what if a migration process dies holding
 * it?" without an answer: there is no code path, not even an uncaught exception or a `process.exit`
 * between statements, that can leave the lock held. A session-scoped `pg_advisory_lock` would need
 * a matching unlock on every path and would additionally rely on the server noticing a dropped
 * connection before the next deploy could proceed.
 *
 * The cost is that the lock covers one migration, not the whole run: a second runner can apply a
 * later file between two of this one's transactions. That is deliberate and safe — every
 * transaction re-reads the ledger *inside* the lock, so a runner never acts on a stale view, and
 * both runners walk the files in the same order.
 */
export const ACQUIRE_MIGRATION_LOCK_SQL = `select pg_advisory_xact_lock($1::bigint)`;

/** An arbitrary but permanently fixed key. Advisory locks share one namespace per database, so the
 *  only requirement is that nothing else in this database picks the same number; it is written out
 *  here so it is greppable rather than derived from something that could change. */
export const MIGRATION_ADVISORY_LOCK_KEY = 4_207_691_115;
