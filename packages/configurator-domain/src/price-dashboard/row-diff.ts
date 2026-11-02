import type { ItemRef } from "../pricing/catalogue-availability.js";
import type {
  HardwareTier,
  LinkedAccessoryRule,
  MaterialTier,
  PriceBook,
} from "../pricing/price-book.js";

import { addressKey } from "./address-key.js";
import type {
  AddressOfKind,
  CreatedRowItemRef,
  CreatedRowTextField,
  DeletableItemRef,
} from "./book-field-address.js";
import { linkedAccessoriesOf } from "./editable-fields.js";

// The rows a draft adds and removes, and the words of a created row, as D7 and D8 draw them. Read from two books, so a
// version compared with its predecessor draws the same rows as a draft compared with the active book. The prices of a
// created class are the `hardware` field rows beside this one, and a deleted row's rates are field rows that end
// absent: reverting any of them reverts the deletion (`withoutRow`). A linked accessory that now follows another
// catalogue row has a link row.

/** A side of a text row with no text: a description the row does not state. */
export interface AbsentText {
  readonly kind: "absent";
}

/** A hardware class or a linked accessory the second book states and the first does not, or an item the first states
 *  and the second does not. Its words are those of the book that states it. */
export type RowDiffRow =
  | {
      readonly kind: "row";
      readonly change: "created";
      readonly section: "hardware" | "accessories";
      readonly address:
        | AddressOfKind<"hardware-tier-created">
        | AddressOfKind<"accessory-created">;
      readonly item: CreatedRowItemRef;
      readonly name: string;
      readonly description?: string;
      /** Present for an accessory: the catalogue row it follows (A-19). */
      readonly linkedBuildId?: string;
    }
  | {
      readonly kind: "row";
      readonly change: "deleted";
      readonly section: "hardware" | "materials" | "accessories";
      readonly address: AddressOfKind<"item-deleted">;
      readonly item: DeletableItemRef;
      readonly name: string;
    };

/** The words of a row both books state, where they differ or a `created-row-text` change names them. */
export interface TextDiffRow {
  readonly kind: "text";
  readonly section: "hardware" | "accessories";
  readonly address: AddressOfKind<"created-row-text">;
  readonly item: CreatedRowItemRef;
  readonly field: CreatedRowTextField;
  readonly before: string | AbsentText;
  readonly after: string | AbsentText;
}

/** The catalogue row a linked accessory follows, where the two books state it differently (A-19). Like a text row it
 *  holds a side from each book; its address is the accessory's creation, the one change that sets a link. */
export interface LinkDiffRow {
  readonly kind: "link";
  readonly section: "accessories";
  readonly address: AddressOfKind<"accessory-created">;
  readonly item: CreatedRowItemRef;
  readonly before: string;
  readonly after: string;
}

export type StructuralDiffRow = RowDiffRow | TextDiffRow | LinkDiffRow;

interface StatedRow {
  readonly item: DeletableItemRef;
  readonly name: string;
  readonly description: string | undefined;
  readonly linkedBuildId?: string;
}

/** The rows by which `after`'s items differ from `before`'s, created first, then deleted, then reworded, then
 *  relinked. */
export function structuralRowsOf(
  books: { readonly before: PriceBook; readonly after: PriceBook },
  namedTextKeys: ReadonlySet<string>,
): readonly StructuralDiffRow[] {
  const before = statedRowsOf(books.before);
  const after = statedRowsOf(books.after);
  return [
    ...after.filter((row) => !isStatedIn(before, row.item)).flatMap(createdRow),
    ...before.filter((row) => !isStatedIn(after, row.item)).flatMap(deletedRow),
    ...after.flatMap((row) => textRows(row, before, namedTextKeys)),
    ...after.flatMap((row) => linkRows(row, before)),
  ];
}

function statedRowsOf(book: PriceBook): readonly StatedRow[] {
  return [
    ...book.hardware.tiers.map((tier) => tierRow("hardware", tier)),
    ...book.material.tiers.map((tier) => tierRow("material", tier)),
    ...linkedAccessoriesOf(book).map(linkedRow),
  ];
}

function tierRow(
  kind: "hardware" | "material",
  tier: HardwareTier | MaterialTier,
): StatedRow {
  return {
    item: { kind, tierId: tier.tierId },
    name: tier.name,
    description: tier.description,
  };
}

function linkedRow(linked: LinkedAccessoryRule): StatedRow {
  return {
    item: { kind: "accessory", accessoryId: linked.accessoryId },
    name: linked.name,
    description: linked.description,
    linkedBuildId: linked.linkedBuildId,
  };
}

function isStatedIn(rows: readonly StatedRow[], item: ItemRef): boolean {
  return rows.some(
    (row) => addressKeyOfItem(row.item) === addressKeyOfItem(item),
  );
}

function addressKeyOfItem(item: ItemRef): string {
  return addressKey({ kind: "item-deleted", item });
}

function createdRow(row: StatedRow): readonly RowDiffRow[] {
  const { item } = row;
  if (item.kind === "hardware") {
    return [
      {
        kind: "row",
        change: "created",
        section: "hardware",
        address: { kind: "hardware-tier-created", tierId: item.tierId },
        item,
        name: row.name,
        ...(row.description === undefined
          ? {}
          : { description: row.description }),
      },
    ];
  }
  if (item.kind !== "accessory" || row.linkedBuildId === undefined) return [];
  return [
    {
      kind: "row",
      change: "created",
      section: "accessories",
      address: { kind: "accessory-created", accessoryId: item.accessoryId },
      item,
      name: row.name,
      ...(row.description === undefined
        ? {}
        : { description: row.description }),
      linkedBuildId: row.linkedBuildId,
    },
  ];
}

function deletedRow(row: StatedRow): readonly RowDiffRow[] {
  const { item } = row;
  return [
    {
      kind: "row",
      change: "deleted",
      section: sectionOfDeleted(item),
      address: { kind: "item-deleted", item },
      item,
      name: row.name,
    },
  ];
}

function sectionOfDeleted(
  item: DeletableItemRef,
): "hardware" | "materials" | "accessories" {
  if (item.kind === "material") return "materials";
  return item.kind === "hardware" ? "hardware" : "accessories";
}

const TEXT_FIELDS = ["name", "description"] as const;

function textRows(
  after: StatedRow,
  before: readonly StatedRow[],
  namedTextKeys: ReadonlySet<string>,
): readonly TextDiffRow[] {
  const { item } = after;
  if (item.kind === "material") return [];
  const earlier = before.find(
    (row) => addressKeyOfItem(row.item) === addressKeyOfItem(item),
  );
  if (earlier === undefined) return [];
  return TEXT_FIELDS.flatMap((field) => {
    const address = { kind: "created-row-text", item, field } as const;
    const was = textOf(earlier, field);
    const now = textOf(after, field);
    const isNamed = namedTextKeys.has(addressKey(address));
    if (was === now && !isNamed) return [];
    return [
      {
        kind: "text",
        section: item.kind === "hardware" ? "hardware" : "accessories",
        address,
        item,
        field,
        before: was,
        after: now,
      },
    ];
  });
}

function linkRows(
  after: StatedRow,
  before: readonly StatedRow[],
): readonly LinkDiffRow[] {
  const { item } = after;
  if (item.kind !== "accessory") return [];
  const earlier = before.find(
    (row) => addressKeyOfItem(row.item) === addressKeyOfItem(item),
  );
  const was = earlier?.linkedBuildId;
  const now = after.linkedBuildId;
  if (was === undefined || now === undefined || was === now) return [];
  return [
    {
      kind: "link",
      section: "accessories",
      address: { kind: "accessory-created", accessoryId: item.accessoryId },
      item,
      before: was,
      after: now,
    },
  ];
}

function textOf(
  row: StatedRow,
  field: CreatedRowTextField,
): string | AbsentText {
  const text = field === "name" ? row.name : row.description;
  return text ?? ABSENT_TEXT;
}

const ABSENT_TEXT: AbsentText = Object.freeze({ kind: "absent" });
