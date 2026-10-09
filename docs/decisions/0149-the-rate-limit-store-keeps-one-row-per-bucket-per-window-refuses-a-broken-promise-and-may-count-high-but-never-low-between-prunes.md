# ADR 0149 — The rate-limit store keeps one row per bucket per window, refuses a broken promise, and may count high but never low between prunes

Status: Accepted. **Decision 3 (rule S2) is the architect's ruling and is open to the owner.**
Date: 2026-10-08
Type: Decision
Milestone: M8 wave 8E (the rate-limit store)

The record was written by the documentation scribe from `docs/milestones/M8-review-contact-success.md` (wave 8E:
*adjudication of QA*; *a deadlock between hits and a prune*; *QA round 2, and F3*; *the three reviews*), where the
architect's reasoning lives, and from the coordinator's hand-over for the close-out. The scribe has no shell and ran
nothing. Evidence tiers: **[doc]** quoted from a record in this repository, **[src]** read in the code by the plan's
author or a reviewer, **[inf]** inference. Every figure is labelled by who ran it. Cited in code as `see ADR 0149`
(`packages/persistence/src/neon-rate-limit-store.ts:50` and `:127`).

## Context

ADR 0019 chose Postgres over Redis to count requests (Alternative 4) and ADR 0147 limits the mint. Wave 8E builds the
counter they stand on: a table, a port that records one request's hits against several buckets in one statement, a
prune, and a fake. Waves 8F, 8G and 8K build the limiter on it. Several rules were ruled only in the plan, and the
plan is archived when M8 closes. Two of them (S2 and the lock-order tier) are exceptions or limits a later reader
would otherwise take for oversights.

## Decision

### 1. The table: one row per bucket per window, windows supplied by the caller, half-open

`rate_limit_counters` (migration `0007`): `bucket_key` text, check `^[0-9a-f]{64}$`; `window_start` and `window_end`
`timestamptz`; `hits` integer, check `> 0`; primary key `(bucket_key, window_start)`; check `window_end >
window_start`; an index on `window_end`. No grant in the migration [src, reviewers].

The **caller supplies each window**, half-open: two adjacent windows of one key are two rows, and an instant equal to
a window's end belongs to the next. The store cannot know a window's length, because a Chișinău day is 23, 24 or 25
hours [doc, plan, 8E adjudication]. Which window holds an instant is 8F's. A count comes from the current window
alone, so a prune that is late, missing or repeated never changes a count (criterion 9).

### 2. Rule S1 — one key, one policy; a broken promise is refused, never counted

A bucket's key is the digest of **an encoding of the policy's name and the subject** in which the name comes from a
**closed set written in code** and the subject **cannot be mistaken for any part of a name**: equal encodings only for
equal pairs (restated after review S-R1.3; the first wording said only "the two together"). This is not a corner: 8G
and 8K keep two limits on one subject, and an hour's window and a day's begin at the same instant every midnight.

A hit whose window end differs from the stored row's is **refused with its own typed error**, and **nothing of that
request is counted, in any of its buckets**; the stored count and end are as they were. *Mechanism:* the upsert's
`set window_end = …` trips `0007`'s own window check, so the statement fails as a whole and `0007` is unchanged
[src `neon-rate-limit-store.ts`]. The fake does the same.

**Rejected: keep the later end.** The row would hold two policies' hits added together and the store would return a
number that is no policy's count. A wrong count given as a count is what criterion 6 forbids.

### 3. Rule S2 — a retried hit may count high and never low between prunes — OPEN TO THE OWNER

Repeating a hit after a **cold-start refusal** is accepted, knowing it may count one request up to three times. An
**empty reply** is not repeated: it follows a reply that began well, so the hit most likely landed [inf]; the request
is refused and its hit may stand. Both err high. Stated as a property (criterion 11): under any sequence of lost
replies, a bucket's stored count is never less than the number of requests answered with a count, and never more than
the number of attempts sent, **for a window the prune has not removed**. Across a prune's removal a hit starts again at
1; 8G's prune therefore trails the clock by a margin longer than a request can live.

**Why a record is needed.** ADR 0145 decision 1 does not say a cold-start refusal ran nothing; the retry's own comment
says it *"can follow a statement that already ran"* [src `retry-on-transient-failure.ts:26-27`]; the harness loses a
cold-start reply after the write lands [src `tests/support/lose-the-first-reply.ts`]. No record measures which is true
of Neon. The other choice refuses the first design after the database has slept, which at this traffic is the ordinary
first request of a morning.

**This is an exception to ADR 0145 decision 2's headline**, the owner's *"a retry never leaves a trace"*. That
decision lists designs, links and visitor moves; a counter is none of them, but an over-count is a trace. It is **the
architect's ruling, open to the owner**, to be put with the limit's own "track and adjust later". ADR 0145 gains a
dated note pointing here.

**Rejected: refuse after a cold-start refusal.** It makes the first request after sleep fail.

### 4. Criterion 12 — one lock order, and the tier of that claim is a recorded limit

A deadlock (SQLSTATE `40P01`) between hits and a prune was seen once in five runs of QA's race [relayed,
developer-run]. Every statement that can lock more than one row takes them **by key, then by start**. The prune is a
locking read under an `order by` (`order by bucket_key, window_start for update`, then the delete), which Postgres
documents [reviewer: logic, Postgres 17 docs]. That an insert takes its select's rows in the select's order is
**observed, 30 of 30 runs, and not documented**.

**Recorded limit, with its trigger (ADR 0118):** a `40P01` from this module, or a new major version of the database,
re-runs QA's race. A `40P01` is a finding, not a case.

**Rejected: tolerate it; repeat a `40P01`; skip locked rows.** Tolerating makes the test stop proving its title.
Repeating treats the symptom and each repeat first waits out the deadlock timeout; with one order there is none to
repeat. Skipping locked rows breaks criterion 5, which has the prune remove every expired row.

### 5. Criterion 13 — the privilege test is safe on any credential

Since M2, `tests/application-role-privileges.test.ts` sent `truncate designs`, `drop table designs`, `create table
privilege_probe` and two deletes of nonexistent rows at `DATABASE_URL`, which on a developer machine resolves through
the repo-root `.env.local` to **production** [doc `environments-and-resources.md:64`]. They were refused because the
role is the application's. Found by the security reviewer; fixed in `98b1f6b`.

The file now never sends a statement that would destroy or create anything if allowed: truncate is read as an
effective privilege; drop as *not the table's owner, no member of it, no superuser, not the schema's owner*; create as
no `CREATE` on the schema. A statement that would touch nothing even if allowed is sent only after the catalog says it
will be refused. Before any of it the file establishes by reads alone that the connection is no superuser, inherits no
role and does not own `designs`, and **a failed guard fails every test and never skips**. The run prints once the
database and role as the server names them and no part of the URL.

**Rejected: guard the destructive probes rather than remove them.** A guard is only as good as its reasoning about who
may drop a table, and a gap would be found by the table going. A statement not sent cannot succeed.

**Still true after the fix:** every persistence-suite run on a developer machine reaches production for this file, with
catalog reads and the two guarded deletes. Security rules that acceptable and says removing both deletes loses nothing
if the owner wants no write-shaped statement sent. **That is an owner decision**, as is whether the suite should read
production at all.

### 6. Criterion 7 restated — the privilege list comes from the server

On `public.rate_limit_counters` the role holds select, insert, update and delete **and no other table privilege the
server it runs on knows**; the others' names are asked of that server. The first wording listed three where it meant
*no other*, and the server's eighth privilege, `MAINTAIN`, would have passed [relayed, QA-run, test database]. A floor
(the four held plus truncate, references and trigger) makes a short list fail rather than read as *nothing else held*.

### 7. An empty list is refused

`recordHits` with no buckets would resolve to no counts without asking the database, and no counts reads as nothing
over the limit. It is a validation refusal in the one check both stores share. 8F's evaluator separately refuses a
policy with no bucket when it is built.

## Limits recorded, not fixed

- **L-R1.4.** "Nothing counted" has a hole through the retry: it needs a caller that already broke S1 and a prune inside
  the retry's half-second wait.
- **The digest is unkeyed.** Accepted for 8E and 8F as a recorded limit. Whether it is keyed is decided in **8K's S0,
  before an e-mail is ever a subject**; keyed is the security reviewer's recommendation there. Adding a key later
  changes every key, so every count restarts at that deploy: harmless for a day's limit, and better known beforehand.
- **No statement timeout** in the store; **no cap on list length**: both are 8F's (below).
- **The fake differs from the Neon store** (L-R1.5): it never fails and reproduces no overflow, unreadable window or
  lost reply. A test of failing closed brings its own store that rejects.
- **Criterion 11 holds within the harness's reach.** Not reached on the live database: two losses inside one call; a
  lost reply with another caller's hit between it and the repeat; a lost reply on a prune. The first is covered with a
  mocked driver only.
- **Not proven:** the grant test's body has **never executed anywhere**. The table is absent from the database that
  `DATABASE_URL` reaches, so it skips; the result "exactly four" is observed nowhere. Nothing ran on a CI runner. The
  server versions of preview and production, and whether their application roles hold any membership, are unread (the
  test database's role is in `pg_maintain`, so the grant test would be red on `MAINTAIN` there, correctly [QA]). That a
  `window_end` rewritten with itself avoids index churn (HOT) is inference.

## What later waves inherit

- **8F:** the key's encoding, the closed set of names and a property for it over arbitrary subjects, including ones
  that contain a policy's name (S-R1.3); a change of a window's length is a new policy name (S-R1.4); a policy with no
  bucket is refused when built (S-R1.2); the list's length is the policy's and never a request's (S-R1.6); the store
  sets no time limit, so 8F brings its own deadline and refuses when it passes (S-R1.7); it fails closed on any throw,
  two of which are not `RateLimitStoreError` (L-R1.6); the fake cannot be reached in a deployed build (S-R1.11) and
  differs from the Neon store as listed (L-R1.5); the digest is one function, so a key added later is one function's
  change; a count may be high, so a refusal at exactly the limit is not proof of twenty requests.
- **8G:** the prune's margin (L-R1.1); its instant is the server's clock and never a request's value (S-R1.5); a prune
  that fails is seen (S-R1.5); a prune over a flood's rows may not finish in one statement (S-R1.5); the number it logs
  is a lower bound (L-R1.2).
- **8K:** whether the digest is keyed, in its S0.

## Evidence

- **[coordinator-run]** at `c8305b1`: `pnpm --filter @lemnaria/persistence run test` exit 0, 64 files, 1788 passed, 1
  skipped; typecheck 0. At `aa8a015`: persistence typecheck 0, lint 0, web typecheck 0, `pnpm gate:boundary` 0; both
  SQL template strings byte-identical to `ae1a8dd` (758 and 587 characters). At `ae1a8dd`: `migrate:unattended-check` 0.
- **[QA-run, live test database]** 150 concurrent hits return 1…150 once each; exactly one HTTP request for 1, 2 and
  1000 buckets; 20 non-digest key shapes refused by code and by the constraint; prune exact at the boundary, twice and
  concurrently. The race (16 hits listing 150 expired rows against 8 prunes, 3 rounds): 10 of 10 runs red with
  SQLSTATE `40P01` against the unordered prune, then 30 of 30 green at `33778b1`, every expired row gone. Criterion 10
  live and in the fake, including two callers racing a fresh key with different ends (never a mixed row). Criterion 11
  over all 25 two-step and 12 seeded six-step lost-reply sequences: answered ≤ stored ≤ attempts. Criterion 13: the
  privilege file run as a child process against the test database (the role owns `designs`): every test failed at the
  guard, none passed or skipped.
- **[reviewers, at `ae1a8dd`]** logic: approve with should-fix; clean-code: approve with should-fix; security: approve,
  no must-fix in code. At `c8305b1` all three closed their items.
- **Not run:** `pnpm check`, `pnpm ci:local`, e2e; anything on a CI runner.

## Amendment — 2026-10-08, at wave 8H's close: rule S2 accepted; the digest is keyed, by one secret

Written by the documentation scribe from `docs/milestones/M8-review-contact-success.md` (*The owner's answers of
2026-10-08*, items 1, 5 and 6; *The digest secret*, under 8I). The owner's words reached the scribe relayed. Nothing above
is rewritten; the decisions stand, and these two statements are superseded as marked.

**1. Rule S2 (decision 3) is accepted by the owner.** Asked whether a hit repeated after the database has slept may be
counted up to three times against the twenty-a-day limit, he chose *"Accept (Recommended)"* [relayed]. The header's
*"open to the owner"* is discharged for decision 3. *Not asked and unchanged:* that an empty reply is not repeated, and the
bounds of criterion 11.

**2. The keyed-hash recommendation is replaced by the owner's decision.** *Limits recorded, not fixed* above says the
digest is unkeyed, accepted for 8E and 8F, and that whether it is keyed is decided in 8K's S0; *What later waves inherit*
gives 8K *"whether the digest is keyed, in its S0"*. **Superseded.** The owner said *"lets add this secret"* (to a keyed
digest for the contact request's conflict check) and then, asked whether 8F's rate-limit keys should use it from the start,
*"lets use same secret"* [both relayed]. So: **one secret, `DIGEST_SECRET`; the rate-limit keys are keyed with it from 8F's
first deploy.** 8F is not built yet [ran: `apps/web/src/lib/server/rate-limit` did not exist], so no key is re-keyed and no
count restarts for this reason. The two uses are kept apart by what is digested: HMAC-SHA-256 of an encoding that begins
with a purpose from a closed set written in code, then the fields each marked with its length. That encoding is **the
architect's, not the owner's**, and the security reader checks it at 8F's S0. Its name, shape and the way tests run without
it are the architect's, in the plan's *The digest secret*. 8K adds the second purpose and writes no digest code of its own.

**Two consequences, said to the owner with the runbook.** Rotation makes a contact request whose retry falls across it
conflict (the row is found and its digest differs), and every rate-limit count starts again. Until the variable is set in an
environment, 8F's code creates no design there. See `best-practices/environments-and-resources.md`.

**3. A correction to *Still true after the fix*.** That paragraph says every persistence-suite run on a developer machine
reaches production. The owner has since changed Vercel's Development `DATABASE_URL` and pulled it again; the coordinator ran
the privilege test alone and it printed `reached database "lemn-conf-v2-preview" as role "app_designs"`, 10 passed, 1
skipped, exit 0 [coordinator-run]. **The suite no longer reaches production from that machine.** The skipped test was
reported to be the `rate_limit_counters` grant test, because the table is not on preview either [coordinator-run, relayed];
the grant half of criterion 7 therefore has still never executed anywhere. Production's grants are checked only by a
deliberate run per the runbook.

## Note — 2026-10-09: 8F is built (wave 8F)

The limit *"The digest is unkeyed"* (and *"unkeyed for 8E and 8F"*) is overtaken: 8F keys every bucket from its first deploy, by HMAC-SHA-256
under the thirty-two bytes of `DIGEST_SECRET`, with length-marked parts and a closed set of purposes. The evaluator judges one bucket (two are
8G's). A test-only delete of counters by key sits beside the fake in the persistence package (`delete-rate-limit-counters-for-tests.ts`).
[ADR 0155](0155-the-mint-asks-a-keyed-per-day-per-network-limiter-first-and-refuses-what-it-cannot-judge-the-owner-names-the-network-source-and-a-destructive-mutant-never-touches-a-database.md) decisions 1, 5 and 10.
