-- M7 wave 7E3c. ADR 0114 decision 5's read-only view for a link holder needs its own credential,
-- distinct from the visitor and write-token cookies: one row per active link, naming the design it
-- opens and nothing else about who opened it.
--
-- `token_hash` is the primary key rather than a separate surrogate id, for the same reason
-- `designs.id` already is one: every lookup this table serves is "does this hash name an active
-- row", so the primary key *is* the query. The check constraint is `0003`'s and `0005`'s shape,
-- because the value is the same shape: a lowercase hex SHA-256 digest is 64 characters from
-- `[0-9a-f]`, and `''` is the one degenerate value a hash comparison would otherwise accept from a
-- guessable input.
--
-- `design_id` references `designs (id) on delete cascade`. Nothing in this application deletes a
-- design today (ADR 0019 note 2026-09-15 retired the reaper), but the manual delete a restore or an
-- owner request can still issue must not orphan a share row that would otherwise keep answering for
-- a design that no longer exists. The cascade is the one referential action this migration adds, and
-- `migration-safety.ts` gains a single, narrow allowance for it: inside a statement this screen has
-- already matched as `create table if not exists`, the referential action clause
-- `on delete (cascade|restrict|no action|set null|set default)` is read as part of that additive,
-- idempotent shape rather than as the `delete` diagnosis that refuses every other occurrence of the
-- word. `create table`'s own `if not exists` guard is what makes this additive: on a database that
-- already has the table, the statement is a no-op, cascade included.
--
-- No column is nullable and no default is invented for one: a share link that does not name a design
-- is not a share link, and `created_at` is set by the insert that creates the row, never backfilled,
-- because there are no existing rows for this brand-new table to backfill.
--
-- The partial unique index enforces "one active link per design" at the database, not only in
-- application code: `design_share_links_one_active_per_design` on `(design_id) where revoked_at is
-- null` lets a design accumulate any number of revoked rows but refuses a second concurrent active
-- one, which is what D3's `issue` transaction depends on to serialise a race between two mints. There
-- is no separate index on `design_id` alone — the only query that scans by `design_id` outside that
-- partial index is the manual cascade delete, which runs once, by hand, and does not need one
-- (ADR 0118: recorded, not built, until it is needed).
--
-- **APPLY THIS BEFORE THE WEB CODE THAT READS IT SHIPS, AND BEFORE THE GRANT.** The order is
-- load-bearing, not a preference, exactly as `0004`'s and `0005`'s headers state it: every share
-- issue, revoke and status check names this table, and every one of them answers 500 against a
-- database that does not have it yet. The grant is a second, separate step this migration does not
-- perform — `grant` is not a shape this screen recognises, and whether `app_designs` exists on every
-- database this file runs against is not something this file can assume — so applying this migration
-- alone is not sufficient to make sharing work; ADR 0008's 2026-09-23 note and the runbook name the
-- grant as the step that follows it, before the deploy. Applying the migration itself first is
-- harmless in the other direction: the table, the constraint and the index are all additive, and no
-- code shipped before this migration names any of them.
--
-- Check the target database's ledger reads 1-5 before running, and 1-6 after (ADR 0020: verify by
-- reading the schema, never by this command's exit status).
--
-- **Once this file has been applied anywhere, its bytes are frozen — comments included.** The
-- ledger records a checksum over the whole file, so editing even a line of this header makes every
-- later run refuse with `MigrationChecksumMismatchError` against every database that already ran
-- it. Tidying a comment here is therefore a schema incident, not a tidy-up.
--
-- The fix is a new migration. It is never an edit to this file, and it is never relabelling the
-- ledger — deleting the recorded row so the new bytes are re-recorded silently discards the only
-- evidence of what the database actually ran, and on a database holding real rows it makes the
-- ledger a record of the file as it is now rather than of the migration that was applied.
create table if not exists design_share_links (
  token_hash text primary key
    constraint design_share_links_token_hash_is_sha256 check (token_hash ~ '^[0-9a-f]{64}$'),
  design_id text not null references designs (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists design_share_links_one_active_per_design
  on design_share_links (design_id) where revoked_at is null;
