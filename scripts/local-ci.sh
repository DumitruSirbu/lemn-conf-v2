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
# reports all nine jobs independently, and a local gate that hides the second
# failure until you have fixed the first wastes the round trip it exists to save.
#
# Not covered here, and not coverable: `install` (frozen-lockfile resolution on a
# clean runner). A lockfile that is out of sync with package.json will still fail
# remotely — run `pnpm install` after changing dependencies.

set -u

cd "$(git rev-parse --show-toplevel)"

failed=""

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

run_gate format pnpm format:check
run_gate lint pnpm lint
run_gate typecheck pnpm typecheck
run_gate test pnpm test
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
