import "server-only";

import {
  DashboardStoreError,
  type CatalogueAvailabilityStore,
  type DashboardStoreOperation,
  type KitchenDefaultsStore,
  type KitchenUsageReader,
  type PriceBookStore,
  type PriceNoticeStore,
} from "@lemnaria/persistence";

// The stores production holds where no database connection can be made. Every call is the store's own refusal,
// "unavailable". A reader acts on it exactly as it would on a database that cannot answer, so no price surface prices
// from anything and the contact route answers its one unavailable answer (A-10).

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

export const UNAVAILABLE_KITCHEN_DEFAULTS_STORE: KitchenDefaultsStore =
  Object.freeze({
    read: () => unavailable("read the kitchen defaults"),
    save: () => unavailable("save the kitchen defaults"),
  });

export const UNAVAILABLE_KITCHEN_USAGE_READER: KitchenUsageReader =
  Object.freeze({
    countEach: () => unavailable("count the kitchens using an item"),
  });

export const UNAVAILABLE_PRICE_NOTICE_STORE: PriceNoticeStore = Object.freeze({
  readAcknowledged: () => unavailable("read a design's acknowledged prices"),
  recordIfAbsent: () => unavailable("record a design's first-open prices"),
  recordAcknowledged: () =>
    unavailable("record a design's acknowledged prices"),
});
