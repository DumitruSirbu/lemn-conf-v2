# Applying a table migration and its application-role grant

Applies to any migration that creates a table the application must read or write. The first worked case is
`0007_create_rate_limit_counters.sql` (wave 8E, [ADR 0149](../decisions/0149-the-rate-limit-store-keeps-one-row-per-bucket-per-window-refuses-a-broken-promise-and-may-count-high-but-never-low-between-prunes.md)).
~~Wave 8H's table needs the same steps.~~ **Corrected 2026-10-08:** wave 8H builds no table; the next table is wave 8I's
`contact_submissions` (migration `0008`), and it needs the same steps.

**Where the suite points by default (corrected 2026-10-08).** The repo-root `.env.local` now holds the preview database's
application role, so an ordinary persistence run reaches `lemn-conf-v2-preview` and not production
([environments-and-resources.md](../best-practices/environments-and-resources.md)). Production's grants are checked only by
a deliberate run of steps 5 to 7 with the production application role's URL as `DATABASE_URL` for that one invocation.

**Agents prepare these commands and never run them.** The owner runs them. Order of environments: **preview first,
then production.** Rules that apply throughout: environment variables and resources are add-only, and no secret or URL
is ever pasted ([environments-and-resources.md](../best-practices/environments-and-resources.md)).

The steps were written by the security reviewer of wave 8E and amended at its re-check [relayed by the coordinator;
none of them has been executed].

## Steps

1. **Apply with the migration credential**, through the migrate CLI with the declared environment
   (`pnpm --filter @lemnaria/persistence run migrate <environment>`; the credential, not the label, selects the
   database). Confirm the ledger (`migrate:status <environment>`) shows the migration's version (for 0007: **7**).
2. **Confirm the table is the one the migration describes.** `create table if not exists` passes over a table of the
   same name, so a pre-existing one would be accepted silently. For 0007: four columns, three named checks, the primary
   key `(bucket_key, window_start)`, the `window_end` index.
3. **Before the grant, run the privilege test** and expect the table's test **red with nothing held**. Anything held at
   this point came through `PUBLIC`, a default privilege or a role membership: **stop and report.**
4. **Issue exactly the grant.** For 0007:
   `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rate_limit_counters TO app_designs;`
   Not `ALL TABLES IN SCHEMA`, not `ALL PRIVILEGES`, not `WITH GRANT OPTION`, nothing to `PUBLIC`.
5. **Run the privilege test file with `DATABASE_URL` set to the APPLICATION role's URL for that environment**, never
   the migration URL. The whole file may now be run; the earlier restriction to one test by name is withdrawn, because
   with an owner credential every test fails at the guard after one read.
6. **Read the run's own line** `reached database "…" as role "…"` and quote it with the result. Never paste a URL.
7. **The table's test passed, and was not skipped**, and the membership test is green. A skip means the table is not on
   the database reached.
8. **Confirm `designs` is unchanged.** On production, by `has_table_privilege`, not by attempting a delete.
9. **Order: the migration, then the grant, then the code that counts.** The limiter fails closed without either.

## For `0008_create_contact_submissions.sql` (wave 8I, added 2026-10-09)

The steps above stand; the table is `contact_submissions`, the version is **8**, and these are added by the security reader's
read of `0008` [relayed; none of it has been executed]. The decision and its reasons: [ADR 0153](../decisions/0153-a-contact-request-is-stored-once-apart-from-designs-the-application-role-reads-none-of-its-personal-columns-and-code-refuses-before-the-server-what-the-table-would-refuse.md)
decision 1. **The grant is narrower than the owner's Q14 (i) answer:** `UPDATE` on `notified_at` alone, not on the seven
non-personal columns.

- **Before step 4, on each database: read `pg_default_acl`.** A default privilege grants without anyone issuing it. Anything
  that would reach `contact_submissions` or its columns is a stop-and-report, as in step 3.
- **Step 1:** the ledger shows **8**.
- **Step 2, for `0008`:** confirm **18 columns and 8 named constraints** (the primary key, the reference's uniqueness
  `contact_submissions_reference_is_unique`, three column checks, three table checks), because `create table if not exists`
  passes over an older table of the same name.
- **Step 4, exactly these three statements** [doc plan, 8I R1]:

  ```sql
  GRANT INSERT ON TABLE public.contact_submissions TO app_designs;
  GRANT SELECT (
      reference, client_request_id, design_id, design_revision, payload_digest, created_at, notified_at
    ) ON TABLE public.contact_submissions TO app_designs;
  GRANT UPDATE (notified_at) ON TABLE public.contact_submissions TO app_designs;
  ```

  Not `ALL`, not `WITH GRANT OPTION`, nothing to `PUBLIC`, no table-wide `SELECT`, `UPDATE` or `DELETE`.
- **Steps 5 to 7:** the grant test's own line `reached database "…" as role "…"` is quoted as the evidence, with the test's
  outcome, never skipped. Until it has been quoted for an environment, the grant test's passing arm has never executed there.

## For `0009_create_csp_reports.sql` (wave 8Q2, added 2026-10-13)

The steps above stand; the tables are `csp_reports` and `csp_report_cursor`, the version is **9**, and these are added
by the security reader's read of `0009` [relayed; none of it has been executed]. The decision and its reasons:
[ADR 0162](../decisions/0162-csp-reports-are-kept-in-a-fixed-size-table-of-our-own-marked-by-the-server-that-wrote-them-and-written-best-effort-after-the-limiter-allows-them.md).
The plan: `docs/milestones/done/8Q2-csp-report-table.md`, *The grant, for review*. **Order of environments: preview first,
then production**, every step on one database before the next.

**The code merges before this runs and behaves as today until it does** (8Q2 criterion 14): a report still answers
`204` and still writes its `csp-violation` line; only the stored copy is missing. Nothing breaks if these steps wait.

- **Step 1:** `pnpm --filter @lemnaria/persistence run migrate <environment>`, then
  `pnpm --filter @lemnaria/persistence run migrate:status <environment>`. The ledger reads **9** (1 to 8 before).
- **Step 2, for `0009`:** `create table if not exists` passes over an older table of the same name, so confirm the
  tables are the ones `0009` describes. Read-only, in the database console, with the migration credential:

  ```sql
  -- Expect csp_report_cursor = 2 and csp_reports = 14.
  select table_name, count(*) as columns
  from information_schema.columns
  where table_schema = 'public' and table_name in ('csp_report_cursor', 'csp_reports')
  group by table_name order by table_name;

  -- Expect csp_report_cursor: c = 2, p = 1; csp_reports: c = 16, p = 1.
  select conrelid::regclass::text as table_name, contype, count(*) as constraints
  from pg_constraint
  where conrelid in ('public.csp_report_cursor'::regclass, 'public.csp_reports'::regclass)
    and contype in ('c', 'p')
  group by 1, 2 order by 1, 2;

  -- Expect one row holding a number (0 before any report has been stored).
  select last_number from csp_report_cursor;
  ```

  That is **2 tables, 2 + 14 columns, 3 + 17 named constraints (the primary keys included) and the seed row**. A missing
  seed row would leave the store's statement nothing to insert from, so no report would be stored, silently [inf: read
  from the statement in the plan]: stop and report.
- **Before step 4, on each database: read `pg_default_acl`.** A default privilege grants without anyone issuing it.
  Anything that would reach `csp_reports` or `csp_report_cursor` is a stop-and-report, as in step 3:

  ```sql
  select defaclrole::regrole as creator, defaclnamespace::regnamespace as schema, defaclobjtype, defaclacl
  from pg_default_acl;
  ```

  No rows is the expected answer. A row whose `defaclacl` names `app_designs` or `PUBLIC` for tables (`defaclobjtype =
  'r'`) is the finding.
- **Step 3:** with the tables present and nothing granted, the privilege test's `csp_reports` and `csp_report_cursor`
  tests are **red with nothing held**, not skipped (a skip, *"does not exist yet on this database"*, means `0009` is not
  on the database reached).
- **Step 4, exactly these two statements, preview first** [doc plan, *The grant, for review*]:

  ```sql
  GRANT SELECT, INSERT, UPDATE ON TABLE public.csp_reports TO app_designs;
  GRANT SELECT, UPDATE ON TABLE public.csp_report_cursor TO app_designs;
  ```

  Not `DELETE` on either, not `TRUNCATE`, not `ALL`, not `WITH GRANT OPTION`, nothing to `PUBLIC`, nothing on
  `ALL TABLES IN SCHEMA`. Rows leave only by being overwritten. `SELECT` is table-wide on purpose: nothing in the table
  is personal, and it settles whether `ON CONFLICT` wants it on the key column.
- **Steps 5 to 7, as `app_designs` on each database.** Run the privilege test file with `DATABASE_URL` set to that
  environment's application role URL for the one invocation (a shell variable set without echoing it; a variable
  already in the shell wins over `.env.local`), for example
  `pnpm --filter @lemnaria/persistence exec vitest run --config vitest.config.ts tests/application-role-privileges.test.ts`.
  Quote the run's own line `reached database "…" as role "…"`, which must name the database being checked and the role
  `app_designs`, with the outcome. Quote it for preview and again for production: a result without the line does not
  say which database it describes. The three `csp` tests must have **run, not skipped**:
  - *holds exactly the grant:* `SELECT, INSERT, UPDATE` on `csp_reports`, `SELECT, UPDATE` on `csp_report_cursor`, no
    `DELETE` or `TRUNCATE` on either.
  - *nothing through `PUBLIC`.*
  - *the planning test.* **Positive:** `explain` (never `explain analyze`, which would run it and advance the cursor) of
    the store's own statement is planned without error: the server finds the grant enough for the cursor update and the
    upsert. **Negative control:** `explain delete from public.csp_reports` and `explain delete from
    public.csp_report_cursor` are each refused with SQLSTATE **`42501`** (insufficient privilege). The negative control is
    what makes the positive mean something: if a delete were planned, `explain` would not be checking privileges, and
    a planned store statement would prove nothing.
- **Step 8:** `designs` is unchanged; on production read it by `has_table_privilege`, not by attempting a delete.

**Two standing facts the owner should know before granting.**

- **A stricter default isolation level loses reports.** The store's statement serialises writers on the cursor's row
  lock and is written for `read committed`. If `app_designs` or its database has `default_transaction_isolation` above
  `read committed` (`repeatable read` or `serializable`), concurrent report writes fail with `40001` (serialization
  failure) and **those reports are lost**: the answer to the browser is still `204`, the `csp-violation` line is still
  written, and the loss shows only as a `csp-report-unstored` line. Check, read-only, as the application role and in the
  console:

  ```sql
  show default_transaction_isolation;

  select r.rolname, d.datname, s.setconfig
  from pg_db_role_setting s
  left join pg_roles r on r.oid = s.setrole
  left join pg_database d on d.oid = s.setdatabase;
  ```

  Expect `read committed` and no `default_transaction_isolation` entry in `setconfig`.
- **The table is a ring with a cap, and it is not backed up.** At most **10,000** reports are held; the 10,001st
  overwrites the oldest, and there is **no `DELETE` grant** and no scheduler, so nothing else removes a row. The nightly
  export covers `designs` only (`BACKUP_BLOB_PREFIX = "backups/designs/"`), so **these rows are not in it** and a
  restore of `designs` does not bring them back. The log line is the other copy of each report on a host that keeps logs.
  How to read the rows: [reading-csp-reports.md](reading-csp-reports.md).

## For `0010_create_contact_submission_views.sql` (wave 8V, added 2026-10-17)

The steps above stand; the table is `contact_submission_views`, the version is **10**. It holds one row per view-only
link in the shop's notice: the token's hash, the request it was minted for, and a copy of the kitchen as sent. Nothing in
it is personal. The decision and its reasons: the 8V plan, `docs/milestones/done/8V-done-page-link-and-shop-email.md`, D3 and
D6; the decision record is [ADR 0165](../decisions/0165-the-shops-notice-is-a-branded-html-email-with-a-plain-text-fallback-led-by-a-frozen-view-only-link-to-the-kitchen-as-sent-and-the-done-page-shows-the-customers-own-design-link.md)
(accepted 2026-10-17). These steps were written by the S1 developer. ~~and have **not been executed anywhere**.~~
**Corrected 2026-10-17:** the owner steps below have **not been executed on preview or production**. The **test**
database is different: the live persistence suite applies `0010` there itself, through each live file's `beforeAll`
(`runMigrations`, e.g. `packages/persistence/tests/sent-kitchen-view-repository.live.test.ts:159-160` [src]) — see *The
test database* at the end of this section. **Order of environments: preview first, then production**, every step on one
database before the next.

**Unlike `0009`, the order against the code matters.** When a token names no share link, the share page's second lookup
reads this table. So if the code ships before the migration and the grant, **every unknown or revoked share token
answers 500** instead of the not-found page. The order is the migration, then the grant, then the code. The shop's
notice is unaffected: without the table it says the link is unavailable and is still sent.

- **Step 1:** `pnpm --filter @lemnaria/persistence run migrate <environment>`, then
  `pnpm --filter @lemnaria/persistence run migrate:status <environment>`. The ledger reads **10** (1 to 9 before). For
  preview, pass `PREVIEW_OWNER_DATABASE_URL` as `MIGRATION_DATABASE_URL` for that one invocation, with the label
  `preview` ([environments-and-resources.md](../best-practices/environments-and-resources.md)).
- **Step 2, for `0010`:** `create table if not exists` passes over an older table of the same name, so confirm the table
  is the one `0010` describes. Run these read-only, in the database console, with the migration credential:

  ```sql
  -- Expect 6.
  select count(*) as columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'contact_submission_views';

  -- Expect c = 2, f = 1, p = 1.
  select contype, count(*) as constraints
  from pg_constraint
  where conrelid = 'public.contact_submission_views'::regclass and contype in ('c', 'f', 'p')
  group by contype order by contype;

  -- Expect one row: contact_submissions, c (on delete cascade).
  select confrelid::regclass::text as referenced, confdeltype
  from pg_constraint
  where conrelid = 'public.contact_submission_views'::regclass and contype = 'f';
  ```

  That is **6 columns and 4 constraints**: the primary key on `token_hash`, the checks
  `contact_submission_views_token_hash_is_sha256` and `contact_submission_views_design_document_is_an_object`, and the
  cascading reference to `contact_submissions (client_request_id)`. Any other answer means stop and report.
- **Before step 4, on each database, read `pg_default_acl`** with the query in the `0009` section. Any row that would
  reach `contact_submission_views` for `app_designs` or `PUBLIC` means stop and report, as in step 3.
- **Step 3:** run this before the grant, with the table present. In the privilege test, the `contact_submission_views`
  tests for the exact grant, the planning and the reference probe must be **red with nothing held**, not skipped. A
  skip, *"does not exist yet on this database"*, means `0010` is not on the database reached.
- **Step 4: issue exactly this one statement, preview first:**

  ```sql
  GRANT INSERT, SELECT ON TABLE public.contact_submission_views TO app_designs;
  ```

  Do not grant `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER` or `ALL`. Do not add `WITH GRANT OPTION`. Grant
  nothing to `PUBLIC` and nothing on `ALL TABLES IN SCHEMA`.

  **Nothing on `contact_submissions` changes:** its three statements from `0008` stand as they are. The reference's
  check needs no new grant there. The application role already reads `client_request_id`. PostgreSQL runs that check
  as the table's owner [inf, from PostgreSQL's referential-integrity implementation; not measured here]. Step 7's
  probe shows that the grants as issued are enough. It cannot show that a grant is unneeded.
- **Steps 5 to 7, as `app_designs` on each database.** Run the privilege test file with `DATABASE_URL` set to that
  environment's application-role URL, for that one invocation. Use the command in the `0009` section. Quote the run's
  own line `reached database "…" as role "…"` with the outcome, for preview and again for production.

  The four `contact_submission_views` tests must have **run, not skipped**:
  - *Holds exactly the grant:* `INSERT, SELECT`, no column `UPDATE` or `REFERENCES`, nothing with grant option.
  - *Nothing through `PUBLIC`.*
  - *The planning test.* **Positive:** `explain` of the repository's two statements, the record and the load, is
    planned without error. **Negative control:** `explain delete from …` and `explain update … set revoked_at = now()`
    are each refused with SQLSTATE **`42501`**.
  - *The reference probe.* The test first confirms from the catalog that the cascading reference exists. Then it sends
    one insert naming a request id that `contact_submissions`' own check forbids, so it can store nothing. The insert
    must be refused with **`23503`** (the reference), not **`42501`** (privilege).

  The `contact_submissions` grant test must still be green. It shows the role still cannot read any personal column
  (8V criterion 13).
- **Step 8:** `designs` is unchanged. On production, read it with `has_table_privilege`, not by attempting a delete.

**The test database.** The live persistence suite applies `0010` to the test database on its next run, as it does
every migration: each live file's `beforeAll` runs the migrations with that database's owner credential, and CI's
persistence leg does the same. No grant is needed there. *(2026-10-17: whether a live run has already applied it there
was relayed, not read by the scribe; `migrate:status test` shows the ledger.)*

### Revoking one frozen kitchen link (owner, by hand; added 2026-10-17)

A link in a shop's notice ends only when its row is revoked or its contact request is deleted (cascade). The customer
never holds this link, so only the owner can withdraw it (ADR 0165 D6). **The application role cannot do this**: it holds
`INSERT, SELECT` only, and the privilege test proves `update … set revoked_at` is refused (`42501`). Use the **owner**
credential for that environment, in the database console.

1. **Take the token** from the link: the last path segment of `…/ro/s/<token>`, 12 letters and digits. Never paste a
   token into a shared channel; it opens the kitchen.
2. **Compute its hash** on your own machine: the stored value is the lowercase SHA-256 hex of the token
   (`apps/web/src/lib/server/share-token.ts:55` [src]), for example `printf '%s' '<token>' | shasum -a 256`.
3. **Revoke, read-back first:**

   ```sql
   -- Expect one row, revoked_at null.
   select created_at, revoked_at
   from contact_submission_views
   where token_hash = '<sha256 hex>';

   update contact_submission_views
   set revoked_at = now()
   where token_hash = '<sha256 hex>' and revoked_at is null;
   ```

   Expect `UPDATE 1`. `UPDATE 0` means the hash is wrong or the link is already revoked: stop and re-check step 2.
4. **Check:** the link now shows the same not-found page as an unknown token. Nothing in `design_share_links` changes,
   and the customer's own share link is unaffected (ADR 0165 D9).

A retried notice may have carried a **second** link for the same request (ADR 0165 D4). To find every link of one
request, read `select token_hash, created_at, revoked_at from contact_submission_views where client_request_id = '<id>'`
and revoke each row the same way. Do not delete rows: revocation is the operation (add-only spirit; ADR 0151 covers
test rows only).

## For `0011_create_presets.sql` (wave M8C P1, added 2026-10-18)

The steps above stand; the table is `presets`, the version is **11**. It holds the kitchens the owner saves as presets:
the room each was saved in, a copy of the design at the schema version it was written in, an optional typed name, one
image, a status and a time. It holds no design id and nothing personal. The decision and its reasons: [ADR 0112](../decisions/0112-the-preset-library-is-owner-authored-data-behind-a-server-side-gate.md)
decision 1 and its Amendment A; the plan: `docs/milestones/M8C-generation-fill-and-preset-authoring.md`, section 3.2. The
privilege-test arm is one of the four tests the owner's option C keeps ([ADR 0168](../decisions/0168-the-owners-no-new-tests-is-option-c-for-m8c-the-existing-suites-are-updated-and-four-places-keep-a-committed-test.md),
exception 1). These steps were written by the P1 developer and **have not been executed anywhere** [src: written from the
migration and the test; nothing was run against a database]. **Order of environments: preview first, then production**,
every step on one database before the next.

**On production, `0009` and `0010` are expected to be pending** [plan, section 3.2, which cites `docs/STATUS.md`; the
STATUS owner list itself names only `0010` and its grant as owed, and lists "production migration state of `0004` and
`0009`'s owner steps" as still to be read, so this is not established]. **Run `migrate:status production` first and
follow what the ledger says.** The migration runner applies every pending file in order, so a ledger at **8** means one
run applies all three, and **their grants are owed too**:

| Order on production | What | Section |
| --- | --- | --- |
| 1 | Run the migration: from a ledger at **8**, it reads **11** after, having applied `0009`, `0010` and `0011` | steps 1 and 2 of each section below |
| 2 | Grants for `csp_reports` and `csp_report_cursor` (two statements) | *For `0009`*, step 4 |
| 3 | Grant for `contact_submission_views` (one statement) | *For `0010`*, step 4 |
| 4 | Grant for `presets` (one statement) | this section, step 4 |
| 5 | The privilege test as `app_designs`, quoted per environment | each section's steps 5 to 7 |
| 6 | **Then** the deploy of the code that reads them | |

**The order against the code matters, as for `0010`.** The code of the later M8C waves reads and writes `presets`. Until the
table and the grant exist, a save answers with an error and Step 1's list fails open to composition (plan, section 3.5).
The code that reads `0010` answers 500 for an unknown share token until that table and its grant exist (the `0010`
section). So: the migration, then every grant, then the deploy.

**Do not use `.github/workflows/deploy.yml` for this rollout.** It migrates and then deploys in one run (ADR 0096
decision 2) and has no grant step, so the code would reach production before any grant exists. Migrate manually with the
steps below, issue the grants, prove them with the privilege test as `app_designs`, and only then merge or promote the
code.

**Presets are backed up only where wave P2's export has run, and the `designs` export never covers them.** The nightly
`designs` export is scoped to `designs` (`BACKUP_BLOB_PREFIX = "backups/designs/"`). Wave P2 added a second, separately
scoped export of `presets` under `backups/presets/` (cron `/api/cron/backup-presets`, 03:15 UTC daily, 14-day rotation),
and Neon's point-in-time history is only 6 hours. **Do not author presets on a database until all three hold there:**
the code containing P2 is deployed to that environment, the Cron Jobs tab of the Vercel dashboard lists
`/api/cron/backup-presets`, and `vercel blob list --prefix backups/presets/` shows at least one object (a run over an
empty table still writes one, a single newline). The export runs on **Production only**: it authenticates with
`CRON_SECRET`, which is deliberately not set for Preview, so presets authored on a preview database are never backed up
([ADR 0009](../decisions/0009-deployment-configuration-gaps.md) item 4). The restore recipe is *Restoring the `presets`
table* in [`design-db-restore.md`](design-db-restore.md)
([ADR 0112](../decisions/0112-the-preset-library-is-owner-authored-data-behind-a-server-side-gate.md), Amendment A,
*Consequences*). This has not been observed running anywhere [src: written from the code; nothing was deployed or run].

- **Step 1:** `pnpm --filter @lemnaria/persistence run migrate <environment>`, then
  `pnpm --filter @lemnaria/persistence run migrate:status <environment>`. The ledger reads **11** (1 to 10 before, or
  1 to 8 on a production that has not had `0009` and `0010`). For preview, pass `PREVIEW_OWNER_DATABASE_URL` as
  `MIGRATION_DATABASE_URL` for that one invocation, with the label `preview`
  ([environments-and-resources.md](../best-practices/environments-and-resources.md)).
- **Step 2, for `0011`:** `create table if not exists` passes over an older table of the same name, so confirm the table
  is the one `0011` describes. Run these read-only, in the database console, with the migration credential:

  ```sql
  -- Expect 13.
  select count(*) as columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'presets';

  -- Expect c = 14, p = 1.
  select contype, count(*) as constraints
  from pg_constraint
  where conrelid = 'public.presets'::regclass and contype in ('c', 'p')
  group by contype order by contype;

  -- Expect 0 before any preset has been saved.
  select count(*) as presets from presets;
  ```

  That is **13 columns and 15 constraints**: the primary key on `id`, thirteen column checks
  (`presets_id_is_a_design_id_shape`, `presets_shape_is_known`, `presets_wall_a_is_positive`,
  `presets_wall_b_is_positive`, `presets_wall_c_is_positive`, `presets_height_is_positive`,
  `presets_schema_version_is_positive`, `presets_design_document_is_an_object`, `presets_design_document_size`,
  `presets_typed_name_length`, `presets_thumbnail_size`, `presets_thumbnail_type_is_known`, `presets_status_is_known`)
  and the table check `presets_walls_match_shape`. Any other answer means stop and report.
- **Before step 4, on each database, read `pg_default_acl`** with the query in the `0009` section. Any row that would
  reach `presets` for `app_designs` or `PUBLIC` means stop and report, as in step 3.
- **Step 3:** run this before the grant, with the table present. In the privilege test, the two `public.presets`
  tests must be **red with nothing held**, not skipped. A skip, *"public.presets does not exist yet on this database"*, means
  `0011` is not on the database reached.
- **Step 4: issue exactly this one statement, preview first.** The insert is granted by column, not by table:

  ```sql
  GRANT SELECT, INSERT (
      id, shape, wall_a_mm, wall_b_mm, wall_c_mm, height_mm, schema_version, design_document, typed_name, thumbnail,
      thumbnail_type
    ) ON TABLE public.presets TO app_designs;
  ```

  `created_at` and `status` are left out on purpose. Their defaults (`now()` and `'published'`) are then the only values
  the application can give them, so a leaked credential can neither stamp a row with a far-future `created_at` to keep
  it first in every listing nor insert a row already hidden. Do not grant `INSERT` on the table, nor `UPDATE`, `DELETE`,
  `TRUNCATE`, `REFERENCES`, `TRIGGER` or `ALL`. Do not add `WITH GRANT OPTION`. Grant nothing to `PUBLIC` and nothing
  on `ALL TABLES IN SCHEMA`. The application never hides, shows or rewrites a preset: the owner does, by hand, below
  ([ADR 0008](../decisions/0008-least-privilege-database-role.md)).
- **Steps 5 to 7, as `app_designs` on each database.** Run the privilege test file with `DATABASE_URL` set to that
  environment's application-role URL, for that one invocation. Use the command in the `0009` section. Quote the run's
  own line `reached database "…" as role "…"` with the outcome, for preview and again for production.

  The two `public.presets` tests must have **run, not skipped**. The first asserts, asked of the catalog (`PUBLIC` and
  inherited roles included):
  - *Holds exactly the grant:* table-level `SELECT` and no other table-level privilege (so table-level `INSERT` is
    false); column-level `INSERT` on exactly the eleven columns of step 4 and on neither `created_at` nor `status`; no
    column `UPDATE` or `REFERENCES`; nothing with grant option.
  - *Nothing through `PUBLIC`.*
  - *The negative controls.* `explain delete from public.presets` and `explain update public.presets set status =
    'hidden'` are each refused with SQLSTATE **`42501`**. The update is the owner's hiding statement, so its refusal is
    the proof that the application cannot hide, show or rewrite a preset.

  The second is the planning test. **Positive:** `explain` of the repository's own record statement and list statement
  is planned without error: the server finds the column grant enough. The test builds them with the repository's own
  statement functions, so they are the statements it sends. **Negative control:** `explain insert` naming `status`, and
  `explain insert` naming `created_at`, are each refused with SQLSTATE **`42501`**; that is what makes the grant's
  omission of the two columns checked and not assumed. Both tests send `explain`, which plans a statement and never
  runs it, and insert nothing.

  On production, the `csp_reports` and `contact_submission_views` tests have never run either; their passing arms are
  quoted from the same run (the `0009` and `0010` sections).
- **Step 8:** `designs` is unchanged. On production, read it with `has_table_privilege`, not by attempting a delete.

**The test database.** The live persistence suite applies `0011` to the test database on its next run, as it does every
migration: each live file's `beforeAll` runs the migrations with that database's owner credential, and CI's persistence
leg does the same. No grant is needed there.

### Hiding one preset (owner, by hand; added 2026-10-18)

A published preset is shown on Step 1 of every room whose walls are within 600 mm of its own, and no customer can
withdraw it. Only the owner can: the application role holds `SELECT` and `INSERT` on named columns only, and the
privilege test proves `update … set status` is refused (`42501`). A hidden row is never read by the application again:
every read adds `status = 'published'`, and the image route answers not-found for it. Use the **owner** credential for
that environment, in the database console. Never delete a row (add-only spirit; [ADR 0151](../decisions/0151-a-test-may-delete-the-rows-tests-added-and-never-a-row-a-production-user-added.md)
covers test rows only).

**Hiding is immediate only for requests that are not cached.** The plan serves a preset's image with `Cache-Control:
public, max-age=31536000, immutable` (plan, section 3.5), so a copy already held by a browser or by the CDN stays
available for up to a year after the row is hidden, to anyone who holds its address. The listing is cached for 60
seconds, after which the preset is no longer offered. Hiding therefore also needs a CDN purge: in the Vercel dashboard,
the project's caches, purge the CDN cache (or invalidate the image address) [inf: the exact control was not checked
here]. A copy in an individual browser cannot be purged and expires with its `max-age`. Until the image route's
`max-age` is shortened (a note for wave P6 in the plan), do not rely on a hidden image being gone.

1. **Find the preset.** Read the columns that identify it, never the image or the document:

   ```sql
   select id, shape, wall_a_mm, wall_b_mm, wall_c_mm, height_mm, typed_name, status, created_at
   from presets
   order by created_at desc;
   ```

   The `id` is the 21-character value the image route serves under (`/api/presets/<id>/image`).
2. **Hide it, read-back first:**

   ```sql
   -- Expect one row, status published.
   select id, typed_name, status
   from presets
   where id = '<id>';

   update presets
   set status = 'hidden'
   where id = '<id>' and status = 'published';
   ```

   Expect `UPDATE 1`. `UPDATE 0` means the id is wrong or the preset is already hidden: stop and re-check step 1.
3. **Check:** read the row again; `status` is `hidden`. Step 1 for a room near it no longer offers it (within the
   listing's 60 seconds), and its image address answers not-found to a request that is not cached. **Then purge the CDN
   cache** as above. A customer who already copied the preset into a private design keeps that design: using a preset
   copies it, and the copy does not depend on the row.
4. **To show it again,** the same statement with `set status = 'published' where id = '<id>' and status = 'hidden'`;
   expect `UPDATE 1`.

### If presets are flooding Step 1 (owner, by hand; added 2026-10-18)

Until the gate of ADR 0112 Amendment A is replaced, anyone who can reach an environment can publish a preset onto every
Step 1 screen of that environment's database: the accepted, time-boxed risk. If it happens, hide the rows by time, not
one by one. The application cannot set `created_at` (the grant leaves the column out), so the range below is the
server's clock and not the attacker's.

1. **Find the range.** Read the recent rows and choose `<from>` and `<to>` (timestamps with a zone) that cover the flood
   and none of the owner's own presets:

   ```sql
   select id, shape, typed_name, created_at
   from presets
   where status = 'published'
   order by created_at desc
   limit 100;
   ```
2. **Read the count back first.** Expect exactly the number of rows you mean to hide; if it is more, narrow the range
   before going on:

   ```sql
   select count(*) as to_hide
   from presets
   where status = 'published' and created_at >= '<from>' and created_at < '<to>';
   ```
3. **Hide them,** with the same range:

   ```sql
   update presets
   set status = 'hidden'
   where status = 'published' and created_at >= '<from>' and created_at < '<to>';
   ```

   Expect `UPDATE <count from step 2>`. Any other number means the table changed in between: stop and read again.
4. **Check and purge,** as in *Hiding one preset*, steps 3 and the CDN purge. The rows stay in the table as `hidden`
   (the owner's own presets inside the range can be shown again one by one, step 4 above).

## For `0012`–`0015`, the login and register tables (M8B wave L1, added 2026-10-17)

The steps above stand. The tables are `accounts`, `account_sessions` and `account_email_tokens`; `0015` adds the column
`designs.account_id`. The ledger goes from **11 to 15**. The decision and its reasons: [ADR 0172](../decisions/0172-a-client-account-is-an-e-mail-and-an-argon2id-password-a-session-is-a-hashed-host-only-cookie-a-role-is-a-named-set-of-capabilities-and-a-claimed-design-opens-on-any-device.md)
(**Proposed** at the time of writing) and the plan `docs/milestones/M8B-login-register-plan.md`, §4. **Nothing in this
section has been executed anywhere** [written in wave L1 by its developer; written, not run]. **Order of environments: preview first, then
production**, every step on one database before the next.

**Prerequisite.** Version **11** is M8C's `0011_create_presets.sql`, which `main` carries and this branch now contains
(merged 2026-10-19; `packages/persistence/src/migrations/` holds `0001` to `0015` with no gap and no duplicate number
[source-verified, directory listing, 2026-10-19]). The migration runner refuses a gap, so `0012` cannot be applied to a
database whose ledger reads fewer than 11, and `0012`-`0015` must not be applied anywhere before `0011` is on that
database. Production still needs `0009`, `0010` and `0011` first (sections above); apply them, then `0012`-`0015`.

**Ledger and `0012` as built (update 2026-10-18, developer report; not run by the scribe).** `0011` is M8C's, so the ledger reads **1-11 before** and **1-12 after** applying `0012` alone. In
`0012` the hash constraint is named `accounts_password_hash_is_phc` and checks only the generic PHC shape
`^[$][a-z0-9-]{1,32}([$]v=[0-9]+)?[$][^$]+[$][A-Za-z0-9+/]{16,}[$][A-Za-z0-9+/]{16,}$` (strict argon2id is enforced in code,
`password-hash-shape.ts`); the `locale` check is `^[a-z]{2}(-[a-z]{2})?$`. Any check that looks for the old name
`accounts_password_hash_is_argon2id` will not find it. The unattended screen function returned `[]` on `0012` alone, but the
CLI gate could not run until `0011` was present (it is now, after the merge; not re-run).

**The order against the code matters.** Every account route and every session read names these tables. If the code ships
before the migrations and the grants, those requests answer 500 (a failed session read reads as anonymous, which is less
access, so a visitor still works). The order is the migrations, then the grants, then the code.

**Production grants are blocked this round.** Steps 3 and 5 to 7 prove the grant with `application-role-privileges.test.ts`,
and that file has **no arms for these three tables yet** (owed, M8B plan §9; no tests are written this round). Until the arms
exist, use the read-only catalog checks in step 7 below on preview, and do not grant on production.

- **Step 1:** `pnpm --filter @lemnaria/persistence run migrate <environment>`, then
  `pnpm --filter @lemnaria/persistence run migrate:status <environment>`. The ledger reads **15** (1 to 11 before). For
  preview, pass `PREVIEW_OWNER_DATABASE_URL` as `MIGRATION_DATABASE_URL` for that one invocation, with the label `preview`
  ([environments-and-resources.md](../best-practices/environments-and-resources.md)).
- **Step 2, for `0012`–`0015`:** `create table if not exists` passes over an older table of the same name, so confirm the
  tables are the ones the files describe. Read-only, in the database console, with the migration credential:

  ```sql
  -- Expect account_email_tokens = 6, account_sessions = 6, accounts = 13.
  select table_name, count(*) as columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('accounts', 'account_sessions', 'account_email_tokens')
  group by table_name order by table_name;

  -- Expect account_email_tokens: c = 2, f = 1, p = 1; account_sessions: c = 1, f = 1, p = 1;
  -- accounts: c = 9, p = 1, u = 1. (PostgreSQL 18 also lists NOT NULL as 'n'; the filter leaves it out.)
  select conrelid::regclass::text as table_name, contype, count(*) as constraints
  from pg_constraint
  where conrelid in (
      'public.accounts'::regclass, 'public.account_sessions'::regclass, 'public.account_email_tokens'::regclass
    )
    and contype in ('c', 'f', 'p', 'u')
  group by 1, 2 order by 1, 2;

  -- Expect two rows, both on accounts (id), both cascading ('c'): account_email_tokens and account_sessions.
  select conrelid::regclass::text as referencing, confrelid::regclass::text as referenced, confdeltype
  from pg_constraint
  where contype = 'f'
    and conrelid in ('public.account_sessions'::regclass, 'public.account_email_tokens'::regclass)
  order by 1;

  -- Expect one row: account_id, text, YES (nullable).
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'designs' and column_name = 'account_id';

  -- Expect designs_account_id_shape (c), and no foreign key from designs to accounts.
  select conname, contype from pg_constraint
  where conrelid = 'public.designs'::regclass and conname = 'designs_account_id_shape';

  -- Expect: account_email_tokens_newest_unused_idx, account_sessions_live_by_account_idx, designs_account_id_updated_at_idx.
  select indexname from pg_indexes
  where schemaname = 'public'
    and indexname in (
      'account_email_tokens_newest_unused_idx', 'account_sessions_live_by_account_idx',
      'designs_account_id_updated_at_idx'
    )
  order by indexname;
  ```

  That is **3 tables, 13 + 6 + 6 columns, 11 + 3 + 4 named constraints (the primary keys and the one unique included)**, the
  new `designs` column, constraint and index. Any other answer means stop and report.
- **Before step 4, on each database: read `pg_default_acl`** with the query in the `0009` section. A row that would reach
  `accounts`, `account_sessions` or `account_email_tokens` for `app_designs` or `PUBLIC` is a stop-and-report, as in step 3.
- **Before step 4, on each database: the pre-grant probes.** Read-only, with the migration credential. They prove that
  nothing the grant will withhold is held already, through `PUBLIC`, a default privilege or a role membership. **Expect
  `held = false` on every row.** One `true` is a stop-and-report; do not grant. The same query runs again after step 4 and
  must still answer false on every row (the grant adds `SELECT`, `INSERT` and `UPDATE` on the named columns only):

  ```sql
  -- Pre-grant probes: expect false on all ten rows, before step 4 and again after it.
  select 'accounts delete' as probe, has_table_privilege('app_designs', 'public.accounts', 'DELETE') as held
  union all select 'accounts truncate', has_table_privilege('app_designs', 'public.accounts', 'TRUNCATE')
  union all select 'account_sessions delete', has_table_privilege('app_designs', 'public.account_sessions', 'DELETE')
  union all select 'account_sessions truncate', has_table_privilege('app_designs', 'public.account_sessions', 'TRUNCATE')
  union all select 'account_email_tokens delete',
    has_table_privilege('app_designs', 'public.account_email_tokens', 'DELETE')
  union all select 'account_email_tokens truncate',
    has_table_privilege('app_designs', 'public.account_email_tokens', 'TRUNCATE')
  union all select 'accounts.created_at insert', has_column_privilege('app_designs', 'public.accounts', 'created_at', 'INSERT')
  union all select 'accounts.email_verified_at insert',
    has_column_privilege('app_designs', 'public.accounts', 'email_verified_at', 'INSERT')
  union all select 'account_sessions.absolute_expires_at update',
    has_column_privilege('app_designs', 'public.account_sessions', 'absolute_expires_at', 'UPDATE')
  union all select 'account_sessions.account_id update',
    has_column_privilege('app_designs', 'public.account_sessions', 'account_id', 'UPDATE');
  ```

  Before the grant they are false because nothing has been granted; after it, because the grant does not reach them. Either
  way a `true` is a stop-and-report.
- **Step 4, exactly these seven statements, preview first** (column-scoped, so that the application cannot write a role,
  and every account it creates is a client. This does not make an SQL injection harmless: it could still insert an
  `account_sessions` row for an administrator, update `password_hash`, or null `revoked_at` or `used_at`, and no grant can
  prevent that. That risk is accepted, [ADR 0172](../decisions/0172-a-client-account-is-an-e-mail-and-an-argon2id-password-a-session-is-a-hashed-host-only-cookie-a-role-is-a-named-set-of-capabilities-and-a-claimed-design-opens-on-any-device.md) decision 7):

  ```sql
  GRANT SELECT ON TABLE public.accounts TO app_designs;
  GRANT INSERT (id, email, email_normal_form, password_hash, locale, phone, phone_normal_form, privacy_notice_version)
    ON TABLE public.accounts TO app_designs;
  GRANT UPDATE (email_verified_at, password_hash, password_changed_at, updated_at, locale, phone, phone_normal_form,
                privacy_notice_version)
    ON TABLE public.accounts TO app_designs;

  GRANT SELECT, INSERT ON TABLE public.account_sessions TO app_designs;
  GRANT UPDATE (last_seen_at, revoked_at) ON TABLE public.account_sessions TO app_designs;

  GRANT SELECT, INSERT ON TABLE public.account_email_tokens TO app_designs;
  GRANT UPDATE (used_at) ON TABLE public.account_email_tokens TO app_designs;
  ```

  **No `DELETE`, no `TRUNCATE`, no `ALL`, no `WITH GRANT OPTION`, nothing to `PUBLIC`, nothing on
  `ALL TABLES IN SCHEMA`.** On `accounts`, `role` and `created_at` get no `INSERT` or `UPDATE`; `id`, `email` and
  `email_normal_form` get `INSERT` and never `UPDATE`. `SELECT` is table-wide, so `role` is readable (every request
  reads it). Nothing on
  `designs` changes: `app_designs` already holds table-level `UPDATE` there (ADR 0019 decision 11), which covers
  `account_id`. That also means an SQL injection can reassign `account_id` on any design, which is an access-control column;
  the risk is accepted and recorded in ADR 0019's note of 2026-10-18.
- **Steps 5 to 7, until the test arms exist: read-only catalog checks with the migration credential.** These replace the
  privilege test for these tables and prove less: they show what was granted, not that the application role's connection
  behaves. Run them on preview after step 4.

  ```sql
  -- Table-level privileges. Expect: accounts SELECT; account_sessions INSERT, SELECT; account_email_tokens INSERT, SELECT.
  -- No row for PUBLIC, no DELETE, TRUNCATE, REFERENCES or TRIGGER for app_designs, nothing with is_grantable = YES.
  select table_name, grantee, privilege_type, is_grantable
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('accounts', 'account_sessions', 'account_email_tokens')
    and grantee in ('app_designs', 'PUBLIC')
  order by table_name, grantee, privilege_type;

  -- Column-level writes on accounts. Expect INSERT on exactly the 8 columns named in step 4 and UPDATE on exactly the 8
  -- named in step 4; none of them role, id (UPDATE), email (UPDATE), email_normal_form (UPDATE), created_at.
  select column_name, privilege_type
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'accounts'
    and grantee = 'app_designs' and privilege_type in ('INSERT', 'UPDATE')
  order by privilege_type, column_name;

  -- Expect: the only UPDATE columns are last_seen_at and revoked_at (sessions) and used_at (tokens).
  select table_name, column_name, privilege_type
  from information_schema.column_privileges
  where table_schema = 'public' and table_name in ('account_sessions', 'account_email_tokens')
    and grantee = 'app_designs' and privilege_type = 'UPDATE'
  order by table_name, column_name;

  -- Expect false on every row.
  select 'role insert' as probe, has_column_privilege('app_designs', 'public.accounts', 'role', 'INSERT') as held
  union all select 'role update', has_column_privilege('app_designs', 'public.accounts', 'role', 'UPDATE')
  union all select 'id update', has_column_privilege('app_designs', 'public.accounts', 'id', 'UPDATE')
  union all select 'email update', has_column_privilege('app_designs', 'public.accounts', 'email', 'UPDATE')
  union all select 'email_normal_form update',
    has_column_privilege('app_designs', 'public.accounts', 'email_normal_form', 'UPDATE')
  union all select 'created_at update', has_column_privilege('app_designs', 'public.accounts', 'created_at', 'UPDATE');
  ```

  Any `DELETE`, any row for `PUBLIC`, any `true` in the last query, or any column outside the lists is a stop-and-report.
  **Run the pre-grant probes above again here** and quote them: every row must still read false.
- **Step 8:** `designs` is unchanged apart from the new column. On production, read it with `has_table_privilege`, not by
  attempting a delete.

### Making the first administrator (owner, by hand, console)

The application cannot write `role`, so a staff account exists only by this step (ADR 0172 decision 7). No staff wave is
built yet, so it is optional this round. **It needs the owner credential and cannot be done by the application role.**

1. **Register and confirm the address in the application as an ordinary client**, so that the row carries a real argon2id
   hash from the application. Do not insert an account by hand: nothing outside the application should make a password hash.
2. **Read the row first, with the address in lower case** (the stored `email_normal_form`):

   ```sql
   -- Expect one row, role = client, email_verified_at set.
   select id, role, email_verified_at from accounts where email_normal_form = '<lower-case address>';
   ```

   Not verified, or more than one row, or none: stop.
3. **Promote, then end every session of that account in the same transaction**, because a role change takes effect at the
   next request but a session that was already open should not outlive the decision (ADR 0172 decision 3):

   ```sql
   begin;
   update accounts set role = 'administrator', updated_at = now() where id = '<id from step 2>' and role = 'client';
   update account_sessions set revoked_at = now() where account_id = '<id from step 2>' and revoked_at is null;
   commit;
   ```

   Expect `UPDATE 1` for the first statement. `UPDATE 0` means the id is wrong or the role is not the one the guard names: roll back and
   re-check step 2. The second statement may be `UPDATE 0` if the account holds no live session.
4. **Demoting or any later role change is the same two statements** with the new role, in the same transaction, **and the
   first statement's guard names the account's current role, not `client`**: read the role in step 2, then write
   `... where id = '<id>' and role = '<the role step 2 read>'`. Copied unchanged, `and role = 'client'` matches nothing for a
   staff account and the statement answers `UPDATE 0`, which looks like a wrong id. The role column accepts only `client`,
   `operator` and `administrator` (`accounts_role_is_known`).
5. **Check:** the account signs in again and holds the new role's capabilities; the old session is refused.

### Revoking one account's sessions by hand (owner)

For a suspected compromise, with the owner credential: `update account_sessions set revoked_at = now() where account_id =
'<id>' and revoked_at is null;`, then read it back with the same predicate on `select count(*)`. Do not delete rows:
revocation is the operation.

### The account tables are not in the nightly export

The nightly export covers `designs` only (`BACKUP_BLOB_PREFIX = "backups/designs/"`). `accounts`, `account_sessions` and
`account_email_tokens` are **not** in it, and **a restore of `designs` loses `account_id`**: the export's row type and both
of its selects in `packages/persistence/src/design-row-source.ts` list `write_token_hash` and `visitor_hash` and omit
`account_id` [source-verified, 2026-10-18]. Every restored design comes back unclaimed (`account_id` null), so the
claim is lost and the design opens on other devices no longer (ADR 0172 decision 8) [inference from the column's meaning]. Adding `account_id`
to the export is owed to a later wave; it must come with an accounts backup, or the restored values would name accounts a
restore will not recreate. Sessions and tokens are never backed up on purpose, so a restore cannot revive one (ADR 0172
decision 10). The accounts backup is a later wave.

**The test database.** The live persistence suite applies every migration to the test database through each live file's
`beforeAll`; no grant is needed there.

## Why step 5 names the application role

The file is safe on any credential (criterion 13): it refuses to run past its guard as an owner. It is also only
meaningful as the role that serves traffic. Until step 7 has been quoted for an environment, the grant half of
criterion 7 is **written and never executed** there.

## Recording the result

Quote the line from step 6 and the test's outcome in the wave's close-out. A result without the line does not say which
database it describes.
