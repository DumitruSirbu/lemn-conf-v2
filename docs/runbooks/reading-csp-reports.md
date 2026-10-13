# Reading CSP reports

**Every field of a report is what a browser, or anyone, claimed.** Anyone can send a report to this site's endpoint and
choose every value in it, including the page it says it came from. `origin = 'own'` means the report says it came from
this site, not that it did ([ADR 0161](../decisions/0161-the-csp-enforces-its-violations-reach-the-applications-own-counted-endpoint-and-the-mode-stays-one-versioned-constant.md),
Amendment B point 2). Read these rows as claims to weigh, never as a measurement and never as proof of an attack or of a
visitor. Nothing here filters by `origin`, on purpose.

Read with the owner credential, in the database console. Never paste a connection string anywhere: not into a command,
a message, a ticket or a file. The queries below only read; none of them changes a row, and the application role is
given no `DELETE` ([ADR 0162](../decisions/0162-csp-reports-are-kept-in-a-fixed-size-table-of-our-own-marked-by-the-server-that-wrote-them-and-written-best-effort-after-the-limiter-allows-them.md);
the owner's steps are in [the table-migration runbook](applying-a-table-migration-and-its-application-role-grant.md),
*For `0009`*).

## What the table is

`csp_reports` holds the **latest 10,000** reports at most: a ring. The report with number `n` sits in slot
`n mod 10000`, and the 10,001st overwrites the oldest. It is not in the nightly backup. A row holds the reduced record
only: directive, blocked and source (a host or a fixed keyword; for `source` also this site's own `/_next/static/….js`
script path; never a query, a fragment or user-info), line, column, page
family, locale, `origin`, `disposition`, status, and three facts of the server's own: the report number, the time it was
received, and the writer mark. The log line (`[csp] {"event":"csp-violation",…}`) is written for every accepted report
whether or not the row was stored, and is the only copy when a store failed (`csp-report-unstored`).

Two things to keep in mind while reading:

- **Behind a TLS terminator a real report may read `origin = 'foreign'`** (backlog 213; check on the real host). A
  `foreign` count is therefore not by itself a count of forgeries.
- A refused request (wrong media type, too large, malformed, limited) writes no row, so the table undercounts what the
  endpoint received.

## 1. The latest fifty, newest first

```sql
select report_number, received_at, directive, blocked, source, line_number, column_number,
       page, locale, origin, disposition, status_code
from csp_reports order by report_number desc limit 50;
```

## 2. What has been happening, by day, over thirty days

```sql
select date_trunc('day', received_at) as day, directive, blocked, page, origin, disposition, count(*) as reports
from csp_reports where received_at > now() - interval '30 days'
group by 1, 2, 3, 4, 5, 6 order by 1 desc, 7 desc;
```

## 3. Has the table wrapped? Reports ever stored against rows held

```sql
select (select last_number from csp_report_cursor) as reports_ever_stored, count(*) as rows_held from csp_reports;
```

While `reports_ever_stored` is at most 10,000 the table has not wrapped and every stored report is still there.
Above that, the oldest `reports_ever_stored - 10000` reports have been overwritten and `rows_held` reads 10,000.
(A report whose store failed is not counted, so the cursor counts stored reports, not received ones; a refused or
failed statement rolls back with its cursor step [inf: one statement].)

## 4. Who wrote the rows

```sql
select writer_mark, count(*) as reports, min(received_at) as first, max(received_at) as last
from csp_reports group by 1;
```

One mark per environment is normal. The mark is derived from `DIGEST_SECRET`, so a **second mark** means the secret was
rotated (the older rows kept the old mark) or the rows are a test run's: an end-to-end run writes under a mark of its
own and removes its rows when it finishes. A mark is not a visitor and says nothing about who sent a report.
