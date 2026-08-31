# ADR 0006 — Live database tests run against a separate database, never the application's

Status: Accepted (the "Still open" least-privilege-role item is superseded by ADR 0008)
Date: 2026-08-25
Type: Decision
Milestone: M2 Wave 2B

## Context

M2 Wave 2B's `packages/persistence` includes tests that exercise the real Neon adapter — the
round-trip invariant the milestone requires ("load the stored document, validate it, canonically
serialise it, and require equality") is only meaningfully proven against a real Postgres `jsonb`
column, so these tests genuinely write rows.

As first written they pointed at `DATABASE_URL` — the application's own database — and never cleaned
up: three runs left six orphan rows behind. Clearing them required a manual `DELETE FROM designs`
against the live application database. That was safe only because no real design existed yet (the
write path is what Wave 2B is building). Once customers have designs, the same setup is an incident
waiting to happen: a suite that inserts and deletes rows, pointed at production data, needs only one
careless `delete` or a `beforeEach` truncation to destroy real work. This has bitten the maintainer
on a previous project.

## Decision

Live database tests never touch the application database. Three mechanisms, all in
`packages/persistence`:

1. **A separate database.** `lemnaria_test`, created on the same Neon project (the role has
   `CREATEDB`). `resolveTestDatabaseUrl()` (`src/test-database-url.ts`) derives its connection
   string from `DATABASE_URL` by swapping only the database name, so no second copy of the
   credentials is stored anywhere.
2. **A hard guard.** `resolveTestDatabaseUrl()` throws if the resolved URL names the same database as
   `DATABASE_URL` — including when `TEST_DATABASE_URL` is set to the application's database, or when
   the application database is itself named `lemnaria_test`. A misconfiguration fails loudly instead
   of quietly running destructive tests against real data. Covered by `test-database-url.test.ts`,
   and the live suite additionally asserts at runtime that its target differs from `DATABASE_URL`.
3. **Cleanup.** Every row a test mints is tracked and deleted in `afterEach`, so a full run leaves
   zero rows (verified). Without this the suite is not repeatable in the F.I.R.S.T. sense and the
   table grows without bound.

`runMigrations(connectionUrl?)` and `new NeonConfigurationRepository(connectionUrl?)` both take an
optional connection string, defaulting to `DATABASE_URL`. Only the tests pass it explicitly;
application code is unchanged.

## Stronger isolation, when wanted

`TEST_DATABASE_URL` overrides the derived string entirely, so a wholly separate Neon *project* (its
own compute and credentials, not just its own database on the shared project) drops in by setting
that one variable — the guard still applies. Put it in `.env.test.local`, **not** `.env.local`:
`vercel env pull` rewrites `.env.local` wholesale and would discard it. `src/load-env.ts` reads
`.env.test.local` first so its values win, and `.gitignore`'s `.env*.local` already covers both.

## Alternatives considered

- **Mock the database / use `pg-mem`.** Rejected: the round-trip criterion is specifically about real
  `jsonb` normalisation, which an in-memory fake cannot prove. A `FakeConfigurationRepository` does
  exist and covers the contract in CI without a database — it complements these tests rather than
  replacing them.
- **Keep using the application database but add cleanup only.** Rejected: cleanup alone still leaves
  a suite whose failure mode is "deletes production data." The isolation is the actual safeguard;
  cleanup is hygiene on top of it.
- **An ephemeral Neon branch per CI run.** Better still, and compatible with this design via
  `TEST_DATABASE_URL`, but it needs a Neon API key that is not currently provisioned. Recorded as a
  future improvement, not built now.

## Still open

~~The application connects as `neondb_owner`, the Neon project's admin role — M2 work item 8's
least-privilege-role requirement is **not** yet met.~~ **Superseded by ADR 0008**: the application now
connects as `app_designs`, a least-privilege role holding only `SELECT, INSERT, UPDATE` on `designs`.
Tracked separately; unrelated to test isolation but surfaced while verifying this.

## Amendment, 2026-08-31 — the destructive-test target is `lemn-conf-v2-staging`

Type: Correction and decision
Context: adversarial-review remediation; `testing-reports/05-persistence-and-backup.md` (DB-001) and
`testing-reports/07-critical-attack-vectors.md` (AV-6)

Everything above stands as accepted. This amendment records a factual correction to it, a decision
taken on the correction, and the rule that decision imposes on anyone who touches these databases
later.

### The correction

This record names `lemnaria_test` as the separate database live tests run against. That is not what
is configured. `TEST_DATABASE_URL` points at **`lemn-conf-v2-staging`**, a database in the **same
Neon project** as the application database `lemn-conf-v2`. `lemnaria_test` was never created.

The drift was discovered on **2026-08-31**, when the rebuilt guard refused the configured target
because its name was not yet allowlisted. The live `packages/persistence` suites had been writing
rows to `lemn-conf-v2-staging`, and deleting them from it, since they were written — before anyone
noticed the ADR described a different database.

### The decision

**2026-08-31, owner's decision: keep `lemn-conf-v2-staging` as the destructive-test target.** The
alternative — creating `lemnaria_test`, repointing `TEST_DATABASE_URL` at it, and leaving
`lemn-conf-v2-staging` alone — was put to the owner and declined.

So `lemn-conf-v2-staging` is now a **named destructive-test target of this repository**, on the same
footing the original text gave `lemnaria_test`. Both names are on the guard's allowlist.

### The operative constraint

**Nothing other than the destructive test suites may use `lemn-conf-v2-staging`.** Despite its name
it is **not a staging environment** and must never be treated as one:

- No staging or preview deployment may point at it.
- No QA fixture set, seed data, or demo content may live in it.
- No copy of production data may be pulled into it, not even temporarily, to reproduce a bug.
- Nothing anyone would mind losing may be stored in it, at any time, for any duration.

Every run of the `packages/persistence` live suite deletes design rows from this database. That is
its purpose.

**The guard cannot protect it.** Allowlisting `lemn-conf-v2-staging` is precisely what *authorises*
deletion there; the guard's job is to refuse everything not named, so a named database is the one
thing it will never refuse. The protection for this database is this paragraph and the reviewability
of the allowlist — nothing in the code.

### The name is misleading

"staging" invites exactly the misuse the constraint forbids: a future operator reading the Neon
console sees a staging database and reasonably points a staging deploy at it, or restores a
production snapshot into it. Renaming it to something unambiguous (`lemn-conf-v2-destructive-tests`
or similar) remains worth doing on its own merits, and should be done by whoever next has reason to
touch this configuration. It was not done now.

### How the guard now works

`assertSafeTestDatabaseUrl()` in `packages/persistence/src/test-database-url.ts` replaces the
mechanism described in "Decision" point 2:

1. **Refuse unless allowlisted.** The target's database name must appear in
   `ALLOWED_TEST_DATABASE_NAMES`. Anything else is refused, including when `DATABASE_URL` is absent
   — a missing variable must never be what lets a DELETE through.
2. **Refuse the application database's name.** A second refusal fires when the target's database name
   equals the one `DATABASE_URL` names, which covers the case the allowlist cannot see: an
   application database that is itself called `lemnaria_test`.

**The host is deliberately not compared.** An intermediate version of this guard compared
host + port + database name as an identity, and review showed that to be a regression rather than a
hardening: Neon's pooled endpoint, direct endpoint, branch endpoints and CNAMEs are different
hostnames reaching the same rows, so the direct connection string for the application database would
have passed a host comparison and the suite would have deleted production rows. Only a rule that
starts from "refuse everything, then admit named exceptions" refuses that string.

`ALLOWED_TEST_DATABASE_NAMES` is a module-level, non-exported constant. **No environment variable can
widen it**, so admitting a new destructive-test target is a source change that appears in a diff and
goes through review.

### What this amendment changed

Documentation only. No environment variable, no database, no role and no code were changed by it.
