// **`offersFor` publishes only what can actually be inserted**, on the owner's ruling of
// 2026-09-10 that reversed ADR 0032. So "an offer" and "an offered row" are one thing again, and the
// helpers that told them apart — `offered`, `refused`, `isRefused`, `verdictOf` — are gone rather
// than kept as wrappers around a list that no longer has two halves.
//
// What is left is the pair a test needs to make the *negative* claim the reversal turned into the
// interesting one: a wall body is **not** in a base list, a too-wide entry is **not** offered. A
// bare `offers.some(...)` says that too; naming it keeps the claim readable and keeps the failure
// message useful, which is why `offerFor` throws with the whole list rather than returning
// `undefined` for a caller to assert on.
import type { CatalogOffer } from "../../src/queries/offers.js";

export function offeredIds(offers: readonly CatalogOffer[]): string[] {
  return offers.map((offer) => offer.buildId);
}

export function isOffered(
  offers: readonly CatalogOffer[],
  buildId: string,
): boolean {
  return offers.some((offer) => offer.buildId === buildId);
}

/** One entry by name, so a test can assert what it would build to and not merely that it is there.
 *  Throws naming the whole list, because "the list did not hold it" is the diagnosis. */
export function offerFor(
  offers: readonly CatalogOffer[],
  buildId: string,
): CatalogOffer {
  const found = offers.find((offer) => offer.buildId === buildId);
  if (!found) {
    throw new Error(
      `${buildId} is not in the list at all; it has ${offeredIds(offers).join(
        ", ",
      )}`,
    );
  }
  return found;
}
