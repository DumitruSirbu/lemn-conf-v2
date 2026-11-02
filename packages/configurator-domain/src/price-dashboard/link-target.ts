import type { PriceBook } from "../pricing/price-book.js";

export type LinkTargetRefusalCode =
  | "LINK_TARGET_UNKNOWN"
  | "LINK_TARGET_CUSTOMER_SUPPLIED";

/** Why a linked accessory cannot follow `linkedBuildId`: the book has no rule for it, or the customer supplies the
 *  row and an accessory would bill for what the manufacturer does not build (A-19). */
export function refuseLinkTarget(
  book: PriceBook,
  linkedBuildId: string,
): LinkTargetRefusalCode | undefined {
  const rule = book.cabinetRules.find(
    (candidate) => candidate.buildId === linkedBuildId,
  );
  if (rule === undefined) return "LINK_TARGET_UNKNOWN";
  return rule.suppliedBy === "customer"
    ? "LINK_TARGET_CUSTOMER_SUPPLIED"
    : undefined;
}
