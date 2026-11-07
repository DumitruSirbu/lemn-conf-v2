import { FETCHING_KITCHEN_DEFAULTS_CLIENT } from "./fetching-kitchen-defaults-client";
import {
  lazyClient,
  type KitchenDefaultsClient,
} from "./kitchen-defaults-client";
import type { KitchenDefaultsPageInput } from "./kitchen-defaults-model";

// The screen's client when none is handed in: the server's in a production build, an in-memory one otherwise. The
// `NODE_ENV` test stays literal here so the bundler drops the stand-in; `is-production-build.ts` says why.

export function defaultKitchenDefaultsClient(
  seed: KitchenDefaultsPageInput,
): KitchenDefaultsClient {
  if (process.env.NODE_ENV === "production") {
    return FETCHING_KITCHEN_DEFAULTS_CLIENT;
  }
  return lazyClient(async () => {
    const { inMemoryKitchenDefaultsClient } = await import(
      "./kitchen-defaults-stand-in-client"
    );
    return inMemoryKitchenDefaultsClient(seed);
  });
}
