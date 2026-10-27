import "server-only";

import {
  MAX_IDENTIFIER_LENGTH,
  parsePriceBook,
  type CatalogueAvailability,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import {
  DashboardStoreError,
  type ActivePriceVersion,
  type CatalogueAvailabilityStore,
  type PriceBookStore,
} from "@lemnaria/persistence";

import {
  reportNoPriceBook,
  type StoreFailureFacts,
} from "@/lib/server/price-book-log";
import { getPriceStores, type PriceStores } from "@/lib/server/price-stores";
import { projectPriceBook } from "@/lib/server/project-price-book";
import { NO_PRICE_BOOK, type PriceBookRoot } from "@/price/price-book-root";

/** How many items may be switched off at once. The book offers fewer than this many items in all; a larger answer is a
 *  store that cannot be believed, not a catalogue. */
export const MAX_DISABLED_ITEMS = 500;

/** The widest a revision can be: the digits of a `bigint`. */
const MAX_REVISION_LENGTH = 19;

/**
 * The application's one price-book root on the server (ADR 0062 seam 1): the active version, parsed once and projected onto
 * the declared book, with the availability current when it was read (A-17). A request calls this once and hands the answer
 * to everything that prices it, so it holds the one `versionId` it is priced and digested under. A publish between two
 * requests is seen by the second alone.
 *
 * Every way of having no book is `NO_PRICE_BOOK` and nothing else, so no surface can tell them apart or fall back to a book
 * of its own (A-10). Each failure writes one line of its cause (`price-book-log.ts`); a version that was never published
 * writes none. A stored book whose `version` is not its version's id is refused: pricing asks for the book's own version,
 * and the contact request digests the id, so the two must name one identity. Only a defect propagates, after its line.
 *
 * The stores are an argument, with the process's own as the default, so a test of a surface hands in stores it counts.
 */
export async function readActivePriceBook(
  stores?: PriceStores,
): Promise<PriceBookRoot> {
  try {
    const { priceBook, availability } = stores ?? (await getPriceStores());
    const version = await readActiveVersion(priceBook);
    if (version === undefined) return NO_PRICE_BOOK;
    const book = readBookOf(version);
    if (book === undefined) return NO_PRICE_BOOK;
    const current = await readCurrentAvailability(availability);
    if (current === undefined) return NO_PRICE_BOOK;
    return {
      kind: "active",
      versionId: version.versionId,
      book,
      availability: current,
    };
  } catch (failure) {
    reportNoPriceBook("unexpected");
    throw failure;
  }
}

async function readActiveVersion(
  store: PriceBookStore,
): Promise<ActivePriceVersion | undefined> {
  try {
    const active = await store.readActive();
    return active.kind === "found" ? active.version : undefined;
  } catch (failure) {
    if (!(failure instanceof DashboardStoreError)) throw failure;
    reportNoPriceBook(
      failure.failure === "unavailable" ? "store-unavailable" : "store-failed",
      factsOf(failure),
    );
    return undefined;
  }
}

function readBookOf(version: ActivePriceVersion): PriceBook | undefined {
  const parsed = parsePriceBook(version.book);
  if (!parsed.ok) {
    reportNoPriceBook("book-unparseable");
    return undefined;
  }
  if (parsed.book.version !== version.versionId) {
    reportNoPriceBook("version-mismatch");
    return undefined;
  }
  return projectPriceBook(parsed.book);
}

async function readCurrentAvailability(
  store: CatalogueAvailabilityStore,
): Promise<CatalogueAvailability | undefined> {
  try {
    const current = await store.readCurrent();
    if (isWithinBounds(current)) return current;
    reportNoPriceBook("availability-too-large");
    return undefined;
  } catch (failure) {
    if (!(failure instanceof DashboardStoreError)) throw failure;
    reportNoPriceBook("availability-unreadable", factsOf(failure));
    return undefined;
  }
}

function factsOf(failure: DashboardStoreError): StoreFailureFacts {
  return { operation: failure.operation, kind: failure.failure };
}

/** The count of switched-off items, the length of each id and the revision are bounded: the answer is serialised into every
 *  page, so an unbounded one is a free multiplier on all of them. */
function isWithinBounds(availability: CatalogueAvailability): boolean {
  return (
    availability.revision.length <= MAX_REVISION_LENGTH &&
    availability.disabled.length <= MAX_DISABLED_ITEMS &&
    availability.disabled.every(
      (item) => longestTextOf(item) <= MAX_IDENTIFIER_LENGTH,
    )
  );
}

/** The longest text an item holds, whichever member names its id. */
function longestTextOf(item: unknown): number {
  if (typeof item === "string") return item.length;
  if (typeof item !== "object" || item === null) return 0;
  return Math.max(
    0,
    ...Object.values(item).map((member) =>
      typeof member === "string" ? member.length : 0,
    ),
  );
}
