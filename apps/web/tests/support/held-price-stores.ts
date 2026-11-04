import {
  PRICE_STORES_GLOBAL_KEY,
  type PriceStores,
} from "@/lib/server/price-stores";

import { freshPriceDashboardWorld } from "./price-dashboard-world";

// The state a test gives the process's price stores when it asks the real `getPriceStores` for production's answer: the
// stores are held under the key the module reads, so no environment is asked to choose them and none can reach a database.
// Not for a test that mocks `@/lib/server/price-stores` whole: it has no key to hold them under.

export function holdPriceStores(stores: PriceStores): void {
  (globalThis as Record<symbol, unknown>)[PRICE_STORES_GLOBAL_KEY] =
    Promise.resolve(stores);
}

export function forgetHeldPriceStores(): void {
  Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
}

/** The state before the first publish: stores that answer, and no version is active. Needs a fresh account world. */
export async function holdNoActivePriceVersion(): Promise<void> {
  const { stores } = await freshPriceDashboardWorld({ isPublished: false });
  holdPriceStores(stores);
}
