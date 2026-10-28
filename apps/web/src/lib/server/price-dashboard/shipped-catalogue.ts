import "server-only";

import {
  buildKitchenLBodyCatalog,
  DEFAULT_CABINET_DEPTH_MM,
  type BodyCatalog,
} from "@lemnaria/configurator-domain";

let shippedCatalog: BodyCatalog | undefined;

/**
 * The catalogue a price book is judged against: the price groups, the buildable widths and heights are read from it. Built
 * on first use, since it is code and cannot change under the process. The book's judgement does not depend on the depth the
 * catalogue is built at for the shipped catalogue, so the default depth is the one asked (M2's hand-off to R3).
 */
export function shippedCatalogue(): BodyCatalog {
  shippedCatalog ??= buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM);
  return shippedCatalog;
}
