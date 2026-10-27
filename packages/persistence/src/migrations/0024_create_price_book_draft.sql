-- M10 wave S2. Plan `docs/milestones/M10-price-dashboard.md` section 9.2, ADR 0178 (A-15, F7) and its amendment of
-- 2026-10-27: the manufacturer's price draft, the ordered changes awaiting publication. There is exactly one draft, so
-- the table is a **seeded singleton** in `0009`'s pattern (`csp_report_cursor`): `singleton` is the primary key, is
-- checked to be true, and the one row is inserted below. The application never inserts into it (F7); it only updates the
-- row, which is why the grant below has no `INSERT`.
--
-- `revision` is the draft's compare-and-set: a write names the revision it read and moves it by one only while that is
-- still the stored one, so a stale writer changes nothing. It starts at 0 and only ever grows, and a publish moves it too
-- (the draft is then empty at a revision no earlier reader holds). It is opaque to the application, which compares it
-- for equality and never does arithmetic on it above SQL.
--
-- `changes` is the JSON array of the draft's changes, each an address and a value as the domain builds them. It is
-- seeded `[]`, which is a draft with no change. `base_version_id` is the version the draft last started from (the one a
-- publish just inserted), `updated_by_account_id` the staff member whose live session wrote it last; both are in the
-- shape of the ids they hold and neither is a foreign key (`0015`'s precedent). `updated_at` is `now()` by default and is
-- set again by the code with the literal `now()`.
--
-- The row is seeded with `insert … on conflict do nothing`, so a re-run changes no data and never resets a draft that
-- already holds changes. The unattended screen recognises that shape (`insert into … values (…) on conflict … do
-- nothing`).
--
-- The grant is the owner's separate step:
--
--   GRANT SELECT ON TABLE public.price_book_draft TO app_designs;
--   GRANT UPDATE (revision, changes, base_version_id, updated_at, updated_by_account_id)
--     ON TABLE public.price_book_draft TO app_designs;
--
-- No INSERT, no DELETE, no TRUNCATE, no ALL, no WITH GRANT OPTION, nothing to PUBLIC, and no UPDATE of `singleton`.
--
-- **The draft is not in the nightly export** (which covers `designs` alone), so a restore does not bring it back.
--
-- **APPLY THIS BEFORE THE CODE THAT READS IT SHIPS, AND BEFORE THE GRANT.** Without the table the dashboard answers 503.
--
-- Check the target database's ledger reads 1-23 before running, and 1-24 after (ADR 0020: verify by reading the schema,
-- never by this command's exit status).
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records a
-- checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration, never an
-- edit to this file and never relabelling the ledger.
create table if not exists price_book_draft (
  singleton boolean primary key default true
    constraint price_book_draft_is_one_row check (singleton),
  revision bigint not null
    constraint price_book_draft_revision_is_not_negative check (revision >= 0),
  changes jsonb not null
    constraint price_book_draft_changes_is_an_array check (jsonb_typeof(changes) = 'array'),
  base_version_id text
    constraint price_book_draft_base_version_id_shape check (base_version_id ~ '^[A-Za-z0-9_-]{21}$'),
  updated_at timestamptz not null default now(),
  updated_by_account_id text
    constraint price_book_draft_updated_by_account_id_shape check (updated_by_account_id ~ '^[A-Za-z0-9_-]{21}$')
);

insert into price_book_draft (singleton, revision, changes) values (true, 0, '[]') on conflict do nothing;
