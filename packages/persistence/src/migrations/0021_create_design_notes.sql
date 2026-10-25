-- M8B Lot 3 wave L3-S1. Plan `docs/milestones/M8B-account-screens-lot3-plan.md` section 2.3, ADR 0173 (P-L3-5,
-- proposed) and ADR 0174 decision 4 (O-L3-6): the notes the shop's staff write about a client's kitchen. Nothing is built
-- that writes this table yet; the store is a later wave (L3-S5).
--
-- **A note is the client's personal data.** The owner ruled that notes join the client's own data download, as text and
-- date and **without the staff member's name** (ADR 0174 decision 4). So the author is kept for the audit trail and is
-- never shown to the client. The text is free text and is not in the audit log, which holds ids and codes only.
--
-- A note **cannot be edited or deleted** (the designer's answer 4, plan P-L3-5): there is no edit route, no delete route,
-- and the grant below has no UPDATE and no DELETE. A mistaken note is answered by a later note.
--
-- `id` is an opaque `nanoid`, in the shape of `accounts.id` and `designs.id` (21 characters of `[A-Za-z0-9_-]`);
-- `design_id` and `author_account_id` carry the same shape. `body` is 1 to 2000 characters, the bound the domain's note
-- check (wave L3-S2) enforces after normalisation; the table check is a backstop on length, so an empty string cannot be
-- stored. The rest of the rule (NFC, control and bidi-override characters refused) is the application's.
--
-- **There is no foreign key, on purpose** (`0015`'s precedent): a note must not block a later erasure of the design or the
-- account it names, and the erasure job, when it exists, decides what happens to the notes; code keeps the links correct.
--
-- `created_at` is `now()` by default and is **not in the grant**, so a leaked credential cannot backdate a note. The
-- index serves "the notes of this kitchen, newest first", which the kitchen page reads.
--
-- The grant is the owner's separate step:
--
--   GRANT SELECT ON TABLE public.design_notes TO app_designs;
--   GRANT INSERT (id, design_id, author_account_id, body) ON TABLE public.design_notes TO app_designs;
--
-- No UPDATE, no DELETE, no TRUNCATE, no ALL, no WITH GRANT OPTION, nothing to PUBLIC, and no INSERT on `created_at`.
--
-- **Notes are not in the nightly export** (which covers `designs` alone), so a restore does not bring them back.
--
-- **APPLY THIS BEFORE THE CODE THAT READS IT SHIPS, AND BEFORE THE GRANT.** The staff kitchen page names this table;
-- against a database without it that read answers 503.
--
-- Check the target database's ledger reads 1-20 before running, and 1-21 after (ADR 0020: verify by reading the schema,
-- never by this command's exit status). The number was re-listed on 2026-10-21, as `0020`'s header states.
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records a
-- checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration, never an
-- edit to this file and never relabelling the ledger.
create table if not exists design_notes (
  id text primary key
    constraint design_notes_id_shape check (id ~ '^[A-Za-z0-9_-]{21}$'),
  design_id text not null
    constraint design_notes_design_id_shape check (design_id ~ '^[A-Za-z0-9_-]{21}$'),
  author_account_id text not null
    constraint design_notes_author_account_id_shape check (author_account_id ~ '^[A-Za-z0-9_-]{21}$'),
  body text not null
    constraint design_notes_body_length check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists design_notes_by_design_newest_idx
  on design_notes (design_id, created_at desc);
