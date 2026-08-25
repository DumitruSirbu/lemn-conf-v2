#!/bin/sh
#
# Architectural boundaries that ESLint's no-restricted-imports does not cover.
# Run by the `boundary` CI job and by .githooks/pre-push, from the same source so
# the local gate and the remote gate cannot drift apart.

set -eu

cd "$(git rev-parse --show-toplevel)"

status=0

# The Postgres driver lives in exactly one package so all SQL stays auditable in
# one place (ARCHITECTURE_PROPOSAL.md §3; M2 work item 8).
if git grep -nE "^[[:space:]]*(import|export)[[:space:]].*from[[:space:]]+['\"](@neondatabase/serverless|pg)['\"]" \
    -- '*.ts' '*.tsx' ':!packages/persistence/**'; then
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
if git grep -nE "^[[:space:]]*(import|export)[[:space:]].*from[[:space:]]+['\"][^'\"]*design-source" \
    -- '*.ts' '*.tsx'; then
    echo "BOUNDARY VIOLATION: source imports from design-source/, which is untracked and will be deleted."
    status=1
else
    echo "OK: nothing imports from design-source/."
fi

exit "$status"
