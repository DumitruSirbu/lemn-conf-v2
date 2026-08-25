# 2026-08-25 — Postgres moves from Vercel-managed Neon to a standalone Neon project

## Context

`docs/decisions/2026-08-24-db-backed-shareable-persistence.md` chose Postgres on Neon, provisioned
through the Vercel Marketplace (`neon-gray-elephant`). That integration injects ~19 environment
variables into the Vercel project (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `PG*`, `POSTGRES_*`) and
owns them, and it bills through Vercel.

Two things pushed against keeping it while implementing M2 Wave 2B:

1. **Restricted console/API access.** Vercel-managed Neon projects do not give normal Neon account
   access — the Neon CLI needs an API key that the Marketplace flow does not surface. Work item 8
   requires a least-privilege connection role rather than the project's admin role, and creating a
   role needs console/SQL access to the project. That item was blocked as a direct result.
2. **Test isolation.** `docs/decisions/2026-08-25-tests-never-touch-the-application-database.md`
   established that live tests must target a separate database. Doing that cleanly is easier with
   ordinary Neon projects the maintainer controls directly.

## Decision

Run Postgres on a standalone Neon project, created directly on Neon and not through the Vercel
Marketplace. `DATABASE_URL` is set as an ordinary Vercel environment variable pointing at it.

Executed 2026-08-25, in this order, with verification at each step:

1. Verified the new project (`lemn-conf-v2`, eu-central-1, pooled connection) connects, ran
   `runMigrations()` against it, and proved a real round trip
   (`save(null, KITCHEN_L_DESIGN)` → `load` → identical canonical serialisation), then deleted the
   probe row.
2. Confirmed the outgoing database held the `designs` table with **0 rows** — no data to migrate.
   Nothing had ever been written to it except test rows, already removed.
3. `vercel integration-resource disconnect neon-gray-elephant` — dropped its injected variables,
   leaving only `BLOB_READ_WRITE_TOKEN` in the Vercel environment.
4. `vercel env add DATABASE_URL` for Production and Development, reading the value from a local
   gitignored file so it was never echoed.
5. `vercel env pull` — `.env.local` now carries only `BLOB_READ_WRITE_TOKEN`, `DATABASE_URL`, and
   `VERCEL_OIDC_TOKEN`, and resolves to the standalone project.
6. Full workspace suite green (278 tests) against the new configuration, with the app database and
   the test database confirmed distinct and the isolation guard passing.
7. `vercel integration-resource remove neon-gray-elephant` — deleted the superseded resource.

Vercel Blob (`lemnaria-designs-backups`, private) is unaffected and stays Vercel-native; it is
storage for the backup job, not a database, and has no equivalent lock-in concern.

## Consequences

- **Work item 8 is now unblocked.** With full Neon console access, an `app_designs` role holding only
  `SELECT, INSERT, UPDATE` on `designs` can be created and `DATABASE_URL` repointed at it. The
  application currently still connects as the project owner role (`lemn-conf-v2-boss`), so **work
  item 8 remains open** — the blocker is removed, the work is not done.
- **Billing and lifecycle move to Neon directly**, out of Vercel's unified billing.
- **Nothing auto-provisions env vars any more.** A future environment (a new Vercel project, CI) has
  to be given `DATABASE_URL` explicitly. `.env.example` should document this.
- **Preview environment is not yet set.** `vercel env add DATABASE_URL preview` fails on this
  machine's Vercel CLI (54.2.0) with a `git_branch_required` prompt that `--yes` does not satisfy —
  a CLI-version issue, not a project one. Production and Development are set. Preview deployments
  will have no database until this is added, via the dashboard or after upgrading the CLI
  (59.5.0 is current).

## Alternatives considered

- **Stay on Vercel-managed Neon and obtain a Neon API key** to unblock role creation. Rejected: it
  keeps a layer of indirection over a resource we need direct control of, for no benefit once the
  database is no longer being auto-provisioned as part of a template flow.
- **Migrate later, after M2 closes.** Rejected: the outgoing database had zero rows, making this the
  cheapest possible moment. Every later migration would have real customer designs to move.
