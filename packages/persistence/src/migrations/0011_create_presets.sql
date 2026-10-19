-- M8C wave P1. Where the owner's saved kitchens are kept: one row per preset, written once and shown to every customer's
-- Step 1 for a room of the same shape and nearly the same walls. ADR 0112 decision 1 as amended by its Amendment A
-- (2026-10-17); the plan is `docs/milestones/M8C-generation-fill-and-preset-authoring.md`, section 3.2.
--
-- Nothing here is personal and nothing here names a customer's design. A preset is a copy of a stored design at the
-- schema version it was read at, and it carries no design id: it does not depend on the private design it came from
-- (ADR 0131 section 4), so deleting or editing that design never reaches it. Using a preset copies it into a new
-- private design under its own write token; no customer ever writes this table.
--
-- `id` is an opaque `nanoid`, the shape of a design's id, made by the application and never derived from a counter, a
-- time or the database. The check is that shape and nothing wider.
--
-- `shape`, `wall_a_mm`, `wall_b_mm`, `wall_c_mm` and `height_mm` are the room the preset was saved in, so the plus or
-- minus 600 mm window of ADR 0109 Amendment A2 is read in SQL and the snapshot is never loaded to find a match. Wall A
-- is the room's `widthMm`, wall B its `depthMm`, wall C its `wallCMm`. The table check mirrors `DesignRoomSchema`
-- (a wall C exactly when the shape is `U`) and adds what the schema leaves to the shape: a `linear` room has no wall B,
-- and an `L` or a `U` has one. No check lists a wall's maximum: those bounds belong to the code and move with it.
--
-- `schema_version` is the design schema the copy was written in, so `migrateDesign` can read it after the schema moves
-- on, exactly as `designs.schema_version` and `0010`'s column do. The document does not carry its own version.
-- `design_document` is checked to be a JSON object: a document encoded twice arrives as a JSON string and would open
-- as nothing. `jsonb` keeps a document's content and not its bytes, as `designs.document` does. The document is also
-- bounded: the application refuses one longer than `MAX_DESIGN_BYTES` before any statement, and the table refuses one
-- whose `jsonb` text exceeds 4 MiB (4194304 bytes), a ceiling far above any design the product writes and above what
-- `jsonb` adds in spaces to the application's limit, so no honest document meets it and no credential can make a row
-- that every Step 1 screen must then load.
--
-- `typed_name` is the one name the owner typed, shown verbatim; null means the name is generated at render time from
-- the shape, the walls and the finish, and is never stored. An empty typed name is refused so that "no name" has one
-- spelling, null. At most 80 characters. The name rule beyond length (NFC, trimmed, no control or bidi-override
-- character) is the application's, applied on write and again on read; no check here repeats it.
--
-- `thumbnail` and `thumbnail_type` are the one image the card and the preview both show (ADR 0112 decision 6), at most
-- 512 KiB (ADR 0112 Amendment A, decisions 4 and 6). The type is served back as declared. The server checks the
-- image's magic bytes and dimensions before the insert; the table only refuses a size no honest image has.
--
-- `status` is `published` or `hidden`, `published` by default. The owner hides a preset by hand, in the database
-- console, with the owner credential; the application role has no `UPDATE`. No index: the library is owner-authored
-- and small, and ADR 0118 records an index as not built until a measured need.
--
-- **APPLY THIS BEFORE THE CODE THAT READS IT SHIPS, AND BEFORE THE GRANT.** The grant is a separate step by the
-- owner, as for `0006` to `0010`: `grant` is not a shape the unattended screen recognises, and whether `app_designs`
-- exists on every database this file runs against is not something this file can assume. This file carries none. The
-- application role needs `SELECT` on the table and `INSERT` on eleven named columns, and nothing else: not `INSERT`
-- on `created_at` or `status`, so that a leaked credential can neither stamp a row with a far-future time to keep it
-- first in every listing nor insert a row already hidden; no `UPDATE`, no `DELETE`, no `TRUNCATE`, no grant option,
-- and nothing to `PUBLIC` (ADR 0008, ADR 0112 decision 1). The statement is in the runbook.
--
-- The migration runner applies every pending file in order. On a database whose ledger reads 8, one run applies `0009`,
-- `0010` and this file, and the grants of all three are owed (see the runbook for applying a table migration and its
-- application-role grant, in `docs/runbooks/`).
--
-- Check the target database's ledger reads 1 to N before running, where N is 8 on a production that has not had `0009`
-- and `0010` and 10 elsewhere, and 1 to 11 after (ADR 0020: verify by reading the schema, never by this command's
-- exit status).
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records a
-- checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration, never an
-- edit to this file and never relabelling the ledger.
create table if not exists presets (
  id text primary key
    constraint presets_id_is_a_design_id_shape check (id ~ '^[A-Za-z0-9_-]{21}$'),
  shape text not null
    constraint presets_shape_is_known check (shape in ('L', 'linear', 'U')),
  wall_a_mm integer not null
    constraint presets_wall_a_is_positive check (wall_a_mm > 0),
  wall_b_mm integer
    constraint presets_wall_b_is_positive check (wall_b_mm > 0),
  wall_c_mm integer
    constraint presets_wall_c_is_positive check (wall_c_mm > 0),
  height_mm integer not null
    constraint presets_height_is_positive check (height_mm > 0),
  schema_version integer not null
    constraint presets_schema_version_is_positive check (schema_version >= 1),
  design_document jsonb not null
    constraint presets_design_document_is_an_object check (jsonb_typeof(design_document) = 'object')
    constraint presets_design_document_size check (octet_length(design_document::text) <= 4194304),
  typed_name text
    constraint presets_typed_name_length check (char_length(typed_name) between 1 and 80),
  thumbnail bytea not null
    constraint presets_thumbnail_size check (octet_length(thumbnail) between 1 and 524288),
  thumbnail_type text not null
    constraint presets_thumbnail_type_is_known check (thumbnail_type in ('image/webp', 'image/png', 'image/jpeg')),
  status text not null default 'published'
    constraint presets_status_is_known check (status in ('published', 'hidden')),
  created_at timestamptz not null default now(),
  constraint presets_walls_match_shape check (
    (shape = 'linear' and wall_b_mm is null and wall_c_mm is null)
    or (shape = 'L' and wall_b_mm is not null and wall_c_mm is null)
    or (shape = 'U' and wall_b_mm is not null and wall_c_mm is not null)
  )
);
