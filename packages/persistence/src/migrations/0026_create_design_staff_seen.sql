-- M10 wave S4. Plan `docs/milestones/M10-price-dashboard.md` section 9.2, ADR 0178 (A-12): the revision of a kitchen
-- that staff last saw. One row per **design**, shared by all staff (ADR 0062, Amendment 5), upserted, so the table
-- holds the current mark and not its history; the history is in the audit log (`0020`, action `kitchen-seen`). It is a
-- table of its own, beside `design_request_states`, and not columns of `contact_submissions`, whose grants are narrow
-- on purpose (ADR 0153 decision 1).
--
-- A kitchen is "changed after seen" when `designs.revision` differs from its effective seen revision: the greater of
-- `seen_revision`, unless that is above the kitchen's own revision, and the design revision of its latest submission.
-- So a stale first mark below the revision a kitchen was sent at cannot make it read as changed, and a mark above the
-- kitchen's revision is ignored: the store refuses an ahead mark and revisions only rise, so no legitimate row holds
-- one. **That comparison is made in SQL, never above it**: a revision is an opaque digit string to every layer above
-- the database. The store writes `seen_revision = greatest(existing, displayed)`, so a stale page marking an older
-- revision after a newer one leaves the newer, and `seen_by_account_id` and `seen_at` change only when the displayed
-- revision is strictly greater, so they always describe the revision kept. Those rules are the statement's, not the
-- table's.
--
-- `design_id` is the primary key, in the shape of `designs.id` as `0021` and `0022` hold it (21 characters of
-- `[A-Za-z0-9_-]`): a kitchen with an older id cannot be marked, and reads as not found. `seen_revision` is a positive
-- `bigint`: a design starts at revision 1 (`0004`). `seen_by_account_id` is the staff member's account, in the shape of
-- `accounts.id`. **There is no foreign key, on purpose** (`0015`'s and `0022`'s precedent): a mark must not block a
-- later erasure of the design or the account it names; code keeps the links correct.
--
-- `seen_at` is `now()` by default, **is in the UPDATE grant** so that a mark can restamp the row, and is outside the
-- INSERT grant. Unlike `staff_audit_events.occurred_at`, then, a leaked credential could write any time into it; the
-- true time of a mark is the audit row's, which the credential cannot backdate.
--
-- **Accepted residual, stated plainly.** The grants must give the application credential `INSERT` and `UPDATE` of
-- `seen_revision`, so whoever holds it can write any seen revision for any design. The statements ignore a mark above
-- the kitchen's current revision, so a forged mark above it hides nothing. A forged mark equal to the revision behaves
-- like a real one: the badge, the counter and the digest show that kitchen as unchanged until it is next saved. A forged
-- mark below the revision a kitchen was sent at changes nothing, and one between that and the current revision shows the
-- kitchen as changed. Nothing in the table stops the write: its checks bound the shape of a value and not its meaning.
--
-- **How it shows.** A row whose `seen_revision` is above its design's `revision` was not written by the store, which
-- refuses an ahead mark, and revisions only rise: the owner's runbook has the query. A forged mark equal to the
-- revision cannot be told from a real one by the table. The audit log is not a reliable tell either, because the same
-- credential can insert `kitchen-seen` rows (`0020` grants the application `INSERT`).
--
-- The grants are the owner's separate step:
--
--   GRANT SELECT ON TABLE public.design_staff_seen TO app_designs;
--   GRANT INSERT (design_id, seen_revision, seen_by_account_id) ON TABLE public.design_staff_seen TO app_designs;
--   GRANT UPDATE (seen_revision, seen_by_account_id, seen_at) ON TABLE public.design_staff_seen TO app_designs;
--
-- No DELETE, no TRUNCATE, no ALL, no WITH GRANT OPTION, nothing to PUBLIC, no INSERT on `seen_at`, and no UPDATE of
-- `design_id`.
--
-- **One more grant, on an existing table (ADR 0178 F2), and it belongs to the same step.** The staff kitchen page shows
-- the total a request was priced at when it was sent, read from the snapshot `contact_submissions.priced`, never priced
-- again. The application role reads seven columns of that table and no more (`0008`'s header). This adds exactly one:
--
--   GRANT SELECT (priced) ON TABLE public.contact_submissions TO app_designs;
--
-- `0008`'s header classes `priced` as not personal (it is the design priced as `priceDesign` returned it), so ADR 0153
-- decision 1 holds: the role still reads no column the client typed. **Any wider SELECT on that table is forbidden.**
-- The grant is not in this file, because `grant` is not a shape the unattended screen recognises (`0009`'s precedent),
-- and the code that reads the column is the statement of the staff kitchen page, which answers 503 until it is issued.
--
-- **Seen marks are not in the nightly export** (which covers `designs` alone), so a restore does not bring them back:
-- every kitchen then reads as changed since its latest submission until staff open it again.
--
-- **APPLY THIS BEFORE THE CODE THAT READS IT SHIPS, AND BEFORE THE GRANTS.** The staff kitchens list and the kitchen
-- page (not its notes statement) name this table, and the page also names `contact_submissions.priced`. Both are
-- already in service, so from the moment this code ships they answer 503 against a database without this table, or
-- without the grants above, until the owner has applied the migration and issued every grant.
--
-- Check the target database's ledger reads 1-25 before running, and 1-26 after (ADR 0020: verify by reading the schema,
-- never by this command's exit status).
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records a
-- checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration, never an
-- edit to this file and never relabelling the ledger.
create table if not exists design_staff_seen (
  design_id text primary key
    constraint design_staff_seen_design_id_shape check (design_id ~ '^[A-Za-z0-9_-]{21}$'),
  seen_revision bigint not null
    constraint design_staff_seen_seen_revision_is_positive check (seen_revision > 0),
  seen_by_account_id text not null
    constraint design_staff_seen_seen_by_account_id_shape check (seen_by_account_id ~ '^[A-Za-z0-9_-]{21}$'),
  seen_at timestamptz not null default now()
);
