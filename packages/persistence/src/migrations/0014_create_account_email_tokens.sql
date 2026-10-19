-- M8B wave L1. ADR 0172 decisions 1 and 5: the single-use links in the mail a customer is sent, to confirm
-- an address and to reset a password. This table holds the server's half of each link.
--
-- `token_hash` is the primary key and a SHA-256 hex digest, with `0006`'s check that also refuses `''`. The
-- link carries the token and the table keeps only its hash, so a read of this table cannot be turned into a
-- working link.
--
-- `account_id` references `accounts (id) on delete cascade`: a deleted account leaves no token.
--
-- `purpose` is a shape check, not a list: the closed list (`verify-email`, `reset-password`) lives in code,
-- so a later purpose (a staff invitation, an e-mail change) drops no constraint.
--
-- `created_at` is how only the newest unused token of a purpose is honoured. `expires_at` is set by the code
-- (24 hours to confirm, 30 minutes to reset, ADR 0172 decision 5). `used_at` makes a token single-use.
-- Nothing is deleted: use is an UPDATE of a timestamp, and the application role holds no DELETE.
--
-- The partial index serves "the newest unused token of this purpose for this account"; used rows stay out
-- of it.
--
-- **Tokens are never exported to a backup.** A restore cannot revive one (ADR 0172 decision 10).
--
-- **APPLY THIS BEFORE THE CODE THAT READS IT SHIPS, AND BEFORE THE GRANT**, and after `0012`, which it
-- references. Registration, confirmation and reset name this table. The grant is the owner's separate step:
--
--   GRANT SELECT, INSERT ON TABLE public.account_email_tokens TO app_designs;
--   GRANT UPDATE (used_at) ON TABLE public.account_email_tokens TO app_designs;
--
-- No DELETE, no TRUNCATE, no ALL, no WITH GRANT OPTION, nothing to PUBLIC, and no UPDATE of any column but
-- `used_at`.
--
-- Check the target database's ledger reads 1-13 before running, and 1-14 after (ADR 0020: verify by
-- reading the schema, never by this command's exit status).
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records
-- a checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration,
-- never an edit to this file and never relabelling the ledger.
create table if not exists account_email_tokens (
  token_hash text primary key
    constraint account_email_tokens_token_hash_is_sha256 check (token_hash ~ '^[0-9a-f]{64}$'),
  account_id text not null references accounts (id) on delete cascade,
  purpose text not null
    constraint account_email_tokens_purpose_shape check (purpose ~ '^[a-z-]{1,32}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists account_email_tokens_newest_unused_idx
  on account_email_tokens (account_id, purpose, created_at desc) where used_at is null;
