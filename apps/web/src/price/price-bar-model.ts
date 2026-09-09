// Frames 2A / D2A's price bar, as a value.
//
// The same split §9's panel uses: this module owns every rule and every string, the component owns
// the markup, and the hook owns the subscription. A pure projection can be asserted as a value,
// which is what lets the three states below be pinned without a browser.
//
// **Three states, and each answers a different question:**
//
// - A **rejected** edit never happened, so the design did not change, so the total is byte-identical
//   — nothing here has to hold a previous figure, because the figure is derived from a document the
//   refusal did not touch. What changes is the label: *"De la neschimbat"* (owner, 2026-09-03),
//   which is ADR 0024's third frame-2C requirement, unmet since M4 for want of a total to leave
//   unmoved.
// - A **pricing failure** renders **no figure**: not a zero, not a stale one, not a dash that reads
//   as free. `unpriced` carries no text at all — pricing's failure codes are developer detail, and
//   inventing a customer sentence for them is copy nobody has ruled.
// - An **empty** design prices successfully at zero, and zero is the one figure a customer would
//   read as a promise. **M6-AUD-014, ruled by the owner 2026-09-09**: the document stays valid,
//   loadable and shareable — nothing is refused at any seam — and the bar shows the owner's own
//   prompt in place of the figure. This is the state M7 will reach whenever it generates an empty or
//   failed proposal, which is why it is a state and not a validation error.
// - An **overflowing** design shows its total, flagged (ADR 0065 decision 6). Never suppressed and
//   never reduced: the customer needs the running total precisely then, to decide what to change.
//
// **The flag is not the rejection banner** (ADR 0065 decision 8). They can be true at once and read
// as opposites on one screen unless they stay distinct surfaces, which is why the warning below is
// the bar's own line and never §9's banner.
import type { PricingResult } from "@lemnaria/configurator-domain";

import { ro } from "@/content/ro";

import type { Content } from "@/i18n/content";

import {
  describeFlaggedTotalWarning,
  describeStartingPrice,
  holdsNoCabinets,
  type PriceFigure,
} from "./starting-price";

/** Nothing is rendered for this. See the head comment: a failed pricing query has no customer-facing
 *  form, and a placeholder figure is worse than an absent one. */
export interface UnpricedBar {
  readonly kind: "unpriced";
}

/** No cabinets, so no price — and one ruled sentence saying what to do about it. Distinct from
 *  `unpriced`, and the difference is the whole of M6-AUD-014: a pricing *failure* has nothing to say
 *  to a customer, while an empty kitchen has exactly one thing. */
export interface EmptyBar {
  readonly kind: "empty";
  readonly prompt: string;
}

export interface PricedBar {
  readonly kind: "priced";
  readonly figure: PriceFigure;
  /** ADR 0065 decision 7b's owner-ruled sentence, present exactly when the priced design reports at
   *  least one body past the end of its wall. Absent — never empty — otherwise. */
  readonly overflowWarning?: string;
}

export type PriceBarView = UnpricedBar | EmptyBar | PricedBar;

/** **The bar takes no refusal, and that is the owner's ruling of 2026-09-09 in the type.** It used to
 *  take one to choose the *"De la neschimbat"* label; that label is gone — §9's refusal banner
 *  already says the edit was refused — so this model has nothing to read a refusal for and is not
 *  handed one. `starting-price.ts` carries the ruling and its reason. */
export interface DescribePriceBarInput {
  readonly content: Content;
  /** The current design priced, as `usePricedDesign` derived it this render. */
  readonly pricing: PricingResult;
}

const UNPRICED_BAR: UnpricedBar = { kind: "unpriced" };

const EMPTY_BAR: EmptyBar = {
  kind: "empty",
  prompt: ro.price.emptyKitchenPrompt,
};

export function describePriceBar(input: DescribePriceBarInput): PriceBarView {
  if (!input.pricing.ok) return UNPRICED_BAR;

  const { priced } = input.pricing;
  if (holdsNoCabinets(priced)) return EMPTY_BAR;

  const warning = describeFlaggedTotalWarning(priced, input.content.price);
  return {
    kind: "priced",
    figure: describeStartingPrice({
      totalMinor: priced.totalMinor,
      copy: input.content.price,
    }),
    ...(warning === undefined ? {} : { overflowWarning: warning }),
  };
}
