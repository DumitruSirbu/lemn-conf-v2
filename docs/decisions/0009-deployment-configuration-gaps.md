# ADR 0009 — Deployment configuration is not yet set up; the backup cron will not fire as-is

Status: Accepted
Date: 2026-08-25
Type: Finding + Decision
Milestone: M2 Wave 2B

> **Amended 2026-09-02.** This record's "Verification once deployed" section checked only that the
> backup cron registers; it never checked that Preview's schema was current, and it wasn't — three
> migrations behind since `0002` landed, found while wiring [ADR 0054](0054-local-development-writes-to-the-preview-database.md).
> See the "Amendment, 2026-09-02" section at the bottom of this file for the full record.

Recorded during M2 Wave 2B. Nothing here is broken today — the project has **never been deployed**
(`vercel ls` reports no deployments) — but each item below silently prevents something from working
the first time it is. Resolves the "Preview environment has no `DATABASE_URL`" item left
"Still open" in ADR 0008.

## Status — all four items resolved 2026-08-25

Items 3 and 4 closed alongside 1 and 2. `CRON_SECRET` is set for Production, so the backup endpoint
can authenticate Vercel's cron calls; it is deliberately **not** set for Preview, which means the
endpoint fails closed there — a preview deploy cannot run a backup even if someone found the route.

Preview has its own `DATABASE_URL`, pointing at a dedicated Neon branch (`preview`) with its own
database (`lemn-conf-v2-preview`) and a least-privilege `app_designs` role. Verified to enforce the
same restrictions as production: no inherited roles, no `super`/`createdb`/`createrole`, exactly
`INSERT, SELECT, UPDATE` on `designs`, and `DELETE`/`DROP`/`CREATE`/`TRUNCATE` all refused. That
parity is the point — a preview environment more permissive than production hides exactly the
privilege bugs it exists to catch.

Production and Preview variables are marked sensitive by Vercel's default, so their values cannot be
read back (`vercel env pull` returns them empty); only Development is readable. Their correctness is
therefore confirmed by the first deploy, not by inspection.

## Original status — items 1 and 2 resolved 2026-08-25

`vercel project inspect` now reports Root Directory `apps/web` and Framework Preset `Next.js`, with
"include files outside the root directory in the Build Step" enabled — required here, because
`apps/web` depends on three workspace packages that live outside its root. `apps/web/vercel.json` is
therefore in a location Vercel reads, so the cron declaration will register.

`apps/web`'s `build` script is `pnpm run build:deps && next build`, and Vercel's Next.js preset runs
the package.json `build` script when one exists. That matters: `dist/` is gitignored, so the
workspace packages must be compiled during the deploy, and `build:deps` is what does it. No Build
Command override is needed.

**Items 3 and 4 below remain open.**

## 1. `vercel.json` is not where Vercel will look for it

Vercel reads `vercel.json` from the project's configured **Root Directory**. That setting is
currently `.` (the repository root), but the file was written to `apps/web/vercel.json` on the
reasonable assumption — from Vercel's own monorepo guidance — that a pnpm workspace with a Next app
in `apps/web` would have its Root Directory set there. This project's has not been changed from the
default.

Consequence: the `crons` declaration would be ignored, and **the daily backup would silently never
run**. A backup that never runs looks exactly like a backup that runs and succeeds, until a restore
is needed.

## 2. Framework Preset is "Other", not Next.js

`vercel project inspect` reports Framework Preset "Other" and Output Directory "`public` if it
exists, or `.`". A Next.js App Router application will not build or serve correctly under those
settings.

## Fix — one decision, then both follow

The conventional setup for this repository's shape, and the one Vercel's monorepo documentation
describes, is:

- **Root Directory** → `apps/web`
- **Framework Preset** → Next.js

Making that change (Vercel dashboard → Project → Settings → Build & Deployment) puts
`apps/web/vercel.json` exactly where Vercel expects it, and fixes the build at the same time. No
file needs to move.

The alternative — keeping Root Directory at `.` and moving `vercel.json` to the repository root —
fixes only the cron and leaves the framework preset wrong, so it is not recommended.

This was left as a settings change rather than applied automatically: it alters how the project
builds and deploys, and the framework preset should be corrected in the same pass rather than
piecemeal.

## 3. Preview environment has no `DATABASE_URL`

Production and Development are set (to the least-privilege `app_designs` role — see
`docs/decisions/0008-least-privilege-database-role.md`). Preview is unset: the Vercel CLI on
this machine (54.2.0; 59.5.0 is current) rejects `vercel env add DATABASE_URL preview` with a
`git_branch_required` prompt that `--yes` does not satisfy.

If Preview is given a database it should be a **separate** one — not production, and not the test
database. Preview deploys run unreviewed branch code, which is the code most likely to write
something wrong, and the test database is periodically emptied by the live test suite.

## 4. `CRON_SECRET` is not set anywhere

`isAuthorizedCronRequest` fails closed when `CRON_SECRET` is unset, so the backup endpoint will
reject every request — including Vercel's own cron invocations — until the variable exists in the
Vercel environment. Generate it as alphanumeric-only (`openssl rand -hex 32`) and set it for
Production.

## Verification once deployed

The cron's registration is observable: after a production deploy, the Vercel dashboard's Cron Jobs
tab lists declared jobs. If `/api/cron/backup-designs` does not appear there, item 1 above is still
unresolved regardless of what the repository contains.

## Amendment, 2026-09-02 — preview is also the local-development target, and it was unmigrated

Type: Decision + Finding
Context: [ADR 0054](0054-local-development-writes-to-the-preview-database.md), written the same day

**Preview's database now has a second consumer.** `lemn-conf-v2-preview`, provisioned above for
preview *deploys*, is now also where `pnpm dev` writes locally — a new `apps/web/.env.local` (repo-root
`.env.local` is not read by `next dev`, which does not search a monorepo root; see ADR 0054 for the
full mechanism) points `DATABASE_URL` at it, using the same `app_designs` role this record already
verified. ADR 0054 records the decision and the two databases (production, the destructive test
database) rejected in its favour; this amendment records only the consequence for *this* record's
subject — preview's database and its deployment posture.

**Preview had never been migrated, and nothing in the deployment process migrates it.** The first
write attempted against it under ADR 0054 failed — `column "write_token_hash" of relation "designs"
does not exist` — because `lemn-conf-v2-preview` was still at the schema `0001_create_designs.sql`
left it in. It was migrated by hand that day, applying `0002_add_write_token_hash.sql`,
`0003_check_write_token_hash_shape.sql` and `0004_add_design_revision.sql`. **This means every Vercel
preview deploy had been failing the same way since `0002` landed**, unnoticed because nothing had
exercised a preview deploy's write path until ADR 0054's session did.

**This record's own verification section did not catch it, and that is worth stating rather than
quietly patching.** "Verification once deployed" above only checks that the cron job registers — it
never asked whether preview's schema matches what the application code expects. Provisioning the
database and role was verified in 2026-08-25; keeping its schema current was not, and nothing has
owned that since.

**Open obligation, not yet closed by this amendment.** Production is migrated deliberately (ADR 0020,
ADR 0042); preview is migrated only when someone happens to notice it is stale, as happened here. The
next migration that ships will recreate this exact breakage — on preview deploys and on local
development alike — unless a migration step is added to the preview deploy process before then. Recorded
also in `docs/BACKLOG.md`.
