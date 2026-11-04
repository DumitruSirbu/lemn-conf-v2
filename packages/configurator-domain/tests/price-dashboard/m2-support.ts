// What the M2 suites (bulk change, judging a book against the catalogue, the cabinet preview) share: the shipped catalogue,
// the deepening rows measured from it, and the sample book with one rule or one percentage restated. Nothing here is a
// figure anybody approved; a suite that needs a number states it.
import type { Design } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { measureDeepeningRows } from "../../src/pricing/deepening-rows.js";
import type {
  CabinetPriceRule,
  PriceBook,
  PriceFormula,
} from "../../src/pricing/price-book.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import type { PricedDesign } from "../../src/pricing/price-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import type { BodyCatalog } from "../../src/void-engine.js";
import { NOTHING_DISABLED } from "../support/availability.js";

export const SHALLOW_DEPTH_MM = 600;
export const DEEP_DEPTH_MM = 700;

export const CATALOG: BodyCatalog = buildKitchenLBodyCatalog(SHALLOW_DEPTH_MM);

export const DEEPENING_ROWS: ReadonlySet<string> = measureDeepeningRows(
  CATALOG,
  buildKitchenLBodyCatalog(DEEP_DEPTH_MM),
);

export const REFERENCE_MATERIAL_ID = SAMPLE_PRICE_BOOK.material.defaultTierId;
export const STANDARD_HARDWARE_ID = SAMPLE_PRICE_BOOK.hardware.defaultTierId;

export function ruleOf(buildId: string, book: PriceBook = SAMPLE_PRICE_BOOK) {
  const rule = book.cabinetRules.find(
    (candidate) => candidate.buildId === buildId,
  );
  if (rule === undefined)
    throw new Error(`The book has no rule for ${buildId}`);
  return rule;
}

export function withRule(
  book: PriceBook,
  buildId: string,
  replace: (rule: CabinetPriceRule) => CabinetPriceRule,
): PriceBook {
  return {
    ...book,
    cabinetRules: book.cabinetRules.map((rule) =>
      rule.buildId === buildId ? replace(rule) : rule,
    ),
  };
}

export function withFormula(
  book: PriceBook,
  buildId: string,
  formula: PriceFormula,
): PriceBook {
  return withRule(book, buildId, (rule) => ({ ...rule, formula }));
}

export function withoutRule(book: PriceBook, buildId: string): PriceBook {
  return {
    ...book,
    cabinetRules: book.cabinetRules.filter((rule) => rule.buildId !== buildId),
  };
}

/** The sample book with its non-default material tier and its depth rule at the percentages given. */
export function withPercentages(
  book: PriceBook,
  percentages: {
    readonly materialPercent: number;
    readonly depthPercent: number;
  },
): PriceBook {
  return {
    ...book,
    material: {
      ...book.material,
      tiers: book.material.tiers.map((tier) =>
        tier.tierId === book.material.defaultTierId
          ? tier
          : { ...tier, percentOfCabinets: percentages.materialPercent },
      ),
    },
    depthRule: { deepCabinetPercent: percentages.depthPercent },
  };
}

/** The tier id of the first non-default material in the sample book. */
export const UPGRADE_MATERIAL_ID =
  SAMPLE_PRICE_BOOK.material.tiers.find(
    (tier) => tier.tierId !== SAMPLE_PRICE_BOOK.material.defaultTierId,
  )?.tierId ?? "";

/** A kitchen of one cabinet, priced by the whole query: the oracle the preview is held to. */
export interface OneCabinet {
  readonly buildId: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly y0Mm: number;
}

export function priceOneCabinet(
  cabinet: OneCabinet,
  setting: {
    readonly book: PriceBook;
    readonly depthMm: number;
    readonly materialTierId: string;
    readonly hardwareTierId: string;
  },
): PricedDesign {
  const design: Design = {
    ...KITCHEN_L_DESIGN,
    settings: { cabinetDepthMm: setting.depthMm },
    placements: [
      {
        id: "p-preview",
        wall: "A",
        alongMm: 2000,
        y0Mm: cabinet.y0Mm,
        body: {
          buildId: cabinet.buildId,
          widthMm: cabinet.widthMm,
          heightMm: cabinet.heightMm,
        },
      },
    ],
  };
  const result = priceDesign({
    design,
    catalog: buildKitchenLBodyCatalog(setting.depthMm),
    book: setting.book,
    pricingVersion: setting.book.version,
    selections: {
      materialTierId: setting.materialTierId,
      hardwareTierId: setting.hardwareTierId,
    },
    deepeningRows: DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
  });
  if (!result.ok) throw new Error(result.failure.code);
  return result.priced;
}

/** Cabinet, material and depth lines of a priced one-cabinet kitchen: the combined price of the cabinet (A-1). */
export function cabinetInMaterialAtDepthMinor(priced: PricedDesign): number {
  return priced.lines
    .filter(({ kind }) => ["cabinet", "material", "depth"].includes(kind))
    .reduce((sum, line) => sum + line.amountMinor, 0);
}

export function hardwareLineMinor(priced: PricedDesign): number {
  return priced.lines.find(({ kind }) => kind === "hardware")?.amountMinor ?? 0;
}
