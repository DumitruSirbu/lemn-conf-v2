// The groups of switchable items, and which items a book states (ADR 0062 Amendment 3, A-16, A-17). A group is a set of
// alternatives a customer replaces one with another: the last active option of one can never be switched off, and the
// remaining options of one are what a dialog lists.
//
// - materials: the book's material tiers; hardware classes: the book's hardware tiers (one group each);
// - handles: every declared handle (one group);
// - colours: the palette of the material the colour belongs to (one group per material; a free-colour picker has none);
// - accessories: no group. A switched-off accessory just drops its line, there is nothing to choose instead.
import { MATERIALS, paletteEntriesOf } from "../materials.js";
import {
  declaredOptionsOfGroup,
  finishItems,
  isItemDisabled,
  isSameItem,
  type CatalogueAvailability,
  type ItemRef,
} from "../pricing/catalogue-availability.js";
import { listAccessoryIds, type PriceBook } from "../pricing/price-book.js";

/** What names the book whose groups and items are asked, and the availability that says what is on. */
export interface ItemGroupContext {
  readonly book: PriceBook;
  readonly availability: CatalogueAvailability;
}

/**
 * Every option of the group the item belongs to, on or off, the item included, in the group's own order: the book's
 * tiers, the palette's entries, the declared handles. Empty for an accessory, and for an item no group holds (a tier the
 * book does not state, a colour no material offers).
 */
export function declaredOptionsOfGroupOf(
  item: ItemRef,
  book: PriceBook,
): readonly ItemRef[] {
  return declaredOptionsOfGroup(item, book, paletteContaining);
}

/** The options of the item's group that are on, the item itself excluded: what a customer could be moved to if it were
 *  switched off, in the group's order. */
export function remainingOptionsIfSwitchedOff(
  item: ItemRef,
  { book, availability }: ItemGroupContext,
): readonly ItemRef[] {
  return declaredOptionsOfGroupOf(item, book).filter(
    (option) =>
      !isSameItem(option, item) && !isItemDisabled(availability, option),
  );
}

/** Whether the active book (or, for a colour and a handle, the code that declares them) states the item at all: a tier
 *  of the book, a palette entry, a declared handle, a built-in accessory or a linked one. */
export function isItemStated(item: ItemRef, book: PriceBook): boolean {
  if (item.kind === "accessory") {
    return listAccessoryIds(book).includes(item.accessoryId);
  }
  return declaredOptionsOfGroupOf(item, book).some((option) =>
    isSameItem(option, item),
  );
}

/** Whether a customer can be offered the item now: the book states it and availability has not switched it off. */
export function isItemOffered(
  item: ItemRef,
  { book, availability }: ItemGroupContext,
): boolean {
  return isItemStated(item, book) && !isItemDisabled(availability, item);
}

function paletteContaining(finishId: string): readonly ItemRef[] {
  const owner = MATERIALS.find((material) =>
    paletteEntriesOf(material).some((entry) => entry.entryId === finishId),
  );
  return owner === undefined ? [] : finishItems(paletteEntriesOf(owner));
}
