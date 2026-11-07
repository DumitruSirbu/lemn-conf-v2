import "server-only";

import { readKitchenDefaultsForAdmittedPage } from "@/lib/server/price-dashboard/new-kitchen-defaults";

import { readAdmitted } from "./admitted-state-read";
import { isProductionBuild } from "./is-production-build";
import type { KitchenDefaultsPageInput } from "./kitchen-defaults-model";

// The one place the defaults screen's facts come from, for a page whose own staff gate has admitted the reader. They are
// two reads: the saved defaults with the two revisions a save expects, and the tiers on offer with what is switched off
// (the active book and the availability head), taken together from one head. A production build reads the stores and
// answers `unavailable` when they cannot be read, never a sample, so no invented value is ever claimed. The sample is
// loaded on a non-production read only, not when this module loads.

export type KitchenDefaultsRead =
  | { readonly kind: "ready"; readonly input: KitchenDefaultsPageInput }
  | { readonly kind: "unavailable" };

export async function readKitchenDefaults(): Promise<KitchenDefaultsRead> {
  if (isProductionBuild()) return readSavedKitchenDefaults();
  const { SAMPLE_KITCHEN_DEFAULTS } = await import("./kitchen-defaults-sample");
  return { kind: "ready", input: SAMPLE_KITCHEN_DEFAULTS };
}

/** A store that fails, a saved row that is not settings and a dashboard with no published version are all `unavailable`. */
async function readSavedKitchenDefaults(): Promise<KitchenDefaultsRead> {
  const read = await readAdmitted(readKitchenDefaultsForAdmittedPage);
  return read.kind === "read" && read.value !== undefined
    ? { kind: "ready", input: read.value }
    : { kind: "unavailable" };
}
