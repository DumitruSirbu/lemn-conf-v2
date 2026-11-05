import "server-only";

import {
  DEFAULT_FINISH,
  DEFAULT_HANDLE,
  DEFAULT_MATERIAL_ID,
  handleRef,
  isItemOffered,
  judgeKitchenDefaults,
  lookUpMaterial,
  stampedSettingsOf,
  tierRef,
  TOP_ROW_HANDLE,
  type CatalogueAvailability,
  type Finish,
  type ItemRef,
  type NewKitchenSettings,
  type PriceBook,
  type TierGroup,
  type TierIdentity,
} from "@lemnaria/configurator-domain";
import { DashboardStoreError, INITIAL_REVISION } from "@lemnaria/persistence";

import {
  DashboardStateUnreadableError,
  readDashboardAvailability,
} from "@/lib/server/price-dashboard/dashboard-state";
import { readActiveBook } from "@/lib/server/price-dashboard/item-ref-reading";
import {
  readSavedDefaults,
  type SavedDefaults,
} from "@/lib/server/price-dashboard/saved-defaults";
import { getPriceStores, type PriceStores } from "@/lib/server/price-stores";
import type {
  KitchenDefaultsPageInput,
  TierOffer,
} from "@/price-dashboard/kitchen-defaults-model";
import type { KitchenDefaultsWire } from "@/price-dashboard/price-dashboard-wire-contract";

// What a new kitchen starts from, read two ways. The dashboard's page reads the saved defaults as they are stored, completed
// from the fixed fallbacks. A customer's new kitchen reads them judged against what is on offer now, and never fails: a
// creation is never blocked by the dashboard's data.

/** The two tier ids only the active book can name. Both are absent when there is no book. */
interface FixedTiers {
  readonly materialTierId?: string;
  readonly hardwareTierId?: string;
}

/** All six settings, each a value; the two tiers are absent only when no book could name them. */
export interface CompletedSettings
  extends Omit<KitchenDefaultsWire, "materialTierId" | "hardwareTierId"> {
  readonly materialTierId?: string;
  readonly hardwareTierId?: string;
}

// ---------------------------------------------------------------------------------------------------------------------
// The completion

/**
 * The saved defaults with every key the row lacks taken from the fixed fallbacks: the book's material and hardware tier,
 * the reference depth, the kitchen's and the top row's handle, and the stamped material's own colour. The colour is reset
 * where the stamped material does not offer it, as the stamp does it.
 */
export function completedDefaultsOf(
  saved: NewKitchenSettings,
  book: PriceBook,
): KitchenDefaultsWire {
  const tiers = fixedTiersOf(book);
  const {
    materialTierId = tiers.materialTierId,
    hardwareTierId = tiers.hardwareTierId,
    ...rest
  } = completionOf(saved, tiers);
  return { materialTierId, hardwareTierId, ...rest };
}

function fixedTiersOf(book: PriceBook): Required<FixedTiers> {
  return {
    materialTierId: book.material.defaultTierId,
    hardwareTierId: book.hardware.defaultTierId,
  };
}

function completionOf(
  saved: NewKitchenSettings,
  tiers: FixedTiers,
): CompletedSettings {
  const stamped = stampedSettingsOf({ ...tiers, ...saved });
  const { materialTierId, hardwareTierId } = stamped;
  return {
    ...(materialTierId === undefined ? {} : { materialTierId }),
    ...(hardwareTierId === undefined ? {} : { hardwareTierId }),
    cabinetDepthMm: stamped.cabinetDepthMm,
    finish: stamped.finish ?? defaultFinishOf(materialTierId),
    handle: stamped.handle ?? DEFAULT_HANDLE,
    topRowHandle: stamped.topRowHandle ?? TOP_ROW_HANDLE,
  };
}

/** A material no declaration names has no colour of its own, so it wears the colour a design wearing nothing is deemed to. */
function defaultFinishOf(materialTierId: string | undefined): Finish {
  const lookup = lookUpMaterial(materialTierId ?? DEFAULT_MATERIAL_ID);
  return lookup.kind === "declared"
    ? { ...lookup.material.defaultFinish }
    : { ...DEFAULT_FINISH };
}

// ---------------------------------------------------------------------------------------------------------------------
// The page's read

/**
 * The defaults screen's facts for a page whose own staff gate has admitted the reader: the saved defaults as stored, with
 * the revision a save is made against, the availability head read with them, and the tiers on offer. The head is read once
 * and the revision and the switched-off items come from that read. It takes no session, spends no bucket and writes no
 * audit row, because a render must not write. `undefined` when no version was ever published. A store that fails, and a
 * saved row that is not settings, throw: nothing is shown as saved that was not.
 */
export async function readKitchenDefaultsForAdmittedPage(): Promise<
  KitchenDefaultsPageInput | undefined
> {
  const stores = await getPriceStores();
  const availability = await readDashboardAvailability(stores);
  const book = await readActiveBook(stores);
  if (book === undefined) return undefined;
  const saved = await readSavedDefaults(stores);
  return {
    state: {
      revision: saved.revision,
      availabilityRevision: availability.revision,
      saved: saved.revision !== INITIAL_REVISION,
      defaults: completedDefaultsOf(saved.defaults, book),
    },
    materials: tierOffersOf(book.material),
    hardware: tierOffersOf(book.hardware),
    disabled: [...availability.disabled],
  };
}

function tierOffersOf(group: TierGroup<TierIdentity>): readonly TierOffer[] {
  return group.tiers.map(({ tierId, name, nameKey }) => ({
    tierId,
    name,
    ...(nameKey === undefined ? {} : { nameKey }),
  }));
}

// ---------------------------------------------------------------------------------------------------------------------
// The customer's read

/**
 * The six settings a new kitchen is created with. A saved value whose item the active book and the availability head do
 * not offer is replaced by its fixed fallback, which is never switched off; the colour is judged after the material.
 *
 * It never throws and never blocks a creation. A store that cannot answer, or a saved row that is not settings, gives the
 * fixed fallbacks and one log line that names the cause and no value. With no active book there is no tier id to give, so
 * the two tiers are absent and the other four are the fixed fallbacks.
 */
export async function readNewKitchenDefaults(): Promise<CompletedSettings> {
  const stores = await attempt(getPriceStores);
  if (stores.kind === "failed") return completionOf({}, {});
  const reading = await attempt(() => readActiveBook(stores.value));
  const book = reading.kind === "read" ? reading.value : undefined;
  if (book === undefined) return completionOf({}, {});
  const tiers = fixedTiersOf(book);
  const judged = await attempt(() => readJudged(stores.value, book));
  return completionOf(judged.kind === "read" ? judged.value : {}, tiers);
}

async function readJudged(
  stores: PriceStores,
  book: PriceBook,
): Promise<NewKitchenSettings> {
  const availability = await readDashboardAvailability(stores);
  const saved = await readSavedDefaults(stores);
  return offeredPartOf(saved, { book, availability });
}

interface OfferContext {
  readonly book: PriceBook;
  readonly availability: CatalogueAvailability;
}

/** The saved settings without a tier or a handle that is not on offer, and without a colour that is not, as the material
 *  the kitchen will have judges it. */
function offeredPartOf(
  { defaults }: SavedDefaults,
  context: OfferContext,
): NewKitchenSettings {
  const kept = withoutUnofferedItems(defaults, context);
  const judged = judgeKitchenDefaults(
    { ...fixedTiersOf(context.book), ...kept },
    context,
  );
  if (judged.kind === "acceptable") return kept;
  return withoutColour(kept);
}

function withoutColour(settings: NewKitchenSettings): NewKitchenSettings {
  const { finish, ...rest } = settings;
  return finish === undefined ? settings : rest;
}

function withoutUnofferedItems(
  defaults: NewKitchenSettings,
  context: OfferContext,
): NewKitchenSettings {
  const { materialTierId, hardwareTierId, handle, topRowHandle, ...rest } =
    defaults;
  const isOffered = (item: ItemRef): boolean => isItemOffered(item, context);
  return {
    ...rest,
    ...(materialTierId !== undefined &&
    isOffered(tierRef("material", materialTierId))
      ? { materialTierId }
      : {}),
    ...(hardwareTierId !== undefined &&
    isOffered(tierRef("hardware", hardwareTierId))
      ? { hardwareTierId }
      : {}),
    ...(handle !== undefined && isOffered(handleRef(handle)) ? { handle } : {}),
    ...(topRowHandle !== undefined && isOffered(handleRef(topRowHandle))
      ? { topRowHandle }
      : {}),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The log

type Attempt<Value> =
  | { readonly kind: "read"; readonly value: Value }
  | { readonly kind: "failed" };

/** Runs one read, and turns any failure of it into one line that names the cause. Never rethrows. */
async function attempt<Value>(
  read: () => Promise<Value>,
): Promise<Attempt<Value>> {
  try {
    return { kind: "read", value: await read() };
  } catch (failure) {
    reportFallback(causeOf(failure));
    return { kind: "failed" };
  }
}

/** What a line can say went wrong. A closed list, so no store message or stored value can be written. */
type FallbackCause =
  | "store-unavailable"
  | "store-failed"
  | "state-unreadable"
  | "unexpected";

function causeOf(failure: unknown): FallbackCause {
  if (failure instanceof DashboardStoreError) {
    return failure.failure === "unavailable"
      ? "store-unavailable"
      : "store-failed";
  }
  return failure instanceof DashboardStateUnreadableError
    ? "state-unreadable"
    : "unexpected";
}

/** The write may not throw: a diagnostic that can fail would replace the creation it explains. */
function reportFallback(cause: FallbackCause): void {
  try {
    console.error("[new-kitchen-defaults]", {
      event: "fixed-fallbacks",
      cause,
    });
  } catch {
    // Nothing to fall back to, and nothing may escape.
  }
}
