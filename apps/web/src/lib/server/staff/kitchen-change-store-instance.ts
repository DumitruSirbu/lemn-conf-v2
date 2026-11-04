import "server-only";

import type { KitchenChangeStore } from "@lemnaria/persistence";
import { NeonKitchenChangeStore } from "@lemnaria/persistence";

let kitchenChangeStore: KitchenChangeStore | undefined;

/**
 * The kitchen change store's one instance, made on first use and never at import or build, so no connection is opened
 * where no kitchen is marked seen. A module of its own, as the staff kitchen reader's is, so a test that fakes one
 * does not take the other along.
 */
export function getKitchenChangeStore(): KitchenChangeStore {
  kitchenChangeStore ??= new NeonKitchenChangeStore();
  return kitchenChangeStore;
}
