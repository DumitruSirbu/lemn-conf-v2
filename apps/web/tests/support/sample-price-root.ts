import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";
import { createElement, type ReactElement, type ReactNode } from "react";

import { PriceBookProvider } from "@/price/price-book-provider";
import type { ActivePriceBook } from "@/price/price-book-root";

/** The version id a test's page supplies with the sample book. Any string would do: the id is opaque. */
export const SAMPLE_PRICE_VERSION_ID = "sample-version-1";

/**
 * What the server hands a page that was loaded with the sample book active and nothing switched off: the root a DOM test
 * mounts its screen under when the test is not about the book. The application itself names no book (`price-book-root.ts`);
 * a test does, here, and says so.
 */
export const SAMPLE_PRICE_ROOT: ActivePriceBook = Object.freeze({
  kind: "active",
  versionId: SAMPLE_PRICE_VERSION_ID,
  book: SAMPLE_PRICE_BOOK,
  availability: Object.freeze({ revision: "0", disabled: [] }),
});

/** The tree under the page's provider, the way a server page supplies it: for a test that renders with its own root. */
export function underSamplePriceBook(children: ReactNode): ReactElement {
  return createElement(PriceBookProvider, {
    root: SAMPLE_PRICE_ROOT,
    children,
  });
}
