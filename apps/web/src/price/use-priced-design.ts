"use client";

// The composition root for pricing, and the only module in this application that names a price book.
//
// ADR 0062 seam 1: `priceDesign` takes the book as a parameter and nothing under
// `packages/configurator-domain/src/pricing/` imports one, so a manufacturer-supplied book is a
// substitution here, not a refactor.
//
// Derived on every render, stored nowhere (§12): the memo is keyed on the two store slices the answer
// depends on. That caches a pure query and does not persist a total; `DesignSchema` has no price field.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  parsePriceBook,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type BodyCatalog,
  type Design,
  type PriceBook,
  type PriceBookParseResult,
  type PricedDesign,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { useMemo } from "react";

import { useConfiguratorStore } from "@/store/configurator-store";

import {
  offerWholeKitchenTiers,
  type WholeKitchenTierOffer,
} from "./whole-kitchen-tiers";

/**
 * The book, read once at the ingress. `PriceBook` is only a TypeScript declaration, and a
 * manufacturer-supplied book is versioned data assembled elsewhere (ADR 0062 seam 1), so
 * `parsePriceBook` establishes its shape once and everything downstream (`priceDesign`'s rule sweep,
 * `offerWholeKitchenTiers`' bare `group.tiers.map`) reads a fact. Module scope, so once means once
 * per process, not once per hook.
 */
const PARSED_PRICE_BOOK = parsePriceBook(SAMPLE_PRICE_BOOK);

/**
 * The sample book did not parse: a defect in this repository, not a fact about the customer's
 * kitchen, so it leaves as itself rather than as an undesigned rendered state.
 *
 * Raised only by the tier offer, which has no honest degraded answer: an empty group would make
 * `global-settings-model.ts` throw `UnofferedDefaultTierError` anyway, and inventing a default would
 * decide what an unset kitchen costs. What the settings sheet should show when no book can be read is
 * an open product question. `usePricedDesign` answers with a refusal, which every price surface
 * renders as no figure.
 */
export class UnreadablePriceBookError extends Error {
  constructor(detail: string) {
    super(`The price book this build ships could not be read: ${detail}`);
    this.name = "UnreadablePriceBookError";
  }
}

/**
 * One of the two readers of `PARSED_PRICE_BOOK`: the hooks need different answers to one failed
 * parse (the tier offer throws, a price surface renders a refusal), so a single reader would have to
 * pick one for both. The constant is named only in these two readers.
 */
function readPriceBook(): PriceBook {
  if (PARSED_PRICE_BOOK.ok) return PARSED_PRICE_BOOK.book;
  throw new UnreadablePriceBookError(PARSED_PRICE_BOOK.failure.detail);
}

/** The parse as it stands, for the caller that answers with a refusal rather than a throw;
 *  `PricingResult` and `PriceBookParseResult` carry the same `PricingFailure`. */
function priceBookOrRefusal(): PriceBookParseResult {
  return PARSED_PRICE_BOOK;
}

/** One design priced against the one book. A book that did not parse is a refusal, not a throw. */
function priceAgainstBook(design: Design, catalog: BodyCatalog): PricingResult {
  const parsed = priceBookOrRefusal();
  if (!parsed.ok) return { ok: false, failure: parsed.failure };
  return priceDesign({
    design,
    catalog,
    book: parsed.book,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
}

/**
 * The current design, priced. The bar and §9's footer both read this one hook, so neither can show a
 * different number. Whole-kitchen selections come straight off `design.settings`, with nothing
 * defaulted here: a missing key is priced at the book's own default tier. A book that did not parse
 * is a refusal, not a throw, which every price surface renders as no figure rather than a zero.
 */
export function usePricedDesign(): PricingResult {
  const design = useConfiguratorStore((state) => state.design);
  const catalog = useConfiguratorStore((state) => state.catalog);

  return useMemo(() => priceAgainstBook(design, catalog), [design, catalog]);
}

/**
 * A stored kitchen priced as the editor's bar prices it: the same book, the same selections and the catalogue at the
 * kitchen's own cabinet depth (the store's `catalogAt` is `buildKitchenLBodyCatalog`). The figure is the starting
 * price of the kitchen as it stands, not a cross-tier minimum (`starting-price.ts`). Nothing when no honest figure
 * exists, so a card shows none: the pricing refused it, or the document, which came off the wire, broke a rule the
 * pricing did not guard.
 */
export function priceFloorOf(design: Design): PricedDesign | undefined {
  const priced = tryPricing(design);
  return priced?.ok === true ? priced.priced : undefined;
}

function tryPricing(design: Design): PricingResult | undefined {
  try {
    return priceAgainstBook(
      design,
      buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
    );
  } catch {
    return undefined;
  }
}

/**
 * Every whole-kitchen tier the book offers, each measured against its group's default (*inclus*,
 * *de la +9 000*), and the `availableTierIds` the whole-kitchen commands take.
 *
 * Here, not in the settings surface: a surface importing `SAMPLE_PRICE_BOOK` would make two modules
 * name a book, the drift ADR 0062 seam 1 closes. Memoised on the same two store slices as
 * `usePricedDesign`: six evaluations of one pure query, stored nowhere.
 */
export function useWholeKitchenTierOffer(): WholeKitchenTierOffer {
  const design = useConfiguratorStore((state) => state.design);
  const catalog = useConfiguratorStore((state) => state.catalog);

  return useMemo(
    () =>
      offerWholeKitchenTiers({
        design,
        catalog,
        book: readPriceBook(),
        pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
        selections: design.settings,
      }),
    [design, catalog],
  );
}
