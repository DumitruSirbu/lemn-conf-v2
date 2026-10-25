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

## For `0016`–`0019`, the client dashboard columns and the reservation index (M8B Lot 2 wave S1, added 2026-10-19; `0019` added 2026-10-20)

The steps above stand. No table is created: `0016` adds four columns to `designs`, `0017` adds two to `accounts`, and
`0018` adds two to `account_email_tokens`, and `0019` adds one partial index to the same table (the lookup of a reserved
address, security review finding F3 of wave S13b; **no grant**, an index is not a privilege). The ledger goes from **15 to 19**. The decision and its reasons: ADR 0172
Amendment F (P6, P8, P12) and the plan `docs/milestones/M8B-account-screens-lot2-plan.md`, section 2.4 step 2.
**Nothing in this section has been executed anywhere** [written in wave S1 by its developer; the SQL and the grants
below have not been run against any database, and the privilege test has no arms for them: no tests this round,
ADR 0172 D12]. **The numbers `0016`–`0019` are provisional** until the M8C merge settles which migration numbers the
base holds (ADR 0172, Remaining items 1 and 9); if a number changes, the file names, the ledger readings below and the
headers' ledger sentences change with it, **before** any of them is applied. **Order of environments: preview first,
then production**, every step on one database before the next.

**Apply order.** `0016`–`0019` come **after `0015`** and the runner refuses a gap, so a database whose ledger reads
fewer than 15 takes `0012`–`0015` first (section above), including their own grants. Then, in this order: the
migrations (step 1), the checks (step 2), the grants (step 4), the code. The migrations are additive, so applying them
before the code is harmless; the code naming a column the database lacks answers 500. `0016`–`0018` pass the
unattended screen [executed in wave S1: `pnpm --filter @lemnaria/persistence run migrate:unattended-check` printed
"every migration file is additive and idempotent" and exited 0; executed again on 2026-10-20 with `0019` present, same
answer], but applying them stays the owner's step. `0019` can be applied before or after the code that reads the
reservation: the queries are the same with or without the index.

**The nightly `designs` backup names `0016`'s columns.** Its select reads `sent_at`, `hidden_by_client_at` and
`deleted_by_client_at`, so `0016` (and `0015` before it, which the runner requires) must be applied in each
environment **before** the web code that contains that export ships. Until then the cron `/api/cron/backup-designs` answers `503` with status `export-failed`
and no recovery point is written that night (`docs/runbooks/design-db-restore.md`, Path 2).

**What is new to grant, and what is not.**

| Table | Grant | Why | When |
| --- | --- | --- | --- |
| `accounts` | `UPDATE (name, address)` | The profile save (E6, wave S7) writes both; the phone it also writes is already granted by `0012` | With the S7 code |
| `accounts` | `UPDATE (email, email_normal_form)` | The e-mail change confirm (E9, P12 point 2) rewrites the address. **This is the grant ADR 0172 D7 reserves for its own review**: until now `email` and `email_normal_form` were INSERT-only, so an injection could not change which address an account answers to | **Not before wave S9 ships and the security reviewer has accepted it**; see the risk note below |
| `account_email_tokens` | `INSERT (new_email, new_email_normal_form)` | The request (E8) stores the new address on the token row | Step 4. Redundant beside `0014`'s table-level `INSERT`, which already covers a new column; granted by name so the privilege checks list each column |
| `designs` | none | `app_designs` holds table-level `UPDATE` (ADR 0019 decision 11), which covers all four new columns | — |

- **Step 1:** `pnpm --filter @lemnaria/persistence run migrate <environment>`, then
  `pnpm --filter @lemnaria/persistence run migrate:status <environment>`. The ledger reads **19** (1 to 15 before). For
  preview, pass `PREVIEW_OWNER_DATABASE_URL` as `MIGRATION_DATABASE_URL` for that one invocation, with the label `preview`
  ([environments-and-resources.md](../best-practices/environments-and-resources.md)).
- **Step 2, for `0019`:** `create index if not exists` passes over an older index of the same name, so confirm it is the one
  the file describes. Read-only, with the migration credential:

  ```sql
  -- Expect 1 row: the index on account_email_tokens (new_email_normal_form), partial on purpose and used_at.
  select indexname, indexdef from pg_indexes
  where schemaname = 'public' and tablename = 'account_email_tokens'
    and indexname = 'account_email_tokens_live_reservation_idx';
  ```

  `indexdef` must read `… USING btree (new_email_normal_form) WHERE ((purpose = 'email-change-revert'::text) AND (used_at IS NULL))`
  [inference from the SQL, never run]. Any other answer means stop and report.
- **Step 2, for `0016`–`0018`:** `add column if not exists` passes over an older column of the same name, so confirm the
  columns and checks are the ones the files describe. Read-only, with the migration credential:

  ```sql
  -- Expect 8 rows: designs.name text, designs.sent_at / hidden_by_client_at / deleted_by_client_at timestamptz,
  -- accounts.name / accounts.address text, account_email_tokens.new_email / new_email_normal_form text; all YES (nullable).
  select table_name, column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public'
    and ((table_name = 'designs' and column_name in ('name', 'sent_at', 'hidden_by_client_at', 'deleted_by_client_at'))
      or (table_name = 'accounts' and column_name in ('name', 'address'))
      or (table_name = 'account_email_tokens' and column_name in ('new_email', 'new_email_normal_form')))
  order by table_name, column_name;

  -- Expect these 6 check constraints, contype c, each present once.
  select conrelid::regclass::text as table_name, conname
  from pg_constraint
  where contype = 'c'
    and conname in (
      'designs_name_length', 'accounts_name_length', 'accounts_address_length',
      'account_email_tokens_new_email_length', 'account_email_tokens_new_email_normal_form_length',
      'account_email_tokens_new_email_is_set_with_its_normal_form'
    )
  order by 1, 2;

  -- Expect: accounts = 15 columns (it was 13); account_email_tokens = 8 columns (it was 6).
  select table_name, count(*) as columns
  from information_schema.columns
  where table_schema = 'public' and table_name in ('accounts', 'account_email_tokens')
  group by table_name order by table_name;

  -- Expect: accounts = 11 constraints of kind c (it was 9); account_email_tokens = 5 (it was 2). Other kinds unchanged.
  select conrelid::regclass::text as table_name, count(*) as check_constraints
  from pg_constraint
  where contype = 'c'
    and conrelid in ('public.accounts'::regclass, 'public.account_email_tokens'::regclass)
  group by 1 order by 1;
  ```

  Any other answer means stop and report. **Behaviour of the checks, to confirm on preview once and not assume** [inference
  from the SQL, never run]: an empty string is refused in `name` and `address`, a 121-character `name` is refused, a lone
  `new_email` without its normal form is refused, and `NULL` passes every check.
- **The probes for these grants**, read-only, in their own query and not appended to the older section's "false on every
  row" block (whose expectation they would break). Run it before step 4, after step 4 and after step 4b:

  ```sql
  select 'accounts.name update' as probe, has_column_privilege('app_designs', 'public.accounts', 'name', 'UPDATE') as held
  union all select 'accounts.address update', has_column_privilege('app_designs', 'public.accounts', 'address', 'UPDATE')
  union all select 'account_email_tokens.new_email update',
    has_column_privilege('app_designs', 'public.account_email_tokens', 'new_email', 'UPDATE');
  ```

  | When | `accounts.name update` | `accounts.address update` | `account_email_tokens.new_email update` |
  | --- | --- | --- | --- |
  | Before step 4 | false | false | false |
  | After step 4 | **true** | **true** | false |
  | After step 4b | true (unchanged) | true (unchanged) | false (unchanged) |

  Step 4b changes none of these three: it grants `UPDATE` on `email` and `email_normal_form`, which the older section's
  probes `email update` and `email_normal_form update` report. Any other reading means stop and report.
- **Step 4 (profile), preview first.** Exactly these statements:

  ```sql
  GRANT UPDATE (name, address) ON TABLE public.accounts TO app_designs;
  GRANT INSERT (new_email, new_email_normal_form) ON TABLE public.account_email_tokens TO app_designs;
  ```

  No `DELETE`, no `TRUNCATE`, no `ALL`, no `WITH GRANT OPTION`, nothing to `PUBLIC`. No `INSERT` on `accounts.name` or
  `address`: registration writes neither.
- **Step 4b (e-mail change), separately and later.** Run only when wave S9 is built and reviewed:

  ```sql
  GRANT UPDATE (email, email_normal_form) ON TABLE public.accounts TO app_designs;
  ```

  **Gate: do not run this statement before both of these hold.** (a) The S9 security-review findings F1 (the owner's
  ruling on the notice and undo path for an address change), F2 (the `email-change` tokens retired on every request, so
  the token table does not depend on whether the address exists) and F3 (the token bound to the password hash that was
  checked) are closed. (b) The confirm page for the link exists. Until then the e-mail-change request (E8) and
  confirmation (E9) routes should stay unreachable from the product. Without the grant E9 answers `503`, so an early
  deploy fails safe; running the grant early would make a half-built flow live.

  **Gate (a), rewritten 2026-10-20 (ADR 0172 Amendment H, plan §14.3.5).** The gate above is superseded on (a). Do not
  run this statement before all of these hold: (1) waves S13-0 through U16 of the M8B Lot 2 plan (§14.4) are committed,
  with green QA and a security review that closes F1; the recovery path they build is the request-time notice to the old
  address and the revert link (`email-change-revert`, 24 hours); (2) F2 and F3 stay closed; (3) the confirm page and the
  revert page exist; (4) the owner runs this step, **preview first**. Only after that, **a separate commit** flips
  `EMAIL_CHANGE_ENABLED` to `true` (the owner's call; nothing ships mid-milestone). The revert needs no grant beyond this
  step. Running 4b earlier exposes nothing while the flag is off, but it widens the injection surface described below.
  Gate (b) is unchanged.

  *Note 2026-10-19 (later), source-verified by the scribe, nothing run:* the confirm page now exists (U11), and E8 and E9
  answer an empty `404` while the constant `EMAIL_CHANGE_ENABLED` (`apps/web/src/account/profile/email-change-enabled.ts`)
  is `false` (`lib/server/account/email-change-gate.ts`). Condition (b) holds and the routes are unreachable; condition (a)
  is still open on F1 (owner question O19). Turning the constant on is a code change, not part of this step.

  After it, the older section's probes `email update` and `email_normal_form update` read **true** and its expectation
  "none of them id (UPDATE), email (UPDATE), email_normal_form (UPDATE)" no longer holds: the `accounts` UPDATE columns are
  then the 8 of the older step 4, plus `name`, `address`, `email`, `email_normal_form` (12). `role`, `id` and `created_at`
  stay false.
- **Step 5 to 7 for this section, read-only catalog checks with the migration credential**, after step 4 (and again after 4b):

  ```sql
  -- Expect UPDATE on accounts: the 8 columns of the older step 4, plus name and address (10); plus email and
  -- email_normal_form (12) only after step 4b. Never role, id, created_at.
  select column_name from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'accounts' and grantee = 'app_designs' and privilege_type = 'UPDATE'
  order by column_name;

  -- Expect: account_email_tokens UPDATE is still used_at alone.
  select column_name from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'account_email_tokens' and grantee = 'app_designs'
    and privilege_type = 'UPDATE'
  order by column_name;
  ```

**Accepted risk, scope grown (ADR 0019 decision 11).** `app_designs` holds table-level `UPDATE` on `designs`, so an SQL
injection can already reassign `write_token_hash` and `account_id` on any design. `0016` adds `hidden_by_client_at` and
`deleted_by_client_at` (setting or clearing them makes any design unopenable or openable again once the gate, wave S4,
honours them) and `sent_at` (marking any design sent). **That is two more access-control columns and one more flag under
a risk accepted in 2026-08 for `write_token_hash`; the owner has not re-accepted it for these.** Narrowing the `designs`
grant to column-level is the real fix and is not part of this round. An injection can already take over an account
today, by the `UPDATE` on `password_hash` and the table-level `INSERT` on `account_sessions` and `account_email_tokens`
(accepted under ADR 0172 D7). What step 4b adds is not a new route to takeover but a **silent, persistent rewrite of the
recovery e-mail channel**: the address an account answers to, and where its reset links go, changed without the password
changing and surviving a later password reset. That is why 4b waits for its own review.

**`sent_at` is not backfilled.** Every design that existed before the contact flow writes it (wave S5) has `sent_at`
NULL and so reads as an unsent draft, even if a request for it was stored earlier. The backfill is open question O11;
`0016` does not guess. *Update 2026-10-20: the owner ruled O11 as no backfill; older kitchens stay unmarked and no
backfill statement is to be run.*

**Rollback.** None by command: the migrations are additive and nothing here drops a column. A wrong column is fixed by a
new migration, never by editing a file that has been applied.

## For `0020`–`0022`, the staff audit log, the kitchen notes and the request states (M8B Lot 3 wave L3-S1, added 2026-10-21)

The steps above stand. Three tables are created, in this order: `staff_audit_events` (`0020`), `design_notes` (`0021`) and
`design_request_states` (`0022`). The ledger goes from **19 to 22**. The decision and its reasons: the plan
`docs/milestones/M8B-account-screens-lot3-plan.md`, section 2.3, and ADR 0173 (**Proposed**, not Accepted) and ADR 0174
(Accepted, decision 4 for the notes). **Nothing in this section has been executed anywhere** [written in wave L3-S1 by its
implementer; no SQL and no grant below has been run against any database, and no agent applies a migration or a grant].
**The numbers `0020`–`0022` are provisional until Lot 3 merges**: they were re-listed on 2026-10-21 [run: `ls
packages/persistence/src/migrations/` in the `feat/login-register` worktree ended at `0019`; `git ls-tree` of `origin/main`
after `git fetch` ended at `0011`], and if `origin/main` gains a migration before the merge, the file names, the ledger
readings below and the headers' ledger sentences change with it **before** any of them is applied. **Order of
environments: preview first, then production**, every step on one database before the next. The test database is the
coordinator's.

**Apply order.** `0020`–`0022` come **after `0019`** and the runner refuses a gap, so a database whose ledger reads fewer than
19 takes `0012`–`0019` first (the sections above), including their grants. Then, in this order: the migrations (step 1),
the table checks (step 2), the pre-grant probes (step 3), the grants (step 4), the catalog checks (step 5), the privilege
test (step 6), the code. The migrations are additive and create empty tables, so applying them before the code is harmless.
The staff routes **fail closed**: against a database without a table they answer `503`, which is the intended behaviour
(ADR 0173 P-L3-3). All three files pass the unattended screen [executed in wave L3-S1: `pnpm --filter @lemnaria/persistence
run migrate:unattended-check` printed "every migration file is additive and idempotent; safe to apply unattended." and
exited 0], but applying them stays the owner's step.

**What is new to grant, and what is not.** Every grant is to `app_designs`, and none is table-level beyond `SELECT`.

| Table | Grant | Why | When |
| --- | --- | --- | --- |
| `staff_audit_events` | `SELECT` | The audit page reads it | With the L3-S3 code |
| `staff_audit_events` | `INSERT (id, actor_account_id, action, design_id, subject_account_id, detail)` | Every staff read of a kitchen and every staff write adds a row. **No `INSERT (occurred_at)`**: a credential cannot backdate or forward-date a row (`0011`'s `created_at` reasoning) | With the L3-S3 code |
| `design_notes` | `SELECT` | The kitchen page and the client's data export read the notes | Before the first staff route (L3-S6) ships |
| `design_notes` | `INSERT (id, design_id, author_account_id, body)` | A staff member adds a note. **No `UPDATE`, no `DELETE`**: a note cannot be edited or deleted (the designer's answer 4; P-L3-5). No `INSERT (created_at)` | Before the first staff route (L3-S6) ships |
| `design_request_states` | `SELECT` | The kitchen page and the list read the status. **The S4 list left-joins this table, so a missing grant makes EVERY staff list answer 503** | Before the first staff route (L3-S6) ships |
| `design_request_states` | `INSERT (design_id, status, changed_by_account_id)` and `UPDATE (status, changed_by_account_id, changed_at)` | The status is one row per design, upserted. No `INSERT (changed_at)`; no `UPDATE (design_id)` | Before the first staff route (L3-S6) ships |
| `accounts` | **none in this section** | The staff-invitation grant `INSERT (role)` is `0024` and a later wave (O-L3-4; a decision record and a security review first). The runbook's `role insert` probe stays **false** | — |
| `presets` | **none in this section** | The preset visibility and position grant is `0023` and a later wave (O-L3-5; an ADR 0112 amendment and a security review first). The `presets` probes stay as the older section has them | — |
| `designs` | none | `app_designs` already holds table-level `UPDATE` (ADR 0019 decision 11); unhide clears `hidden_by_client_at` under it and the scope does not grow again (plan section 2.3) | — |

**Grants the staff routes need, before the first staff route (L3-S6) ships** [added 2026-10-21 from the coordinator's brief and
the `0020`-`0022` headers, read by the scribe; nothing was run]. Missing any one makes the staff routes answer `503`; a
missing `design_request_states` grant makes **every** staff list fail, because the list left-joins it.

- [ ] `designs`: `SELECT`; `UPDATE` (`hidden_by_client_at`) already holds via the table-level `UPDATE`.
- [ ] `accounts`: `SELECT`, table-wide.
- [ ] `contact_submissions`: `SELECT` on `reference`, `client_request_id`, `design_id`, `created_at`.
- [ ] `contact_submission_views`: `SELECT`.
- [ ] `design_notes`: `SELECT` and `INSERT (id, design_id, author_account_id, body)` (the `0021` header's columns).
- [ ] `design_request_states`: `SELECT`, `INSERT (design_id, status, changed_by_account_id)` and
  `UPDATE (status, changed_by_account_id, changed_at)` (the `0022` header).
- [ ] `staff_audit_events`: `SELECT` and `INSERT (id, actor_account_id, action, design_id, subject_account_id, detail)`.
- [ ] `account_sessions`: `SELECT (token_hash, account_id, revoked_at, absolute_expires_at, created_at, last_seen_at)`. The
  audit statement takes the actor from the live session the cookie names, by this read, and every staff route reads the
  session first; a missing grant makes every staff route answer `503`, before any staff table is touched.

**Owner re-acceptance before production** [added 2026-10-21 from the L3-S7 security review; nothing was run]: ADR 0019 d11's
scope growth (`hidden_by_client_at`, `deleted_by_client_at`, `sent_at`) must be re-accepted for hide, delete **and staff
unhide** together before `0020` reaches production. Staff unhide (`/api/staff/kitchens/[id]/unhide`) is a second
production writer of `designs.hidden_by_client_at` under the table-level `UPDATE`; no new grant is needed (ADR 0172
Amendment G item 3, dated note 2026-10-21).

**Owner to confirm first:** the grants of `0008`, `0010` and `0012`/`0017` are recorded in other documents as **not applied**
on preview and production. Confirm them before L3-S6 is deployed; the staff reader depends on them.

- **Step 1:** `pnpm --filter @lemnaria/persistence run migrate <environment>`, then
  `pnpm --filter @lemnaria/persistence run migrate:status <environment>`. The ledger reads **22** (1 to 19 before). For
  preview, pass `PREVIEW_OWNER_DATABASE_URL` as `MIGRATION_DATABASE_URL` for that one invocation, with the label `preview`
  ([environments-and-resources.md](../best-practices/environments-and-resources.md)).
- **Step 2, confirm the tables are the ones the files describe**, because `create table if not exists` passes over an older
  table of the same name. Read-only, with the migration credential:

  ```sql
  -- Expect 3 rows: design_notes 5 columns, design_request_states 4, staff_audit_events 7.
  select table_name, count(*) as columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('staff_audit_events', 'design_notes', 'design_request_states')
  group by table_name order by table_name;

  -- Expect 13 check constraints (contype c) and 3 primary keys (contype p), each present once.
  select conrelid::regclass::text as table_name, conname, contype
  from pg_constraint
  where conrelid in ('public.staff_audit_events'::regclass, 'public.design_notes'::regclass,
                     'public.design_request_states'::regclass)
    and contype in ('c', 'p')
  order by 1, 3, 2;

  -- Expect these 2 secondary indexes, and the 3 primary-key indexes.
  select tablename, indexname, indexdef from pg_indexes
  where schemaname = 'public'
    and tablename in ('staff_audit_events', 'design_notes', 'design_request_states')
  order by tablename, indexname;
  ```

  The 13 checks are `staff_audit_events_id_shape`, `…_actor_account_id_shape`, `…_action_shape`, `…_design_id_shape`,
  `…_subject_account_id_shape`, `…_detail_is_an_object` (6); `design_notes_id_shape`, `…_design_id_shape`,
  `…_author_account_id_shape`, `…_body_length` (4); `design_request_states_design_id_shape`, `…_status_shape`,
  `…_changed_by_account_id_shape` (3). The two secondary indexes must read `… USING btree (occurred_at DESC, id DESC)` for
  `staff_audit_events_newest_first_idx` and `… USING btree (design_id, created_at DESC)` for
  `design_notes_by_design_newest_idx` [verified on the test database by the L3-S1 QA run (5781729b), read-only]. Any other
  answer means stop and report. **Behaviour of the checks:** an `id` of 20 or 22 characters is refused, a `body` of 0 or
  2001 characters is refused, a non-object `detail` is refused, and `NULL` passes every nullable column's check [verified
  on the test database by the L3-S1 QA run (5781729b), read-only]. Preview and production are not yet confirmed.
- **Step 3, before the grants: read `pg_default_acl` with the query in the `0009` section, then run the probes.** A default
  privilege grants without anyone issuing it; anything that would reach one of the three tables is a stop-and-report, as in
  the older step 3. Then, read-only
  and in its own query (not appended to an older section's block, whose expectation it would break), **before step 4**:

  ```sql
  select p.probe,
         case p.kind
           when 'table' then has_table_privilege('app_designs', p.relation, p.privilege)
           else has_column_privilege('app_designs', p.relation, p.column_name, p.privilege)
         end as held
  from (values
    ('audit select',            'table',  'public.staff_audit_events',    null,                 'SELECT'),
    ('audit insert id',         'column', 'public.staff_audit_events',    'id',                 'INSERT'),
    ('audit insert detail',     'column', 'public.staff_audit_events',    'detail',             'INSERT'),
    ('audit insert occurred_at','column', 'public.staff_audit_events',    'occurred_at',        'INSERT'),
    ('audit update action',     'column', 'public.staff_audit_events',    'action',             'UPDATE'),
    ('audit delete',            'table',  'public.staff_audit_events',    null,                 'DELETE'),
    ('notes select',            'table',  'public.design_notes',          null,                 'SELECT'),
    ('notes insert body',       'column', 'public.design_notes',          'body',               'INSERT'),
    ('notes insert created_at', 'column', 'public.design_notes',          'created_at',         'INSERT'),
    ('notes update body',       'column', 'public.design_notes',          'body',               'UPDATE'),
    ('notes delete',            'table',  'public.design_notes',          null,                 'DELETE'),
    ('states select',           'table',  'public.design_request_states', null,                 'SELECT'),
    ('states insert status',    'column', 'public.design_request_states', 'status',             'INSERT'),
    ('states insert changed_at','column', 'public.design_request_states', 'changed_at',         'INSERT'),
    ('states update status',    'column', 'public.design_request_states', 'status',             'UPDATE'),
    ('states update changed_at','column', 'public.design_request_states', 'changed_at',         'UPDATE'),
    ('states update design_id', 'column', 'public.design_request_states', 'design_id',          'UPDATE'),
    ('states delete',           'table',  'public.design_request_states', null,                 'DELETE')
  ) as p(probe, kind, relation, column_name, privilege);

  -- Further pre-grant probes (security review L3-S1), expect false on all of them, before and after step 4:
  select t.relation, t.privilege, has_table_privilege('app_designs', t.relation, t.privilege) as held
  from (values
    ('public.staff_audit_events', 'TRUNCATE'), ('public.staff_audit_events', 'TRIGGER'),
    ('public.design_notes', 'TRUNCATE'), ('public.design_notes', 'TRIGGER'),
    ('public.design_request_states', 'TRUNCATE'), ('public.design_request_states', 'TRIGGER')
  ) as t(relation, privilege);

  select r.relation, has_any_column_privilege('app_designs', r.relation, 'UPDATE') as held
  from (values ('public.staff_audit_events'), ('public.design_notes')) as r(relation);
  ```

  `has_any_column_privilege(…, 'UPDATE')` is expected **false** on the audit and notes tables, before and after step 4. On
  `design_request_states` it is false before step 4 and **true** after (the column `UPDATE` grant is intended there).
  `TRUNCATE` and `TRIGGER` are false on all three tables at every point [doc-quoted from the security review, relayed; not run
  by the author of this edit].

  | Probe | Before step 4 | After step 4 |
  | --- | --- | --- |
  | `audit select`, `notes select`, `states select` | false | **true** |
  | `audit insert id`, `audit insert detail`, `notes insert body`, `states insert status` | false | **true** |
  | `states update status`, `states update changed_at` | false | **true** |
  | `audit insert occurred_at`, `notes insert created_at`, `states insert changed_at` | false | false |
  | `audit update action`, `notes update body`, `states update design_id` | false | false |
  | the three `delete` probes | false | false |

  **Any `true` before step 4, or any reading after step 4 that differs from the table, means stop and report.** Anything
  held before the grant came through `PUBLIC`, a default privilege or a role membership.
- **Step 3 (continued), the privilege test, red with nothing held.** With the tables created and nothing granted, run the
  three new arms of `packages/persistence/tests/application-role-privileges.test.ts` (their titles begin "the staff table")
  with `DATABASE_URL` set to the application role's URL for that environment, never the migration URL. Expect the first arm
  of each table **red at the table-level assertion, with received `[]`** (nothing held). "Red" alone is not enough: if a
  default ACL or a `PUBLIC` `SELECT` were present, arm 1 would fail later, on the `INSERT` column list, and still be a
  privilege held before the grant. Read where it failed and what it received. **Arm 2 is also red with nothing granted**
  (verified by catalog emulation on the test database by the L3-S1 QA run, relayed [doc-quoted]); the earlier sentence that
  only the first arm is red understated it. A table that does not exist yet makes the arm **skip**, never pass. If an arm
  is green before step 4, or arm 1 fails anywhere but at the table-level assertion with `[]`, something other than the owner's
  grant gave the role a privilege: stop and report.
- **Step 4 (the grants), preview first.** Exactly these statements, one table at a time:

  ```sql
  GRANT SELECT ON TABLE public.staff_audit_events TO app_designs;
  GRANT INSERT (id, actor_account_id, action, design_id, subject_account_id, detail)
    ON TABLE public.staff_audit_events TO app_designs;

  GRANT SELECT ON TABLE public.design_notes TO app_designs;
  GRANT INSERT (id, design_id, author_account_id, body) ON TABLE public.design_notes TO app_designs;

  GRANT SELECT ON TABLE public.design_request_states TO app_designs;
  GRANT INSERT (design_id, status, changed_by_account_id) ON TABLE public.design_request_states TO app_designs;
  GRANT UPDATE (status, changed_by_account_id, changed_at) ON TABLE public.design_request_states TO app_designs;
  ```

  No `DELETE`, no `TRUNCATE`, no `ALL`, no `WITH GRANT OPTION`, nothing to `PUBLIC`. No `INSERT` on `occurred_at`,
  `created_at` or `changed_at`; no `UPDATE` on `staff_audit_events` or `design_notes`; no `UPDATE` of `design_id`.
  Run the step 3 probes again and compare with the "After step 4" column.
- **Step 5 to 7, read-only catalog checks with the migration credential**, after step 4:

  ```sql
  -- Expect, for each table, SELECT alone at table level (the role_table_grants list), and nothing for PUBLIC.
  select table_name, privilege_type from information_schema.role_table_grants
  where grantee = 'app_designs'
    and table_name in ('staff_audit_events', 'design_notes', 'design_request_states')
  order by table_name, privilege_type;

  -- Expect INSERT: staff_audit_events 6 columns (all but occurred_at); design_notes 4 (all but created_at);
  -- design_request_states 3 (all but changed_at). Expect UPDATE: design_request_states 3 (status,
  -- changed_by_account_id, changed_at) and nothing on the other two.
  select table_name, privilege_type, column_name from information_schema.column_privileges
  where grantee = 'app_designs'
    and table_name in ('staff_audit_events', 'design_notes', 'design_request_states')
    and privilege_type in ('INSERT', 'UPDATE')
  order by table_name, privilege_type, column_name;

  -- Expect 0 rows: no grant with the right to grant it on, and no grant to PUBLIC (grantee 0). This reads the table-level
  -- access list only; the privilege test asks the server per column.
  select c.relname, a.privilege_type, a.is_grantable
  from pg_class c, lateral aclexplode(c.relacl) a
  where c.oid in ('public.staff_audit_events'::regclass, 'public.design_notes'::regclass,
                  'public.design_request_states'::regclass)
    and (a.grantee = 0 or a.is_grantable);
  ```

  `information_schema.column_privileges` also lists a column a table-level privilege covers, so a table-level `INSERT` or
  `UPDATE` would show every column and fail the expectations above [inference from the view's definition, never run].
- **Step 6 for this section: the privilege test, green with the exact grants.** Run the whole file with `DATABASE_URL` set to
  the application role's URL, read the run's own line `reached database "…" as role "…"` and quote it with the result, as
  in the older step 6. All six new arms (two per table) must be green and **not skipped**; a skip means the table is not on
  the database reached. The second arm of each table also shows, by `explain`, that the store's insert is planned under
  the grant, and that a delete, an insert naming the stamped column and an update of an ungranted column are refused with
  `42501`. For `design_request_states` the planned insert is the upsert the status route sends. The same file's arms for
  the older tables stay green.
- **Step 8, `designs` is unchanged:** no statement in this section touches it; confirm with `has_table_privilege` that it
  still holds `SELECT`, `INSERT` and `UPDATE` and not `DELETE`, as the older step 8.

**Two properties to weigh before step 4, not defects** [inference from the grants; never run].

- `UPDATE (changed_at)` on `design_request_states` (plan section 2.3) lets a leaked credential write any time into a row's
  `changed_at`. The audit row of the same change carries the true time, and the credential cannot backdate that row.
- Neither `staff_audit_events` nor `design_notes` has a size bound on its free-form column beyond `body`'s 2000
  characters: `detail` is an object with no ceiling, which `0011`'s `design_document` has and this plan has not ruled.

**Conditions on the store (security review L3-S1)** [doc-quoted, relayed from the security review; not run here]. The grants
are safe only if the store code keeps these:

- The status upsert writes the literal `changed_at = now()` in SQL and never binds it as a parameter.
- `changed_by_account_id` and the audit `actor_account_id` come from the session **in the same statement**, with an
  exactly-one-row check.
- The audit row is written in the same transaction as the change.
- A dispute is settled from the audit row, not from the status row.
- The store logs the SQLSTATE and the constraint name only: a `23514` error `DETAIL` contains the failing row, including note
  text.

**Not in the nightly export.** The export covers `designs` only. A restore of `designs` does not restore the audit log,
the notes or the request states, and nothing here adds them to a backup. Notes are the client's personal data and join the
client's own data download (ADR 0174 decision 4, wave L3-S9); the audit log holds ids and codes and no personal data.

**Rollback.** None by command: the migrations create tables and an index and nothing here drops anything. A wrong table is
fixed by a new migration, never by editing a file that has been applied.

**The test database.** The live persistence suite applies every migration to the test database through its `beforeAll`
hooks; the coordinator applies `0020`–`0022` there, and no grant is needed there for the live suite.

## Why step 5 names the application role

The file is safe on any credential (criterion 13): it refuses to run past its guard as an owner. It is also only
meaningful as the role that serves traffic. Until step 7 has been quoted for an environment, the grant half of
criterion 7 is **written and never executed** there.

## Recording the result

Quote the line from step 6 and the test's outcome in the wave's close-out. A result without the line does not say which
database it describes.
