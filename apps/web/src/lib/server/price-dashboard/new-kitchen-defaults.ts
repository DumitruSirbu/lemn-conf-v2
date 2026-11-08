// What a new kitchen starts from, read two ways. The dashboard's page reads the saved defaults as they are stored,
// completed from the fixed fallbacks. A customer's new kitchen reads them judged against what is on offer now, and
// never fails: a creation is never blocked by the dashboard's data.
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
import {
  DEFAULTS_ROW_ORDER,
  type KitchenDefaultsPageInput,
  type TierOffer,
} from "@/price-dashboard/kitchen-defaults-model";
import type { KitchenDefaultsWire } from "@/price-dashboard/price-dashboard-wire-contract";

/** A store that stays down writes at most `FALLBACK_LOG_LINES_PER_WINDOW` lines per cause in each window, not one line
 *  per page render. Three, not one: two reads that fail in a row for one cause are both written down, and a burst is
 *  still bounded. */
const FALLBACK_LOG_WINDOW_MS = 60_000;
const FALLBACK_LOG_LINES_PER_WINDOW = 3;

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
 * The saved defaults with every key the row lacks taken from the fixed fallbacks: the book's material and hardware
 * tier, the reference depth, the kitchen's and the top row's handle, and the stamped material's own colour. The colour
 * is reset where the stamped material does not offer it, as the stamp does it.
 */
export function completedDefaultsOf(
  saved: NewKitchenSettings,
  book: PriceBook,
): KitchenDefaultsWire {
  const completed = completionOf(saved, fixedTiersOf(book));
  if (!holdsAllSixSettings(completed)) {
    throw new Error("A book's own tiers complete a row to all six settings.");
  }
  return completed;
}

/** Whether every one of the six settings is present: the one check, read from the screen's own list of rows. */
export function holdsAllSixSettings(
  settings: NewKitchenSettings,
): settings is NewKitchenSettings & KitchenDefaultsWire {
  return DEFAULTS_ROW_ORDER.every((member) => settings[member] !== undefined);
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

/**
 * A material no declaration names has no colour of its own: it wears the colour a design wearing nothing is deemed to.
 */
function defaultFinishOf(materialTierId: string | undefined): Finish {
  const lookup = lookUpMaterial(materialTierId ?? DEFAULT_MATERIAL_ID);
  return lookup.kind === "declared"
    ? { ...lookup.material.defaultFinish }
    : { ...DEFAULT_FINISH };
}

// ---------------------------------------------------------------------------------------------------------------------
// The page's read

/**
 * The defaults screen's facts for a page whose own staff gate has admitted the reader: the saved defaults as stored,
 * with the revision a save is made against, the availability head read with them, and the tiers on offer. The head is
 * read once and the revision and the switched-off items come from that read. It takes no session, spends no bucket and
 * writes no audit row, because a render must not write. `undefined` when no version was ever published. A store that
 * fails, and a saved row that is not settings, throw: nothing is shown as saved that was not.
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
 * It never throws and never blocks a creation. A store that cannot answer, or a saved row that is not settings, gives
 * the fixed fallbacks and one log line that names the cause and no value. With no active book there is no tier id to
 * give, so the two tiers are absent and the other four are the fixed fallbacks.
 *
 * The availability head is read first, once, and the result of the last whole reading is reused while the head's
 * revision is unchanged: a defaults save and every publish move the head (see `rememberedReading`), so what is reused
 * is exactly what a fresh reading would give. A reading that fell back is never remembered.
 */
export async function readNewKitchenDefaults(): Promise<CompletedSettings> {
  const stores = await attempt(getPriceStores);
  if (stores.kind === "failed") return completionOf({}, {});
  const head = await attempt(() => readDashboardAvailability(stores.value));
  const remembered = rememberedFor(head);
  if (remembered !== undefined) return remembered;
  const reading = await readAgainstTheStores(stores.value, head);
  if (reading.isWhole && head.kind === "read") {
    remember(head.value.revision, reading.settings);
  }
  return reading.settings;
}

/** What one reading of the stores gave, and whether every read it needed answered, so that it is the answer for its head. */
interface Reading {
  readonly settings: CompletedSettings;
  readonly isWhole: boolean;
}

async function readAgainstTheStores(
  stores: PriceStores,
  head: Attempt<CatalogueAvailability>,
): Promise<Reading> {
  const book = await bookOf(stores, head);
  if (book.kind === "failed") return fellBack(completionOf({}, {}));
  if (book.value === undefined) {
    return { settings: completionOf({}, {}), isWhole: true };
  }
  const tiers = fixedTiersOf(book.value);
  if (head.kind === "failed") return fellBack(completionOf({}, tiers));
  const saved = await attempt(() => readSavedDefaults(stores));
  if (saved.kind === "failed") return fellBack(completionOf({}, tiers));
  const offered = offeredPartOf(saved.value, {
    book: book.value,
    availability: head.value,
  });
  return { settings: completionOf(offered, tiers), isWhole: true };
}

function fellBack(settings: CompletedSettings): Reading {
  return { settings, isWhole: false };
}

/**
 * The active book, read after the head. A read that failed after the head's own failure is not told again: one cause
 * is one line. No version ever published is an answer (`undefined`), a failed read is not.
 */
async function bookOf(
  stores: PriceStores,
  head: Attempt<CatalogueAvailability>,
): Promise<Attempt<PriceBook | undefined>> {
  if (head.kind === "failed") {
    return readActiveBook(stores).then(
      (value): Attempt<PriceBook | undefined> => ({ kind: "read", value }),
      (): Attempt<PriceBook | undefined> => ({ kind: "failed" }),
    );
  }
  return attempt(() => readActiveBook(stores));
}

// ---------------------------------------------------------------------------------------------------------------------
// What is remembered between renders

/**
 * The six values of the last whole reading, under the head revision they were read at, and nothing else: no error, no
 * store, no timestamp. It is correct to reuse them while the head is where it was because everything the reading depends
 * on moves the head: a defaults save advances it with the defaults row (`kitchen-defaults-statements.ts`, `moved_head`;
 * the fake, `fake-kitchen-defaults-store.ts` `save`), a publish advances it with the new version
 * (`price-book-statements.ts`, `moved_head`; the fake, `fake-price-book-store.ts` `logCreatedItems`), and a switch
 * advances it with the availability row (`catalogue-availability-statements.ts`; the fake,
 * `fake-catalogue-availability-store.ts` `append`). The head is read first, so what was read after it is at least as new
 * as its revision. Per process; a test that builds a fresh world clears it with `resetNewKitchenDefaultsBoundsForTests`.
 */
let rememberedReading:
  | { revision: string; settings: CompletedSettings }
  | undefined;

function rememberedFor(
  head: Attempt<CatalogueAvailability>,
): CompletedSettings | undefined {
  if (head.kind !== "read") return undefined;
  if (rememberedReading?.revision !== head.value.revision) return undefined;
  return structuredClone(rememberedReading.settings);
}

function remember(revision: string, settings: CompletedSettings): void {
  rememberedReading = { revision, settings: structuredClone(settings) };
}

/** For the tests that build a fresh world of stores: the head revision of one world is the head revision of another. */
export function resetNewKitchenDefaultsBoundsForTests(): void {
  rememberedReading = undefined;
  windowByCause.clear();
}

interface OfferContext {
  readonly book: PriceBook;
  readonly availability: CatalogueAvailability;
}

/**
 * The saved settings without a tier or a handle that is not on offer, and without a colour that is not, as the material
 * the kitchen will have judges it.
 */
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

/** The window each cause is being counted in, so a store that stays down is a few lines per window and not one per render. */
const windowByCause = new Map<
  FallbackCause,
  { readonly startedAt: number; readonly written: number }
>();

function isWithinTheLineBudget(cause: FallbackCause): boolean {
  const now = Date.now();
  const counted = windowByCause.get(cause);
  const current =
    counted !== undefined && now - counted.startedAt < FALLBACK_LOG_WINDOW_MS
      ? counted
      : { startedAt: now, written: 0 };
  if (current.written >= FALLBACK_LOG_LINES_PER_WINDOW) return false;
  windowByCause.set(cause, { ...current, written: current.written + 1 });
  return true;
}

/** The write may not throw: a diagnostic that can fail would replace the creation it explains. */
function reportFallback(cause: FallbackCause): void {
  if (!isWithinTheLineBudget(cause)) return;
  try {
    console.error("[new-kitchen-defaults]", {
      event: "fixed-fallbacks",
      cause,
    });
  } catch {
    // Nothing to fall back to, and nothing may escape.
  }
}
