// The composition root for pricing in this application. It names no price book (ADR 0062 seam 1):
// the book arrives as a value, read and parsed once per request on the server (`lib/server/active-price-book.ts`) and
// handed to the browser as a server prop (`price-book-provider.tsx`), so a manufacturer-published book is a
// substitution at that one server read and no client module can name a different one. Every function here takes the
// root as its first argument.
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

import { shippedDeepeningRows } from "./deepening-rows";
import {
  offerWholeKitchenTiers,
  type NoTierOffer,
  type TierOfferAnswer,
  type WholeKitchenTierOffer,
} from "./whole-kitchen-tiers";

/**
 * What the server hands the browser, whole and together: the version prices are read from, the book (parsed once, on
 * the server) and the availability current when it was read (A-17). Availability is carried beside the book and is
 * never a field of it; every price here is read under it.
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
 * There is no book to read a figure from. Raised only by `requireDeepCabinetPercent`, which has no honest degraded
 * answer: 0 % would say the depth is free. The tier offer answers `NO_TIER_OFFER` instead, and every price surface
 * answers with a refusal, rendered as no figure. No production code calls `requireDeepCabinetPercent` today (the
 * settings sheet reads `deepCabinetPercentOf` and words its own absence); both are kept for a caller that must not
 * proceed without a figure.
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
    deepeningRows: shippedDeepeningRows(),
    availability: root.availability,
  });
}

/** The depth percentage the root's book publishes, or nothing with no book. Nothing, never 0 %: that says it is free. */
export function deepCabinetPercentOf(root: PriceBookRoot): number | undefined {
  return root.kind === "none"
    ? undefined
    : root.book.depthRule.deepCabinetPercent;
}

/** The depth percentage the root's book publishes. No book is raised: a missing figure must not read as 0 %. */
export function requireDeepCabinetPercent(root: PriceBookRoot): number {
  const percent = deepCabinetPercentOf(root);
  if (percent === undefined)
    throw new UnreadablePriceBookError(NO_PRICE_BOOK_DETAIL);
  return percent;
}

/** There is no book to offer tiers from. One value, so a surface can tell "no book" from any offer by what it is. */
export const NO_TIER_OFFER: NoTierOffer = Object.freeze({ kind: "none" });

/**
 * Every whole-kitchen tier the book offers that is not switched off, each measured against its group's default. Here,
 * not in the settings surface: a surface that named a book would make two modules name one, the drift ADR 0062 seam 1
 * closes. With no book the answer is `NO_TIER_OFFER`, not a throw: the editor mounts this on every render.
 */
export function offerTiersAgainstBook(
  root: ActivePriceBook,
  design: Design,
  catalog: BodyCatalog,
): WholeKitchenTierOffer;
export function offerTiersAgainstBook(
  root: PriceBookRoot,
  design: Design,
  catalog: BodyCatalog,
): TierOfferAnswer;
export function offerTiersAgainstBook(
  root: PriceBookRoot,
  design: Design,
  catalog: BodyCatalog,
): TierOfferAnswer {
  if (root.kind === "none") return NO_TIER_OFFER;
  return offerWholeKitchenTiers({
    design,
    catalog,
    book: root.book,
    pricingVersion: root.book.version,
    selections: design.settings,
    deepeningRows: shippedDeepeningRows(),
    availability: root.availability,
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
export function buildCatalogAtDepthOf(design: Design): BodyCatalog | undefined {
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
