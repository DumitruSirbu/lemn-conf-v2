-- M8B Lot 2 wave S1. ADR 0172 Amendment F (P6, P8, Q-F3-3, Q-F3-9): the four columns "My kitchens" reads and
-- writes on a design. The plan is `docs/milestones/M8B-account-screens-lot2-plan.md`, section 2.4 step 2.
--
-- Every column is nullable, and deliberately: every design written before this migration, and every design made
-- by a visitor who never registers, has none of these things. NULL is the honest value, and every read treats it
-- as "not named", "not sent", "not hidden", "not deleted", never as an error.
--
-- `name` is the title the person gave the kitchen. It is a backstop on shape, not the rule: the code
-- (`judgeKitchenName`, wave S2) trims, normalises, refuses control characters and refuses an empty name
-- (`REQUIRED`), so naming a kitchen never stores NULL or an empty string. NULL means only "never named": every
-- legacy row and every visitor's design. The database check admits 1 to 120 characters, so an empty string cannot
-- be stored. `.` counts characters, not bytes, and a regular expression is used because the unattended screen
-- refuses `char_length(…)` as a function call (`0014` and `0015` do the same).
--
-- `sent_at` is set when the customer's request for this kitchen is stored (owner ruling O6, 2026-10-19), whether
-- or not the shop's e-mail then succeeds, because operators filter by this flag even when sending fails. It is
-- written by the contact flow (wave S5), never by this migration, and never cleared. **No existing row is
-- backfilled**: the backfill is open question O11, and a backfill would be an UPDATE, which the unattended
-- screen refuses.
--
-- `hidden_by_client_at` is the client hiding a sent kitchen from their own list (Q-F3-9). The row stays, and the
-- shop still sees the request.
--
-- `deleted_by_client_at` is the client deleting a draft (P8). The application role holds no DELETE on `designs`
-- (ADR 0172 decision 10), so a delete is a mark; physical removal is left to a later retention or erasure job.
--
-- `hidden_by_client_at` and `deleted_by_client_at` are **access-control columns**: once set, the gate (wave S4)
-- refuses to open, save or share the design. They are not constrained against `sent_at` here (only a sent
-- kitchen may be hidden and only an unsent one deleted): that is the store's rule (wave S3), and a check that
-- reads two columns could be broken by a later ruling only by a new migration.
--
-- No index. The list reads through `designs_account_id_updated_at_idx` (`0015`) and filters the two marks on the
-- few rows one account owns.
--
-- No grant is needed: `app_designs` already holds table-level UPDATE on `designs` (ADR 0019 decision 11, an
-- accepted risk), which covers all four columns. **That grant means an SQL injection can set or clear
-- `hidden_by_client_at` and `deleted_by_client_at` on any design, making a design unopenable or opening it
-- again, and can set `sent_at`; the accepted risk grows again, to two more access-control columns after
-- `write_token_hash` and `account_id` (ADR 0019 decision 11, dated note of 2026-10-18).**
--
-- **APPLY THIS BEFORE THE WEB CODE THAT READS IT SHIPS.** The order is load-bearing, as `0015`'s header states
-- it: once the kitchen store and the gate name these columns, every query that does answers 500 against a
-- database without them. Applying this first is harmless in the other direction: the columns and the check are
-- additive, and the code that came before never names them.
--
-- Check the target database's ledger reads 1-15 before running, and 1-16 after (ADR 0020: verify by reading
-- the schema, never by this command's exit status). The number is provisional until the M8C merge settles
-- which migration numbers the base holds (ADR 0172, Remaining items 1 and 9).
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records
-- a checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration,
-- never an edit to this file and never relabelling the ledger.
alter table designs
  add column if not exists name text,
  add column if not exists sent_at timestamptz,
  add column if not exists hidden_by_client_at timestamptz,
  add column if not exists deleted_by_client_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'designs_name_length'
      and conrelid = 'designs'::regclass
  ) then
    alter table designs add constraint designs_name_length
      check (name is null or name ~ '^.{1,120}$');
  end if;
end $$;
