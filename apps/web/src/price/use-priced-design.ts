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

import {
  offerWholeKitchenTiers,
  type WholeKitchenTierOffer,
} from "./whole-kitchen-tiers";

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

/**
 * Every whole-kitchen tier the book offers, each measured against its group's default — frames
 * 2E / D2E's *inclus* and *de la +9 000*, and the `availableTierIds` the 6E commands take.
 *
 * **Here rather than in the settings surface, and that is the point.** A surface importing
 * `SAMPLE_PRICE_BOOK` for a tier list would make two modules name a book, which is the drift ADR
 * 0062 seam 1 closes and `whole-kitchen-tiers.seams.test.ts` now measures. The arithmetic itself is
 * `offerWholeKitchenTiers`, which takes a book and names none.
 *
 * Memoised on the same two store slices `usePricedDesign` is, for the same reason: it is six
 * evaluations of the same pure query, derived on render and stored nowhere.
 */
export function useWholeKitchenTierOffer(): WholeKitchenTierOffer {
  const design = useConfiguratorStore((state) => state.design);
  const catalog = useConfiguratorStore((state) => state.catalog);

  return useMemo(
    () =>
      offerWholeKitchenTiers({
        design,
        catalog,
        book: SAMPLE_PRICE_BOOK,
        pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
        selections: design.settings,
      }),
    [design, catalog],
  );
}
