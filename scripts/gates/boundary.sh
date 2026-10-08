#!/bin/sh
#
# Architectural boundaries that ESLint's no-restricted-imports does not cover.
# Run by .githooks/pre-commit, `pnpm check`, .githooks/pre-push and the `boundary` CI job, from the
# same source so the local gates and the remote gate cannot drift apart.
# `boundary.test.mjs` runs this script in a scratch repository against each form it claims to refuse.

# -f: the pathspecs below are globs for git to read; the shell must not expand them against the
# repository's root first.
set -euf

cd "$(git rev-parse --show-toplevel)"

status=0

DRIVER='(@neondatabase/serverless|pg)'
# The module specifier wherever it stands after an import keyword, so the last line of a
# Prettier-wrapped import, a dynamic import, a bare import and a require are all read.
SPECIFIER_AFTER_KEYWORD="(from|import|require)[[:space:]]*\(?[[:space:]]*['\"]"
SOURCE_FILES="*.ts *.tsx *.mts *.cts *.js *.jsx *.mjs *.cjs"
OUTSIDE_PERSISTENCE=':!packages/persistence/**'

# Takes the violation's sentence, the clean sentence, then `git grep` patterns and pathspecs.
# `--untracked` matters: without it `git grep` reads tracked files only, and a gate that cannot see
# the file just written reports on the previous commit.
# `git grep` exits 1 for no match and above 1 for its own failure, which must not read as clean.
refuse_matches() {
    violation=$1
    clean=$2
    shift 2
    found=0
    git grep --untracked -nE "$@" || found=$?
    case "$found" in
        0)
            echo "BOUNDARY VIOLATION: $violation"
            status=1
            ;;
        1) echo "OK: $clean" ;;
        *)
            echo "BOUNDARY GATE ERROR: git grep failed (exit $found) while checking: $clean"
            status=1
            ;;
    esac
}

# The Postgres driver lives in exactly one package so all SQL stays auditable in
# one place (ARCHITECTURE_PROPOSAL.md §3; M2 work item 8).
#
# The manifest is the strong half: a package that declares the driver neither by its name nor
# behind an npm alias cannot resolve it, however the import is spelt.
refuse_matches \
    "a package.json outside packages/persistence declares a Postgres driver." \
    "no package.json outside packages/persistence declares a Postgres driver." \
    -e "\"$DRIVER\"[[:space:]]*:" \
    -e "\"npm:$DRIVER(@|\")" \
    -- 'package.json' '*/package.json' "$OUTSIDE_PERSISTENCE"

# The scoped name is refused as any quoted string, which also reads `vi.mock("…")`. `pg` keeps the
# keyword form because a bare "pg" is not an import. Backticks are left out on purpose: comments
# name the package in them.
# Not read: a relative path into another package's node_modules, and any driver but these two.
# shellcheck disable=SC2086 # SOURCE_FILES is a list of pathspecs, split on purpose.
refuse_matches \
    "a Postgres driver is imported outside packages/persistence." \
    "Postgres driver confined to packages/persistence." \
    -e "$SPECIFIER_AFTER_KEYWORD$DRIVER(/[^'\"]*)?['\"]" \
    -e "['\"]@neondatabase/serverless(/[^'\"]*)?['\"]" \
    -- $SOURCE_FILES "$OUTSIDE_PERSISTENCE"

# `design-source/` is the supplier deliverable. It is untracked and will be
# deleted from the working tree, so nothing may depend on it at runtime.
#
# Scoped to real import/export edges on purpose: the folder is named in
# provenance comments throughout the port, which AGENTS.md explicitly allows, and as a quoted
# path in the lint configuration, so a bare string grep would false-positive on each of them.
# Not read, and no manifest stands behind it: `vi.mock("…")` of the folder, and a template-literal
# or next-line specifier.
# shellcheck disable=SC2086
refuse_matches \
    "source imports from design-source/, which is untracked and will be deleted." \
    "nothing imports from design-source/." \
    -e "$SPECIFIER_AFTER_KEYWORD[^'\"]*design-source" \
    -- $SOURCE_FILES

exit "$status"
