import "server-only";

import type {
  ItemUsageCounts,
  NewKitchenSettings,
} from "@lemnaria/configurator-domain";

import { readStateOrNothing } from "./admitted-state-read";
import { isProductionBuild } from "./is-production-build";
import { readKitchenDefaults } from "./kitchen-defaults-source";
import type {
  DashboardStateWire,
  KitchenDefaultsStateWire,
} from "./price-dashboard-wire-contract";
import { readDashboardStateWire } from "./price-dashboard-wire-reading";

// A render reads and never writes (no session, no limiter bucket, no audit row). A production build has no usage
// reader, so it is handed no count: a count is never made up.

/** What a screen of one kind of item is given. */
export interface ItemPageInput {
  readonly state: DashboardStateWire;
  readonly defaults: NewKitchenSettings | undefined;
  readonly sampleUsage?: ItemUsageCounts | undefined;
}

export type ItemListRead<Page> =
  | { readonly kind: "ready"; readonly page: Page }
  | { readonly kind: "unavailable" };

/** One item's page: the same facts, and the item asked for, which the read must hold. */
export type ItemRead<Page> =
  | ItemListRead<Page>
  | { readonly kind: "not-found" };

export interface ItemPageSource {
  /** The seam's own check: a list that cannot be worked out here would not be worked out in the browser either. */
  readonly canDerive: (state: DashboardStateWire) => boolean;
  /** Loaded on a non-production read only, so a production build never reaches the invented counts. */
  readonly loadSampleUsage: () => Promise<ItemUsageCounts>;
}

export async function readItemPage(
  source: ItemPageSource,
): Promise<ItemListRead<ItemPageInput>> {
  const state = readDashboardStateWire(await readStateOrNothing());
  if (state === undefined || !source.canDerive(state)) {
    return { kind: "unavailable" };
  }
  return { kind: "ready", page: await pageOf(state, source) };
}

/** The id is judged after the staff gate has admitted the reader. */
export function readOnlyIfHeld<Page>(
  read: ItemListRead<Page>,
  isHeld: (page: Page) => boolean,
): ItemRead<Page> {
  if (read.kind === "unavailable") return read;
  return isHeld(read.page) ? read : { kind: "not-found" };
}

async function pageOf(
  state: DashboardStateWire,
  { loadSampleUsage }: ItemPageSource,
): Promise<ItemPageInput> {
  const defaults = await readKitchenDefaults();
  return {
    state,
    defaults:
      defaults.kind === "ready" ? settingsOf(defaults.input.state) : undefined,
    sampleUsage: isProductionBuild() ? undefined : await loadSampleUsage(),
  };
}

/** The saved defaults as the lifecycle reads them; none saved reads as `{}`, the kitchen's own fallbacks. */
function settingsOf({
  saved,
  defaults,
}: KitchenDefaultsStateWire): NewKitchenSettings {
  return saved ? defaults : {};
}
