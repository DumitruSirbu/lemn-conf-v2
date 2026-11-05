import { FETCHING_ITEM_LIFECYCLE_CLIENT } from "./fetching-item-lifecycle-client";
import {
  lazyItemLifecycleClient,
  type ItemLifecycleClient,
} from "./item-lifecycle-client";
import type { ItemLifecycleSeed } from "./item-lifecycle-stand-in-client";

// The lifecycle client of a screen when none is handed in: the one that asks the server in a production build, an in-memory
// one seeded with what the page showed elsewhere in any other. The test is spelled out here, not asked of
// `is-production-build.ts`, which says why.

export function defaultItemLifecycleClient(
  seed: ItemLifecycleSeed,
): ItemLifecycleClient {
  if (process.env.NODE_ENV === "production") {
    return FETCHING_ITEM_LIFECYCLE_CLIENT;
  }
  return lazyItemLifecycleClient(async () => {
    const { inMemoryItemLifecycleClient } = await import(
      "./item-lifecycle-stand-in-client"
    );
    return inMemoryItemLifecycleClient(seed);
  });
}
