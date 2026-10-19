import type { PricedDesign } from "@lemnaria/configurator-domain";

import type { Content } from "@/i18n/content";
import {
  describeFlaggedTotalWarning,
  describeStartingPrice,
  holdsNoCabinets,
  type PriceFigure,
} from "@/price/starting-price";

// What a kitchen's card says about its cost. Rounding lives only in the price formatter, so the age arithmetic is in
// `relative-age.ts`.

export interface KitchenPrice {
  readonly figure: PriceFigure;
  /** Present exactly when the priced total is flagged, as on the configurator's bar. */
  readonly overflowWarning?: string;
}

/** The card's price line, made by the rules of every other price surface. A kitchen that could not be priced, or holds no
 *  cabinets, has no price: a zero would read as a promise. */
export function describeKitchenPrice(
  priced: PricedDesign | undefined,
  copy: Content["price"],
): KitchenPrice | undefined {
  if (priced === undefined || holdsNoCabinets(priced)) return undefined;
  const overflowWarning = describeFlaggedTotalWarning(priced, copy);
  return {
    figure: describeStartingPrice({ totalMinor: priced.totalMinor, copy }),
    ...(overflowWarning === undefined ? {} : { overflowWarning }),
  };
}
