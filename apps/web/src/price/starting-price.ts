// The one place an amount becomes a figure a customer reads: prefixed *De la*, rounded up to the
// thousand MDL ([ADR 0001](../../../../docs/decisions/0001-initial-product-and-stack.md) decision 4).
// A second rounding site would let two surfaces show different numbers for one kitchen.
//
// Rounded lines and a rounded total need not sum, and that is deliberate: four 1 800 MDL lines round
// to 4 × 2 000 = 8 000, their 7 200 total rounds to 8 000 only by coincidence, and at 1 200 apiece
// it is 8 000 against 5 000. No surface may claim they sum; the disclaimer *"Toate sumele sunt
// prețuri de pornire, rotunjite în sus"* carries it.
//
// *De la* stays true and unqualified when a tier prices below the default (ADR 0092 decision 12): it
// claims a starting price for the kitchen as it stands, re-derived from the current design, not a
// cross-tier floor. Interim, pending owner review: a floor reading would be a copy change to
// `price.startingPrefix` and `priceBreakdown.disclaimer`, with no arithmetic moving.
//
// The rounding a customer reads lives only here. `packages/configurator-domain/src/pricing/` rounds each line to
// ten lei at one named seam, so the lines add to the total exactly (ADR 0177 A-1), and nothing else; this file
// rounds a line or a total up to the thousand MDL it is shown at.
import { type PricedDesign } from "@lemnaria/configurator-domain";

import type { Content } from "@/i18n/content";

/** MDL minor units are bani. */
const MINOR_UNITS_PER_MDL = 100;

/** The step every displayed figure is rounded up to. */
const ROUNDING_STEP_MDL = 1000;

const MINOR_UNITS_PER_ROUNDING_STEP = MINOR_UNITS_PER_MDL * ROUNDING_STEP_MDL;

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
  /** Exact minor units, as a priced line or a priced total publishes them. */
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

/** Builds the one shape a figure may be rendered from; every displayed price comes through here. */
export function describeStartingPrice(input: StartingPriceInput): PriceFigure {
  return {
    label: input.copy.startingPrefix,
    amountText: formatRoundedAmount(input.totalMinor, input.copy),
  };
}

/** The rounding rule itself, in whole MDL, published so lines and total share one implementation. */
export function roundUpToThousandMdl(totalMinor: number): number {
  assertExactMinorAmount(totalMinor);
  return (
    Math.ceil(totalMinor / MINOR_UNITS_PER_ROUNDING_STEP) * ROUNDING_STEP_MDL
  );
}

/**
 * One amount, rounded and grouped, without the currency, which the mockups state once per surface.
 * Rounds through `roundUpToThousandMdl`, the total's own site, so lines and total need not sum (see
 * the head comment and `priceBreakdown.note`).
 */
export function describeRoundedAmount(amountMinor: number): string {
  return groupThousands(roundUpToThousandMdl(amountMinor));
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
  return `${ADDED_AMOUNT_SIGN}${describeRoundedAmount(amountMinor)}`;
}

/**
 * The join is the only part of a figure a translator may move: `price.amountWithCurrency` owns the
 * currency's name and its position. `PRICE_BOOK_CURRENCY` stays in the price book, whose parser
 * refuses any other currency. The leaf takes an already-grouped `{amount}` string, so no ICU number
 * skeleton or CLDR grouping rule reaches the digits (see `THOUSANDS_SEPARATOR`).
 */
function formatRoundedAmount(
  totalMinor: number,
  copy: Content["price"],
): string {
  return copy.amountWithCurrency(describeRoundedAmount(totalMinor));
}

/** A price that is not a whole, non-negative count of minor units was already rounded or has a sign
 *  error; it is refused rather than coerced, as rendering it would invent a number. */
function assertExactMinorAmount(totalMinor: number): void {
  if (Number.isSafeInteger(totalMinor) && totalMinor >= 0) return;
  throw new RangeError(
    `A starting price needs a non-negative whole count of minor units; got ${String(totalMinor)}`,
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
