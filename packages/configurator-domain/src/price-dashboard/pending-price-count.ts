import {
  isSameItem,
  type ItemKind,
  type ItemRef,
} from "../pricing/catalogue-availability.js";

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

/**
 * A stored change is JSON, so anything can be in it. An entry that names no address, or a row that is no item, belongs
 * to no row and counts as a price of its own: the count never throws and never exceeds the number of entries.
 */
function addressOf(change: DraftChange): BookFieldAddress | undefined {
  if (!isObject(change)) return undefined;
  const address: unknown = (change as { readonly address?: unknown }).address;
  return isObject(address) ? (address as BookFieldAddress) : undefined;
}

const ITEM_KINDS: ReadonlySet<unknown> = new Set<ItemKind>([
  "material",
  "hardware",
  "finish",
  "handle",
  "accessory",
]);

function itemOf(candidate: unknown): ItemRef | undefined {
  return isObject(candidate) && ITEM_KINDS.has(candidate["kind"])
    ? (candidate as unknown as ItemRef)
    : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
      return itemOf(address.item);
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
      return itemOf(address.item);
    default:
      return createdOrDeletedRow(address);
  }
}
