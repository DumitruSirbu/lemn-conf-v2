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

Run commands through the `rtk` proxy as described in `RTK.md` when supported, but treat its output
with suspicion for tools it does not model. On 2026-08-25 it reported "All files formatted
correctly" as the output of `npx prettier --version`, and zero matches for a `find` that had
matches. Both sent a debugging session down the wrong path.

When a result decides something, re-run the binary directly (`./node_modules/.bin/…`) or capture
output to a file and read the file.

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

## Rule — the whole CI gate set runs locally before every push

**Nothing is pushed to GitHub until every CI gate passes locally.** GitHub Actions minutes on a
private repository are a limited monthly allowance (2,000 on Free, 3,000 on Pro); local minutes are
free. A push that would fail CI must fail on this machine instead.

`.githooks/pre-push` runs `pnpm ci:local`, which mirrors `.github/workflows/ci.yml` gate for gate:
format, lint, typecheck, test, build, boundary, lockfile, sca.

It runs **every** gate rather than stopping at the first failure, because CI reports all nine jobs
independently — a local gate that hides the second failure until the first is fixed wastes the round
trip it exists to save. It takes well under a minute on this repository.

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
