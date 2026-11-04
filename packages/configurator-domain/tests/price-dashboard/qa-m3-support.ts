// Shared by the M10 M3 adversarial suites: a deep freeze (so an input that is written to throws), the universe of
// items the shipped book and code state, and the state builders.
import type { NewKitchenSettings } from "../../src/generation/new-kitchen-settings.js";
import { PALETTE_ENTRY_IDS } from "../../src/materials.js";
import type { AvailabilityState } from "../../src/price-dashboard/item-lifecycle.js";
import type { ItemRef } from "../../src/pricing/catalogue-availability.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import {
  accessory,
  availabilityOf,
  BOOK,
  colour,
  handle,
  hardware,
  material,
} from "../support/availability-kitchens.js";

/** Freezes the value and everything reachable from it, and returns it. A production function that writes to its input
 *  then throws a `TypeError` (the suites are ES modules, so strict). */
export function deepFrozen<Value>(value: Value): Value {
  if (typeof value !== "object" || value === null) return value;
  for (const child of Object.values(value)) deepFrozen(child);
  return Object.freeze(value);
}

export const BUILT_IN_ACCESSORY_ITEMS: readonly ItemRef[] = [
  accessory("sinkProtectiveCover"),
  accessory("dishDryingRack"),
];

export const MATERIAL_ITEMS: readonly ItemRef[] = BOOK.material.tiers.map(
  (tier) => material(tier.tierId),
);
export const HARDWARE_ITEMS: readonly ItemRef[] = BOOK.hardware.tiers.map(
  (tier) => hardware(tier.tierId),
);
export const HANDLE_ITEMS: readonly ItemRef[] = [
  handle("steel"),
  handle("black"),
  handle("push"),
];
export const COLOUR_ITEMS: readonly ItemRef[] = PALETTE_ENTRY_IDS.map(colour);

/** Every item the shipped book and code state, of every kind. */
export const UNIVERSE: readonly ItemRef[] = [
  ...MATERIAL_ITEMS,
  ...HARDWARE_ITEMS,
  ...COLOUR_ITEMS,
  ...HANDLE_ITEMS,
  ...BUILT_IN_ACCESSORY_ITEMS,
];

export function stateOf(
  disabled: readonly ItemRef[] = [],
  defaults: NewKitchenSettings = {},
  book: PriceBook = BOOK,
): AvailabilityState {
  return { availability: availabilityOf(disabled), book, defaults };
}

/** Runs a sweep must land on each side of an iff before it certifies the side that did not move. */
export const ARM_FLOOR = 10;

/** The element at the position, or a thrown error naming what was expected: keeps a fixture lookup out of a cast. */
export function elementAt<Value>(
  values: readonly Value[],
  index: number,
): Value {
  const found = values[index];
  if (found === undefined) throw new Error(`no element at ${String(index)}`);
  return found;
}
