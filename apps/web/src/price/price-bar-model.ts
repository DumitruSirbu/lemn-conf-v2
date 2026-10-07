// Frames 2A / D2A's price bar, as a value. This module owns every rule and string, the component the markup and the
// hook the subscription, so the states below can be pinned without a browser.
// - `unpriced`: a pricing failure renders no figure and no text: not a zero, not a stale one. Failure codes are
//   developer detail, and a customer sentence for them is copy nobody has ruled.
// - `empty`: a design with no cabinets prices at zero, which a customer would read as a promise, so the bar shows the
//   owner's own prompt instead. It is a state, not a validation error: the document stays valid, loadable, shareable.
// - `priced`: an overflowing design shows its total, flagged (ADR 0065 decision 6), never suppressed or reduced.
// The flag is not the rejection banner (ADR 0065 decision 8): both can be true at once and would read as opposites,
// so the warning is the bar's own line and never §9's banner. A rejected edit changes nothing, so the total stays
// byte-identical with nothing held over from before.
import type { PricingResult } from "@lemnaria/configurator-domain";

import type { Content } from "@/i18n/content";

import {
  describeFlaggedTotalWarning,
  describeStartingPrice,
  holdsNoCabinets,
  type PriceFigure,
} from "./starting-price";

/** Nothing is rendered for this: a failed pricing query has no customer-facing form, and a placeholder figure is
 *  worse than an absent one. */
export interface UnpricedBar {
  readonly kind: "unpriced";
}

/** No cabinets, so no price, and one ruled sentence saying what to do about it. Distinct from `unpriced`: a pricing
 *  failure has nothing to say to a customer, while an empty kitchen has one thing. */
export interface EmptyBar {
  readonly kind: "empty";
  readonly prompt: string;
}

export interface PricedBar {
  readonly kind: "priced";
  readonly figure: PriceFigure;
  /** ADR 0065 decision 7b's owner-ruled sentence, present exactly when the priced design reports a body past the
   *  end of its wall. Absent, never empty, otherwise. */
  readonly overflowWarning?: string;
}

export type PriceBarView = UnpricedBar | EmptyBar | PricedBar;

/** The bar takes no refusal: §9's refusal banner already says an edit was refused, so this model has nothing to read
 *  one for (see `starting-price.ts`). */
export interface DescribePriceBarInput {
  readonly content: Content;
  /** The current design priced, as `usePricedDesign` derived it this render. */
  readonly pricing: PricingResult;
}

const UNPRICED_BAR: UnpricedBar = { kind: "unpriced" };

export function describePriceBar(input: DescribePriceBarInput): PriceBarView {
  if (!input.pricing.ok) return UNPRICED_BAR;

  const { priced } = input.pricing;
  if (holdsNoCabinets(priced)) {
    return { kind: "empty", prompt: input.content.price.emptyKitchenPrompt };
  }

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
