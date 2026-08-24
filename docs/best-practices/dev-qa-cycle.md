# Development + QA cycle

This is the authoritative delivery process. A phase plan or dated decision decides *what* to build;
this document decides *how* work is dispatched, verified, reviewed, and closed.

## Scope discipline

- Give an implementation agent no more than five must-fix items and, where practical, five files.
  Split larger work into sequential waves with a mini-review between them.
- Touch the minimum surface required by the dispatch. Do not fold opportunistic refactors into a
  behavioural fix.
- Do not reinterpret a locked decision while implementing. Surface the conflict and revise the
  decision before changing the code.

## QA before review

- Every production path gets normal-path coverage, plus boundaries, empty/invalid inputs,
  transitions, and anti-invariants appropriate to the domain.
- Test what must not happen, not only desired output. For numeric or generated data, assert
  properties such as no overlap, no unclassified gap, or valid schema output.
- Sweep a meaningful input range when arithmetic or generation is involved; a few examples are not
  evidence that the transitions work.
- QA runs before reviewers. A reviewer is not a substitute for tests.

## Review continuity

- Keep the same QA/reviewer agent for follow-up rounds whenever possible. Provide the current diff
  and the earlier finding identifiers so it can verify the fix instead of rediscovering context.
- Number findings by round and item. A fix dispatch must name which finding it addresses.

## Definition of done

- Green build, lint, and existing tests do not by themselves prove the acceptance criteria.
- Every behavioural fix has a paired regression test where practical. If this cannot be done,
  explain why and treat it as an architectural concern, not a silent exception.
- A coordinator verifies each material agent claim against the actual diff and runs the relevant
  checks itself.

## Trust but verify

Before declaring an item complete, inspect the claimed lines, confirm its test exists, run the
appropriate commands, and record observed outcomes. Agent summaries are useful leads, not proof.
Remove scratch artifacts from the repository before close-out.

## Iteration and close-out

Use narrow waves. Continue until blockers are resolved and deferred issues are deliberate, named,
and owned by a later phase. Close a phase with its outcome, evidence, deviations, and documentation
updates; keep adversarial regressions in the suite.
