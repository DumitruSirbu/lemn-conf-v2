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

## Why step 5 names the application role

The file is safe on any credential (criterion 13): it refuses to run past its guard as an owner. It is also only
meaningful as the role that serves traffic. Until step 7 has been quoted for an environment, the grant half of
criterion 7 is **written and never executed** there.

## Recording the result

Quote the line from step 6 and the test's outcome in the wave's close-out. A result without the line does not say which
database it describes.
