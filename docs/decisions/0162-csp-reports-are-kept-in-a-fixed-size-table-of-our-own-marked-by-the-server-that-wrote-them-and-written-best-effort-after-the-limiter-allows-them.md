# ADR 0162 — CSP reports are kept in a fixed-size table of our own, marked by the server that wrote them, and written best-effort after the limiter allows them

Status: **Accepted — 2026-10-14, at the close of M8 wave 8Q2** (code HEAD `3cceecb4`, the review fix-up; local, not
pushed). Proposed 2026-10-13 by the architect at the wave's planning. [ADR 0161](0161-the-csp-enforces-its-violations-reach-the-applications-own-counted-endpoint-and-the-mode-stays-one-versioned-constant.md)
gained its **Amendment C** pointing here. The close's outcomes are under *Amendment A* at the end; nothing above is
erased. **The application role's grant is not proved live** (Amendment A, point 7).
Date: 2026-10-13
Type: Decision
Milestone: M8 wave 8Q2 (plan: [`milestones/8Q2-csp-report-table.md`](../milestones/8Q2-csp-report-table.md));
placement is the architect's recommendation, Q50
Amends, when accepted: ADR 0161 decision 2 (*"Nothing is stored but the limiter's counter"*), decision 3 (*"The
logged record holds only…"*, now also the stored row) and *Consequences* (the cost per accepted report). Discharges
backlog 219.

Evidence tiers: **[doc]** quoted from a record; **[src]** read at `d61bfd6d` through `git show HEAD:`; **[inf]** the
architect's inference, with what would falsify it. Nothing was run.

## Context

8Q made the policy enforce and gave violations a sink, `POST /api/csp-reports`, which counts each correctly-typed
request under the limiter, reduces an accepted report to closed values, and writes one `[csp]` line to the log
[doc: ADR 0161 decisions 2, 3; Amendment B]. Q46 asked where reports should end up. **The owner answered (c), a table
in our own database, on 2026-10-13: the host may not end up on Vercel, so the log is not a durable sink** [doc: ADR
0161, *Owner's questions*, relayed]. Backlog 219 listed what that needs: a migration and a grant (owner actions), a
retention and size bound (undecided; the limiter bounds a rate, not a total), the reduced shape kept, and a reading of
`origin`'s unauthenticated status.

## Decision-record sweep

| Record | What it says | How it is settled |
| --- | --- | --- |
| ADR 0161 d2 (2026-10-13) | *"Nothing is stored but the limiter's counter."* | **Superseded by the owner's Q46 = (c)**, built here; Amendment C at close |
| ADR 0161 d3, F2, F3 | The record's closed fields; `origin`; a chunk path only for `own` | **Kept unchanged.** The row is that record plus three server facts (decision 2); F2/F3 are repeated as table checks |
| ADR 0161 Amendment B, point 1 | Every correctly-typed `POST` is one counter write, a `429` included | Unchanged; a report row is added only to a `204` (decision 5) |
| ADR 0161 Amendment B, point 2 | `origin: "own"` is a claim | Kept as a claim in the row; the reading runbook says so (decision 7) |
| ADR 0161 *Alternatives*, *"Store reports in a table"* | Not taken in M8: *"data nobody has asked to read"* | **Overtaken by the owner asking for it** (Q46 = (c)) |
| ADR 0156 d4; ADR 0019 d5 | Writes fail closed when they cannot be judged | **Governs the limiter's judgement, which still fails closed** (`503`, nothing stored). The insert is not a judgement; it is the sink's record of a report already accepted. Decision 5 |
| ADR 0151 (+ note) | A test deletes the rows tests added; on the test database by a marker only tests write; elsewhere only what it can show it added | Met by the writer mark (decision 4) |
| ADR 0155 d10, standing rule | Each run's keys from its own secret; destructive mutants against a mocked driver only | The mark reuses the run's secret; the rule binds S2 and S4 |
| ADR 0153 d1 | Code refuses before the server what the table would refuse | Followed: `requireValidCspReportRow` |
| ADR 0096 d5; `migration-safety.ts` | Only additive, idempotent shapes run unattended; a backslash in a quoted string refuses the file | `0009` uses only recognised shapes, no sequence, no backslash |
| ADR 0008 | Least-privilege application role | No `DELETE`; table-wide `SELECT` only on non-personal data (decision 6) |
| ADR 0019 d7's retirement (as backlog 219 reads it) | No table has a retention horizon by default | This table's bound is its fixed size, not an age (decision 3) |
| Backlog 219 | *Trigger: M9, when the host is chosen* | **Overridden by the plan's placement** (Q50): nothing here depends on the host, which is the owner's own reason |

No record found that says the opposite of keeping reports in the application's database once the owner asks.

## Decisions

### 1. Reports are kept in `csp_reports`, created by migration `0009`

One row per stored report, beside a one-row `csp_report_cursor`. The migration, the statement and the grant are in the
plan for review; this record fixes their shape, not their bytes.

### 2. A row is the reduced record and three server facts, nothing else

The columns mirror `ReducedCspReport` (`line` → `line_number`, `column` → `column_number`, `status` → `status_code`),
plus `slot`, `report_number`, `received_at` and `writer_mark`. **Must not:** any column holding or derived from
`document-uri`, `referrer`, `script-sample`, `original-policy`, an address, a network block, a bucket key, a user
agent, a cookie, an id, a token, a query or a fragment. The table checks shapes that keep those out (no path, query,
fragment or user-info in `blocked`/`source`; no upper case, digit or `_` in `page`), the stable enumerations, the
ranges, and F2/F3 (`source` null and `page` `other` unless `origin` is `own`). **It does not list the page families
or the directives**: those lists grow with the code, and a list in a frozen migration would make a new route's
reports fail to store.

### 3. The bound is a fixed number of slots, overwritten oldest first

`csp_reports` holds at most `N` rows, by a check on its key (`0 ≤ slot < N`). Each write advances the cursor and
upserts into slot `number mod N`, overwriting every column. **Default `N = 10,000`** (Q51). No age-based deletion by
default (Q52).

*Why.* Two tests decide between the bounds:
- **Recovery after a flood** — once a flood has filled the table, is the next real report stored? A ring: yes.
- **No scheduler** — does the bound hold if no cron ever runs on the next host? A ring: yes.

| Option | Recovery | No scheduler | Verdict |
| --- | --- | --- | --- |
| Ring of `N` slots (chosen) | yes, newest kept | yes | **Chosen** |
| Age prune on the nightly cron alone | yes | **no**; unbounded between runs, and a named source with one bucket per /64 makes blocks nearly free [inf] | Not taken |
| A cap that refuses inserts at `N`, plus an age prune | **no**: one flood fills it and nothing new is stored until those rows age out, silencing the sink for the whole horizon | no | **Rejected** |
| Insert, then delete beyond the newest `N` in the same statement | yes | yes | Not taken: needs `DELETE` for the application role and a delete per write |
| Aggregated counts per distinct report | — | — | Not a bound: `blocked`, `source`, `line_number` and `column_number` are open-valued |
| A random slot | partly | yes | Not taken: may evict a recent report and keep an old one |

*The cost, accepted.* A flood overwrites real reports, newest first. That is acceptable because every row is
unauthenticated noise anyway (ADR 0161 Amendment B, point 2), and because a flood still shows elsewhere: in the
counters and in the once-an-hour `csp-report-limited` line (ADR 0161 F1).

*Why no sequence or identity column.* The unattended screen does not recognise `create sequence`, and its test holds
every shipped migration to the screen [src: `migration-safety.ts`, `tests/migration-safety.test.ts`]; a seeded one-row
cursor uses only recognised shapes. A repeated statement after a lost reply would advance the cursor twice and store a
report twice, so the store does not retry (decision 5).

### 4. Each row carries the mark of the server that wrote it

`writer_mark` is a keyed digest under `DIGEST_SECRET` of a new closed purpose, `csp-report-writer`, whose one field is
the literal `csp_reports`: one constant per environment, derived from nothing a report or a visitor sends. It exists
for ADR 0151: the e2e suite's server and QA's second server each run under their own random secret [src:
`playwright.config.ts`, `production-policy-server.ts`], so each run's rows carry a mark no deployment and no other run
has, and a test removes exactly those (`writer_mark = any($1)`, through a guarded helper on the test database only).
It is not a field of the report and does not widen ADR 0161 decision 3. Rotating `DIGEST_SECRET` changes the mark;
the reading runbook names that.

### 5. The write is best-effort, awaited, and only for an accepted report

Order: media type → limiter → body → reduction → the `[csp]` line → **the store, awaited under the limiter's
3,000 ms deadline** → `204`. A refusal of any kind (`415`, `413`, `400`, `429`, `503`) never reaches the store. A
store that fails, throws or misses the deadline leaves the answer at `204` and writes one closed-value line,
`csp-report-unstored`, once per process per cause. No retry.

*Why not fail closed.* ADR 0156 d4 and ADR 0161 d2 make a **judgement** the limiter cannot make fail closed, and it
still does. The insert is a record of a report already accepted and already logged; a browser never retries a report,
so a `503` would tell nobody anything and would lose nothing the `204` does not. Best-effort also means a deployment
without `0009` behaves exactly as before, so the code does not wait on the owner's migration.

*Why not `after()`.* Whether work after the answer completes depends on the host, which is the owner's reason for
(c).

*The cost.* A refused request costs what it did (backlog 210 unchanged). An accepted one costs one more statement: at
most 100 report rows an hour per network block, 2,400 a day while no network source is named [arithmetic on
`CSP_REPORTS_PER_BLOCK_FIGURE`].

### 6. The application role may select, insert and update; it may not delete

`SELECT, INSERT, UPDATE` on `csp_reports`; `SELECT, UPDATE` on `csp_report_cursor`; nothing else, nothing to
`PUBLIC`. The table-wide `SELECT` is deliberate: whether `ON CONFLICT DO UPDATE` needs `SELECT` on its arbiter was not
established [inf], and nothing in the table is personal, so a narrower column grant buys nothing. Rows leave only by
being overwritten. The migration and the grant are the owner's to apply, preview first.

### 7. Reading is a runbook of queries; `origin` is read as a claim

The owner reads with the owner credential in the database console, using `runbooks/reading-csp-reports.md`, whose
first paragraph says every field is what someone claimed. No page in the application (Q54): no login exists before
M8B. Behind a TLS terminator a real report may read `foreign` (backlog 213).

### 8. The log line stays

The `[csp]` line per accepted report is kept (Q53 (a)): the live signal on a host with a log, and the only copy when
the store fails. The e2e net stays the counter: a `CI` run fails if its server counted any report (ADR 0161 d8). The
teardown also removes the run's rows by its mark and fails if it removed more rows than hits were counted.

## Alternatives considered

- **The log alone** (8Q's (a)). Overruled by the owner: not durable on another host.
- **A hosted collector** (Q46 (b)). Not chosen by the owner.
- **Fail closed on the insert.** Rejected: decision 5.
- **`after()`.** Rejected: decision 5.
- **The bounds in decision 3's table.** Rejected or not taken there, with reasons.
- **A marker from an e2e environment flag.** Not taken: the run's secret already differs per run and per server, with
  no new variable and no test branch in production code.
- **Deleting a run's rows by time.** Rejected: two runs on one test database cannot tell their rows apart, which ADR
  0151 requires.
- **Closed lists of pages and directives in the table.** Rejected: decision 2.
- **A page that shows reports.** Not now: decision 7.

## Consequences

- ADR 0161 gains Amendment C at 8Q2's close: decision 2's *"nothing is stored but the limiter's counter"* and the
  *Consequences* cost line are struck in place and pointed here.
- A new table needs `0009` and its grant on each environment before reports are stored there; until then reports are
  logged as today.
- `DIGEST_SECRET` now also makes the mark; it was already required in every environment (ADR 0155).
- M9 inherits `0009` and its grant on production among the pre-launch checks, and, only if Q52 is (b), the prune's
  schedule.
- The table's size is bounded whatever the traffic, the host or the scheduler: at most `N` rows.
- **The table is not in the nightly backup.** ADR 0012 scopes the export to `designs` and says it must not be widened
  [doc: as `milestones/README.md` quotes it]; reports are as durable as the database and its own restore window. That
  meets the owner's reason (they outlive a host's log) and is said so the owner does not assume a backup.

## Owner's questions

Q50 (placement, default a wave in M8), Q51 (`N`, default 10,000), Q52 (an age prune, default none), Q53 (keep the
log line, default yes), Q54 (how to read, default a runbook). Stated in full in the plan. **Answered 2026-10-13: the
defaults were taken** (STATUS, *What to do next*, relayed).

## Amendment A — dated 2026-10-14, at wave 8Q2's close (code HEAD `3cceecb4`; the record is Accepted)

Outcomes of QA (`bc1c37ac`) and the three reviews (security, logic, clean-code) [coordinator-relayed; the scribe ran
nothing]. Nothing above is erased; the sentences these points correct are struck in place or answered here.

1. **The store statement runs in a driver transaction with two local timeouts (security F1).** Decision 5's
   *"awaited under the limiter's 3,000 ms deadline"* is made concrete: the statement runs in a transaction that begins
   with `set local lock_timeout = '1000ms'` and `set local statement_timeout = '2500ms'`. The values are literals
   because `SET` takes no bind parameters. Both are below the route's 3,000 ms deadline. *Why:* the cursor's row lock
   serialises writers, so a held lock would otherwise keep every accepted request waiting to the deadline.
2. **The plan's *"well under one a second"* is corrected.** The statement section of the plan said that tens of
   network blocks at 100 an hour is *"thousands an hour, well under one a second"*. The review's worst case, with a
   named network source and a routed IPv6 `/48`, is about **1,820 accepted reports a second** [coordinator-relayed;
   not recomputed here]. The bound that holds whatever the rate is the table's size, not the write rate.
3. **`csp-report-unstored` with cause `deadline` can mean the report was stored late.** The route stops waiting at its
   deadline; the statement may still commit afterwards. A `deadline` line is therefore not proof of absence.
   `docs/runbooks/reading-csp-reports.md` says so.
4. **Three failures share one line.** A constructor throw, `42P01` (no table) and `42501` (no privilege) all log
   `store-failed`. **Diagnose with the privilege test** (`application-role-privileges.test.ts` as the application
   role), not with the line.
5. **A measured limit on *"code never admits what the table refuses"*.** Consequences of decision 2's table checks
   and ADR 0153 d1 were measured by a live pattern differential over all Unicode scalars (read-only selects on
   PostgreSQL 18.6, the test database; 96 of 96 cases in the case table, plus the sweep) [QA, relayed]. That is the
   **test database's character classification only**; another server or collation is unmeasured.
6. **Criterion 17 deviates.** The plan's criterion 17 is met as: `afterAll` **counts** the run's rows by writer mark
   and the **teardown removes** them. Decision 8's *"fails if it removed more rows than hits were counted"* is built
   as that count against the counter, not as a deletion inside `afterAll`. Teardown line quoted by the coordinator:
   the suite's server stored 0 rows; 9 second servers stored 131 and 131 were removed; `csp_reports` was back to 0 on
   the test database.
7. **The application-role proof is unverified.** `0009` is applied and frozen on the **test database only** (ledger
   9). Nobody has applied it on preview or production, read `pg_default_acl`, issued the two `GRANT`s, or run the
   privilege test as the application role. Criterion 7's live half therefore stands unproved; the owner steps are in
   STATUS and the plan.
8. **Forward condition.** Any future page over these rows must render `blocked` and `source` as **escaped text,
   never in an `href` or `src`**. Every field is what someone claimed (decision 7).
9. **`requireValidCspReportPlacement` stays internal.** Kept as an internal function; it and its three QA-owned cases
   could be deleted outright (backlog 231).
