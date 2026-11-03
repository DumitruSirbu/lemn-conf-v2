import "server-only";

import type { NewKitchenSettings } from "@lemnaria/configurator-domain";

import { readStateOrNothing } from "./admitted-state-read";
import { isProductionBuild } from "./is-production-build";
import { readKitchenDefaults } from "./kitchen-defaults-source";
import { deriveMaterials, type MaterialPageInput } from "./material-model";
import type {
  DashboardStateWire,
  KitchenDefaultsStateWire,
} from "./price-dashboard-wire-contract";
import { readDashboardStateWire } from "./price-dashboard-wire-reading";

// The one place the materials screens' facts come from: the dashboard's state, read for a page whose staff gate
// (`price.edit`) has already admitted the reader, and the saved new-kitchen defaults, which judging a switch-off needs.
// A render reads and never writes: no session, no limiter bucket, no audit row. A state that cannot be read is
// `unavailable` and no price is claimed. Defaults that cannot be read leave the page drawn with none judged; a
// production build has no usage reader yet, so it hands the page no count, and a count is never made up.

export type MaterialsRead =
  | { readonly kind: "ready"; readonly page: MaterialPageInput }
  | { readonly kind: "unavailable" };

/** One material's page: the same facts, and the material asked for, which the book must hold. */
export type MaterialRead =
  | { readonly kind: "ready"; readonly page: MaterialPageInput }
  | { readonly kind: "not-found" }
  | { readonly kind: "unavailable" };

export async function readMaterials(): Promise<MaterialsRead> {
  const state = readDashboardStateWire(await readStateOrNothing());
  // The seam's own check: a list that cannot be worked out here would not be worked out in the browser either.
  if (state === undefined || deriveMaterials(state).kind !== "ready") {
    return { kind: "unavailable" };
  }
  return { kind: "ready", page: await pageOf(state) };
}

/** The id is judged here, after the staff gate has admitted the reader. */
export async function readMaterial(tierId: string): Promise<MaterialRead> {
  const read = await readMaterials();
  if (read.kind === "unavailable") return read;
  const { book } = read.page.state.active;
  const isHeld = book.material.tiers.some((tier) => tier.tierId === tierId);
  return isHeld ? read : { kind: "not-found" };
}

async function pageOf(state: DashboardStateWire): Promise<MaterialPageInput> {
  const defaults = await readKitchenDefaults();
  return {
    state,
    defaults:
      defaults.kind === "ready" ? settingsOf(defaults.input.state) : undefined,
    sampleUsage: await sampleUsage(),
  };
}

/**
 * The saved defaults as the lifecycle reads them; none saved reads as `{}`, and the kitchen starts from the fixed
 * fallbacks.
 */
function settingsOf({
  saved,
  defaults,
}: KitchenDefaultsStateWire): NewKitchenSettings {
  return saved ? defaults : {};
}

async function sampleUsage(): Promise<MaterialPageInput["sampleUsage"]> {
  if (isProductionBuild()) return undefined;
  const { SAMPLE_MATERIAL_USAGE } = await import("./material-sample");
  return SAMPLE_MATERIAL_USAGE;
}
