import { holdPriceStores } from "./held-price-stores";
import { freshPriceDashboardWorld } from "./price-dashboard-world";

// A module of its own: `price-dashboard-world` is loaded by the factories that mock `@/lib/server/price-stores`, and
// `held-price-stores` imports that module, so joining them in one file would make the mock wait on itself.

/** The state before the first publish, held as the process's price stores: they answer, and no version is active. */
export async function holdNoActivePriceVersion(): Promise<void> {
  const { stores } = await freshPriceDashboardWorld({ isPublished: false });
  holdPriceStores(stores);
}
