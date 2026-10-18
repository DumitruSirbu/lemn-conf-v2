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

**A second instance, 2026-10-01 (M7C visual pass), and a dispatch rule that follows from it.** The
visual agent deleted 36 test-database designs it had minted itself and, in a later run, printed the test
`DATABASE_URL` into its own session output [relayed by the coordinator; the session output was not
re-read]. The owner was told and said *"no worries about db credentials"*. That is the owner's
judgment of this one value, not a change to the rules above: the add-only rule and *Never print a secret*
stand as written. **Every brief that lets an agent touch a database or run a browser suite must ban,
by name, deleting rows and printing environment values.** An agent that does not see the rule in its brief
works from its own idea of "cleaning up after itself". This note lives here rather than in the backlog
because it is a standing rule for dispatch; the backlog holds product behaviour (`docs/BACKLOG.md`).

## Which file holds what

**There are two files named `.env.local`, at two different paths, pointing at two different
databases — this is the single most common source of confusion in this repo and has caused a real
incident (below).** `next dev` reads env only from `apps/web/` (its own project directory) and never
walks up to the repo root, while `vercel env pull` (run from the repo root) always rewrites the
repo-root file. Neither tool touches the other's file.

| File | Holds | Neon branch | Notes |
| --- | --- | --- | --- |
| **repo-root** `.env.local` | `DATABASE_URL`, `VERCEL_OIDC_TOKEN` | **`lemn-conf-v2-preview` — the PREVIEW database's application role (`app_designs`), since 2026-10-08** | Written by `vercel env pull`, which manages Vercel's **Development** environment variables. ~~Vercel's dashboard had `DATABASE_URL` for "Development" set to production.~~ **Corrected 2026-10-08:** the owner changed Vercel's Development `DATABASE_URL` and pulled it again; the coordinator then ran the privilege test alone and it printed `reached database "lemn-conf-v2-preview" as role "app_designs"`, 10 passed, 1 skipped, exit 0 [coordinator-run, relayed]. The skip is reported to be the `rate_limit_counters` grant test, because the table is not on preview either. `next dev`/`pnpm dev` never reads this file. **The persistence suite does read it** (`load-env.ts`, via `vitest.config.ts`), so it **no longer reaches production from this machine** by default. **Production's grants are checked only by a deliberate run per [the runbook](../runbooks/applying-a-table-migration-and-its-application-role-grant.md)**, with the production application role in `DATABASE_URL` for that one invocation. Before this correction `tests/application-role-privileges.test.ts` reached production on every run: since M8 wave 8E (`98b1f6b`, [ADR 0149](../decisions/0149-the-rate-limit-store-keeps-one-row-per-bucket-per-window-refuses-a-broken-promise-and-may-count-high-but-never-low-between-prunes.md) decision 5) with catalog reads and two guarded deletes of a row that does not exist, and before that with `truncate`, `drop` and `create` statements that passed because the role was refused. **Never run the suite with an owner or migration credential in `DATABASE_URL`.** `vercel env pull` also appended `.env*` to `.gitignore` on 2026-10-08; that uncommitted line is the owner's to keep or drop (backlog 142). |
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

**What a test may delete from a database (owner, 2026-10-08).** The owner's words, relayed: *"If were added by tests ,
delete , if added by production user keep"*. A test may delete rows that tests added; a row a real user added is never
deleted. This qualifies the add-only rule above **for rows only**; variables and resources stay add-only. Working form:

- On the guarded test database a row is a test's by a marker only tests write, and the count removed is reported.
- On any database that holds users' rows, a test deletes only what it can show it added in that run.
- *How a row is known to be a test's is not ruled by the owner*; the two lines above are the architect's reading.
- A dispatch that lets an agent touch a database still bans deleting rows by name, unless it names this exception.

Record and reasons: [ADR 0151](../decisions/0151-a-test-may-delete-the-rows-tests-added-and-never-a-row-a-production-user-added.md).

See `docs/decisions/0006-tests-never-touch-the-application-database.md` and
`docs/decisions/0008-least-privilege-database-role.md`.

## Variables not yet set

**Proposed, not set.** Nothing here exists in any environment until the owner creates it, and no agent creates, reads or
prints it. This guide previously carried no such list; the plan's *Proposed variables* table is the fuller one.

### `DIGEST_SECRET` (decided by the owner 2026-10-08: *"lets add this secret"*, then *"lets use same secret"*)

- **What it is.** One secret that keys two digests: every rate-limit bucket key (8F, 8G, 8K) and the contact request's
  conflict digest (8I, 8K), kept apart by what is digested ([ADR 0149](../decisions/0149-the-rate-limit-store-keeps-one-row-per-bucket-per-window-refuses-a-broken-promise-and-may-count-high-but-never-low-between-prunes.md)'s
  amendment). Sixty-four lowercase hexadecimal characters.
- **How it is made.** The owner runs `openssl rand -hex 32` himself, once per environment, and pastes the result nowhere
  else. **A different value in each environment**, so one leaked from a preview opens nothing in production.
- **Where it must be set, before 8F merges.** Vercel **Production**, **Preview** and **Development**, and
  `apps/web/.env.local` for `pnpm dev`. Add-only, as every variable is. **From the day 8F's code runs in an environment,
  that environment creates no design until the variable is set there**; the code refuses (fails closed) when it is unset or
  not sixty-four hexadecimal characters, and never uses an unkeyed digest, a built-in key or a padded value.
- **Tests and CI need no real secret.** The e2e harness makes a fresh random value per run and hands it to the server; no
  literal exists in the repository.
- **Rotation has two consequences, to be accepted before it is done.** A contact request whose retry falls across the
  rotation is answered as a **conflict**, its stored row and notice untouched; and **every rate-limit count starts again**.
  The rule is: set a new value in that environment and deploy; nothing is migrated and there is no time with two keys. A
  runbook for the operation is [`replacing-the-digest-secret.md`](../runbooks/replacing-the-digest-secret.md) (written 2026-10-09).
- **Now read by code (wave 8F, 2026-10-09; [ADR 0155](../decisions/0155-the-mint-asks-a-keyed-per-day-per-network-limiter-first-and-refuses-what-it-cannot-judge-the-owner-names-the-network-source-and-a-destructive-mutant-never-touches-a-database.md)).**
  From the day 8F's code runs in an environment, **that environment creates no design until the variable is set there.** A pasted value
  ending in a line break reads *unavailable*, with only the variable's name to go on and every mint answering `503`. **After setting it,
  create one design there** to check.

### `CLIENT_NETWORK_SOURCE` and `LEMNARIA_E2E_RATE_LIMIT_POLICY` (wave 8F, 2026-10-09; names only; the owner's)

No agent sets, reads or prints either. [ADR 0155](../decisions/0155-the-mint-asks-a-keyed-per-day-per-network-limiter-first-and-refuses-what-it-cannot-judge-the-owner-names-the-network-source-and-a-destructive-mutant-never-touches-a-database.md)
has the rules; ~~`apps/web/.env.example`~~ the repo-root `.env.example` names both, commented, with no value (*corrected
2026-10-17: there is no `apps/web/.env.example`; the one tracked example file is at the repository root*).

- **`CLIENT_NETWORK_SOURCE`:** exactly `vercel`, set on a deployment on that platform **only**. **Never in a local file, on another host, or
  for the platform's development target.** It tells the application to trust the one header that platform overwrites for the client's
  address; set anywhere else it would trust a header the client wrote. **Unset:** *none*, one shared bucket, so the whole world shares 20
  designs a day (a named interim, acceptable only while nothing takes customers). **Anything else, present as a variable: every mint is
  refused.** It is never a variable a host sets for you.
- **`LEMNARIA_E2E_RATE_LIMIT_POLICY`:** test instrumentation, **unset on every deployment**; the phase gate checks that the name is defined
  on none, by name only. Beside `CLIENT_NETWORK_SOURCE` every mint is refused.

### The three mail variables and the e2e flag (wave 8J, 2026-10-09; names only; the owner's, and none is set by an agent)

> **Superseded in part, 2026-10-17 (wave 8J2, [ADR 0164](../decisions/0164-the-shops-notice-leaves-through-gmail-smtp-by-nodemailer-behind-the-unchanged-port-and-the-stored-mark-is-the-only-guard-against-a-second-notice.md)).**
> Resend is no longer the provider: the notice leaves through Gmail SMTP by nodemailer (the owner, 2026-10-15). The
> current names are in *The mail variables since 8J2* below. `RESEND_API_KEY` and `MAIL_FROM_ADDRESS` are **retired**:
> they configure nothing, but stay wherever they are set (add-only) and still stop the e2e flag taking effect. The list
> below is kept as it was written, struck where it no longer holds.

~~Resend is the provider (the owner, 2026-10-07).~~ Nothing here exists in any environment until the owner creates it, and no agent sets,
reads or prints one. [ADR 0154](../decisions/0154-mail-leaves-through-one-provider-neutral-port-and-one-resend-adapter-that-sends-once-and-answers-with-one-of-seven-kinds-and-the-shops-notice-is-the-stored-review-printed-never-priced-again.md)
has the rules; ~~`apps/web/.env.example`~~ the repo-root `.env.example` names them, commented, with no value.

- ~~**`RESEND_API_KEY`** (a secret). **Create it with sending access only**: a key with full access, leaked, reads thirty days of
  notices through the API. Never in the browser, never read at build.~~ *Retired 2026-10-17.*
- ~~**`MAIL_FROM_ADDRESS`**: a bare address on a domain the provider has verified (DNS records the owner adds). `Name <addr>` is
  refused.~~ *Retired 2026-10-17; the sender is now `GOOGLE_EMAIL`.*
- **`LEAD_NOTIFICATION_ADDRESS`**: the shop's inbox, exactly one address.
- **`LEMNARIA_E2E_FAKE_MAIL`**: test instrumentation, **unset on every deployment** (the phase gate checks that the name is in none).
  Beside any mail variable the server treats mail as unavailable, so a deployment set up to send cannot be turned to the fake by it.
- **A pasted value with a trailing newline reads *unavailable*;** the code names the variable and nothing of its value.
- **Where the owner sets them:** the three on the deployments that will send, add-only (which environments is the owner's; the launch
  gate requires them on production); the flag nowhere. **When they are unset:** mail is unavailable; the reader names the missing variables and no
  message is sent or claimed sent. Nothing calls the module yet (8K wires it).
- **On a machine whose `apps/web/.env.local` defines a mail name, the e2e contact specs will fail loudly by design** once 8K wires them;
  the rule is not weakened to mend that (an empty mail variable counts as present).

### The mail variables since 8J2 (2026-10-17; names only; the owner's, and none is set by an agent)

Gmail SMTP through nodemailer ([ADR 0164](../decisions/0164-the-shops-notice-leaves-through-gmail-smtp-by-nodemailer-behind-the-unchanged-port-and-the-stored-mark-is-the-only-guard-against-a-second-notice.md)
decision 2). All three or none: if any is missing or unusable, mail is *unavailable* and the reader names the variables,
never a value. The repo-root `.env.example` names them, commented, with no value [src: `.env.example:56-86`].

- **`GOOGLE_EMAIL`**: the sending Google account, exactly one bare address, on an account with 2-Step Verification. The
  notice leaves **from** it. A dedicated sending account is the recommended default (Q62, not yet answered).
- **`GOOGLE_APP_PASSWORD`** (a secret): that account's App password, pasted **without spaces** — a value holding a space
  reads *unavailable*; the code never strips it. It opens the whole mailbox, not only sending. Never printed, logged,
  read at build or put in a browser bundle. Changing the account's password revokes it [inf], and then it is made again.
- **`LEAD_NOTIFICATION_ADDRESS`**: the shop's inbox, the only recipient, exactly one address, never a customer's. **Its
  value is the owner's and is never written in the repository** (the owner, 2026-10-16).
- **`LEMNARIA_E2E_FAKE_MAIL`**: unchanged — unset on every deployment; beside any of the three names above **or the two
  retired ones** the server treats mail as unavailable.
- **Where the owner sets them:** Vercel **Production** and **Preview**, as sensitive, add-only; if a name already exists
  there, it is not overwritten — report it. Production follows at launch (M9's gate). **Locally**, a copy is optional and
  goes only in the **repo-root** `.env.local`, never `apps/web/.env.local` (the local server loads that file, and the
  e2e contact specs then fail by design). The e2e harness withholds all five mail names from every server it starts
  (ADR 0164 decision 7). `vercel env pull` rewrites the root file, so keep a private copy.

### `LEMNARIA_PUBLIC_ORIGIN` (wave 8V, 2026-10-17; name only; the owner's)

The site's public origin, under which the server writes the shop's view-only kitchen link
([ADR 0165](../decisions/0165-the-shops-notice-is-a-branded-html-email-with-a-plain-text-fallback-led-by-a-frozen-view-only-link-to-the-kitchen-as-sent-and-the-done-page-shows-the-customers-own-design-link.md)
D7). **Not a secret, not a mail variable**; its absence never makes the contact route unavailable.

- **Shape:** exactly an `https://` origin — the host, an optional port, nothing after it (no path, no trailing `/`,
  lower case, an IDN in punycode). Anything else reads *unavailable* and the notice is sent **without** the link; the
  log names the variable, never its value [src: `apps/web/src/lib/server/public-origin.ts:46-66`].
- **Loopback only beside the e2e flag:** `localhost`, `127.0.0.1` or `[::1]`, over `http://` or `https://`, is accepted
  only where `LEMNARIA_E2E_FAKE_MAIL` is set to `1`, which no deployment sets [src: `public-origin.ts:30-36`]. The e2e
  harness sets it to its own server's origin; a local `next dev` without the flag sends its notice with the link
  unavailable.
- **One value per environment, add-only:** the production domain for Production and the matching origin for Preview,
  because each environment's links resolve against its own database. Never the request's `Host`, never a code constant.
- **Owner step:** add it per environment; nothing existing is changed.

### `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (M8B, 2026-10-18; names only; the owner's)

For the login and register pages ([ADR 0169](../decisions/0169-a-client-account-is-an-e-mail-and-an-argon2id-password-a-session-is-a-hashed-host-only-cookie-a-role-is-a-named-set-of-capabilities-and-a-claimed-design-opens-on-any-device.md)
D5, *Consequences*; the number changes at merge). **Add-only; the owner provisions both; no agent creates, reads or prints
either.** No agent knows whether they are set in any environment. The repo-root `.env.example` names both, commented, with no
value [src: `.env.example:162-163`].

- **`TURNSTILE_SITE_KEY`**: the widget's public key. Read **on the server, per request**, and handed to the page; it is not a
  build-time or `NEXT_PUBLIC_` variable [src: the comment at `apps/web/src/account/turnstile-widget.tsx:13`; the per-request
  read was stated by the coordinator, not traced]. Unset or blank: the account pages show the widget's unavailable content,
  never a widget.
- **`TURNSTILE_SECRET_KEY`** (a secret): used for Cloudflare's siteverify on the server, read from `process.env` when a
  challenge is checked [src: `turnstile-verification.ts:199`, one line]. Never printed, logged, read at build or bundled.
  Unset or empty: every challenge is refused as not configured (`503`), loudly. A documented Cloudflare **test** secret is
  honoured only beside `LEMNARIA_E2E_FAKE_MAIL=1` with a loopback `LEMNARIA_PUBLIC_ORIGIN`; set anywhere else it is refused
  as not configured (ADR 0169 D5, dated note). The production secret must be the real widget's (plan §10, M9 gate line 1).
- **`LEMNARIA_PUBLIC_ORIGIN`** (above) is also required for the check: the hostname Cloudflare reports is compared with it.

### Planned mail variables for the `lemnaria.md` sender: PLANNED, NOT SET

[`M8B-mail-sender-lemnaria-md.md`](../milestones/M8B-mail-sender-lemnaria-md.md) plans a provider-neutral SMTP path:
`MAIL_TRANSPORT` (exactly `smtp`; the opt-in), `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT` (`465` or `587`), `MAIL_SMTP_USER`,
`MAIL_SMTP_PASSWORD` (a secret) and `MAIL_SMTP_FROM_ADDRESS` [doc: that plan's variable table]. **They are a plan.** Nothing
is built (the code has only the Gmail SMTP sender), nothing is set in any environment, and the provider is not chosen. When
they exist they follow the same rules: add-only, the owner provisions, and `GOOGLE_*` is not removed until the owner decides.
`MAIL_FROM_ADDRESS` stays the retired Resend name and is not reused.
