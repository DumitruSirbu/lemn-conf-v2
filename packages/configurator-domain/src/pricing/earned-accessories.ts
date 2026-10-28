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
import { earnedLinkedAccessories } from "./linked-accessories.js";
import {
  ACCESSORY_IDS,
  listAccessoryIds,
  type AccessoryId,
  type PriceBook,
} from "./price-book.js";

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

/** The kitchen and the catalogue that say what it earns; the book and availability the customer last saw (`seenBook`,
 *  `seen`); and the book and availability in force (`activeBook`, `current`). */
export interface RemovedAccessoriesRequest {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly seenBook: PriceBook;
  readonly activeBook: PriceBook;
  readonly seen: CatalogueAvailability;
  readonly current: CatalogueAvailability;
}

/**
 * The accessories, built-in or linked, that the customer had in their kitchen when they last looked and that `current`
 * has since switched off: what they are told was removed, as accessory items. "Had" is read against what they saw: the
 * kitchen earned it under `seenBook`, and `seen` did not list it as off. So an accessory the dashboard created after
 * that (published inactive, A-17) was never theirs to lose and is not reported; one already off when they looked is not
 * reported again; and one the kitchen does not earn (no sink, no rack host, no placement of the linked row) never was.
 *
 * A linked accessory that `activeBook` no longer states is not reported either. It has not been switched off but
 * deleted, which A-18 allows only for an accessory no kitchen uses; so for an earned one the case does not arise, and
 * the money it took off is the prices-updated notice's (`pricesChangedBetween`).
 *
 * It takes the catalogue because whether a kitchen earns a sink cover is a fact about its bodies. Like the projection
 * it reads, it throws `UnknownBodyError` for a body the catalogue does not hold: price the design first, which refuses it
 * with a code.
 */
export function removedAccessoriesSince({
  design,
  catalog,
  seenBook,
  activeBook,
  seen,
  current,
}: RemovedAccessoriesRequest): readonly ItemRef[] {
  const entries = projectDesignForDisplay(design, catalog).flatMap(
    (group) => group.entries,
  );
  const statedNow = new Set(listAccessoryIds(activeBook));
  return distinctItemsInOrder(
    earnedAccessoryIds({ entries, catalog, book: seenBook })
      .filter((accessoryId) => statedNow.has(accessoryId))
      .map((accessoryId): ItemRef => ({ kind: "accessory", accessoryId }))
      .filter(
        (item) => isItemDisabled(current, item) && !isItemDisabled(seen, item),
      ),
  );
}

/** Every accessory the bodies earn at least one of: the built-ins, then the linked ones. */
function earnedAccessoryIds(kitchen: {
  readonly entries: readonly DisplayEntry[];
  readonly catalog: BodyCatalog;
  readonly book: PriceBook;
}): readonly string[] {
  const { entries, catalog, book } = kitchen;
  const builtIns = earnedAccessoryQuantities(entries, catalog);
  return [
    ...ACCESSORY_IDS.filter((accessoryId) => builtIns[accessoryId] > 0),
    ...earnedLinkedAccessories({
      entries,
      catalog,
      rules: book.linkedAccessories,
    })
      .filter(({ quantity }) => quantity > 0)
      .map(({ rule }) => rule.accessoryId),
  ];
}
