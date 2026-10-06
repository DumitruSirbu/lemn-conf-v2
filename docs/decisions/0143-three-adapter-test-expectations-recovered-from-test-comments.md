# ADR 0143 — Three-adapter test expectations recovered from test comments

Status: Accepted
Date: 2026-10-06
Type: Finding (recovered reasons; no behaviour changes)
Milestone: Cross-cutting (M7 wave 7H shell, M6 mark composite); filed under ADR 0136 decision 3

**Why this record exists.** [ADR 0136](0136-code-and-test-comments-carry-only-what-nothing-else-can-and-history-lives-in-the-records.md)
decision 3. **Evidence tier for every decision: recovered from a test comment on 2026-10-06, not
re-measured.** Figures are quoted from the pre-pass comments. "Q7H-2" and "Q7H-4" are the comments' own
ids for 7H plan questions; **the comments do not say who ruled them**, so they are recorded as "ruled"
without attribution and are not presented as owner rulings. Cite as `see ADR 0143 decision N`.

## Decision 1 — the corner overhang is fixed at 300 mm, and the test writes the number as a literal

- **Rule.** The shell's corner overhang is fixed at **300 mm** (the comment: "Ruled fixed at 300 mm
  (Q7H-2)").
  [ADR 0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md)
  mentions `CORNER_OVERHANG_M` (the drawn wall is `toMetres(mm) + CORNER_OVERHANG_M`) but not the 300 mm
  figure's ruling.
- **Why a literal in the test.** "A constant read from the production file would agree with itself": the
  test writes `CORNER_OVERHANG_M = 0.3` as the expectation rather than importing it from the module under
  test.
- **Why the overhang is fixed, and what it costs.** The floor and the two wall planes run this far past
  the corner "so the planes meet without a visible seam"; it is "fixed, not proportional: a construction
  detail, not a room dimension" (the `CORNER_OVERHANG_M` comment in `kitchen-shell.ts`). At a 900 mm wall
  a third of the 1200 mm plane sits behind the corner: **accepted appearance, not a defect**.
- **Where.** `packages/three-adapter/tests/kitchen-shell.room-shaped.test.ts`;
  `packages/three-adapter/src/kitchen-shell.ts` (`CORNER_OVERHANG_M`).

## Decision 2 — the wall-A backsplash follows the room's wall A, not the records and not a literal 3.5 m

- **Rule.** The backsplash means *"behind the worktop"* and spans the corner to the end of **the room's**
  wall A (Q7H-4).
- **Two readings were refused, and are named so the next reader does not restore one.**
  - It does **not** follow the records as [ADR 0045](0045-the-run-end-panel-follows-the-run-it-closes.md)'s
    run-end panel does: records never reach a shell build, and plumbing them there is a larger change than
    the wave's scaling rule.
  - It is **not** left a literal 3.5 m: that only made sense while the drawn wall ran past the entered one.
- **The four numbers the ruling was made on, at the seeded room (comment's figures):** the base run ends
  at 3500 mm, the run-end panel seats at 3510, the backsplash spanned 0 → 3500, and the room is 3560.
- **Where.** `packages/three-adapter/tests/kitchen-shell.room-shaped.test.ts` ("the wall-A backsplash
  follows the room").

## Decision 3 — the mark-composite margin window is 0.1 units, chosen against the table it polices

- **Rule.** `MARGIN_TOLERANCE_UNITS = 0.1`: how far a recorded margin may drift before the test is wrong
  about it. An exact float is not pinned, because [ADR 0091](0091-an-instruments-premise-is-re-quantified-and-the-product-claim-inside-it-becomes-a-wave.md)
  finding 1 records that *Stejar Halifax* measures 59.31 composing its tint in floating point and 59.61
  rounding the tinted base to integers first, so an exact-float criterion is decided by where a
  `Math.round` was placed rather than by the colour.
- **Why 0.1.** The number is chosen against the table it polices, not against that 0.3 gap. The window
  must be narrower than the closest gap between any two recorded values. The comment's figures: the two
  *Stejar* decors, "59.80 and 59.31 apart" in its words; at a window of 0.5 they could be swapped in
  `RECORDED_WOOD_MARGINS` with the file still green, which is ADR 0091 decision 4b's *"a named set, not a
  minimum"* decaying back into a minimum. The recorded values are two-decimal measurements; "a
  re-composition that moves a wood by 0.3 is meant to be read, not absorbed".
- **Related, recorded.** ADR 0091 records the 59.31 / 59.61 / 59.80 measurements at its finding 1; the
  window choice is stated only here.
- **Where.** `packages/three-adapter/tests/qa-6m-mark-composite.adversarial.test.ts`.
