-- M8B wave L1. ADR 0169 decisions 8 and 9: a design claimed by a confirmed account opens, saves and shares
-- for that account on any device. This column is what "claimed" means at the database: the id of the
-- owning account, set by the claim and by a mint made while signed in. It sits beside `visitor_hash` and
-- `write_token_hash` (`0005`, `0002`), which a claim leaves untouched.
--
-- Nullable, and deliberately: every design written before this migration, and every design made by a
-- visitor who never registers, has no account. NULL is the honest value, and every read treats a null
-- `account_id` as "not claimed", not as an error.
--
-- The check is the shape of `accounts.id` (`0012`), and a null passes it. Wrapped in a DO block for the
-- reason `0003` and `0005` give: Postgres has no `add constraint if not exists`, and every statement here
-- must be re-runnable.
--
-- **There is no foreign key to `accounts (id)`, on purpose.** The unattended screen recognises only a
-- `check` in a guarded DO block, and reads `references accounts (id)` inside an add-column clause as a call
-- to a function named `accounts`, which is not on its allow-list. The `contact_submissions.design_id`
-- precedent applies (`0008`): code keeps the link correct, and erasure (a later wave) deletes a person's
-- designs before their account.
--
-- The index answers resume by account and, later, "My kitchens": the account's most recently updated
-- design is `where account_id = $1 order by updated_at desc, id desc limit 1`. The partial predicate keeps
-- the unclaimed rows out of it.
--
-- No grant is needed: `app_designs` already holds table-level UPDATE on `designs` (ADR 0019 decision 11,
-- an accepted risk), which covers the new column. **That grant means an SQL injection can reassign
-- `account_id` on any design**, moving a design onto, or off, an account; `account_id` is an access-control
-- column and the risk, accepted in 2026-08 for `write_token_hash`, now covers it (ADR 0019 decision 11, dated
-- note of 2026-10-18).
--
-- **APPLY THIS BEFORE THE WEB CODE THAT READS IT SHIPS.** The order is load-bearing, as `0004`'s and
-- `0005`'s headers state it: once the claim and the gate name this column, every query that does answers
-- 500 against a database without it. Applying this first is harmless in the other direction: the column,
-- the constraint and the index are all additive, and the code that came before never names any of them.
--
-- Check the target database's ledger reads 1-14 before running, and 1-15 after (ADR 0020: verify by
-- reading the schema, never by this command's exit status).
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records
-- a checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration,
-- never an edit to this file and never relabelling the ledger.
alter table designs add column if not exists account_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'designs_account_id_shape'
      and conrelid = 'designs'::regclass
  ) then
    alter table designs add constraint designs_account_id_shape
      check (account_id is null or account_id ~ '^[A-Za-z0-9_-]{21}$');
  end if;
end $$;

create index if not exists designs_account_id_updated_at_idx
  on designs (account_id, updated_at desc, id desc) where account_id is not null;
