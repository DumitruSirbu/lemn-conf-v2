# CI, local gates, and tooling configuration

**Read this when:** running the build/test commands, changing lint or formatting configuration,
adding or editing a CI gate, or diagnosing a hook that blocked a commit or a push.

## Root development commands

Use Node 24 and pnpm 9.15.9 (`.nvmrc` pins Node; `nvm use` picks it up). If a command stops you with
a version complaint, run `nvm use` — that is almost always the whole fix.

Two guards enforce this, at different widths:

- **`.npmrc` sets `engine-strict=true`**, which turns the `engines` mismatch from a WARN into a hard
  failure for **every** pnpm command in this repository — `pnpm test`, `pnpm build`, an editor task,
  and both git hooks, since all of them go through pnpm. It is repository-scoped, so other projects
  on the same machine that still need an older Node are unaffected.
- **`scripts/local-ci.sh` additionally checks the toolchain itself** before the first gate. This is
  narrower in reach but sharper: it also pins pnpm, which `engines` only bounds by range.

The two checks read different sources, matching how CI resolves each: Node comes from
`engines.node` (a major, also in `.nvmrc` and `ci.yml`'s `NODE_VERSION`), pnpm from
`packageManager`, which `pnpm/action-setup` installs **exactly**. So the pnpm check is an exact
match while the Node check is a major match. Bumping `packageManager` therefore tightens the local
gate automatically; `engines.pnpm` stays the looser range the repo publishes for consumers.

From the repository root:

```bash
pnpm install
pnpm format         # prettier --write .
pnpm format:check   # prettier --check .
pnpm lint           # eslint, --max-warnings 0, every package
pnpm lint:fix       # eslint --fix, every package
pnpm typecheck
pnpm test
pnpm build
pnpm check          # format:check + lint + typecheck + test
pnpm ci:local       # every CI gate — run before each push
```

`pnpm check` runs formatting, linting, type checking, and unit tests in that order. `pnpm ci:local`
additionally runs build, boundary, lockfile and audit — the full CI set, and what
`.githooks/pre-push` enforces.

### The `rtk` proxy: do not trust it for verification

Run commands through the `rtk` proxy as described in `docs/best-practices/rtk-proxy.md` when supported, but treat its output
with suspicion for tools it does not model. On 2026-08-25 it reported "All files formatted
correctly" as the output of `npx prettier --version`, and zero matches for a `find` that had
matches. Both sent a debugging session down the wrong path.

When a result decides something, re-run the binary directly (`./node_modules/.bin/…`) or capture
output to a file and read the file.

**The rule, sharpened by four more instances: exit codes are trustworthy, filtered output text is
not.** The filter summarises to save tokens, and a summary that drops the lines you were reading for
is indistinguishable from a clean result — which is worse than verbosity, because it ends the
investigation instead of prolonging it.

- `diff a b` returned **`[ok] Files are identical`** for two files differing on three lines, one of
  them a load-bearing ADR citation. `rtk proxy diff a b` showed the divergence (2026-09-11).
- An `eslint --stdin` probe that flagged a real error came back as **`ESLint: No issues found`**.
- ~~A `prettier --check` over `docs/` reported **passing** on files it would have restyled.~~
  **WITHDRAWN 2026-09-17 — this was never an rtk failure, and it is R5's.** `.prettierignore:3` is
  `docs/`, added in the **initial commit** `e56f207` (2026-08-25) — the same day this instance was
  recorded. **Real Prettier exits 0 over `docs/` too, reading nothing**, so the observed "passing" was
  correct output about an empty set, not a filtered summary. The bullet's premise — *"files it would
  have restyled"* — is false: Prettier would have restyled none of them. Found by the scribe adding
  the Rules section, which reported the misattribution rather than inheriting it. **It moves to
  `../WORKFLOW.md` R5, where it is the earliest known instance — three weeks before the behaviour was
  identified, sitting in the evidence list that justifies a different rule.**
- A `grep -E 'a|b'` alternation returned **nothing** where both alternatives matched.

So: **run it as `rtk proxy <cmd>` whenever the *absence* of content is the signal** — is this a
duplicate, did content survive a move, do two copies agree, does this file lint clean. Brief
dispatched agents to do the same.

**That heuristic is necessary and not sufficient**, sharpened 2026-09-17: the filter also returns
*present* values that are wrong — a count of **1** unpushed commit where the true count was 0, and a
commit summary in place of a diff. Both would have passed the "expect it to be empty" test and been
believed. The binding question is whether you are about to **assert, cite or act on** the output, not
whether you expect it to be empty; those instances are in `../WORKFLOW.md`, **R9**. Separately, rtk reformats `grep -n` output, so a pipeline doing
`awk -F: '{print $1}'` gets the **path** rather than the line number; anything parsing grep output
needs `rtk proxy` too.

**`pnpm exec vitest <anything>` can become a full test run under the hook.** During M7 wave 7T's S2a
probe (2026-09-22), the rtk hook rewrote `pnpm exec vitest --version` into a full test run — against
`packages/persistence`, that means a live-database run against the shared test database, not a version
probe. Run a version or config probe of vitest through `rtk proxy`, or read
`node_modules/vitest/package.json` directly instead of invoking the binary. Separately, when chaining
`pnpm --filter <pkg> test` with a reporter flag, put `--reporter=…` **after** a bare `--`
(`pnpm --filter <pkg> test -- --reporter=…`) — without it, `--reporter` is parsed by `pnpm` itself
rather than handed to the underlying test runner.

### Never pipe a gate through `tail` or `head`

A pipeline's exit status is the **last** command's. `pnpm ci:local 2>&1 | tail -60` reports `tail`'s
success, not the gate's. Redirect instead, and read the status:

```sh
rtk proxy pnpm ci:local > "$SCRATCH/ci-local.log" 2>&1; echo "CI_EXIT=$?"
```

**Why this is a rule and not a style note.** Closing M7 wave 7E2 on 2026-09-14 that exact pipe
reported **exit code 0** while the gate had printed `LOCAL CI FAILED: e2e`. It was caught only
because `scripts/local-ci.sh` prints its verdict banner near the end and the banner happened to
survive inside the kept 60 lines; two lines further from the end and a red tree would have been
pushed as green. The same pipe then **destroyed the diagnosis**: `tail -60` kept 62 lines, so every
e2e failure message was discarded. The failure never reproduced — a full re-run was green on every
gate, e2e alone at 191 passed / 2 skipped — so it is recorded permanently as an unexplained
transient. The evidence existed exactly once.

Treat any "exit code 0" from a piped command as **unverified**. `run_in_background` is right for
`ci:local`, which takes roughly ten minutes with e2e — but its completion notice reports the
*pipeline's* status too, so the redirect still matters.

**`git push` is a ten-minute command**, because `.githooks/pre-push` reruns the whole gate. Background
it from the start rather than discovering it against a tool timeout.

### Why recursive scripts are serialised

The root recursive scripts run with `--workspace-concurrency=1`. Several packages depend on
`@lemnaria/configurator-domain` and each builds it through its own `build:deps`, so running them
concurrently puts multiple `tsc` processes on the same `dist/` and produces spurious "error type"
lint failures on a cold tree. The constraint is also recorded in `package.json`'s `//scripts` note.

Any package with a workspace dependency must build it before `lint`, `typecheck` and `test`. A
script that relies on a `dist/` left behind by an earlier command works on a developer machine and
fails in a fresh clone — which is exactly what a CI runner is.

## Formatting and linting configuration

Formatting is pinned by `.prettierrc.json` — an explicit statement of Prettier's own defaults
(80 columns, double quotes, semicolons, trailing commas). It exists so a future Prettier release
cannot silently reformat the tree. Do not change a setting in it to accommodate one file.

ESLint's configuration lives in `eslint.config.mjs` (flat config): `strictTypeChecked` plus
`stylisticTypeChecked`, and the architectural boundaries — the domain package may not import React,
Next.js, Three.js, the adapter or catalog data; the adapter may not import React, Next.js or the app
shell; `apps/web` must import workspace packages through their public entry points. Those
`no-restricted-imports` rules are the enforcement behind `ARCHITECTURE_PROPOSAL.md` §3 and are not
advisory. No `eslint-config-prettier` is needed: typescript-eslint v8 ships no formatting rules, so
there is nothing for Prettier to conflict with.

## Rule — format and lint before every commit

**Every commit must be formatted and lint-clean.** Enforced by a repository-managed Git hook, not
left to memory.

`.githooks/pre-commit` formats the staged files in place, re-stages them, then runs `pnpm lint`
across the workspace. A lint error aborts the commit. `pnpm install` enables it by pointing
`core.hooksPath` at `.githooks` via the root `prepare` script; to enable it by hand in a fresh
clone:

```bash
git config core.hooksPath .githooks
```

The hook deliberately does **not** run `pnpm typecheck` or `pnpm test`. The persistence suite talks
to a live Neon database, so including it would fail commits for anyone offline or without
credentials. The full gate runs before the push instead.

Do not bypass the hook with `git commit --no-verify`. If the hook is wrong, fix the hook.

### `pnpm typecheck` is the only gate that typechecks a test file

**`lint` does not, and `test` does not.** A brief that asks for "lint, the suite and `format:check`" has
omitted the gate that reads the test files, and a type error in a test survives all three.

- `lint` runs `pnpm run build && eslint .`, and `build` uses **`tsconfig.build.json`, which includes
  only `src/index.ts` and its import closure.** No test file is in it.
- **vitest does not typecheck at all** — it strips types and runs.
- `typecheck` runs `tsc --project tsconfig.json --noEmit`, the **test-inclusive** config, per package.

Measured 2026-09-15 on wave 7D4 S1: a new test dereferenced an optional catalogue field, and `lint`
(exit 0), the 4,264-test domain suite (exit 0) and whole-tree `format:check` (exit 0) all passed while
`pnpm typecheck` returned exit 2 on `error TS18048`. Nothing broken could have reached `main` — the
gate is in `scripts/local-ci.sh` and in CI — but **it fails at push time, ten minutes in, with the
tree held for the whole run** ([agent-coordination.md](agent-coordination.md): a push is a verifier
and holds the tree).

**So: name `typecheck` explicitly in every implementer brief, and run it after any edit to a test.**
The failure mode is not a broken build; it is a gate reported green by someone who ran three of the
four gates that existed.

### Two consequences of how the hook works, both of which bite when several agents share the tree

**1. `pnpm lint` is workspace-wide, so a commit needs a *quiet tree*, not merely non-conflicting
paths.** The hook lints all four packages regardless of what is staged
(`.githooks/pre-commit:44`). A commit touching **only `docs/`** therefore fails whenever anyone has
an in-progress edit under `apps/` or `packages/` — a half-written function with one unused import is
enough. On 2026-09-15 a docs commit failed on a developer's unused variable in
`apps/web/src/room/use-generation.ts`: `HEAD` did not move and the docs change was left **staged
against a tree its author did not own**, which is how two agents end up sharing one commit. Either
wait for the implementer to report, or say plainly that the commit is blocked instead of retrying.
If it must be unwound, **`git reset` (no `--hard`)** unstages without touching anyone's work —
never `git checkout --` or `--hard`, which destroy the in-flight edit.

**2. The hook re-stages whole files, so partial staging does not survive it.** It runs Prettier over
the staged paths and `git add`s them back (`.githooks/pre-commit:40-42`), re-staging each file
entirely. `git add -p` and `git apply --cached` both **silently lose the split**. On 2026-09-09 two
agents were editing `docs/backlog/open.md`, one adding entry 50 and one entry 60; the second staged
only its own two hunks, verified the split was clean, committed — and swept the other's 50-line entry
into its commit anyway (`4618046`). Nothing was lost or altered, the text was byte-identical, but the
work is attributed to a commit about a different entry. **Two agents may not share a file in this
repository; sequence them.** The coordination rules that follow from this are in `docs/WORKFLOW.md`
under ~~*Running agents in parallel*~~ ***Team coordination*, and under *Rules* R1, R2, R3 and R8.**
*(Corrected 2026-09-17: no section named "Running agents in parallel" has ever existed in that file.
Found by the scribe adding the Rules section, which reported it rather than papering over it — a dead
pointer on the one sentence R2 and R3 both lean on, so a reader following it to check "two agents may
not share a file" would have found nothing and concluded the rule was unwritten.)*

## Rule — the whole CI gate set runs locally before every push

**Nothing is pushed to GitHub until every CI gate passes locally.** GitHub Actions minutes on a
private repository are a limited monthly allowance (2,000 on Free, 3,000 on Pro); local minutes are
free. A push that would fail CI must fail on this machine instead.

`.githooks/pre-push` runs `pnpm ci:local`, which mirrors `.github/workflows/ci.yml` gate for gate:
format, lint, typecheck, test, **e2e**, build, boundary, lockfile, sca.

It runs **every** gate rather than stopping at the first failure, because CI reports all ten jobs
independently — a local gate that hides the second failure until the first is fixed wastes the round
trip it exists to save. Every gate but one takes seconds; `e2e` takes about a minute, because it
boots a dev server and drives a real browser through it.

### The `e2e` gate, added 2026-09-02, and why it is worth its minute

Until that date **nothing anywhere ran Playwright** — not this script and not the workflow. The
consequence was measured, not imagined: §10's signature flow sat red for **six days** after ADR 0033
merged two catalogue rows and renamed `base-2door` to `base-cabinet`, while every other gate stayed
green throughout. Nothing was wrong with those gates. The rename was consistent everywhere the unit
suites look, and **no unit test asserts a DOM test id** — the panel builds its own from
`offer-${row.buildId}`. That class of defect is invisible to everything except a browser.

Two things it needs, and it fails loudly rather than skipping when they are missing, which is the
point: `TEST_DATABASE_URL` in `.env.test.local` (the suite writes designs, so ADR 0006 keeps it off
the application database), and a Playwright browser — `pnpm --filter @lemnaria/web exec playwright
install chromium` if it complains about one. A gate that silently passes when it cannot run is the
thing this gate exists to replace.

**A third failure mode is not loud, and it cost the M6B close-out two full runs (2026-09-11): a
second `next dev` in the same directory.** Next 16 refuses to start a second dev server against a
directory that already has one running, **regardless of port** — `E2E_PORT` only changes which port
Playwright's own server binds to, and does not sidestep a peer session's `pnpm --filter
@lemnaria/web dev` already running on `:3000` in the same checkout. The run reports **zero tests**
rather than a bind error, which looks like a green exit at a glance and is easy to mistake for
"nothing to test" instead of "the server that should have booted never did." Check for another `next
dev` in the same directory before trusting a zero-test e2e run.

#### `pnpm ci:local` does not run e2e against a production build — only CI does

**The mechanism, because the conclusion alone invites someone to re-litigate it.**
`playwright.config.ts:83-85` picks the `webServer` command from `process.env.CI !== undefined` (read
once into `isContinuousIntegration` at `:15`): a runner gets `pnpm run build && next start`, every
other machine gets `next dev`. `scripts/local-ci.sh:128` runs `run_gate e2e pnpm test:e2e` and
**never sets `CI`** — the name appears nine times in that file and every one is a comment, so a grep
that looks like confirmation is not one. So every local e2e run — including the one inside
`ci:local`, whose closing banner reads *"LOCAL CI PASSED — all gates green, safe to push"*
(`scripts/local-ci.sh:141`) — exercises the dev server.

**An acceptance criterion that names a production build is therefore satisfiable only by CI, and
must not be recorded as met locally.** The claim is plausible from the gate's *name*, and on
2026-09-14 a close-out was "corrected" into asserting exactly that. Two greps and `printenv CI`
settled it. It matters because M7 wave 7F1's defects D4 and D5 were both found in a production build
and neither was visible under `next dev`: writing the criterion off as locally satisfied would have
retired the check that catches the class.

#### A green local e2e run is not evidence about a runner-only failure

The runner's WebGL stack paints roughly **2 s per frame** while an orbit drag is in flight — measured
2026-09-07 from a Playwright trace, where a 12-step `mouse.move` took **25.9 s**. A local machine
cannot be slowed to that: swiftshader plus `Emulation.setCPUThrottlingRate` at 20× still keeps frame
gaps under 500 ms, because the bottleneck on the runner is its software GL stack rather than its CPU.

So for any assertion whose correctness depends on frame timing or animation settling, **a passing
local run proves nothing** — including a full `scripts/local-ci.sh`. Diagnose from the CI trace
artifact (`gh run download`, then parse `0-trace.trace` JSONL for `before`/`after` records and call
durations), treat the next CI run as the only verdict, and say so rather than reporting the fix as
verified.

**When writing such a test, never express "settled" in wall-clock milliseconds.** Scale the threshold
to the machine's own observed frame gap, or the rule degenerates on the runner and silently reads a
moving value.

The `boundary` and `lockfile:single-source` gates are the **same shell scripts** the workflow
invokes (`scripts/gates/`), not reimplementations. That is deliberate: a local gate that has drifted
from the remote one is worse than no local gate, because it reports a pass that means nothing.

The hook skips on ref deletion, where there is nothing to test.

One gate cannot be reproduced locally: `install`, which resolves the lockfile from scratch on a
clean runner. Run `pnpm install` after changing any dependency, or the remote build will still fail.

Do not bypass with `git push --no-verify`. If a gate is wrong, fix the gate.

## Rule — when adding a gate, prove it fails

A gate is only real once you have watched it reject the thing it exists to reject.

Both boundary greps originally used `\b`, which `git grep -E`'s POSIX ERE does not support. They
matched nothing and reported green in CI while checking nothing. The same class of mistake would
have made the `format` job pass unconditionally had it run `prettier --write` instead of `--check`.

Write the violation, stage it, watch the gate fail, then remove it and watch the gate pass. Note
that `git grep` only searches tracked files, so a probe file must be `git add`ed to be seen.

**The same rule inverted covers a deliberately-failing test.** An `it.fails` that never actually
fires is a permanently-green test asserting nothing — so make its assertion pass artificially,
confirm the marker itself goes red, then restore. The convention for deferred tests, and when to use
`it.fails` rather than `skip`, is in `docs/WORKFLOW.md` under *QA before review*; it lives there
rather than here so there is one home for it.

## CI workflow shape

`.github/workflows/ci.yml` runs nine jobs so each can be a separate required status check: install,
format, lint, typecheck, test, build, boundary, lockfile:single-source, sca. Job names are a
contract — renaming one breaks its branch-protection binding.

Third-party actions are pinned by full commit SHA, with the tag recorded in a trailing comment.
`permissions: contents: read`; in-flight runs are cancelled only for pull requests, so post-merge
`main` runs always complete.

The `test` job needs the `TEST_DATABASE_URL` repository secret, pointing at the dedicated Neon test
database. `DATABASE_URL` is deliberately unset there: no application runs in CI, so there is no
application database for the isolation guard to compare against. A Postgres service container is not
usable — the driver is `@neondatabase/serverless`, which speaks HTTP/WebSocket to Neon.

**Which persistence files run live, and why some do not, is a machine-checked fact — read it from
`packages/persistence/tests/live-suite-census.test.ts`, not from this paragraph.** Before M7 wave 7T
(2026-09-22), five live suites gated themselves on `Boolean(process.env["DATABASE_URL"])`, which this
job never sets, so they reported a green `test` job without ever executing — the census exists to
make that mismatch a red test rather than a silent skip. The census's own literal table is the source
of truth for the count and the split; do not restate it here, because a second copy of a number that
can change is a second thing to be wrong (this is why wave 7T's own draft comment, which stated a
file count, was itself wrong within the wave that wrote it — see
[ADR 0128](../decisions/0128-live-persistence-suites-serialise-through-a-declared-transaction-scoped-readers-writer-lock.md)).
In shape rather than in number: most live files resolve `TEST_DATABASE_URL` and hold one of two lock
modes for the file's whole run (exclusive for anything that mutates the shared ledger or schema,
shared for anything that only reads or mints rows); two files keep the `DATABASE_URL` gate because
they assert something true only of the *application* database; a handful of files skip by design
under CI's environment, each with a stated reason rather than an unexplained gap. **The lock every
live file registers into is [ADR 0128](../decisions/0128-live-persistence-suites-serialise-through-a-declared-transaction-scoped-readers-writer-lock.md)'s**
— a declared, transaction-scoped readers–writer lock that stops two runners against the same shared
Neon database (a laptop and CI, or two agents' gates) from corrupting each other's migration state,
the failure BACKLOG 69 recorded before the lock existed.

**Every persistence Vitest file is live in a checkout carrying `.env.test.local`**, whatever its
describe block says — `vitest.config.ts`'s `loadEnvLocal()` loads `TEST_DATABASE_URL` unconditionally,
so "non-live" must be established by the file's own gate, not by inspection. To run one file
non-live, empty the three connection variables on the command line: `TEST_DATABASE_URL=
DATABASE_URL= MIGRATION_DATABASE_URL= pnpm --filter @lemnaria/persistence exec vitest run …`
(measured 2026-09-23, M7 wave 7E3c: a live file then skips instead of connecting).

## Mutation testing across the package boundary: `apps/web` reads `dist/`, not `src/`

`apps/web` resolves `@lemnaria/configurator-domain` to the package's **built `dist/`**, not its
source. Vitest loads anything under `apps/web/src` from source, so a mutation there is seen
immediately — but a mutation in `packages/configurator-domain/src` is **invisible to the web suite
until the domain package is rebuilt**.

This matters only for mutation testing, and it matters a great deal there. Found during M5B wave
5B4a, 2026-09-01: reverting the column split first read as store **3/3 green**, and only after a
rebuild did all three store tests fail. That is a false clean — the most expensive kind, because it
looks exactly like a passing gate.

**The rule: rebuild `packages/configurator-domain` before running the web suite against a
domain-source mutation.** Without it you are measuring the previous build.

**Reading a stale result you already have.** The failure is one-directional, which is what makes
older evidence salvageable. A stale `dist` runs *unmutated* domain code, so the suite behaves as if
nothing changed and reports **green**. It can therefore produce a false green but never a false red.
So a mutant reported **red** at the store is trustworthy whatever the build state; only a **green**
is suspect. A mutant killed by the domain suite is killed regardless — a stale web green beside a
domain red carries no conclusion and invalidates nothing.

## Deploy: migrate, prove the schema, then deploy

`.github/workflows/deploy.yml`, added under [ADR 0096](../decisions/0096-the-deployed-schema-is-proved-by-a-gate-and-production-was-never-in-the-runners-path.md)
decision 2. Before it existed, nothing anywhere ran a migration: `ci.yml` had no migrate job and no
deploy job, and Vercel builds `apps/web` through `build:deps && next build`, a chain that reaches
`persistence`'s `build` script and never its `migrate` script. Production went seven days missing
`0004_add_design_revision.sql` while every customer edit answered 500.

**The workflow is inert as committed.** It has no `push` trigger, its deploy step is skipped unless
a deploy secret exists, and without `MIGRATION_DATABASE_URL` it fails at its first assertion having
opened no database. Vercel's Git integration is untouched and is still the deploy path.

### Activating it, in order

1. **Create `MIGRATION_DATABASE_URL`.** GitHub → Settings → Secrets and variables → Actions. It is
   the privileged Neon credential that can run DDL, and it is deliberately **not** added to Vercel:
   Vercel scopes variables by environment and never by phase, so a value placed there is readable by
   the running application, reversing [ADR 0008](../decisions/0008-least-privilege-database-role.md).
   Per-environment credentials go under Settings → Environments → `production` / `preview` →
   Environment secrets, under that same name; a repository secret of the same name is inherited when
   no environment secret is set, so one value works to begin with. *Verify:* run the workflow from
   the Actions tab against `preview` and read the "Assert the migration credential is present" step.
2. **Run it by hand against `preview` first.** Actions → deploy → Run workflow → `preview`.
   *Verify:* the "Verify by reading the schema back" step prints `preview (<database>) — level` and
   a `read back:` line quoting the ledger versions, the `designs` columns and the document
   `schema_version`s. That read-back is the evidence, never the migrate step's exit status
   ([ADR 0020](../decisions/0020-a-migration-file-is-not-an-applied-migration.md) decision 2).
3. **Run it by hand against `production`.** Same, with `production`. *Verify:* the same `— level`
   line, and then a save observed to succeed against the deployed app by reloading the share link
   and seeing the change — not by the absence of an error notice (ADR 0096 decision 10).
4. **Create `VERCEL_DEPLOY_HOOK_URL`** (Vercel → Project → Settings → Git → Deploy Hooks), as a
   GitHub secret of that name. Until it exists the workflow migrates and verifies but deploys
   nothing, and says so in a step of its own — so migrate and deploy are **not yet ordered** with
   respect to one another. A `vercel deploy --prebuilt` step is the equivalent if the deploy needs
   to pin the exact commit rather than the branch head. *Verify:* re-run against `preview` and see
   the "Deploy" step run instead of the "Report that deployment is still Vercel's to trigger" step.
5. **Only then, decide about Vercel's Git integration.** Ordering migrate before deploy is only real
   once the pipeline is what triggers the deploy. Turning off Vercel's automatic deploys is the last
   step and a deliberate one — ADR 0096 accepts its cost explicitly: deployment becomes one more
   thing that can be misconfigured, mitigated by the guard that fails when it is.
6. **Add a `push: branches: [main]` trigger** to the workflow if the runs should stop being manual.
   ADR 0096 decision 6 is the constraint: the preview job runs on the **default branch's** preview
   deployments, and a feature branch whose migration has not merged deploys against a preview
   database that is behind its code — which the guard reports as a failure on that branch, naming
   the file. That is the wanted outcome; it makes an unmerged migration visible to its author
   instead of applying it to everyone (preview and local development share one database,
   [ADR 0054](../decisions/0054-local-development-writes-to-the-preview-database.md)).

### The two commands the workflow runs, which are usable by hand

- `pnpm --filter @lemnaria/persistence run migrate:status <environment>` — read-only. Reads the
  ledger, the `designs` columns and the document `schema_version`s, hands the ledger to the same
  pure `planPendingMigrations` the runner uses, and exits non-zero on anything but level. A database
  with **no `schema_migrations` table** is reported as *outside the ledger entirely*, with the
  adoption path named — not as a `relation does not exist` stack trace, and not as "behind", because
  the ledger is the runner's own creation rather than a migration file's
  ([ADR 0042](../decisions/0042-the-database-records-which-migrations-it-ran.md) decision 1) and the
  repair is different. The environment name is a required argument: a check whose subject depends on
  which untracked `.env` file the machine happens to hold is a coincidence with a test name.
- `pnpm --filter @lemnaria/persistence run migrate:unattended-check` — no database. **It refuses
  every statement it does not positively recognise as additive and idempotent** (ADR 0096
  decision 5). The recognised set is small and is sized to what the four shipped files need:
  `create table if not exists`, `alter table … add column if not exists` (with each not-null clause
  carrying its own default), a non-concurrent `create index if not exists`, the `pg_constraint`-
  guarded `DO` block `0003` uses, `comment on`, and `insert into`. Anything else — a drop, a
  truncate, a delete or update over existing rows, a column type change, a not-null column with no
  default, a statement Postgres refuses inside a transaction block, or simply a shape nobody
  anticipated — is refused and named.

  It was written the other way round first, as a denylist of destructive shapes, and adversarial QA
  broke it seven ways without writing a single unusual statement: every rule had assumed a keyword
  PostgreSQL makes optional (`DROP revision` without `COLUMN`, `UPDATE designs d SET …`,
  `UPDATE ONLY …`, `ADD owner_id text NOT NULL`), and one asked whether the *statement* mentioned a
  default rather than whether that *clause* carried one. A denylist over a language the size of SQL
  keeps leaking, and these files are about to run unattended against production. Refusing by default
  makes the error direction a property of the design rather than of the list's completeness: an
  unforeseen statement fails toward *a human reads it*. A false refusal costs one manual apply with
  the owner's authorisation, which is the path that class of migration takes anyway.
