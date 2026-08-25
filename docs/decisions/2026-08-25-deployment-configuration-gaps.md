# 2026-08-25 — Deployment configuration is not yet set up; the backup cron will not fire as-is

Recorded during M2 Wave 2B. Nothing here is broken today — the project has **never been deployed**
(`vercel ls` reports no deployments) — but each item below silently prevents something from working
the first time it is.

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
