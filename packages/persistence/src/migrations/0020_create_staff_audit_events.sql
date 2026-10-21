-- M8B Lot 3 wave L3-S1. Plan `docs/milestones/M8B-account-screens-lot3-plan.md` section 2.3, ADR 0173 (P-L3-3, proposed)
-- and ADR 0172 decision 10: the audit log of the staff area. Every staff read of a client's kitchen and every staff
-- write adds one row here, in the same transaction as the write, or it does not happen. Nothing is built that writes
-- this table yet; the store is a later wave (L3-S3).
--
-- A row holds **ids and codes, never personal data**: no address, no phone, no kitchen name, no note text. The page
-- that shows the log resolves an actor's address, a client's address and a kitchen's name at read time, and shows a
-- dash for one that no longer resolves (P-L3-3). That is why the table needs no column for any of them, and why it
-- can stay a plain record of what was done.
--
-- `id` is an opaque `nanoid`, made by the application, in the shape of `accounts.id` and `designs.id`: 21 characters
-- of `[A-Za-z0-9_-]`. `actor_account_id` is the staff member who acted; `design_id` and `subject_account_id` are the
-- kitchen and the other account the action concerned, each null when it concerned neither. The same shape check
-- applies to all four, and a null passes it where the column is nullable.
--
-- `action` is a shape check, not a list: the closed list of actions (`kitchen-opened`, `note-added`, and the rest) is
-- code, so a later action drops no constraint (ADR 0172 decision 10, and `0014`'s `purpose` for the precedent). The
-- shape is 1 to 32 characters from `[a-z0-9-]`.
--
-- `detail` is nullable and, when present, a JSON **object** (a document encoded twice arrives as a JSON string and
-- would open as nothing, the reason `0011` gives for its own check). It carries codes and counts only (the status a
-- kitchen changed from and to, a role, a number of items), never free text. This migration bounds neither its size nor
-- its keys: the closed shapes are code (wave L3-S2), and a size ceiling would be a number this plan has not ruled.
--
-- **There is no foreign key, on purpose** (`0015`'s precedent, and `0008`'s for a request's design id). An
-- audit row records what was done and must neither block a later erasure of the account or the design it names nor
-- vanish with it; code keeps the links correct.
--
-- `occurred_at` is `now()` by default and is **not in the grant**, so a leaked credential cannot backdate or
-- forward-date a row (`0011`'s `created_at` reasoning). The index is the order the audit page reads and pages by:
-- newest first, with `id` to break a tie.
--
-- Nothing is ever updated or deleted: the log cannot be edited by the application ("Jurnalul nu poate fi modificat").
-- The grant is the owner's separate step:
--
--   GRANT SELECT ON TABLE public.staff_audit_events TO app_designs;
--   GRANT INSERT (id, actor_account_id, action, design_id, subject_account_id, detail)
--     ON TABLE public.staff_audit_events TO app_designs;
--
-- No UPDATE, no DELETE, no TRUNCATE, no ALL, no WITH GRANT OPTION, nothing to PUBLIC, and no INSERT on
-- `occurred_at`.
--
-- **The audit log is not in the nightly export** (which covers `designs` alone), so a restore does not bring it back.
--
-- **APPLY THIS BEFORE THE CODE THAT READS IT SHIPS, AND BEFORE THE GRANT.** The staff routes of the plan fail closed:
-- without this table a staff read of a kitchen answers 503, which is the intended behaviour and not a defect.
--
-- The number was re-listed on this branch and on `origin/main` on 2026-10-21 (this branch holds `0001`-`0019`;
-- `origin/main` holds `0001`-`0011`), and `0020` is the next free one. Check the target database's ledger reads 1-19
-- before running, and 1-20 after (ADR 0020: verify by reading the schema, never by this command's exit status).
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records a
-- checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration, never an
-- edit to this file and never relabelling the ledger.
create table if not exists staff_audit_events (
  id text primary key
    constraint staff_audit_events_id_shape check (id ~ '^[A-Za-z0-9_-]{21}$'),
  occurred_at timestamptz not null default now(),
  actor_account_id text not null
    constraint staff_audit_events_actor_account_id_shape check (actor_account_id ~ '^[A-Za-z0-9_-]{21}$'),
  action text not null
    constraint staff_audit_events_action_shape check (action ~ '^[a-z0-9-]{1,32}$'),
  design_id text
    constraint staff_audit_events_design_id_shape check (design_id ~ '^[A-Za-z0-9_-]{21}$'),
  subject_account_id text
    constraint staff_audit_events_subject_account_id_shape check (subject_account_id ~ '^[A-Za-z0-9_-]{21}$'),
  detail jsonb
    constraint staff_audit_events_detail_is_an_object check (jsonb_typeof(detail) = 'object')
);

create index if not exists staff_audit_events_newest_first_idx
  on staff_audit_events (occurred_at desc, id desc);
