// A book assembled for tests from the sample book's structure, its cabinet rules, material tiers and depth rule replaced
// by figures the test passes in, so nothing here is a figure anybody approved (P2-f).
import type { AnchoredFormula } from "../../src/pricing/anchored-price-formula.js";
import type {
  CabinetPriceRule,
  MaterialTier,
  PriceBook,
  TierGroup,
} from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

export const REFERENCE_TIER_ID = "material.reference";
export const UPGRADE_TIER_ID = "material.upgrade";

/** The width every anchored rule here is quoted at, so a body built at it is priced at its anchor exactly. */
export const ANCHOR_WIDTH_MM = 600;

function percentageTier(
  tierId: string,
  percentOfCabinets: number,
): MaterialTier {
  return {
    tierId,
    ruleId: tierId,
    name: tierId,
    description: `${tierId} as a test percentage`,
    percentOfCabinets,
  };
}

/** The reference tier at 0 % (the pricing fallback) and one upgrade at the percentage the test draws. */
export function percentageMaterial(
  upgradePercent: number,
): TierGroup<MaterialTier> {
  return {
    defaultTierId: REFERENCE_TIER_ID,
    tiers: [
      percentageTier(REFERENCE_TIER_ID, 0),
      percentageTier(UPGRADE_TIER_ID, upgradePercent),
    ],
  };
}

export function anchoredAt(anchorMinor: number): AnchoredFormula {
  return {
    shape: "anchored-width",
    anchorWidthMm: ANCHOR_WIDTH_MM,
    anchorMinor,
    perStepWiderMinor: 0,
    perStepNarrowerMinor: 0,
  };
}

/** The sample book's rules with every manufacturer-supplied row restated as an anchored one whose anchor the test
 *  chooses by build id; customer-supplied rows stay as the sample states them (free). */
export function anchoredRules(
  anchorOf: (buildId: string) => number,
): readonly CabinetPriceRule[] {
  return SAMPLE_PRICE_BOOK.cabinetRules.map((rule) =>
    rule.suppliedBy === "customer"
      ? rule
      : { ...rule, formula: anchoredAt(anchorOf(rule.buildId)) },
  );
}

export interface PercentageBookOptions {
  readonly materialPercent: number;
  readonly deepCabinetPercent: number;
  readonly cabinetRules: readonly CabinetPriceRule[];
}

export function percentageBookOf(options: PercentageBookOptions): PriceBook {
  return {
    ...SAMPLE_PRICE_BOOK,
    cabinetRules: options.cabinetRules,
    material: percentageMaterial(options.materialPercent),
    depthRule: { deepCabinetPercent: options.deepCabinetPercent },
  };
}
