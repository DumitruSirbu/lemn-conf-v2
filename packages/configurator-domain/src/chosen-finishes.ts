// How many cabinets wear a colour somebody chose: the one question the material change's confirmation
// asks (ADR 0081 decision 1, ADR 0086). It answers a number and changes nothing, so the surface neither
// walks placements nor knows what "chosen" means.
//
// It is not `MaterialTierSetEffect.resolvedFinishCount`. The effect counts every carried finish the
// incoming material refuses, which with the three offers disjoint (ADR 0078 decision 1) includes
// cabinets sitting at the current material's default, the ones the owner ruled not worth interrupting
// for. The relation between the counts holds only under ADR 0086 decision 1's three preconditions.
//
// It takes the design and no catalogue (ADR 0084 decision 4): a body that cannot wear a finish carries
// none (`dropFinishFromBodiesThatCannotWearOne` at the load seam, `carriedAppearance` on
// `canFinish: false`), so a catalogue argument would be a third authority on `canFinish`.
//
// It asks `lookUpMaterial` and never `materialOffersFinish` for a cabinet (ADR 0086 decision 3): what
// a material offers has one author, what a chosen colour is has this one. The one exception below asks
// about a colour the design carries.
import {
  lookUpMaterial,
  materialOffersFinish,
  sameFinish,
} from "./materials.js";
import type { Design, DesignPlacement } from "./design.js";
import type { Finish } from "./materials.js";
import { resolvedDefaultFinishOf } from "./resolved-finish.js";

/**
 * The cabinets whose finish differs from the colour this design falls back to (ADR 0081 decision 1):
 *
 * - a present finish: absence is a legal state and has chosen nothing (ADR 0078 decision 5);
 * - the design's resolved default: `settings.finish` where a global colour is set, otherwise the
 *   material's `defaultFinish` (ADR 0099 decision 7). A design with an undeclared material and no
 *   global colour has no default to compare against and counts every carried finish;
 * - `sameFinish` against that value and no second equality, so `#ECEEEB` on an MDF kitchen counts as
 *   chosen: a deliberate over-warn in the safe direction.
 *
 * Against `material.defaultFinish` alone, the confirmation would fire for cabinets that merely match
 * the kitchen's own chosen colour, the interruption ADR 0081 exists to avoid.
 */
export function countCabinetsWearingAChosenFinish(design: Design): number {
  const resolvedDefault = resolvedDefaultFinishOf(design);
  return design.placements.filter((placement) =>
    wearsAChosenFinish(placement, resolvedDefault),
  ).length;
}

function wearsAChosenFinish(
  placement: DesignPlacement,
  resolvedDefault: Finish | undefined,
): boolean {
  const finish = placement.body.finish;
  if (finish === undefined) return false;
  if (resolvedDefault === undefined) return true;
  return !sameFinish(finish, resolvedDefault);
}

/**
 * The confirmation's second arm (ADR 0099 decision 7): whether moving this design to `materialTierId`
 * would discard the whole-kitchen colour somebody chose. Owed because the count above answers zero
 * for a kitchen where every cabinet follows one global colour, while a material change still throws
 * that colour away.
 *
 * It asks the domain's own offer (`materialOffersFinish`, ADR 0078 decision 1) and returns a fact, so
 * the surface need not reach for it (ADR 0086 decision 3). False where there is nothing to lose: no
 * global colour, an id the domain does not declare (ADR 0078 decision 3), or a material that offers
 * the colour anyway.
 */
export function wouldDiscardTheGlobalFinish(
  design: Design,
  materialTierId: string,
): boolean {
  const globalFinish = design.settings?.finish;
  if (globalFinish === undefined) return false;
  const lookup = lookUpMaterial(materialTierId);
  if (lookup.kind === "undeclared") return false;
  return !materialOffersFinish(lookup.material, globalFinish);
}
