import { isRecord } from "../pricing/book-reading.js";
import { isSameItem, type ItemRef } from "../pricing/catalogue-availability.js";

import type { PriceBook } from "../pricing/price-book.js";

import { addressKey } from "./address-key.js";
import type { DraftChange } from "./book-field-address.js";
import { linkedAccessoriesOf } from "./editable-fields.js";
import { hardwareRatesOf, snapshotItem } from "./structural-changes.js";

// What a draft's list of changes says about the rows it creates and removes. Read in order: a deletion undoes only the
// creation before it, so a row deleted and created again is created. A draft the store keeps holds one change per
// address, but the list `applyChanges` is given may hold more, and it is judged as written.

/** The rows the draft creates and does not delete afterwards, in draft order: what a publish stores as new, and so what
 *  the availability log must start switched off (A-17). A row created and then deleted in one draft never reaches the
 *  book. */
export function createdItemsOf(
  changes: readonly DraftChange[],
): readonly ItemRef[] {
  return createdItemsIn(readChanges(changes));
}

function createdItemsIn(read: readonly ReadChange[]): readonly ItemRef[] {
  const deletions = deletionsOf(read);
  return creationsOf(read)
    .filter((creation) => !isDeletedAfter(deletions, creation))
    .map(({ item }) => item);
}

/** The items the draft deletes, in draft order, as the changes name them: the items a publish owes a usage count for.
 *  A change whose item is not the shape of one names none. */
export function deletedItemsOf(
  changes: readonly DraftChange[],
): readonly ItemRef[] {
  return deletionsOf(readChanges(changes)).map(({ item }) => item);
}

/**
 * The items the draft deletes that the book it started from holds, each once, in draft order: the deletions no creation of
 * the same item precedes. A row the draft creates and then deletes was never in that book, so it has no user and is left
 * out; these are the items a publish owes a usage guard for.
 */
export function deletedBookItemsOf(
  changes: readonly DraftChange[],
): readonly ItemRef[] {
  const read = readChanges(changes);
  const creations = creationsOf(read);
  const deleted = deletionsOf(read)
    .filter(
      (deletion) =>
        !creations.some(
          ({ index, item }) =>
            index < deletion.index && isSameItem(item, deletion.item),
        ),
    )
    .map(({ item }) => item);
  return deleted.filter(
    (item, position) =>
      deleted.findIndex((earlier) => isSameItem(earlier, item)) === position,
  );
}

/**
 * The indexes of the accepted creations of a hardware class that no accepted change gives every rate `book`'s tiers
 * state, after the creation: the class would be priced at a rate nobody set. A class the draft deletes after its
 * creation owes nothing.
 */
export function incompleteCreationIndexes(
  changes: readonly DraftChange[],
  accepted: ReadonlySet<number>,
  book: PriceBook,
): readonly number[] {
  const read = readChanges(changes);
  const deletions = deletionsOf(read);
  const rates = hardwareRatesOf(book);
  return creationsOf(read).flatMap((creation) => {
    const { index, item } = creation;
    if (item.kind !== "hardware" || !accepted.has(index)) return [];
    const setRates = read.flatMap((later, laterIndex) =>
      laterIndex > index && accepted.has(laterIndex)
        ? ratesSetOn(later.address, item.tierId)
        : [],
    );
    const isComplete = rates.every((rate) => setRates.includes(rate));
    return isDeletedAfter(deletions, creation) || isComplete ? [] : [index];
  });
}

/**
 * The draft without the row a revert names, whose address is `address`. Reverting a creation takes every change that
 * names the created row (its rates, price, words and deletion), since none can stand without it. Reverting a field of a
 * row the draft creates takes the creation too, unless the field's own change is one the creation stands without: a
 * created accessory's price and a created row's words, which the creation already carries, go alone. A rate has no
 * such change, since every rate is owed. Reverting a field of an item the draft deletes takes the deletion, since that
 * is the change the field's row is drawn for; the field's own change, if any, stays. Anything else takes the change at
 * that address.
 */
export function withoutRow(
  changes: readonly DraftChange[],
  address: unknown,
): readonly DraftChange[] {
  const read = readChanges(changes);
  const isRemoved = removalOf(isRecord(address) ? { ...address } : {}, read);
  return changes.filter((_, index) => !isRemoved(read[index]?.address ?? {}));
}

type AddressTest = (address: Readonly<Record<string, unknown>>) => boolean;

/** Which changes a revert of `reverted` removes, as a test on a change's address. */
function removalOf(
  reverted: Readonly<Record<string, unknown>>,
  read: readonly ReadChange[],
): AddressTest {
  const item = itemOfAddress(reverted);
  if (item === undefined) return isAtAddress(reverted);
  if (createdItemOf(reverted) !== undefined)
    return (address) => isOnItem(address, item);
  if (isFieldOfCreatedRow(reverted, item, read))
    return hasOwnChangeToDrop(reverted, read)
      ? isAtAddress(reverted)
      : (address) => isOnItem(address, item);
  const isFieldOfDeletedItem = deletionsOf(read).some((deletion) =>
    isSameItem(deletion.item, item),
  );
  return isFieldOfDeletedItem
    ? (address) => address["kind"] === "item-deleted" && isOnItem(address, item)
    : isAtAddress(reverted);
}

function isAtAddress(reverted: Readonly<Record<string, unknown>>): AddressTest {
  const key = addressKey(reverted);
  return (address) => addressKey(address) === key;
}

/** A rate, a price or the words of a row the draft creates and does not delete afterwards. */
function isFieldOfCreatedRow(
  reverted: Readonly<Record<string, unknown>>,
  item: ItemRef,
  read: readonly ReadChange[],
): boolean {
  const isField =
    reverted["kind"] === "hardware" ||
    reverted["kind"] === "accessory" ||
    reverted["kind"] === "created-row-text";
  return (
    isField && createdItemsIn(read).some((created) => isSameItem(created, item))
  );
}

/** Whether the draft holds a change at `reverted` that the creation stands without: not a rate, which is owed. */
function hasOwnChangeToDrop(
  reverted: Readonly<Record<string, unknown>>,
  read: readonly ReadChange[],
): boolean {
  const key = addressKey(reverted);
  return (
    reverted["kind"] !== "hardware" &&
    read.some(({ address }) => addressKey(address) === key)
  );
}

function isOnItem(
  address: Readonly<Record<string, unknown>>,
  item: ItemRef,
): boolean {
  const named = itemOfAddress(address);
  return named !== undefined && isSameItem(named, item);
}

/** The item a change of a row's rates, price, words, creation or deletion is about. A cabinet, the depth rule and the
 *  provisional switch are about none. */
function itemOfAddress(
  address: Readonly<Record<string, unknown>>,
): ItemRef | undefined {
  switch (address["kind"]) {
    case "hardware":
    case "material":
      return typeof address["tierId"] === "string"
        ? { kind: address["kind"], tierId: address["tierId"] }
        : undefined;
    case "accessory":
      return typeof address["accessoryId"] === "string"
        ? { kind: "accessory", accessoryId: address["accessoryId"] }
        : undefined;
    case "hardware-tier-created":
    case "accessory-created":
      return createdItemOf(address);
    case "created-row-text":
    case "item-deleted":
      return snapshotItem(address["item"]);
    default:
      return undefined;
  }
}

/** What the change at `index` is judged against: the book the draft starts from, the book the earlier changes have
 *  made, and the draft itself. */
export interface DraftSoFar {
  readonly base: PriceBook;
  readonly running: PriceBook;
  readonly changes: readonly DraftChange[];
  readonly index: number;
}

/**
 * Whether a creation names an id that is not free: one the running book still states, one the base book states or an
 * earlier change of the draft created and the draft has since deleted. An id is minted once, so it is never given to a
 * row again (a keyed row's words are the catalogue's), and a creation never stands over a row the book already holds: a
 * later deletion of it would take the book's own row, which no usage guard asked about. A change that is not a creation
 * reuses nothing.
 */
export function reusesRemovedId(
  draft: DraftSoFar,
  address: Readonly<Record<string, unknown>>,
): boolean {
  const created = createdItemOf(address);
  if (created === undefined) return false;
  if (statesItemId(draft.running, created)) return true;
  const earlier = draft.changes.slice(0, draft.index);
  const wasCreatedEarlier = creationsOf(readChanges(earlier)).some(({ item }) =>
    isSameItem(item, created),
  );
  return wasCreatedEarlier || statesItemId(draft.base, created);
}

/** Whether the book has a row of the id `created` names, among the tiers or among the accessories as it is one. */
function statesItemId(book: PriceBook, created: ItemRef): boolean {
  if (created.kind === "accessory")
    return linkedAccessoriesOf(book).some(
      ({ accessoryId }) => accessoryId === created.accessoryId,
    );
  if (created.kind !== "hardware") return false;
  return [...book.hardware.tiers, ...book.material.tiers].some(
    ({ tierId }) => tierId === created.tierId,
  );
}

interface Positioned {
  readonly index: number;
  readonly item: ItemRef;
}

function creationsOf(read: readonly ReadChange[]): readonly Positioned[] {
  return read.flatMap(({ address }, index) => {
    const item = createdItemOf(address);
    return item === undefined ? [] : [{ index, item }];
  });
}

function deletionsOf(read: readonly ReadChange[]): readonly Positioned[] {
  return read.flatMap(({ address }, index) => {
    const item =
      address["kind"] === "item-deleted"
        ? snapshotItem(address["item"])
        : undefined;
    return item === undefined ? [] : [{ index, item }];
  });
}

function isDeletedAfter(
  deletions: readonly Positioned[],
  creation: Positioned,
): boolean {
  return deletions.some(
    ({ index, item }) =>
      index > creation.index && isSameItem(item, creation.item),
  );
}

function ratesSetOn(
  address: Readonly<Record<string, unknown>>,
  tierId: string,
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
