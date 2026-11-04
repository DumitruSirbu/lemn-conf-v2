import "server-only";

import type { ReactElement, ReactNode } from "react";

import { readActivePriceBook } from "@/lib/server/active-price-book";
import { PriceBookProvider } from "@/price/price-book-provider";

/**
 * A page's screen, handed the price book of this request: read once, here, and supplied to every price surface beneath it
 * (ADR 0062 seam 1). The one place a page asks for the book, so no page can read it twice or hand the browser another.
 */
export async function withActivePriceBook(
  screen: ReactNode,
): Promise<ReactElement> {
  return (
    <PriceBookProvider root={await readActivePriceBook()}>
      {screen}
    </PriceBookProvider>
  );
}
