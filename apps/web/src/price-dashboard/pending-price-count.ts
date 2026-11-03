import {
  isSameItem,
  type BookFieldAddress,
  type DraftChange,
  type ItemRef,
} from "@lemnaria/configurator-domain";

// How many prices wait to be published, as the person counts them: one for each price they set and one for each class
// or accessory they created or deleted. A created row is stored as its creation, its rates or price, its words and perhaps
// its deletion, and the person made one thing, so everything the draft says about that row counts once.

export function countPendingPrices(changes: readonly DraftChange[]): number {
  const created = distinctCreatedRows(changes);
  const isOfCreatedRow = ({ address }: DraftChange): boolean => {
    const item = itemNamedBy(address);
    return item !== undefined && created.some((row) => isSameItem(row, item));
  };
  const ownCount = changes.filter((change) => !isOfCreatedRow(change)).length;
  return ownCount + created.length;
}

function distinctCreatedRows(
  changes: readonly DraftChange[],
): readonly ItemRef[] {
  const rows: ItemRef[] = [];
  for (const { address } of changes) {
    for (const row of creationIn(address)) {
      if (!rows.some((held) => isSameItem(held, row))) rows.push(row);
    }
  }
  return rows;
}

function creationIn(address: BookFieldAddress): readonly ItemRef[] {
  switch (address.kind) {
    case "hardware-tier-created":
      return [{ kind: "hardware", tierId: address.tierId }];
    case "accessory-created":
      return [{ kind: "accessory", accessoryId: address.accessoryId }];
    default:
      return [];
  }
}

/** The row a change belongs to, for the changes that belong to one; a cabinet price or the depth rule belongs to none. */
function itemNamedBy(address: BookFieldAddress): ItemRef | undefined {
  switch (address.kind) {
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
