# ADR 0031 — A resize moves a whole column, and is funded by adjacent empty space

Status: Accepted (remainder-floor bullet superseded 2026-09-01 → [ADR 0043](0043-an-empty-space-of-any-width-is-a-legal-state.md))

> **Partially superseded.** The "a remainder below `MIN_W` refuses" bullet, and the Consequences line
> that row 10's floor still binds, are superseded by
> [ADR 0043](0043-an-empty-space-of-any-width-is-a-legal-state.md): a gap of any width is now a legal
> state. The funding rule, column scope and exact-to-zero removal below are unaffected.

Date: 2026-08-27
Type: Decision
Milestone: M5 wave 5C — `setWidth` and the column update

**This supersedes §5.4's donor rule.** `DEVELOPMENT-SPEC.md` §5.4 says a resize moves the boundary a
body shares with a neighbouring *cabinet* in the same row, shrinking that neighbour to fund the
move. That rule is replaced in full by what follows. §11 rows 9–11 are re-read against it below.

## Context

Wave 5C implemented §5.4 as written. It worked, and the result was unusable.

Three constraints landed the same day, each individually correct — ADR 0029 (a two-door is 600 or
800), ADR 0030 (a one hinged door tops out below that), and wave 5C's own `RESIZE_OPENS_GAP` refusal.
They compound, because §5.4 takes the **entire delta from one neighbour** and the neighbour must land
on a legal width of its own. With 200 mm-granular sets that almost never happens.

Measured on the shipped kitchen with all three in force: **two accepted resizes, both sides of one
boundary** — `p17` 800 → 600 funded by `p18`, and `p18` 600 → 800 funded by `p17`. Every other chip
on every other body refused. 39 width chips render; 2 are reachable.

The deeper problem is that §5.4 makes a resize **shrink a cabinet nobody selected**. That is what
forces the donor's residue to be a legal width, which is what produced the 1000 mm two-door, the
400 mm cabinet labelled as a two-door, and the illegal millimetre-set residues. Every one of those
defects is downstream of the same idea.

The owner's diagnosis, 2026-08-27: *"you should be able to resize a cabinet only if… the entire
column is empty"* next to it — width should come from **empty space**, not from a neighbour.

## The rule

**A resize is funded by adjacent empty space, and it moves a whole column.**

1. **Scope: the column, not the level.** Selecting any cabinet and choosing a width resizes **every
   member of its column**, at every level. All members' centres move by the same amount, so no body
   leaves its column and the column model holds.
2. **The source of width: an adjacent empty column** on the same wall, immediately left or right. A
   resize with no adjacent empty column is refused.
3. **Growing consumes it; shrinking returns to it.** Growing by `d` narrows the empty column by `d`;
   shrinking by `d` widens it by `d`. The run total is conserved either way.
4. **The empty column resizes at every level too**, matching the resized column.
5. **A column's legal width is one somebody in the column offers that everybody in it accepts.** A
   column containing a two-door cannot go below 600 (ADR 0029) whatever else it holds.

   **Stated this way deliberately, corrected 2026-08-27 by logic review.** It first read "the
   intersection of its members' declared sets", which the implementation is not: the candidates are
   the **union** of every member's resolved set, filtered by what every member accepts. The
   difference is observable and non-monotone — a column holding only `base-panbank` (ladder, floor
   300) offers `[400, 600, 800]`; adding a `wall-1door` above it brings 300 into the candidates and
   the result becomes `[300, 400]`, so **adding a member added a width**. "Intersection" does not
   lead a reader to expect that.

   The consequence belongs to §9 and to wave 5D: because candidates are a union, a column's legal set
   can contain a width **no chip in it renders** — 300 for the pan bank above, or 900 for any column
   holding a `hood` (`[600, 900]`, not `fixedWidth`). So §9 currently **under-offers as well as
   over-offers**, and both halves need pinning together.

   **Corrected 2026-08-27, before this ADR shipped.** This rule first read *"`widthFlex: 'fit'`
   members accept any width above their floor and so do not narrow the intersection"*. Implemented
   literally it **breaks ADR 0029 and ADR 0030**, measured: a cleared column accepted `wall-2door` at
   400 mm — one door under *Corp suspendat 2 uși*, ADR 0029 verbatim — and an 800 mm `wall-1door`,
   which is the whole of ADR 0030. Adversarial QA caught it as four failing tests, correctly
   defending two Accepted records against this one.

   The cause is that **`sizesMm` on a `'fit'` entry carries two different kinds of fact**, and
   nothing in the data said which:

   | entry | set | what the set is |
   | --- | --- | --- |
   | `wall-2door` | `[600, 800]` | a **bound** — below 600 the builder and the label disagree (ADR 0029) |
   | `wall-1door` | `[200, 300, 400]` | a **bound** — an 800 mm leaf's swing arc (ADR 0030) |
   | `base-panbank` | `[400, 600, 800]` | the **ladder** — the standard modules, not a claim that 450 is dishonest |

   Both halves of the original sentence were true; they only contradict when read against `sizesMm`
   alone. So the catalogue now says which: `sizesAreStandardLadder`, **declared per row and never
   inferred** (ADR 0011 Gap A, ADR 0022, §6.3), with **absent meaning "it is a bound"** — the
   conservative default, so a row that forgets is refused a resize rather than built at a width its
   own record forbids. A ladder member is bounded only by its floor; every other member by its own
   set. A guard asserts the flag is set **iff** the row carries the standard set, so `wall-2door`
   drifting into that list cannot silently undo ADR 0029.

   **Two qualifications, from logic review.** The iff-guard is satisfied by any row that legitimately
   carries the standard set; what actually turns red on a drift is the **named allow-list** beside it
   (`base-2door`, `base-3drawer`, `base-panbank`, `wall-lift`, `open-shelf`). And "absent means bound"
   holds only for a row that writes its own `sizesMm` — a row built from `baseCabinet(...)` or
   `wallCabinet(...)` without overriding spreads `STANDARD_LADDER` and inherits the flag **`true`**,
   the permissive direction. The safety is real but comes from the test rather than from the default,
   which is why the flag is declared rather than optional.

   **The bound governs the resize path only.** `sizesAreStandardLadder` is read by `setWidth` alone,
   so the insert path still builds a `'fit'` body at its opening's width without consulting
   `sizesMm` — and this ADR is the first mechanism that can produce a sub-600 mm column for it to do
   that in. `docs/BACKLOG.md` entry 13.

   The flag is read only by `setWidth`: `describeSelection`, `offersFor`, `buildableSizes` and
   `insertBody` are untouched by it.
6. **No cabinet is ever resized as a side effect of editing another.** This is the property the whole
   rule exists for, and every defect listed under Context is downstream of its absence.

### Three details decided by the coordinator, not stated by the owner

Recorded so they are visible and overturnable rather than discovered in the code.

- **Shrinking also requires an adjacent empty column.** The owner described growing. The symmetric
  reading is that shrinking widens the same empty column, which keeps the rule one sentence and the
  run total conserved.

  **Corrected 2026-08-27 by logic review, and the correction matters more than the detail.** This
  paragraph first said the alternative — shrinking *creates* free space where there was none — was
  "not representable", because a gap between two frozen column extents belongs to no column and §4
  iterates `columns.values()`. The first half is true; **the conclusion is false, and it is this
  wave's own code that falsifies it.** `moveFrozenColumns` already *synthesises* a column entry at a
  key derived by `deriveColumnKeyAt`, carrying `regions`, `top`, `d` and `ry` across with a new width
  and centre. A shrink could enter a new empty column at the vacated extent by exactly that
  machinery.

  So the honest statement is **not built, at this cost** — not "cannot be built". The distinction is
  load-bearing, because this detail is what produces the wave's headline consequence below: with
  shrinking requiring an adjacent empty column, **nothing in a full kitchen is resizable until
  something is deleted**. Under shrink-creates-space, any column could be narrowed and its neighbour
  then grown, and width editing would stop being a second step of deleting. The owner's quoted
  diagnosis was about **growing**; the symmetric reading chosen here is the one that costs the most
  product, and it was chosen on a premise that does not hold.

  **Left as decided for wave 5C, and flagged for the browser pass (5E) to reconsider on evidence.**
- ~~**A remainder below `MIN_W` refuses.** Growing such that the empty column would be left between
  0 and 300 mm is refused; consuming it **exactly** to zero is allowed and removes it. An unusable
  sliver nothing can be inserted into is not a state to create.~~
  **SUPERSEDED 2026-09-01 by [ADR 0043](0043-an-empty-space-of-any-width-is-a-legal-state.md).** The
  owner: *"Empty space can be even 100 mm or 50 mm, if somebody want to keep it. Such narrow empty
  space will force user to resize accordingly and not leave such spaces."* A gap of any width is a
  legal state, so a growth is legal for any remainder at or above zero; `remainderMm < 0` is still
  refused as `too_narrow`. Consuming to exactly zero still removes the column, unchanged. What this
  bullet cost was a stepper that could step down and not back up — from the second rung, `+50` would
  have left a strip and was refused.
- **The empty column must be empty at every level**, matching scope. A column empty only at the level
  being edited does not qualify, because the resize moves all levels.

## Alternatives considered

- **Keep §5.4's donor rule.** Rejected on the measurement: two reachable resizes in the shipped
  kitchen, and three ADRs' worth of patching to get there.
- **Per-level independent resize** — the owner's first instinct, and the more flexible product. A
  cabinet grows at its own level while the levels above keep their widths. **Rejected for now on
  cost, not on merit.** A column's key is its members' centre at 10 mm granularity
  (`deriveColumnKey`), so moving one level's body independently takes it *out of* the column its
  neighbours above are still in, and the vacated key reads as free space where a cabinet physically
  stands. That is wave 5C's `RESIZE_OPENS_GAP` refusal and `docs/BACKLOG.md` entry 12. Supporting it
  means inverting §3.2 from columns (free space found vertically at a fixed horizontal extent) to
  rows (free space found horizontally at a fixed level). Measured blast radius: `void-engine.ts` (35
  references), `insert-fit.ts` (10, including ADR 0028's depth cap, which asks an inherently
  *vertical* question and would become an on-demand lookup), five more command and query modules, the
  store's frozen map, and **30 of 109 test files** — plus every acceptance criterion and ADR written
  in column terms, ADR 0011 Gap D above all. That is a milestone comparable to M2, which built the
  void engine.

  **The owner's decision is to ship the column-scoped rule and let real use decide.** If testers find
  mismatched level widths necessary, the row model becomes its own milestone, chosen on evidence
  rather than on a hypothesis. Recorded here so that milestone starts from this reasoning rather than
  re-deriving it.
- **Auto-adjusting the other levels to keep proportions.** Rejected by the owner on 2026-08-27 in the
  per-level discussion, and moot under column scope, where every level moves together by definition.

## Consequences

- **The shipped kitchen has no empty column at load** — `recomputeVoids` returns zero voids, measured.
  So **nothing is resizable until the customer deletes something first**. Width editing is in
  practice a second step of deleting rather than an independent verb. Accepted deliberately: it is a
  rule a person can hold in their head, where "two chips somewhere on the top row are live" is not.
- **Wave 5E's browser pass needs a delete in front of it** to demonstrate anything at all.
- **§11 rows 9–11 are re-read, not discarded.** Row 9's boundary arithmetic still holds with the
  empty column in the neighbour's place. ~~Row 10's floor still binds — the empty column may not be
  left under `MIN_W`.~~ **SUPERSEDED 2026-09-01 by
  [ADR 0043](0043-an-empty-space-of-any-width-is-a-legal-state.md): no floor binds the empty column
  in either direction.** Row 11 (corners and appliances never donate) becomes vacuous rather than false:
  nothing donates any more.
- **Most of wave 5C survives.** `rederiveTouchedColumns` takes only the record sets before and after
  and knows nothing of donors; the `buildId` migration, the reload anti-invariant, the real-probe
  depth assertions and the appearance carrying all live in the rebuild path. What is replaced is
  donor selection and the two floor traps that existed to protect a donor's residue.
- **`RESIZE_OPENS_GAP` must be re-stated, not deleted.** As written it refuses when the derived
  opening set changes at all — which now happens on every legal resize, since the empty column
  shrinks. The defect it guards is unchanged and still live: no opening may appear where a body
  physically stands. It becomes that assertion instead.
- **ADR 0029 and ADR 0030 keep their catalogue rules** — what a cabinet may be built at is unchanged.
  What they no longer have to protect is a *donor's* residue, because there is no donor.
