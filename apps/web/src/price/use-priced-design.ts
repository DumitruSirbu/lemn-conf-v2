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
  parsePriceBook,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type PriceBook,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { useMemo } from "react";

import { useConfiguratorStore } from "@/store/configurator-store";

import {
  offerWholeKitchenTiers,
  type WholeKitchenTierOffer,
} from "./whole-kitchen-tiers";

/**
 * **The book, read once at the ingress** — the composition root's whole job, and the reason both
 * hooks below take a `PriceBook` from here rather than naming the sample themselves.
 *
 * `PriceBook` is a TypeScript declaration, and ADR 0062 seam 1 is precisely the seam that cannot
 * keep it: a manufacturer-supplied book is versioned data assembled elsewhere. `parsePriceBook`
 * establishes the shape once so that everything downstream — `priceDesign`'s rule sweep and
 * `offerWholeKitchenTiers`' bare `group.tiers.map` — is reading a fact instead of a promise
 * (M6-AUD-002).
 *
 * **At module scope rather than in a `useMemo`**, because "once" means once for the process and not
 * once per hook: two `useMemo(..., [])` would be two parses of one constant, and neither hook's own
 * memo keys change when a design does. The two memos below keep the dependencies they had.
 */
const PARSED_PRICE_BOOK = parsePriceBook(SAMPLE_PRICE_BOOK);

/**
 * **The sample book did not parse.** A defect in this repository rather than a fact about the
 * customer's kitchen, so it leaves as itself — the stance `refuseUnreadableFrontsCause` takes in the
 * domain — and never as a rendered state nobody has designed.
 *
 * Raised only by the tier offer, and only because there is no honest degraded answer for it: an
 * empty group would make `global-settings-model.ts` throw `UnofferedDefaultTierError` anyway, and
 * inventing a default would be this module deciding what an unset kitchen costs. **What the settings
 * sheet should show when no book can be read at all is an open product question** — it has never been
 * asked, because until now no book could fail to be read. `usePricedDesign` has a real answer and
 * gives it: a refusal, which every price surface already renders as no figure.
 */
export class UnreadablePriceBookError extends Error {
  constructor(detail: string) {
    super(`The price book this build ships could not be read: ${detail}`);
    this.name = "UnreadablePriceBookError";
  }
}

/** The parsed book, or the error above. One reader of `PARSED_PRICE_BOOK`'s discriminant, so neither
 *  hook spells the check itself. */
function readPriceBook(): PriceBook {
  if (PARSED_PRICE_BOOK.ok) return PARSED_PRICE_BOOK.book;
  throw new UnreadablePriceBookError(PARSED_PRICE_BOOK.failure.detail);
}

/**
 * The current design, priced. Both price surfaces read this one hook — frames 2A / D2A's bar and
 * §9 item 7's footer — so neither can be looking at a different number from the other.
 *
 * The whole-kitchen selections come straight off `design.settings` (wave 6E). Nothing is defaulted
 * here: a design carrying no container, or one carrying only the other key, is priced at the book's
 * own default tier, which is book data rather than a rule living in this hook.
 *
 * **A book that did not parse is a refusal, not a throw**: `PricingResult` already carries one, and
 * every price surface already renders a failure as no figure at all rather than as a zero.
 */
export function usePricedDesign(): PricingResult {
  const design = useConfiguratorStore((state) => state.design);
  const catalog = useConfiguratorStore((state) => state.catalog);

  return useMemo(() => {
    if (!PARSED_PRICE_BOOK.ok)
      return { ok: false, failure: PARSED_PRICE_BOOK.failure };
    return priceDesign({
      design,
      catalog,
      book: PARSED_PRICE_BOOK.book,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
      selections: design.settings,
    });
  }, [design, catalog]);
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
        book: readPriceBook(),
        pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
        selections: design.settings,
      }),
    [design, catalog],
  );
}
