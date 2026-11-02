import { isRecord } from "../pricing/book-reading.js";
import { isSameItem, type ItemRef } from "../pricing/catalogue-availability.js";

import type { PriceBook } from "../pricing/price-book.js";

import type { DraftChange } from "./book-field-address.js";
import { hardwareRatesOf, snapshotItem } from "./structural-changes.js";

// What a draft's list of changes says about the rows it creates and removes, read from the list alone: no book, no
// store. A draft holds one change per address, so a row is created and deleted at most once each.

/** The rows the draft creates and does not delete again, in draft order: what a publish stores as new, and so what the
 *  availability log must start switched off (A-17). A row created and deleted in one draft never reaches the book. */
export function createdItemsOf(
  changes: readonly DraftChange[],
): readonly ItemRef[] {
  const deleted = deletedItemsOf(changes);
  return readChanges(changes).flatMap(({ address }) => {
    const created = createdItemOf(address);
    const isDeleted =
      created !== undefined &&
      deleted.some((item) => isSameItem(item, created));
    return created === undefined || isDeleted ? [] : [created];
  });
}

/** The items the draft deletes, in draft order, as the changes name them: the items a publish owes a usage count for.
 *  A change whose item is not the shape of one names none. */
export function deletedItemsOf(
  changes: readonly DraftChange[],
): readonly ItemRef[] {
  return readChanges(changes).flatMap(({ address }) => {
    const item =
      address["kind"] === "item-deleted"
        ? snapshotItem(address["item"])
        : undefined;
    return item === undefined ? [] : [item];
  });
}

/**
 * The indexes of the accepted creations of a hardware class that no accepted change gives every rate `book`'s tiers
 * state, after the creation: the class would be priced at a rate nobody set. A class the draft deletes again owes
 * nothing.
 */
export function incompleteCreationIndexes(
  changes: readonly DraftChange[],
  accepted: ReadonlySet<number>,
  book: PriceBook,
): readonly number[] {
  const read = readChanges(changes);
  const creations = read.flatMap(({ address }, index) =>
    accepted.has(index) && address["kind"] === "hardware-tier-created"
      ? [{ index, tierId: address["tierId"] }]
      : [],
  );
  if (creations.length === 0) return [];
  const rates = hardwareRatesOf(book);
  const deleted = deletedItemsOf(changes);
  return creations.flatMap(({ index, tierId }) => {
    const isDeleted = deleted.some(
      (item) => item.kind === "hardware" && item.tierId === tierId,
    );
    const setRates = read.flatMap((later, laterIndex) =>
      laterIndex > index && accepted.has(laterIndex)
        ? ratesSetOn(later.address, tierId)
        : [],
    );
    const isComplete = rates.every((rate) => setRates.includes(rate));
    return isDeleted || isComplete ? [] : [index];
  });
}

function ratesSetOn(
  address: Readonly<Record<string, unknown>>,
  tierId: unknown,
): readonly unknown[] {
  return address["kind"] === "hardware" && address["tierId"] === tierId
    ? [address["field"]]
    : [];
}

function createdItemOf(
  address: Readonly<Record<string, unknown>>,
): ItemRef | undefined {
  const { kind } = address;
  if (kind === "hardware-tier-created" && typeof address["tierId"] === "string")
    return { kind: "hardware", tierId: address["tierId"] };
  if (
    kind === "accessory-created" &&
    typeof address["accessoryId"] === "string"
  )
    return { kind: "accessory", accessoryId: address["accessoryId"] };
  return undefined;
}

interface ReadChange {
  readonly address: Readonly<Record<string, unknown>>;
}

/** Each stored change's address, copied once; a change that is not an object with an address object reads as an empty one. */
function readChanges(changes: readonly DraftChange[]): readonly ReadChange[] {
  return Array.from(changes as readonly unknown[], (stored) => {
    const address = isRecord(stored) ? stored["address"] : undefined;
    return { address: isRecord(address) ? { ...address } : {} };
  });
}
