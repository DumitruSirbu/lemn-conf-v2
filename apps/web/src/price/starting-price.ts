// **The one place an amount becomes a figure a customer reads.**
//
// [ADR 0001](../../../../docs/decisions/0001-initial-product-and-stack.md) decision 4 and the
// mockups' presentation rule: prefixed *De la*, rounded **up** to the thousand MDL. Wave 6C's
// criterion is not "the figures are formatted correctly" but "**one** function formats them" — a
// second rounding site is the defect the criterion exists to prevent, because two sites drift and
// the drift is invisible until a customer reads two different numbers for one kitchen.
//
// **The deliberate consequence, stated here because it looks like a bug:** rounded lines and a
// rounded total need not sum. Rounding four 1 800 MDL lines up gives 4 × 2 000 = 8 000; rounding
// their 7 200 total gives 8 000 only by coincidence, and at 1 200 apiece it is 8 000 against 5 000.
// **No surface may claim they sum.** Wave 6D's disclaimer — *"Toate sumele sunt prețuri de pornire,
// rotunjite în sus"* — is what carries it; wave 6C shows the total alone and no line, so it makes
// no such claim.
//
// Rounding is presentation and lives only here: `packages/configurator-domain/src/pricing/` keeps
// exact integer minor units and never rounds.
import {
  PRICE_BOOK_CURRENCY,
  type PricedDesign,
} from "@lemnaria/configurator-domain";

import { ro } from "@/content/ro";

/** MDL minor units are bani, as the price book's own head comment states. */
const MINOR_UNITS_PER_MDL = 100;

/** The step every displayed figure is rounded up to. */
const ROUNDING_STEP_MDL = 1000;

const MINOR_UNITS_PER_ROUNDING_STEP = MINOR_UNITS_PER_MDL * ROUNDING_STEP_MDL;

const DIGITS_PER_GROUP = 3;

/** The mockups group with a space — *"43 000 MDL"* — and grouping is done here rather than through
 *  `Intl.NumberFormat` on purpose: its output depends on the runtime's locale data, and this figure
 *  goes into a customer-facing document. The same reasoning that keeps the price lines' tie-break a
 *  byte comparison rather than `localeCompare` (wave 6B) applies to the number beside them. */
const THOUSANDS_SEPARATOR = " ";

/** A figure as a surface renders it: the ruled label above, the rounded amount below.
 *
 *  Two fields rather than one sentence because the mockups style them differently — the label is
 *  small, letter-spaced and uppercased by CSS — and a component that had to split a joined string
 *  to do that would be formatting a figure of its own. */
export interface PriceFigure {
  /** One of `ro.price`'s ruled prefixes. Which one is a product rule belonging to the surface's
   *  model; **no surface composes a prefix of its own.** */
  readonly label: string;
  /** The rounded amount and its currency, e.g. `"43 000 MDL"`. */
  readonly amountText: string;
}

export interface StartingPriceInput {
  readonly label: string;
  /** Exact minor units, as a priced line or a priced total publishes them. */
  readonly totalMinor: number;
}

/** Builds the one shape a figure may be rendered from. Every displayed price on every surface —
 *  the bar, §9's footer, and wave 6D's lines — comes through here. */
export function describeStartingPrice(input: StartingPriceInput): PriceFigure {
  return {
    label: input.label,
    amountText: formatRoundedAmount(input.totalMinor),
  };
}

/**
 * The rounding rule itself, in whole MDL, published so that nothing needs a second implementation
 * of it to reason about a set of figures — wave 6D rounds lines and the total through this exact
 * function, and so does the test that shows the two do not sum.
 */
export function roundUpToThousandMdl(totalMinor: number): number {
  assertExactMinorAmount(totalMinor);
  return (
    Math.ceil(totalMinor / MINOR_UNITS_PER_ROUNDING_STEP) * ROUNDING_STEP_MDL
  );
}

function formatRoundedAmount(totalMinor: number): string {
  const amountMdl = roundUpToThousandMdl(totalMinor);
  return `${groupThousands(amountMdl)} ${PRICE_BOOK_CURRENCY}`;
}

/** A price that is not a whole, non-negative count of the smallest unit is a price something has
 *  already rounded or a sign error, and rendering either would put an invented number in front of a
 *  customer. Refused rather than coerced. */
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
 * ADR 0065 decision 7b's ruled warning, present exactly when the priced total is flagged.
 *
 * Here rather than on either surface because **the flag travels with the total wherever a total is
 * shown** (decision 6), and a surface that builds a figure without asking this question is how the
 * flag went missing on the one total the mobile customer can see: §9's sheet covers the bar, and the
 * footer showed an overflowing total with nothing beside it.
 */
export function describeFlaggedTotalWarning(
  priced: PricedDesign,
): string | undefined {
  return priced.totalIsFlagged ? ro.price.overflowingTotalWarning : undefined;
}
