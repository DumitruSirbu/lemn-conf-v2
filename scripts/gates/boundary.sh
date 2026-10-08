#!/bin/sh
#
# Architectural boundaries that ESLint's no-restricted-imports does not cover.
# Run by .githooks/pre-commit, `pnpm check`, .githooks/pre-push and the `boundary` CI job, from the
# same source so the local gates and the remote gate cannot drift apart.
# `boundary.test.mjs` runs this script in a scratch repository against each form it claims to refuse.

set -eu

cd "$(git rev-parse --show-toplevel)"

status=0

# Everywhere below, `--untracked` matters: without it `git grep` searches tracked files only, so a
# violation in a NEW file is invisible until after it is committed — which is exactly how a driver
# import reached `apps/web/tests/e2e` past a green local gate. A gate that cannot see the file you
# just wrote is a gate that reports on the previous commit.

DRIVER='(@neondatabase/serverless|pg)'
# The module specifier wherever it stands after an import keyword, so the last line of a
# Prettier-wrapped import, a dynamic import, a bare import and a require are all read.
SPECIFIER_AFTER_KEYWORD="(from|import|require)[[:space:]]*\(?[[:space:]]*['\"]"

# The Postgres driver lives in exactly one package so all SQL stays auditable in
# one place (ARCHITECTURE_PROPOSAL.md §3; M2 work item 8).
#
# The manifest is the strong half: a package that does not declare the driver cannot resolve it,
# however the import is spelt.
if git grep --untracked -nE "\"$DRIVER\"[[:space:]]*:" \
    -- 'package.json' '*/package.json' ':!packages/persistence/**'; then
    echo "BOUNDARY VIOLATION: a package.json outside packages/persistence declares a Postgres driver."
    status=1
else
    echo "OK: no package.json outside packages/persistence declares a Postgres driver."
fi

# The scoped name is refused as any quoted string, which also reads `vi.mock("…")`. `pg` keeps the
# keyword form because a bare "pg" is not an import. Backticks are left out on purpose: comments
# name the package in them.
if git grep --untracked -nE \
    -e "$SPECIFIER_AFTER_KEYWORD$DRIVER(/[^'\"]*)?['\"]" \
    -e "['\"]@neondatabase/serverless(/[^'\"]*)?['\"]" \
    -- '*.ts' '*.tsx' '*.mts' '*.cts' '*.js' '*.jsx' '*.mjs' '*.cjs' ':!packages/persistence/**'; then
    echo "BOUNDARY VIOLATION: a Postgres driver is imported outside packages/persistence."
    status=1
else
    echo "OK: Postgres driver confined to packages/persistence."
fi

# `design-source/` is the supplier deliverable. It is untracked and will be
# deleted from the working tree, so nothing may depend on it at runtime.
#
# Scoped to real import/export edges on purpose: the folder is named in
# provenance comments throughout the port, which AGENTS.md explicitly allows, so
# a bare string grep would false-positive on every one of them.
if git grep --untracked -nE "$SPECIFIER_AFTER_KEYWORD[^'\"]*design-source" \
    -- '*.ts' '*.tsx' '*.mts' '*.cts' '*.js' '*.jsx' '*.mjs' '*.cjs'; then
    echo "BOUNDARY VIOLATION: source imports from design-source/, which is untracked and will be deleted."
    status=1
else
    echo "OK: nothing imports from design-source/."
fi

exit "$status"
