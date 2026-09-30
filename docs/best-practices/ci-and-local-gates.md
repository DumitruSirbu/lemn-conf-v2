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

### A synchronous block of a minute fails the `test` job, and passes every test

Vitest 3.2 gives each worker-to-main RPC call a fixed 60 s timeout, with no option to change it
(`birpc`'s `DEFAULT_TIMEOUT`, `vitest/dist/chunks/index.B521nVV-.js:3`). A worker whose event loop is
blocked for that long cannot read the main process's reply to its task-status call, so the run ends
with `Error: [vitest-worker]: Timeout calling "onTaskUpdate"` as an **unhandled error**: every file and
test reports passed and vitest still exits 1. Reproduced 2026-09-30 with a 65 s busy loop (a 58 s one
was fine). The runner hit it in PR run 36756620268, where `qa-7d5b-s0-pre-state-census` ran 68 s, nearly all of it one
`beforeAll` and the six U grid files ran 38-57 s each as one test.

The runner runs a sweep about 1.5-3x slower than a laptop, so what matters is the block, not the test
count. Two rules in `packages/configurator-domain`:

- **A sweep that loops over rooms awaits `yieldToTheEventLoop()`** (`tests/support`) between rows,
  keeping every block to seconds. A census in a `beforeAll` and a sweep inside one `it` are both blocks.
- **`tests/support/yield-between-tests.setup.ts`** yields after every test, because the runner steps
  from one test to the next on microtasks and a file of back-to-back synchronous tests is one block for
  their sum (`qa-7d3-tall-end-block` failed this way at 22 s against a 20 s stand-in).

To rehearse a runner locally, lower the timeout in every process with a preload that rewrites
`setTimeout(fn, 60000)` to 20000 and pass it as `NODE_OPTIONS="--import <file>"`: 3x slower than this
machine. The same run is red before those two changes and green after.

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

**Practical constraint, observed 2026-09-29:** the auto-mode permission classifier denied a
`--no-verify` docs commit even though `WORKFLOW.md` permits `--no-verify` on intermediate commits.
When the harness blocks a `--no-verify` that policy allows, the fallback is to commit **with hooks**
instead of arguing with the classifier — the coordinator did this for the M7B U0 docs commits
(`3e76ea6`, `5462a6c`), and both passed the hook's build steps anyway.

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
format, lint, typecheck, test, **e2e-shard-budget**, **e2e**, build, boundary, lockfile, sca. Locally
`e2e` is not sharded: the CI shards partition the suite by whole files, so one local run covers
exactly what the CI legs cover between them, and sharding would only add a dev-server boot per shard.

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

`.github/workflows/ci.yml` runs these jobs so each can be a separate required status check: install,
format, lint, typecheck, test, build, boundary, lockfile:single-source, sca, and the e2e family
described in the next section (`e2e (desktop)`, `e2e (mobile)`, `e2e-shard-budget`, and the shard
jobs behind the first two). Job names are a contract — renaming one breaks its branch-protection
binding.

Third-party actions are pinned by full commit SHA, with the tag recorded in a trailing comment.
`permissions: contents: read`; in-flight runs are cancelled only for pull requests, so post-merge
`main` runs always complete.

**The `test` job's ceiling is raised, not split (owner ruling, 2026-09-30).** It runs every package's
unit suite serially in one job with `timeout-minutes: 30`. The limit was 15 until PR run 36765806056
cancelled it: the domain package alone took 14.9 min on the runner. The owner chose to raise the
ceiling over splitting the job per package: unit tests are cheap, and each extra machine repeats
install and build. ADR 0105 A's split-per-machine budget governs the **e2e** legs only. If the
`test` job nears 30 minutes, put the choice to the owner again rather than raising it silently.

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

## e2e in CI: shards, the two summary checks, and the per-shard test budget

*Added 2026-09-30, [ADR 0105](../decisions/0105-the-e2e-job-splits-by-playwright-project-rather-than-raising-its-ceiling-again.md)
Amendment A, on the owner's ruling "3 shards per project" and the direction to budget how many tests a CI
machine carries. Read the workflow's own comments for the history; this section is the rule.*

### Job layout

| Job id | Name in the checks list | Runs | On a pull request |
| --- | --- | --- | --- |
| `e2e-desktop-shard` | `e2e shard (desktop, i/3)` | `playwright test --project=desktop --shard=i/3` | skipped |
| `e2e-mobile-shard` | `e2e shard (mobile, i/4)` | `playwright test --project=mobile --shard=i/4` | skipped |
| `e2e-desktop` | **`e2e (desktop)`** | the summary over the desktop shards | skipped |
| `e2e-mobile` | **`e2e (mobile)`** | the summary over the mobile shards | skipped |
| `e2e-shard-budget` | `e2e-shard-budget` | the budget guard below; lists tests, no browser | runs |

**The contract with branch protection is the two summary names, `e2e (desktop)` and `e2e (mobile)`.**
They are the names the single `e2e` job carried, so sharding changes nothing a required-checks list
says. The shard names are free to change and must **not** be required checks.

- Each summary `needs` only its own project's shard job, runs `if: always()` and **fails unless that
  job's result is `success`** — a skipped or cancelled shard is a failure, so it cannot go green by
  absence. (`always()` is what lets it fail: without it a failed `needs` leaves it skipped, and a
  skipped required check counts as passing.) On a pull request it carries the shards' own
  `github.event_name != 'pull_request'` condition and reports **skipped**, as the old job did; GitHub
  counts a skipped required check as passing, so nothing new can block a pull request.
- There are **two shard jobs, not one six-leg matrix**, because a job's `needs` names whole jobs and a
  matrix job's result aggregates all its legs: one matrix could feed only one summary, and
  `e2e (desktop)` would go red for a mobile failure. Two jobs also let each project carry its own
  shard count. The price is one step list written twice; change both together.
- Artifact names are per project, shard and attempt (`playwright-trace-desktop-1-attempt-1`):
  `actions/upload-artifact@v4` fails on a duplicate name (checked against the pinned SHA's README),
  and an artifact belongs to the *run*, so re-running a failed shard would otherwise collide with its
  own first trace.
- `workers` stays 1 and `fullyParallel` false (ADR 0105 decision 2). Sharding adds machines, not
  contention. The e2e legs stay behind `needs: [install, test]` and stay off pull requests.

**Something the owner may need to change in branch protection.** Nothing for the existing checks:
`e2e (desktop)` and `e2e (mobile)` keep their names. `e2e-shard-budget` is a new job name; it reports on
every event, so it may be added to the required list, and nothing breaks if it is not. One correction
to an old note: before the summaries existed, the skipped job on a pull request was named with the
*unexpanded* `e2e (${{ matrix.project }})` (run 36734585613), so nothing ever reported under
`e2e (desktop)` on a pull request; now something does, as `skipped`.

### The per-shard test budget

**Rule (owner, 2026-09-30): every e2e shard is budgeted to at most 30 minutes on the runner, from
measured per-test rates, and the tests per shard are counted, not guessed.** The figures live in one
place, `scripts/gates/e2e-shard-budget.mjs` (`MEASURED_RUNNER_RATES`, `TARGET_MINUTES_PER_SHARD`,
`SHARDS_PER_PROJECT`); do not copy them into prose that can drift. As of 2026-09-30:

| | desktop | mobile |
| --- | --- | --- |
| Measured on the runner [measured: run 34580253814's job logs] | 84 tests, 37.8 min | 109 tests, 26.1 min |
| Seconds per test | 37.8 x 60 / 84 = **27.0** | 26.1 x 60 / 109 = **14.4** |
| Budget at 30 min | 1800 / 27.0 = 66.7, so **66** a shard | 1800 / 14.4 = 125.3, so **125** a shard |
| Tests on the branch | 185 | 393 |
| Shards the budget requires | 3 (the largest, 70, is the ratchet below) | **4**: three shards put 138 on the largest |

**What the rates are, stated so nobody over-trusts them.** They come from `main` at `995ad03`, the
only runner evidence there is; this branch's suite had never run on a runner. The two rows are on
different bases, both erring toward a smaller budget: desktop is Playwright's own
`82 passed, 2 failed (37.8m)`, and a failed test runs to its 120 s timeout; mobile is the job's wall
clock (26.1 min), where Playwright's own figure was 24.9. Each rate includes one `next build` (about a
minute) that every shard now pays again. The 30-minute target leaves 15 minutes under the 45-minute
job ceiling for setup (about 0.8 minutes outside the E2E step in that run) and that build.

**The guard** is `pnpm gate:e2e-shard-budget`, the `e2e-shard-budget` job and a gate in
`scripts/local-ci.sh`. For each project it runs `playwright test --list --shard=i/N` for every shard,
fails when any shard lists more tests than its budget, and prints how many shards the project needs
(it tries larger counts until one fits). It also fails if `ci.yml`'s `matrix.total` or `matrix.shard`
disagree with `SHARDS_PER_PROJECT`, and if the shards do not add up to the whole project's tests. Its
own logic is under `node --test scripts/gates/e2e-shard-budget.test.mjs`, which the CI job and the
local gate run first. Watched failing on 2026-09-30: with mobile set to three shards it reports the
three shards at 138, 129 and 126 and says "mobile needs 4 shards". Listing needs the workspace built
and `TEST_DATABASE_URL` set, because `--list` loads the Playwright config and every spec.

**When a shard is over budget, add a shard.** Raise `matrix.total` and `matrix.shard` in the job in
`ci.yml` and `SHARDS_PER_PROJECT` together. **Never raise `timeout-minutes`**: the 45-minute ceiling is
a hang detector, not a schedule (ADR 0105, Alternatives and A2 rule 4).

**Re-measure after any `ci` run where a shard's e2e time drifts more than 20% from what the budget
predicts** (predicted minutes = tests in the shard x that project's seconds per test / 60). Read each
shard's `N passed (Xm)` line from its job log, derive `X x 60 / N` per project, update
`MEASURED_RUNNER_RATES` (including `sourceRun`) and the table above in the same commit, and let the
guard say whether the shard counts still hold. The first full sharded run is the first real
measurement of this branch's suite on a runner; treat its numbers as replacing the projection below.

### Two things the count does not tell you

**1. A file is never split, so one file can exceed the budget by itself.** `fullyParallel` is false and
Playwright shards by whole file. `room-desktop-line.desktop.e2e.spec.ts` alone holds 69 desktop tests
against a budget of 66, so no shard count can satisfy a count budget of 66 for desktop. The guard
enforces a **ratchet** of 70 for desktop instead (`RATCHETED_CEILINGS`): today's largest shard, which
stops growth and lets the tree pass. It only comes down; lower it when that file is split and delete it
once the derived budget is enough. **This is an exception the guard carries, not a finding that 70 is
acceptable**, and it is the owner's to keep or remove.

**2. Tests are not equal, so a count budget can pass a slow shard.** Measured locally 2026-09-30 with
`--workers=1`, through `next dev` on the maintainer's laptop (full run green: desktop 185 passed;
mobile 391 passed, 2 skipped), desktop costs 5.1 s a test on average but `room-desktop-line` costs
0.4 s a test, while a handful of one-test journeys (`qa-7i-mirror-captures` 71 s, `qa-7j-straight-captures`
60 s, `mirror-real-flow` 44 s) cost more than a minute each. Playwright balances shards by count, so
time is not balanced.

**Projected minutes per shard.** *[inference] — local per-test durations times a runner-to-local
factor; nothing here was run on a runner.* The factor is calibrated on the files `main`'s run had, which
today hold exactly the same test counts (84 desktop, 109 mobile): desktop 37.8 min on the runner
against 8.6 locally is **4.4x** (about 3.8x once the two failed tests' timeouts and the build are taken
out); mobile 24.9 min against 9.6 locally is **2.6x** (about 2.5x without the build). The runner's
software GL makes the factor project-specific, which is why one number is not used for both.

| Shard | Tests | Local min | Projected runner test phase | Job (phase + ~0.8 min setup) |
| --- | --- | --- | --- | --- |
| desktop 1/3 | 63 | 9.0 | 34 to 39 (3.8x to 4.4x) | 35 to 40 |
| desktop 2/3 | 70 | 0.6 | 2 to 3 | 3 to 4 |
| desktop 3/3 | 52 | 6.3 | 24 to 27 | 25 to 28 |
| mobile 1/4 | 106 | 7.7 | 19 to 20 | 20 to 21 |
| mobile 2/4 | 114 | 4.9 | 12 to 13 | 13 to 14 |
| mobile 3/4 | 88 | 5.1 | 13 | 14 |
| mobile 4/4 | 85 | 6.4 | 16 to 17 | 17 to 18 |

**Read it plainly: mobile is comfortably inside the budget, and desktop shard 1 is not.** It passes the
count guard (63 of 66) and projects 34 to 39 test-phase minutes, over the 30-minute target and inside
the 45-minute ceiling with about five to ten minutes of margin. The count cannot see that, because
desktop shard 2 is 69 nearly-free tests. Four desktop shards would balance by time (largest 5.4 local
minutes, about 21 to 24 on the runner) but split the counts 48/85/30/22, and 85 is over the ratchet, so
the guard as written rejects the better layout. Whether to weight the guard by per-file time, raise the
ratchet with a fourth shard, or split `room-desktop-line` is a decision for the owner; none of them is
taken here. **Replace this table with the first real sharded run's numbers.**

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
