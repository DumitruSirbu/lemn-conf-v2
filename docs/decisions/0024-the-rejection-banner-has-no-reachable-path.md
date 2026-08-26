# ADR 0024 — §9's rejection banner has no reachable path, and that is the rule working

Status: Accepted
Date: 2026-08-26
Type: Finding + Decision
Milestone: M4 Wave 4D — found while writing the browser tests; closes M4 with the gap named

## Context

M4's Verification section asks for "browser tests for the rejection state's three simultaneous
requirements: marked chip, retained valid value, unmoved total" (frames 2C / D2C).

Wave 4D went looking for a path to a refusal that a customer could actually reach through §9's panel,
and there is none. Not "none that was found" — none by construction:

- The replace list is the **fit-filtered** offer set. `offersFor` and `insertBody` share one
  evaluation (`resolveInsertOpening` + `evaluateInsertFit`) over the same records, voids and frozen
  columns, so every pre-probe guard agrees exactly. A row that would be refused is not offered.
- `BODY_PROBE_UNAVAILABLE` is pre-empted on the row: offer rows are disabled with that reason until
  the scene's `BodyProbe` attaches.
- `setFinish` and `setHandle` are gated on the identical `PlacementRecord` flags the domain commands
  check, so neither can refuse.
- `remove` is gated on `canDelete`, and no insertable body can become an accessory.
- Read-only disables every control (Wave 4C).

The suite proves the absence rather than asserting nothing: across the whole of §10's signature flow
and the whole §10 loop, `data-rejection` stays empty and `panel-rejection` count stays 0.

## Decision

**M4 closes with this criterion recorded as unmet-and-why, rather than met, revised away, or
quietly dropped.** Three parts:

**1. The unreachability is evidence, not a hole.** §9 states the rule directly: "Never offer what
cannot be satisfied… Every remaining refusal is a bug in a list, not a feature", and M4's own
criteria say "a refusal reaching the customer is treated as a defect in a list, not as expected
behaviour. Any refusal observed during QA is filed against the list that offered it." A panel with no
reachable refusal is that rule holding. Writing a browser test for the banner would require first
building a list that offers something the engine refuses — manufacturing the defect the rule exists
to prevent, in order to photograph it.

**2. The banner's three requirements stay covered by model tests, and that is stated plainly.**
`apps/web/tests/panel/` asserts the banner renders at the top of the panel body above every section,
including when it is the only section — the placement §9 calls out with its own WHY, because
authored inside the width section it was invisible on exactly the fixed-width bodies that refuse
most. What is *not* covered is the rendered banner in a browser, and no claim to the contrary is made
anywhere.

**3. The third requirement is deferred to M6 because it cannot exist yet.** "The total does not move"
needs a total. There is no price bar until M6, and §12 requires price to be derived from
`placements` and never stored. M6 inherits this: when the price bar lands, the 2C requirement to
verify is that a refused edit leaves the total unchanged and, on desktop, explicitly labelled
unchanged.

## Alternatives considered

- **Keep M4 open until a browser path exists.** `docs/WORKFLOW.md`'s literal rule, and it was the
  default. Rejected on the owner's direction of 2026-08-26: the criterion is unsatisfiable by a
  correct implementation, so holding the phase open would block M5 on a test that should never become
  writable. Recorded as a decision rather than an oversight.
- **Revise the criterion to the no-refusal-reaches-the-customer assertions that now exist.** Tempting
  and nearly right, but it edits the acceptance criteria to match what shipped, which is the habit
  this project's close-out rules exist to prevent. The criterion stands as written; this record says
  why it is not met.
- **Manufacture a refusal behind a test-only flag.** Rejected: a code path that exists only to make a
  test possible is a second, unreviewed way for a refusal to reach the panel.
- **Force a refusal by racing the `BodyProbe`.** Considered — tapping an offer row in the window
  before the probe attaches. Rejected: the rows are disabled in exactly that window, so it would test
  that a disabled button can be forced, not that the banner renders.

## Consequences

- M4 closes with one acceptance criterion explicitly unmet, named here and in `docs/STATUS.md`.
- **M6 inherits the third requirement** and should treat it as a carried M4 item, not a new one.
- If a future wave adds a control that *can* refuse — M5's width chips are the obvious candidate,
  since §5.4's boundary move has real failure modes — the banner becomes reachable and this test
  becomes writable. That is the moment to revisit this record.
- The standing rule is unchanged and worth restating, because it is what makes the gap acceptable:
  any refusal observed reaching the customer is filed against the **list that offered it**, not
  against the banner.
