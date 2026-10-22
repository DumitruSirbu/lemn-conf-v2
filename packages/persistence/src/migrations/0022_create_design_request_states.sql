-- M8B Lot 3 wave L3-S1. Plan `docs/milestones/M8B-account-screens-lot3-plan.md` section 2.3, ADR 0173 (P-L3-8,
-- proposed): the status the shop's staff give a sent request ("Nouă", "Contactat", "Ofertă trimisă", "Închisă"). One row
-- per **design**, upserted, so the table holds the current status and not its history; the history is in the audit log
-- (`0020`, action `status-changed`). Nothing is built that writes this table yet; the store is a later wave (L3-S5).
--
-- **No row means "Nouă"** for a sent kitchen (P-L3-8): a request has no state row until staff first set one, so this
-- migration backfills nothing and a re-run changes no data. The status survives the client's hiding and unhiding of the
-- kitchen. That a status is set only on a sent kitchen (`designs.sent_at` is not null) is the store's rule (wave L3-S5),
-- not the table's: a check cannot read another table, and a later ruling would need a new migration to loosen it.
--
-- `design_id` is the primary key, in the shape of `designs.id` (21 characters of `[A-Za-z0-9_-]`), and
-- `changed_by_account_id` the staff member's account in the shape of `accounts.id`. `status` is a shape check, not a
-- list: the closed list (`new`, `contacted`, `offer-sent`, `closed`) is code (wave L3-S2), so a later status drops no
-- constraint. The shape is 1 to 32 characters from `[a-z-]`, `0014`'s `purpose` shape.
--
-- **There is no foreign key, on purpose** (`0015`'s precedent): a status must not block a later erasure of the design or
-- the account it names; code keeps the links correct.
--
-- `changed_at` is `now()` by default and is set again by the code on each change. **It is in the UPDATE grant**, so that
-- a status change can restamp the row (plan section 2.3). Unlike `staff_audit_events.occurred_at`, then, a leaked
-- credential could write any time into it; the true time of a change is the audit row's, which the credential cannot
-- backdate.
--
-- The grant is the owner's separate step:
--
--   GRANT SELECT ON TABLE public.design_request_states TO app_designs;
--   GRANT INSERT (design_id, status, changed_by_account_id) ON TABLE public.design_request_states TO app_designs;
--   GRANT UPDATE (status, changed_by_account_id, changed_at) ON TABLE public.design_request_states TO app_designs;
--
-- No DELETE, no TRUNCATE, no ALL, no WITH GRANT OPTION, nothing to PUBLIC, no INSERT on `changed_at`, and no UPDATE of
-- `design_id`.
--
-- **Request states are not in the nightly export** (which covers `designs` alone), so a restore does not bring them back.
--
-- **APPLY THIS BEFORE THE CODE THAT READS IT SHIPS, AND BEFORE THE GRANT.** The staff kitchen page and the status route
-- name this table; against a database without it they answer 503.
--
-- Check the target database's ledger reads 1-21 before running, and 1-22 after (ADR 0020: verify by reading the schema,
-- never by this command's exit status). The number was re-listed on 2026-10-21, as `0020`'s header states.
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records a
-- checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration, never an
-- edit to this file and never relabelling the ledger.
create table if not exists design_request_states (
  design_id text primary key
    constraint design_request_states_design_id_shape check (design_id ~ '^[A-Za-z0-9_-]{21}$'),
  status text not null
    constraint design_request_states_status_shape check (status ~ '^[a-z-]{1,32}$'),
  changed_by_account_id text not null
    constraint design_request_states_changed_by_account_id_shape check (changed_by_account_id ~ '^[A-Za-z0-9_-]{21}$'),
  changed_at timestamptz not null default now()
);
