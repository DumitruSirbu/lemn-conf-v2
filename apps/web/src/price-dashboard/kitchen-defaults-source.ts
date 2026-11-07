import "server-only";

import { readKitchenDefaultsForAdmittedPage } from "@/lib/server/price-dashboard/new-kitchen-defaults";

import { readAdmitted } from "./admitted-state-read";
import { isProductionBuild } from "./is-production-build";
import type { KitchenDefaultsPageInput } from "./kitchen-defaults-model";

// The defaults screen's facts, for a page whose staff gate has admitted the reader. A production build answers
// `unavailable` when the stores cannot be read, never a sample, so no invented value is claimed (ADR 0178).

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
