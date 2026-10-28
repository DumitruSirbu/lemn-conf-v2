// Whether the prices a customer last saw are not the prices their kitchen has now (ADR 0062 Amendment 5, A-11): the
// question behind the "prices updated" notice.
//
// The customer's marker is a pair (book version, availability revision), because a price can change without a new
// version: switching a linked accessory on adds a line to every kitchen that earns it. So the same design is priced
// under both pairs and the lines are compared. Whether the marker differs is the caller's question; a different marker
// over unchanged prices must not light the notice, which is why this prices instead of comparing versions.
import type { Design } from "../design.js";
import type { BodyCatalog } from "../void-engine.js";

import type { CatalogueAvailability } from "./catalogue-availability.js";
import { priceDesign } from "./price-design.js";
import type { PriceBook } from "./price-book.js";
import type { PricedDesign, PricingFailure } from "./price-lines.js";

/** The kitchen, and the two (book, availability) pairs it is priced under: the one the customer last saw and the one in
 *  force. The kitchen's own settings choose its tiers, as every price surface reads them. `deepeningRows` is what
 *  `priceDesign` requires of every caller. */
export interface PriceChangeRequest {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly deepeningRows: ReadonlySet<string>;
  readonly seenBook: PriceBook;
  readonly seenAvailability: CatalogueAvailability;
  readonly activeBook: PriceBook;
  readonly currentAvailability: CatalogueAvailability;
}

/** One side of the comparison has no price: a refusal has no lines to compare, and answering "no change" for it would
 *  hide a price that moved behind a kitchen that could not be priced. The refusal is carried whole. */
export class PriceChangeNotComparableError extends Error {
  readonly side: "seen" | "active";
  readonly failure: PricingFailure;

  constructor(side: "seen" | "active", failure: PricingFailure) {
    super(
      `The kitchen cannot be priced under the ${side} book and availability: ${failure.code}`,
    );
    this.name = "PriceChangeNotComparableError";
    this.side = side;
    this.failure = failure;
  }
}

/**
 * True if and only if some line's amount differs between the two pricings. A line on one side only differs by its whole
 * amount, so a line that appears at zero changes nothing a customer pays and is no change. Pricing is exact, so lines
 * are compared as integers and never within a tolerance.
 *
 * Throws `PriceChangeNotComparableError` when either pricing is refused: a design that names a switched-off item has
 * no price to compare, and the replacement sheet, not this notice, is what answers it.
 */
export function pricesChangedBetween(request: PriceChangeRequest): boolean {
  const seen = pricedOrThrow("seen", request, {
    book: request.seenBook,
    availability: request.seenAvailability,
  });
  const active = pricedOrThrow("active", request, {
    book: request.activeBook,
    availability: request.currentAvailability,
  });
  return differInSomeLine(amountsByLine(seen), amountsByLine(active));
}

function pricedOrThrow(
  side: "seen" | "active",
  { design, catalog, deepeningRows }: PriceChangeRequest,
  under: {
    readonly book: PriceBook;
    readonly availability: CatalogueAvailability;
  },
): PricedDesign {
  const result = priceDesign({
    design,
    catalog,
    deepeningRows,
    book: under.book,
    pricingVersion: under.book.version,
    selections: design.settings,
    availability: under.availability,
  });
  if (!result.ok) throw new PriceChangeNotComparableError(side, result.failure);
  return result.priced;
}

function amountsByLine(priced: PricedDesign): ReadonlyMap<string, number> {
  return new Map(priced.lines.map((line) => [line.lineId, line.amountMinor]));
}

const ABSENT_LINE_MINOR = 0;

function differInSomeLine(
  seen: ReadonlyMap<string, number>,
  active: ReadonlyMap<string, number>,
): boolean {
  const lineIds = new Set([...seen.keys(), ...active.keys()]);
  return [...lineIds].some(
    (lineId) =>
      (seen.get(lineId) ?? ABSENT_LINE_MINOR) !==
      (active.get(lineId) ?? ABSENT_LINE_MINOR),
  );
}
