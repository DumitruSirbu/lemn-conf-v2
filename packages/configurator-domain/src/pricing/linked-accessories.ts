// How many of each linked accessory a kitchen earns (ADR 0177 A-19): one for every placement priced as the row the
// accessory is linked to. A fact about the design and the catalogue, asked before any amount, so the price
// (`priceDesign` bills what is earned and enabled) and the notice of what was removed (`removedAccessoriesSince`) read
// one count and cannot disagree about whether a kitchen has an accessory.
import { resolveCatalogEquivalent } from "../catalog.js";
import type { DisplayEntry } from "../queries/design-projection.js";
import type { BodyCatalog } from "../void-engine.js";

import type { LinkedAccessoryRule } from "./price-book.js";

/** A linked accessory and how many the bodies earn. Zero is an answer and a line's absence, never an amount. */
export interface EarnedLinkedAccessory {
  readonly rule: LinkedAccessoryRule;
  readonly quantity: number;
}

export interface LinkedAccessoryEarning {
  readonly entries: readonly DisplayEntry[];
  readonly catalog: BodyCatalog;
  readonly rules: readonly LinkedAccessoryRule[];
}

/** Every rule, in book order, with the placements it is earned over. A seeded body counts through the row it is priced as,
 *  and a body with no equivalent (a corner) through its own id, as `priceDesign` resolves a cabinet rule. */
export function earnedLinkedAccessories({
  entries,
  catalog,
  rules,
}: LinkedAccessoryEarning): readonly EarnedLinkedAccessory[] {
  const placementsByPricedAsRow = countPlacementsByPricedAsRow(
    entries,
    catalog,
  );
  return rules.map((rule) => ({
    rule,
    quantity: placementsByPricedAsRow.get(rule.linkedBuildId) ?? 0,
  }));
}

function countPlacementsByPricedAsRow(
  entries: readonly DisplayEntry[],
  catalog: BodyCatalog,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const { buildId } of entries) {
    const pricedAs = pricedAsBuildId(catalog, buildId);
    counts.set(pricedAs, (counts.get(pricedAs) ?? 0) + 1);
  }
  return counts;
}

/** The catalogue row a body is priced as (ADR 0022): its equivalent where it declares one, its own id where it does not.
 *  `priceDesign`'s `resolvePricingRow` makes the same resolution and a test holds the two to each other. */
function pricedAsBuildId(catalog: BodyCatalog, buildId: string): string {
  return resolveCatalogEquivalent(catalog, buildId)?.buildId ?? buildId;
}
