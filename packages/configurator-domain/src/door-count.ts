// ADR 0033's threshold and the one function that reads it. **Extracted from `catalog.ts` by M6
// wave 6L, and moved rather than copied**: `cabinet-handles.ts` counts a per-door handle rule and
// therefore needs the door count, while `catalog.ts` needs the handle rule's constructors to
// declare its entries — importing one from the other in both directions is a cycle, and a second
// copy of the threshold is the pair-agreeing-by-luck defect ADR 0028 exists to stop. `catalog.ts`
// re-exports both names, so every reader of them is unchanged.

/** ADR 0033: **the width at which a hinged cabinet stops being a one-door and becomes a two-door**,
 *  and the single point where that flips.
 *
 *  §7's **wall** builder branched here as `w > 0.45 ? 2 : 1` until ADR 0033 moved the branch into this
 *  constant, and it was *right*: a 400 mm carcass with one door is a correct cabinet, whichever side
 *  of the flip it sits on. What was wrong was the **name** on it, because
 *  the door count was declared by which of two catalogue rows the customer picked. `wall-2door` at
 *  400 mm was not a broken cabinet, it was a correct one-door cabinet wearing a two-door name.
 *
 *  So the constant lives **in the domain**, and `catalog-bodies.ts` imports it for the door
 *  count it hands the builder. §12 puts product rules in the domain and builders in the adapter, and
 *  "how many doors is this cabinet called" is a product rule. One constant, two readers — ADR 0028's
 *  discipline, applied to the second pair this project has found. Two literals agreeing by luck is
 *  the shape both ADR 0028 and §7's depth cap were written about.
 *
 *  **ADR 0035 decision 4 moved the value from 450 to 500, and the comparison from `>` to `>=`.**
 *  Forced by the stepper rather than chosen beside it. Under a `[400, 600, 800]` ladder nothing ever
 *  landed between 400 and 600, so the threshold's exact value was unobservable; a stepper reaches
 *  500 and 550, and relative stepping reaches 470 as well (570 → 520 → 470). The rule is therefore
 *  stated as a half-open bound over the whole continuum: **499 and below is one door, 500 and above
 *  is two.**
 *
 *  Noted because it reads as an off-by-one: the constant has been holding a value that gets **one**
 *  door. At 500 with `>=` the name finally describes the value. */
export const TWO_DOOR_MIN_WIDTH_MM = 500;

/** ADR 0033: **how many hinged doors a cabinet of this width is made with.** The one place the
 *  question is answered, in either package.
 *
 *  `catalog-bodies.ts` calls it for the count it hands `kit.make.wallCabinet(w, doors, …)` and
 *  `describeBodyLabelAt` calls it for the name the customer reads. Since wave 6L
 *  `cabinet-handles.ts` calls it for a third reader, the number of handles a body of this width
 *  carries. That is the whole mechanism of this decision: the builder, the label and the price
 *  cannot disagree about a door count because there is nothing for them to disagree with — they ask
 *  the same function.
 *
 *  The comparison is `>=` (ADR 0035 decision 4): **499 and below is one door, 500 and above is two.**
 *  It was `>` against 450 while the ladder made everything between 400 and 600 unreachable; a stepper
 *  reaches 470, 500 and 550, so the half-open bound has to be right rather than merely unobserved. */
export function deriveDoorCount(widthMm: number): number {
  return widthMm >= TWO_DOOR_MIN_WIDTH_MM ? 2 : 1;
}
