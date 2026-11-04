-- M10 wave S4. Plan `docs/milestones/M10-price-dashboard.md` section 9.2, ADR 0178 (A-13): the record of the daily
-- digest of kitchens changed after staff saw them. Two tables, one file. The digest is a system action: nothing here
-- has a staff actor, so nothing here writes an audit row (ADR 0178, "Writes with no staff actor"); the rounds and the
-- entries are its own record.
--
-- `staff_change_digest_rounds` has one row per calendar day in Europe/Chisinau. `day_key` (`YYYY-MM-DD`) is the primary
-- key **and the round's id**: a day is claimed by inserting its row with `on conflict do nothing`, so of two runs for
-- one day exactly one claims it, and the other sends nothing. The claim is inserted **before** the mail is sent, so a
-- send that fails loses that day and is never repeated. `claimed_at` is `now()` by default and outside the INSERT
-- grant. `sent_count` is the number of kitchens the round recorded; the store sets it when it records the entries and
-- never reads it for a decision.
--
-- `staff_change_digest_entries` has one row per kitchen a round listed, with the design revision it listed: the primary
-- key is `(day_key, design_id)`, so a kitchen appears once per round. A kitchen is held out of the digest by an entry
-- for it with a revision **above** its effective seen revision and **not above the kitchen's own**, judged on revisions
-- in SQL and never on instants, so a claimed day with no entries holds nothing, a stale seen mark cannot send a
-- digested revision again, and an entry for a revision the kitchen has not reached holds nothing. Entries are written
-- only after a successful send, and **only ever inserted: the role has no UPDATE and no DELETE**, so a revision
-- recorded is the revision held. `revision` is a positive `bigint`, opaque to every layer above SQL.
--
-- `design_id` is in the shape of `designs.id` as `0021`, `0022` and `0026` hold it. It is **not** a foreign key to
-- `designs` (`0015`'s precedent: an entry must not block the erasure of a design). `day_key` in `entries` is a foreign
-- key to `rounds`, as `0010` references its parent table, so no entry names a day nobody claimed; it has no `on delete`
-- clause because the role may not delete a round. The shape check on `day_key` is the shape of a date; that it is a
-- real calendar day is judged by the store before any statement, from the day the server's clock reads in
-- Europe/Chisinau.
--
-- The index on `(design_id, revision)` serves the digest's one question about a kitchen: is there an entry for it above
-- a revision. The primary key starts with `day_key` and cannot.
--
-- **Accepted residual, stated plainly.** The grants must give the application credential `INSERT` of rounds and entries
-- and `UPDATE (sent_count)`. Whoever holds it can claim a day that has not come, which loses that day's digest, and can
-- record an entry for a kitchen at a revision between its effective seen revision and its own, which keeps that kitchen
-- out of the digest until staff open it, exactly as a real digest entry does. An entry above the kitchen's own revision
-- holds nothing, so a forged entry cannot hold a kitchen for good. The application cannot delete a round or an entry;
-- the owner can. Nothing is sent to anyone by writing these rows, and the mark staff leave by opening a kitchen is not
-- touched.
--
-- **How it shows.** The digest writes no audit row, and `sent_count` is writable by the same credential, so neither the
-- audit log nor the count is a reliable tell. **The reliable tell is a round whose `claimed_at` precedes its
-- `day_key`**: the application claims a day only on that day, in Europe/Chisinau, so a round claimed before its day was
-- not claimed by the cron. The owner's runbook says what to check and how often.
--
-- The grants are the owner's separate step:
--
--   GRANT SELECT ON TABLE public.staff_change_digest_rounds TO app_designs;
--   GRANT INSERT (day_key) ON TABLE public.staff_change_digest_rounds TO app_designs;
--   GRANT UPDATE (sent_count) ON TABLE public.staff_change_digest_rounds TO app_designs;
--   GRANT SELECT ON TABLE public.staff_change_digest_entries TO app_designs;
--   GRANT INSERT (day_key, design_id, revision) ON TABLE public.staff_change_digest_entries TO app_designs;
--
-- No DELETE, no TRUNCATE, no ALL, no WITH GRANT OPTION, nothing to PUBLIC, no INSERT on `claimed_at` or `sent_count`,
-- no UPDATE of `day_key`, and no UPDATE at all on the entries.
--
-- **The rounds and entries are not in the nightly export** (which covers `designs` alone), so a restore does not bring
-- them back: the next digest after a restore may list a kitchen an earlier digest already listed.
--
-- **APPLY THIS BEFORE THE CODE THAT READS IT SHIPS, AND BEFORE THE GRANTS.** The digest's cron route is the only reader
-- of these tables; against a database without them, or without the grants, it answers 503 and sends nothing. The staff
-- kitchens list and counter do not read them: they read `0026`'s table.
--
-- Check the target database's ledger reads 1-26 before running, and 1-27 after (ADR 0020: verify by reading the schema,
-- never by this command's exit status).
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records a
-- checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration, never an
-- edit to this file and never relabelling the ledger.
create table if not exists staff_change_digest_rounds (
  day_key text primary key
    constraint staff_change_digest_rounds_day_key_shape check (day_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  claimed_at timestamptz not null default now(),
  sent_count integer not null default 0
    constraint staff_change_digest_rounds_sent_count_is_not_negative check (sent_count >= 0)
);

create table if not exists staff_change_digest_entries (
  day_key text not null references staff_change_digest_rounds (day_key),
  design_id text not null
    constraint staff_change_digest_entries_design_id_shape check (design_id ~ '^[A-Za-z0-9_-]{21}$'),
  revision bigint not null
    constraint staff_change_digest_entries_revision_is_positive check (revision > 0),
  constraint staff_change_digest_entries_pkey primary key (day_key, design_id)
);

create index if not exists staff_change_digest_entries_design_id_revision_idx
  on staff_change_digest_entries (design_id, revision);
