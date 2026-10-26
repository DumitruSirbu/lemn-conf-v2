import type { ItemKind, ItemRef } from "../pricing/catalogue-availability.js";

// The contract of M10's draft (plan §8.4 a, b; ADR 0062 Amendments, ADR 0176 to 0178): which field of the price
// book a change names, and what a change is. Types and closed lists only; nothing here reads or writes a book.
//
// **An address is identity and nothing else** (X0-4). The payload of a change is always `DraftChange.value`, so two
// edits of one field have equal addresses: within the draft a later change with an equal address replaces the earlier
// one, and the arrow removes by address.
//
// Two things are absent on purpose, and a test pins both (`book-field-address.coverage.test.ts`):
// - **No `active` arm.** Switching an item on or off is not a draft change: it applies on save, outside the draft
//   and outside the book (A-17), so a published version stays immutable.
// - **No Russian text.** The dashboard authors Romanian only; a created row renders it in both locales until the
//   deferred translation feature supplies Russian (A-21).
//
// `ItemRef` and `CatalogueAvailability` are declared in `pricing/catalogue-availability.ts`, the lower layer.

/** The editable amounts of a cabinet rule's anchored formula (D2 inline price, D3 fields). All in bani. */
export const CABINET_RULE_FIELDS = Object.freeze([
  "anchorMinor",
  "perStepWiderMinor",
  "perStepNarrowerMinor",
  "perExtraDoorLeafMinor",
  "perHeightStepMinor",
] as const);
export type CabinetRuleField = (typeof CABINET_RULE_FIELDS)[number];

/** The four per-mechanism rates of a hardware class (D4). The lift rate is the fourth (A-20). All in bani. */
export const HARDWARE_RATE_FIELDS = Object.freeze([
  "perHingeMinor",
  "perDrawerMinor",
  "perPushToOpenMinor",
  "perLiftMinor",
] as const);
export type HardwareRateField = (typeof HARDWARE_RATE_FIELDS)[number];

/** The one field a material tier has: its whole percentage over PAL (D5). */
export const MATERIAL_FIELDS = Object.freeze(["percentOfCabinets"] as const);
export type MaterialField = (typeof MATERIAL_FIELDS)[number];

/** The one field an accessory has: its price per unit, in bani (D6). */
export const ACCESSORY_FIELDS = Object.freeze(["perUnitMinor"] as const);
export type AccessoryField = (typeof ACCESSORY_FIELDS)[number];

/** The text a created row carries. Romanian only (A-21); a hardware class has a description, so does a linked
 *  accessory, and neither has any other authored field. */
export const CREATED_ROW_TEXT_FIELDS = Object.freeze([
  "name",
  "description",
] as const);
export type CreatedRowTextField = (typeof CREATED_ROW_TEXT_FIELDS)[number];

const ITEM_KIND_FLAGS: Readonly<Record<ItemKind, true>> = {
  material: true,
  hardware: true,
  finish: true,
  handle: true,
  accessory: true,
};
/** Every item kind. Built from a record, so a new kind does not compile until it is listed. */
export const ITEM_KINDS: readonly ItemKind[] = Object.freeze(
  Object.keys(ITEM_KIND_FLAGS) as ItemKind[],
);

/** The rows whose text the dashboard authors: a created hardware class or a (linked) accessory (A-21, m9). */
export type CreatedRowItemRef = Extract<
  ItemRef,
  { readonly kind: "hardware" | "accessory" }
>;

/**
 * The rows that can be deleted: a hardware class, a material, or a linked accessory (m9). A finish, a handle and the
 * two built-in accessories are code-declared and can be disabled, never deleted. That a hardware class or an accessory
 * is one the dashboard created, and that an accessory is linked, are judged against the book, not by this type.
 */
export type DeletableItemRef = Extract<
  ItemRef,
  { readonly kind: "hardware" | "material" | "accessory" }
>;

/**
 * The stable address of one field of the price book, or one structural change to it: identity only, never a payload.
 * Every arm is a draft change; the draft is an ordered list of them (A-15).
 */
export type BookFieldAddress =
  | {
      readonly kind: "cabinet";
      readonly ruleId: string;
      readonly field: CabinetRuleField;
    }
  | {
      /** One listed size of a fixed-size (`price-per-size`) rule. */
      readonly kind: "cabinet-size";
      readonly ruleId: string;
      readonly widthMm: number;
    }
  | {
      readonly kind: "hardware";
      readonly tierId: string;
      readonly field: HardwareRateField;
    }
  | {
      /** Whole percent over PAL. PAL is the fixed 0 % reference and has no address. */
      readonly kind: "material";
      readonly tierId: string;
      readonly field: MaterialField;
    }
  | { readonly kind: "depth-rule" }
  | {
      /** A built-in or a linked accessory. */
      readonly kind: "accessory";
      readonly accessoryId: string;
      readonly field: AccessoryField;
    }
  | { readonly kind: "provisional" }
  | {
      /** A class the dashboard created, by the id the server minted. Inactive until published (A-17, A-18). */
      readonly kind: "hardware-tier-created";
      readonly tierId: string;
    }
  | {
      /** A linked accessory (A-19), by the id the server minted. */
      readonly kind: "accessory-created";
      readonly accessoryId: string;
    }
  | {
      /** Created rows only; a keyed row's text is read-only (A-21). */
      readonly kind: "created-row-text";
      readonly item: CreatedRowItemRef;
      readonly field: CreatedRowTextField;
    }
  | {
      /** An unused, non-default item. Judged again at publish, which refuses whole if it gained a user (A-18). */
      readonly kind: "item-deleted";
      readonly item: DeletableItemRef;
    };

/** Every `field` an address can name, by its own word: what an audit detail may say a change touched. */
export const ADDRESS_FIELDS = Object.freeze([
  ...CABINET_RULE_FIELDS,
  ...HARDWARE_RATE_FIELDS,
  ...MATERIAL_FIELDS,
  ...ACCESSORY_FIELDS,
  ...CREATED_ROW_TEXT_FIELDS,
] as const);
export type AddressField = (typeof ADDRESS_FIELDS)[number];

export type BookFieldAddressKind = BookFieldAddress["kind"];

const ADDRESS_KIND_FLAGS: Readonly<Record<BookFieldAddressKind, true>> = {
  cabinet: true,
  "cabinet-size": true,
  hardware: true,
  material: true,
  "depth-rule": true,
  accessory: true,
  provisional: true,
  "hardware-tier-created": true,
  "accessory-created": true,
  "created-row-text": true,
  "item-deleted": true,
};
/** Every address kind. Built from a record, so a new kind does not compile until it is listed. */
export const BOOK_FIELD_ADDRESS_KINDS: readonly BookFieldAddressKind[] =
  Object.freeze(Object.keys(ADDRESS_KIND_FLAGS) as BookFieldAddressKind[]);

/** What the creation of a hardware class carries: its Romanian text (A-21). Its four rates are `hardware` changes. */
export interface HardwareTierCreation {
  readonly name: string;
  readonly description: string;
}

/** What the creation of a linked accessory carries (A-19): the cabinet type it follows, its price and its Romanian text. */
export interface AccessoryCreation {
  readonly linkedBuildId: string;
  readonly perUnitMinor: number;
  readonly name: string;
  readonly description?: string;
}

/**
 * What each kind's change sets. A whole amount in bani for the money kinds, a whole percent for `material` and
 * `depth-rule`; a boolean for the provisional switch; the text for `created-row-text`; `true` for a deletion.
 */
export interface DraftValueByKind {
  readonly cabinet: number;
  readonly "cabinet-size": number;
  readonly hardware: number;
  readonly material: number;
  readonly "depth-rule": number;
  readonly accessory: number;
  readonly provisional: boolean;
  readonly "hardware-tier-created": HardwareTierCreation;
  readonly "accessory-created": AccessoryCreation;
  readonly "created-row-text": string;
  readonly "item-deleted": true;
}

export type AddressOfKind<Kind extends BookFieldAddressKind> = Extract<
  BookFieldAddress,
  { readonly kind: Kind }
>;

/**
 * One draft change: the field or row it names, and what it sets it to. `groupId` ties the changes of one bulk action
 * (A-14). Written as one arm per kind, so the address's kind decides the value's type.
 */
export type DraftChange = {
  readonly [Kind in BookFieldAddressKind]: {
    readonly address: AddressOfKind<Kind>;
    readonly value: DraftValueByKind[Kind];
    readonly groupId?: string;
  };
}[BookFieldAddressKind];
