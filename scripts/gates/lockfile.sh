#!/bin/sh
#
# A second lockfile is a supply-chain ambiguity: it lets a resolver pick
# dependencies nobody reviewed. Run by the `lockfile:single-source` CI job and by
# .githooks/pre-push, from the same source so the two cannot drift apart.

set -eu

cd "$(git rev-parse --show-toplevel)"

status=0

foreign="$(git ls-files -- ':!.claude/**' | grep -E '(package-lock\.json|yarn\.lock)$' || true)"
if [ -n "$foreign" ]; then
    echo "FOREIGN LOCKFILE(S) present in project tree:"
    echo "$foreign"
    status=1
else
    echo "OK: no foreign lockfiles."
fi

count="$(git ls-files -- ':!.claude/**' | grep -cE '(^|/)pnpm-lock\.yaml$' || true)"
if [ "$count" != "1" ] || [ ! -f pnpm-lock.yaml ]; then
    echo "Expected exactly one root pnpm-lock.yaml, found $count:"
    git ls-files | grep -E 'pnpm-lock\.yaml$' || true
    status=1
else
    echo "OK: exactly one root lockfile."
fi

exit "$status"
