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
// - An **overflowing** design shows its total, flagged (ADR 0065 decision 6). Never suppressed and
//   never reduced: the customer needs the running total precisely then, to decide what to change.
//
// **The flag is not the rejection banner** (ADR 0065 decision 8). They can be true at once and read
// as opposites on one screen unless they stay distinct surfaces, which is why the warning below is
// the bar's own line and never §9's banner.
import type {
  PricingResult,
  RejectionReason,
} from "@lemnaria/configurator-domain";

import { ro } from "@/content/ro";

import {
  describeFlaggedTotalWarning,
  describeStartingPrice,
  type PriceFigure,
} from "./starting-price";

/** Nothing is rendered for this. See the head comment: a failed pricing query has no customer-facing
 *  form, and a placeholder figure is worse than an absent one. */
export interface UnpricedBar {
  readonly kind: "unpriced";
}

export interface PricedBar {
  readonly kind: "priced";
  readonly figure: PriceFigure;
  /** ADR 0065 decision 7b's owner-ruled sentence, present exactly when the priced design reports at
   *  least one body past the end of its wall. Absent — never empty — otherwise. */
  readonly overflowWarning?: string;
}

export type PriceBarView = UnpricedBar | PricedBar;

export interface DescribePriceBarInput {
  /** The current design priced, as `usePricedDesign` derived it this render. */
  readonly pricing: PricingResult;
  /** The last refused edit, or `null`. Read for the label only: a refusal cannot move a figure that
   *  is derived from the unchanged document. */
  readonly rejection: RejectionReason | null;
}

const UNPRICED_BAR: UnpricedBar = { kind: "unpriced" };

export function describePriceBar(input: DescribePriceBarInput): PriceBarView {
  if (!input.pricing.ok) return UNPRICED_BAR;

  const { priced } = input.pricing;
  const warning = describeFlaggedTotalWarning(priced);
  return {
    kind: "priced",
    figure: describeStartingPrice({
      label: describeBarLabel(input.rejection),
      totalMinor: priced.totalMinor,
    }),
    ...(warning === undefined ? {} : { overflowWarning: warning }),
  };
}

/** The unchanged label, chosen here rather than in the component so that "the figure is labelled
 *  unchanged" is a property of a value a test can read. The same string §9's footer uses: the
 *  owner's 2026-09-03 ruling is one wording for both shells. */
function describeBarLabel(rejection: RejectionReason | null): string {
  return rejection ? ro.price.startingPrefixUnchanged : ro.price.startingPrefix;
}
