// ADR 0033's threshold and the one function that reads it. Extracted from `catalog.ts`: `cabinet-handles.ts`
// counts a per-door handle rule and needs the door count, while `catalog.ts` needs the handle rule's
// constructors, so importing in both directions is a cycle, and a second copy of the threshold is the
// pair-agreeing-by-luck defect ADR 0028 exists to stop. `catalog.ts` re-exports both names.

/** The width at which a hinged cabinet stops being a one-door and becomes a two-door, and the single point
 *  where that flips: 499 and below is one door, 500 and above is two (a half-open bound over the whole
 *  continuum, since a stepper reaches 470, 500 and 550). The constant lives in the domain because "how many
 *  doors is this cabinet called" is a product rule, and `catalog-bodies.ts` imports it for the door count it
 *  hands the builder. see ADR 0035 decision 4 */
export const TWO_DOOR_MIN_WIDTH_MM = 500;

/** How many hinged doors a cabinet of this width is made with: the one place the question is answered, in
 *  either package. `catalog-bodies.ts` calls it for the builder's door count, `describeBodyLabelAt` for the
 *  name, and `cabinet-handles.ts` for the handle count, so the builder, the label and the price cannot
 *  disagree. The comparison is `>=`: 499 and below is one door, 500 and above is two. */
export function deriveDoorCount(widthMm: number): number {
  return widthMm >= TWO_DOOR_MIN_WIDTH_MM ? 2 : 1;
}
