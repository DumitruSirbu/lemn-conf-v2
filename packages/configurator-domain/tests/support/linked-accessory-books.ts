// Books and kitchens for the suites about linked accessories (M10 P4b). The sample book carries none, so a suite states
// the ones it needs; the rows a linked accessory may be attached to are read from the book, never listed here.
import type { Design } from "../../src/design.js";
import type {
  LinkedAccessoryRule,
  PriceBook,
} from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

/** One linked accessory, valid unless the suite amends it. */
export function linkedRule(
  accessoryId: string,
  amendment: Partial<LinkedAccessoryRule> = {},
): LinkedAccessoryRule {
  return {
    accessoryId,
    ruleId: `accessory.${accessoryId}`,
    linkedBuildId: "base-3drawer",
    perUnitMinor: 12_345,
    name: `Accesoriu ${accessoryId}`,
    ...amendment,
  };
}

export function bookWithLinked(
  linkedAccessories: readonly LinkedAccessoryRule[],
  base: PriceBook = SAMPLE_PRICE_BOOK,
): PriceBook {
  return { ...base, linkedAccessories };
}

/** The catalogue rows the manufacturer supplies and the sample book prices: every row a linked accessory may name. */
export const SUPPLIED_ROW_IDS: readonly string[] = [
  ...new Set(
    SAMPLE_PRICE_BOOK.cabinetRules
      .filter((rule) => rule.suppliedBy !== "customer")
      .map((rule) => rule.buildId),
  ),
];

/** The rows the customer supplies: drawn, never sold. */
export const CUSTOMER_ROW_IDS: readonly string[] =
  SAMPLE_PRICE_BOOK.cabinetRules
    .filter((rule) => rule.suppliedBy === "customer")
    .map((rule) => rule.buildId);

/** A row the manufacturer supplies that the design has no placement priced as, so a link to it earns nothing there. A
 *  placement of a seeded body is priced as its equivalent, which is a row of this list. */
export function suppliedRowNotPlacedIn(design: Design): string {
  const placed = new Set(
    design.placements.map((placement) => placement.body.buildId),
  );
  const row = SUPPLIED_ROW_IDS.find((candidate) => !placed.has(candidate));
  if (row === undefined)
    throw new Error("the design places every row the book supplies");
  return row;
}
