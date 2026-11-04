import {
  PRICE_STORES_GLOBAL_KEY,
  type PriceStores,
} from "@/lib/server/price-stores";

// The process's price stores as a test sets and clears them: held under the key the module reads, so no environment is
// asked to choose them and none can reach a database. Not for a test that mocks `@/lib/server/price-stores` whole: it has
// no key to hold them under.

/** A connection string that parses and names a host no resolver answers, so that a store can be made and none can connect. */
export const AN_UNREACHABLE_DATABASE_URL =
  "postgres://user:pass@database.invalid/db";

export function holdPriceStores(stores: PriceStores): void {
  (globalThis as Record<symbol, unknown>)[PRICE_STORES_GLOBAL_KEY] =
    Promise.resolve(stores);
}

export function forgetHeldPriceStores(): void {
  Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
}
