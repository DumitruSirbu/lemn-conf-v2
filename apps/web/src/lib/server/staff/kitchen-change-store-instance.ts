import "server-only";

import type { KitchenChangeStore } from "@lemnaria/persistence";

/**
 * The kitchen change store's one instance. No database-backed store exists until wave S4, so this throws fixed text
 * and a seen mark answers `503` and writes nothing: fail closed, never a silent success. Tests replace this module
 * with the fake; nothing selects a fake in production code.
 */
export function getKitchenChangeStore(): KitchenChangeStore {
  throw new Error(
    "No database-backed KitchenChangeStore exists yet (wave S4): a seen mark is unavailable.",
  );
}
