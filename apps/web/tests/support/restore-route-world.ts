import {
  parsePriceBook,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { readActivePriceBook } from "@/lib/server/active-price-book";

import {
  currentDraftRevision,
  restoreVersion,
} from "./price-dashboard-requests";
import { currentPriceDashboardWorld } from "./price-dashboard-world";

// What the restore route's tests ask of the price dashboard world after publishing version one and planting a draft: the
// request that restores version one, and what the world holds afterwards. A test file mocks the session, audit and price
// stores itself and calls `freshPriceDashboardWorld` in `beforeEach`.

export function versionOneId(): string {
  const { versionId } = currentPriceDashboardWorld();
  if (versionId === undefined) throw new Error("the world has no version");
  return versionId;
}

/** Restores version one at `expectedDraftRevision`, or at the revision the store holds now. */
export async function restoreVersionOne(
  cookie: string,
  expectedDraftRevision?: string,
): Promise<Response> {
  return restoreVersion(versionOneId(), {
    cookie,
    json: {
      expectedDraftRevision:
        expectedDraftRevision ?? (await currentDraftRevision()),
    },
  });
}

export async function storedDraftChanges(): Promise<readonly DraftChange[]> {
  return (await currentPriceDashboardWorld().priceBook.readDraft())
    .changes as readonly DraftChange[];
}

export function restoreAuditRows() {
  return currentPriceDashboardWorld()
    .ledger.heldEvents()
    .filter(({ action }) => action === "price-restored-to-draft");
}

export async function activeBookOfWorld(): Promise<PriceBook> {
  const root = await readActivePriceBook(currentPriceDashboardWorld().stores);
  if (root.kind !== "active") throw new Error("no active book");
  return root.book;
}

export async function archivedBookOne(): Promise<PriceBook> {
  const read =
    await currentPriceDashboardWorld().stores.priceBook.readVersion(
      versionOneId(),
    );
  if (read.kind !== "found") throw new Error("no version one");
  const parsed = parsePriceBook(read.version.book);
  if (!parsed.ok) throw new Error("version one does not parse");
  return parsed.book;
}
