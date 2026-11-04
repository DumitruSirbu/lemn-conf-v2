import {
  lazyClient,
  UNAVAILABLE_KITCHEN_DEFAULTS_CLIENT,
  type KitchenDefaultsClient,
} from "./kitchen-defaults-client";
import type { KitchenDefaultsPageInput } from "./kitchen-defaults-model";

// The screen's client when none is handed in: nothing in a production build, an in-memory one seeded with what the page
// showed elsewhere. The test is spelled out here, not asked of `is-production-build.ts`, which says why.

export function defaultKitchenDefaultsClient(
  seed: KitchenDefaultsPageInput,
): KitchenDefaultsClient {
  if (process.env.NODE_ENV === "production") {
    return UNAVAILABLE_KITCHEN_DEFAULTS_CLIENT;
  }
  return lazyClient(async () => {
    const { inMemoryKitchenDefaultsClient } = await import(
      "./kitchen-defaults-stand-in-client"
    );
    return inMemoryKitchenDefaultsClient(seed);
  });
}
