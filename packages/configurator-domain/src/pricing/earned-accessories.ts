// Which accessories a kitchen earns, how many, and which of them availability has taken away (ADR 0092 decision 11,
// ADR 0062 Amendment 3: a switched-off accessory is removed from the kitchen with a notice, and there is nothing to
// choose instead).
//
// One reader of the count serves the price (`priceDesign` bills what is earned and enabled) and the notice
// (`removedAccessoriesSince` names what was earned and has since been switched off), so the two cannot disagree about
// whether a kitchen had a rack.
import type { Design } from "../design.js";
import {
  projectDesignForDisplay,
  type DisplayEntry,
} from "../queries/design-projection.js";
import { findSinkAccessories } from "../queries/sink-accessories.js";
import type { BodyCatalog } from "../void-engine.js";

import {
  distinctItemsInOrder,
  isItemDisabled,
  type CatalogueAvailability,
  type ItemRef,
} from "./catalogue-availability.js";
import { ACCESSORY_IDS, type AccessoryId } from "./price-book.js";

/** How many of each built-in accessory the bodies earn, before availability or any book is asked: per sink, never per
 *  kitchen, so a second sink doubles both. Zero is an answer and a line's absence, never an amount. */
export type EarnedAccessoryQuantities = Readonly<Record<AccessoryId, number>>;

export function earnedAccessoryQuantities(
  entries: readonly DisplayEntry[],
  catalog: BodyCatalog,
): EarnedAccessoryQuantities {
  const sinks = findSinkAccessories(entries, catalog);
  return {
    sinkProtectiveCover: sinks.length,
    dishDryingRack: sinks.filter(
      (sink) => sink.rackHostPlacementId !== undefined,
    ).length,
  };
}

/** The kitchen and the catalogue that says what it earns, and the availability the customer last saw (`seen`) and the
 *  one that is current. */
export interface RemovedAccessoriesRequest {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly seen: CatalogueAvailability;
  readonly current: CatalogueAvailability;
}

/**
 * The accessories this kitchen earns that `current` switches off and `seen` did not: what the customer is told was
 * removed since they last looked, as accessory items. One already off when they last looked is not reported again, and
 * one the kitchen does not earn (no sink, no rack host) was never theirs to lose.
 *
 * It takes the catalogue because whether a kitchen earns a sink cover is a fact about its bodies. Like the projection
 * it reads, it throws `UnknownBodyError` for a body the catalogue does not hold: price the design first, which refuses it
 * with a code.
 */
export function removedAccessoriesSince({
  design,
  catalog,
  seen,
  current,
}: RemovedAccessoriesRequest): readonly ItemRef[] {
  const earned = earnedAccessoryQuantities(
    projectDesignForDisplay(design, catalog).flatMap((group) => group.entries),
    catalog,
  );
  return distinctItemsInOrder(
    ACCESSORY_IDS.filter((accessoryId) => earned[accessoryId] > 0)
      .map((accessoryId): ItemRef => ({ kind: "accessory", accessoryId }))
      .filter(
        (item) => isItemDisabled(current, item) && !isItemDisabled(seen, item),
      ),
  );
}
