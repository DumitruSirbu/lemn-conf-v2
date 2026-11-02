import "server-only";

import type { NewKitchenSettings } from "@lemnaria/configurator-domain";

import { readStateOrNothing } from "./admitted-state-read";
import { deriveHardware, type HardwarePageInput } from "./hardware-model";
import { isProductionBuild } from "./is-production-build";
import { readKitchenDefaults } from "./kitchen-defaults-source";
import type {
  DashboardStateWire,
  KitchenDefaultsStateWire,
} from "./price-dashboard-wire-contract";
import { readDashboardStateWire } from "./price-dashboard-wire-reading";

// The one place the hardware screens' facts come from: the dashboard's state, read for a page whose staff gate
// (`price.edit`) has already admitted the reader, and the saved new-kitchen defaults, which judging a switch-off needs. A
// render reads and never writes: no session, no limiter bucket, no audit row. A state that cannot be read is `unavailable`
// and no price is claimed. Defaults that cannot be read leave the page drawn with none judged; a production build has no
// usage reader yet, so it hands the page no count, and a count is never made up.

export type HardwareRead =
  | { readonly kind: "ready"; readonly page: HardwarePageInput }
  | { readonly kind: "unavailable" };

/** One class's page: the same facts, and the class asked for, which neither the book nor the draft may hold. */
export type HardwareClassRead =
  | { readonly kind: "ready"; readonly page: HardwarePageInput }
  | { readonly kind: "not-found" }
  | { readonly kind: "unavailable" };

export async function readHardware(): Promise<HardwareRead> {
  const state = readDashboardStateWire(await readStateOrNothing());
  // The seam's own check: a list that cannot be worked out here would not be worked out in the browser either.
  if (state === undefined || deriveHardware(state).kind !== "ready") {
    return { kind: "unavailable" };
  }
  return { kind: "ready", page: await pageOf(state) };
}

/** The id is judged here, after the staff gate has admitted the reader. */
export async function readHardwareClass(
  tierId: string,
): Promise<HardwareClassRead> {
  const read = await readHardware();
  if (read.kind === "unavailable") return read;
  const { book } = read.page.state.active;
  const isHeld = book.hardware.tiers.some((tier) => tier.tierId === tierId);
  const isCreatedInDraft = read.page.state.draft.changes.some(
    ({ address }) =>
      address.kind === "hardware-tier-created" && address.tierId === tierId,
  );
  return isHeld || isCreatedInDraft ? read : { kind: "not-found" };
}

async function pageOf(state: DashboardStateWire): Promise<HardwarePageInput> {
  const defaults = await readKitchenDefaults();
  return {
    state,
    defaults:
      defaults.kind === "ready" ? settingsOf(defaults.input.state) : undefined,
    sampleUsage: await sampleUsage(),
  };
}

/** The saved defaults as the lifecycle reads them; none saved reads as `{}`, and the kitchen starts from the fixed fallbacks. */
function settingsOf({
  saved,
  defaults,
}: KitchenDefaultsStateWire): NewKitchenSettings {
  return saved ? defaults : {};
}

async function sampleUsage(): Promise<HardwarePageInput["sampleUsage"]> {
  if (isProductionBuild()) return undefined;
  const { SAMPLE_HARDWARE_USAGE } = await import("./hardware-sample");
  return SAMPLE_HARDWARE_USAGE;
}
