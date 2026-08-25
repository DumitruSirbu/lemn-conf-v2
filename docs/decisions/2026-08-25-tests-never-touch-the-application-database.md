# 2026-08-25 — Live database tests run against a separate database, never the application's

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

The application connects as `neondb_owner`, the Neon project's admin role — M2 work item 8's
least-privilege-role requirement is **not** yet met. Tracked separately; unrelated to test isolation
but surfaced while verifying this.
