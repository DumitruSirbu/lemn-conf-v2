import "server-only";

import type {
  CatalogueAvailability,
  DraftChange,
  PriceBook,
} from "@lemnaria/configurator-domain";
import type { ActivePriceVersion, PriceDraft } from "@lemnaria/persistence";

import { readBookOf } from "@/lib/server/active-price-book";
import { isRevisionShape } from "@/lib/server/price-dashboard/revision-shape";
import { readStoredDraft } from "@/lib/server/price-dashboard/stored-draft";
import type { PriceStores } from "@/lib/server/price-stores";
import { projectAvailability } from "@/lib/server/project-availability";

// What a dashboard route reads before it judges anything: the active version with its book parsed and projected, and the
// draft beside it with every change rebuilt. Both come from stores that are not part of the type system, so a stored value
// that is not what it declares is a defect of ours: it is thrown, and the route answers `503` with no detail. A store that
// is down throws the same way. Only "no version was ever published" is an answer, because it is a state of the data (A-10).

export interface DashboardDraft {
  readonly draftRevision: string;
  readonly changes: readonly DraftChange[];
}

export interface ActiveDashboardState {
  readonly version: ActivePriceVersion;
  readonly book: PriceBook;
  readonly draft: DashboardDraft;
}

export type DashboardStateReading =
  | { readonly kind: "ready"; readonly state: ActiveDashboardState }
  | { readonly kind: "no-active-version" }
  /** The stored changes are not what a draft holds. Its revision is all that is known of it, and a discard-all needs it. */
  | { readonly kind: "draft-unreadable"; readonly draftRevision: string };

class DashboardStateUnreadableError extends Error {
  constructor(what: "book" | "draft" | "availability") {
    super(`The stored ${what} is not what the store declares it to be.`);
    this.name = "DashboardStateUnreadableError";
  }
}

export async function readDashboardState(
  stores: PriceStores,
): Promise<DashboardStateReading> {
  const active = await stores.priceBook.readActive();
  if (active.kind !== "found") return { kind: "no-active-version" };
  const book = readBookOf(active.version);
  if (book === undefined) throw new DashboardStateUnreadableError("book");
  const stored = await readRawDraft(stores);
  const reading = readStoredDraft(stored.changes);
  if (!reading.ok) {
    return { kind: "draft-unreadable", draftRevision: stored.draftRevision };
  }
  const draft = {
    draftRevision: stored.draftRevision,
    changes: reading.changes,
  };
  return { kind: "ready", state: { version: active.version, book, draft } };
}

/**
 * The stored draft as the store holds it, its changes unparsed. Its revision is checked for its shape: a store that answers
 * a revision SQL could not have made is a defect, thrown, and never a draft that merely moved.
 */
export async function readRawDraft(stores: PriceStores): Promise<PriceDraft> {
  const stored = await stores.priceBook.readDraft();
  if (!isRevisionShape(stored.draftRevision)) {
    throw new DashboardStateUnreadableError("draft");
  }
  return stored;
}

export async function readDashboardAvailability(
  stores: PriceStores,
): Promise<CatalogueAvailability> {
  const projected = projectAvailability(
    await stores.availability.readCurrent(),
  );
  if (!projected.ok) throw new DashboardStateUnreadableError("availability");
  return projected.availability;
}
