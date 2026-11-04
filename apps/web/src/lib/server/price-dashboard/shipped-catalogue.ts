import "server-only";

import {
  buildKitchenLBodyCatalog,
  DEFAULT_CABINET_DEPTH_MM,
  type BodyCatalog,
} from "@lemnaria/configurator-domain";

let shippedCatalog: BodyCatalog | undefined;

/**
 * The catalogue a price book is judged against: the price groups and the buildable widths and heights are read from it.
 * Built once, at the default depth: the judgement of the shipped catalogue does not depend on the depth it is built at.
 */
export function shippedCatalogue(): BodyCatalog {
  shippedCatalog ??= buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM);
  return shippedCatalog;
}
