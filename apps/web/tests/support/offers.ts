// ADR 0032: `offersFor` publishes every band-appropriate entry with a verdict, and the panel renders
// the offered ones. A test comparing the panel's rows to the engine's list has to compare against
// the same half, so it says which half here rather than passing the whole list and hoping.
import type { CatalogOffer } from "@lemnaria/configurator-domain";

export function offeredBuildIds(offers: readonly CatalogOffer[]): string[] {
  return offers
    .filter((offer) => offer.verdict.status === "offered")
    .map((offer) => offer.buildId);
}
