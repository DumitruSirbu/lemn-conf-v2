-- M10 wave S2. Plan `docs/milestones/M10-price-dashboard.md` section 9.2, ADR 0178 (A-15, F7, F10) and its amendment of
-- 2026-10-27: where the manufacturer's published price books are kept, one row per version, append-only.
--
-- A version is the whole book as it was published (`book`, a JSON object, stored whole and never edited) and the changes
-- that produced it (`change_summary`, a JSON array of the published draft changes, whose length is the version's change
-- count and is stored nowhere else). A published version never changes: the application role has no `UPDATE`, no
-- `DELETE` and no `TRUNCATE` on this table, so a restore or a correction is a new version, never an edit of an old one.
--
-- **There is no `state` column.** The active version is the row with the greatest `sequence_number` (F7); an archived
-- version is any other. `sequence_number` starts at 1 and the application inserts the next number only when the one it
-- was shown is still the newest, so of two publishes racing at the same number the second meets the uniqueness
-- constraint below and is refused (`changed-meanwhile`). No gap is allowed by the application either.
--
-- `id` is an opaque `nanoid` made by the application, the shape of a design's id, never derived from a counter, a time
-- or the database. `published_by_account_id` is the staff member whose live session published it (or the owner's account
-- the seed command was given); it has the shape of `accounts.id` and **no foreign key, on purpose** (`0015`'s precedent):
-- a version must not block a later erasure of an account, and code keeps the link correct.
--
-- `label` is 1 to 80 characters and `note` at most 240, the bounds of `MAX_BOOK_NAME_LENGTH` and
-- `MAX_BOOK_DESCRIPTION_LENGTH` in the domain's price book parser; the character rule (NFC, no control or bidi-override
-- character) is the domain's, applied before the insert. `book` and `change_summary` are each bounded to 4 MiB of
-- `jsonb` text (4194304 bytes), `0011`'s ceiling for a stored document and for its reason: far above any book the
-- product writes and above what `jsonb` adds in spaces to the application's own, lower limit (2 MiB of compact JSON
-- whose numbers are all whole, checked before any statement; `jsonb` prints any other number out in full), so no honest book meets it and no credential can make a row that every price surface
-- must then load. The ceiling must be in the first apply; it cannot be added to a table that holds versions.
--
-- `published_at` is `now()` by default and is **not in the grant**, so a leaked credential cannot back-date or
-- forward-date a version (`0011`'s `created_at` reasoning).
--
-- **Accepted residual, stated plainly (security review L1, 2026-10-27).** The application credential holds `INSERT`
-- on this table, so whoever holds it can insert a newest version, and the newest version is the one prices are read
-- from: the prices go live with no `price-published` audit row, because the audit row is written by the application's
-- own publish and not by the table. No check in the database can tie a row to an audit row (a trigger was declined).
-- What detects it is the owner's runbook cross-check: every version beyond the first (the seed writes the first, with no
-- audit row, on purpose) has a `price-published` row in `staff_audit_events` whose `sequenceNumber` is its own. A
-- version without one was not published by the application.
--
-- The grant is the owner's separate step:
--
--   GRANT SELECT ON TABLE public.price_book_versions TO app_designs;
--   GRANT INSERT (id, sequence_number, label, note, book, change_summary, published_by_account_id)
--     ON TABLE public.price_book_versions TO app_designs;
--
-- No UPDATE, no DELETE, no TRUNCATE, no ALL, no WITH GRANT OPTION, nothing to PUBLIC, and no INSERT on `published_at`.
--
-- **Price book versions are not in the nightly export** (which covers `designs` alone), so a restore does not bring them
-- back. Wave S6 adds them.
--
-- **APPLY THIS BEFORE THE CODE THAT READS IT SHIPS, AND BEFORE THE GRANT.** Until the table, its grant and the seed
-- command's first version exist, every price surface renders no figure (A-10) and the dashboard answers 503.
--
-- The number was renumbered on 2026-10-27 (ruling A), as the plan's section 9.2 states, so that the set of migrations
-- stays a run with no gap. Check the target database's ledger reads 1-22 before running, and 1-23 after (ADR 0020:
-- verify by reading the schema, never by this command's exit status).
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records a
-- checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration, never an
-- edit to this file and never relabelling the ledger.
create table if not exists price_book_versions (
  id text primary key
    constraint price_book_versions_id_shape check (id ~ '^[A-Za-z0-9_-]{21}$'),
  sequence_number bigint not null
    constraint price_book_versions_sequence_number_is_positive check (sequence_number > 0)
    constraint price_book_versions_sequence_number_is_unique unique,
  label text not null
    constraint price_book_versions_label_length check (char_length(label) between 1 and 80),
  note text not null
    constraint price_book_versions_note_length check (char_length(note) <= 240),
  book jsonb not null
    constraint price_book_versions_book_is_an_object check (jsonb_typeof(book) = 'object')
    constraint price_book_versions_book_size check (octet_length(book::text) <= 4194304),
  change_summary jsonb not null
    constraint price_book_versions_change_summary_is_an_array check (jsonb_typeof(change_summary) = 'array')
    constraint price_book_versions_change_summary_size check (octet_length(change_summary::text) <= 4194304),
  published_at timestamptz not null default now(),
  published_by_account_id text not null
    constraint price_book_versions_published_by_account_id_shape check (published_by_account_id ~ '^[A-Za-z0-9_-]{21}$')
);
