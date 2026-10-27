import {
  lazyClient,
  UNAVAILABLE_KITCHEN_DEFAULTS_CLIENT,
  type KitchenDefaultsClient,
} from "./kitchen-defaults-client";
import type { KitchenDefaultsPageInput } from "./kitchen-defaults-model";

// The client a screen writes through when it is given none: nothing in a production build, and an in-memory stand-in seeded
// with what the page showed in any other. R4b's `PUT` client replaces the non-production branch.
//
// The test is spelled out here, not asked of another module: the bundler replaces this literal and drops the branch with
// the import behind it, while a call into another module is not folded and would ship the stand-in's chunk.

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
