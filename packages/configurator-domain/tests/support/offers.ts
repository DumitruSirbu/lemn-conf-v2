// ADR 0032: `offersFor` publishes every band-appropriate entry with a verdict, so a test asking
// "what may the customer actually choose here?" has to say so rather than reading the list's length.
//
// These helpers exist so that turnover is visible: a test written before ADR 0032 meant *offered*
// wherever it said *offer*, and one written after has to pick a side. A bare `offers.map(...)` now
// means "every row, whatever its verdict", which is a different claim and usually not the one.
import type { CatalogOffer, OfferVerdict } from "../../src/queries/offers.js";

export type OfferedOffer = CatalogOffer & {
  readonly verdict: Extract<OfferVerdict, { status: "offered" }>;
};

export type RefusedOffer = CatalogOffer & {
  readonly verdict: Extract<OfferVerdict, { status: "refused" }>;
};

export function isOffered(offer: CatalogOffer): offer is OfferedOffer {
  return offer.verdict.status === "offered";
}

export function isRefused(offer: CatalogOffer): offer is RefusedOffer {
  return offer.verdict.status === "refused";
}

/** The rows a customer may actually pick — exactly the list `offersFor` returned before ADR 0032. */
export function offered(offers: readonly CatalogOffer[]): OfferedOffer[] {
  return offers.filter(isOffered);
}

export function refused(offers: readonly CatalogOffer[]): RefusedOffer[] {
  return offers.filter(isRefused);
}

export function offeredIds(offers: readonly CatalogOffer[]): string[] {
  return offered(offers).map((offer) => offer.buildId);
}

/** One entry's verdict by name, so a test can assert the reason and not merely the absence. */
export function verdictOf(
  offers: readonly CatalogOffer[],
  buildId: string,
): OfferVerdict {
  const found = offers.find((offer) => offer.buildId === buildId);
  if (!found) {
    throw new Error(
      `${buildId} is not in the list at all; it has ${offers
        .map((offer) => offer.buildId)
        .join(", ")}`,
    );
  }
  return found.verdict;
}
