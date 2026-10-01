# ADR 0008 — The application connects as a least-privilege role, not the database owner

Status: Accepted (the "Still open" Preview item is superseded by ADR 0009)
Date: 2026-08-25
Type: Decision
Milestone: M2 Wave 2B

Satisfies M2 work item 8's "least-privilege connection role" requirement
(`docs/milestones/M2-void-engine.md`, "Security and backups"), and resolves the "Still open" item
left in ADR 0006 and the "work item 8 remains open" consequence left in ADR 0007.

## Context

Until now the application connected as the Neon project's owner role — first `neondb_owner` on the
Vercel-managed project, then `lemn-conf-v2-boss` after the move to a standalone project
(`docs/decisions/0007-standalone-neon-instead-of-vercel-managed.md`). Both are effectively
administrative: they can drop tables, truncate data, create roles, and reach every table in the
database, including the contact table M8 will add.

The realistic threat is not SQL injection — every query goes through parameterised tagged templates
and a test pins that no TLS downgrade or string-built SQL exists. It is **credential exposure**: a
leaked environment variable, or a compromised dependency reading `process.env`. With owner
credentials that is total loss; with a scoped role it is bounded.

## Decision

The application connects as `app_designs`, holding exactly `SELECT, INSERT, UPDATE` on
`public.designs` and nothing else.

**Created with SQL, deliberately.** Roles created through the Neon Console, CLI, or API are
automatically granted membership in `neon_superuser` (verified against Neon's documentation,
2026-08-25); only SQL-created roles avoid it. Creating this role through the console's Roles tab
would have produced an administrative role wearing a least-privilege name — the failure mode this
decision exists to prevent.

```sql
CREATE ROLE app_designs WITH LOGIN PASSWORD '<generated>';
GRANT CONNECT ON DATABASE "lemn-conf-v2" TO app_designs;
GRANT USAGE ON SCHEMA public TO app_designs;
GRANT SELECT, INSERT, UPDATE ON TABLE public.designs TO app_designs;
```

**`DELETE` is deliberately withheld.** The application never deletes a design: M2 has no deletion,
and retention is a recorded "keep indefinitely" placeholder. Withholding it means a bug, or an
attacker holding the application's credentials, cannot destroy a customer's design at all. Grant it
when a feature actually needs it, not pre-emptively.

## Consequence: migrations need their own connection

`app_designs` has no DDL rights, so it cannot run migrations — correct, and the point. Migrations
read `MIGRATION_DATABASE_URL` (the owner connection) via `readMigrationDatabaseUrl()`, kept in
`.env.migration.local` rather than `.env.local`, which `vercel env pull` rewrites wholesale.

There is **no fallback** from `MIGRATION_DATABASE_URL` to `DATABASE_URL`: a fallback would silently
undo the privilege separation, and would surface later as a confusing permission error rather than
an explicit one at the point of misconfiguration.

Applying migrations is now a deliberate operator action (`pnpm --filter @lemnaria/persistence run
migrate`) rather than something the running application can do — which is itself a security
improvement, not just a consequence.

## Verified, not asserted

`packages/persistence/src/application-role-privileges.test.ts` runs against whatever `DATABASE_URL`
actually points at and asserts, on the live database:

- the role inherits **no** other role (catches the `neon_superuser` trap),
- `rolsuper`, `rolcreatedb` and `rolcreaterole` are all false,
- its grants on `designs` are exactly `INSERT, SELECT, UPDATE`,
- `DELETE`, `TRUNCATE`, `DROP TABLE` and `CREATE TABLE` are each **refused**,
- `SELECT` still works, so the restrictions have not broken the application.

All eight pass. The test fails if the application is ever repointed at an owner-level connection or
the role is granted more than it needs — a security property nothing checks is one that quietly
decays.

## Incident during setup

The first `app_designs` password ended with `%`, which is an invalid percent-escape and broke the
driver's URL parsing. The resulting driver error printed the full connection string, password
included, into the working session's transcript. The password was rotated to a 64-character
alphanumeric value (`openssl rand -hex 32`) before the credential was put into use anywhere.

Two lessons recorded rather than left implicit: generate database passwords as alphanumerics only,
since connection strings are URLs and symbols require encoding; and redact connection strings from
command output *before* running the command, not after a failure has already printed one.

## Still open

- ~~**Preview environment has no `DATABASE_URL`.**~~ Resolved later the same day, 2026-08-25.
  Preview now has its own `DATABASE_URL` pointing at a dedicated Neon branch (`preview`) with its own
  database (`lemn-conf-v2-preview`) and its own least-privilege `app_designs` role, verified to
  enforce the same restrictions as production. The requirement recorded here — a *separate* database,
  not production and not the test database — was met as stated. See
  `docs/decisions/0009-deployment-configuration-gaps.md` § "Status", which is authoritative on
  the current environment layout.
- **M8's contact table** will need its own grant decision. It holds personal data, and
  `app_designs` should receive only the privileges the contact flow genuinely needs — very likely
  `INSERT` alone.

## Note — 2026-09-23: a second table, the same three privileges

M7 wave 7E3c adds `design_share_links` (migration `0006`). By this record's *"grant it when a feature actually needs it"*, `app_designs` receives **`SELECT, INSERT, UPDATE`** on it — and still **no `DELETE`**. The decision's *"on `public.designs` and nothing else"* now reads *on `designs` and `design_share_links`, and nothing else*. The grant is issued by the owner, after the migration and before the deploy, as the original grant was. `application-role-privileges.test.ts` asserts the exact set whenever the table exists. See [ADR 0114](0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md) Amendment G3.
