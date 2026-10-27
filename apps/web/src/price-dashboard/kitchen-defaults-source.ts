import type { KitchenDefaultsPageInput } from "./kitchen-defaults-model";

// The one place the defaults screen's facts come from. They are two reads, not one. The saved defaults with the two
// revisions a save expects are R4b's `GET` defaults; the tiers on offer and what is switched off are the active book and
// the availability head (R1's one book root, R2's read). R4b replaces this file's body with both, answering `unavailable`
// when either cannot be read or no version is active (A-10), and `import "server-only"` goes on top then. Until then a
// production build answers `unavailable` and any other build answers an invented sample, so no real value is ever claimed.
//
// The sample is loaded on the first non-production read and not when this module loads.

export type KitchenDefaultsRead =
  | { readonly kind: "ready"; readonly input: KitchenDefaultsPageInput }
  | { readonly kind: "unavailable" };

export async function readKitchenDefaults(): Promise<KitchenDefaultsRead> {
  if (process.env.NODE_ENV === "production") return { kind: "unavailable" };
  const { SAMPLE_KITCHEN_DEFAULTS } = await import("./kitchen-defaults-sample");
  return { kind: "ready", input: SAMPLE_KITCHEN_DEFAULTS };
}
