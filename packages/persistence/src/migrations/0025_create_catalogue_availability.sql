-- M10 wave S2 (S2b folded in on 2026-10-27, coordinator ruling B). Plan `docs/milestones/M10-price-dashboard.md`
-- section 9.2 and A-17, ADR 0178 (A-17, F1, F7) and its amendment of 2026-10-27: which catalogue items the manufacturer
-- has switched off, an append-only log, and the one-row head that numbers it.
--
-- **Two tables, one file.**
--
-- `catalogue_availability_head` is a **seeded singleton** in `0009`'s pattern (`csp_report_cursor`): `singleton` is the
-- primary key, is checked to be true, and the row is inserted below with `revision` 0. Every write that changes what
-- is on sale (an item switched on or off, a kitchen-defaults save, a publish) moves it by one or more with
-- `update … set revision = revision + n where revision = <the one the writer read>`, so of two writers at one revision
-- the second changes no row and is refused. It is the lock those writes share. The application only updates it, which is
-- why its grant has no `INSERT`.
--
-- `catalogue_availability_changes` is the log: one row per change of one item, with the head's revision that change
-- produced as its **primary key**. **Nothing here numbers a row: there is no counter object, no identity column and no
-- hook that runs on insert.** The unattended screen refuses a counter object, and a hook would hide the rule from a
-- reader of the code. A row's revision is the value the head's own update returned, inside the same statement that
-- inserts the row, so the log's revision always equals the head revision its statement produced. The head's revisions
-- have no gap; the log's may, because a kitchen-defaults save, and a publish that creates no item, move the head without
-- writing a row. The current state of an item is its latest row, and the state at a revision is the replay of the log up
-- to it.
--
-- `item_kind` and `item_id` name the item (a material or hardware class by its tier id, a colour by its finish id, a
-- handle by its code, an accessory by its id). **They are shape checks, not lists:** the closed list of kinds is code,
-- so a later kind drops no constraint, and the id has the shape of an audit detail's id (1 to 64 characters, the first
-- a letter or digit). `active` is the new state. `changed_at` is `now()` by default and **not in the grant**, so a leaked
-- credential cannot back-date a change. `changed_by_account_id` is the staff member whose live session switched the item,
-- in the shape of `accounts.id`, with no foreign key (`0015`'s precedent).
--
-- **Accepted residual (plan risk RK-22, beside ADR 0173's F1 and F2):** a holder of the application credential can insert a log row at a
-- revision the head has not reached, because the grant must include `revision` and no check can tie a row to the head.
-- The audit row of that change is missing and the head lags the log's largest revision; the owner's runbook reads
-- `max(revision)` of the log against the head. The application reads the log only up to the head's revision.
--
-- The head row is seeded with `insert … on conflict do nothing`, so a re-run changes no data and never resets a head
-- that has moved.
--
-- The grants are the owner's separate step:
--
--   GRANT SELECT ON TABLE public.catalogue_availability_head TO app_designs;
--   GRANT UPDATE (revision) ON TABLE public.catalogue_availability_head TO app_designs;
--   GRANT SELECT ON TABLE public.catalogue_availability_changes TO app_designs;
--   GRANT INSERT (revision, item_kind, item_id, active, changed_by_account_id)
--     ON TABLE public.catalogue_availability_changes TO app_designs;
--
-- No INSERT on the head, no UPDATE and no DELETE on the log, no TRUNCATE, no ALL, no WITH GRANT OPTION, nothing to
-- PUBLIC, and no INSERT on `changed_at`.
--
-- **The log is not in the nightly export** (which covers `designs` alone), so a restore does not bring it back. Wave S6
-- adds it.
--
-- **APPLY THIS BEFORE THE CODE THAT READS IT SHIPS, AND BEFORE THE GRANTS.** Without the tables the catalogue and the
-- publish answer 503.
--
-- Check the target database's ledger reads 1-24 before running, and 1-25 after (ADR 0020: verify by reading the schema,
-- never by this command's exit status).
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records a
-- checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration, never an
-- edit to this file and never relabelling the ledger.
create table if not exists catalogue_availability_head (
  singleton boolean primary key default true
    constraint catalogue_availability_head_is_one_row check (singleton),
  revision bigint not null
    constraint catalogue_availability_head_revision_is_not_negative check (revision >= 0)
);

insert into catalogue_availability_head (singleton, revision) values (true, 0) on conflict do nothing;

create table if not exists catalogue_availability_changes (
  revision bigint primary key
    constraint catalogue_availability_changes_revision_is_positive check (revision > 0),
  item_kind text not null
    constraint catalogue_availability_changes_item_kind_shape check (item_kind ~ '^[a-z]{1,16}$'),
  item_id text not null
    constraint catalogue_availability_changes_item_id_shape check (item_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  active boolean not null,
  changed_at timestamptz not null default now(),
  changed_by_account_id text not null
    constraint catalogue_availability_changes_changed_by_account_id_shape check (changed_by_account_id ~ '^[A-Za-z0-9_-]{21}$')
);
