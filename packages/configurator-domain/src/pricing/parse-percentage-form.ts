// Reads how a book states its materials and its depth, called from `parse-price-book.ts` once every section is known
// to be readable. A book states them one way (ADR 0092 Amendment of 2026-10-25, ADR 0177 A-5):
//
// - the flat form: each material tier a `wholeKitchenMinor`, and no `depthRule`. What every book is until the
//   cut-over retires it (P3);
// - the percentage form: each material tier a whole `percentOfCabinets`, the book a `depthRule`, and the default tier
//   (the pricing fallback, PAL) at 0 %.
//
// A book that carries both forms is refused whole: a tier stating both amounts, tiers that disagree, a `depthRule`
// beside flat tiers. Any of them would price one way while the dashboard edited the other. Every read goes through
// `readDeclared`, as in the parser that calls this.
import {
  boundedListOf,
  describeDeclared,
  invalidBook,
  isRecord,
  readDeclared,
  refuseUnreadFields,
} from "./book-reading.js";
import {
  MAX_DEEP_CABINET_PERCENT,
  MAX_MATERIAL_PERCENT,
} from "./price-bounds.js";
import type { PricingFailure } from "./price-lines.js";

/** The book's material tiers and depth rule, held to being one form. `maxTiersPerGroup` is the parser's own bound on
 *  a group, passed in so the two cannot differ. */
export function refuseUnusablePercentageForm(
  book: Record<string, unknown>,
  maxTiersPerGroup: number,
): PricingFailure | undefined {
  const material = readDeclared(book, "material");
  if (!isRecord(material)) return undefined;
  const tiers = boundedListOf(
    readDeclared(material, "tiers"),
    maxTiersPerGroup,
  );
  const tierRecords = (tiers ?? []).filter(isRecord);

  const bothForms = firstTierStatingBothForms(tierRecords);
  if (bothForms) return bothForms;

  const percentageTiers = tierRecords.filter(statesPercentage);
  const depthRule = readDeclared(book, "depthRule");
  if (percentageTiers.length === 0) {
    return refuseDepthRuleBesideFlatTiers(depthRule);
  }
  if (percentageTiers.length < tierRecords.length) {
    return invalidBook(
      "The material tiers state their amounts two ways: some a percentOfCabinets, some not. A book states one form",
    );
  }
  return (
    firstUnusableTierPercentage(percentageTiers) ??
    refuseUnusableDepthRule(depthRule) ??
    refuseDefaultTierAboveZero(material, percentageTiers)
  );
}

function statesPercentage(tier: Record<string, unknown>): boolean {
  return readDeclared(tier, "percentOfCabinets") !== undefined;
}

function statesFlatAmount(tier: Record<string, unknown>): boolean {
  return readDeclared(tier, "wholeKitchenMinor") !== undefined;
}

function firstTierStatingBothForms(
  tiers: readonly Record<string, unknown>[],
): PricingFailure | undefined {
  const both = tiers.find(
    (tier) => statesPercentage(tier) && statesFlatAmount(tier),
  );
  if (both === undefined) return undefined;
  return invalidBook(
    `The ${namedTier(both)} declares both "wholeKitchenMinor" and "percentOfCabinets". ` +
      `A material is a flat amount or a percentage, never both`,
  );
}

/** A depth rule beside flat tiers would sit in the book unpriced, as `refuseUnreadFields` holds for any field. */
function refuseDepthRuleBesideFlatTiers(
  depthRule: unknown,
): PricingFailure | undefined {
  if (depthRule === undefined) return undefined;
  return invalidBook(
    'The book declares a "depthRule" but its material tiers state flat amounts: ' +
      "a depth rule belongs to the percentage form, where every tier states a percentOfCabinets",
  );
}

function firstUnusableTierPercentage(
  tiers: readonly Record<string, unknown>[],
): PricingFailure | undefined {
  for (const tier of tiers) {
    const refused = refuseUnusablePercentage(
      readDeclared(tier, "percentOfCabinets"),
      {
        named: namedTier(tier),
        field: "percentOfCabinets",
        maxPercent: MAX_MATERIAL_PERCENT,
      },
    );
    if (refused) return refused;
  }
  return undefined;
}

function refuseUnusableDepthRule(
  depthRule: unknown,
): PricingFailure | undefined {
  if (!isRecord(depthRule)) {
    return invalidBook(
      `A book whose materials are percentages declares a "depthRule" object. Found: ${describeDeclared(depthRule)}`,
    );
  }
  return (
    refuseUnusablePercentage(readDeclared(depthRule, "deepCabinetPercent"), {
      named: "depth rule",
      field: "deepCabinetPercent",
      maxPercent: MAX_DEEP_CABINET_PERCENT,
    }) ??
    refuseUnreadFields(depthRule, ["deepCabinetPercent"], {
      shape: "depthRule",
      named: "depth rule",
    })
  );
}

/** The pricing fallback is the PAL reference, which every anchor is quoted in: above 0 % a design that names no
 *  material would be priced as an upgrade (ADR 0177 A-5, A-8). */
function refuseDefaultTierAboveZero(
  material: Record<string, unknown>,
  tiers: readonly Record<string, unknown>[],
): PricingFailure | undefined {
  const defaultTierId = readDeclared(material, "defaultTierId");
  const defaultTier = tiers.find(
    (tier) => readDeclared(tier, "tierId") === defaultTierId,
  );
  if (defaultTier === undefined) return undefined;
  const declared = readDeclared(defaultTier, "percentOfCabinets");
  if (declared === 0) return undefined;
  return invalidBook(
    `The ${namedTier(defaultTier)} is the book's default material and the 0 % reference, ` +
      `but declares "percentOfCabinets" as ${describeDeclared(declared)}`,
  );
}

/** A whole percentage from zero to `maxPercent`: a fraction is not a percentage this arithmetic can hold exactly,
 *  and a negative one would take money off a cabinet in a material meant to cost more. */
function refuseUnusablePercentage(
  declared: unknown,
  context: {
    readonly named: string;
    readonly field: string;
    readonly maxPercent: number;
  },
): PricingFailure | undefined {
  if (
    typeof declared === "number" &&
    Number.isSafeInteger(declared) &&
    declared >= 0 &&
    declared <= context.maxPercent
  ) {
    return undefined;
  }
  return invalidBook(
    `The ${context.named} declares "${context.field}" as ${describeDeclared(declared)}, ` +
      `which is not a whole percentage from 0 to ${String(context.maxPercent)}`,
  );
}

function namedTier(tier: Record<string, unknown>): string {
  const tierId = readDeclared(tier, "tierId");
  const shown = typeof tierId === "string" ? tierId : describeDeclared(tierId);
  return `material tier "${shown}"`;
}
