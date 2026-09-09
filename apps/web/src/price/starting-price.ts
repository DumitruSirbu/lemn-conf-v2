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
// **What *De la* claims, now that a tier can price below the default** (wave 6W, ADR 0092
// decision 12). The claim is left **true and unqualified**, and the reasoning is recorded here
// because the alternative was reached for first and rejected.
//
// M6's PAL-as-both-defaults ruling justified itself partly on *De la* being a **floor**, and 6W
// falsifies one reading of that: a drawer-dominant kitchen costs *less* at Hettich than at the
// default hardware tier, so the default-tier total is no longer the cheapest total the customer
// could reach. But that reading — *no choice you could make costs less than this* — is a sentence in
// a repository record, not one this product ever put on a screen. What the customer is shown is
// `priceBreakdown.disclaimer`: a starting price for **the kitchen as it currently stands**, rounded
// up, excluding transport, worktop and appliances, with the final sum set after the on-site
// measurement. Every clause of that stays true when a tier prices below the default, because the
// figure is re-derived from the design the customer is looking at — choose Hettich and the figure
// itself comes down with it. So there is nothing to qualify: qualifying it would mean adding a
// clause about a claim the copy does not make.
//
// **Interim, pending owner review** — the marker wave 6G set. If the owner reads *De la* as a
// cross-tier floor rather than a pre-measurement one, the fix is a copy change to
// `ro.price.startingPrefix` and `ro.priceBreakdown.disclaimer`, and this comment is where it lands;
// no arithmetic here moves either way, which is why the wave does not wait on the answer.
//
// Rounding is presentation and lives only here: `packages/configurator-domain/src/pricing/` keeps
// exact integer minor units and never rounds.
import {
  PRICE_BOOK_CURRENCY,
  type PricedDesign,
  type RejectionReason,
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

/** The mockups' own mark for an amount a choice *adds* to the figure rather than being it — frames
 *  2E / D2E's *+9 000*. See `describeAddedAmount`. */
const ADDED_AMOUNT_SIGN = "+";

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

/**
 * **What a figure is called while a refusal stands** — *"De la neschimbat"* — and what it is called
 * otherwise. Owner, 2026-09-03: one wording for both shells.
 *
 * Here rather than beside any one surface because **three** surfaces now show a total, and until
 * wave 6G there were two private copies of this line — `price-bar-model.ts`'s `describeBarLabel` and
 * `panel-model.ts`'s `describeFooterPriceLabel` — agreeing by inspection. A third copy is how they
 * start disagreeing, and the disagreement is invisible: each surface looks right on its own, and
 * only a customer with both in view sees one total call itself unchanged while the other does not.
 * That is exactly what 6G's settings sheet produced before this existed, on the one total a mobile
 * customer can actually see, because the sheet covers the bar it was opened from.
 *
 * The figure itself never moves — a refusal leaves the design it is derived from untouched — so what
 * a rejection changes is only what the figure is called.
 */
export function describeStartingLabel(
  rejection: RejectionReason | null,
): string {
  return rejection ? ro.price.startingPrefixUnchanged : ro.price.startingPrefix;
}

/** Builds the one shape a figure may be rendered from. Every displayed price on every surface —
 *  the bar, §9's footer, and wave 6D's lines — comes through here. */
/**
 * **Whether this priced design holds no cabinets at all** — M6-AUD-014's discriminator, in the one
 * module both price surfaces already import so they cannot come to disagree about what "empty"
 * means.
 *
 * Read off the priced result rather than off the design, so neither model has to be handed a
 * document it otherwise does not need: a design with placements always produces `cabinet` lines and
 * a design with none never does. The whole-kitchen lines an empty design still carries are exactly
 * what would otherwise render as a meaningful zero — a tier printed *inclus* over nothing.
 *
 * The owner's ruling (2026-09-09) is that such a design stays **valid**: loadable, shareable,
 * refused at no seam. It simply has no price, and the surfaces say so rather than printing one.
 */
export function holdsNoCabinets(priced: PricedDesign): boolean {
  return !priced.lines.some((line) => line.kind === "cabinet");
}

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

/**
 * One amount, rounded and grouped, **without the currency** — what frames 2D and D2D print against
 * every line of the breakdown.
 *
 * Here rather than in the breakdown for the reason this whole module exists: grouping is formatting,
 * and a second `THOUSANDS_SEPARATOR` somewhere else is a second formatter however small. The
 * currency is left off because the mockups state it once per surface, on the figure the lines sit
 * under, and repeating it on every line is not what was drawn.
 *
 * Rounds through `roundUpToThousandMdl`, the same site the total uses, which is exactly why the
 * lines and the total **need not sum** — see this module's head comment, and the disclaimer in
 * `ro.priceBreakdown.note` that carries it.
 */
export function describeRoundedAmount(amountMinor: number): string {
  return groupThousands(roundUpToThousandMdl(amountMinor));
}

/**
 * **An amount a choice *adds*, signed** — frames 2E / D2E's *+9 000*, the figure their *de la*
 * badge is built from.
 *
 * Rounded through `roundUpToThousandMdl` like every other displayed amount, so a tier's delta and
 * the total it moves cannot round by two different rules. The sign lives here rather than in
 * `ro.ts` for the reason the currency does: it is part of the *figure*, and a `+` written into a
 * copy module is somebody authoring arithmetic into a label.
 *
 * **Only a non-negative amount reaches this**, still, and by two rules rather than one since
 * wave 6W (`whole-kitchen-tiers.ts`'s `BelowDefaultTierRule`): a **material** tier cheaper than its
 * group's default is refused where the delta is measured (`NegativeTierDeltaError`), because what is
 * wrong with it is a fact about the book; a **hardware** tier cheaper than its group's default is a
 * fact about the customer's own kitchen and states no amount at all, so none arrives here. The sign
 * is still not this module's question, and `assertExactMinorAmount` below would refuse a negative
 * here anyway.
 */
export function describeAddedAmount(amountMinor: number): string {
  return `${ADDED_AMOUNT_SIGN}${describeRoundedAmount(amountMinor)}`;
}

function formatRoundedAmount(totalMinor: number): string {
  return `${describeRoundedAmount(totalMinor)} ${PRICE_BOOK_CURRENCY}`;
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
