import { describe, expect, it } from "vitest";

import {
  PRICE_BOOK_CURRENCY,
  isPriceBookCurrency,
} from "../../src/pricing/price-book.js";

// A currency read off a wire is narrowed by the domain's own guard: only the one the price book prices in passes, spelled
// exactly, and nothing that merely looks like it.

describe("isPriceBookCurrency", () => {
  it("accepts the currency the price book prices in", () => {
    expect(isPriceBookCurrency(PRICE_BOOK_CURRENCY)).toBe(true);
  });

  it.each([
    "EUR",
    "USD",
    "",
    ` ${PRICE_BOOK_CURRENCY}`,
    `${PRICE_BOOK_CURRENCY} `,
    `${PRICE_BOOK_CURRENCY}\n`,
    PRICE_BOOK_CURRENCY.toLowerCase(),
    1,
    null,
    undefined,
    { currency: PRICE_BOOK_CURRENCY },
  ])("refuses %j", (value) => {
    expect(isPriceBookCurrency(value)).toBe(false);
  });
});
