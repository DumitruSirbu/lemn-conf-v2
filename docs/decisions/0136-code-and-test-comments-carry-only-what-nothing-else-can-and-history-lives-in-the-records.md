# ADR 0136 — Code and test comments carry only what nothing else can, and history lives in the records

Status: Accepted
Date: 2026-10-05
Type: Decision
Milestone: Cross-cutting (all phases); executed as a stripping pass over source, then tests

## Context

Owner ruling, 2026-10-05: code and test comments are bloated with decision history that already
lives in `docs/milestones/` and `docs/decisions/`. Every agent re-reads those comments on every file
read, which costs tokens and adds no value, and history in code goes stale silently.

Measured 2026-10-05 by an awk count of lines starting with `//`, `/*` or `*`:

- non-test TypeScript: 27,818 of 87,720 lines (31%);
- test files: 41,200 of 294,704 lines (13%).

The largest: `packages/configurator-domain/src/void-engine.ts` (904 comment lines), `catalog.ts` (790),
`packages/three-adapter/src/kitchen-parts.ts` (651).

**Decision-record sweep (WORKFLOW.md, *Sweep the decision records*).** No earlier record rules on a
comment policy, so none says the opposite. Records that mention comments are consistent with this
one: 0041, 0127 (the durable reasoning is in the ADR, not only in a comment) and 0042 (the comments
inside migration SQL are load-bearing; SQL is not in scope here and keeps them). The remaining hits
are corrections of individual false comments (0010, 0011, 0012, 0045, 0050, 0081, 0086, 0091). No
supersession is needed.

## Decision

1. A comment survives only if it passes the test and takes the form in
   `docs/best-practices/engineering-conventions.md`, *Comments in code and tests*. The rubric lives
   there and is not repeated here, so it has one home.
2. Decision history is recorded in an ADR or milestone file, never in source.
3. A load-bearing reason found in a comment with no ADR home is kept, compressed, and listed by the
   stripping pass as "needs an ADR home"; the architect files those afterwards.

## Alternatives considered

- Strip only the largest files. Rejected: the cost is paid on every file read, so the policy must be
  uniform to be worth stating.
- Leave history in code as a convenience. Rejected: it goes stale silently, and the records are where
  a reviewer can correct it.

## Consequences

- A one-time stripping pass over non-test source first, then tests. It must be proven comment-only
  by comparing emitted JS against HEAD, plus a count of tool-directive comments before and after
  (the count must not drop; equal or more is accepted).
- The JS comparison proves the code is unchanged. It cannot see lint and cannot see lost knowledge,
  so the pass also: runs ESLint on the changed files (`no-empty` and `no-fallthrough` are live,
  `eslint.config.mjs` lines 303-304, source-verified); runs every package's unit suite, not only the
  edited package's, because tests here read source text (84 test/script files at HEAD, measured by
  the coordinator with git grep for `readFileSync`/`readFile`; whether any assert on comment content
  is not verified); and has the first source batch's deletions audited by the logic reviewer before
  further batches run.
- Existing rules that stay as they are: the deferred-test header comment, and *A comment claiming a
  guard is not a guard* (both in the conventions file).
- The two measurements above are the baseline; a later count must be re-run, not inferred.
