# ADR 0096 — The deployed schema is proved by a gate that reads it, and production was never in the runner's path

Status: Accepted
Date: 2026-09-07
Type: Finding + Decision
Milestone: M6 — owner item 4 (`testing-reports/milestone-6/07-owner-manual-feedback.md`), adjudicated in `testing-reports/milestone-6/08-architect-adjudication-owner-feedback.md`

## Context

The owner reported, from the running production app, that changing a cabinet's colour **failed to
save every time**, with a persistent error message. They asked why it does not save to the database
in production specifically.

The adjudication ranked eight candidate causes and named the one question that split them — *which
notice appeared* — because each candidate predicts a different sentence. The owner answered:
*"încercăm în continuare"*, which is `saveStatus: "error"`, an HTTP 5xx, and a retry armed. That
alone excluded the credential, conflict, payload and rollback candidates. The database was then read
back.

## The measurement

Run read-only on 2026-09-07 by the coordinating session, with `OWNER_DATABASE_URL` against
production `lemn-conf-v2`, contrasted against `PREVIEW_OWNER_DATABASE_URL`:

| | Production `lemn-conf-v2` | Preview `lemn-conf-v2-preview` |
| --- | --- | --- |
| `schema_migrations` | **relation does not exist** | present; rows 1, 2, 3, 4, every `applied_at` 2026-09-02T18:09:2x |
| `designs.revision` | **absent** | `bigint`, `is_nullable NO` |
| `designs.write_token_hash` | present, `is_nullable YES` | present |
| tables in `public` | `designs` only | `designs`, `schema_migrations` |
| `designs` row count | 5 | 32 |

Production's `designs` columns, in order: `id text NO`, `schema_version integer NO`,
`document jsonb NO`, `created_at timestamptz NO`, `updated_at timestamptz NO`,
`write_token_hash text YES`.

**The mechanical fit is complete.** `mint`, `load` and `updateIfCurrent`
(`packages/persistence/src/neon-configuration-repository.ts`) all name `revision`. Against a table
without it the driver raises; `designErrorResponse` matches no domain arm and **rethrows**
(`apps/web/src/lib/server/design-errors.ts:48`); Next answers 500; `isRetryableStatus(500)` is true,
so the save coalescer retries to its 8 s ceiling for ever. That is the permanent "we keep trying"
notice, on every edit, for cabinet edits and global settings alike — the owner's item 4 and the save
half of their item 2, one cause.

## The finding

### 1. This is not a missed migration. Production was never in the runner's path at all

There is no `schema_migrations` table in production. [ADR 0042](0042-the-database-records-which-migrations-it-ran.md)
decision 1 makes the ledger the **runner's own** creation, not a migration file's — so its absence is
not "the ledger is behind", it is **the ledger-bearing runner has never been pointed at this
database, once, since wave S10 shipped it on 2026-08-31**. Preview's four ledger rows all carry the
same 2026-09-02T18:09:2x timestamp: one run, the one [ADR 0054](0054-local-development-writes-to-the-preview-database.md)
records. The runner works. It was aimed at preview and never at production.

### 2. Production is `0001`–`0003` applied, `0004` alone missing, and the ledger absent throughout

Measured on `pg_constraint`, 2026-09-07, after the column read-back raised the question:

| | Production `lemn-conf-v2` | Preview `lemn-conf-v2-preview` |
| --- | --- | --- |
| `write_token_hash_is_sha256` | **present** — `CHECK (write_token_hash IS NULL OR write_token_hash ~ '^[0-9a-f]{64}$')` | present |
| `designs_revision_not_null` | **absent** | present |
| `designs` rows by `schema_version` | 5 at v1 | 30 at v5, 2 at v2 |

**`0003` did run.** That had to be measured rather than inferred, and the inference that would have
been made without it is wrong in the natural direction: `write_token_hash` being **nullable** does
not mean `0003` never ran, because `0003` deliberately keeps it nullable — *"NULL is still accepted:
rows minted before 0002 carry it and fail closed, which is correct"* — and adds only the check
constraint above. Nullability is silent on the question; the constraint answers it. `0004`'s absence
is corroborated twice over, by the missing constraint and by the column itself not existing.

So the shape is `0001` + `0002` + `0003`, and
[ADR 0020](0020-a-migration-file-is-not-an-applied-migration.md)'s own Consequences records `0002`
being applied to `lemn-conf-v2` on 2026-08-25 with the owner's authorisation, by the pre-ledger
runner.

**This dates the last production migration precisely, and it sharpens finding 1 rather than
softening it.** The ledger table is created by the runner, not by a migration file (ADR 0042
decision 1), and the ledger-bearing runner shipped in wave S10 on **2026-08-31**. Production carries
`0003` and no ledger, so its last migration ran *before* that date — with the pre-ledger runner —
and the ledger-bearing runner has been pointed at it **not once in the seven days since**, while
being pointed at preview on 2026-09-02. Production is not "never migrated"; it is *migrated to
`0003` by hand and then never called again*, which is the same defect with a clearer date on it.

### 3. The guard that would have caught this was ruled on 2026-08-25 and never built

This is the part that makes the record worth writing. [ADR 0020](0020-a-migration-file-is-not-an-applied-migration.md)
decision 3 already says:

> **The persistence suite keeps a standing assertion that the application database carries the
> current schema**, whose failure message names the fix command so the failure explains itself.
> **This is the one check that would have caught it**, and it necessarily reads the application
> database — read-only, schema only, never its rows.

It does not exist. The only test in the repository that reads `DATABASE_URL` is
`packages/persistence/tests/application-role-privileges.test.ts`, and it asserts **privileges**, not
schema shape. It asserts nothing about `revision`, and its ledger assertion is written to pass
either way — its own comment says so:

> *"True whether or not the ledger exists yet in this database: a table with no grants and a table
> that is absent both produce no rows here, and the first production run is where ADR 0020's schema
> read-back confirms which it was."*

So the one test that touched production was **designed** not to distinguish the state production was
actually in.

### 4. Implemented literally, decision 3 would have caught it — and would still have been silent in CI

Both halves matter. The repository root's `.env.local` holds `DATABASE_URL` pointing at production
(ADR 0054's table; key names verified for this record, values never read), and
`packages/persistence/src/load-env.ts` loads that file for the persistence suite — so a decision-3
assertion would have run against **production** on any developer's machine and failed loudly on the
missing column, from 2026-08-31 onward.

But `application-role-privileges.test.ts` is `describe.skipIf(!hasLiveDatabase)`, and CI has no
`DATABASE_URL`. A decision-3 test in the same file would inherit that skip. **The guard as ruled was
therefore one person's local run away from working, and zero CI runs away from being silent** — and
for thirteen days nobody made that run. A guard whose target depends on which untracked `.env` file
happens to exist on the machine executing it is not a guard; it is a coincidence with a test name.

### 5. Why no gate could see it, which ADR 0020 already explained and which is still true

Every migration assertion in the repository targets the **test** database, because
[ADR 0006](0006-tests-never-touch-the-application-database.md) requires exactly that and its guard
is right and stays. A green suite proves the migration *file* is correct and says nothing about
whether it was ever *applied* anywhere. That finding is unchanged. What is new is that the remedy
ADR 0020 wrote for it was never delivered.

### 6. This is the third occurrence

- **2026-08-25** — production had never been migrated; found by adversarial QA reading the database
  directly. ADR 0020.
- **2026-09-02** — preview was three migrations behind; found because a mint failed with
  `column "write_token_hash" … does not exist` (42703). ADR 0054, whose amendment records *"nothing
  in the deployment process migrates preview"*.
- **2026-09-07** — production again, this time found **by a customer**, five days after
  `docs/STATUS.md` began carrying production's unconfirmed migration state as an open item, and
  seven days after ADR 0042 decision 9 wrote *"the deployed databases have not been migrated"* in
  plain words.

Three findings of one gap, each found by a different accident and none by a gate, is a process
defect. It is not an operator slip and must not be recorded as one.

### 7. Nothing has ever run a migration except a person typing the command

Measured, not inferred:

- `.github/workflows/ci.yml` declares `install`, `format`, `lint`, `typecheck`, `test`, `build`,
  `boundary`, `lockfile`, `sca`. **There is no migrate job and no deploy job.** The only occurrence
  of "vercel" in the file is the build job's comment, *"Mirrors what Vercel runs on deploy"* — and
  that job deliberately runs with **no `DATABASE_URL`**, to catch a top-level `neon()` call
  reintroducing a build-time database coupling.
- Vercel builds `apps/web` through its `build` script, `pnpm run build:deps && next build`. That
  chain reaches `configurator-domain`, `three-adapter` and `persistence`'s **`build`** script.
  Nothing in it reaches `persistence`'s **`migrate`** script (`tsx src/migrate.ts`).

So migration execution has never been attached to anything. It happened once, aimed by hand at
preview on 2026-09-02 — all four ledger rows land within 900 ms of one another — and production was
never typed. That is the whole mechanism of this incident: not a runner that failed, but a runner
nothing calls.

### 8. The owner's steer, and where it meets an existing ruling

The owner has directed that **migrations run in the deployment pipeline**. That is the right
conclusion from finding 7 and this record adopts it. It must be said plainly that it meets an
existing rejection, because one of the three shapes it could take is the shape ADR 0020 already
refused:

> **ADR 0020, Alternatives considered, 1.** *"Run migrations automatically at application start or
> **during the build**. Rejected: the application connects as `app_designs`, which by ADR 0008
> deliberately holds no DDL privilege… Handing DDL to the runtime role to make deployment convenient
> would reverse a security decision to save an operational step."*

**The steer and that rejection are compatible — but only under one of the three options.** Running
migrations from Vercel's build is what ADR 0020 refused. Running them from a pipeline job that holds
its own credential and hands DDL to no runtime is not: the rejection's reasoning is about *which
role executes DDL*, not about *whether a machine may start it*. Decision 2 below therefore satisfies
the owner without overturning anything, and decision 2's rejected option 1 is recorded as still
refused, on ADR 0020's reasoning plus four of its own.

There is a second clause the steer genuinely does move, and it is named rather than absorbed:
**ADR 0020 decision 1's "with the owner's authorisation"**. An automated pipeline applies migrations
without a human present, by design. Decision 5 below is what replaces that authorisation, and it is
a real change to a ruled decision made deliberately at the owner's direction.

## Decision

### 1. A deployed schema is proved by reading it back, and a ledger row is not that evidence

Restated from ADR 0020 decision 2 because everything below depends on it: verification is
`information_schema` and `pg_constraint`, never the migrate command's exit status, and — since
wave S10 — never the ledger alone. A ledger row is evidence about what the runner did; it is not
evidence about the schema.

### 2. Migrations run in the deployment pipeline, as a job that migrates and then deploys — not from Vercel's build

The owner's steer, adopted. **The job runs in GitHub Actions**, holds `MIGRATION_DATABASE_URL` as a
GitHub Actions secret, runs `pnpm --filter @lemnaria/persistence run migrate` against the target
environment, and **deploys only if that succeeds**. Deployment moves from Vercel's automatic Git
integration onto an explicit step (`vercel deploy --prebuilt`, a deploy hook, or equivalent), which
is the price of ordering the two.

**Vercel's `buildCommand` running `migrate` before `next build` is rejected**, for five reasons. The
correctness ones lead, deliberately: option 1 fails on them even in a world where the credential
were perfectly scoped, and a reader who only remembers the security argument will re-propose it the
day the scoping changes.

1. **Migration execution would inherit Vercel's build-skipping behaviour.** A build that is skipped,
   cached, or short-circuited by an ignore command is a migration that silently did not run. Tying a
   schema change to a build heuristic re-creates this incident's exact shape — a runner that works,
   not called — with a subtler cause. This is the reason to lead with.
2. **Every preview branch deploy would migrate.** Preview deploys are numerous and per-branch, and
   ADR 0054 records that preview and local development share one database. A branch carrying a
   half-finished migration would apply it to that shared database on push, to everyone.
3. **It is ADR 0020 alternative 1's own case** — migrations during the build — refused there and not
   re-opened by the steer, which asks for a pipeline and does not ask for that pipeline to be the
   application's build.
4. **It leaves no artefact outside the build log.** A pipeline job's output is a durable run record;
   a build log is retained on the platform's terms.
5. **The credential would reach the running application. Measured, not supposed.** Two vendor
   citations, with page dates, because this is a moving product and a future reader must be able to
   re-check it rather than trust a claim made on 2026-09-07:
   - `https://vercel.com/docs/environment-variables` (page dated **2026-08-20**) scopes variables by
     *environment* — Production, Preview, Custom environments, Development — and offers **no
     build-versus-runtime distinction at all**. It states the dual availability outright: *"Your
     source code can read these values to change behavior during the Build Step or during Function
     execution."*
   - `https://vercel.com/docs/environment-variables/sensitive-environment-variables` (page dated
     **2026-08-28**): *"Sensitive environment variables are environment variables whose values are
     non-readable once created."* What that controls is read-back through the dashboard, API and
     CLI, plus redaction of 32+ character values in build logs. **Neither withholds the value from
     the deployed function.** It protects the credential from a human reading it back; it does not
     protect it from the runtime.

   So `MIGRATION_DATABASE_URL` in Vercel's Production scope hands the DDL-owning credential to the
   running application, reversing [ADR 0008](0008-least-privilege-database-role.md). **There is no
   build-only variable to reach for**, which is what makes this a settled fact rather than a
   configuration problem someone could solve later.

### 3. The drift guard is mandatory, independent of the pipeline, and is what makes the pipeline trustworthy

**Not an alternative to decision 2 — the check on it.** A pipeline that trusts its own migrate step's
exit code repeats precisely the mistake ADR 0020 decision 2 was written against, and ADR 0013 before
it. Automation nothing verifies is how a runner that works ends up pointed at one database for five
days.

The guard is a read-only `migrate:status`: read the deployed ledger, read `src/migrations/*.sql`,
and hand both to **`planPendingMigrations`** — the pure function ADR 0042 decision 6 already built,
which decides every refusal (a pending file, a changed checksum, a renamed file, a ledger ahead of
the checkout) without a database. So the guard executes nothing and invents no rules; it reuses the
tested ones and reports. It exits non-zero when the database is behind or a checksum diverges.

Three requirements on it, each drawn from something this incident showed:

- **It runs against each deployed environment by name** — production and preview — never against
  "whatever `DATABASE_URL` resolves to". Finding 4 is that an inherited target is what made the
  ruled guard silent, and a check whose subject depends on which untracked `.env` file the executing
  machine happens to hold is a coincidence with a test name.
- **It must be able to fail in CI**, not only where someone has already pulled secrets.
- **A missing `schema_migrations` table is its loudest case, not a crash.**
  `SELECT_APPLIED_MIGRATIONS_SQL` raises against a database that has no ledger — which is exactly the
  state production was in on 2026-09-07 — and the guard must report *"this database is outside the
  ledger entirely"* and name the fix, rather than fail with a relation-does-not-exist stack trace.

### 4. The guard's credential can see the ledger, and it is not the application role

`application-role-privileges.test.ts` asserts — correctly, and this decision does not weaken it —
that `app_designs` holds **no privilege at all** on `schema_migrations`. The app role can read
`designs`'s columns from `information_schema` but **cannot see the ledger**. The guard therefore
needs a read-only credential with visibility of both.

`MIGRATION_DATABASE_URL` lives as a **GitHub Actions secret**, readable by the workflow and by
repository administrators, and is **not** added to Vercel. [ADR 0008](0008-least-privilege-database-role.md)
stands untouched: the application role gains nothing, no DDL privilege reaches any runtime, and the
privileged credential's blast radius moves from "a person's laptop" to "a repository secret", which
is narrower and auditable. Adding it is an **addition** and the owner's to perform
(`docs/best-practices/environments-and-resources.md`).

### 5. What an unattended migration may do, and what still requires a human

ADR 0020 decision 1's *"with the owner's authorisation"* is replaced for the ordinary case by this
rule, because a pipeline has no human in it. **Additive, idempotent migrations run unattended.**
`0001`–`0004` are all of that shape — `create table if not exists`, `add column if not exists`, a
`DO` block guarded on `pg_constraint` — which is why automating them now is safe and why this
decision is affordable.

**A migration that can destroy or rewrite data does not run unattended.** Concretely, a file
containing `drop`, a non-additive `alter … type`, a `delete`/`update` over existing rows, or a
`not null` added without a default, is applied as a deliberate operator action with the owner's
authorisation, in its own release step — ADR 0020 decision 1 unchanged for that class. The pipeline
must **refuse** such a file rather than run it, so the classification is enforced and not
remembered.

This connects a thread `migrate.ts` left open. Its header already records that a transaction forbids
`create index concurrently`, `reindex concurrently`, `vacuum`, `alter system`, `create database`,
`drop database` and `alter type … add value` on older servers, and says a migration needing one
*"has to be applied by hand and then recorded, which is a deliberate operator action and should get
its own decision record rather than a quiet exception carved into this runner."* **This is that
record**: those statements and the destructive class above are the same category — hand-applied,
owner-authorised, then recorded — and the pipeline's refusal is where the category becomes checkable
instead of documented.

### 6. Both deployed environments are covered, and a preview branch is not exempt

If the pipeline migrates production only, ADR 0054's finding — *"nothing in the deployment process
migrates preview"* — survives this record, and preview gets found a fourth time. The migrate-then-
deploy job therefore runs for **preview as well as production**, against that environment's own
credential.

The hazard decision 2 reason 3 raises does not disappear by moving the job out of the build; it is
bounded instead. Preview and local development share one database (ADR 0054), so a migration reaching
preview reaches every developer. The rule: the preview job runs on the **default branch's** preview
deployments, and a feature branch whose migration has not yet merged deploys against a preview
database that is **behind its code** — which decision 3's guard reports as a failure on that branch,
loudly, naming the file. That is the correct outcome: it makes an unmerged migration visible to its
author instead of applying it to everyone.

### 7. Concurrent pipeline runs are safe, confirmed by reading rather than assumed

A pipeline makes simultaneous runs ordinary where a human operator made them rare, so this was
checked rather than inherited. `migrate.ts` acquires `ACQUIRE_MIGRATION_LOCK_SQL` —
`select pg_advisory_xact_lock($1::bigint)` on the fixed key `4_207_691_115` — **inside** each
migration's own transaction, and ADR 0042 decision 3 records that every transaction takes the lock
and then **re-reads the ledger inside it**. The lock is transaction-scoped rather than
session-scoped, deliberately, so a dying process cannot leave it held.

The consequence for two concurrent deploys: the second blocks on the lock, and when it proceeds its
in-transaction re-read shows the first's ledger row, so it applies nothing. Per-migration rather than
per-run, so two runs may interleave file by file — which is safe for the same reason, since each file
is atomic with its own ledger row. **No change is needed to make the runner pipeline-ready.**

### 8. Rollback: the database is allowed to be ahead of the code, and nothing rolls a migration back

Migrations run before the new code is live, so a deploy that fails after migrating leaves the schema
ahead. **That is the correct direction and is declared, not tolerated.** It is safe precisely because
decision 5 confines unattended migrations to the additive, idempotent class: a column the old code
does not name costs it nothing, and `0004`'s own header states the ordering as load-bearing —
*"APPLY THIS BEFORE THE WEB CODE THAT READS IT SHIPS"* — because the opposite order is this very
incident.

So: **a rolled-back deployment does not roll back its migration, and no down-migrations exist or will
be added.** A schema change that turns out to be wrong is corrected by a new forward migration, never
by editing or reversing an applied file — ADR 0042 decision 5's frozen-bytes rule, restated here
because a pipeline makes the temptation routine. The asymmetry is the point: code can be rolled back
instantly on Vercel, schema cannot, and the additive-only rule is what keeps that asymmetry harmless.

The one case it does not cover is a **rollback across a `CURRENT_SCHEMA_VERSION` increase**: rows
stamped by the newer build are refused by `refuseUnsupportedVersion` on the older one
(`migrate-design.ts:673–683`), which is a document-version concern rather than a migration one, and
is decision 9's reason for reading `schema_version` too.

### 9. A document schema version is not a database migration number

`CURRENT_SCHEMA_VERSION` is **5** (`packages/configurator-domain/src/migrate-design.ts:62`) and the
migration files stop at **0004**. The first is a *document* version migrated forward in code by
`migrateDesign`; the second is a *database* change. They were conflated during this diagnosis and
will be again. Any read-back reads all three: the ledger, the columns, and
`select distinct schema_version from designs`.

### 10. Today's production remedy is a human operator release step, run before the pipeline exists

**The pipeline is decision 2's work and does not exist yet, so today's remedy is not automated.**
Production is broken now, and it is repaired under ADR 0020 decision 1 as written — a first-class
release step, performed with the owner's authorisation under `MIGRATION_DATABASE_URL`, never by an
agent and never by the application. Decision 5's unattended rule governs the pipeline's future runs,
not this one. **The diagnosis is closed by this record; the remedy is not.**

The wave that performs it does not close until all three are quoted:

1. production `schema_migrations` reads rows 1–4, and `information_schema.columns` shows
   `designs.revision bigint`, `is_nullable NO`;
2. `pg_constraint` shows **`designs_revision_not_null` present**, which it is not today, and
   `write_token_hash_is_sha256` still present — the pre-run state of both is measured in finding 2,
   so the run's effect is a comparison rather than an assumption;
3. a save observed to succeed against production, verified by reloading the share link and seeing
   the change — not by the absence of an error notice, and not by the runner's exit status.

### 11. What the remedy may safely do, established before it runs

- **Re-running every file is the adoption path**, per ADR 0042 decision 4: a database that predates
  the ledger adopts it by re-running, never by backfilling inferred rows. All four files are
  idempotent by construction — `create table if not exists` (0001), `add column if not exists`
  (0002, 0004), and a `DO` block guarded on `pg_constraint` (0003) — which is what makes that safe
  here.
- **Production holds 5 real rows**, so ADR 0020's *"the table held 0 rows … nothing could be lost"*
  does **not** apply this time. `0004` adds `revision bigint not null default 1`, which fills those
  rows without rewriting the table, and the migration's own header covers exactly this case.
- Those 5 rows are `schema_version` 1 (re-measured 2026-09-02, ADR 0020's own correction citing
  ADR 0052), and `OLDEST_SUPPORTED_SCHEMA_VERSION` is 1, so they migrate forward on load and remain
  readable.

## Alternatives considered

The owner directed that migrations run in the pipeline, so the question these weigh is **where the
pipeline puts them**, not whether to automate.

1. **Vercel's `buildCommand` runs `migrate` before `next build`.** The cheapest by far — one line,
   no new infrastructure, no move off Vercel's Git integration. **Rejected** on decision 2's five
   reasons: migration execution would inherit Vercel's build-skipping behaviour; every preview branch
   deploy would migrate a database shared with local development; it is ADR 0020 alternative 1's own
   refused case; it leaves no artefact outside the build log; and the credential reaches the running
   application, reversing ADR 0008. **The credential reason is now measured against the vendor's own
   documentation** and is cited there with page dates — Vercel has no build-only variable, and
   "Sensitive" governs read-back rather than runtime availability. It is nonetheless listed **last**
   on purpose: reasons 1–4 decide the question without it, and if Vercel ever ships build-scoped
   variables this option becomes cheaper without becoming correct.
2. **A GitHub Actions job that migrates, then deploys. Chosen** — decision 2. It satisfies the
   owner's steer, keeps the privileged credential in GitHub secrets and out of Vercel entirely, and
   does not touch ADR 0008 or ADR 0020 alternative 1's reasoning. Its cost is real and is accepted:
   deployment moves off Vercel's automatic Git integration onto an explicit step, which is more
   configuration to own and one more thing that can be misconfigured — mitigated by decision 3's
   guard, which fails when it is.
3. **A read-only `migrate:status` drift guard alone, with migrations still applied by hand.**
   Rejected **as a substitute** and adopted **as a companion** — decision 3. It would have caught
   this incident and ADR 0054's, which is exactly why it is mandatory; but a guard that only reports
   still leaves a human to act on it, and finding 7 is that the human step is the one that did not
   happen. Automation without verification is unsafe; verification without automation is what the
   project already had.
4. **Implement ADR 0020 decision 3 literally, as a test in the persistence suite, and stop there.**
   Rejected on finding 4. Its target would still be whichever `DATABASE_URL` the machine happened to
   supply — production from the repo root, preview from `apps/web`, nothing in CI — and `skipIf`
   would keep it silent exactly where it needs to speak. A suite-level assertion may be added
   *beside* decision 3's guard; it may not be the guard.
5. **Trust the ledger, and check only that its rows match the files.** Rejected by ADR 0020
   decision 2 and by this very incident: production's ledger does not exist, so a ledger-only check
   would have had nothing to compare and would have had to choose between failing on every
   unledgered database and passing on one. The columns are ground truth, and the ledger's absence is
   itself the loudest signal (decision 3).
6. **Treat 2026-09-07 as an operator slip and simply run the migration.** Rejected. The same slip has
   now been found three times, by three different accidents, and the third time by a customer. What
   is missing is not diligence; it is a gate.
7. **Have the guard alert rather than fail the deploy.** Rejected for production: shipping code that
   reads a column the database does not have is precisely how this happened, and
   `0004_add_design_revision.sql`'s own header states the ordering as load-bearing — *"APPLY THIS
   BEFORE THE WEB CODE THAT READS IT SHIPS."* An alert is a message someone may not read; a failed
   deploy is the state ADR 0020 decision 1 has always described.
8. **Add down-migrations so a rollback can reverse a schema change.** Rejected — decision 8. They
   would have to be written for a case the additive-only rule makes unreachable, they double the
   surface every migration must get right, and a reverse migration is the one file nobody ever tests
   against real data. Corrections go forward.

## Consequences

- **Customer work has been lost, and it is unrecoverable.** Every design created in production since
  the build that reads `revision` was deployed exists only in the browser tab that made it. The row
  was never written, so there is nothing to restore — not by backup, not by Neon PITR. The 5 rows
  present predate that build. This is stated plainly rather than as a footnote because it is the
  actual cost of the gap, and because nothing in the remedy recovers it.
- Until decision 5's remedy runs, **production does not persist customer work**, and the honest
  statement of the product's condition is that sentence.
- `docs/STATUS.md`'s open item *"Production's migration state for `0004_add_design_revision.sql` is
  unconfirmed"* is now **confirmed, and worse than the item's wording** — it is not one migration
  behind, it is outside the ledger entirely. STATUS must be corrected to say so, and the item stays
  open until decision 5's three pieces of evidence are quoted.
- **ADR 0020 decision 3 is superseded in mechanism** by decision 3 here and is annotated in place.
  Its decision 2 stands unchanged and is restated. **Its decision 1 is amended in one clause**:
  *"with the owner's authorisation"* no longer holds for the additive, idempotent migrations
  decision 5 lets the pipeline run unattended, and holds unchanged for everything else. That is a
  deliberate change to a ruled decision, made on the owner's steer, and it is the one place this
  record moves a line rather than implementing one.
- **This is a delivery-process change, not only a schema one.** Deployment stops being Vercel's
  automatic Git integration and becomes an explicit pipeline step. Whoever implements decision 2
  owns that migration of the deploy path, and `docs/best-practices/ci-and-local-gates.md` gains a
  deploy section it does not have today.
- Decision 2 and decision 3 both need `MIGRATION_DATABASE_URL` as a **GitHub Actions secret**. That
  is an **addition**, never a change or removal (`docs/best-practices/environments-and-resources.md`),
  and it is the owner's to create. It is deliberately **not** added to Vercel.
- **Decision 5's refusal has to be built, not just written.** A pipeline that documents which
  migrations may run unattended, without refusing the others, is a comment. The wave implementing
  decision 2 owes the classifier and its adversarial tests, and until it exists the pipeline should
  run only against the four files that already exist and are known additive.
- ADR 0054's open finding — *"nothing in the deployment process migrates preview"* — is the same gap
  one environment over. Decision 6 covers both environments deliberately, so closing this does not
  leave preview to be found a fourth time.
- **The Vercel scoping question is closed, against the vendor's documentation and with page dates**
  (decision 2, reason 5): there is no build-only environment variable, and `Sensitive` governs
  read-back, not runtime availability. Cited rather than asserted because it is a moving product —
  re-check the two pages before relying on this in a later decision.
- The adjudication's item 5 (production observability) is now sharper, not less urgent: this took a
  database query because nothing captured the thrown `NeonDbError`. A structured log at
  `designErrorResponse`'s rethrow would have named the missing column on the first failed save.
