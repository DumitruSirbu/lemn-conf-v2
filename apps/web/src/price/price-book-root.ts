// The composition root for pricing in this application. It names no price book (ADR 0062 seam 1, M10 wave R1):
// the book arrives as a value, read and parsed once per request on the server (`lib/server/active-price-book.ts`) and
// handed to the browser as a server prop (`price-book-provider.tsx`), so a manufacturer-published book is a substitution
// at that one server read and no client module can name a different one. Every function here takes the root as its first
// argument.
//
// Store-free and client-directive-free on purpose: the account's kitchen card prices a stored document through
// `priceFloorOf` and must not pull the configurator store into its page.
import {
  buildKitchenLBodyCatalog,
  CabinetDepthBelowMinimumError,
  cabinetDepthMmOf,
  priceDesign,
  UnknownWorktopDepthError,
  type BodyCatalog,
  type CatalogueAvailability,
  type Design,
  type PriceBook,
  type PricedDesign,
  type PricingResult,
} from "@lemnaria/configurator-domain";

import {
  offerWholeKitchenTiers,
  type WholeKitchenTierOffer,
} from "./whole-kitchen-tiers";

/**
 * What the server hands the browser, whole and together: the version prices are read from, the book (parsed once, on the
 * server) and the availability current when it was read (A-17). Availability is carried beside the book and is never a
 * field of it; until P4a prices read it, it is only carried.
 */
export interface ActivePriceBook {
  readonly kind: "active";
  readonly versionId: string;
  readonly book: PriceBook;
  readonly availability: CatalogueAvailability;
}

/** No book can be priced from: no version was ever published, or the store could not be read (A-10). */
export interface NoPriceBook {
  readonly kind: "none";
}

export type PriceBookRoot = ActivePriceBook | NoPriceBook;

export const NO_PRICE_BOOK: NoPriceBook = Object.freeze({ kind: "none" });

/** The detail every price surface's refusal carries when there is no book. Fixed text, holding nothing of a request. */
export const NO_PRICE_BOOK_DETAIL = "No price book is active";

/**
 * There is no book for the tier offer to read. Raised only by the tier offer, which has no honest degraded answer: an
 * empty group would make `global-settings-model.ts` throw `UnofferedDefaultTierError` anyway, and inventing a default
 * would decide what an unset kitchen costs. What the settings sheet should show when no book can be read is an open
 * product question. Every price surface answers with a refusal, rendered as no figure.
 */
export class UnreadablePriceBookError extends Error {
  constructor(detail: string) {
    super(`No price book could be read: ${detail}`);
    this.name = "UnreadablePriceBookError";
  }
}

/** One design priced against the root's book. No book is a refusal, not a throw. */
export function priceAgainstBook(
  root: PriceBookRoot,
  design: Design,
  catalog: BodyCatalog,
): PricingResult {
  if (root.kind === "none") {
    return {
      ok: false,
      failure: { code: "INVALID_PRICE_BOOK", detail: NO_PRICE_BOOK_DETAIL },
    };
  }
  return priceDesign({
    design,
    catalog,
    book: root.book,
    pricingVersion: root.book.version,
    selections: design.settings,
  });
}

/**
 * Every whole-kitchen tier the book offers, each measured against its group's default. Here, not in the settings
 * surface: a surface that named a book would make two modules name one, the drift ADR 0062 seam 1 closes.
 */
export function offerTiersAgainstBook(
  root: PriceBookRoot,
  design: Design,
  catalog: BodyCatalog,
): WholeKitchenTierOffer {
  if (root.kind === "none")
    throw new UnreadablePriceBookError(NO_PRICE_BOOK_DETAIL);
  return offerWholeKitchenTiers({
    design,
    catalog,
    book: root.book,
    pricingVersion: root.book.version,
    selections: design.settings,
  });
}

/**
 * A stored kitchen priced as the editor's bar prices it: the same book, the same selections and the catalogue at the
 * kitchen's own cabinet depth. The figure is the starting price of the kitchen as it stands, not a cross-tier minimum
 * (`starting-price.ts`). Nothing when no honest figure exists, so a card shows none: there is no book, the pricing
 * refused it, or the catalogue cannot be built at the document's depth.
 */
export function priceFloorOf(
  root: PriceBookRoot,
  design: Design,
): PricedDesign | undefined {
  const catalog = buildCatalogAtDepthOf(design);
  if (catalog === undefined) return undefined;
  const priced = priceAgainstBook(root, design, catalog);
  return priced.ok ? priced.priced : undefined;
}

/**
 * The catalogue builder's two documented refusals of a depth it cannot build, and nothing else. `DesignSchema` already
 * refuses such a depth on the wire, so these are defence in depth; any other throw is a defect and propagates, which
 * on the card means the render fails loudly rather than the price silently going missing.
 */
function buildCatalogAtDepthOf(design: Design): BodyCatalog | undefined {
  try {
    return buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  } catch (error) {
    if (isUnbuildableDepthRefusal(error)) return undefined;
    throw error;
  }
}

function isUnbuildableDepthRefusal(error: unknown): boolean {
  return (
    error instanceof UnknownWorktopDepthError ||
    error instanceof CabinetDepthBelowMinimumError
  );
}
