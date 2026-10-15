-- M8 wave 8I. One row per contact request, stored apart from designs: who asked, how to reach them, and
-- the kitchen as it stood when they asked (D7, D8). The application role may add a row and read seven
-- of its columns; it can read none of the personal ones, so a leaked `DATABASE_URL` does not leak the
-- leads (Q14 (i), ADR 0008).
--
-- The seven readable columns are the first group below: `client_request_id`, `reference`, `design_id`,
-- `design_revision`, `payload_digest`, `created_at`, `notified_at`. The rest are written once and read
-- by no application statement. Of those, `name`, `phone`, `phone_normal_form`, `locality`, `channel`
-- and `email` are personal. The consent text version, the locale, the intent and the two `jsonb`
-- snapshots (the design document, and the design priced as `priceDesign` returned it) are not. `jsonb`
-- keeps a document's content and not its bytes, as `designs.document` does.
--
-- `client_request_id` is the primary key and the conflict target of the one insert, so a retried
-- request stores one row. Its check is the domain's shape (`contact-submission.ts`): with it, two ids
-- are equal exactly when their bytes are, so no `citext` and no `lower()`. `reference` is the label a
-- customer is shown. It is unique under a name the store reads to tell a collision from a replay, and
-- its check bounds a label, not a body: the look of it is code's and can change without a migration.
-- `payload_digest` is a lowercase hex SHA-256 of the request, made by the caller under a secret this
-- database never holds; the check is `0003`'s and `0007`'s shape.
--
-- `design_id` has no foreign key. A cascade would delete a lead with its design, and a restriction
-- would refuse the owner's manual delete of a design; the row carries its own snapshot. It has no
-- shape check either: not every stored design id is known to have the generator's shape (backlog 146).
-- A callback names no design, so the design columns are null and `intent` is set; a request for a
-- design is the other way round. The first two table checks below say exactly that, and read only
-- whether non-personal columns are null. The third says each snapshot is a JSON object: a document
-- encoded twice arrives as a JSON string, and it would sit unseen in a column the application role
-- cannot read back. A callback's two nulls pass it.
--
-- **Nothing here is computed from a personal column:** no check on one, no generated column, no
-- default but `now()`, no index but the two unique ones (the primary key and the reference), no
-- identity or sequence, and no uniqueness rule that includes a personal column. A rule that did would
-- let the insert tell the application role whether an address is already stored. The digest is made
-- outside the database because one made inside it would be made without the secret.
--
-- **APPLY THIS BEFORE THE CODE THAT STORES WITH IT SHIPS, AND BEFORE THE GRANT.** The grant is a
-- separate step by the owner, as for `0006` and `0007`: `grant` is not a shape the unattended screen
-- recognises, and whether `app_designs` exists on every database this file runs against is not
-- something this file can assume. This file carries none. The application role needs `INSERT`,
-- `SELECT` on the seven readable columns and `UPDATE (notified_at)`, and nothing else: no table-wide
-- `SELECT`, `UPDATE` or `DELETE`, and nothing to `PUBLIC`.
--
-- Check the target database's ledger reads 1-7 before running, and 1-8 after (ADR 0020: verify by
-- reading the schema, never by this command's exit status).
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger
-- records a checksum over the whole file, so editing even a line of this header makes every later run
-- refuse with `MigrationChecksumMismatchError` against every database that already ran it. The fix is
-- a new migration, never an edit to this file and never relabelling the ledger.
create table if not exists contact_submissions (
  client_request_id text primary key
    constraint contact_submissions_client_request_id_shape check (client_request_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  reference text not null
    constraint contact_submissions_reference_is_unique unique
    constraint contact_submissions_reference_shape check (reference ~ '^[0-9A-Z-]{6,32}$'),
  design_id text,
  design_revision bigint,
  payload_digest text not null
    constraint contact_submissions_payload_digest_is_sha256 check (payload_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  name text not null,
  phone text not null,
  phone_normal_form text not null,
  locality text not null,
  channel text not null,
  email text,
  consent_text_version text not null,
  locale text not null,
  intent text,
  design_document jsonb,
  priced jsonb,
  constraint contact_submissions_names_a_design_or_an_intent check ((design_id is null) <> (intent is null)),
  constraint contact_submissions_snapshot_follows_the_design check (
    (design_revision is null) = (design_id is null)
    and (design_document is null) = (design_id is null)
    and (priced is null) = (design_id is null)
  ),
  constraint contact_submissions_snapshot_is_two_objects check (
    jsonb_typeof(design_document) = 'object' and jsonb_typeof(priced) = 'object'
  )
);
