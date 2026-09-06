// **How many cabinets wear a colour somebody chose** — the one question the material change's
// confirmation asks (ADR 0081 decision 1, ADR 0086).
//
// It answers a number and changes nothing. The surface asks whether the answer is above zero; it
// does not walk placements and it does not know what *chosen* means. That split is why this is a
// module in the domain rather than a predicate in a dialog.
//
// **It is not `MaterialTierSetEffect.resolvedFinishCount`, and the two must not be confused.** The
// effect counts every carried finish the *incoming* material refuses — which, the three offers being
// disjoint (ADR 0078 decision 1), is every finish-carrying placement, including the ones sitting at
// the current material's declared default. Those are exactly the cabinets the owner ruled are not
// worth interrupting for. The relation between the two counts holds only under the three
// preconditions ADR 0086 decision 1 states, and is asserted there rather than assumed here.
//
// **It takes the design and no catalogue, deliberately** (ADR 0084 decision 4). A body that cannot
// wear a finish carries none: `dropFinishFromBodiesThatCannotWearOne` strips one at the load seam
// and `carriedAppearance` refuses to carry one onto a `canFinish: false` body. A catalogue argument
// here would be a third authority on `canFinish` beside those two.
//
// **It asks `lookUpMaterial` and never `materialOffersFinish`** (ADR 0086 decision 3). What a
// material offers has one author; what a chosen colour is has this one.
import { materialOfDesign } from "./design-material.js";
import type { Design, DesignPlacement } from "./design.js";
import { sameFinish, type MaterialLookup } from "./materials.js";

/**
 * The cabinets whose finish differs from the declared default of the material the design is on.
 *
 * **Three rules, and each is ADR 0081 decision 1's:**
 *
 * - a **present** finish — absence is a legal state and has chosen nothing (ADR 0078 decision 5);
 * - the design's material resolved as `materialTierId ?? DEFAULT_MATERIAL_ID` through the total
 *   lookup, so an undeclared id **answers rather than throws** (ADR 0078 decision 3) and, declaring
 *   no default to compare against, counts **every** carried finish;
 * - `sameFinish` against that material's `defaultFinish`, and no second equality. `#ECEEEB` on an
 *   MDF kitchen is therefore counted as chosen — the deliberate over-warn, in the safe direction.
 */
export function countCabinetsWearingAChosenFinish(design: Design): number {
  const material = materialOfDesign(design);
  return design.placements.filter((placement) =>
    wearsAChosenFinish(placement, material),
  ).length;
}

function wearsAChosenFinish(
  placement: DesignPlacement,
  material: MaterialLookup,
): boolean {
  const finish = placement.body.finish;
  if (finish === undefined) return false;
  if (material.kind === "undeclared") return true;
  return !sameFinish(finish, material.material.defaultFinish);
}
