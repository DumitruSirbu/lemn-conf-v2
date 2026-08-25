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

| File | Holds | Notes |
| --- | --- | --- |
| `.env.local` | `DATABASE_URL` | The application's least-privilege role. `vercel env pull` rewrites this file wholesale. |
| `.env.migration.local` | `MIGRATION_DATABASE_URL` | Privileged owner role. Migrations only — the app role deliberately cannot run DDL. |
| `.env.test.local` | `TEST_DATABASE_URL` | The dedicated test database. Read first by `load-env.ts`, so it wins. |
| `.env.prod.local` | Production and preview owner/app URLs | Operator use. Never read by the application. |
| `.env.example` | Key names only, no values | Tracked in git; the others are covered by `.gitignore`'s `.env*.local`. |

Put overrides in the specific file, **not** `.env.local` — `vercel env pull` would discard them.

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
