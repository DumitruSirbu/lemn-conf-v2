import { isSameItem, type ItemRef } from "../pricing/catalogue-availability.js";

import type { BookFieldAddress, DraftChange } from "./book-field-address.js";

// How many prices a draft holds, as the person counts them: one for each price they set, and one for each row they
// created or deleted. The draft stores a created row as its creation, its rates or price and its words, and a deleted
// row as its deletion beside any price set on it; the person did one thing to that row, so everything the draft says
// about it counts once. The same number is shown while the draft waits and stored with the version it becomes.

export function countPendingPrices(changes: readonly DraftChange[]): number {
  const rows = changedRowsOf(changes);
  const ownCount = changes.filter(
    (change) => changedRowOf(change, rows) === undefined,
  ).length;
  return ownCount + rows.length;
}

/** The rows the draft creates or deletes, each once, in the order the draft first says something of them. */
export function changedRowsOf(
  changes: readonly DraftChange[],
): readonly ItemRef[] {
  const rows: ItemRef[] = [];
  for (const change of changes) {
    const row = createdOrDeletedRow(addressOf(change));
    if (row !== undefined && !rows.some((held) => isSameItem(held, row))) {
      rows.push(row);
    }
  }
  return rows;
}

/**
 * The row among `rows` that a change is about, for the creation, the deletion and every field and word of such a row.
 */
export function changedRowOf(
  change: DraftChange,
  rows: readonly ItemRef[],
): ItemRef | undefined {
  const named = rowNamedBy(addressOf(change));
  return named === undefined
    ? undefined
    : rows.find((row) => isSameItem(row, named));
}

/** A stored change is JSON: one whose address is not an object belongs to no row and counts as a price of its own. */
function addressOf(change: DraftChange): BookFieldAddress | undefined {
  const address: unknown = (change as { readonly address?: unknown }).address;
  return typeof address === "object" && address !== null
    ? (address as BookFieldAddress)
    : undefined;
}

function createdOrDeletedRow(
  address: BookFieldAddress | undefined,
): ItemRef | undefined {
  switch (address?.kind) {
    case "hardware-tier-created":
      return { kind: "hardware", tierId: address.tierId };
    case "accessory-created":
      return { kind: "accessory", accessoryId: address.accessoryId };
    case "item-deleted":
      return address.item;
    default:
      return undefined;
  }
}

/** The row a change is about, if it is about one; a cabinet price or the depth rule is about none. */
function rowNamedBy(
  address: BookFieldAddress | undefined,
): ItemRef | undefined {
  switch (address?.kind) {
    case "hardware":
    case "material":
      return { kind: address.kind, tierId: address.tierId };
    case "accessory":
      return { kind: "accessory", accessoryId: address.accessoryId };
    case "created-row-text":
      return address.item;
    default:
      return createdOrDeletedRow(address);
  }
}
