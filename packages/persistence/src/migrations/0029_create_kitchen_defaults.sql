-- ADR 0178 (A-9, F1, F7): the new-kitchen defaults the manufacturer saves in the dashboard, the settings a kitchen is created
-- with. There is exactly one set, so the table is a **seeded singleton** in `0009`'s pattern (`csp_report_cursor`) and
-- `0024`'s (`price_book_draft`): `singleton` is the primary key, is checked to be true, and the one row is inserted below.
-- The application never inserts into it; it only updates the row, which is why the grant below has no `INSERT`.
--
-- The defaults are **not** the pricing fallback. A design is given them when it is created, stamped into its own settings,
-- and a design already saved never reads them again, so a save here changes no price and no saved kitchen. They are
-- unversioned and apply at once.
--
-- `revision` is the compare-and-set of a save: a save names the revision it read and moves it by one only while that is
-- still the stored one, in one statement with the availability head's own compare-and-set (`0025`). Of a save, a publish
-- and an availability write that read the same head, at most one succeeds. It starts at 0, which is the row that was
-- seeded and has never been saved, and only ever grows. It is opaque to the application, which compares it for equality
-- and never does arithmetic on it above SQL.
--
-- `defaults` is the JSON object of the settings, as the domain builds it. It is seeded `{}`. **Whether a save has ever
-- happened is `revision`, not the content**: a save of `{}` is a save, and the row then holds revision 1. The application
-- reads revision 0 as "none saved" and anything above as saved. `defaults` is checked to be an object and to hold at most
-- 64 KiB of `jsonb` text (65536 bytes), far above the six settings a save holds and above what `jsonb` adds in spaces to
-- the application's own, lower limit (16 KiB of compact JSON, checked before any statement), so no credential can make a
-- row that every new kitchen must then load. The ceiling must be in the first apply; it cannot be added later to a row
-- that already holds more.
--
-- `saved_at` is `now()` by default and is set again by the code with the literal `now()`. `saved_by_account_id` is the
-- staff member whose live session saved last, in the shape of `accounts.id` and null until the first save, with no foreign
-- key (`0015`'s precedent). Both are written by the statement from the session in the same statement, never from a
-- parameter.
--
-- The row is seeded with `insert … on conflict do nothing`, so a re-run changes no data and never resets defaults that
-- have been saved. `migration-safety.ts` accepts that shape (`insert into … values (…) on conflict … do nothing`).
--
-- The grants are the owner's separate step:
--
--   GRANT SELECT ON TABLE public.kitchen_defaults TO app_designs;
--   GRANT UPDATE (revision, defaults, saved_at, saved_by_account_id) ON TABLE public.kitchen_defaults TO app_designs;
--
-- No INSERT, no DELETE, no TRUNCATE, no ALL, no WITH GRANT OPTION, nothing to PUBLIC, and no UPDATE of `singleton`.
--
-- The usage count of a design reads `designs`, which the application role already holds `SELECT` on, and a save also
-- reads and updates `catalogue_availability_head` under `0025`'s grants: nothing is granted on either here.
--
-- **The defaults are not in the nightly export** (which covers `designs` alone), so a restore does not bring them back: a
-- restored database starts new kitchens from the fixed fallbacks until the defaults are saved again.
--
-- **Apply this before any code that reads it runs, and before the grants.** Code that reads or saves the defaults, or
-- counts the kitchens that use an item, fails against a database that lacks the table or the grants above.
--
-- Check the target database's ledger reads 1-28 before running, and 1-29 after (ADR 0020: verify by reading the schema,
-- never by this command's exit status).
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records a
-- checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration, never an
-- edit to this file and never relabelling the ledger.
create table if not exists kitchen_defaults (
  singleton boolean primary key default true
    constraint kitchen_defaults_is_one_row check (singleton),
  revision bigint not null
    constraint kitchen_defaults_revision_is_not_negative check (revision >= 0),
  defaults jsonb not null
    constraint kitchen_defaults_is_an_object check (jsonb_typeof(defaults) = 'object')
    constraint kitchen_defaults_size check (octet_length(defaults::text) <= 65536),
  saved_at timestamptz not null default now(),
  saved_by_account_id text
    constraint kitchen_defaults_saved_by_account_id_shape check (saved_by_account_id ~ '^[A-Za-z0-9_-]{21}$')
);

insert into kitchen_defaults (singleton, revision, defaults) values (true, 0, '{}') on conflict do nothing;
