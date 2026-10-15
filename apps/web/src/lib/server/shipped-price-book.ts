import "server-only";

import {
  parsePriceBook,
  SAMPLE_PRICE_BOOK,
  type PriceBook,
} from "@lemnaria/configurator-domain";

/**
 * The shipped book did not parse: a defect in this repository, not a fact about a customer's request. The message is
 * fixed and holds nothing of the book, so what a caller reports is the error's name and no detail.
 */
export class UnreadableShippedPriceBookError extends Error {
  constructor() {
    super("The price book this build ships could not be read");
    this.name = "UnreadableShippedPriceBookError";
  }
}

/**
 * The server's one price-book root, beside the browser's (`price/use-priced-design.ts`): each names the same book, and
 * a book from another source is a substitution at both. Parsed on each call and held nowhere, so a caller that asks
 * once for a request holds the one book that request is digested and priced under.
 */
export function shippedPriceBook(): PriceBook {
  const parsed = parsePriceBook(SAMPLE_PRICE_BOOK);
  if (!parsed.ok) throw new UnreadableShippedPriceBookError();
  return parsed.book;
}
