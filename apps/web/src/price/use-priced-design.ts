"use client";

// **The composition root for pricing**, and the only module in this application that names a price
// book.
//
// ADR 0062 seam 1: `priceDesign` takes the book as a parameter and nothing under
// `packages/configurator-domain/src/pricing/` imports one, so a manufacturer-supplied book is later
// a substitution here rather than a refactor anywhere.
//
// **Derived on every render, stored nowhere** (§12, and wave 6C's criterion): the memo is keyed on
// the two store slices the answer depends on, so a design change re-prices and nothing else does.
// That is caching a pure query, not persisting a total — `DesignSchema` has no price field and
// gains none.
import {
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { useMemo } from "react";

import { useConfiguratorStore } from "@/store/configurator-store";

/**
 * The current design, priced. Both price surfaces read this one hook — frames 2A / D2A's bar and
 * §9 item 7's footer — so neither can be looking at a different number from the other.
 *
 * The whole-kitchen selections come straight off `design.settings` (wave 6E). Nothing is defaulted
 * here: a design carrying no container, or one carrying only the other key, is priced at the book's
 * own default tier, which is book data rather than a rule living in this hook.
 */
export function usePricedDesign(): PricingResult {
  const design = useConfiguratorStore((state) => state.design);
  const catalog = useConfiguratorStore((state) => state.catalog);

  return useMemo(
    () =>
      priceDesign({
        design,
        catalog,
        book: SAMPLE_PRICE_BOOK,
        pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
        selections: design.settings,
      }),
    [design, catalog],
  );
}
