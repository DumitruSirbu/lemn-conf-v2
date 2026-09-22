-- M7 wave 7E3a. ADR 0114 decision 5: a design is readable only in the browser that owns it, and
-- this column is what "owns" means at the database — a SHA-256 digest of the `__Host-` visitor
-- cookie, never the cookie itself.
--
-- Nullable, and deliberately: every row written before this migration ran (development and preview
-- data, and the five production rows of the seeded fixture) has no visitor to attribute it to. ADR
-- 0114 decision 5 states this outcome by name — "have no owner and are therefore unreadable —
-- pre-launch data" — so a not-null column here would either invent an owner for rows that never had
-- one or fail outright on a table that already holds them. NULL is the honest value, and every read
-- this wave adds treats a null hash as unresumable, not as an error.
--
-- The check constraint is the same shape as `0003`'s for `write_token_hash`, because the values are
-- the same shape: a lowercase hex SHA-256 digest is 64 characters from `[0-9a-f]`, and `''` is the
-- one degenerate value that would make a hash comparison satisfiable by a guessable input. Wrapped
-- in a DO block for the same reason `0003` is — Postgres has no `add constraint if not exists`, and
-- this runner re-runs every file on every invocation.
--
-- The index answers D3's resume query directly: "the visitor's most recently updated design" is
-- `where visitor_hash = $1 order by updated_at desc, id desc limit 1`, and the partial
-- `where visitor_hash is not null` keeps the never-owned rows above out of it — there is nothing for
-- a resume to plan against there, and every one of them would otherwise bloat an index entry that
-- exists only to make a hash lookup fast.
--
-- **APPLY THIS BEFORE THE WEB CODE THAT READS IT SHIPS.** The order is load-bearing, not a
-- preference, exactly as `0004`'s header states it: every mint names this column in its insert, and
-- every resume that carries a cookie selects it in D3's query. Against a database without the
-- column, the driver raises, and every mint and every resume answers 500 — which presents as an
-- outage rather than as a missed migration. Applying this first is harmless in the other direction:
-- the column, the constraint and the index are all additive, and the code that came before this
-- migration never named any of them.
--
-- Check the target database's ledger reads 1-4 before running, and 1-5 after (ADR 0020: verify by
-- reading the schema, never by this command's exit status).
--
-- **Once this file has been applied anywhere, its bytes are frozen — comments included.** The
-- ledger records a checksum over the whole file, so editing even a line of this header makes every
-- later run refuse with `MigrationChecksumMismatchError` against every database that already ran
-- it. Tidying a comment here is therefore a schema incident, not a tidy-up.
--
-- The fix is a new migration. It is never an edit to this file, and it is never relabelling the
-- ledger — deleting the recorded row so the new bytes are re-recorded silently discards the only
-- evidence of what the database actually ran, and on a database holding real rows it makes the
-- ledger a record of the file as it is now rather than of the migration that was applied.
alter table designs add column if not exists visitor_hash text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'visitor_hash_is_sha256'
      and conrelid = 'designs'::regclass
  ) then
    alter table designs add constraint visitor_hash_is_sha256
      check (visitor_hash is null or visitor_hash ~ '^[0-9a-f]{64}$');
  end if;
end $$;

create index if not exists designs_visitor_hash_updated_at_idx
  on designs (visitor_hash, updated_at desc, id desc) where visitor_hash is not null;
