-- M8B Lot 2 wave S1. ADR 0172 Amendment F, P12 point 1: an e-mail-change link must carry the address it
-- changes to. The row of an `email-change` token holds the new address, so the link in the mail carries only
-- the token and the server reads the address from the row, never from the link. The plan is
-- `docs/milestones/M8B-account-screens-lot2-plan.md`, section 2.4 step 2.
--
-- `new_email` is the address as typed and trimmed; `new_email_normal_form` is the domain's
-- `countedFormOfAddress`, as `accounts.email` and `accounts.email_normal_form` are (`0012`). Both are 3 to 254
-- characters, 254 being `CONTACT_EMAIL_MAX_LENGTH`. `.` counts characters, not bytes, and a regular
-- expression is used because the unattended screen refuses `char_length(…)` as a function call.
--
-- Both are NULL on a `verify-email` or `reset-password` token (`0014`), which is every row that exists today,
-- and both are set on an `email-change` token. The database enforces only that they are set together or not at
-- all, as `accounts.phone` and `phone_normal_form` are (`0012`). **Which purposes must carry them is the
-- code's rule**, not this check's: `purpose` is a shape and not a list (`0014`), so a later purpose drops
-- nothing.
--
-- There is deliberately no unique constraint and no foreign key on the new address. Two accounts may each
-- hold an unused token for the same target; the unique constraint on `accounts.email_normal_form` decides at
-- confirm time, and a confirm that loses answers `link-invalid` (P12 point 6, a residual recorded and
-- accepted for this round).
--
-- **Tokens are never exported to a backup**, so a restore cannot revive one (ADR 0172 decision 10). The new
-- columns change nothing about that.
--
-- **APPLY THIS BEFORE THE CODE THAT READS IT SHIPS, AND BEFORE THE GRANT.** Once the token store names these
-- columns, every token insert answers 500 against a database without them. Adding them first is harmless in
-- the other direction. The grant is the owner's separate step, because `grant` is not a shape the unattended
-- screen recognises:
--
--   GRANT INSERT (new_email, new_email_normal_form) ON TABLE public.account_email_tokens TO app_designs;
--
-- This adds to `0014`'s INSERT grant, which is table-level (`GRANT SELECT, INSERT ON TABLE`) and so already
-- covers a new column; the column-level statement above is harmless beside it and keeps the runbook's
-- privilege checks listing each column by name. No UPDATE is granted on either column: a token's address is
-- written once, with the row, and `used_at` stays the only updatable column. No DELETE, no TRUNCATE, no ALL,
-- no WITH GRANT OPTION, nothing to PUBLIC.
--
-- Check the target database's ledger reads 1-17 before running, and 1-18 after (ADR 0020: verify by reading
-- the schema, never by this command's exit status). The number is provisional until the M8C merge settles
-- which migration numbers the base holds (ADR 0172, Remaining items 1 and 9).
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records
-- a checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration,
-- never an edit to this file and never relabelling the ledger.
alter table account_email_tokens
  add column if not exists new_email text,
  add column if not exists new_email_normal_form text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'account_email_tokens_new_email_length'
      and conrelid = 'account_email_tokens'::regclass
  ) then
    alter table account_email_tokens add constraint account_email_tokens_new_email_length
      check (new_email is null or new_email ~ '^.{3,254}$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'account_email_tokens_new_email_normal_form_length'
      and conrelid = 'account_email_tokens'::regclass
  ) then
    alter table account_email_tokens add constraint account_email_tokens_new_email_normal_form_length
      check (new_email_normal_form is null or new_email_normal_form ~ '^.{3,254}$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'account_email_tokens_new_email_is_set_with_its_normal_form'
      and conrelid = 'account_email_tokens'::regclass
  ) then
    alter table account_email_tokens add constraint account_email_tokens_new_email_is_set_with_its_normal_form
      check ((new_email is null) = (new_email_normal_form is null));
  end if;
end $$;
