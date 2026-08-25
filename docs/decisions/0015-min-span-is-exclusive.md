# ADR 0015 — `MIN_SPAN_M` is exclusive: a free span of exactly 300 mm produces no void

Status: Accepted
Date: 2026-08-25
Type: Finding + Decision
Milestone: M3 Wave 3A

## Context

Adversarial QA on Wave 3A found that a free span of exactly `MIN_SPAN_M` (300 mm) produced a void in
one level and not in another — the boundary was inclusive on one code path and exclusive on the
other. The inconsistency was a defect either way, but resolving it required choosing a side, and the
specification supports both readings.

**Exclusive.** `DEVELOPMENT-SPEC.md` §4's pseudocode uses strictly-greater in all three places the
comparison appears — `lo - y > MIN_SPAN` (line 163), `c.top - y > MIN_SPAN` (line 165), and
`.filter(([a,b]) => b - a > MIN_SPAN)` (line 170).

**Inclusive.** The constants table (line 66) describes `MIN_SPAN` 0.30 as "smallest span that
becomes a void", which reads as 0.30 qualifying. `docs/milestones/M2-void-engine.md`'s acceptance
criterion says "A free interval shorter than `MIN_SPAN` (0.30) produces no void" — and 0.30 is not
shorter than 0.30.

## Decision

**Exclusive.** `heightM > MIN_SPAN_M + SPAN_EPSILON_M` in `void-engine.ts`. A free interval of
exactly 300 mm produces no void.

The pseudocode governs. It is the precise, executable statement of the rule and it says the same
thing three times; the table entry names a threshold without asserting which side it falls on, and
the M2 criterion is prose summarising the same pseudocode. Where an executable statement and a prose
gloss disagree, the executable one is what the original implementation actually did, and this port's
whole fidelity argument rests on matching that behaviour rather than a paraphrase of it.

Practically, the exclusive reading is also the safer one: it withholds a 300 mm opening rather than
offering a slot that is exactly at the limit of what can be built into it.

## Consequences

- A customer is never offered a clickable slot of exactly 300 mm. One micron more and they are.
- `SPAN_EPSILON_M` exists so the comparison does not flip on floating-point accumulation from a
  level's own coordinates. It is a float epsilon and must not be confused with `FIT_TOLERANCE_M`
  (0.012), which is manufacturing slack on a *fit* — conflating the two is exactly the defect ADR
  0013's sibling finding R1.1 fixed, where the fit tolerance was lowering `MIN_WIDTH_M` and letting a
  288 mm carcass be built.
- **The prose should be corrected, not the code.** `DEVELOPMENT-SPEC.md` is the supplier's document
  and is not edited lightly, so the discrepancy is recorded here rather than patched there. Anyone
  reading the constants table or M2's criterion and concluding "inclusive" is reading a gloss, not
  the rule.

## Why this is recorded at all

It is a one-value difference in a table of tolerances, and nothing would have caught a later phase
silently flipping it: both readings pass a casual reading of the documents, and the difference is
invisible except at exactly one input. The implementer made the right call and did not flag it,
which is how a considered decision becomes an unexplained line of code that the next person
"corrects".

## Process note

This decision was verified by the coordinator rather than by the independent logic reviewer, which
was dispatched and did not report. That is weaker: the coordinator dispatched the work being
reviewed and is not a neutral party. The specific checks performed are recorded in the Wave 3A
close-out; an independent logic review of the void-derivation boundary remains worth running.
