import "server-only";

import { parsePriceBook } from "@lemnaria/configurator-domain";
import { DashboardStoreError } from "@lemnaria/persistence";

import { getPriceStores, type PriceStores } from "@/lib/server/price-stores";
import { NO_PRICE_BOOK, type PriceBookRoot } from "@/price/price-book-root";

/**
 * The application's one price-book root on the server (M10 wave R1, backlog 176): the active version, parsed once, with the
 * availability current when it was read (A-17). A request calls this once and hands the answer to everything that prices
 * it: the editor, the account card, the staff view and the contact route. A caller holds the one `versionId` that request
 * is priced and digested under, and a publish between two requests is seen by the second alone.
 *
 * Every way of having no book is `NO_PRICE_BOOK` and nothing else, so no surface can tell them apart or fall back to a book
 * it holds: no version ever published (A-10), a store that could not answer, and a stored book that does not parse. Only a
 * failure that is none of these, a defect, propagates.
 *
 * The stores are an argument, with the process's own as the default, so the tests of a surface hand in stores they count.
 */
export async function readActivePriceBook(
  stores?: PriceStores,
): Promise<PriceBookRoot> {
  const { priceBook, availability } = stores ?? (await getPriceStores());
  try {
    const active = await priceBook.readActive();
    if (active.kind === "no-active-version") return NO_PRICE_BOOK;
    const parsed = parsePriceBook(active.version.book);
    if (!parsed.ok) return NO_PRICE_BOOK;
    return {
      kind: "active",
      versionId: active.version.versionId,
      book: parsed.book,
      availability: await availability.readCurrent(),
    };
  } catch (failure) {
    if (failure instanceof DashboardStoreError) return NO_PRICE_BOOK;
    throw failure;
  }
}
