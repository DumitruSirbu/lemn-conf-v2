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
The plan: `docs/milestones/8Q2-csp-report-table.md`, *The grant, for review*. **Order of environments: preview first,
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

## Why step 5 names the application role

The file is safe on any credential (criterion 13): it refuses to run past its guard as an owner. It is also only
meaningful as the role that serves traffic. Until step 7 has been quoted for an environment, the grant half of
criterion 7 is **written and never executed** there.

## Recording the result

Quote the line from step 6 and the test's outcome in the wave's close-out. A result without the line does not say which
database it describes.
