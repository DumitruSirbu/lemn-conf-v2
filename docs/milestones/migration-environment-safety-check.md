# The migration commands refuse a declared environment the credential does not reach

Status: **Planned** — standalone tooling-safety task, **not part of M7 or any product milestone**.
Planned 2026-09-28 at `7a6438a` (`m7-room-and-presets`). Nothing here is implemented.

Every code citation below was read at `7a6438a`. Evidence tiers follow `docs/WORKFLOW.md`:
**[source]** = read in the tree at that commit, **[measured]** = a command run while planning,
**[inference]** = reasoning not yet checked against code or the vendor.

## Why

On 2026-09-28 an agent session ran `pnpm --filter @lemnaria/persistence run migrate preview`,
reading `preview` as a database selector. `MIGRATION_DATABASE_URL` pointed at production, so
`0005`/`0006` were applied to production ahead of the documented "preview then production" order,
without a fresh production go-ahead. The migrations were additive and no data was lost. The
incident is recorded in `docs/best-practices/environments-and-resources.md`, *Which file holds what*.

The fix recorded that day is documentation. The class of mistake stays one careless reading away. This
task makes the commands **refuse** the mismatch, so the mistake no longer depends on someone reading an
output line.

## Ground truth

- **G1 — `migrate` never read its argument at all.** [source] `migrate.ts`'s CLI block
  (`if (isDirectCliInvocation)`) calls `readMigrationDatabaseUrl()` and `runMigrations()`, and
  never reads `process.argv[2]`. The `preview` in the incident was ignored twice: once by design,
  because the credential selects the database, and once because it was never wired. The only thing
  printed was `[migrate] applied … against lemn-conf-v2 (…)`, **after** the migrations had run.
  `environments-and-resources.md`'s claim that `migrate` "merely prints `preview` next to the
  database name" is **wrong for `migrate`** and true only for `migrate:status`. S3 corrects it.
- **G2 — `migrate:status` requires the label and only prints it.** [source]
  `migrate-status.ts` `readDeclaredEnvironment(argv)` trims `argv[2]` and throws
  `MigrationExecutionError` when it is empty. `describeMigrationStatusLine` prints
  `[migrate:status] <environment> (<databaseName>) — <outcome>`. Nothing compares the two.
- **G3 — the governing ruling is ADR 0096 decision 3, grounded in its finding 4.** [source] The
  guard "runs against each deployed environment **by name** … never against whatever
  `DATABASE_URL` resolves to". `readDeclaredEnvironment`'s doc comment cites decision 3. The file
  header cites finding 4 ("refuses to guess"). ADR 0096 **decision 4** is about the credential:
  a GitHub Actions secret, not the app role, and never added to Vercel. This task narrows neither
  ruling and overturns nothing. It turns decision 3's "by name" from a printed line into a checked
  one.
- **G4 — `databaseNameOf` lives in `migrate.ts`, not `migration-status.ts`.** [source] It returns
  the URL path with the leading `/` stripped. It never throws, and returns the placeholder
  `<unparseable connection string>` on a malformed URL. `migrate-status.ts` already imports it from
  `migrate.ts`.
- **G5 — the three environments have distinct database names.** [measured, 2026-09-28: each
  local `.env*.local` URL was parsed and only its path segment was printed, never a value.]

  | File, variable | Database name |
  | --- | --- |
  | `.env.migration.local` `MIGRATION_DATABASE_URL` | `lemn-conf-v2` |
  | repo-root `.env.local` `DATABASE_URL`; `.env.prod.local` `OWNER_`/`APP_DATABASE_URL` | `lemn-conf-v2` |
  | `apps/web/.env.local` `DATABASE_URL`; `.env.prod.local` `PREVIEW_OWNER_`/`PREVIEW_DATABASE_URL` | `lemn-conf-v2-preview` |
  | `.env.test.local` `TEST_DATABASE_URL` | `lemn-conf-v2-staging` |

  A name check can therefore tell the three apart. `test-database-url.ts` records the same fact:
  staging "sits in the same Neon project as the application database under a different name, which
  is why the name — not the host — is what separates them".
- **G6 — the repository already protects a database by name, and refuses.** [source]
  `test-database-url.ts` `ALLOWED_TEST_DATABASE_NAMES` (`lemnaria_test`, `lemn-conf-v2-staging`) is
  "deliberately a name allowlist rather than a comparison", and host comparison is rejected because
  pooled and direct Neon endpoints reach the same rows under different hostnames. "Adding a name here
  is a deliberate, reviewable one-line change." This task follows that precedent.
- **G7 — who calls the CLIs.** [source]
  - `.github/workflows/deploy.yml`, manual `workflow_dispatch` with the choice `preview` |
    `production`, runs `migrate:status "$TARGET_ENVIRONMENT"` twice. The pre-read has
    `continue-on-error: true`; the post-read is the gate. It also runs **bare `migrate`**.
  - Its own comment reads: "A repository secret of the same name is inherited when no environment
    secret is set". **So a `preview` dispatch running on a production repository secret has the
    incident's exact shape inside CI.** Only a check in `migrate` itself stops it, because the
    pre-read that would notice is `continue-on-error`.
  - `docs/runbooks/design-db-restore.md` §3 runs bare `migrate` against a throwaway restore target
    (a Neon branch, or `create database restore_drill_…`). That is the "ad-hoc database" case.
  - `ci.yml` calls neither command. The live suites call `runMigrations(url)`,
    `readDeployedSchema(url)` and `describeMigrationStatusLine(…, { environment: "test", … })`
    directly, never the CLI.
- **G8 — the migrate CLI's output is pinned.** [source] `tests/migrate.test.ts`, *the migrate
  CLI*, asserts exactly one `console.log(`, containing `describeMigrationRun(summary,
  databaseNameOf(connectionUrl))`, and exactly one `console.error(describeMigrationFailure(error))`
  in the text after `if (isDirectCliInvocation)`.
- **G9 — branch base.** [measured, `git diff --stat main...HEAD`] Six of the files this task
  touches have diverged on `m7-room-and-presets`: the environments doc, including the incident
  paragraph, the gates doc, the restore runbook, `migration-status.ts`, and two tests.
  Production already carries `0005`/`0006` from this branch.

## Decision (drafted here; the ADR is written at close-out)

### 1. Refuse. No `--force`, no warning-and-proceed

Both commands compare the declared environment with the database name the credential actually
reaches, **before opening any connection**. On mismatch they exit non-zero having run and read
nothing. The refusal goes through the existing single failure line (`describeMigrationFailure` /
`describeStatusFailure`) as a new `MigrationTargetMismatchError extends MigrationError`.

### 2. The rule, in full

`D` is the declared label (trimmed, as today), and `N` is `databaseNameOf(MIGRATION_DATABASE_URL)`.

- **`D` is a listed environment:** proceed only if `N` is one of that environment's names.
- **`D` is not listed:** proceed only if `D === N` exactly **and** no listed environment claims
  `N`. An ad-hoc database is declared by its own database name, for example
  `migrate restore_drill_2026_08_25`. A listed environment's database can be reached only under
  that environment's name, so `migrate lemn-conf-v2` is refused and told to say `production`.
- **Always refused:** an empty `N` and the unparseable placeholder. Comparison is exact and
  case-sensitive, so `Production` is an unlisted label and is refused against `lemn-conf-v2`.

This never selects or guesses a database (ADR 0096 decision 3 intact). It only refuses. The
credential remains the sole selector.

### 3. The mapping, and where it lives

A new pure module, `packages/persistence/src/migration-target.ts`, with no I/O, holds:

```ts
DATABASE_NAMES_BY_ENVIRONMENT: ReadonlyMap<string, readonly string[]>
  production → ["lemn-conf-v2"]
  preview    → ["lemn-conf-v2-preview"]
  test       → ALLOWED_TEST_DATABASE_NAMES   // imported from test-database-url.ts, not copied
```

- **A `Map`, not an object literal,** so `__proto__`, `constructor` and `toString` are never
  "listed" by accident.
- **`test` reuses `ALLOWED_TEST_DATABASE_NAMES` by import.** A second list of test-database names
  would be a second authority for one fact (ADR 0102). That constant gains an `export`, and its
  contents are unchanged.
- **No `staging` key, deliberately.** `.env.example` and `test-database-url.ts` both warn that
  `lemn-conf-v2-staging` "is NOT a staging environment". A `staging` label would teach the misreading
  those comments exist to stop. Declared `staging`, it is refused, and the message names `test`.
- `readDeclaredEnvironment` moves here from `migrate-status.ts`, gaining a command-name parameter so
  each CLI's usage line is correct. Test imports are updated, with no re-export shim. The new
  function is `assertDeclaredEnvironmentReaches({ environment, databaseName })`.
- `environments-and-resources.md` cites the constant by file and name (S3), so the list is never
  undocumented.

Adding a fourth permanent environment is a one-line reviewed edit, as with `ALLOWED_TEST_DATABASE_NAMES`.
A temporary database needs no edit at all (rule 2, second bullet).

### Alternatives considered

1. **Warn and proceed.** Rejected. For `migrate` the warning prints at the moment of the damage,
   which makes it a post-mortem. The incident's actor was an agent session, and `migrate:status`
   *already* printed both names and was not the protection anyone needed. ADR 0096 alternative 7
   applies the same reasoning to the pipeline: "An alert is a message someone may not read." In
   `deploy.yml` a warning also proceeds unattended (G7).
2. **Refuse, with a `--force` override.** Rejected. A refused agent's routine next move is the
   override flag, so the flag turns a refusal into a speed bump for exactly the actor that caused
   this. Every legitimate case is already reachable without it: correct label, or database-name
   label. ADR 0118 also argues against building an escape hatch for a case nobody has.
3. **Strict closed list: refuse every unlisted label.** Rejected. It breaks the restore runbook's
   throwaway-database path (G7) and forces a code edit per scratch database. The permissive half
   of rule 2 costs nothing in safety, because a listed environment's name can never be reached under
   an unlisted label.
4. **Let the label select the credential** (for example `preview` → `PREVIEW_OWNER_DATABASE_URL`).
   Rejected. It is precisely the guessing ADR 0096 decision 3 rules out, and it would make a script
   read `.env.prod.local`, which the environments doc and `.env.example` both state is "never read by
   any script".
5. **Compare the host too.** Rejected on G6's recorded reasoning: one database answers on pooled
   and direct endpoints, and CI's host is not knowable in advance.
6. **Interactive confirmation for `production`.** Rejected. The pipeline is unattended (ADR 0096
   decision 2), and an agent answers prompts.
7. **Documentation only (the state on 2026-09-28).** Rejected. It depends on the reading that
   failed.

### Known limit, stated rather than solved

**A database name is not an identity.** A Neon branch forked from production keeps the database name
`lemn-conf-v2`, so the check cannot tell it from production and would demand the label `production`.
The same holds for any copy that keeps its name. The check is a tripwire against a label and
credential disagreeing, the observed failure, and it does not prove *which* Neon branch was
reached. See **O1**.

## Scope

**In:** the pure module and its error class; wiring both CLIs; `migrate` gaining a required
argument; `deploy.yml`'s Migrate step passing `"$TARGET_ENVIRONMENT"`; operator text naming the
argument; the four docs that describe these commands.

**Out:**
- any change to `runMigrations`, `applyMigrations`, `readDeployedSchema`,
  `describeMigrationStatusLine`, `describeMigrationRun`, or the ledger, lock or transaction;
- `load-env.ts`'s file list, and any new environment variable or secret;
- moving `databaseNameOf` or `requireMigrationDatabaseUrl`, and any other refactor;
- `migrate:unattended-check`, which has no database;
- any migration file.

**Branch:** a short branch off **`m7-room-and-presets`**, merged back into it (G9). Commits are
**not** named `M7 wave …`, because this is not M7 work. It ships in M7's PR only because it has to
sit on M7's diverged docs. Basing it on `main` means conflict resolution in six files. That choice
is the coordinator's (**O2**).

**Priority [inference]:** land it before the next manual migration run. Preview is presumably still
owed `0005`/`0006` after the incident, and that run is the next opportunity to repeat it.

## Slices

| Slice | Owner | Production files | Reading |
| --- | --- | --- | --- |
| **S1** — pure target check | developer | `src/migration-target.ts` (new), `src/migration-errors.ts` (+1 class), `src/test-database-url.ts` (`export` only) | This plan, *Decision* 1–3 and G3–G6. ADR 0096 decision 3 and finding 4. ADR 0102 title rule (second authority). `test-database-url.ts` header and `ALLOWED_TEST_DATABASE_NAMES`. `migrate-status.ts` `readDeclaredEnvironment`. `migration-errors.ts`. |
| **S2** — wire both CLIs and the pipeline | developer, same dispatch as S1 | `src/migrate.ts` (CLI block only), `src/migrate-status.ts` (`reportDeployedSchemaStatus` only), `src/migration-status.ts` (`MIGRATE_COMMAND` text only), `.github/workflows/deploy.yml` (the Migrate step's `run:` only) | This plan, G1, G2, G7, G8, AC6–AC12. `migrate.ts` lines 256–300. `migrate-status.ts` lines 187–243. `deploy.yml` lines 97–126. `tests/migrate.test.ts` *the migrate CLI*. |
| **S3** — docs | scribe, at close-out | none (docs only) | This plan, G1, *Decision*, *Known limit*, AC14. `environments-and-resources.md` *Which file holds what*. `design-db-restore.md` §3. `ci-and-local-gates.md` *The two commands the workflow runs*. `.env.example` migrations section. |

**S1 and S2 together are 7 production files**, over the five-file guide. The overage is declared here
per `docs/WORKFLOW.md` *Scope discipline*. Three of the seven are one-line or text-only edits
(`export`, a string constant, one YAML `run:`). No mini-review between S1 and S2 is needed: S2 must
not land without S1, and `deploy.yml` must change in the same commit as `migrate.ts`, or its bare
`migrate` step is refused on the first dispatch.

**QA reading:** this plan in full. `src/migration-target.ts`, `src/migrate.ts`, `src/migrate-status.ts`,
and `deploy.yml` lines 97–126. `tests/migrate.test.ts` *the migrate CLI*. `test-database-url.ts`.
`docs/best-practices/engineering-conventions.md` *Coverage an adversarial pass owes*.

**Logic reviewer reading:** this plan's G1–G9, *Decision* and AC1–AC13. ADR 0096 decision 3,
finding 4 and alternative 7. The diff.

**Clean-code reviewer reading:** the diff. `docs/best-practices/engineering-conventions.md`.

**Security reviewer reading:** this plan's *Decision*, *Known limit*, R1 and R3. ADR 0008. ADR 0096
decisions 3 and 4. `environments-and-resources.md`. `test-database-url.ts` header (the libpq
`?dbname=` note). The diff, and `deploy.yml` in full.

## Acceptance criteria

The pure check, `assertDeclaredEnvironmentReaches` (S1):

- **AC1 — the mapping is exactly three entries.** `production → ["lemn-conf-v2"]`,
  `preview → ["lemn-conf-v2-preview"]`, and `test` is **the same array reference** as
  `ALLOWED_TEST_DATABASE_NAMES` (`toBe`, not `toEqual`). There is no `staging` key. The container
  is a `Map`.
- **AC2 — a listed label passes only on its own names.** Each of the four pairs passes. Property
  (fast-check): for every listed label `L` and every string `N` not in `L`'s names, the check
  throws `MigrationTargetMismatchError`. Fixed cases that must throw include the other
  environments' names, `""`, the unparseable placeholder, `lemn-conf-v2 ` (trailing space),
  `LEMN-CONF-V2`, `lemn-conf-v2-preview` under `production`, and `lemn-conf-v2` under `preview`,
  which is the incident.
- **AC3 — an unlisted label passes only as the exact, unclaimed database name.** Property: for
  arbitrary `D` not listed and arbitrary `N`, the check passes **iff** `D === N`, `N` is claimed
  by no listed environment, `N !== ""`, and `N` is not the placeholder. Fixed cases:
  - `restore_drill_2026_08_25` passes against itself;
  - `lemn-conf-v2` as a label is refused, and the message names `production`;
  - `lemn-conf-v2-staging` as a label is refused, and the message names `test`;
  - `staging` and `Production` are refused;
  - `__proto__`, `constructor` and `toString` are refused against `lemn-conf-v2`.
- **AC4 — the refusal says what to do and leaks nothing.** The message names:
  - the declared label;
  - the database reached;
  - the expected name or names for a listed label, or the environment that claims `N`;
  - that nothing was run or read;
  - the per-invocation override (`MIGRATION_DATABASE_URL=… pnpm …`);
  - that `.env.migration.local` must not be edited to do it.

  It never contains a URL, host or credential. The function only receives a name; AC7 proves the
  CLI end.
- **AC5 — `readDeclaredEnvironment` keeps its contract.** It still trims and still refuses an empty
  or whitespace argument with a message matching `/needs the name of the environment/`. Its usage
  line names the command that called it, so `migrate` does not tell the operator to run
  `migrate:status`.

The CLIs (S2). Every spawned-CLI test obeys **R3's safety rule** below.

- **AC6 — `migrate` requires the declaration.** With no argument, or whitespace: exit 1, one
  `[migrate]` failure line, and no connection attempted (stderr has no `Could not connect`).
- **AC7 — `migrate` refuses a mismatch before connecting.** Child env
  `MIGRATION_DATABASE_URL=postgres://probe-user:probe-secret-7f3a@db.example.invalid/lemn-conf-v2`,
  argument `preview`. Expected:
  - exit 1;
  - stderr contains `MigrationTargetMismatchError`;
  - stderr does **not** contain `Could not connect`;
  - stdout has no `[migrate] applied` line;
  - neither stream contains `probe-secret-7f3a`, `probe-user`, `db.example.invalid` or `://`.
- **AC8 — `migrate` proceeds past the check when it should.** Child env URL
  `…@db.example.invalid/lemnaria_cli_probe`, argument `lemnaria_cli_probe`. Stderr contains
  `Could not connect to "lemnaria_cli_probe"`. This proves the check let it through to the
  connect step, and that the refusal in AC7 is the check rather than a connection failure.
- **AC9 — `migrate:status` refuses before reading.** This is AC7's setup through `migrate:status`.
  Expected: exit 1 and `[migrate:status] MigrationTargetMismatchError`, with no
  `Could not read the schema` line. AC8's setup produces `Could not read the schema of
  "lemnaria_cli_probe"`.
- **AC10 — nothing below the CLI changed.**
  - The signatures and behaviour of `runMigrations`, `applyMigrations`, `readDeployedSchema`,
    `describeMigrationStatusLine` and `describeMigrationRun` are unchanged.
  - The live suites pass with no label.
  - `tests/migrate.test.ts` *the migrate CLI* passes **unedited**: still one `console.log`, one
    `console.error`, and the same `describeMigrationRun(…)` expression. An implementer who needs
    to edit that pin stops and reports it; that is not an in-scope change.
- **AC11 — `deploy.yml` changes by one token.** The Migrate step becomes `run migrate
  "$TARGET_ENVIRONMENT"`. The two `migrate:status` steps, the triggers, `environment:`, the
  secrets and `continue-on-error` are byte-identical. No secret or variable is added or removed.
- **AC12 — no new reading of secrets.** `load-env.ts` is unchanged. No code reads
  `.env.prod.local` or any `PREVIEW_*` variable. `rtk proxy git diff` shows no new
  `process.env[` read.
- **AC13 — operator text is accurate.** `migration-status.ts`'s `MIGRATE_COMMAND` names the
  argument (`… run migrate <environment>`). The existing `toContain("pnpm --filter
  @lemnaria/persistence run migrate")` assertions still hold.

Docs (S3):

- **AC14 — the docs say what the code does.**
  - `environments-and-resources.md` corrects G1: `migrate` never read the label, and was not a
    printed label either.
  - It states rule 2 and names `DATABASE_NAMES_BY_ENVIRONMENT` in `migration-target.ts`.
  - It adds the *Known limit*.
  - `design-db-restore.md` §3's `migrate` line gains `<the target's database name>`, with one
    sentence on the Neon-branch case pending O1.
  - `ci-and-local-gates.md`'s usage line and `.env.example`'s "Used by … run migrate" name the
    argument.

Gates:

- **AC15 — gates.** Quote the output of each, run by the coordinator:
  - `pnpm --filter @lemnaria/persistence test`, `typecheck` and `lint`, green;
  - `pnpm ci:local` before push.

  `deploy.yml` cannot be exercised; it is dispatch-only and inert (its header). It is verified by
  reading the diff against AC11, and the close-out says so rather than implying a run.

## Risks

- **R1 — a query-string database override may bypass the name [inference, unverified].**
  `test-database-url.ts` verified that libpq lets `?dbname=` override the path, and checked
  nothing for the Neon driver. Whether `@neondatabase/serverless`'s `Client` (WebSocket, used by
  `migrate`) or `neon()` (HTTP, used by `migrate:status`) honours a `?database=`, `?dbname=` or
  `?options=` key is **not established**.
  - **Security reviewer: verify against the driver source at the pinned version, 1.1.0.**
  - If either honours one, the check must refuse any URL carrying such a key, and a case for it
    joins AC2.
- **R2 — name is not identity.** See *Known limit* and O1.
- **R3 — a test that spawns the CLI could migrate a real database.** This is the incident again,
  inside the test suite. `loadEnvLocal()` fills `MIGRATION_DATABASE_URL` from
  `.env.migration.local` (production) whenever the child's env lacks it. **Safety rule, binding
  on developer and QA:**
  - Every spawned-CLI test sets `MIGRATION_DATABASE_URL` explicitly, on a `.invalid` host
    (RFC 6761; never resolves).
  - No spawned-CLI test may pass a label the real local credential could satisfy: never
    `production`, and never `lemn-conf-v2`.
  - Mismatch cases use `preview` against a URL naming `lemn-conf-v2`. Pass-through cases use an
    unlisted probe name, `lemnaria_cli_probe`, which is refused against the real credential if the
    explicit variable were ever dropped.
  - With those constraints, each case is safe even if its env setup is wrong.
- **R4 — a refused operator "fixes" the credential by editing `.env.migration.local`.** This is
  mitigated by AC4's message and the add-only rule. The message never suggests editing a file.
- **R5 — `deploy.yml`'s repository-secret inheritance (G7) turns into a visible failure.** After
  this lands, a `preview` dispatch on an inherited production secret **fails** at the Migrate step
  where today it would migrate production. That is the intended outcome, and the close-out states
  it for the owner, whose activation list in `ci-and-local-gates.md` sets the environment secrets.

## Review tier

**Full**: persistence, and the only path that runs DDL against production (`docs/WORKFLOW.md`,
*How much review a wave gets*). The order is adversarial QA, then logic and clean-code review in
parallel, **plus `configurator-review-security`**. Its card triggers on `packages/persistence`
and on env vars and provisioned resources. This diff changes what the privileged-credential path
will and will not run (ADR 0008, ADR 0096 decisions 3–4), and R1 is a security question.

## Open questions

- **O1 — restore into a Neon branch (owner or coordinator).** A branch forked from production keeps
  `lemn-conf-v2`, so `migrate` must be declared `production` to run there. That is true of the
  database name and misleading about intent. The options:
  - (a) the runbook prefers its existing throwaway-*database* route, whose unique name makes the
    check meaningful. **Recommended**: no code, and it matches rule 2;
  - (b) accept `production` for a branch restore and say so in the runbook;
  - (c) a later, separate mechanism that proves branch identity. Out of scope here.
- **O2 — branch base (coordinator).** The recommendation is `m7-room-and-presets` (G9).
- **O3 — ADR number.** Assigned by the scribe at close-out, not now, because M7 wave 7L is being
  planned in parallel and may take the next number. The ADR carries *Decision* 1–3, the
  alternatives and the *Known limit* above, and cites ADR 0096 decision 3 as extended, not
  amended.
