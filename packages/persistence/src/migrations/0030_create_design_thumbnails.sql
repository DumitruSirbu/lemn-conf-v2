-- ADR 0181 (d3, d4, d9): the picture on a kitchen's card, one row per **design**, replaced as the kitchen is saved, so the
-- table holds the newest picture and not its history. The browser draws the picture in the editor after a save the
-- server has confirmed and the server keeps it here; the card reads it back for the owner alone. A kitchen saved before
-- this table existed has no row and shows the placeholder until its next save.
--
-- It is a table of its own and not columns of `designs`, so that image bytes are in no `designs` read and in no nightly
-- export of `designs`.
--
-- `design_id` is the primary key and **references `designs (id)` with `on delete cascade`**: whatever hard-deletes a
-- design row removes its picture with it. The application role holds no `DELETE` on `designs`; the client's delete marks
-- the design and, in the same statement, deletes this row (ADR 0181 d9). A hidden kitchen keeps its row.
--
-- `revision` is the design's `revision` that the picture depicts, a `bigint` from 1 as `designs.revision` is
-- (`0004`). A write replaces an existing row only with a greater revision, so a late, older picture never overwrites a
-- newer one. It is opaque to the application, which compares it in SQL and never does arithmetic on it above SQL.
--
-- `image` holds 1 to 262144 bytes, and `image_type` is one of `image/webp`, `image/png` and `image/jpeg`. The domain's
-- own cap is 128 KiB (131072 bytes, `MAX_DESIGN_THUMBNAIL_BYTES`); this backstop is twice that, for the reason `0017`
-- gives for a looser table check, so a code change to the cap never meets a row the table already refused. The domain
-- also reads the header (magic number, exact 640 by 480, no animation); a check constraint cannot, so the table
-- backstops size and type only.
--
-- `captured_at` is `now()` by default and **is in the UPDATE grant**, so a replacement restamps the row.
--
-- The grants are the owner's separate step, after this migration and before the code that reads or deletes here:
--
--   GRANT SELECT, INSERT, DELETE ON TABLE public.design_thumbnails TO app_designs;
--   GRANT UPDATE (revision, image, image_type, captured_at) ON TABLE public.design_thumbnails TO app_designs;
--
-- No TRUNCATE, no ALL, no WITH GRANT OPTION, nothing to PUBLIC, and no UPDATE of `design_id`: a row can never be moved to
-- another design. `DELETE` is granted because the client's delete of a kitchen removes its picture in the same
-- statement. The write and the read also read `designs`, on which the application role already holds `SELECT` and `UPDATE`:
-- nothing is granted on it here.
--
-- **Thumbnails are not in the nightly export** (which covers `designs` alone), so a restore does not bring them back: a
-- restored database shows the placeholder on each kitchen until its next save. The picture is derived from the kitchen.
--
-- **APPLY THIS, THEN THE GRANTS, BEFORE THE CODE THAT NAMES THIS TABLE RUNS.** The client's delete of a kitchen names this
-- table, so against a database without it, or without `DELETE` here, **every client delete fails** and not only the
-- thumbnail routes. Deploy the code only after the owner has applied the migration and issued both grants.
--
-- Check the target database's ledger reads 1-29 before running, and 1-30 after (ADR 0020: verify by reading the schema,
-- never by this command's exit status).
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records a
-- checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration, never an
-- edit to this file and never relabelling the ledger.
create table if not exists design_thumbnails (
  design_id text primary key
    constraint design_thumbnails_design_id_fkey references designs (id) on delete cascade,
  revision bigint not null
    constraint design_thumbnails_revision_is_positive check (revision >= 1),
  image bytea not null
    constraint design_thumbnails_image_size check (octet_length(image) between 1 and 262144),
  image_type text not null
    constraint design_thumbnails_image_type_is_known check (image_type in ('image/webp', 'image/png', 'image/jpeg')),
  captured_at timestamptz not null default now()
);
