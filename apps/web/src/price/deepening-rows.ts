// Which catalogue rows get deeper when a kitchen is built at the deep depth instead of the default (ADR 0177 A-6): the
// application's one measurement, taken from the catalogue built at each of the two depths and handed to every price
// surface as `deepeningRows`. Pricing binds to no catalogue, so the set is passed in, and this is the composition root
// that supplies it. Store-free and client-directive-free, like `price-book-root.ts`, which it serves.
import {
  buildKitchenLBodyCatalog,
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  measureDeepeningRows,
} from "@lemnaria/configurator-domain";

let measuredRows: ReadonlySet<string> | undefined;

/** The priced-as build ids that deepen between the default depth and the deep one, measured on first use and kept for
 *  the life of the process: the catalogue is code, so the answer cannot change under it. */
export function shippedDeepeningRows(): ReadonlySet<string> {
  measuredRows ??= measureDeepeningRows(
    buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM),
    buildKitchenLBodyCatalog(DEEP_CABINET_DEPTH_MM),
  );
  return measuredRows;
}
