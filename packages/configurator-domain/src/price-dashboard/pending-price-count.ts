import { isSameItem } from "../pricing/catalogue-availability.js";
import type { ItemKind, ItemRef } from "../pricing/catalogue-availability.js";

import { ITEM_KINDS } from "./book-field-address.js";
import type { BookFieldAddress, DraftChange } from "./book-field-address.js";

// How many prices a draft holds, as the person counts them: one for each price they set, and one for each row they
// created or deleted. The draft stores a created row as its creation, its rates or price and its words, and a deleted
// row as its deletion beside any price set on it; the person did one thing to that row, so everything the draft says
// about it counts once. The same number is shown while the draft waits and stored with the version it becomes.

/** Takes unknown entries because a stored summary is JSON: it never throws and never exceeds `changes.length`. */
export function countPendingPrices(changes: readonly unknown[]): number {
  const changedRowKeys = new Set<string>();
  for (const change of changes) {
    const key = rowKeyOf(createdOrDeletedRow(addressOf(change)));
    if (key !== undefined) changedRowKeys.add(key);
  }
  const ownCount = changes.filter((change) => {
    const key = rowKeyOf(rowNamedBy(addressOf(change)));
    return key === undefined || !changedRowKeys.has(key);
  }).length;
  return ownCount + changedRowKeys.size;
}

/** The rows the draft creates or deletes, each once, in the order the draft first says something of them. */
export function changedRowsOf(
  changes: readonly DraftChange[],
): readonly ItemRef[] {
  const rows = new Map<string, ItemRef>();
  for (const change of changes) {
    const row = createdOrDeletedRow(addressOf(change));
    const key = rowKeyOf(row);
    if (row !== undefined && key !== undefined && !rows.has(key)) {
      rows.set(key, row);
    }
  }
  return [...rows.values()];
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
 * A stored change is JSON, so anything can be in it. An entry whose address is no object, or whose row is no item (a
 * known kind with its id as a string), belongs to no row and counts as a price of its own.
 */
function addressOf(change: unknown): BookFieldAddress | undefined {
  if (!isObject(change)) return undefined;
  const address = change["address"];
  return isObject(address)
    ? (address as unknown as BookFieldAddress)
    : undefined;
}

function itemOf(candidate: unknown): ItemRef | undefined {
  if (!isObject(candidate)) return undefined;
  const kind = candidate["kind"];
  const isKnownKind = ITEM_KINDS.some((known) => known === kind);
  return isKnownKind && typeof idOf(candidate, kind as ItemKind) === "string"
    ? (candidate as unknown as ItemRef)
    : undefined;
}

function idOf(item: Record<string, unknown>, kind: ItemKind): unknown {
  switch (kind) {
    case "material":
    case "hardware":
      return item["tierId"];
    case "finish":
      return item["finishId"];
    case "handle":
      return item["handle"];
    case "accessory":
      return item["accessoryId"];
  }
}

/** An item's identity as text, for a lookup that does not rescan the rows: the kind has no colon, so it splits. */
function rowKeyOf(item: ItemRef | undefined): string | undefined {
  return item === undefined
    ? undefined
    : `${item.kind}:${String(idOf(item as unknown as Record<string, unknown>, item.kind))}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createdOrDeletedRow(
  address: BookFieldAddress | undefined,
): ItemRef | undefined {
  switch (address?.kind) {
    case "hardware-tier-created":
      return itemOf({ kind: "hardware", tierId: address.tierId });
    case "accessory-created":
      return itemOf({ kind: "accessory", accessoryId: address.accessoryId });
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
      return itemOf({ kind: address.kind, tierId: address.tierId });
    case "accessory":
      return itemOf({ kind: "accessory", accessoryId: address.accessoryId });
    case "created-row-text":
      return itemOf(address.item);
    default:
      return createdOrDeletedRow(address);
  }
}
