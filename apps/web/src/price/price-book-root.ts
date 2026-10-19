// The composition root for pricing, and the only module in this application that names a browser price book.
//
// ADR 0062 seam 1: `priceDesign` takes the book as a parameter and nothing under
// `packages/configurator-domain/src/pricing/` imports one, so a manufacturer-supplied book is a
// substitution here, not a refactor. Store-free and client-directive-free on purpose: the account's kitchen card
// prices a stored document through `priceFloorOf` and must not pull the configurator store into its page.
import {
  buildKitchenLBodyCatalog,
  CabinetDepthBelowMinimumError,
  cabinetDepthMmOf,
  parsePriceBook,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  UnknownWorktopDepthError,
  type BodyCatalog,
  type Design,
  type PriceBook,
  type PriceBookParseResult,
  type PricedDesign,
  type PricingResult,
} from "@lemnaria/configurator-domain";

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
 * an open product question. Every price surface answers with a refusal, rendered as no figure.
 */
export class UnreadablePriceBookError extends Error {
  constructor(detail: string) {
    super(`The price book this build ships could not be read: ${detail}`);
    this.name = "UnreadablePriceBookError";
  }
}

/**
 * One of the two readers of `PARSED_PRICE_BOOK`: the tier offer throws on a failed parse and a price
 * surface renders a refusal, so a single reader would have to pick one for both. The constant is named
 * only in these two readers.
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
export function priceAgainstBook(
  design: Design,
  catalog: BodyCatalog,
): PricingResult {
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
 * Every whole-kitchen tier the book offers, each measured against its group's default. Here, not in the
 * settings surface: a surface importing `SAMPLE_PRICE_BOOK` would make two modules name a book, the drift
 * ADR 0062 seam 1 closes.
 */
export function offerTiersAgainstBook(
  design: Design,
  catalog: BodyCatalog,
): WholeKitchenTierOffer {
  return offerWholeKitchenTiers({
    design,
    catalog,
    book: readPriceBook(),
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
}

/**
 * A stored kitchen priced as the editor's bar prices it: the same book, the same selections and the catalogue at the
 * kitchen's own cabinet depth. The figure is the starting price of the kitchen as it stands, not a cross-tier minimum
 * (`starting-price.ts`). Nothing when no honest figure exists, so a card shows none: the pricing refused it, or the
 * catalogue cannot be built at the document's depth.
 */
export function priceFloorOf(design: Design): PricedDesign | undefined {
  const catalog = buildCatalogAtDepthOf(design);
  if (catalog === undefined) return undefined;
  const priced = priceAgainstBook(design, catalog);
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
