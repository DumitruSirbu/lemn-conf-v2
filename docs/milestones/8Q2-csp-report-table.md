# M8 wave 8Q2 — CSP violation reports are kept in a table in our own database

> **STATUS: PLANNED by the architect, 2026-10-13. Not dispatched.** No code, no migration and no grant exist for this
> wave. The decision record is [ADR 0162](../decisions/0162-csp-reports-are-kept-in-a-fixed-size-table-of-our-own-marked-by-the-server-that-wrote-them-and-written-best-effort-after-the-limiter-allows-them.md),
> **Proposed**. Owner questions Q50 to Q54 below each have a default; **none blocks S1**, and Q50 (where the wave sits)
> is answered by the recommendation unless the owner says otherwise.
>
> **For the scribe, not done here:** the M8 plan's wave table and *Waves* need a one-line pointer to this file
> (8Q2, between 8Q and 8T); `docs/STATUS.md`'s *What to do next* names 8Q2 before 8T; backlog 219 is marked
> *scheduled, M8 wave 8Q2* with a link here; `decisions/README.md` lists ADR 0162 as Proposed. The architect
> touched none of those files (the dispatch limited writes to this plan and the ADR draft).

Evidence tiers: **[doc]** quoted from a record in this repository; **[src]** read at `HEAD` (`d61bfd6d`) through
`git show HEAD:<path>`, never from the working copy (a test auditor was editing the tree while this was written);
**[inf]** the architect's inference, with what would falsify it. Nothing was run: no gate, no server, no database.

## Goal

The owner ruled Q46 = (c) on 2026-10-13: *a table in our own database*, because *the host may not end up on Vercel,
so the log is not a durable sink* [doc: ADR 0161, *Owner's questions*; M8 plan, Q46]. 8Q built (a): every accepted
report becomes one `[csp]` line in the server's log and nothing else is stored [doc: ADR 0161 decision 2]. This wave
makes the reduced record durable in a table, **with a size bound that holds on any host and with no scheduler**,
without widening what a report may keep (ADR 0161 decision 3 and F2/F3), without adding a write to a refused
request, and without breaking the whole-run e2e net (ADR 0161 decision 8) or ADR 0151's rule on test rows.

## Where this sits: a wave in M8, before 8T — recommended

**Recommendation: a new wave 8Q2 inside M8, between 8Q (done) and 8T (the phase gate).** Not its own milestone and
not M9. Backlog 219's *"Trigger: M9, when the host is chosen"* was the scribe's framing at 8Q's close, not the
owner's; this plan overrides it, for these reasons:

1. **Nothing here waits on the host.** The owner's reason for (c) is precisely that the sink must not depend on the
   host. The table, its bound and its write need no scheduler, no host header and no platform log (decision 3 of
   ADR 0162). M9 is a stub with no plan [doc: `M9-delivery-preparation.md`, *STATUS: PROPOSED*]; parking a
   host-independent change there delays it for no reason. M9 does inherit two lines (below), which is the right
   split.
2. **It amends a record M8 just accepted.** ADR 0161 is M8's, Accepted at 8Q's close, and owes *"a dated amendment
   when it is built"* [doc: ADR 0161, *Owner's questions*]. Keeping the CSP story in one milestone keeps one pull
   request reviewable as one unit.
3. **8T and M8's close audit then cover it for free.** 8T's whole `CI=1` e2e run, its phone gate and the first
   incremental test audit (ADR 0152 Amendment A) all run after 8Q2. A separate milestone would need its own branch
   off an unmerged M8 branch and its own test audit for three slices.
4. **Precedent.** 8D2, 8D3 and 8K2 were each added to M8 after its restatement for the same kind of reason [doc:
   M8 plan banner; `milestones/README.md`, M8 row].
5. **It claims migration `0009` before M8B starts**, whose profiles will need migrations of their own [inf: M8B is
   *PLANNED* with no waves; falsified if M8B's plan already numbers a migration].

*Against, stated plainly:* M8 grows by one wave (to nineteen), and M8's owner-action list grows by one migration and
one grant. Neither blocks merging: the sink behaves exactly as today on a database without `0009` (criterion 14), and
nothing is deployed until every milestone is done (`WORKFLOW.md`, *Nothing ships mid-milestone*).

*What M9 inherits from this wave (for the scribe, into M9's stub):* `0009` and its grant applied on production, in
8S's pre-launch checks (*"migrations and grants applied"*); and, only if Q52 is answered (b), the age prune's
schedule on whatever host M9 picks.

*Collisions checked:* 8T touches the phone gate, desktop and the phase gate [doc: M8 plan, *8T*]; nothing in 8Q2
changes a page. 8T's TLS-host check reads a real report's `origin` (backlog 213); with the log line kept (Q53 (a)),
8T can read it from the log and is not blocked by the owner's migration on preview. M9's firewall rule for the report
route (backlog 210) and the bot shield are untouched.

## Scope

**In:** migration `0009` (two tables and one seed row); a persistence port, its Neon store and its fake; two
guarded test-only helpers; the report route's write; a server-derived writer mark; the e2e teardown's count and
removal of the run's rows; one runbook section for the migration and grant; one runbook for reading reports.

**Out:** any change to the reduction's field list (ADR 0161 decision 3, F2, F3); the limiter's figure, window or
order (Q47 stands); `proxy.ts` (backlog 207, 209); an `Origin` pre-check (backlog 210); `report-to`; a page that
shows reports; a new cron, environment variable or dependency; migrations `0001` to `0008`.

## What the code has today [src]

| Where | What |
| --- | --- |
| `apps/web/src/app/api/csp-reports/route.ts` | Order: media type (`415`) → `refusalOfCspReportLimit` (one counter write; `429`/`503`) → body to 8 KiB (`413`/`400`) → `reduceCspReport(body, new URL(request.url).origin)` (`400` for not-a-report) → `reportCspViolation(record)` → `204`, empty, `limitedAnswerHeaders()`. Reads no cookie, sets none |
| `apps/web/src/lib/server/csp/csp-report.ts` | `ReducedCspReport`: `directive`, `blocked`, `source?`, `line?`, `column?`, `page`, `locale`, `origin`, `disposition`, `status?`. Closed lists: 18 directives, 8 page families, `ro`/`ru`, `enforce`/`report`, `own`/`foreign`/`none`; `other`/`none` fallbacks; origins ≤ 255 characters; positions ≤ 10,000,000; status 100–599; chunk paths match `^/_next/static(?:/[A-Za-z0-9._~-]+)+\.js$`, ≤ 255 |
| `apps/web/src/lib/server/csp/csp-report-log.ts` | Three closed-value lines: `csp-violation` per accepted report; `csp-report-unavailable` once per process per cause; `csp-report-limited` once per process per UTC hour. Writes never throw |
| `apps/web/src/lib/server/digest/keyed-digest.ts` | HMAC-SHA-256 under `DIGEST_SECRET`'s 32 bytes; purposes are a closed map (`rate-limit-bucket`, `contact-payload`) |
| `apps/web/src/lib/server/rate-limit/limit-policy.ts:92-93,180` | `CSP_REPORT_WINDOW_MINUTES = 60`, `CSP_REPORTS_PER_BLOCK_FIGURE = 100`, policy `csp-report-by-block` |
| `apps/web/src/lib/server/rate-limit/enforce-rate-limit.ts:30` | `RATE_LIMIT_DEADLINE_MS = 3000` |
| `apps/web/tests/e2e/global-teardown.ts` | Removes the run's `csp-report` counter rows (`removeCountersOf(secret, CSP_REPORT_POLICY.name)`), prints the hits, and under `CI` throws `CspReportsInTheRunError` if any; collects failures and throws after every removal |
| `apps/web/playwright.config.ts:102-115` | The suite's server gets `DATABASE_URL` = the test database and `DIGEST_SECRET` = the run's secret |
| `apps/web/tests/e2e/support/production-policy-server.ts:80-122` | The second server (QA's port 4323) gets its own `makeRunSecret()` as `DIGEST_SECRET`, exposed as `server.secret` |
| `packages/persistence/src/migrations/0007…`, `0008…` | Header form, frozen-bytes warning, grant left to the owner, checks by regex without backslashes |
| `packages/persistence/src/migration-safety.ts` | The unattended screen: allowed shapes are `create table if not exists`, `add column if not exists`, `create index if not exists`, a guarded `DO`, `comment on`, `insert … values … [on conflict … do nothing]`. **Refused:** any `update` or `delete` word in a statement, `drop`, `truncate`, **a backslash inside a quoted string** (an unmodelled construct refuses the whole file), and anything unrecognised, e.g. `create sequence` |
| `packages/persistence/tests/migration-safety.test.ts` | *"clears the … migrations this repository actually ships"*: every file under `migrations/` must clear the screen |
| `.github/workflows/deploy.yml:~97-120` | `migrate:unattended-check`, then `migrate <environment>`, then the schema read-back, where that workflow runs |
| Persistence live suites (e.g. `tests/neon-rate-limit-store.test.ts:53`) | `runMigrations(testDatabaseUrl)` in `beforeAll`: **the test database gets a new migration on the first live persistence run.** The e2e suite applies none |

## Rulings (8Q2.1 to 8Q2.9)

**8Q2.1 — One table, a fixed number of slots, overwritten oldest first (a ring).** `csp_reports` has `N` rows at
most, enforced by the database: its key `slot` is checked `0 ≤ slot < N`. A one-row table `csp_report_cursor` holds
the last report number. One statement advances the cursor and upserts the report into slot `number mod N`. **Default
`N = 10,000` (Q51).** No sequence (the screen refuses `create sequence`; `0008` avoided one too), no identity column,
no scheduler, no `DELETE` for the application role. *Why a ring and not the alternatives* is ADR 0162 decision 3; the
two tests that decide it are **recovery after a flood** (is the next real report stored once the table is full?) and
**no scheduler** (does the bound hold if no cron ever runs?). A ring passes both; a cap that refuses inserts at `N`
fails the first (one flood would silence the sink for the whole retention period); an age prune fails the second.

**8Q2.2 — The row is the reduced record, a receipt time, a report number and a writer mark; nothing else.** Columns
mirror `ReducedCspReport` key for key (`line` → `line_number`, `column` → `column_number`, `status` →
`status_code`; `column` is reserved in Postgres). No column holds or is derived from `document-uri`, `referrer`,
`script-sample`, `original-policy`, an address, a network block, a bucket key, a user agent, a cookie, an id, a
token, a query or a fragment.

**8Q2.3 — The table checks shapes that keep a secret out, not membership in lists that grow.** Lengths, integer
ranges, the two stable enumerations (`origin`, `disposition`), `locale`'s shape, and regexes that refuse a path, a
query, a fragment or user-info in `blocked`/`source`, and any character an id or a token is made of in `page` (upper
case, digits, `_`). **No CHECK lists the page families or the directives**: those lists are code's, a list in a frozen
file needs a migration to grow, and under best-effort writing (8Q2.5) a refused insert is a silent loss [doc: the same
reasoning for `0008`'s closed lists, M8 plan 8I]. F2 and F3 are repeated as two table checks: `source` is null
unless `origin = 'own'`; `page` is `other` unless `origin = 'own'`. **No regex contains a backslash** (the screen).

**8Q2.4 — The writer mark is server-derived.** `writer_mark` = `keyedDigest` under `DIGEST_SECRET` of a new closed
purpose `csp-report-writer` whose one field is the literal `csp_reports`. It is one constant per environment, carries
nothing of a report or a visitor, and exists so that **a test can show which rows it added** (ADR 0151): the suite's
server and QA's second server each run under their own random secret, so each run's rows carry a mark no deployment
and no other run has. It is checked as 64 lowercase hex characters, `0007`'s shape. Decision 3 of ADR 0161 is not
widened: the mark is not a field of the report.

**8Q2.5 — The write is best-effort, awaited, after the line, and only for a `204`.** Order: media type → limiter →
body → reduction → `reportCspViolation` (unchanged) → the store, awaited under the limiter's deadline (3,000 ms) →
`204`. If the store rejects, throws, or misses the deadline, the answer is **still `204`**, and one closed-value line
`[csp] {"event":"csp-report-unstored","cause":…}` is written once per process per cause. No retry (a repeat after a
lost reply would advance the cursor twice and store the report twice). **Not `after()`**: its behaviour depends on
the host, which is the owner's worry. *Why not fail closed:* ADR 0156 decision 4 and ADR 0161 decision 2 make a
**judgement** the limiter cannot make fail closed; the limiter still does (`503`, nothing stored). This insert is the
sink's own record of a report already accepted and already logged; a browser never retries a report, so a `503`
would inform nobody and lose nothing the `204` does not. The table in the ADR's sweep records this.

**8Q2.6 — The cost, said plainly.** A refused request (`415`, `413`, `400`, `429`, `503`) writes no report row: the
store is reached only after a `report` reduction. **Backlog 210 (the security reviewer's F6: one counter write per
refused request) is unchanged.** An accepted report costs one more statement (the cursor update and the upsert, one
round trip) beside its counter write, so at most 100 report rows an hour per network block, and 2,400 a day while no
network source is named [arithmetic on `CSP_REPORTS_PER_BLOCK_FIGURE`]. *Label check:* the dispatch called this
"security review F2"; the recorded security finding about writes per request is **F6** (backlog 210, ADR 0161
Amendment B point 1). ADR 0161's own **F2** is the `origin` field, handled in 8Q2.7.

**8Q2.7 — `origin` is stored as the claim it is.** Every field of a row is unauthenticated (ADR 0161 Amendment B,
point 2): a forger chooses `document-uri`. The row keeps `origin` unchanged; no gate is added; the reading runbook
says so above its first query and filters nothing by default. Behind a TLS terminator a real report may read
`foreign` (backlog 213); the runbook names that too.

**8Q2.8 — The log line stays (Q53 default (a)).** The table supplements the log. On a host with a log the line is the
live signal, and on a store failure it is the only copy. QA's sink spec asserts exactly one `[csp]` line per `204`
and `CspReportsInTheRunError` sends a reader to those lines [src]; both stay true.

**8Q2.9 — Reading is a runbook, not a page (Q54 default (a)).** The owner reads with the owner credential in the
database console, read-only queries from `docs/runbooks/reading-csp-reports.md`. No internal page: no authentication
exists before M8B, and a page would be a new surface under the policy it reports on.

## The migration, for review — `0009_create_csp_reports.sql` (the developer writes the header in `0008`'s form)

`N` is shown as `10000`; a different Q51 answer changes the one literal and the code's constant together.

```sql
create table if not exists csp_report_cursor (
  singleton boolean primary key default true
    constraint csp_report_cursor_is_one_row check (singleton),
  last_number bigint not null
    constraint csp_report_cursor_last_number_is_not_negative check (last_number >= 0)
);
insert into csp_report_cursor (singleton, last_number) values (true, 0) on conflict do nothing;
create table if not exists csp_reports (
  slot integer primary key
    constraint csp_reports_slot_is_within_capacity check (slot >= 0 and slot < 10000),
  report_number bigint not null
    constraint csp_reports_report_number_is_positive check (report_number > 0),
  received_at timestamptz not null,
  writer_mark text not null
    constraint csp_reports_writer_mark_is_sha256 check (writer_mark ~ '^[0-9a-f]{64}$'),
  directive text not null
    constraint csp_reports_directive_shape check (directive ~ '^[a-z-]{1,32}$'),
  blocked text not null
    constraint csp_reports_blocked_shape check (
      char_length(blocked) <= 255
      and blocked ~ '^(self|inline|eval|wasm-eval|other|data|blob|chrome-extension|moz-extension|safari-web-extension|https?://[^/?#@[:space:][:cntrl:][.backslash.]]+)$'
    ),
  source text
    constraint csp_reports_source_shape check (
      char_length(source) <= 255
      and source ~ '^(self|inline|eval|wasm-eval|other|data|blob|chrome-extension|moz-extension|safari-web-extension|https?://[^/?#@[:space:][:cntrl:][.backslash.]]+|/_next/static(/[A-Za-z0-9._~-]+)+[.]js)$'
    ),
  line_number integer
    constraint csp_reports_line_number_range check (line_number between 0 and 10000000),
  column_number integer
    constraint csp_reports_column_number_range check (column_number between 0 and 10000000),
  page text not null
    constraint csp_reports_page_shape check (
      char_length(page) <= 64 and page ~ '^(other|/[[]locale[]](/[]a-z[-]{1,20})*)$'
    ),
  locale text not null
    constraint csp_reports_locale_shape check (locale ~ '^([a-z]{2}|none)$'),
  origin text not null
    constraint csp_reports_origin_is_known check (origin in ('own', 'foreign', 'none')),
  disposition text not null
    constraint csp_reports_disposition_is_known check (disposition in ('enforce', 'report', 'other')),
  status_code integer
    constraint csp_reports_status_code_range check (status_code between 100 and 599),
  constraint csp_reports_slot_follows_report_number check (slot = report_number % 10000),
  constraint csp_reports_source_only_for_own check (source is null or origin = 'own'),
  constraint csp_reports_page_only_for_own check (page = 'other' or origin = 'own')
);
```

Notes for the reviewer [inf unless marked]:
- `page`'s bracket expression `[]a-z[-]` is a literal `]`, `a`–`z`, a literal `[` and a literal `-` (Postgres ARE). It
  admits every value of `CSP_PAGE_FAMILIES` and refuses an id or a token with an upper-case letter, a digit or an `_`.
- Checkpoint-A findings applied to this text (not ADR 0161's F2 and F3 of 8Q2.3): **F4** bounds each page segment
  `{1,20}`; **F3** makes the host class `[^/?#@[:space:][:cntrl:][.backslash.]]`, which refuses white space, control
  characters and a backslash without writing one; **F5** adds `slot = report_number % 10000`, so a row sits only where
  the ring puts it.
- *What the bound does to the two generators* [source-verified: `generate-design-id.ts` is `nanoid()`, whose default
  is 21 characters of the 64-character URL alphabet `A-Za-z0-9_-`, read in `nanoid@6.0.1`; `share-token.ts` draws
  12 characters of `[0-9A-Za-z]`]: a design id is 21 characters, so as one segment it is now always refused (before
  F4 it passed with odds of (27/64)^21, about 1.3e-8). A share token is 12 characters, within the bound, and passes
  only if it is all lower-case letters, odds (26/62)^12, about 3e-5, or one in 34,000. Neither reaches a row as text
  in any case: the reduction writes `[id]` and `[token]`. The check is a second line, not the first.
- Every regex is backslash-free; `.` is written `[.]`.
- The cursor's seed is the screen's `insert … values … on conflict do nothing` shape; criterion 1 holds it there.
- No index beyond the two primary keys: the reading queries scan at most `N` rows.
- Size: at most `N` rows of at most about 0.7 KB each with both origins at 255 characters, so under about 7 MB at
  `N = 10,000` [inf: arithmetic on the column bounds; S1 measures `pg_total_relation_size` after filling a scratch
  copy, or the figure is quoted as an estimate].

## The store's one statement, for review

```sql
with advanced as (
  update csp_report_cursor set last_number = last_number + 1 where singleton returning last_number
)
insert into csp_reports (
  slot, report_number, received_at, writer_mark, directive, blocked, source,
  line_number, column_number, page, locale, origin, disposition, status_code
)
select (last_number % 10000)::integer, last_number, now(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
from advanced
on conflict (slot) do update set
  report_number = excluded.report_number, received_at = excluded.received_at, writer_mark = excluded.writer_mark,
  directive = excluded.directive, blocked = excluded.blocked, source = excluded.source,
  line_number = excluded.line_number, column_number = excluded.column_number, page = excluded.page,
  locale = excluded.locale, origin = excluded.origin, disposition = excluded.disposition,
  status_code = excluded.status_code
```

The cursor's row lock serialises concurrent writers for one statement each. *Worst case considered:* tens of network
blocks each at 100 an hour is thousands an hour, well under one a second [inf]. Every column is overwritten, so an
overwritten slot keeps nothing of its previous report (criterion 5).

## The grant, for review — an owner action

Derived from the statement above. Postgres requires `SELECT` on columns an `UPDATE … SET x = x + 1` reads and on
what `RETURNING` returns, and `UPDATE` for `ON CONFLICT DO UPDATE` [inf: recalled from the Postgres `INSERT` and
`UPDATE` reference pages, not read for this plan; the privilege test is the proof]. Whether `ON CONFLICT` also wants
`SELECT` on the arbiter column was not established, so **a table-wide `SELECT` on `csp_reports` is granted on
purpose**: nothing in it is personal, and it removes the uncertainty without a second owner round.

```sql
GRANT SELECT, INSERT, UPDATE ON TABLE public.csp_reports TO app_designs;
GRANT SELECT, UPDATE ON TABLE public.csp_report_cursor TO app_designs;
```

Not `DELETE` on either, not `ALL`, not `WITH GRANT OPTION`, nothing to `PUBLIC`, nothing on `ALL TABLES IN SCHEMA`.
Rows leave only by being overwritten.

## Slices

**Tier for the wave: Full + security** (persistence, a public endpoint, a destructive test helper). One writing
agent at a time in the shared tree (R2). Every dispatch carries, verbatim: *the discarding git commands are banned by
name* (`agent-coordination.md`); *deleting database rows and printing environment values are banned, except the
deletes this plan names in S2 and S4 through the guarded helper*; and ADR 0155's standing rule: ***A mutant of a
statement that deletes, updates, truncates or alters is run against a mocked driver and never against a database. A
live proof that a statement touches only what it is handed plants rows of its own beside the ones it hands over and
asserts they remain. A destructive statement whose `where` no longer names what it was handed is not sent
anywhere.***

| Slice | Work | Production files | Reading |
| --- | --- | --- | --- |
| **S1a** | (1) `0009` exactly as *The migration, for review*, with a header in `0008`'s form (what, why, frozen bytes, apply before the code, grant is the owner's, check the ledger reads 1–8 before and 1–9 after). (2) `migrate:unattended-check` and the existing screen test, **run without a database**. (3) Measure the id and token alphabets against `page`'s check (8Q2.3 note). (4) **Evaluate every CHECK before anything can freeze it:** each regex and range of `0009` against every accept and refuse case of criterion 3, as plain read-only `select '<value>' ~ '<pattern>'` statements on the test database (no DDL, no row written), output quoted; a bracket expression Postgres reads differently from this plan shows up here and not after the freeze. **STOP: checkpoint A before any live persistence run** (that run applies `0009` to the test database and freezes its bytes there) | new `migrations/0009_create_csp_reports.sql` | this plan, 8Q2.1–8Q2.3, *The migration*; ADR 0162 decisions 1–3; `0007_…sql`, `0008_…sql` (headers, frozen bytes); `migration-safety.ts` whole; `tests/migration-safety.test.ts`; `tests/migration-0008-text.test.ts` (the text-pin pattern); `generate-design-id.ts`; the share token's generator (`share-link-repository.ts`); ADR 0096 d5; ADR 0020 |
| **Checkpoint A** | **The security reader and the architect read `0009`'s text and the grant** before anything applies it anywhere. A change after this point is a new migration | — | the security *Reading* line |
| **S1b** | (1) `csp-report-store.ts`: the port (`recordReport(row): Promise<void>`), the row type, `CSP_REPORT_CAPACITY = 10_000`, `CspReportStoreError` (closed operation names, no driver text), and `requireValidCspReportRow` holding every check of `0009` in code (ADR 0153's *code refuses before the server what the table would refuse*). **It must not reuse the SQL pattern strings as JS `RegExp`s** (JS reads `[]` as an empty class and `[.backslash.]` as a class of characters); it carries explicit JS equivalents, tested against the criterion-3 case table including the checkpoint-A cases F3 (a host with a space, a tab, a control character, a backslash), F4 (a segment of 21 characters) and F5 (a slot that is not `report_number mod N`). (2) `neon-csp-report-store.ts`: the one statement; no retry. (3) `fake-csp-report-store.ts`: the same ring with `N` a constructor argument. (4) Exports. (5) Tests: a text pin of `0009` (columns, constraint names, the capacity literal equal to `CSP_REPORT_CAPACITY`); the contract suite run by both stores; the live suite (criteria 3–7) | new `csp-report-store.ts`, `neon-csp-report-store.ts`, `fake-csp-report-store.ts`; `index.ts` | this plan, 8Q2.1–8Q2.5, *The store's one statement*, *The grant*; ADR 0162; `rate-limit-store.ts`, `neon-rate-limit-store.ts`, `fake-rate-limit-store.ts`, `contact-submission-store.ts` (the check-in-code pattern), `sha256-digest.ts`, `open-application-database.ts`, `migration-errors.ts` (`reducedCauseOf`); `tests/support/rate-limit-store-contract.ts`, `tests/neon-rate-limit-store.test.ts` (live pattern, schema lock), `tests/support/live-test-database.ts`; **the three censuses, which go red by design for a new connection site or a new live file and are updated deliberately in this slice, the change reported:** `tests/connection-opening-census.test.ts`, `tests/live-suite-census.test.ts`, `tests/connection-url-sites.test.ts`; ADR 0149, 0153 d1, 0155 *Incident* and standing rule |
| **S2** | The guarded test-only helpers: `deleteCspReportsForTests(marks)` (`where writer_mark = any($1) returning slot`, the count answered) and `countCspReportsForTests(marks)`; each refuses a non-digest mark before connecting, returns before any statement for an empty list, opens only `openTestDatabase()`, and runs `requireTestRunner`. Unit tests pin each statement's whole text with the driver mocked; the live test plants a row under a foreign mark and asserts it remains. Privilege test: the two tables (criterion 7) | new `delete-csp-reports-for-tests.ts`, `count-csp-reports-for-tests.ts`; `index.ts` | this plan, criteria 7, 15, 16; `delete-rate-limit-counters-for-tests.ts`, `count-contact-submissions-for-tests.ts`, `delete-contact-submissions-for-tests.ts` and their `.test.ts`/`.live.test.ts`; `require-test-runner.ts`, `test-database-url.ts`; `tests/application-role-privileges.test.ts` (the skip-when-absent pattern, lines ~291–375); the same three censuses as S1b (two new `openTestDatabase()` sites, new live files), updated deliberately and reported; ADR 0006, 0151 (whole, with its note), 0155 standing rule |
| **S3** | The write. (1) `keyed-digest.ts`: purpose `csp-report-writer` with one field. (2) New `csp-report-writer-mark.ts` (server-only): the mark from the secret's reader, or *unavailable*. (3) New `csp-report-store-instance.ts`, made on first use, as the other two instances. (4) `csp-report-log.ts`: `reportCspReportUnstored(cause)`, once per process per cause, closed causes `store-failed`, `deadline`, `row-refused`, `mark-unavailable`. (5) `route.ts`: after `reportCspViolation`, await the store under `RATE_LIMIT_DEADLINE_MS`; any failure → the unstored line, still `204`. Route tests use the persistence fake as the store (*what a test fakes is the database*, ADR 0155 d10) | `app/api/csp-reports/route.ts`, `lib/server/csp/csp-report-log.ts`, `lib/server/digest/keyed-digest.ts`; new `lib/server/csp/csp-report-writer-mark.ts`, `lib/server/csp/csp-report-store-instance.ts` | this plan, 8Q2.4–8Q2.8, criteria 8–14; ADR 0161 whole with F1–F4 and Amendment B; ADR 0162; ADR 0156 d4; ADR 0155 d1, d2, d10; the five files named; `judge-csp-report.ts`, `csp-report.ts` (read only; the reduction does not change); `rate-limit-store-instance.ts`, `contact/contact-submission-store-instance.ts`; `digest/digest-secret.ts`; `tests/app/api/csp-reports/route.test.ts`, `tests/lib/server/csp/csp-report.test.ts`, `csp-sink-source.test.ts` (a source scan of the sink: the route now imports a store and a module that reads the secret, so it may need an update, made deliberately and reported, never loosened to pass) |
| **S4** | The e2e net. `support/e2e-rate-limit-run.ts` (or a new `support/csp-report-rows.ts`): the run's mark from its secret; `global-teardown.ts`: count, then remove the run's rows by mark through S2's helper, print the figure beside the csp-report hits, and fail (aggregated with the others, after every removal) if rows removed exceed hits counted. The `CI` zero-hits assertion is unchanged | none (tests only) | this plan, criteria 15–17; `global-teardown.ts`, `support/e2e-rate-limit-run.ts`, `support/production-policy-server.ts` (read), `playwright.config.ts:88-125` (read); ADR 0155 d10; ADR 0151; ADR 0161 d8 |
| **S5** | Documents. (1) `runbooks/applying-a-table-migration-and-its-application-role-grant.md`: a section *For `0009`* in the `0008` section's form: ledger 9; 2 tables, 14 + 2 columns, the named constraints, the seed row present (`select last_number from csp_report_cursor` reads a number); `pg_default_acl` read first; exactly the two `GRANT` statements; the privilege test's `reached database … as role …` line quoted. (2) New `runbooks/reading-csp-reports.md`: the queries of *The read path*, the unauthenticated warning first, the owner credential, never a pasted URL | none (docs) | this plan, *The grant*, *The read path*; the runbook named, whole; `environments-and-resources.md`; ADR 0161 Amendment B point 2; backlog 213 |

Per `WORKFLOW.md`, *Scope discipline*: S1b and S3 are five production files each; S2 is three. Paired tests do not
count. `index.ts` appears in S1b and S2 as one export line each.

## Acceptance criteria

*Migration and table.*

1. **`0009` clears the unattended screen**: `migrate:unattended-check` exits 0 and `migration-safety.test.ts`'s
   *clears the migrations this repository actually ships* passes with `0009` on disk. `0001` to `0008` are
   byte-identical to `HEAD` (`git diff --stat` on `migrations/` lists `0009` alone).
2. **The column set is closed.** A text test of `0009` pins exactly the 14 columns of `csp_reports` and 2 of
   `csp_report_cursor`, and the constraint names. **Must not:** a column named for, or a default derived from, any
   item of 8Q2.2's list; a `references`, an index other than the two primary keys, a trigger, a function.
3. **The database refuses what the code refuses, and each side is shown alone.** Live, on the test database, with
   `requireValidCspReportRow` bypassed by a raw insert, the table refuses each of: `blocked`/`source` of
   `https://a.example/x`, `https://a.example?q=1`, `https://a.example#f`, `https://u@a.example`, a 256-character
   origin; `source` `/_next/static/x.js?v=1`; `page` `/[locale]/d/Ab3_x`, `/[locale]/d/abc1`, a 65-character page;
   `locale` `RO`; `origin` `mine`; `disposition` `block`; `line_number` 10,000,001 and −1; `status_code` 99 and 600;
   `writer_mark` of 63 characters and of upper-case hex; `slot` −1 and `N`; a `source` with `origin` `foreign`; a
   `page` other than `other` with `origin` `none`. It accepts each value just inside (`https://a.example`,
   `/[locale]/d/[id]/review`, 10,000,000, 100, 599, slot `N − 1`). The same table of cases, run through
   `requireValidCspReportRow` without a database, gives the same verdict for every case. **Sabotage both ways (R6):**
   deleting one CHECK from a scratch copy of the statement turns the raw-insert case red; changing the code check
   alone turns only the code case red.

*The ring.*

4. **Bounded, newest kept** — a fast-check property on the fake with `N` drawn from 1 to 16 and up to `3N` inserts in
   any order of arbitrary valid rows: the row count never exceeds `N`; after `k ≥ N` successful inserts the rows
   present are exactly report numbers `k − N + 1 … k`, each in slot `number mod N`; after `k < N` they are `1 … k`.
5. **An overwrite keeps nothing of the old report** — property: for an old row with every optional column set and a
   new row with every optional column absent, the slot reads the new row's values and nulls, never a field of the old.
6. **Live wrap and concurrency, on the test database.** (a) The persistence live test moves the cursor **forward
   only** to the next value `≡ N − 2 (mod N)` and writes three reports: they land in slots `N − 1`, `0`, `1` with
   consecutive numbers; a row it placed in slot `2` under a foreign mark beforehand remains. (b) 20 concurrent writes
   produce 20 distinct report numbers in 20 distinct slots. (c) The count of rows never exceeds `N` after either.
7. **The grant is exactly the plan's.** The privilege test, run as the application role, finds `SELECT, INSERT,
   UPDATE` on `csp_reports` and `SELECT, UPDATE` on `csp_report_cursor`, **no `DELETE` and no `TRUNCATE` on either**,
   nothing through `PUBLIC`; it is skipped with the reason *"does not exist yet on this database"* when the table is
   absent, never failed and never silently passed.

*The write path.*

8. **No row for a refusal.** Through the real route with the persistence fake as the store: `415`, `413`, `400`
   (a broken stream, not JSON, no `csp-report` object), `429` and `503` each leave the store with **zero** calls.
   Property: for any request the route answers with a status other than `204`, the store was not called.
9. **One row per `204`.** A `204` makes exactly one store call, whose row equals the reduced record field for field
   plus the mark, and **exactly one** `[csp]` `csp-violation` line, written **before** the store is called.
10. **A failed store changes nothing a browser sees.** A store that rejects, throws synchronously, or never settles
    (fake clock past 3,000 ms): the answer is `204`, empty, the same headers; exactly one
    `[csp] {"event":"csp-report-unstored","cause":…}` per process per cause, with a cause from the closed list and no
    error text; a second failure of the same cause writes no line. **Must not:** a `5xx`, a body, a thrown error
    escaping the route, an error message or a row value in the line.
11. **Nothing from the request but the reduction reaches the store** — property: for a report body with arbitrary
    strings planted in every field the reduction drops (`document-uri`'s path, query and fragment, `referrer`,
    `script-sample`, `original-policy`, an unknown field) and in the request's cookie and user-agent headers, the
    store's argument, serialised, contains none of them.
12. **Every reduction is a storable row** — property: for arbitrary JSON bodies (and arbitrary `ownOrigin` values),
    every `report` reduction with a valid mark passes `requireValidCspReportRow`. A reduction change that would make
    the table refuse a row fails here, at test time, and not as a silent loss in production.
13. **The mark.** It equals `keyedDigest` of purpose `csp-report-writer` under the secret; two secrets give two marks;
    one server's reports carry one mark; with the secret unusable no store call is made (a `503` from the limiter
    already precedes it; a direct unit test of the mark's reader covers the case). The route still reads no cookie and
    sets none.
14. **A database without `0009` behaves as today.** Store calls that fail because the table is missing produce `204`,
    the `csp-violation` line, and one `csp-report-unstored` line per process: nothing else changes. This is what lets
    the code merge before the owner's migration.

*The e2e net and the test rows.*

15. **The teardown counts and removes only the run's rows.** It computes the run's mark from the run secret, removes
    the rows under that mark through `deleteCspReportsForTests`, prints `… csp-report hits (… counter rows removed),
    … csp report rows removed`, and fails if **rows removed > hits counted** (a mark collision or another writer).
    Rows are removed even when another teardown check fails (the existing aggregate pattern). The `CI` zero-hits
    assertion is unchanged and stays the net. *Expected, not a finding:* a run that wrote more than `N` reports would
    overwrite its own rows, so rows removed may be below hits; only *above* fails.
16. **The guarded helpers.** Each refuses a mark that is not 64 lowercase hex **before** opening a connection; an
    empty list sends no statement; the statement is `writer_mark = any($1)` and nothing wider (pinned by text with the
    driver mocked); the live proof plants a row under a foreign mark and asserts it remains after the delete; the
    mutant of the `where` is run against the mocked driver only. Nothing under `apps/web/src` names either helper.
17. **QA's second-server spec** (QA-owned, `qa-8q-csp-sink.adversarial.e2e.spec.ts`): rows under its server's mark
    equal its number of `204` answers, and its `afterAll` removes them by that mark. The developer reports this file to
    QA and does not edit it.

*Documents.*

18. **The runbooks.** The migration section carries exactly the two `GRANT` statements above; the reading runbook's
    queries are run once, read-only, by QA against the test database while a run's rows exist, with the output quoted
    (no URL, no secret).

## The read path — `docs/runbooks/reading-csp-reports.md` (S5 writes it from these)

Opening paragraph, verbatim in substance: *Every field of a report is what a browser, or anyone, claimed. `origin =
'own'` means the report says it came from this site, not that it did (ADR 0161 Amendment B). Read with the owner
credential in the database console; never paste a connection string anywhere.*

```sql
-- 1. The latest fifty, newest first.
select report_number, received_at, directive, blocked, source, line_number, column_number,
       page, locale, origin, disposition, status_code
from csp_reports order by report_number desc limit 50;

-- 2. What has been happening, by day, over thirty days.
select date_trunc('day', received_at) as day, directive, blocked, page, origin, disposition, count(*) as reports
from csp_reports where received_at > now() - interval '30 days'
group by 1, 2, 3, 4, 5, 6 order by 1 desc, 7 desc;

-- 3. Has the table wrapped? Reports ever stored against rows held.
select (select last_number from csp_report_cursor) as reports_ever_stored, count(*) as rows_held from csp_reports;

-- 4. Who wrote the rows: one mark per environment; a second mark means a rotated DIGEST_SECRET or a test's rows.
select writer_mark, count(*) as reports, min(received_at) as first, max(received_at) as last
from csp_reports group by 1;
```

## QA plan — Reading and focus

*QA Reading:* this plan whole (criteria 1–18, 8Q2.1–8Q2.9); ADR 0162; ADR 0161 decisions 2, 3, 8 with F1–F4 and
Amendment B; ADR 0151 with its note; ADR 0155 decision 10, *Incident* and the standing rule; the wave's diff; the
tests named in each slice's *Reading*; `qa-8q-csp-sink.adversarial.e2e.spec.ts` (QA-owned, criterion 17);
`engineering-conventions.md`, *Coverage an adversarial pass owes* and *Three guards that look thorough and cannot
fail*; `agent-coordination.md`, *Freeze the tree*.

*Focus:* criterion 3 both ways (a code check and a table check that agree only because one fed the other is the
first guard of *Three guards*); the ring at `N = 1`; an overwrite with fewer optional fields (criterion 5); a slow
store against the deadline; a store that throws synchronously; a reduction fuzz feeding criterion 12 (`fast-check`,
arbitrary JSON, unicode, 255/256-character origins, chunk paths at 255/256); the teardown with a planted foreign-mark
row; a whole `CI=1` e2e run quoting the teardown line with both figures; the QA second-server spec under `CI=1`
(a skip reads as fine, so quote a run in which it passed). **Destructive-statement mutants against a mocked driver
only.** No row deleted outside the guarded helpers.

## Review plan — Reading per reviewer

*Logic Reading:* this plan; ADR 0162; ADR 0161 decisions 2, 3, 8 and Amendment B; ADR 0156 d4; the diff of S1b, S3,
S4; `csp-report.ts` (read). *Questions:* does any path store a row for a refusal; does the ring keep the newest `N`
under concurrency; does a failed store change any answer; does the teardown's inequality hold in every order.

*Clean-code Reading:* the diff; `engineering-conventions.md`; the neighbouring store files named in S1b for
consistency of shape.

*Security Reading:* this plan's *The migration*, *The store's one statement*, *The grant*, 8Q2.2–8Q2.7; ADR 0162;
ADR 0161 decision 3, F2, F3 and Amendment B; ADR 0008; ADR 0151; ADR 0155 standing rule; ADR 0096 d5;
`environments-and-resources.md`; the S5 runbook sections; at checkpoint A, `0009`'s text before anything applies
it. *Questions:* can any byte of a visitor's address, token or id reach a row or a line; is the grant the least that
works and is no `DELETE` reachable; can a flood do more than overwrite noise with noise; can a test helper reach a
row it did not write.

*Visual:* none; no page changes.

## Risks

1. **The grant may be wider or narrower than Postgres needs** for `ON CONFLICT DO UPDATE` [inf]. Table-wide `SELECT`
   on non-personal data closes the narrow side. Only the owner's privilege run as `app_designs` proves it (the test
   database's role is the owner [doc: `environments-and-resources.md`]).
2. **`0009` freezes on the first live run.** Checkpoint A comes before it; after it, a change is `0010`.
3. **A flood overwrites real reports.** Accepted (ADR 0162 decision 3): every row is unauthenticated noise anyway,
   and the flood still shows in the counters and in the once-an-hour `csp-report-limited` line.
4. **Shape checks drift from the code's lists.** Criterion 12 fails at test time; a new page family needs no
   migration because the check is a shape, not a list.
5. **The cursor is one hot row.** Bounded by the limiter per block; worst case considered in *The store's one
   statement*.
6. **The live wrap test moves a shared cursor.** Forward only, in the persistence suite, which is not run beside an
   e2e run on the same test database (`agent-coordination.md`, shared `TEST_DATABASE_URL`; backlog 69).
7. **An e2e run before any persistence run since `0009`** finds no table: rows are not stored, QA's criterion 17
   goes red, and the sink still answers `204`. The coordinator runs the persistence suite first.
8. **Size is an estimate** until S1 measures it.
9. **Host change.** Nothing here depends on the host; only Q52 (b)'s optional prune would.
10. **The table is not in the nightly backup.** The Blob export is scoped to `designs` and *"must not be widened"*
    [doc: ADR 0012, as `milestones/README.md` quotes it], so reports are as durable as the database itself and its
    own restore window, no more. That is still durable in the owner's sense (it survives a change of host's log);
    the owner is told so in Q51 rather than left to assume a backup.

## Verification

- S1a: `rtk proxy pnpm --filter @lemnaria/persistence run migrate:unattended-check` and the screen test, quoted.
- S1b, S2: the persistence suite, alone (ADR 0155; never beside an e2e run), its live tests not skipped; the
  `reached database … as role …` line of the privilege test quoted with its skip reason on the test database.
- S3: the web Vitest suite; typecheck; lint.
- S4, QA: one whole `CI=1` e2e run, alone, the teardown line quoted with both figures, `0 csp-report hits` and
  `0 csp report rows removed`; the QA second-server spec passing, quoted.
- Close: `pnpm format:check` whole-tree; `pnpm ci:local` before any push (R8, clean tree).

## Owner questions (Q50 to Q54) — each has a default; none blocks S1

- **Q50 — Where does this sit?** (a) a wave 8Q2 in M8, before 8T; (b) its own small milestone after M8; (c) in M9.
  **Recommended (a)**, for the five reasons under *Where this sits*.
- **Q51 — How many reports does the table keep?** It keeps the newest `N` and overwrites the oldest. (a) 1,000;
  **(b) 10,000**; (c) 100,000. **Recommended (b):** at the worst rate while no network source is named (100 an hour,
  2,400 a day) a continuous flood takes about four days to wrap it [arithmetic]; 8Q's whole e2e run under enforcement
  counted 0 reports across 1,026 tests [doc: 8Q close], so ordinary pages are expected to add few [inf: real
  browsers with add-ons are untested]; under about 7 MB [inf]. *Note:* the reports live in the database but are
  **not** in the nightly design backup (ADR 0012 scopes it to `designs`), so they last as long as the database does.
- **Q52 — Also delete reports older than some age?** (a) **No** — rows hold nothing personal, so age is a
  preference, not a duty, and a prune needs a scheduler, which is what the owner wants to avoid; (b) yes, 90 days,
  folded into the existing nightly prune (needs `DELETE` on `csp_reports` for the application role, which the
  recommended grant withholds, and a scheduler on the M9 host). **Recommended (a).**
- **Q53 — Keep the log line as well?** **(a) Yes** — the table is the durable record, the line is the live signal
  and the only copy when the database write fails; (b) no, log only when the row could not be stored. **Recommended
  (a).**
- **Q54 — How do you read the reports?** **(a) Queries in a runbook**, run in the database console; (b) a small page
  in the application, later, once there is a login (M8B) to protect it. **Recommended (a).**

## Owner actions (none blocks the wave's build or merge)

1. **Apply `0009`** on preview, then production, before the code that writes runs there: through the migrate CLI with
   the declared environment, or the deploy workflow where it runs (it clears the unattended screen by criterion 1).
   Check the ledger reads 9 and the two tables match the runbook section.
2. **Issue exactly the two `GRANT` statements** above, preview first, after reading `pg_default_acl`.
3. **Run the privilege test as the application role** on each, and quote its `reached database … as role …` line.
4. Already owed, unchanged, and now also needed for the mark: `DIGEST_SECRET` in each environment (ADR 0155);
   `CLIENT_NETWORK_SOURCE` (or the host's equivalent) before any deployment carries the flip (Q47).
5. Answer Q50 to Q54, or let the defaults stand.
