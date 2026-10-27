// A book states its materials as percentages (ADR 0092 Amendment of 2026-10-25, ADR 0177 A-5): every material tier a
// `percentOfCabinets`, the book a `depthRule`, the default tier at 0 %. It is the only form: a book whose tier states no
// percentage, or that states no depth rule, is refused here, so a stored book from before the cut-over never reaches the
// arithmetic. A member of a tier that nothing reads prices nothing and is not this parser's to refuse (the projection
// drops it, `project-price-book.ts`). Every read goes through `readDeclared`.
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

/** The book's material tiers and depth rule, held to being the percentage form. `maxTiersPerGroup` is the parser's own
 *  bound on a group, passed in so the two cannot differ. */
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
  return (
    firstUnusableTier(tierRecords) ??
    refuseUnusableDepthRule(readDeclared(book, "depthRule")) ??
    refuseDefaultTierAboveZero(material, tierRecords)
  );
}

function firstUnusableTier(
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
      `A book declares a "depthRule" object. Found: ${describeDeclared(depthRule)}`,
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
