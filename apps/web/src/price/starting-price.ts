// The one place an amount becomes a figure a customer reads. Two roundings, by the owner's ruling of 2026-10-28
// (M10 Q1c), which narrows [ADR 0001](../../../../docs/decisions/0001-initial-product-and-stack.md) decision 4 (every
// figure rounded up to the thousand): the kitchen TOTAL is prefixed *De la* and rounded up to the thousand MDL; every
// LINE is shown to the ten lei the domain priced it at (ADR 0175 decision 5, ADR 0177 A-1). A second rounding site for
// either would let two surfaces show different numbers for one kitchen.
//
// Lines shown to the ten lei and a total rounded to the thousand need not sum, and that is deliberate: a priced
// total of 7 200 MDL is shown as 8 000 beside lines that add to 7 200. No surface may claim they sum.
//
// *De la* stays true and unqualified when a tier prices below the default (ADR 0092 decision 12): it
// claims a starting price for the kitchen as it stands, re-derived from the current design, not a
// cross-tier floor. Interim, pending owner review: a floor reading would be a copy change to
// `price.startingPrefix` and `priceBreakdown.disclaimer`, with no arithmetic moving.
//
// The rounding a customer reads lives only here. `packages/configurator-domain/src/pricing/` rounds each line to
// ten lei at one named seam, so the lines add to the total exactly (ADR 0177 A-1); this file shows a line at that
// ten lei and rounds a total up to the thousand MDL.
import { type PricedDesign } from "@lemnaria/configurator-domain";

import type { Content } from "@/i18n/content";

/** MDL minor units are bani. */
const MINOR_UNITS_PER_MDL = 100;

/** The step a displayed total is rounded up to. */
const TOTAL_STEP_MDL = 1000;

/** The unit a displayed line is shown at: the domain's price unit (ADR 0175 decision 5), so a priced line is shown
 *  as it is priced. */
const LINE_STEP_MDL = 10;

const DIGITS_PER_GROUP = 3;

/** Grouped with a space (*"143 000 MDL"*: U+0020, currency after the amount, no decimals) here rather
 *  than through `Intl.NumberFormat`, whose output varies with runtime locale data and would change the
 *  approved figure. Measured on Node 24.19.0 against `143000`: `"ro"` gives `"143.000"`, `"ro-MD"`
 *  renders the currency as `L`, `"ru"` uses U+00A0. The separator is a product constant (ADR 0095
 *  Amendment C narrows `Intl` out of `price/`), and an ICU skeleton can switch grouping off but not
 *  choose the glyph. Only the join, `price.amountWithCurrency`, is translatable. */
const THOUSANDS_SEPARATOR = " ";

const ADDED_AMOUNT_SIGN = "+";

/** A figure as a surface renders it. Two fields because the label is styled apart from the amount
 *  (small, letter-spaced, uppercased by CSS), so no component splits a joined string. */
export interface PriceFigure {
  /** `price.startingPrefix`, the only prefix: no surface composes its own. */
  readonly label: string;
  /** The rounded amount joined to its currency by `price.amountWithCurrency`, e.g. `"43 000 MDL"`. */
  readonly amountText: string;
}

export interface StartingPriceInput {
  /** Exact minor units, as a priced total publishes them. */
  readonly totalMinor: number;
  /** The active locale's price copy; the label is composed from it here. */
  readonly copy: Content["price"];
}

/**
 * Whether this priced design holds no cabinets, read off the priced result so neither price surface
 * needs the document. The whole-kitchen lines an empty design still carries would otherwise render as
 * a meaningful zero, a tier printed *inclus* over nothing. Such a design stays valid (loadable,
 * shareable) and simply has no price. A body the customer supplies is still a cabinet line here; see
 * the domain's `holdsNothingLemnariaSupplies`.
 */
export function holdsNoCabinets(priced: PricedDesign): boolean {
  return !priced.lines.some((line) => line.kind === "cabinet");
}

/** Builds the one shape a kitchen total may be rendered from; every displayed total comes through here. A priced
 *  line is `describeLineAmount`'s. */
export function describeStartingPrice(input: StartingPriceInput): PriceFigure {
  return {
    label: input.copy.startingPrefix,
    amountText: formatTotalAmount(input.totalMinor, input.copy),
  };
}

/** The total's rounding rule, in whole MDL: up to the thousand. A priced line has its own, `describeLineAmount`'s. */
export function roundUpToThousandMdl(totalMinor: number): number {
  return roundUpToStepMdl(totalMinor, TOTAL_STEP_MDL);
}

/**
 * One total or delta, rounded up to the thousand and grouped, without the currency, which the mockups state once
 * per surface. A priced LINE is `describeLineAmount`'s, so lines and total need not sum (see the head comment).
 */
export function describeTotalAmount(amountMinor: number): string {
  return groupThousands(roundUpToThousandMdl(amountMinor));
}

/**
 * One priced line (a body, a tier, an accessory, the depth uplift), shown to the ten lei and grouped, without the
 * currency. The domain prices every line at a multiple of ten lei, so this is the line's exact amount; an amount
 * that is not (a stored snapshot) is rounded up to the next ten lei rather than shown with bani.
 */
export function describeLineAmount(amountMinor: number): string {
  return groupThousands(roundUpToStepMdl(amountMinor, LINE_STEP_MDL));
}

/**
 * An amount a choice adds, signed (*+9 000*), rounded through `roundUpToThousandMdl` so a delta and
 * the total it moves share one rule. The sign is arithmetic, so it lives here, not in a message leaf.
 *
 * Only a non-negative amount arrives (`whole-kitchen-tiers.ts`'s `BelowDefaultTierRule`): a material
 * tier cheaper than its default is refused where the delta is measured (`NegativeTierDeltaError`),
 * and a cheaper hardware tier states no amount. `assertExactMinorAmount` refuses a negative anyway.
 */
export function describeAddedAmount(amountMinor: number): string {
  return `${ADDED_AMOUNT_SIGN}${describeTotalAmount(amountMinor)}`;
}

/**
 * The join is the only part of a figure a translator may move: `price.amountWithCurrency` owns the
 * currency's name and its position. `PRICE_BOOK_CURRENCY` stays in the price book, whose parser
 * refuses any other currency. The leaf takes an already-grouped `{amount}` string, so no ICU number
 * skeleton or CLDR grouping rule reaches the digits (see `THOUSANDS_SEPARATOR`).
 */
function formatTotalAmount(totalMinor: number, copy: Content["price"]): string {
  return copy.amountWithCurrency(describeTotalAmount(totalMinor));
}

/** Whole MDL, rounded up to a multiple of `stepMdl`. An amount that is not a whole, non-negative count of minor units
 *  was already rounded or has a sign error; it is refused rather than coerced, as rendering it would invent a number. */
function roundUpToStepMdl(amountMinor: number, stepMdl: number): number {
  assertExactMinorAmount(amountMinor);
  return Math.ceil(amountMinor / (MINOR_UNITS_PER_MDL * stepMdl)) * stepMdl;
}

function assertExactMinorAmount(amountMinor: number): void {
  if (Number.isSafeInteger(amountMinor) && amountMinor >= 0) return;
  throw new RangeError(
    `A displayed amount needs a non-negative whole count of minor units; got ${String(amountMinor)}`,
  );
}

function groupThousands(amountMdl: number): string {
  const digits = String(amountMdl);
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= DIGITS_PER_GROUP) {
    groups.unshift(digits.slice(Math.max(0, end - DIGITS_PER_GROUP), end));
  }
  return groups.join(THOUSANDS_SEPARATOR);
}

/**
 * ADR 0065 decision 7b's warning, present exactly when the priced total is flagged. Here, not on a
 * surface, because the flag travels with the total wherever one is shown (decision 6): a surface
 * that builds a figure without asking can omit it on the one total a mobile customer sees.
 */
export function describeFlaggedTotalWarning(
  priced: PricedDesign,
  copy: Content["price"],
): string | undefined {
  return priced.totalIsFlagged ? copy.overflowingTotalWarning : undefined;
}
