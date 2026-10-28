"use client";

// The hooks over the pricing root (`price-book-root.ts`) and the book the page supplied (`price-book-provider.tsx`).
// Neither this module nor any other client module names a price book.
//
// Derived on every render, stored nowhere (§12): each memo is keyed on the root and the two store slices the answer
// depends on. That caches a pure query and does not persist a total; `DesignSchema` has no price field.
import type { PricingResult } from "@lemnaria/configurator-domain";
import { useMemo } from "react";

import { useConfiguratorStore } from "@/store/configurator-store";

import { usePriceBookRoot } from "./price-book-provider";
import { offerTiersAgainstBook, priceAgainstBook } from "./price-book-root";
import type { WholeKitchenTierOffer } from "./whole-kitchen-tiers";

/**
 * The current design, priced. The bar and §9's footer both read this one hook, so neither can show a
 * different number. Whole-kitchen selections come straight off `design.settings`, with nothing
 * defaulted here: a missing key is priced at the book's own default tier. No book is a refusal, not a
 * throw, which every price surface renders as no figure rather than a zero.
 */
export function usePricedDesign(): PricingResult {
  const root = usePriceBookRoot();
  const design = useConfiguratorStore((state) => state.design);
  const catalog = useConfiguratorStore((state) => state.catalog);

  return useMemo(
    () => priceAgainstBook(root, design, catalog),
    [root, design, catalog],
  );
}

/**
 * The deep-cabinet percent the active book publishes, for a surface that words the depth line: the line carries its
 * depth and amount but no percent. The percent of the book the price was computed from, since `usePricedDesign` reads
 * the same root. `undefined` when no book is active, where nothing is priced and so no depth line exists.
 */
export function usePublishedDeepCabinetPercent(): number | undefined {
  const root = usePriceBookRoot();
  return root.kind === "active"
    ? root.book.depthRule.deepCabinetPercent
    : undefined;
}

/**
 * Every whole-kitchen tier the book offers, each measured against its group's default (*inclus*,
 * *de la +9 000*), and the `availableTierIds` the whole-kitchen commands take. Memoised on the same
 * slices as `usePricedDesign`: six evaluations of one pure query, stored nowhere.
 */
export function useWholeKitchenTierOffer(): WholeKitchenTierOffer {
  const root = usePriceBookRoot();
  const design = useConfiguratorStore((state) => state.design);
  const catalog = useConfiguratorStore((state) => state.catalog);

  return useMemo(
    () => offerTiersAgainstBook(root, design, catalog),
    [root, design, catalog],
  );
}
