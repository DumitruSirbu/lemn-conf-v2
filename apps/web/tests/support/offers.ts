// ADR 0032: `offersFor` publishes every band-appropriate entry with a verdict, and the panel keeps
// both accepted and refused entries visible. This helper compares their order without reclassifying
// the verdicts.
import type { CatalogOffer } from "@lemnaria/configurator-domain";

export function offerBuildIds(offers: readonly CatalogOffer[]): string[] {
  return offers.map((offer) => offer.buildId);
}
