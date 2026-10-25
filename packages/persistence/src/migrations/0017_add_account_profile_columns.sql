-- M8B Lot 2 wave S1. ADR 0172 Amendment F and ADR 0118: the two optional profile fields the "Profil" screen
-- (A10) shows, "Nume" and "Adresa / localitate". `0012` left them out on purpose ("Not added, by ADR 0118: no
-- reader yet"); the profile read and save is that reader. The plan is
-- `docs/milestones/M8B-account-screens-lot2-plan.md`, section 2.4 step 2.
--
-- Both are nullable: every account registered before this migration has neither, and neither is ever required.
-- NULL means "not given". The code (`profile-fields.ts`, wave S2) trims, normalises and refuses control
-- characters, and reads an empty field as a request to clear it, which the store (wave S3) writes as NULL; the
-- database check is the backstop and refuses an empty string.
-- `.` counts characters, not bytes, and a regular expression is used because the unattended screen refuses
-- `char_length(…)` as a function call (`0014` and `0015` do the same).
--
-- **The bounds are a backstop, not the rule.** The plan gives none, so these are chosen to sit at or above any
-- limit the domain is likely to set: `name` 1 to 120 characters (the contact form's name is 100), `address`
-- 1 to 200 (its locality is 100). A bound that is too tight cannot be loosened without a new migration, so the
-- domain rule (wave S2) is where the real, tighter limit lives.
--
-- These two columns hold personal data. The privacy notice must list name and address among what an account
-- keeps (plan C11), and the account export (wave S10) must include them. They are not in the nightly export,
-- which covers `designs` only (see the runbook, "The account tables are not in the nightly export").
--
-- **APPLY THIS BEFORE THE CODE THAT READS IT SHIPS, AND BEFORE THE GRANT.** Once the account store names these
-- columns, every profile query answers 500 against a database without them. Adding them first is harmless in
-- the other direction. The grant is the owner's separate step, because `grant` is not a shape the unattended
-- screen recognises:
--
--   GRANT UPDATE (name, address) ON TABLE public.accounts TO app_designs;
--
-- `SELECT` on `accounts` is table-wide and already covers both columns. No INSERT is granted: registration
-- writes neither, and a profile is only ever saved by an UPDATE. No DELETE, no TRUNCATE, no ALL, no WITH
-- GRANT OPTION, nothing to PUBLIC. The runbook section "For 0016-0018" carries the steps and the checks.
--
-- Check the target database's ledger reads 1-16 before running, and 1-17 after (ADR 0020: verify by reading
-- the schema, never by this command's exit status). The number is provisional until the M8C merge settles
-- which migration numbers the base holds (ADR 0172, Remaining items 1 and 9).
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records
-- a checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration,
-- never an edit to this file and never relabelling the ledger.
alter table accounts
  add column if not exists name text,
  add column if not exists address text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'accounts_name_length'
      and conrelid = 'accounts'::regclass
  ) then
    alter table accounts add constraint accounts_name_length
      check (name is null or name ~ '^.{1,120}$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'accounts_address_length'
      and conrelid = 'accounts'::regclass
  ) then
    alter table accounts add constraint accounts_address_length
      check (address is null or address ~ '^.{1,200}$');
  end if;
end $$;
