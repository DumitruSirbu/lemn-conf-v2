import { isProductionBuild } from "./is-production-build";
import type { KitchenDefaultsPageInput } from "./kitchen-defaults-model";

// The one place the defaults screen's facts come from. They are two reads: the saved defaults with the two revisions a save
// expects, and the tiers on offer with what is switched off (the active book and the availability head). A production
// build answers `unavailable`, never a sample, so no invented value is ever claimed. The sample is loaded on a
// non-production read only, not when this module loads.

export type KitchenDefaultsRead =
  | { readonly kind: "ready"; readonly input: KitchenDefaultsPageInput }
  | { readonly kind: "unavailable" };

export async function readKitchenDefaults(): Promise<KitchenDefaultsRead> {
  if (isProductionBuild()) return { kind: "unavailable" };
  const { SAMPLE_KITCHEN_DEFAULTS } = await import("./kitchen-defaults-sample");
  return { kind: "ready", input: SAMPLE_KITCHEN_DEFAULTS };
}
