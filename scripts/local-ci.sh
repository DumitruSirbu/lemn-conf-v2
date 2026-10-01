#!/bin/sh
#
# Runs every gate the `ci` workflow runs, locally, before anything reaches
# GitHub. Private-repo Actions minutes are a limited monthly allowance; local
# minutes are free. A push that would fail CI should fail here instead.
#
# Mirrors .github/workflows/ci.yml job for job. The `boundary` and
# `lockfile:single-source` gates are the *same scripts* the workflow invokes, so
# they cannot drift; the rest are the same pnpm scripts.
#
# Deliberately runs every gate rather than stopping at the first failure: CI
# reports all ten jobs independently, and a local gate that hides the second
# failure until you have fixed the first wastes the round trip it exists to save.
#
# The `e2e` gate was added 2026-09-02, to both this script and the workflow at
# once. Until then neither ran Playwright, so §10's signature flow sat red for
# six days after a catalogue id was renamed under it while every other gate
# stayed green — the rename was consistent everywhere the unit suites look, and
# no unit test asserts a DOM test id. It is the slowest gate here by a wide
# margin (about a minute against seconds) and it needs TEST_DATABASE_URL in
# `.env.test.local` and a Playwright browser; a green run without it is not
# possible, which is the point. If it fails for a missing browser rather than a
# real defect, `pnpm --filter @lemnaria/web exec playwright install chromium`.
#
# Not covered here, and not coverable: `install` (frozen-lockfile resolution on a
# clean runner). A lockfile that is out of sync with package.json will still fail
# remotely — run `pnpm install` after changing dependencies.

set -u

cd "$(git rev-parse --show-toplevel)"

failed=""

# This script's only claim is that a green run here predicts a green run on
# GitHub. That claim holds only if both run the same toolchain. pnpm reports an
# `engines` mismatch as a WARN and carries on, which is one line among hundreds
# in a full gate log and trivially read past — a shell left on an older nvm
# default will run all eight gates to green against a runtime CI never uses.
# So these refuse to run at all rather than warning.
#
# Node and pnpm are checked against different sources on purpose, because CI
# resolves them from different places: setup-node reads ci.yml's NODE_VERSION
# (a major), while pnpm/action-setup reads package.json "packageManager" (an
# exact version). The pnpm check is therefore the stricter of the two — it has
# to be, to mean anything.

# The required major is read from package.json rather than repeated here;
# .nvmrc and ci.yml's NODE_VERSION already state it twice more.
require_supported_node() {
    required_major=$(awk '/"engines"/,/}/' package.json |
        sed -n 's/.*"node"[^"]*">=\([0-9][0-9]*\).*/\1/p' | head -1)

    if [ -z "$required_major" ]; then
        printf 'Cannot read engines.node from package.json; refusing to guess a version.\n' >&2
        exit 1
    fi

    if ! command -v node >/dev/null 2>&1; then
        printf 'node is not on PATH, and Node %s is required.\n' "$required_major" >&2
        exit 1
    fi

    running_version=$(node --version)
    running_major=${running_version#v}
    running_major=${running_major%%.*}

    if [ "$running_major" != "$required_major" ]; then
        printf 'Node %s is required (package.json engines, .nvmrc, ci.yml); found %s.\n' \
            "$required_major" "$running_version" >&2
        printf 'Gates would run against a different runtime than CI, so passing here would\n' >&2
        printf 'not predict passing on GitHub. Run `nvm use` in this shell and try again.\n' >&2
        exit 1
    fi
}

# Checked against "packageManager", not engines.pnpm. engines.pnpm (">=9.15 <10")
# is the range the repo tolerates; "packageManager" is the one version CI
# actually installs, and only an exact match predicts CI. A pnpm inside the
# engines range but outside the pin resolves peers and prunes the store its own
# way, which is precisely the class of difference this gate is meant to catch.
require_pinned_pnpm() {
    required_version=$(sed -n 's/.*"packageManager"[[:space:]]*:[[:space:]]*"pnpm@\([^"]*\)".*/\1/p' \
        package.json | head -1)

    if [ -z "$required_version" ]; then
        printf 'Cannot read packageManager from package.json; refusing to guess a version.\n' >&2
        exit 1
    fi

    if ! command -v pnpm >/dev/null 2>&1; then
        printf 'pnpm is not on PATH, and pnpm %s is required.\n' "$required_version" >&2
        exit 1
    fi

    running_version=$(pnpm --version)

    if [ "$running_version" != "$required_version" ]; then
        printf 'pnpm %s is required (package.json packageManager, which is what CI installs);\n' \
            "$required_version" >&2
        printf 'found %s. Run `corepack use pnpm@%s`, or install that version directly.\n' \
            "$running_version" "$required_version" >&2
        exit 1
    fi
}

run_gate() {
    name="$1"
    shift
    printf '\n=== %s ===\n' "$name"
    # Note the leading '[': a format string starting with '-' is read as an
    # option by printf and prints nothing.
    if "$@"; then
        printf '[gate] %s: PASS\n' "$name"
    else
        printf '[gate] %s: FAIL\n' "$name"
        failed="$failed $name"
    fi
}

require_supported_node
require_pinned_pnpm

run_gate format pnpm format:check
run_gate lint pnpm lint
run_gate typecheck pnpm typecheck
run_gate test pnpm test
# Lists tests per e2e shard and fails if one is over its runner-minutes budget (ADR 0105 Amendment A).
# After `test` on purpose: listing loads the specs, which import the workspace packages' built `dist/`.
run_gate e2e-shard-budget sh -c \
    'node --test scripts/gates/e2e-shard-budget.test.mjs && pnpm gate:e2e-shard-budget'
# CI runs this as shards per Playwright project (`--shard=i/N`: three desktop, four mobile), behind the
# `e2e (desktop)` and `e2e (mobile)` summary jobs. The shards partition the suite by whole files, so
# running everything here covers exactly the tests the seven CI legs cover between them; a local run
# gains nothing from sharding and would pay a dev-server boot per shard.
run_gate e2e pnpm test:e2e
run_gate build pnpm build
run_gate boundary sh scripts/gates/boundary.sh
run_gate lockfile sh scripts/gates/lockfile.sh
run_gate sca pnpm audit --audit-level=high --prod

printf '\n===================================\n'
if [ -n "$failed" ]; then
    printf 'LOCAL CI FAILED:%s\n' "$failed"
    printf 'Fix these before pushing — they would fail on GitHub and burn Actions minutes.\n'
    exit 1
fi

printf 'LOCAL CI PASSED — all gates green, safe to push.\n'
