-- M8 wave 8V. One row per view-only link the shop's notice carries: the hash of the link's token, the contact request
-- it was minted for, and a copy of the kitchen as it was sent (D3). The link opens that copy and nothing else, so a
-- later edit of the design, and the customer's own share link, never change what the shop sees.
--
-- Nothing here is personal. `design_document` is a copy of `contact_submissions.design_document`, which `0008`'s
-- header lists among the columns that are not personal, and the request is named by its id alone. So the application
-- role may read every column of this table and still reads nothing personal, and no grant on `contact_submissions`
-- widens for it (ADR 0153 decision 1).
--
-- `token_hash` is the primary key, as in `0006`: every lookup is "does this hash name an unrevoked row", so the key
-- is the query. The check is `0006`'s shape: a lowercase hex SHA-256 digest is 64 characters from `[0-9a-f]`, and `''`
-- is the one degenerate value a hash comparison would otherwise accept from a guessable input.
--
-- `client_request_id` references `contact_submissions (client_request_id) on delete cascade`, so retention follows the
-- lead: deleting a request deletes every link minted for it. `migration-safety.ts`'s one narrow allowance for an
-- `on delete` referential action inside `create table if not exists` (`0006`'s header) covers it. The reference names
-- the request's id and no other column of that table: in particular not `notified_at`, the one column the application
-- role may update there, which no constraint may read (ADR 0153 decision 1). There is no index on it: the only scan by
-- it is the cascade of a manual delete, which runs by hand (ADR 0118: recorded, not built, until it is needed).
--
-- `schema_version` is the design schema the copy was written in, so `migrateDesign` can read it after the schema moves
-- on, as it reads `designs.schema_version`. `design_document` is checked to be a JSON object: a document encoded twice
-- arrives as a JSON string, and would open as nothing. `jsonb` keeps a document's content and not its bytes, as
-- `designs.document` does. `revoked_at` is set only by the owner, by hand; the application role has no `UPDATE`.
--
-- **APPLY THIS BEFORE THE CODE THAT READS IT SHIPS, AND BEFORE THE GRANT.** The share page asks this table whenever a
-- token names no share link, so against a database without it every unknown or revoked share token answers 500
-- instead of the not-found page. The grant is a separate step by the owner, as for `0006` to `0009`: `grant` is not a
-- shape the unattended screen recognises, and whether `app_designs` exists on every database this file runs against
-- is not something this file can assume. This file carries none. The application role needs `INSERT` and `SELECT` on
-- this table and nothing else: no `UPDATE`, no `DELETE`, no `TRUNCATE`, no grant option, and nothing to `PUBLIC`.
--
-- Check the target database's ledger reads 1-9 before running, and 1-10 after (ADR 0020: verify by reading the
-- schema, never by this command's exit status).
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records a
-- checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration, never an
-- edit to this file and never relabelling the ledger.
create table if not exists contact_submission_views (
  token_hash text primary key
    constraint contact_submission_views_token_hash_is_sha256 check (token_hash ~ '^[0-9a-f]{64}$'),
  client_request_id text not null references contact_submissions (client_request_id) on delete cascade,
  schema_version integer not null,
  design_document jsonb not null
    constraint contact_submission_views_design_document_is_an_object check (jsonb_typeof(design_document) = 'object'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
