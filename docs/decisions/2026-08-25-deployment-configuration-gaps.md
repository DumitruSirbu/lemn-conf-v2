# 2026-08-25 — Deployment configuration is not yet set up; the backup cron will not fire as-is

Recorded during M2 Wave 2B. Nothing here is broken today — the project has **never been deployed**
(`vercel ls` reports no deployments) — but each item below silently prevents something from working
the first time it is.

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
`docs/decisions/2026-08-25-least-privilege-database-role.md`). Preview is unset: the Vercel CLI on
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
