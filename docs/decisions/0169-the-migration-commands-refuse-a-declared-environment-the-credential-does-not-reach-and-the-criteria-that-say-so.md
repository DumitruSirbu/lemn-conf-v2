# ADR 0169 — The migration commands refuse a declared environment the credential does not reach, and the criteria that say so

Status: Recorded — decision and acceptance criteria copied from the standalone plan; the implementation is present at HEAD (source-read); the plan was never closed out and no owner acceptance was found
Date: 2026-10-18
Type: Decision (recovered from the plan; the plan's own *Open questions* O3 owed this record)
Milestone: Standalone tooling-safety task (`docs/milestones/migration-environment-safety-check.md`), not part of M7 or any product milestone

**Why this record exists.** The plan's O3 says: *"ADR number. Assigned by the scribe at close-out … The ADR
carries Decision 1–3, the alternatives and the Known limit above, and cites ADR 0096 decision 3 as
extended, not amended."* The close-out never happened, and code comments cite the plan by name, with
*"Decision 2"* and *"AC1–AC5"* / *"AC6–AC9"*. [ADR 0136](0136-code-and-test-comments-carry-only-what-nothing-else-can-and-history-lives-in-the-records.md)
puts a comment's reasons in a record, and the owner's rule is that a code comment cites an ADR, never a
milestone plan. Cite as `see ADR 0169 AC3`, `see ADR 0169 Decision 2`.

**Evidence tiers.** Everything under *Why*, *Ground truth*, *Decision*, *Alternatives*, *Scope* and
*Acceptance criteria* is **doc-quoted** (or faithfully condensed) from the plan as planned on 2026-09-28 at
`7a6438a`; the plan itself labelled its claims `[source]`, `[measured]` and `[inference]` at that date and
none was re-measured for this record. Each *Status at HEAD* line below is **source-verified** (read on
2026-10-18) and says which file. **No criterion was edited to match the code.** Where the code does
more than the plan said, a *Drift note* sits beside the criterion.

**Status, honestly.** The plan's header reads *"Status: **Planned** … Nothing here is implemented."*
`docs/best-practices/environments-and-resources.md:89` says *"**Fixed, same day**
(`migration-environment-safety-check.md`)"* and `docs/STATUS.md:53` lists the plan as *"No status in the
history"*. `packages/persistence/src/migration-target.ts`, `migrate.ts` and `migrate-status.ts` exist and
call the check (read 2026-10-18). **No QA, review or close-out record of the plan was found** (grep of
`docs/STATUS.md`, `docs/archive/STATUS-history.md`, `docs/backlog/resolved.md`). The gate results of AC15 are
therefore not claimed here.

## Why (the incident)

- **Incident, 2026-09-28 (doc-quoted).** *"an agent session ran `pnpm --filter @lemnaria/persistence run
  migrate preview`, reading `preview` as a database selector. `MIGRATION_DATABASE_URL` pointed at
  production, so `0005`/`0006` were applied to production ahead of the documented 'preview then production'
  order, without a fresh production go-ahead. The migrations were additive and no data was lost."* Recorded
  in `docs/best-practices/environments-and-resources.md`, *Which file holds what*.
- **The fix recorded that day was documentation.** *"The class of mistake stays one careless reading away.
  This task makes the commands **refuse** the mismatch, so the mistake no longer depends on someone reading
  an output line."*
- **Cited by:** `migrate.ts:263`, `migrate-status.ts:199`, `migration-errors.ts:32`.

## Ground truth (G1–G9, condensed)

- **G1.** `migrate` never read its argument; the only output was `[migrate] applied … against lemn-conf-v2
  (…)` after the migrations had run. `environments-and-resources.md`'s claim that `migrate` "merely prints
  `preview` next to the database name" was wrong for `migrate`, true only for `migrate:status`.
- **G2.** `migrate:status` required the label (`readDeclaredEnvironment`, trimmed, `MigrationExecutionError`
  when empty) and only printed it; nothing compared it with the database name.
- **G3.** The governing ruling is ADR 0096 decision 3, grounded in its finding 4: the guard *"runs against
  each deployed environment **by name** … never against whatever `DATABASE_URL` resolves to"*. ADR 0096
  decision 4 is about the credential (a GitHub Actions secret, never added to Vercel). *"This task narrows
  neither ruling and overturns nothing. It turns decision 3's 'by name' from a printed line into a checked
  one."* **ADR 0096 decision 3 is extended, not amended.**
- **G4.** `databaseNameOf` returns the URL path with the leading `/` stripped; it never throws and returns
  `<unparseable connection string>` for a malformed URL.
- **G5.** The three environments have distinct database names (measured 2026-09-28, only the path segment
  printed): `lemn-conf-v2` (production), `lemn-conf-v2-preview` (preview), `lemn-conf-v2-staging` (the test
  database, in the same Neon project).
- **G6.** `test-database-url.ts` already protects by name: `ALLOWED_TEST_DATABASE_NAMES` is *"deliberately a
  name allowlist rather than a comparison"*, because pooled and direct Neon endpoints reach the same rows
  under different hostnames. *"Adding a name here is a deliberate, reviewable one-line change."*
- **G7.** `.github/workflows/deploy.yml` (manual `workflow_dispatch`, `preview` | `production`) runs
  `migrate:status "$TARGET_ENVIRONMENT"` twice (the pre-read is `continue-on-error`) and **bare `migrate`**; a
  repository secret of the same name is inherited when no environment secret is set, so *"a `preview`
  dispatch running on a production repository secret has the incident's exact shape inside CI."*
  `docs/runbooks/design-db-restore.md` §3 runs bare `migrate` against a throwaway restore target.
- **G8.** The migrate CLI's output is pinned by `tests/migrate.test.ts`, *the migrate CLI*: exactly one
  `console.log(` containing `describeMigrationRun(summary, databaseNameOf(connectionUrl))`, and exactly one
  `console.error(describeMigrationFailure(error))`.
- **G9.** Six files this task touched had diverged on `m7-room-and-presets` (branch base).

## Decision 1 — Refuse. No `--force`, no warning-and-proceed

Both commands compare the declared environment with the database name the credential actually reaches,
**before opening any connection**. On mismatch they exit non-zero having run and read nothing. The refusal
goes through the existing single failure line (`describeMigrationFailure` / `describeStatusFailure`) as a new
`MigrationTargetMismatchError extends MigrationError`.

*Status at HEAD:* `MigrationTargetMismatchError extends MigrationError` is declared in
`migration-errors.ts:34`; both CLI blocks call `assertDeclaredEnvironmentReaches` after `databaseNameOf`
and before any connect (`migrate.ts:264-272`, `migrate-status.ts:200-208`).

## Decision 2 — The rule, in full

`D` is the declared label (trimmed, as today), and `N` is `databaseNameOf(MIGRATION_DATABASE_URL)`.

- **`D` is a listed environment:** proceed only if `N` is one of that environment's names.
- **`D` is not listed:** proceed only if `D === N` exactly **and** no listed environment claims `N`. An
  ad-hoc database is declared by its own database name, for example `migrate restore_drill_2026_08_25`. A
  listed environment's database can be reached only under that environment's name, so `migrate lemn-conf-v2`
  is refused and told to say `production`.
- **Always refused:** an empty `N` and the unparseable placeholder. Comparison is exact and case-sensitive,
  so `Production` is an unlisted label and is refused against `lemn-conf-v2`.

*"This never selects or guesses a database (ADR 0096 decision 3 intact). It only refuses. The credential
remains the sole selector."*

*Status at HEAD:* implemented in `migration-target.ts:74-89`.

> **Drift note, 2026-10-18 (source-verified, nothing struck).** The plan's "always refused" list is an empty
> name and the unparseable placeholder. `migration-target.ts:69-70` and `:96-98` also refuse
> `NO_AGREED_DATABASE_NAME` (the "no name the readers agree on" placeholder from `open-database.ts`) and any
> name holding `%` or `\`. That is wider than this decision. I did not read which record or review asked for
> the widening, so I attribute it to none; [ADR 0142](0142-persistence-concurrency-migration-safety-and-api-reasons-recovered-from-code-comments.md)
> decision 6 and [ADR 0146](0146-nothing-copied-from-a-connection-value-or-thrown-by-a-driver-leaves-the-persistence-package.md)
> both concern `databaseNameOf` and are the places to look.

## Decision 3 — The mapping, and where it lives

A new pure module, `packages/persistence/src/migration-target.ts`, with no I/O, holds
`DATABASE_NAMES_BY_ENVIRONMENT: ReadonlyMap<string, readonly string[]>`: `production → ["lemn-conf-v2"]`,
`preview → ["lemn-conf-v2-preview"]`, `test → ALLOWED_TEST_DATABASE_NAMES` (imported from
`test-database-url.ts`, not copied).

- **A `Map`, not an object literal,** so `__proto__`, `constructor` and `toString` are never "listed" by
  accident.
- **`test` reuses `ALLOWED_TEST_DATABASE_NAMES` by import.** A second list of test-database names would be a
  second authority for one fact (ADR 0102). That constant gains an `export`, and its contents are unchanged.
- **No `staging` key, deliberately.** `.env.example` and `test-database-url.ts` both warn that
  `lemn-conf-v2-staging` "is NOT a staging environment". Declared `staging`, it is refused, and the message
  names `test`.
- `readDeclaredEnvironment` moves here from `migrate-status.ts`, gaining a command-name parameter so each
  CLI's usage line is correct. The new function is `assertDeclaredEnvironmentReaches({ environment,
  databaseName })`.

Adding a fourth permanent environment is a one-line reviewed edit; a temporary database needs no edit at all
(Decision 2, second bullet).

*Status at HEAD:* `migration-target.ts:29-36` (a `Map`, three entries, `test` = `ALLOWED_TEST_DATABASE_NAMES`,
no `staging` key) and `:47-60` (`readDeclaredEnvironment(argv, commandName)`).

## Alternatives considered (doc-quoted, condensed)

1. **Warn and proceed.** Rejected. For `migrate` the warning prints at the moment of the damage, a
   post-mortem; `migrate:status` already printed both names and was not the protection anyone needed. ADR
   0096 alternative 7: *"An alert is a message someone may not read."* In `deploy.yml` a warning also
   proceeds unattended.
2. **Refuse, with a `--force` override.** Rejected. A refused agent's routine next move is the override flag.
   Every legitimate case is already reachable without it. ADR 0118 argues against an escape hatch for a case
   nobody has.
3. **Strict closed list: refuse every unlisted label.** Rejected. It breaks the restore runbook's
   throwaway-database path and forces a code edit per scratch database. The permissive half of Decision 2
   costs nothing in safety.
4. **Let the label select the credential.** Rejected. It is the guessing ADR 0096 decision 3 rules out, and a
   script would read `.env.prod.local`, which is "never read by any script".
5. **Compare the host too.** Rejected on G6's reasoning (pooled and direct endpoints; CI's host unknowable).
6. **Interactive confirmation for `production`.** Rejected. The pipeline is unattended (ADR 0096 decision 2),
   and an agent answers prompts.
7. **Documentation only.** Rejected. It depends on the reading that failed.

## Known limit (stated rather than solved)

**A database name is not an identity.** A Neon branch forked from production keeps the database name
`lemn-conf-v2`, so the check cannot tell it from production and would demand the label `production`; the
same holds for any copy that keeps its name. *"The check is a tripwire against a label and credential
disagreeing, the observed failure, and it does not prove which Neon branch was reached."* (Plan O1 offered
three options for a branch restore, (a) recommended; the plan records no answer.)

## Scope

**In:** the pure module and its error class; wiring both CLIs; `migrate` gaining a required argument;
`deploy.yml`'s Migrate step passing `"$TARGET_ENVIRONMENT"`; operator text naming the argument; the four docs
that describe these commands.

**Out (Scope anchor):**
- any change to `runMigrations`, `applyMigrations`, `readDeployedSchema`, `describeMigrationStatusLine`,
  `describeMigrationRun`, or the ledger, lock or transaction;
- `load-env.ts`'s file list, and any new environment variable or secret;
- **moving `databaseNameOf` or `requireMigrationDatabaseUrl`, and any other refactor;**
- `migrate:unattended-check`, which has no database;
- any migration file.

*Cited by `migrate-status.ts:223`:* `requireMigrationDatabaseUrl` duplicates `readMigrationDatabaseUrl`
(both throw the same `MigrationExecutionError`), and consolidating the two was left out of scope here.

## Acceptance criteria

The plan's slices: **S1** the pure check (`assertDeclaredEnvironmentReaches`, AC1-AC5), **S2** the CLIs and
the pipeline (AC6-AC13), **S3** the docs (AC14). Gates are AC15.

**Safety rule R3, binding on every spawned-CLI test (doc-quoted).** Every spawned-CLI test sets
`MIGRATION_DATABASE_URL` explicitly, on a `.invalid` host (RFC 6761; never resolves). No spawned-CLI test may
pass a label the real local credential could satisfy: never `production`, and never `lemn-conf-v2`. Mismatch
cases use `preview` against a URL naming `lemn-conf-v2`; pass-through cases use the unlisted probe name
`lemnaria_cli_probe`. The reason: `loadEnvLocal()` fills `MIGRATION_DATABASE_URL` from `.env.migration.local`
(production) whenever the child's env lacks it, so a test that spawns the CLI could otherwise migrate a real
database.

### The pure check (S1)

- **AC1 — the mapping is exactly three entries.** `production → ["lemn-conf-v2"]`, `preview →
  ["lemn-conf-v2-preview"]`, and `test` is **the same array reference** as `ALLOWED_TEST_DATABASE_NAMES`
  (`toBe`, not `toEqual`). There is no `staging` key. The container is a `Map`.
- **AC2 — a listed label passes only on its own names.** Each of the four pairs passes. Property
  (fast-check): for every listed label `L` and every string `N` not in `L`'s names, the check throws
  `MigrationTargetMismatchError`. Fixed cases that must throw include the other environments' names, `""`,
  the unparseable placeholder, `lemn-conf-v2 ` (trailing space), `LEMN-CONF-V2`, `lemn-conf-v2-preview` under
  `production`, and `lemn-conf-v2` under `preview`, which is the incident.
- **AC3 — an unlisted label passes only as the exact, unclaimed database name.** Property: for arbitrary `D`
  not listed and arbitrary `N`, the check passes **iff** `D === N`, `N` is claimed by no listed environment,
  `N !== ""`, and `N` is not the placeholder. Fixed cases: `restore_drill_2026_08_25` passes against itself;
  `lemn-conf-v2` as a label is refused, and the message names `production`; `lemn-conf-v2-staging` as a label
  is refused, and the message names `test`; `staging` and `Production` are refused; `__proto__`,
  `constructor` and `toString` are refused against `lemn-conf-v2`.
- **AC4 — the refusal says what to do and leaks nothing.** The message names the declared label; the
  database reached; the expected name or names for a listed label, or the environment that claims `N`; that
  nothing was run or read; the per-invocation override (`MIGRATION_DATABASE_URL=… pnpm …`); and that
  `.env.migration.local` must not be edited to do it. It never contains a URL, host or credential. The
  function only receives a name; AC7 proves the CLI end.
- **AC5 — `readDeclaredEnvironment` keeps its contract.** It still trims and still refuses an empty or
  whitespace argument with a message matching `/needs the name of the environment/`. Its usage line names the
  command that called it, so `migrate` does not tell the operator to run `migrate:status`.

### The CLIs (S2)

- **AC6 — `migrate` requires the declaration.** With no argument, or whitespace: exit 1, one `[migrate]`
  failure line, and no connection attempted (stderr has no `Could not connect`).
- **AC7 — `migrate` refuses a mismatch before connecting.** Child env
  `MIGRATION_DATABASE_URL=postgres://probe-user:probe-secret-7f3a@db.example.invalid/lemn-conf-v2`, argument
  `preview`. Expected: exit 1; stderr contains `MigrationTargetMismatchError`; stderr does **not** contain
  `Could not connect`; stdout has no `[migrate] applied` line; neither stream contains `probe-secret-7f3a`,
  `probe-user`, `db.example.invalid` or `://`.
- **AC8 — `migrate` proceeds past the check when it should.** Child env URL
  `…@db.example.invalid/lemnaria_cli_probe`, argument `lemnaria_cli_probe`. Stderr contains `Could not
  connect to "lemnaria_cli_probe"`. This proves the check let it through to the connect step, and that the
  refusal in AC7 is the check rather than a connection failure.
- **AC9 — `migrate:status` refuses before reading.** AC7's setup through `migrate:status`. Expected: exit 1
  and `[migrate:status] MigrationTargetMismatchError`, with no `Could not read the schema` line. AC8's setup
  produces `Could not read the schema of "lemnaria_cli_probe"`.
- **AC10 — nothing below the CLI changed.** The signatures and behaviour of `runMigrations`,
  `applyMigrations`, `readDeployedSchema`, `describeMigrationStatusLine` and `describeMigrationRun` are
  unchanged. The live suites pass with no label. `tests/migrate.test.ts` *the migrate CLI* passes
  **unedited** (G8); an implementer who needs to edit that pin stops and reports it.
- **AC11 — `deploy.yml` changes by one token.** The Migrate step becomes `run migrate
  "$TARGET_ENVIRONMENT"`. The two `migrate:status` steps, the triggers, `environment:`, the secrets and
  `continue-on-error` are byte-identical. No secret or variable is added or removed.
- **AC12 — no new reading of secrets.** `load-env.ts` is unchanged. No code reads `.env.prod.local` or any
  `PREVIEW_*` variable. `rtk proxy git diff` shows no new `process.env[` read.
- **AC13 — operator text is accurate.** `migration-status.ts`'s `MIGRATE_COMMAND` names the argument
  (`… run migrate <environment>`). The existing `toContain("pnpm --filter @lemnaria/persistence run
  migrate")` assertions still hold.

### Docs (S3) and gates

- **AC14 — the docs say what the code does.** `environments-and-resources.md` corrects G1, states Decision
  2's rule and names `DATABASE_NAMES_BY_ENVIRONMENT` in `migration-target.ts`, and adds the Known limit;
  `design-db-restore.md` §3's `migrate` line gains `<the target's database name>` with one sentence on the
  Neon-branch case pending O1; `ci-and-local-gates.md`'s usage line and `.env.example`'s "Used by … run
  migrate" name the argument.
- **AC15 — gates.** Quote the output of each, run by the coordinator: `pnpm --filter @lemnaria/persistence
  test`, `typecheck` and `lint`, green; `pnpm ci:local` before push. `deploy.yml` cannot be exercised
  (dispatch-only and inert); it is verified by reading the diff against AC11. **No gate output for this task
  was found; none is claimed.**

*Status at HEAD, tests citing these criteria (source-verified, headers read 2026-10-18):*
`tests/migration-target.test.ts` (AC1-AC5; its property comments at `:94` and `:197` cite AC2 and AC3),
`tests/migration-target-cli.test.ts` (AC6-AC9, with R3 stated in its header), and
`tests/migration-target.adversarial.test.ts` (adversarial QA of the plan; `:472` cites AC8's line). AC11 and
AC12 are about `deploy.yml` and the diff and were **not** checked for this record. AC14 is partly visible:
`environments-and-resources.md:73-107` states the rule, names the map and carries the Known limit.

## Risks (doc-quoted, condensed)

- **R1 — a query-string database override may bypass the name [inference, unverified].** Whether
  `@neondatabase/serverless` (1.1.0) honours `?database=`, `?dbname=` or `?options=` was not established when
  planned; the security reviewer was to verify it against the driver source, and if either client honours
  one, the check must refuse any URL carrying such a key. **The outcome is not in the plan**; see
  [ADR 0142](0142-persistence-concurrency-migration-safety-and-api-reasons-recovered-from-code-comments.md)
  decision 5 for the libpq finding.
- **R2 — name is not identity.** See *Known limit*.
- **R4 — a refused operator "fixes" the credential by editing `.env.migration.local`.** Mitigated by AC4's
  message and the add-only rule; the message never suggests editing a file.
- **R5 — `deploy.yml`'s repository-secret inheritance (G7) becomes a visible failure.** After this lands, a
  `preview` dispatch on an inherited production secret **fails** at the Migrate step where it would
  otherwise migrate production. That is the intended outcome.

## Review tier (doc-quoted)

**Full**: persistence, and the only path that runs DDL against production (`docs/WORKFLOW.md`, *How much
review a wave gets*): adversarial QA, then logic and clean-code review in parallel, plus
`configurator-review-security`. **No review record was found for this task.**

## Consequences

- A comment that needs this task's reasons cites `ADR 0169` with an anchor: *Why (the incident)*, *Decision
  2*, *Scope* (Out), *AC1-AC5*, *AC6-AC9*. The plan stays where it is; no code comment needs to cite it.
- ADR 0096 decision 3 is extended, not amended. [ADR 0142](0142-persistence-concurrency-migration-safety-and-api-reasons-recovered-from-code-comments.md)
  decision 6's "Where recorded elsewhere" now has a decision record to point at.
