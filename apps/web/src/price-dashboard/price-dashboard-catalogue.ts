import {
  buildKitchenLBodyCatalog,
  DEFAULT_CABINET_DEPTH_MM,
  type BodyCatalog,
} from "@lemnaria/configurator-domain";

let catalogue: BodyCatalog | undefined;

/**
 * The catalogue a price book is read against on the dashboard's screens: the widths, groups and default sizes of the cabinet
 * rows. Built once, at the default depth, which the judgement of the shipped catalogue does not depend on. The browser builds
 * it too, as the domain package is free of I/O: the server only sends the book.
 */
export function priceDashboardCatalogue(): BodyCatalog {
  catalogue ??= buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM);
  return catalogue;
}
