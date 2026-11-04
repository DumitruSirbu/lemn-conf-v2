"use client";

import { createContext, useContext, type ReactNode } from "react";

import { NO_PRICE_BOOK, type PriceBookRoot } from "./price-book-root";

// Fail closed: a surface rendered where no page supplied a book prices nothing, and shows no figure. The default is
// never a book, so an unwrapped tree cannot quietly price from a book of its own (A-10).
const PriceBookContext = createContext<PriceBookRoot>(NO_PRICE_BOOK);

/**
 * Hands the page's price-book root, read once on the server for this request, to every price surface beneath it. It is
 * context and not the configurator store on purpose: the store is a module singleton that no server render may write
 * (ADR 0133 decision 2), and a book is a fact about a request, not about a design.
 */
export function PriceBookProvider({
  root,
  children,
}: {
  readonly root: PriceBookRoot;
  readonly children: ReactNode;
}) {
  return <PriceBookContext value={root}>{children}</PriceBookContext>;
}

export function usePriceBookRoot(): PriceBookRoot {
  return useContext(PriceBookContext);
}
