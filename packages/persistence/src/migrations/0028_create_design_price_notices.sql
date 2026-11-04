-- ADR 0178 (A-11, F8): the pair of facts whose prices a design's owner last acknowledged, so that a customer whose saved
-- kitchen is affected by a published price change is told once. One row per **design**, upserted, so the table holds the
-- current marker and not its history. The pair is the version of the price book (`price_book_versions.id`, `0023`) and
-- the availability revision (the head's value in `0025`) that the page displayed: a price can change without a new
-- version, because switching an item on or off moves the availability revision alone.
--
-- Three things write a row, and each is a customer's act through a route that has judged the request authorised to edit
-- that design (its write token, or the account that owns it): a design's first open, which inserts the current pair only
-- when the design has none and never overwrites; dismissing the notice; and completing the replacement sheet, which both
-- record the pair the page displayed. A save never writes here, so it never moves `designs.revision`. A staff open and
-- a share-link view never write here either. **The authorisation is the route's and not the table's**: nothing in the
-- table can tell who is asking. There is no staff actor, so no audit row is written (ADR 0178, "Writes with no staff
-- actor").
--
-- An acknowledgement is judged in SQL by the statement that writes it: the version must exist in `price_book_versions`,
-- and the availability revision must not be greater than the head's. Those are the statement's rules and not the
-- table's, because a check constraint cannot read another table. A row's pair is therefore always one the shop has
-- published, unless the application credential wrote it some other way (see the residual below).
--
-- `design_id` is the primary key, in the shape of `designs.id` as `0021`, `0022` and `0026` hold it (21 characters of
-- `[A-Za-z0-9_-]`), and so is `acknowledged_version_id`, the shape of a version's id. `acknowledged_availability_revision`
-- is a `bigint` from 0: the head starts at 0 and a design first opened before any availability change records it.
-- **There is no foreign key, on purpose** (`0015`'s, `0022`'s and `0026`'s precedent): a marker must not block the later
-- erasure of the design it names, and code keeps the links correct. A version is never deleted, so the version it names
-- is always there to be read.
--
-- `acknowledged_at` is `now()` by default, **is in the UPDATE grant** so that an acknowledgement can restamp the row, and
-- is outside the INSERT grant. The instant is informational: nothing decides on it.
--
-- **Accepted residual, stated plainly.** The grants must give the application credential `INSERT` and `UPDATE` of the
-- pair, so whoever holds it can write any pair for any design. A forged pair can only hide a notice from, or show one
-- to, a customer whose design it names: it changes no price, no design and no request, and the notice is shown only
-- when the prices differ. Nothing in the table stops the write: its checks bound the shape of a value and not its
-- meaning.
--
-- The grants are the owner's separate step:
--
--   GRANT SELECT ON TABLE public.design_price_notices TO app_designs;
--   GRANT INSERT (design_id, acknowledged_version_id, acknowledged_availability_revision) ON TABLE public.design_price_notices TO app_designs;
--   GRANT UPDATE (acknowledged_version_id, acknowledged_availability_revision, acknowledged_at) ON TABLE public.design_price_notices TO app_designs;
--
-- No DELETE, no TRUNCATE, no ALL, no WITH GRANT OPTION, nothing to PUBLIC, no INSERT on `acknowledged_at`, and no UPDATE of
-- `design_id`. The statement that records an acknowledgement also reads `price_book_versions` and
-- `catalogue_availability_head`, which `0023` and `0025` already grant to `SELECT`: nothing is granted on either here.
--
-- **Markers are not in the nightly export** (which covers `designs` alone), so a restore does not bring them back: a
-- design then reads as never recorded and is given the current pair silently on its next open.
--
-- Nothing reads this table until the price-notice routes ship, so applying it early breaks nothing. **Apply it, and issue
-- the grants above, before those routes are deployed**: until then they answer 503, because the store's statements name
-- a table the role cannot read.
--
-- Check the target database's ledger reads 1-27 before running, and 1-28 after (ADR 0020: verify by reading the schema,
-- never by this command's exit status).
--
-- **Once this file has been applied anywhere, its bytes are frozen, comments included.** The ledger records a
-- checksum over the whole file, so editing even a line of this header makes every later run refuse with
-- `MigrationChecksumMismatchError` against every database that already ran it. The fix is a new migration, never an
-- edit to this file and never relabelling the ledger.
create table if not exists design_price_notices (
  design_id text primary key
    constraint design_price_notices_design_id_shape check (design_id ~ '^[A-Za-z0-9_-]{21}$'),
  acknowledged_version_id text not null
    constraint design_price_notices_acknowledged_version_id_shape check (acknowledged_version_id ~ '^[A-Za-z0-9_-]{21}$'),
  acknowledged_availability_revision bigint not null
    constraint design_price_notices_availability_revision_not_negative check (acknowledged_availability_revision >= 0),
  acknowledged_at timestamptz not null default now()
);
