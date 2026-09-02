# ADR 0054 — Local development writes to `lemn-conf-v2-preview`, not production or staging

Status: Accepted
Date: 2026-09-02
Type: Finding + Decision
Milestone: Infrastructure — local development environment

## Context

The owner ran `pnpm dev` and every request failed: `DATABASE_URL environment variable is not set`,
thrown from `readRequiredUrl` (`packages/persistence/src/read-database-url.ts:4`), via
`readDatabaseUrl` → `new NeonConfigurationRepository`
(`packages/persistence/src/neon-configuration-repository.ts:116`) → `getRepository`
(`apps/web/src/lib/server/repository.ts:15`) → `POST` (`apps/web/src/app/api/designs/route.ts:15`).

**Root cause.** `.env.local` existed at the **repository root**, written there by `vercel env pull`,
but `next dev` runs with cwd `apps/web` and Next.js loads `.env*.local` only from its own project
directory — it does not walk up to a monorepo root. `DATABASE_URL` was genuinely unset in the server
process. Confirmed by observation: with no `apps/web/.env.local`, `next dev` printed no
`Environments:` line; once the file existed, it printed `Environments: .env.local`.

`packages/persistence/src/load-env.ts` (`loadEnvLocal()`) does read the repo-root env files, but it
is called only from `apps/web/playwright.config.ts` and the `migrate.ts` CLI — never from the
application server. That is why the e2e suite and migrations worked while `next dev` did not; nothing
about this decision changes `load-env.ts` or its callers.

### The env files, and which database each names

No file below records a credential, password, token or connection string — names only.

| File | Location | Variable | Database | Role |
| --- | --- | --- | --- | --- |
| `.env.local` | repo root, managed by `vercel env pull` | `DATABASE_URL` | `lemn-conf-v2` (production) | `app_designs` |
| `.env.migration.local` | repo root | `MIGRATION_DATABASE_URL` | `lemn-conf-v2` (production) | `lemn-conf-v2-boss` |
| `.env.test.local` | repo root | `TEST_DATABASE_URL` | `lemn-conf-v2-staging` | `staging-boss` |
| `.env.prod.local` | repo root, reference copies only | `OWNER_DATABASE_URL` / `APP_DATABASE_URL` | `lemn-conf-v2` | `lemn-conf-v2-boss` / `app_designs` |
| | | `PREVIEW_OWNER_DATABASE_URL` / `PREVIEW_DATABASE_URL` | `lemn-conf-v2-preview` | `lemn-conf-v2-boss` / `app_designs` |
| `apps/web/.env.local` (**new**) | `apps/web`, the directory `next dev` reads | `DATABASE_URL` | `lemn-conf-v2-preview` | `app_designs` |

`apps/web/.env.local` is gitignored by `.gitignore:8` (`.env*.local`), so this file exists only on
the machine it was created on and must be recreated the same way on any other.

## Decision

**Local development (`pnpm dev`) writes to `lemn-conf-v2-preview`**, through a new
`apps/web/.env.local` naming that database and the `app_designs` role — the same least-privilege role
production runs as (ADR 0008).

### Options considered

1. **Point at production (`lemn-conf-v2`).** Rejected. This is what the first attempted fix did — a
   symlink from `apps/web/.env.local` to the repo-root file. The `app_designs` role cannot
   DELETE/DROP/TRUNCATE (ADR 0008), so nothing could be destroyed, but a dev session inserts junk
   rows into the real `designs` table and a `PUT /api/designs/{id}` against a real id would overwrite
   a customer's design.
2. **Point at the test database (`lemn-conf-v2-staging`).** Briefly used, then rejected on two
   grounds:
   - **Schema churn, not row deletion, is the disqualifier.** The live persistence suites mutate the
     `designs` table's own schema mid-run:
     `packages/persistence/tests/neon-configuration-repository.test.ts:665` does
     `alter table designs drop column if exists revision`;
     `neon-configuration-repository.adversarial.test.ts:550` does
     `alter table designs drop column if exists write_token_hash`;
     `tests/support/migration-ledger-probe.ts:33` does
     `drop table if exists schema_migrations`. A dev server pointed there while
     `pnpm ci:local` runs would see columns vanish mid-session.
   - `.env.test.local` carries the **owner** role (`staging-boss`), breaking parity with production's
     `app_designs` — a query needing DELETE or DDL would pass in dev and fail in production, the
     opposite of what ADR 0008 exists to catch.
   - ADR 0006's 2026-08-31 amendment states nothing but the destructive test suites may use
     `lemn-conf-v2-staging`; dev use would have required amending that rule.
   - A secondary, corrected finding while investigating this option: the comment in
     `packages/persistence/src/test-database-url.ts` (around lines 20–28) says *"every live-suite run
     deletes design rows from it"*. Read narrowly it is accurate — every deletion in
     `packages/persistence/tests/` and `delete-designs-for-tests.ts` is id-scoped to rows the suite
     itself minted (`delete from designs where id = ${id}` / `= any(${ids})`), never a blanket wipe —
     but the comment does not say so, and a reader could over-read "deletes design rows" as "may
     truncate the table." The **schema churn** above, not row deletion, is what actually disqualifies
     this database for dev use. Left as a recommendation below; this record changes no code.
3. **A new dedicated `lemn-conf-v2-dev` Neon branch.** Rejected by the owner: **the Neon free tier's
   child-branch limit is already reached** by production, staging and preview. This constraint is not
   written down anywhere else in the repository, and is exactly the kind of thing a future session
   might otherwise try to "fix" by provisioning a fourth branch. It is the binding constraint on this
   option, not a preference.

### Why preview wins

Per [ADR 0009](0009-deployment-configuration-gaps.md), `lemn-conf-v2-preview` is a dedicated Neon
branch, its own endpoint host, its own database, and — decisively — its own least-privilege
`app_designs` role, the same role production runs as. It costs no new branch, no test suite touches
it (so no schema churn), and it preserves the ADR 0008 privilege parity that staging use would have
broken.

**Accepted cost.** Preview deploys — unreviewed branch code — write to the same database, so dev rows
and preview-deploy rows mingle. Both are non-production and neither can delete (the `app_designs`
role holds only `SELECT, INSERT, UPDATE`), so this was accepted rather than mitigated.

## A second, independent finding — preview was three migrations behind

The first mint against preview failed: `NeonDbError: column "write_token_hash" of relation "designs"
does not exist` (code 42703). `lemn-conf-v2-preview` had never been migrated past the initial table.
The owner then ran the migration, which reported: applied `0001_create_designs.sql`,
`0002_add_write_token_hash.sql`, `0003_check_write_token_hash_shape.sql`,
`0004_add_design_revision.sql` against `lemn-conf-v2-preview` (0 already applied).

Two consequences:

- **Vercel preview deploys had been broken since `0002` landed**, failing the same way. Nothing had
  exercised them, so it went unnoticed until this session. Fixing dev fixed preview deploys as a side
  effect.
- **Nothing in the deployment process migrates preview.** Production is migrated deliberately (ADR
  0020, ADR 0042); preview evidently never was. This is a real gap, not a closed item — see the
  amendment to ADR 0009 and the `docs/BACKLOG.md` entry below.

## Verification actually performed

- Against staging (the intermediate step, before this decision was reached): `POST /api/designs` →
  `201`, body `{"id":"DTQQbxjXGwQ6KWp38Zthj","revision":"1"}`.
- Against preview before migrating: `500`, the `42703` error above.
- Against preview after migrating: `201`, body `{"id":"Oc6YN0wm00bD4DecMUHIf","revision":"1"}`, no
  errors in the dev-server log.
- `pnpm ci:local` was run at the start of this session on a clean `main` at commit `e173cfc`: all nine
  gates PASS (unrelated to this change — recorded as the baseline this session started from).

**Not verified:** row counts in any database (a `psql` read was blocked by the sandbox), and whether
the stray verification rows still exist. Three test rows were created this session — one in staging,
one or two in preview, **none in production**. The `app_designs` role cannot delete them.

## Alternatives considered

Covered above under "Options considered" — production, staging and a new branch were each evaluated
against this decision and rejected for the reasons given there, rather than left unconsidered.

## Consequences

- `apps/web/.env.local` must exist locally, gitignored, naming `lemn-conf-v2-preview`/`app_designs`,
  for `pnpm dev` to run at all. `.env.example` now documents this (see below), closing the gap that
  caused the original error.
- Dev-session rows and preview-deploy rows share one database. Neither route can delete, so this is a
  clutter cost, not a data-safety one.
- Preview is not covered by any migration process today. This decision fixed the immediate breakage
  by running the migration once, by hand; it does not add automation, and the next migration that
  ships will recreate the same breakage on both preview deploys and local dev unless that gap is
  closed first. See the amendment to [ADR 0009](0009-deployment-configuration-gaps.md) and
  `docs/BACKLOG.md`.
- The `packages/persistence/src/test-database-url.ts` comment described above is accurate but reads
  more broadly than it is — a clarifying word (naming the deletions as id-scoped, not a truncation) is
  recommended to whoever next touches that file. This record does not make that change; it is markdown
  only.

## Records swept before deciding, and how each is settled

Checked before writing this record, per the owner's standing instruction:

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0006](0006-tests-never-touch-the-application-database.md) and its 2026-08-31 amendment | Governs `lemn-conf-v2-staging`. | **Read and honoured.** Option 2 above is rejected partly because using it for dev would need to amend this ADR's operative constraint. |
| [ADR 0008](0008-least-privilege-database-role.md) | Establishes `app_designs` as the least-privilege role. | **Extended, not replaced.** This decision extends the same role to local development rather than introducing a new one. |
| [ADR 0009](0009-deployment-configuration-gaps.md) | Establishes `lemn-conf-v2-preview` and its own `app_designs` role. | **Amended alongside this record** to add the local-dev use and the unmigrated-preview gap. |
| *(none)* | No earlier record states or implies a local-development database target. | **First decision on the question** — nothing to reconcile. |
