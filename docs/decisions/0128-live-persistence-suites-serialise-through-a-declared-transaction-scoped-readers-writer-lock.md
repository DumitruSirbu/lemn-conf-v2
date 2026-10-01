# ADR 0128 — Live persistence suites serialise through a declared, transaction-scoped readers–writer lock

Status: Accepted
Date: 2026-09-22
Type: Decision
Milestone: M7, wave 7T (S2/S3)

## Context

`docs/milestones/M7-room-and-presets.md`, wave 7T, found that five live persistence suites gated
themselves on `Boolean(process.env["DATABASE_URL"])`, which `ci.yml`'s `test` job deliberately never
sets — so the database seam's live coverage had been green by never executing. Re-gating them onto
`TEST_DATABASE_URL` is not a one-line flip: `ci.yml`'s concurrency group does not serialise two
different PRs or a PR and a `main` push, and nothing serialises a developer's laptop against either.
Three of the five suites mutate the shared ledger and shared schema — dropping columns, forgetting
applied migrations, running concurrent migration runs — so an un-isolated re-gate is a guaranteed
flake at best and a corrupted shared database at worst. **BACKLOG 69 (2026-09-18) is the proof this
was not hypothetical:** two gate runs against `lemn-conf-v2-staging` corrupted its ledger, with the
errors `MigrationSequenceError: Migration 4 … is recorded as applied, but 2 … is not` and
`column "write_token_hash" does not exist`.

This decision lifts the isolation mechanism — T-J5 through T-J7 in the milestone's wave 7T section —
out of milestone prose, per that plan's own recommendation for close-out ("the lock is a convention
every future live suite inherits — 7P1's preset suites first. The scribe should therefore lift
T-J5–T-J7 into an ADR once S2c ships, rather than leave them in milestone prose"). The pattern follows
ADR 0127, which did the same for 7F1-D45's convergence rule.

**All numbers below were measured locally, before wave 7T's CI verdict exists.** The wave's own
criterion 18 is owed to the owner's `ci.yml` dispatch, and any hold duration observed there above 90 s
is escalated to the coordinator rather than silently absorbed. Read this record's timing figures as
pending that re-key, not as settled forever.

## Decision-record sweep

Grepped `docs/decisions/*.md` for `advisory`, `test database`, `TEST_DATABASE_URL`,
`lemn-conf-v2-staging`, `skipIf`, `live suite`, `migrate:status` and `readers-writer`/`readers–writer`.
The milestone's own wave 7T section ran the same sweep at planning time (nine records, listed there);
this table repeats it at close, with ADR 0042 as the nearest neighbour.

| Record | What it says | How it is settled here |
| --- | --- | --- |
| [0006](0006-tests-never-touch-the-application-database.md) + amendment 2026-08-31 | Live tests never touch the application database; `lemn-conf-v2-staging` is the named destructive target; the owner declined a separate `lemnaria_test`. | **Upheld.** The guard (`assertSafeTestDatabaseUrl`) stays on every re-gated suite's path. A second test database remains an owner question, not reopened here. |
| [0008](0008-least-privilege-database-role.md) | The application role holds no DDL. | **Upheld.** The two application-database files (`application-role-privileges.test.ts`, `write-token-schema.adversarial.test.ts`) keep their `DATABASE_URL` gate and take no lock — they never touch the test database. |
| [0020](0020-a-migration-file-is-not-an-applied-migration.md), amended by [0096](0096-the-deployed-schema-is-proved-by-a-gate-and-production-was-never-in-the-runners-path.md) | The deployed-schema read-back is a deploy-time gate; "a suite-level assertion may stand beside it; it may not be it." | **Followed, not amended.** The census (below) stands beside `deploy.yml`'s gate as a live test under this lock; it never replaces it, and no line of `deploy.yml` changes. |
| [0042](0042-the-database-records-which-migrations-it-ran.md) decision 3 | The production migration runner rejected a session-scoped lock — "a lock a dying process can leave held" — and chose transaction scope instead. | **The same reasoning, reapplied.** This lock is also transaction-scoped, for the same reason. Its key is disjoint from `MIGRATION_ADVISORY_LOCK_KEY` (below), so the two locks never contend with or substitute for each other. |
| [0054](0054-local-development-writes-to-the-preview-database.md) | Local development writes to `lemn-conf-v2-staging` too, so a laptop and CI share one database. | **The concurrency case this lock exists for.** A developer's `pnpm test`, `ci:local` or pre-push runs the destructive suites against the same database CI uses (`.env.test.local`), unconditionally — the lock is what keeps that safe rather than merely usual. |
| [0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md) | A problem that has not occurred is recorded with its trigger and not built for. | **Applied to every residual below.** BACKLOG 69 occurred, so the lock itself is built. R3's e2e cross-runner case has not occurred, so it is recorded with a trigger and not built. |
| [0119](0119-a-remembered-fact-about-this-repository-is-a-claim-to-recheck-and-true-at-head-is-not-true-at-the-end-of-the-milestone.md) | A remembered fact is a claim to recheck at the moment it is used. | **Applied.** Wave 7T's own S2/S3 plan re-measured every fact its earlier T-J2 ruling rested on at a later commit, and two of T-J2's three mechanism choices did not survive re-measurement (see *Alternatives*). |

**No earlier record is overturned.** This ADR formalises the milestone's own T-J5 (as amended),
T-J6 and T-J7 rulings; it does not change any of the records swept above.

## Decision

**Every live file under `packages/persistence/tests` that resolves the test database declares
exactly one mode, at module scope, before its first `describe`, held from a top-level `beforeAll` to
its `afterAll`.** The lock is a reader–writer lock: **shared** holders run alongside each other;
an **exclusive** holder runs alone; a later shared request queues behind an already-queued exclusive
request, so an exclusive requester cannot starve. The registration is per file, not per `describe` —
fewer registration points, and a static census can check it (below).

**Exclusive:** `migrate.test.ts`, `neon-configuration-repository.test.ts`,
`neon-configuration-repository.adversarial.test.ts` — every file that mutates the shared ledger or
schema, or asserts a whole-table aggregate. **Shared:** `design-row-source.test.ts`,
`backup-restore-round-trip.adversarial.test.ts`, and `test-database-schema-status.test.ts` — files
that mint or read rows but need the schema intact while they do. Two application-database files take
**no** lock and keep their unchanged `DATABASE_URL` gate, because they never touch the test database.
Two more files are the lock's own self-tests, contending only on a per-run random key.

**The primitive is `pg_advisory_xact_lock` / `pg_advisory_xact_lock_shared`, held inside a
transaction left open on one dedicated `Client`, released by `COMMIT`.** A transaction pins a server
connection even through Neon's pooled endpoint in transaction mode — measured holding on both the
pooled and direct endpoints — and a dead worker's dropped socket rolls the transaction back, which
releases the lock without a matching unlock call on any path. This is the same property ADR 0042
decision 3 chose transaction scope for; the helper agrees with the production migration runner's own
reasoning rather than arguing with it.

**The lock key is test-only and is never `MIGRATION_ADVISORY_LOCK_KEY`.** The helper does not import
`migrate.ts`. The production runner's per-transaction lock therefore runs inside an exclusive test
holder's window unchanged, and the two never contend.

**The numbers, local measurements pending the CI re-key:**

- **`lock_timeout` = 180 s.** Keyed on the longest hold observed of *any* mode — a shared file's hold,
  not only an exclusive file's — because an exclusive requester's worst-case wait is behind an already-
  granted shared holder under this lock's fairness rule. Measured after the page-size fix that had
  earlier inflated a shared hold to roughly 85 s: **exclusive 12.9–15.1 s, shared 7.4–10.1 s, longest
  observed wait 13.6 s**, all local. The bound is therefore roughly twelve times the longest observed
  hold today; it is deliberately left at 180 s rather than re-keyed tighter, because the number that
  matters is the eventual CI-measured hold under real contention, not today's slack. **Any hold above
  90 s in CI — half the bound — is escalated to the coordinator before this record's numbers are
  treated as settled**, and the bound is not silently raised in response to a single measurement.
- **The top-level hook timeout is 210 s** — the lock bound plus 30 s — so contention surfaces as the
  helper's own named error rather than as vitest's unreadable 30-second hook timeout.
- **`idle_in_transaction_session_timeout` = 600 s**, set with `SET LOCAL` inside the lock's own
  transaction. Postgres's server default is 300 s and silently terminates an idle holder at that mark
  through an asynchronous `error` event the holder would otherwise never see — this repository decides
  the idle ceiling rather than inheriting the server's, while keeping it finite so a genuinely stuck
  holder is still freed.
- **A killed holder's lock releases within 5 s** (measured at 54 ms). After `afterAll`, `pg_locks`
  shows no advisory lock on the key.

**Loss is loud.** The helper attaches `client.on("error", …)` from the moment it connects and records
any error as a lost lock. In `afterAll`, a lost lock or a failed `COMMIT` throws a named error (for
example `TestSchemaLockLostError`) stating the mode, the key and the recorded cause — never a
swallowed listener, which would silence Node's unhandled-error crash and report nothing, and never a
caught-and-ignored `COMMIT` failure.

## The census is a tripwire, not a sandbox

A static test discovers every file under `packages/persistence/tests` and checks three things: every
file that resolves the test database registers exactly one mode at module scope; every file matching
a destructive pattern (`alter table`, `drop `, `forgetAppliedMigrations`, `dropMigrationLedger`,
`dropSynthesisedMigrationArtefacts`, `count(*)`) registers exclusive; and the observed classification
equals a literal table — twelve rows in five classes: 3 exclusive, 3 shared, 2 application-database,
2 lock self-tests (a fourth class, "live gate, no lock," for files that contend on random keys only
and touch no table), and 2 that connect nowhere. A new live file that registers nothing turns the
census red, which is the point: the census exists to catch the next file that arrives the way the
original five did.

**It is a tripwire against the shape of files it already knows how to see, not a proof that every
future file is caught.** The census matches on `DATABASE_URL_SOURCE` patterns and connecting-module
imports (`neon(`, `new Client`, `new Pool`); a file that resolves a URL through a constant, uses an
opener name outside the known list, connects through a dynamic import, or connects at collection time
rather than at test time can be invisible to it. One file was checked against exactly this limit
during the wave and found to fall genuinely outside the population — it calls no connection opener and
names no database-URL source, so nothing it reaches needs a lock — but the limit itself remains a
property of the tripwire, not of that one file, and is recorded here so a future reviewer does not
read the tripwire as broader coverage than it has.

## Residuals

Recorded per [ADR 0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md)
— a trigger and a repair path, not a mechanism built against something that has not happened.

- **A hard kill inside a gap-or-drop window leaves the database looking exactly like a lock failure.**
  Three windows forget a migration or drop a column before restoring it. A `kill -9` landing inside
  one, with no other runner holding the lock, leaves the ledger claiming a column that is gone, and
  the next run fails with the same error text BACKLOG 69 produced — reading as a lock that did not
  hold rather than as the kill it was. **Trigger:** `MigrationSequenceError` or `column … does not
  exist` while no other runner holds the test lock. **Repair:**
  `forgetAppliedMigrations(url, VERSIONS_AFTER_THE_FIRST)` then `runMigrations`, or run the suite
  twice, since the restoring half re-applies. A later commit reordered these windows to forget before
  dropping, which narrows but does not close this window.
- **Vitest does not cancel a timed-out test body.** A live file's database statements can outlive the
  file's own release of the lock, landing outside any lock's protection. **Trigger:** a timeout in a
  live file followed by an unexplained failure in the next file that runs.
- **The schema-status reading carries no constraints, indexes or defaults.** It reads the same three
  functions `deploy.yml`'s gate reaches, narrowed to the ledger plus the required `designs` columns'
  names, types and nullability — this is the deploy gate's own reach, not a narrower one invented
  here. Measured: dropping a CHECK constraint, or adding an extra unnamed column, both still report
  `level`. Meanwhile the application database is held to a stricter standard by a separate live test
  that asserts that same constraint — so the weaker standard is where the destructive suites actually
  run. **Trigger:** a row reaching the test database that the application's own constraint would have
  refused, or a migration whose effect no test notices. **Revisit condition:** widening the reading is
  a change to the deploy gate's own contract and belongs in a decision record of its own, not folded
  into a test-infrastructure change.
- **e2e mints rows on the same database without taking this lock.** Not observed as a failure; the one
  cross-runner e2e failure on record (BACKLOG 69) was a port conflict, not a schema race. **Trigger:**
  an e2e failure whose log shows a missing `designs` column. **Remedy then:** Playwright's global setup
  takes a shared lock through this same helper.

## Alternatives considered

1. **A repository-wide CI `concurrency` group on the `test` job.** Rejected: it serialises every
   unrelated CI job behind the database suite, and it does nothing about a developer's laptop running
   the same suite locally while CI runs — a concurrency group cannot see a laptop. (Its
   default-cancellation objection was checked against GitHub's docs and found avoidable with
   `queue: max`; the rejection stands on the two reasons above regardless.)
2. **A second Neon database dedicated to the destructive suites.** The cleanest answer, and still
   rejected for this wave on one fact: creating a Neon database and adding a repository secret is the
   owner's action, and the project's Neon child-branch limit is already reached, so per-runner
   branches are not available today. Kept on the record as the right destination if this lock ever
   proves insufficient — an owner question, not a coordinator choice, if that day comes.
3. **A session-scoped `pg_advisory_lock` with a bounded retry**, this ADR's own earlier design
   (recorded in the milestone as T-J2). Rejected on re-measurement: it would have wrapped only the
   migration-run call rather than the whole mutate-run-assert-restore window a corrupting runner
   actually needs covered, and wrapped that way would have serialised `migrate.test.ts`'s own
   "concurrent runners" test into a run that no longer tested concurrency at all. Replaced by the
   whole-file, transaction-scoped, readers–writer design above.
4. **`migrate:status` as a CI workflow step**, reading a DDL-capable credential mapped into `ci.yml`.
   Rejected: a workflow step cannot take this lock, so it could read another runner's half-migrated
   schema and fail for a reason nobody could reproduce, and it would add a secret mapping that brings
   in a security reviewer for no corresponding gain. The equivalent check runs instead as a live test
   under the shared lock, reaching the same three functions the deploy gate reaches, per ADR 0020 as
   amended by ADR 0096.

## Consequences

- **Every future live suite inherits this lock as a convention**, starting with 7P1's preset suites.
  A new live-database test declares a mode before it does anything else, or the census fails it.
- **The persistence suite's wall-clock cost rises under contention**, bounded by the 180 s bound above,
  not by vitest's default 30 s hook timeout. This is deliberate: a slow, readable failure replaces a
  fast, unreadable one.
- **The numbers in this record are local and provisional until wave 7T's CI verdict lands.** A future
  reader re-keying the bound should re-read the CI-measured holds rather than the local figures here,
  and should check the 31 s sabotage value recorded in the wave's own criterion 10 before doing so — a
  naive re-key can land on the exact sabotage literal and pass for the wrong reason.
