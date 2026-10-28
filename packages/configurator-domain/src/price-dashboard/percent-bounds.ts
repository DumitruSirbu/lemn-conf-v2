import {
  MAX_DEEP_CABINET_PERCENT,
  MAX_MATERIAL_PERCENT,
} from "../pricing/price-bounds.js";
import type { MaterialTier, PriceBook } from "../pricing/price-book.js";

// The ranges a book's percentages must keep (ADR 0177 A-5), checked here for the judgement of a book and for the
// cabinet preview alike, so the two refuse the same percentage. `percentageStagesOf` checks that a percentage is whole
// and not its range, so whoever feeds it validates the range first.

/** Whether `value` is a whole percentage from 0 to `maxPercent`. */
export function isWholePercentWithin(
  value: unknown,
  maxPercent: number,
): boolean {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= maxPercent
  );
}

/** Whether a material tier's percentage is in range: up to `MAX_MATERIAL_PERCENT`, and 0 for the book's default tier,
 *  which is the PAL reference every anchor is quoted in. */
export function isMaterialPercentInRange(
  book: PriceBook,
  tier: MaterialTier,
): boolean {
  const isReference = tier.tierId === book.material.defaultTierId;
  return isWholePercentWithin(
    tier.percentOfCabinets,
    isReference ? 0 : MAX_MATERIAL_PERCENT,
  );
}

/** Whether the book's depth percentage is in range: up to `MAX_DEEP_CABINET_PERCENT`. */
export function isDepthPercentInRange(book: PriceBook): boolean {
  return isWholePercentWithin(
    book.depthRule.deepCabinetPercent,
    MAX_DEEP_CABINET_PERCENT,
  );
}
