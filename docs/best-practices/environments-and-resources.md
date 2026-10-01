# Environment variables and provisioned resources

**Read this when:** touching any environment variable, secret, database, Blob store, or other
provisioned resource — in Vercel, Neon, GitHub, or a local `.env*.local` file.

## Hard rule — add-only

**Never remove or overwrite an environment variable, and never delete a provisioned resource.
Adding is the only permitted operation.** This applies to `vercel env rm`, `vercel env add` over an
existing name, `vercel blob delete-store`, `vercel integration-resource remove`, and any equivalent
dashboard action or API call.

If something appears wrong — a variable is scoped too broadly, holds a stale value, or a resource is
unused — **report it and let the human decide**. Do not fix it by removing.

Why this is absolute rather than a preference:

- **The values cannot be read back.** Vercel marks Production and Preview variables sensitive by
  default, so `vercel env pull` returns them empty. A deletion is therefore _irreversible by the
  agent_: there is no way to restore what was there.
- **The commands are not symmetric.** `vercel env add NAME <env>` scopes the addition to that
  environment, but `vercel env rm NAME <env>` **deletes the variable across every environment** and
  ignores the argument. A removal intended to narrow a scope destroys the whole variable. This
  actually happened on 2026-08-25: an attempt to unscope `CRON_SECRET` from Preview removed it from
  Production too, and the value could not be recovered.
- **Failures are silent and delayed.** A missing variable usually does not break a build; it breaks
  a scheduled job or a request path later, in an environment nobody is watching.

Narrowing a scope, rotating a secret, or retiring a resource are all human decisions. Prepare the
exact commands or dashboard steps and hand them over.

`.claude/settings.json` carries `permissions.deny` rules for the destructive Vercel commands, so the
rule is enforced and not only documented.

## Never print a secret

A connection string printed into a transcript is leaked and must be rotated. When inspecting
environment files or debugging a driver error, print **key names, lengths, and parse results** —
never values. Pipe through a redaction filter when a command may echo a URL in an error message.

This has already gone wrong once: on 2026-08-25 a driver error printed a full production connection
string including its password, forcing a rotation.

## Which file holds what

**There are two files named `.env.local`, at two different paths, pointing at two different
databases — this is the single most common source of confusion in this repo and has caused a real
incident (below).** `next dev` reads env only from `apps/web/` (its own project directory) and never
walks up to the repo root, while `vercel env pull` (run from the repo root) always rewrites the
repo-root file. Neither tool touches the other's file.

| File | Holds | Neon branch | Notes |
| --- | --- | --- | --- |
| **repo-root** `.env.local` | `DATABASE_URL`, `VERCEL_OIDC_TOKEN` | **`lemn-conf-v2` — PRODUCTION** | Written by `vercel env pull`, which manages Vercel's **Development** environment variables — meaning Vercel's own dashboard has `DATABASE_URL` for "Development" set to production. `next dev`/`pnpm dev` never reads this file. Do not repoint local dev at it. |
| **`apps/web/.env.local`** | `DATABASE_URL` | **`lemn-conf-v2-preview`** | What the dev server (and this checkout's e2e runs against a `next start`) actually reads. Has its own header comment explaining the split — read it before assuming "`.env.local`" means the repo-root file. |
| `.env.migration.local` | `MIGRATION_DATABASE_URL` | **`lemn-conf-v2` — PRODUCTION**, owner role | The **only** migration credential in this checkout right now. Migrations only — the app role deliberately cannot run DDL. |
| `.env.test.local` | `TEST_DATABASE_URL` | `lemn-conf-v2-staging`, owner role | The dedicated test database. Read first by `load-env.ts`, so it wins. Despite the name, not a staging *deployment* environment — see the file's own header. |
| `.env.prod.local` | `OWNER_DATABASE_URL`/`APP_DATABASE_URL` (production), `PREVIEW_OWNER_DATABASE_URL`/`PREVIEW_DATABASE_URL` (preview) | production + preview | Operator reference only. Never read by any script. The only place an owner-role credential for `lemn-conf-v2-preview` exists — needed to migrate or grant on preview, since `.env.migration.local` can't reach it. |
| `.env.example` | Key names only, no values | — | Tracked in git; the others are covered by `.gitignore`'s `.env*.local`. Its own comments are the fullest explanation of this split — read it first if any of the above is unclear. |

Put overrides in the specific file, **not** `.env.local` — `vercel env pull` would discard them.

**The `migrate`/`migrate:status <environment>` argument is a required declaration, never a database
selector — and both commands now refuse a mismatch instead of merely printing one.**
`pnpm --filter @lemnaria/persistence run migrate preview` does **not** migrate
`lemn-conf-v2-preview` — it targets whatever `MIGRATION_DATABASE_URL` currently is (production, per
the table above). The credential remains the sole selector (ADR 0096 decision 4: the tool refuses to
guess an environment, so it makes you declare one). What changed is what happens when the declared
label and the credential disagree.

**Incident, 2026-09-28:** an agent session read `preview` as a selector, ran `migrate preview`, and
applied migrations 0005/0006 to production ahead of the documented "preview then production" order
(additive, no data lost, but done without a fresh go-ahead for production specifically). At the time,
`migrate` did not read its argument at all — `preview` was ignored twice over, once by design (the
credential selects the database) and once because the CLI never even inspected `process.argv`. Only
`migrate:status` read and printed the label, beside the database name, for a human to compare — and
that comparison depended on someone reading the output and noticing a mismatch, which did not happen.

**Fixed, same day (`migration-environment-safety-check.md`):** both `migrate` and `migrate:status`
now require the `<environment>` argument and **check it before connecting or reading anything.**
`assertDeclaredEnvironmentReaches` in `packages/persistence/src/migration-target.ts` compares the
declared label against the database name the credential actually reaches, using
`DATABASE_NAMES_BY_ENVIRONMENT` (`production` → `lemn-conf-v2`, `preview` → `lemn-conf-v2-preview`,
`test` → the existing `ALLOWED_TEST_DATABASE_NAMES`). A label outside that map is accepted only if it
is the database's own exact name and no listed environment already claims that name — the escape
hatch a one-off restore-drill database needs, with no code change. On any other mismatch, both
commands exit non-zero having run and read nothing, and the refusal message never contains a URL,
host or credential.

**Known limit:** a database name is not an identity. A Neon branch forked from production keeps the
name `lemn-conf-v2`, so the check cannot tell it from production and demands the label `production`
to run against it — a tripwire against a label and credential disagreeing, not proof of which Neon
branch was reached.

To actually reach preview, pass `PREVIEW_OWNER_DATABASE_URL` (from `.env.prod.local`) as
`MIGRATION_DATABASE_URL` for that one invocation, with the argument `preview` — never edit
`.env.migration.local` to do it.

## Test-database isolation

`resolveTestDatabaseUrl` refuses to run the live suite if its target resolves to the same database
as `DATABASE_URL`. Live tests write and delete rows, so a suite pointed at the application database
is one bad `delete` away from destroying real designs. The guard fails loudly rather than letting a
misconfiguration run.

`TEST_DATABASE_URL` may stand alone with no `DATABASE_URL` present — that is how CI runs it, where
no application database exists to collide with. Whenever `DATABASE_URL` is set, the comparison is
enforced.

See `docs/decisions/0006-tests-never-touch-the-application-database.md` and
`docs/decisions/0008-least-privilege-database-role.md`.
