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
// material offers has one author; what a chosen colour is has this one — with the one exception
// below, which asks about a colour the design carries rather than about a cabinet.
import {
  lookUpMaterial,
  materialOffersFinish,
  sameFinish,
} from "./materials.js";
import type { Design, DesignPlacement } from "./design.js";
import type { Finish } from "./materials.js";
import { resolvedDefaultFinishOf } from "./resolved-finish.js";

/**
 * The cabinets whose finish differs from the colour this design falls back to.
 *
 * **Three rules, and each is ADR 0081 decision 1's:**
 *
 * - a **present** finish — absence is a legal state and has chosen nothing (ADR 0078 decision 5);
 * - the design's **resolved** default: `settings.finish` where a global colour is set, and the
 *   material's declared `defaultFinish` where it is not (ADR 0099 decision 7, amending ADR 0086
 *   decision 3). A design whose material is undeclared and which names no global colour has no
 *   default to compare against, so it counts **every** carried finish, exactly as before;
 * - `sameFinish` against that value, and no second equality. `#ECEEEB` on an MDF kitchen is
 *   therefore counted as chosen — the deliberate over-warn, in the safe direction.
 *
 * **Why the base had to move.** Left against `material.defaultFinish`, the confirmation would fire
 * for cabinets that merely match the kitchen's own chosen colour — which is precisely the
 * interruption ADR 0081 exists to avoid, reintroduced by the feature that makes it likelier.
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
 * **The confirmation's second arm** (ADR 0099 decision 7): whether moving this design to
 * `materialTierId` would discard the whole-kitchen colour somebody chose.
 *
 * It is owed because the amended count above answers **zero** for the designs this feature is for —
 * a kitchen where every cabinet follows one global colour has chosen nothing per cabinet — while a
 * material change still throws that colour away. Without this arm the product would silently lose
 * exactly the choice the global control adds.
 *
 * **It asks the domain's own offer** and returns a fact rather than a view: `materialOffersFinish`
 * is ADR 0078 decision 1's single author, and the surface that renders the confirmation must not
 * reach for it (ADR 0086 decision 3). The surface asks this question; this answers it.
 *
 * **False where there is nothing to lose**: no global colour set, an id the domain does not declare
 * (ADR 0078 decision 3 — the command's undeclared arm resolves nothing), or a material that offers
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
