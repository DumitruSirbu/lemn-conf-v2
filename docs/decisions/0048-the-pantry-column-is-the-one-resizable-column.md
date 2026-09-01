# ADR 0048 — The pantry column is the one resizable column, and its door count already follows its width

Status: Accepted
Date: 2026-09-01
Type: Decision
Milestone: M5B — Manual UX remediation, wave 5B8

## Context

Report item 8 (`testing-reports/09-manual-ux-issues.md`) is a scope request, not a defect. The owner
proposes that the tall double-door column — the one with no appliance inside — should be the **only**
resizable column type, min 400 / max 800 mm, with a width-dependent door count: 400–499 mm a
one-door version, 500–800 mm the current two-door. Their reasoning: *"unlike appliance columns
(oven/microwave), this one has no fixed-size electronics constraining it, so it's free to resize."*

What is true in the code:

- `fullHeightUnit` (`packages/configurator-domain/src/catalog.ts:420-430`) gives every full-height
  row `widthFlex: COLUMN_WIDTHS_MM` = `[600]` and `fixedWidth: true`. Four rows use it:
  `tall-pantry` (*Coloană cămară*), `tall-oven-tower`, `tall-fridge-housing`, and — with its own
  overrides — `fridge-free`.
- The builder is a **zero-argument** `Builders` entry with `W = 0.6` and a two-door band layout
  hardcoded (`packages/three-adapter/src/kitchen-parts.ts:880`), and `catalog-bodies.ts:107` calls it
  as `(kit) => kit.builders["tall-pantry"]()`, discarding the requested size entirely.

## Decision

**`tall-pantry` becomes resizable between 400 and 800 mm. The other three full-height rows do not.**
`cabinetryWidths({ minMm: 400, maxMm: 800 })`, `fixedWidth: false`, `doorCountFollowsWidth: true`.
`tall-oven-tower`, `tall-fridge-housing` and `fridge-free` keep `fixedWidth: true` at their declared
sizes, for the owner's own reason: their contents are appliances at fixed sizes.

**The door-count half needs no new catalogue entry, and the report's assumption that it does is
wrong.** `TWO_DOOR_MIN_WIDTH_MM = 500` (`catalog.ts:113`) and `deriveDoorCount`
(`catalog.ts:651-653`) already implement *"499 and below is one door, 500 and above is two"* —
[ADR 0035](0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) decision 4, arrived at through
[ADR 0033](0033-door-count-is-derived-from-width-not-declared.md)'s merge of the former one-door and
two-door rows. **The owner's 400/500 split is the shipped threshold**, to the millimetre.

So the rule is one flag on one existing row, and the label follows automatically through
`describeBodyLabelAt` (`catalog.ts:672-680`): *Coloană cămară 1 ușă* at 400, *2 uși* at 600.

**Adding a variant entry would be a mistake, not merely redundant.** ADR 0033 merged `base-1door`
into `base-cabinet` precisely because *"the door count is a consequence of the width, never a separate
product to pick"*. A `tall-pantry-1door` row would re-create the split that record cost a wave to
remove, and it would put the threshold in two places — the shape ADR 0028 was written about.

**A narrower pantry is the same cabinet, not a second product.** Owner, 2026-09-01, answering the
question this record put to them: a 400 mm pantry keeps the **same height and the same shelf pitch**
as the 600 — *"a narrower version of the same cabinet, fewer things side by side"*. There is **no
second geometry rule**: no reduced height, no re-pitched shelves, no alternate interior at the narrow
end. What varies with width is the door count (through the threshold above) and the width of the
parts themselves.

That is worth stating rather than assuming, because the opposite is a reasonable thing to build — a
narrow column could plausibly have wanted a different interior — and building it would have added a
second rule nobody asked for. It also settles what a reviewer should look for: at 400 mm the shelves
sit at the **same y coordinates** as at 600 mm, and only their x extent changes.

**The cost is in the adapter, not the catalogue.** The builder must become width-parameterised, with
its door bands derived from the width the way `wallCabinet` already derives them. The zero-argument
`Builders["tall-pantry"]` stays, delegating at `(0.6, 2)`, so the seeded kitchen does not move.

## Alternatives considered

**Make every full-height row resizable.** Rejected by the owner's own reasoning and by the code: an
oven tower's opening is sized to the appliance, and §11 row 5 requires a column that does not fit to
refuse *with the millimetres in the message*. Loosening all four would turn that refusal into a
buildable body around an appliance that does not fit it.

**A separate 400–499 catalogue entry.** Rejected — see above; it re-splits what ADR 0033 merged.

**Move the general threshold instead.** Not needed and not done. `TWO_DOOR_MIN_WIDTH_MM` is already
500 and is untouched by this record.

**Scale the finished 600 mm group.** Explicitly rejected. M3's Risks section names faking a fit by
scaling a finished group as the thing not to do, and `catalog-bodies.ts`' own note on the fixed-size
entries says the same. The wave's acceptance criteria assert measured bounds at three widths so this
cannot pass by accident.

## Records swept before deciding, and how each is settled

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0033](0033-door-count-is-derived-from-width-not-declared.md) | Door count is derived from width; the two hinged rows were merged into one; `kind` was always the real identity. | **Extended to a third row, not contradicted.** `doorCountFollowsWidth` is the mechanism ADR 0033 built, applied where the owner has now asked for it. |
| [ADR 0035](0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) decision 4 | *"499 and below is one door, 500 and above is two"*, `>=` against 500. | **Unchanged, and it is the owner's own rule.** No new threshold is introduced. |
| [ADR 0035](0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) decisions 1 and 3 | Every cabinetry row has a bound; `minMm < maxMm` is the stepper/discrete discriminator, read from `widthRangesMm` and never inferred. | **Followed.** The pantry's range makes it a stepper by that discriminator, and `columnWidthChoices` publishes it; nothing infers. |
| [ADR 0030](0030-a-single-hinged-door-tops-out-at-600.md) | A single hinged door's cap. | **Already retired by the owner on 2026-08-28** and recorded as such in `insert-fit.ts:329-331` — *"a hinged cabinet's bound has no hole in it now, and the width decides the door count rather than the cabinet."* Named here so it is not re-applied to a 500–800 pantry door. |
| [ADR 0029](0029-a-two-door-cabinet-may-not-be-offered-at-one-door-widths.md) | A two-door cabinet must never be offered at a one-door width. | **Satisfied by construction.** There is one row and the count follows the width, so the offered label and the built body cannot disagree — which is what that record was written about. |
| [ADR 0026](0026-the-width-floor-has-a-direction.md) | `MIN_W` is a default floor an entry may declare against in either direction. | **Used.** 400 is above the 300 default, so it is a raise, which the mechanism has always supported. |
| [ADR 0031](0031-a-resize-moves-a-whole-column-into-adjacent-empty-space.md) | A resize moves a whole column, funded by adjacent empty space; every member is squared up. | **New reachability, no rule change.** A `band: 'column'` unit is a single member spanning every level, so resizing it is the simplest case ADR 0031 has. |
| `DEVELOPMENT-SPEC.md` §7, *"columns are fixed 600 and refuse other openings with a reason"* | The four full-height rows are fixed at 600. | **Superseded for `tall-pantry` only**, with a dated pointer. The other three still refuse with the millimetres in the message. |
| `DEVELOPMENT-SPEC.md` §11 row 5 | A column into a 300 mm opening is refused with mm in the message. | **Still holds**, and is an acceptance criterion: 300 is below the pantry's new 400 floor, so the refusal is unchanged for it too. |
| `DEVELOPMENT-SPEC.md` §13.3 item 6 | *"Hob and corner widths are still fixed in geometry; parameterising them is the remaining builder work."* | **Corroborates the shape of the work.** The pantry is a fourth instance of the same unfinished parameterisation; the hob stays fixed by ADR 0027 and the corner by ADR 0021. |

Nothing in the sweep opposes the decision. The one thing the sweep changed is the **size** of it: the
report asked for a new catalogue variant and the catalogue already has the rule.

## Consequences

- **A full-height unit can now be resized, which none could before.** Every consumer of `band:
  'column'` that assumed a fixed 600 has to be re-read — the depth cap's `isFullHeightUnder`
  (`void-engine.ts:...`) reads overlap along the wall, so a 400 mm pantry lifts the wall-depth cap
  over 400 mm instead of 600 mm. That is the rule behaving correctly, and it is a visible change to
  what a wall cabinet above it is built at.
- **`tall-pantry` becomes the only full-height row with a stepper**, so §9's width section renders
  differently for it than for its three neighbours in the same list. That is ADR 0035 decision 3
  working, not an inconsistency.
- **The pantry's door bands are hand-tuned at 600, and at 400 with one door the proportion is new.**
  The owner has decided the interior does not change with it (same height, same shelf pitch), so the
  visual question is only whether one door reads well across a 400 mm opening — a screenshot at the
  mobile viewport, not a rule.
- **Height, depth and shelf pitch are unchanged at every width**: `COLUMN_HEIGHT_MM` 2200, the
  declared `occupiedDepth` (ADR 0040), and the shelf y coordinates. This is the owner's decision of
  2026-09-01 and it is an acceptance criterion, not an implementation detail — a builder that
  re-pitched the shelves at 400 mm would pass a bounds check on width and still be wrong.
- **The seeded kitchen is unchanged.** `Builders["tall-pantry"]()` still builds 600 mm with two
  doors, and M1's parity gate asserts it.

## Correction, 2026-09-01

Found by adversarial QA on wave 5B8. The Decision section's most carefully argued sentence — *"same
height and the same shelf pitch… no second geometry rule… at 400 mm the shelves sit at the same y
coordinates as at 600"* — is **unfalsifiable as written**, because `tallPantry`
(`packages/three-adapter/src/kitchen-parts.ts`) builds no shelves at all. Its body tree is a plinth,
a carcass shell, a back, a front liner and door slabs. There is no interior board for a y-coordinate
assertion to measure.

Wave 5B8's acceptance criterion 6, written straight from this sentence, inherited the problem: it
says "every shelf sits at the same y coordinate" and there is nothing in the built body that claim
can be checked against. What criterion 6 actually pins, and what QA confirmed does bite, is the set
of distinct horizontal lines in the built body — every mesh's min and max y — being identical at 400,
600 and 800 mm. That is the door bands and the carcass, not shelves, and it is a real, falsifiable
guard: re-pitching the door bands below 500 mm turns it red.

This is not a defect in the code or a change of the owner's intent — a 400 mm pantry genuinely is a
narrower version of the same cabinet, and nothing was built that contradicts what the owner asked
for. The decision is simply not yet testable on the geometry it names, only on a proxy for it.

**Risk for whoever adds shelves to `tallPantry` next.** If the pantry ever gains an interior, the
owner's shelf-pitch rule is unguarded on day one — nothing in this codebase currently asserts it
against shelf geometry, only against door-band and carcass geometry. Whoever adds shelves must add
the actual y-coordinate assertion (shelves at 400 mm sit at the same y as at 600 mm) in the same
change that adds the shelves. Do not assume criterion 6's existing test already covers this — it
does not and cannot, because it was written against parts that did not exist.

## Verified against shipped behaviour, 2026-09-01

Wave 5B8 is complete (`docs/STATUS.md`, `docs/milestones/M5B-manual-ux-remediation.md`). What this
record predicted was checked against the running app rather than only against tests:

- **The door-count flip landed exactly where decision text says: `>= 500` mm is two doors, below is
  one.** Visual verification observed the flip live at exactly 500 mm.
- **The seeded kitchen did not move, and the flip it did carry is a resizability flip, not a geometry
  one.** `Builders["tall-pantry"]()` still builds 600 mm with two doors, byte-identical under M1
  parity. What changed under the seeded design is that wall B now holds a resizable column where none
  existed before this decision — recorded as the mechanism behind the milestone's Q5 note (a shrink on
  wall B can now reach an empty column past 800 mm in two taps rather than nine), not as a change to
  this record's own scope.
- **700 and 800 mm are unreached live**, because the seeded kitchen leaves wall B with no free space
  on either side and an emptied column stays a 600 mm column. Those two widths, and criterion 5's
  widest measured bounds, stand on the unit-level bounds assertions only — not on a rendered capture.
  This is consistent with the record's own position: the acceptance criteria were always written to
  be checkable without depending on what the seeded kitchen happens to make reachable on screen.
