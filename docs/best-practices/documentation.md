# Documentation and decision records

Documentation is part of the deliverable when it changes future engineering decisions.

## Decisions and corrections

- Record meaningful architectural or product choices in `docs/decisions/` or the relevant
  milestone: date, chosen option, alternatives considered, rationale, and consequences.
- Do not erase a prior decision when reality changes. Add a dated correction that identifies the
  superseded claim and evidence behind the new one.
- Read the relevant decision record before diagnosing an issue. A contradiction may be a new
  finding, but it must be explicit.

## Phase outcome

At close-out, append a concise outcome that names shipped scope, verification actually performed,
review rounds and material findings, deviations with their rationale, documentation updated, and
deferred work with its owner or future phase.

A **wave** closes earlier and more often than a phase, and it has its own check: every commit named
`M<n> wave …` must be reflected in `docs/STATUS.md` before the wave counts as complete. The rule and
the reason live in `docs/WORKFLOW.md`, *A wave is complete only once `STATUS.md` says so* — one
process document, as that file's own history requires.

## Evidence and numbers

Copy quantitative claims from inspected source output or files. Do not estimate test counts,
performance, prices, dimensions, or review totals. Describe only confirmed behaviour; plans belong
in plans, not outcomes.
