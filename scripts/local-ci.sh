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

# This script's only claim is that a green run here predicts a green run on
# GitHub. That claim holds only if both run the same Node major. pnpm reports an
# `engines` mismatch as a WARN and carries on, which is one line among hundreds
# in a full gate log and trivially read past — a shell left on an older nvm
# default will run all eight gates to green against a runtime CI never uses.
# So this refuses to run at all rather than warning.
#
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
