# ADR 0034 — §9's width chips are column-scoped, and each one is judged by running the command

Status: Accepted
Date: 2026-08-27
Type: Decision
Milestone: M5 — wave 5D

## Context

M4 shipped §9's width section with every non-current chip `blocked`. That was truthful: no resize
command existed, and a `free` chip is a clickable promise of a move nothing implements. The
milestone recorded the rule that would have to replace it — **a chip is `free` if and only if
`setWidth` at that width would succeed** — and named three tests pinning M4's truth that M5 must
turn over deliberately rather than delete.

Wave 5C built `setWidth`. Two questions were then open, and the milestone's work item 3 answers only
the first of them explicitly.

**Which widths get a chip at all.** The panel read `meta.sizesMm`, which `describeSelection` resolves
from the **selected body's** catalogue entry. ADR 0031 resizes a **column**: every member moves, and
`setWidth` narrows against `intersectColumnWidths` over all of them. So the two disagreed wherever a
column's members declare different sets. Measured on the shipped kitchen, the panel was rendering
**76** chips where the engine recognises **62**, and it was wrong in both directions:

- `A|2.00` holds the 450/600 dishwasher (`p1`) under an open shelf (`p12`) and a wall cabinet
  (`p18`). The panel offered the dishwasher a 450 chip; the column refuses it. **Corrected after
  logic review measured it:** the first version of this record blamed the open shelf, and the shelf
  is innocent — `open-shelf` declares a standard ladder, so its range is 300 upward and it accepts
  450 quite happily. The member that refuses is `p18`, a `wall-cabinet`, whose ranges are 200–400 and
  600–800: 450 sits in ADR 0033's deliberate gap between a one-door and a two-door cabinet. The
  conclusion was right and the named cause was not — and it was wrong in the direction that reads as
  "ladder rows bind", which inverts ADR 0031 rule 5, the rule this very example exists to illustrate.
- `A|3.20` holds `p4` — a `base-drawer3-600`, whose declared equivalent is `base-3drawer` — under two
  wall cabinets. (**Also corrected:** this said `base-panbank`, which is `base-drawer2-600`'s
  equivalent and is not placed in the shipped kitchen at all since ADR 0027 merged `p2`/`p3`.) It
  declares a **standard ladder** (ADR 0031 rule 5), so it constrains the column by its floor alone
  and the column accepts 300 — a width the panel did not offer at all.

Fourteen chips across three columns, over-offering and under-offering by the same cause: two code
paths answering one question. This is the defect class ADRs 0016, 0017, 0021, 0029 and 0032 each
record, arriving in the one section §9 had left unwired.

**How the freedom answer is computed.** Whether a width is reachable depends on the whole column, on
which side has empty space, on what an opening would come to lie over once the boundary moves, and
on what the builders actually measure. `panel-model.ts` can see none of that, and §12 forbids product
logic in components regardless.

## Decision

1. **The chip row is the column's, not the body's.** `columnWidthChoices` (beside `setWidth`, in
   `commands/set-width.ts`) publishes the candidate widths from the same `intersectColumnWidths` the
   command narrows against. `meta.sizesMm` stays what it is — a fact about one body — and the panel
   stops reading it for chips.
2. **Each candidate is judged by running `setWidth` and discarding the design.**
   `queries/width-options.ts` asks the command once per width. It does not model the answer. One code
   path decides what a resize may do, so "offered" and "accepted" cannot drift apart.
3. **`active` is read off the body, never out of a refusal code.** `setWidth` does refuse its own
   current width — `WIDTH_UNCHANGED`, deliberately, so rule 2 needs no exception — but it reaches
   that check only on a column it could otherwise resize. A column holding an immovable member
   refuses **every** width before it looks at which one was asked for, and §9 requires exactly one
   `active` chip on every body it renders a section for. Measured: `p19` and every body in such a
   column would have had none.
4. **A refused chip carries the engine's own `RejectionDetail`**, rendered through the one
   `renderRejection`. This is ADR 0032 rule 2 applied to the width section: the chips are what may be
   picked, and the reason is why *this* width was refused, authored once.
5. **Exactly one thing suppresses the section: the selected body resolving no set of its own.** A
   pre-migration `cooktop-600`, or a row whose `catalogEquivalentId` points nowhere — missing
   catalogue data, which FINDING R2.7 and M4's logic review arranged to fail loudly. The current
   width is folded into a set that exists; it never conjures one.

   **Amended after logic review L2/L3.** The first implementation also suppressed the section when
   the *column* resolved nothing — an empty intersection — and that was wrong, for the reason this
   whole ADR exists: a disagreement between bodies is a fact about the column, and ADR 0032 says such
   a fact is rendered with the engine's reason, not dropped. It was reachable with every member
   perfectly resizable (a `base-bottle-cargo` at 200/300 under a `hood` at 600/900), and it discarded
   a `WIDTH_NOT_SUPPORTED` the engine had already computed. Worse, it answered *two ways*: a column
   with an immovable member fell back to the body's own set and rendered chips carrying
   `COLUMN_MEMBER_NOT_RESIZABLE`, while a column with disjoint sets rendered nothing at all.

   **The rule is therefore: a width section renders whenever the selected body has a set, and a
   column that cannot agree on a width explains itself on the chips** — whichever way it fails to
   agree. A single-chip section is an accepted consequence of that rule (`A|2.00`'s intersection is
   `{600}`, so `p1`, `p12` and `p18` each render one chip), and it is the honest one: the body does
   have that width, and the alternative is a control that vanishes without saying why.
6. **The selected body's own resizability is answered in the domain, not by §9's flag alone.** A
   `fixedWidth` body resolves a perfectly good set; `columnWidthChoices` returns nothing for it, so
   `canWidth` is not the only thing standing between the customer and a section of dead controls.

## What this is not

- **Not a new rule about what may be resized.** `setWidth`'s guards are untouched. What changes is
  that the panel now asks the question before the tap instead of after it.
- **Not a claim that width editing works on the shipped kitchen.** ADR 0031 funds a resize from an
  adjacent column that is empty at **every** level, and the shipped kitchen has none at load — so
  every chip in it is still `blocked`, for a reason that is now about space rather than about a
  missing command. Wave 5E's browser gate needs a delete in front of it; the domain suite proves
  chips go free once a column is cleared.

## Alternatives considered

- **Derive freedom in `panel-model.ts` from `meta` plus a rule.** Rejected twice over: §12 forbids it,
  and no projection over one placement can see the column, the empty space or the probe. It is also
  the exact shape of every defect cited in Context.
- **Publish a lighter "can this column move at all" flag and let the panel colour chips from it.**
  Rejected: it answers a different question. A column can be movable and still refuse a particular
  width — the sink's 560 mm aperture, `NON_INTEGER_MILLIMETRES` on an odd delta — and a per-column
  flag would mark those chips free.
- **Keep the per-body chip row and let the tap refuse.** Rejected as §9's rule verbatim: never let the
  customer choose what cannot be satisfied. It is also what ADR 0017 was written to stop.
- **Re-implement the candidate intersection inside the query.** Rejected: two authors for one rule,
  which is the thing this record exists to remove. The function is exported from the command's own
  module instead.

## Consequences

- **The panel runs the command once per chip, on every selection change.** Memoised in
  `use-panel-view.ts` on the design, the columns, the selection and the probe. Seventeen bodies with
  62 chips across the shipped kitchen costs single-digit milliseconds; if that ever stops being true
  the fix is caching, not a second opinion.
- **The query needs the `BodyProbe`,** so the store now publishes it (`bodyProbe`) rather than closing
  over it. With none attached the query returns nothing and the width section is absent — the
  replace list already carries the "model is preparing" sentence, and one such message per panel is
  enough.
- **`applyCommandResult` takes `BodyResizedEffect.columns`.** A resize is the one command that moves a
  frozen extent, and the voids are recomputed against the moved map. Every other command still gets
  ADR 0011 Gap D's pass-through.
- **Three pinned counts moved, and are re-pinned with their derivation** in
  `apps/web/tests/panel/width-chips.adversarial.test.ts`: 76 chips → 62, `p11` 200/300/400/600/800 →
  600/800, `p1` 450/600 → 600. Each is a width the command refuses, or one it accepts and the panel
  was hiding.
- **ADR 0024's unmet criterion is now reachable in the model and awaits 5E in the browser.** A refused
  width has a visible reason at the point of choosing, which is the better place for it than the
  banner after the tap.
