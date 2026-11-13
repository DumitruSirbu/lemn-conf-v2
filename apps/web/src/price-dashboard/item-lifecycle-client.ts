import type {
  AvailabilityRefusalCode,
  CatalogueAvailability,
  ItemRef,
  ItemUsageCounts,
} from "@lemnaria/configurator-domain";

import { memoizeAsync } from "./async-seams";
import type { AvailabilityRequestWire } from "./price-dashboard-wire-contract";

// What the screens that switch an item on or off, and count the saved kitchens that use one, go through. A server
// client sends `AvailabilityRequestWire` and reads its answers as the outcomes below: `200` as `set`, `409` of the
// domain's own refusal words as `refused`, `409 changed-meanwhile` as `conflict`, `401` as `session-ended`, and
// anything else as `failed`. `readUsage` asks the usage reader for the items named and answers `counted` with the count
// of each item it could speak of: an item the server does not state has none, and is never given a zero.

export type AvailabilityOutcome =
  /** Written: the revision it created. */
  | { readonly kind: "set"; readonly revision: string }
  /** The write was judged and refused (`409`). Nothing was written. */
  | { readonly kind: "refused"; readonly code: AvailabilityRefusalCode }
  /** The availability moved since the screen read it. Nothing was written. */
  | { readonly kind: "conflict" }
  | { readonly kind: "session-ended" }
  | { readonly kind: "failed" };

export type UsageRead =
  | { readonly kind: "counted"; readonly counts: ItemUsageCounts }
  | { readonly kind: "unavailable" };

export interface ItemLifecycleClient {
  /**
   * Whether a write reaches anything. Where it does not, the screen offers no switch-on and no deletion, and sends
   * nothing. Whether a deletion is allowed is still the server's judgement.
   */
  readonly canWrite: boolean;
  setActive(request: AvailabilityRequestWire): Promise<AvailabilityOutcome>;
  /**
   * `signal` says nobody wants the answer any more: a read that has not been sent yet is then dropped and answers
   * `unavailable`; one already on its way is left to finish, since another view may be waiting on it.
   */
  readUsage(
    items: readonly ItemRef[],
    signal?: AbortSignal,
  ): Promise<UsageRead>;
  /** What is switched off now; absent when it cannot be read. */
  readAvailability(): Promise<CatalogueAvailability | undefined>;
}

/**
 * The client of a build with nothing behind the screen: nothing is written and nothing is counted, so no figure is
 * claimed.
 */
export const UNAVAILABLE_ITEM_LIFECYCLE_CLIENT: ItemLifecycleClient = {
  canWrite: false,
  setActive: () => Promise.resolve({ kind: "failed" }),
  readUsage: () => Promise.resolve({ kind: "unavailable" }),
  readAvailability: () => Promise.resolve(undefined),
};

/** A client loaded by its first call, so the module behind `load` is fetched only if something is asked. It stands for
 *  a client that writes: one that does not is the unavailable client, which is never loaded lazily. */
export function lazyItemLifecycleClient(
  load: () => Promise<ItemLifecycleClient>,
): ItemLifecycleClient {
  const client = memoizeAsync(load);
  return {
    canWrite: true,
    setActive: async (request) => (await client()).setActive(request),
    readUsage: async (items, signal) =>
      (await client()).readUsage(items, signal),
    readAvailability: async () => (await client()).readAvailability(),
  };
}
