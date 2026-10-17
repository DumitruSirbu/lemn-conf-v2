-- M8B wave L1. ADR 0169 decision 3: a session is 256 random bits in a host-only cookie, and the server
-- keeps only the SHA-256 of that value. This table is the server's half.
--
-- `token_hash` is the primary key rather than a surrogate id: every lookup this table serves is "does this
-- hash name a live row", so the key is the query. The check is `0003`'s, `0005`'s and `0006`'s shape,
-- because the value is the same shape: a lowercase hex SHA-256 is 64 characters from `[0-9a-f]`, and `''`
-- is the one degenerate value a hash comparison would otherwise accept from a guessable input. The
-- cookie's value is never stored, so a read of this table cannot be replayed as a session.
--
-- `account_id` references `accounts (id) on delete cascade`: a deleted account leaves no session. This is
-- a table created here, so `migration-safety.ts`'s allowance for `on delete` inside `create table if not
-- exists` applies; the cascade is a no-op on a database that already has the table.
--
-- `last_seen_at` is what the idle expiry reads (it plus the role's idle lifetime). `absolute_expires_at` is
-- fixed at creation and never extended. `revoked_at` is set by logout, logout everywhere and password
-- reset. Nothing is deleted: revocation is an UPDATE of a timestamp, and the application role holds no
-- DELETE.
--
-- There is no IP address and no user agent, by minimisation: nothing reads them.
--
-- The partial index serves "every live session of this account", which logout everywhere and a password
-- reset both ask; revoked rows stay out of it. A resolve by `token_hash` needs no index of its own.
--
-- **Sessions are never exported to a backup.** A restore cannot revive one (ADR 0169 decision 10).
--
-- **APPLY THIS BEFORE THE CODE THAT READS IT SHIPS, AND BEFORE THE GRANT**, and after `0012`, which it
-- references. Every authenticated request reads this table. The grant is the owner's separate step:
--
--   GRANT SELECT, INSERT ON TABLE public.account_sessions TO app_designs;
--   GRANT UPDATE (last_seen_at, revoked_at) ON TABLE public.account_sessions TO app_designs;
--
-- No DELETE, no TRUNCATE, no ALL, no WITH GRANT OPTION, nothing to PUBLIC, and no UPDATE of `token_hash`,
-- `account_id`, `created_at` or `absolute_expires_at`.
--
-- Check the target database's ledger reads 1-12 before running, and 1-13 after (ADR 0020: verify by
-- reading the schema, never by this command's exit status).
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records
-- a checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration,
-- never an edit to this file and never relabelling the ledger.
create table if not exists account_sessions (
  token_hash text primary key
    constraint account_sessions_token_hash_is_sha256 check (token_hash ~ '^[0-9a-f]{64}$'),
  account_id text not null references accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists account_sessions_live_by_account_idx
  on account_sessions (account_id) where revoked_at is null;
