import type { ItemRef } from "@lemnaria/configurator-domain";

import type { KitchenDefaultsPageInput } from "./kitchen-defaults-model";
import type {
  DashboardIssue,
  DefaultsRefusalCode,
  KitchenDefaultsSavedWire,
  KitchenDefaultsSaveRequestWire,
} from "./price-dashboard-wire-contract";

// What the defaults screen reads and writes through. A production build has no server behind it yet: it answers `failed`
// and writes nothing. R4b's `PUT` defaults route is what replaces `defaultKitchenDefaultsClient`'s non-production branch,
// with a client that sends `KitchenDefaultsSaveRequestWire` and reads its answers as the outcomes below: `200` as `saved`,
// `400` (`KitchenDefaultsInvalidWire`) as `invalid`, `409 item-unavailable` (`DashboardItemUnavailableWire`) as
// `item-unavailable`, `409 changed-meanwhile` or `availability-changed-meanwhile` as `conflict`, and anything else
// as `failed`. `readAgain` is R4b's `GET` defaults together with the active book's tiers and the availability head (R1, R2).

export type DefaultsSaveOutcome =
  | { readonly kind: "saved"; readonly saved: KitchenDefaultsSavedWire }
  /** A value was refused as malformed (`400`). Nothing was written. */
  | {
      readonly kind: "invalid";
      readonly issues: readonly DashboardIssue<DefaultsRefusalCode>[];
    }
  /** A value names an item that is switched off or not in the active book (`409`). Nothing was written. */
  | { readonly kind: "item-unavailable"; readonly item: ItemRef }
  /** The defaults or the availability moved since the page read them. Nothing was written. */
  | { readonly kind: "conflict" }
  | { readonly kind: "failed" };

export interface KitchenDefaultsClient {
  save(request: KitchenDefaultsSaveRequestWire): Promise<DefaultsSaveOutcome>;
  /** The screen's facts again, after a refusal that says they moved; absent when they cannot be read. */
  readAgain(): Promise<KitchenDefaultsPageInput | undefined>;
}

export const UNAVAILABLE_KITCHEN_DEFAULTS_CLIENT: KitchenDefaultsClient = {
  save: () => Promise.resolve({ kind: "failed" }),
  readAgain: () => Promise.resolve(undefined),
};

/** What a call answers, or `fallback` when the client throws or its promise rejects: a screen is never left waiting. */
export async function orFallback<Outcome>(
  call: () => Promise<Outcome>,
  fallback: Outcome,
): Promise<Outcome> {
  try {
    return await call();
  } catch {
    return fallback;
  }
}

/** A client loaded by its first call, so the module behind `load` is fetched only if something is written. */
export function lazyClient(
  load: () => Promise<KitchenDefaultsClient>,
): KitchenDefaultsClient {
  let loaded: Promise<KitchenDefaultsClient> | undefined;
  const client = (): Promise<KitchenDefaultsClient> => (loaded ??= load());
  return {
    save: async (request) => (await client()).save(request),
    readAgain: async () => (await client()).readAgain(),
  };
}
