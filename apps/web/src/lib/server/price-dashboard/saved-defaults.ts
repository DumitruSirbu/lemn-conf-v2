import "server-only";

import {
  readStoredNewKitchenSettings,
  type NewKitchenSettings,
} from "@lemnaria/configurator-domain";
import { INITIAL_REVISION, NONE_SAVED } from "@lemnaria/persistence";

import { DashboardStateUnreadableError } from "@/lib/server/price-dashboard/dashboard-state";
import type { PriceStores } from "@/lib/server/price-stores";

/** The defaults the dashboard has saved, with the revision a save of them is made against. */
export interface SavedDefaults {
  readonly revision: string;
  readonly defaults: NewKitchenSettings;
}

/** What none having been saved reads as: no setting named, so a new kitchen starts from the fixed fallbacks. */
const NONE_SAVED_DEFAULTS: SavedDefaults = Object.freeze({
  revision: INITIAL_REVISION,
  defaults: Object.freeze({}),
});

/**
 * The saved defaults, parsed. A row the store holds that is not settings is thrown (the route answers `503`), never
 * read as `NONE_SAVED_DEFAULTS`: judging against fallbacks would release the default the saved row names.
 */
export async function readSavedDefaults(
  stores: Pick<PriceStores, "defaults">,
): Promise<SavedDefaults> {
  const { revision, defaults } = await readSavedDefaultsLeniently(stores);
  if (defaults === undefined) {
    throw new DashboardStateUnreadableError("defaults");
  }
  return { revision, defaults };
}

/**
 * The revision a save is made against, and the settings the row holds, or `undefined` for a row that is not settings.
 */
export interface SavedDefaultsReading {
  readonly revision: string;
  readonly defaults: NewKitchenSettings | undefined;
}

/**
 * The same read, which keeps what `readSavedDefaults` throws away: the revision of a row that is not settings, so that
 * the one write that can mend it is made against it. Only that write reads this way; every judgement still throws.
 */
export async function readSavedDefaultsLeniently(
  stores: Pick<PriceStores, "defaults">,
): Promise<SavedDefaultsReading> {
  const read = await stores.defaults.read();
  if (read.kind === NONE_SAVED.kind) return NONE_SAVED_DEFAULTS;
  const reading = readStoredNewKitchenSettings(read.saved.defaults);
  return {
    revision: read.saved.revision,
    defaults: reading.ok ? reading.defaults : undefined,
  };
}
