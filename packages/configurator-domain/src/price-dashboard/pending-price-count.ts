import { isSameItem, type ItemRef } from "../pricing/catalogue-availability.js";

import type { BookFieldAddress, DraftChange } from "./book-field-address.js";

// How many prices a draft holds, as the person counts them: one for each price they set and one for each class or
// accessory they created or deleted. A created row is stored as its creation, its rates or price, its words and perhaps its
// deletion, and the person made one thing, so everything the draft says about that row counts once. The same number is
// shown while the draft waits and stored with the version it becomes.

export function countPendingPrices(changes: readonly DraftChange[]): number {
  const created = distinctCreatedRows(changes);
  const ownCount = changes.filter((change) => {
    const item = itemNamedBy(addressOf(change));
    return item === undefined || !created.some((row) => isSameItem(row, item));
  }).length;
  return ownCount + created.length;
}

function distinctCreatedRows(
  changes: readonly DraftChange[],
): readonly ItemRef[] {
  const rows: ItemRef[] = [];
  for (const change of changes) {
    const row = creationIn(addressOf(change));
    if (row !== undefined && !rows.some((held) => isSameItem(held, row))) {
      rows.push(row);
    }
  }
  return rows;
}

/** A stored change is JSON: one whose address is not an object belongs to no row and counts as a price of its own. */
function addressOf(change: DraftChange): BookFieldAddress | undefined {
  const address: unknown = (change as { readonly address?: unknown }).address;
  return typeof address === "object" && address !== null
    ? (address as BookFieldAddress)
    : undefined;
}

function creationIn(
  address: BookFieldAddress | undefined,
): ItemRef | undefined {
  switch (address?.kind) {
    case "hardware-tier-created":
      return { kind: "hardware", tierId: address.tierId };
    case "accessory-created":
      return { kind: "accessory", accessoryId: address.accessoryId };
    default:
      return undefined;
  }
}

/** The row a change belongs to, for the changes that belong to one; a cabinet price or the depth rule belongs to none. */
function itemNamedBy(
  address: BookFieldAddress | undefined,
): ItemRef | undefined {
  switch (address?.kind) {
    case "hardware":
    case "hardware-tier-created":
      return { kind: "hardware", tierId: address.tierId };
    case "accessory":
    case "accessory-created":
      return { kind: "accessory", accessoryId: address.accessoryId };
    case "created-row-text":
    case "item-deleted":
      return address.item;
    default:
      return undefined;
  }
}
