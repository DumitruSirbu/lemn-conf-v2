import "server-only";

import { isVersionId } from "@/lib/server/price-dashboard/identifier-shape";
import {
  versionListWireOf,
  versionWireOf,
} from "@/lib/server/price-dashboard/version-wire";
import { getPriceStores } from "@/lib/server/price-stores";
import type {
  PriceVersionListWire,
  PriceVersionWire,
} from "@/price-dashboard/price-dashboard-wire-contract";

// What the publish pages read of the history for a reader their own staff gate has admitted. A render writes nothing:
// no session, no limiter bucket and no audit row, which the routes that serve the same versions do write. A store that
// fails throws.

const FIRST_PAGE = 1;

export function readFirstVersionPage(): Promise<PriceVersionListWire> {
  return readVersionPage(FIRST_PAGE);
}

/** `undefined` for an id no store could hold and for one it does not hold. */
export async function readVersion(
  versionId: string,
): Promise<PriceVersionWire | undefined> {
  if (!isVersionId(versionId)) return undefined;
  const { priceBook } = await getPriceStores();
  const found = await priceBook.readVersion(versionId);
  return found.kind === "found" ? versionWireOf(found.version) : undefined;
}

/**
 * The version published just before `sequenceNumber`, or `undefined` for the first: the greatest sequence below it.
 * The store reads no version by sequence, so the history is walked newest first and each entry is judged by its own
 * sequence, never by its place in the list, which a publish landing between two page reads moves.
 */
export async function readPredecessorOf(
  sequenceNumber: number,
): Promise<PriceVersionWire | undefined> {
  const { priceBook } = await getPriceStores();
  for (let page = FIRST_PAGE; ; page += 1) {
    const listed = await priceBook.listVersions({ page });
    const before = listed.versions.filter(
      (entry) => entry.sequenceNumber < sequenceNumber,
    );
    const newest = before.reduce<(typeof before)[number] | undefined>(
      (best, entry) =>
        best === undefined || entry.sequenceNumber > best.sequenceNumber
          ? entry
          : best,
      undefined,
    );
    if (newest !== undefined) return readVersion(newest.versionId);
    const isLastPage =
      listed.pageSize < 1 || page * listed.pageSize >= listed.total;
    if (isLastPage) return undefined;
  }
}

async function readVersionPage(page: number): Promise<PriceVersionListWire> {
  const { priceBook } = await getPriceStores();
  return versionListWireOf(await priceBook.listVersions({ page }));
}
