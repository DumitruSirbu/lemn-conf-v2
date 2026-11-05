import { HandleSchema, type Design, type Handle } from "../design.js";

// What can be switched off, and what is currently switched off (M10 plan §8.4 a, A-17). Pricing is the lower layer, and
// `price-dashboard/book-field-address.ts` imports these from here, never the reverse.
//
// Availability travels **beside** the book and is never a field of it, so a published version stays immutable and a
// switch never needs a publish. Ids are opaque strings, as a tier id is: this module imports no catalogue, no palette
// and no book (ADR 0062 seam 1), and the existence of an item is a question for the book, not for this module.
//
// The functions below compare, order, read what a design names, and list the options of a group. None of them is a
// price: no amount, rate or coefficient is keyed on a colour here.

/**
 * One thing availability can be switched on or off for. A built-in or a linked accessory is one `accessory` ref (a
 * built-in is named by its book field, `sinkProtectiveCover` or `dishDryingRack`). A `finish` ref names a colour by the
 * id of its palette entry.
 */
export type ItemRef =
  | { readonly kind: "material"; readonly tierId: string }
  | { readonly kind: "hardware"; readonly tierId: string }
  | { readonly kind: "finish"; readonly finishId: string }
  | { readonly kind: "handle"; readonly handle: Handle }
  | { readonly kind: "accessory"; readonly accessoryId: string };

export type ItemKind = ItemRef["kind"];

/**
 * What is currently switched off. `revision` is opaque: compared only for equality, never ordered above SQL, as
 * `DesignRevision` is.
 */
export interface CatalogueAvailability {
  readonly revision: string;
  readonly disabled: readonly ItemRef[];
}

/** Whether availability switches this item off: the one comparison every consumer makes, so none re-derives it. */
export function isItemDisabled(
  availability: CatalogueAvailability,
  item: ItemRef,
): boolean {
  return availability.disabled.some((disabled) => isSameItem(disabled, item));
}

/** Value equality: the same kind naming the same thing. No default arm, so a sixth kind is a compile error. */
export function isSameItem(one: ItemRef, other: ItemRef): boolean {
  switch (one.kind) {
    case "material":
      return other.kind === "material" && one.tierId === other.tierId;
    case "hardware":
      return other.kind === "hardware" && one.tierId === other.tierId;
    case "finish":
      return other.kind === "finish" && one.finishId === other.finishId;
    case "handle":
      return other.kind === "handle" && one.handle === other.handle;
    case "accessory":
      return (
        other.kind === "accessory" && one.accessoryId === other.accessoryId
      );
  }
}

/**
 * Each item once, in an order that depends on the items alone: by kind (material, hardware, finish, handle, accessory),
 * then by id in code-unit order. A list built from a design never changes its bytes with the order its parts were
 * written in, which is what lets two results be compared byte for byte.
 */
export function distinctItemsInOrder(
  items: readonly ItemRef[],
): readonly ItemRef[] {
  const distinct = items.filter(
    (item, position) =>
      items.findIndex((earlier) => isSameItem(earlier, item)) === position,
  );
  return [...distinct].sort(compareItems);
}

const ITEM_KINDS_IN_ORDER: readonly ItemKind[] = [
  "material",
  "hardware",
  "finish",
  "handle",
  "accessory",
];

function compareItems(one: ItemRef, other: ItemRef): number {
  const byKind =
    ITEM_KINDS_IN_ORDER.indexOf(one.kind) -
    ITEM_KINDS_IN_ORDER.indexOf(other.kind);
  return byKind === 0
    ? compareByCodeUnit(itemIdOf(one), itemIdOf(other))
    : byKind;
}

function compareByCodeUnit(one: string, other: string): number {
  return Number(one > other) - Number(one < other);
}

/** The one id an item is named by: its tier, colour, handle or accessory. */
export function itemIdOf(item: ItemRef): string {
  switch (item.kind) {
    case "material":
    case "hardware":
      return item.tierId;
    case "finish":
      return item.finishId;
    case "handle":
      return item.handle;
    case "accessory":
      return item.accessoryId;
  }
}

/** What a catalogue says about one body that availability cares about: whether its document may carry a colour or a
 *  handle of its own. `BodyCatalog` satisfies it, so this module still names no catalogue (ADR 0062 seam 1). */
export interface CustomisableBodies {
  get(
    buildId: string,
  ): { readonly canFinish: boolean; readonly canHandle: boolean } | undefined;
}

/**
 * The colours and handles a design **names** (ADR 0062 Amendment 3, A-16), unordered and possibly repeated: the
 * kitchen's colour, handle and top-row handle, and each cabinet's own colour and handle where its catalogue row lets it
 * carry one. A body that cannot wear a colour or a handle names none whatever its document says, as the scene reads it.
 *
 * Only a palette entry is an item: a free colour is not a catalogue entry and cannot be switched off. Nothing is
 * defaulted: what a design follows without naming (a material's default colour, the slot's default handle) is not a
 * selection, so a stored selection is the only way to name one.
 */
export function coloursAndHandlesNamedBy(
  design: Design,
  catalog: CustomisableBodies,
): readonly ItemRef[] {
  const { settings } = design;
  return [
    ...colourItem(settings?.finish),
    ...handleItem(settings?.handle),
    ...handleItem(settings?.topRowHandle),
    ...design.placements.flatMap(({ body }) => {
      const capabilities = catalog.get(body.buildId);
      return [
        ...(capabilities?.canFinish === true ? colourItem(body.finish) : []),
        ...(capabilities?.canHandle === true ? handleItem(body.handle) : []),
      ];
    }),
  ];
}

type NamedColour = NonNullable<NonNullable<Design["settings"]>["finish"]>;

/** The item a colour names: a palette entry only, since a free colour is not an item. */
export function colourItem(
  finish: NamedColour | undefined,
): readonly ItemRef[] {
  return finish?.kind === "palette-entry" ? finishItems([finish]) : [];
}

/** A legacy stored `null` is no choice, like an absent one: only a string names a handle. */
export function handleItem(handle: Handle | undefined): readonly ItemRef[] {
  return typeof handle === "string" ? [handleRef(handle)] : [];
}

/** The kinds whose group is a tier list. */
export type TierKind = "hardware" | "material";

/** All a group of tiers is asked here: the ids it holds, in its order. A book's `TierGroup` satisfies it. */
export interface TierListing {
  readonly tiers: readonly { readonly tierId: string }[];
}

export interface TierListings {
  readonly material: TierListing;
  readonly hardware: TierListing;
}

export function tierRef(kind: TierKind, tierId: string): ItemRef {
  return { kind, tierId };
}

export function handleRef(handle: Handle): ItemRef {
  return { kind: "handle", handle };
}

export function finishRef(finishId: string): ItemRef {
  return { kind: "finish", finishId };
}

export function tierItems(
  group: TierListing,
  kind: TierKind,
): readonly ItemRef[] {
  return group.tiers.map(({ tierId }) => tierRef(kind, tierId));
}

/** Every handle the code declares, in its order: one group for the kitchen's handle and the top row's. */
export function declaredHandleItems(): readonly ItemRef[] {
  return HandleSchema.options.map(handleRef);
}

/** The colours of a list of palette entries, as items, in the list's order. */
export function finishItems(
  entries: readonly { readonly entryId: string }[],
): readonly ItemRef[] {
  return entries.map(({ entryId }) => finishRef(entryId));
}

/**
 * Every option of the group the item belongs to, on or off, the item included, in the group's own order: the tiers of
 * its kind, the declared handles, the colours `colourGroupOf` names. Empty for an accessory, which has no group. A
 * colour's group is the caller's to name, because a palette belongs to a material and callers differ in which one.
 */
export function declaredOptionsOfGroup(
  item: ItemRef,
  listings: TierListings,
  colourGroupOf: (finishId: string) => readonly ItemRef[],
): readonly ItemRef[] {
  switch (item.kind) {
    case "material":
      return tierItems(listings.material, "material");
    case "hardware":
      return tierItems(listings.hardware, "hardware");
    case "handle":
      return declaredHandleItems();
    case "finish":
      return colourGroupOf(item.finishId);
    case "accessory":
      return [];
  }
}
