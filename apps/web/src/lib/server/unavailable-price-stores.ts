import "server-only";

import {
  DashboardStoreError,
  type CatalogueAvailabilityStore,
  type DashboardStoreOperation,
  type PriceBookStore,
} from "@lemnaria/persistence";

// The stores of production until the Neon stores exist (M10 lanes S2 and S2b). Every call is the store's own refusal,
// "unavailable": a table is missing. A reader acts on it exactly as it would on a database that cannot answer, so no
// price surface prices from anything and the contact route answers its one unavailable answer (A-10).

function unavailable(operation: DashboardStoreOperation): Promise<never> {
  return Promise.reject(new DashboardStoreError(operation, "unavailable"));
}

export const UNAVAILABLE_PRICE_BOOK_STORE: PriceBookStore = Object.freeze({
  readActive: () => unavailable("read the active price version"),
  readVersion: () => unavailable("read a price version"),
  listVersions: () => unavailable("list the price versions"),
  readDraft: () => unavailable("read the price draft"),
  writeDraft: () => unavailable("write the price draft"),
  publish: () => unavailable("publish the price book"),
});

export const UNAVAILABLE_CATALOGUE_AVAILABILITY_STORE: CatalogueAvailabilityStore =
  Object.freeze({
    readCurrent: () => unavailable("read the catalogue availability"),
    readAt: () => unavailable("read the catalogue availability"),
    setActive: () => unavailable("set an item's availability"),
  });
