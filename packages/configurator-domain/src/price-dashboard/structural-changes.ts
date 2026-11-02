import {
  isRecord,
  MAX_PRICE_COEFFICIENT_MINOR,
} from "../pricing/book-reading.js";
import type { ItemRef } from "../pricing/catalogue-availability.js";
import {
  ACCESSORY_IDS,
  type HardwareTier,
  type LinkedAccessoryRule,
  type PriceBook,
  type TierGroup,
  type TierIdentity,
} from "../pricing/price-book.js";

import {
  CREATED_ROW_TEXT_FIELDS,
  HARDWARE_RATE_FIELDS,
  type AddressOfKind,
  type BookFieldAddress,
  type CreatedRowTextField,
  type HardwareRateField,
} from "./book-field-address.js";
import { judgeCreatedRowText } from "./created-row-text.js";
import {
  accepted,
  judgeWholeNumber,
  linkedAccessoriesOf,
  refused,
  statesLinkedAccessories,
  type BookUpdater,
  type Judged,
} from "./editable-fields.js";

// The changes that add, reword or remove a row of the book rather than set a field of one (A-18, A-19, A-21): the
// creation of a hardware class or a linked accessory, the words of a created row, and the deletion of an item. Each
// is judged against the running candidate, so a change may name a row an earlier change created.
//
// A created row is built from named members only. It carries no `nameKey` or `descriptionKey` (a keyed row's words
// are the catalogue's), no Russian field, and a rule id derived from its own id (a tier's equals it, as every shipped tier's does; an
// accessory's is `accessory.<id>`). An id the book already states is the parser's refusal, since ids are minted by the
// server and a collision is its defect; an id the draft removed is refused before that (`reusesRemovedId`). A book that
// states no linked accessories takes none: a creation would write a section the version never held.

export const STRUCTURAL_ADDRESS_KINDS = Object.freeze([
  "hardware-tier-created",
  "accessory-created",
  "created-row-text",
  "item-deleted",
] as const);
export type StructuralAddressKind = (typeof STRUCTURAL_ADDRESS_KINDS)[number];

export type StructuralAddress = AddressOfKind<StructuralAddressKind>;

export function isStructuralAddress(
  address: BookFieldAddress,
): address is StructuralAddress {
  return (STRUCTURAL_ADDRESS_KINDS as readonly string[]).includes(address.kind);
}

/** The updater that makes one structural change on `book`, or the code it is refused for. Every member of the address
 *  and the value is read once. */
export function prepareStructuralWrite(
  book: PriceBook,
  address: StructuralAddress,
  value: unknown,
): Judged<BookUpdater> {
  switch (address.kind) {
    case "hardware-tier-created":
      return prepareTierCreation(book, address.tierId, value);
    case "accessory-created":
      return prepareAccessoryCreation(book, address.accessoryId, value);
    case "created-row-text":
      return prepareTextEdit(book, address, value);
    case "item-deleted":
      return prepareDeletion(book, address.item, value);
  }
}

/** The rates a hardware class states in this book: the ones its tiers carry. A created class starts at 0 on each and
 *  owes one `hardware` change per rate, so it is never priced at a rate nobody set. */
export function hardwareRatesOf(book: PriceBook): readonly HardwareRateField[] {
  return HARDWARE_RATE_FIELDS.filter((field) =>
    book.hardware.tiers.some(
      (tier) => typeof Reflect.get(tier, field) === "number",
    ),
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Creation

const TIER_CREATION_MEMBERS = ["name", "description"] as const;
const ACCESSORY_CREATION_MEMBERS = [
  "linkedBuildId",
  "perUnitMinor",
  "name",
  "description",
] as const;

function prepareTierCreation(
  book: PriceBook,
  tierId: unknown,
  value: unknown,
): Judged<BookUpdater> {
  if (typeof tierId !== "string") return refused("UNKNOWN_ADDRESS");
  const members = readMembers(value, TIER_CREATION_MEMBERS);
  if (!members.ok) return members;
  const name = judgeCreatedRowText(members.value["name"], "name");
  if (!name.ok) return refused(name.code);
  const description = judgeCreatedRowText(
    members.value["description"],
    "description",
  );
  if (!description.ok) return refused(description.code);
  const unsetRates = Object.fromEntries(
    hardwareRatesOf(book).map((field) => [field, 0]),
  );
  const tier = {
    tierId,
    ruleId: tierId,
    name: name.text,
    description: description.text,
    ...unsetRates,
  } as HardwareTier;
  return accepted((target) => ({
    ...target,
    hardware: {
      ...target.hardware,
      tiers: [...target.hardware.tiers, tier],
    },
  }));
}

function prepareAccessoryCreation(
  book: PriceBook,
  accessoryId: unknown,
  value: unknown,
): Judged<BookUpdater> {
  if (typeof accessoryId !== "string") return refused("UNKNOWN_ADDRESS");
  if (!statesLinkedAccessories(book)) return refused("NOT_EDITABLE");
  const members = readMembers(value, ACCESSORY_CREATION_MEMBERS);
  if (!members.ok) return members;
  const linkedBuildId = members.value["linkedBuildId"];
  if (typeof linkedBuildId !== "string") return refused("MISSING_VALUE");
  const linked = refuseUnlinkableRow(book, linkedBuildId);
  if (linked !== undefined) return refused(linked);
  const perUnit = judgeWholeNumber(
    members.value["perUnitMinor"],
    MAX_PRICE_COEFFICIENT_MINOR,
  );
  if (!perUnit.ok) return perUnit;
  const name = judgeCreatedRowText(members.value["name"], "name");
  if (!name.ok) return refused(name.code);
  const description = judgeOptionalDescription(members.value["description"]);
  if (!description.ok) return refused(description.code);
  const accessory: LinkedAccessoryRule = {
    accessoryId,
    ruleId: `accessory.${accessoryId}`,
    linkedBuildId,
    perUnitMinor: perUnit.value,
    name: name.text,
    ...(description.text === "" ? {} : { description: description.text }),
  };
  return accepted((target) => ({
    ...target,
    linkedAccessories: [...linkedAccessoriesOf(target), accessory],
  }));
}

/** An accessory is linked to a row the book prices and the manufacturer supplies (A-19). */
function refuseUnlinkableRow(
  book: PriceBook,
  linkedBuildId: string,
): "LINK_TARGET_UNKNOWN" | "LINK_TARGET_CUSTOMER_SUPPLIED" | undefined {
  const rule = book.cabinetRules.find(
    (candidate) => candidate.buildId === linkedBuildId,
  );
  if (rule === undefined) return "LINK_TARGET_UNKNOWN";
  return rule.suppliedBy === "customer"
    ? "LINK_TARGET_CUSTOMER_SUPPLIED"
    : undefined;
}

function judgeOptionalDescription(raw: unknown) {
  return raw === undefined
    ? ({ ok: true, text: "" } as const)
    : judgeCreatedRowText(raw, "description");
}

// ---------------------------------------------------------------------------------------------------------------------
// Words

function prepareTextEdit(
  book: PriceBook,
  address: AddressOfKind<"created-row-text">,
  value: unknown,
): Judged<BookUpdater> {
  const { field } = address;
  if (!isTextField(field)) return refused("UNKNOWN_ADDRESS");
  const item = snapshotItem(address.item);
  if (item === undefined) return refused("UNKNOWN_ADDRESS");
  const located = locateCreatedRow(book, item);
  if (!located.ok) return located;
  const text = judgeCreatedRowText(value, field);
  return text.ok
    ? accepted(located.value(field, text.text))
    : refused(text.code);
}

type TextWriter = (field: CreatedRowTextField, text: string) => BookUpdater;

/** The writer of a created row's words: a hardware class with no catalogue key, or a linked accessory. A keyed row, a
 *  built-in accessory and every other kind of item are code's and the catalogue's words, read-only. */
function locateCreatedRow(book: PriceBook, item: ItemRef): Judged<TextWriter> {
  if (item.kind === "hardware") return locateCreatedTier(book, item.tierId);
  if (item.kind !== "accessory") return refused("NOT_EDITABLE");
  const { accessoryId } = item;
  if ((ACCESSORY_IDS as readonly string[]).includes(accessoryId))
    return refused("NOT_EDITABLE");
  const exists = linkedAccessoriesOf(book).some(
    (linked) => linked.accessoryId === accessoryId,
  );
  if (!exists) return refused("UNKNOWN_ITEM");
  return accepted((field, text) => (target) => ({
    ...target,
    linkedAccessories: linkedAccessoriesOf(target).map((linked) =>
      linked.accessoryId === accessoryId
        ? withLinkedText(linked, field, text)
        : linked,
    ),
  }));
}

function locateCreatedTier(
  book: PriceBook,
  tierId: string,
): Judged<TextWriter> {
  const tier = book.hardware.tiers.find((row) => row.tierId === tierId);
  if (tier === undefined) return refused("UNKNOWN_ITEM");
  if (isKeyed(tier)) return refused("NOT_EDITABLE");
  return accepted((field, text) => (target) => ({
    ...target,
    hardware: {
      ...target.hardware,
      tiers: target.hardware.tiers.map((row) =>
        row.tierId === tierId ? { ...row, [field]: text } : row,
      ),
    },
  }));
}

/** A row names a catalogue leaf for its words: they are the catalogue's, and the dashboard does not author them. */
function isKeyed(tier: TierIdentity): boolean {
  return tier.nameKey !== undefined || tier.descriptionKey !== undefined;
}

/** An emptied description is no description: the member is left out, as the parser's list reads it. */
function withLinkedText(
  linked: LinkedAccessoryRule,
  field: CreatedRowTextField,
  text: string,
): LinkedAccessoryRule {
  if (field === "name") return { ...linked, name: text };
  const { description: ignored, ...withoutDescription } = linked;
  void ignored;
  return text === "" ? withoutDescription : { ...linked, description: text };
}

function isTextField(field: unknown): field is CreatedRowTextField {
  return (
    typeof field === "string" &&
    (CREATED_ROW_TEXT_FIELDS as readonly string[]).includes(field)
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Deletion

function prepareDeletion(
  book: PriceBook,
  declaredItem: unknown,
  value: unknown,
): Judged<BookUpdater> {
  const item = snapshotItem(declaredItem);
  if (item === undefined) return refused("UNKNOWN_ADDRESS");
  if (value !== true) return refused("MISSING_VALUE");
  switch (item.kind) {
    case "hardware":
      return deleteHardwareTier(book, item.tierId);
    case "material":
      return deleteMaterialTier(book, item.tierId);
    case "accessory":
      return deleteLinkedAccessory(book, item.accessoryId);
    case "finish":
    case "handle":
      return refused("NOT_EDITABLE");
  }
}

function deleteHardwareTier(
  book: PriceBook,
  tierId: string,
): Judged<BookUpdater> {
  const refusal = refuseTierDeletion(book.hardware, tierId);
  if (refusal !== undefined) return refusal;
  return accepted((target) => ({
    ...target,
    hardware: {
      ...target.hardware,
      tiers: target.hardware.tiers.filter((tier) => tier.tierId !== tierId),
    },
  }));
}

function deleteMaterialTier(
  book: PriceBook,
  tierId: string,
): Judged<BookUpdater> {
  const refusal = refuseTierDeletion(book.material, tierId);
  if (refusal !== undefined) return refusal;
  return accepted((target) => ({
    ...target,
    material: {
      ...target.material,
      tiers: target.material.tiers.filter((tier) => tier.tierId !== tierId),
    },
  }));
}

/** A tier goes unless it is its group's fallback: the book would price a kitchen that chose nothing at a tier it no
 *  longer states. A tier a saved kitchen uses, or the saved defaults name, is judged at publish. */
function refuseTierDeletion(
  group: TierGroup<TierIdentity>,
  tierId: string,
): Judged<never> | undefined {
  if (!group.tiers.some((tier) => tier.tierId === tierId))
    return refused("UNKNOWN_ITEM");
  return group.defaultTierId === tierId
    ? refused("ITEM_IS_DEFAULT")
    : undefined;
}

function deleteLinkedAccessory(
  book: PriceBook,
  accessoryId: string,
): Judged<BookUpdater> {
  if ((ACCESSORY_IDS as readonly string[]).includes(accessoryId))
    return refused("NOT_EDITABLE");
  if (!linkedAccessoriesOf(book).some((l) => l.accessoryId === accessoryId))
    return refused("UNKNOWN_ITEM");
  return accepted((target) => ({
    ...target,
    linkedAccessories: linkedAccessoriesOf(target).filter(
      (linked) => linked.accessoryId !== accessoryId,
    ),
  }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading what arrived

/** A copy of a record with each member read once, refused when it holds a member outside `allowed`. */
function readMembers(
  value: unknown,
  allowed: readonly string[],
): Judged<Readonly<Record<string, unknown>>> {
  if (!isRecord(value)) return refused("MISSING_VALUE");
  const copy: Record<string, unknown> = { ...value };
  const isKnown = Object.keys(copy).every((member) => allowed.includes(member));
  return isKnown ? accepted(copy) : refused("NOT_EDITABLE");
}

/** An item reference copied once, each member read once, or `undefined` when it is not the shape of one. */
export function snapshotItem(declared: unknown): ItemRef | undefined {
  if (!isRecord(declared)) return undefined;
  const copy: Record<string, unknown> = { ...declared };
  const { kind } = copy;
  if (kind === "material" || kind === "hardware")
    return typeof copy["tierId"] === "string"
      ? { kind, tierId: copy["tierId"] }
      : undefined;
  if (kind === "accessory")
    return typeof copy["accessoryId"] === "string"
      ? { kind, accessoryId: copy["accessoryId"] }
      : undefined;
  if (kind === "finish")
    return typeof copy["finishId"] === "string"
      ? { kind, finishId: copy["finishId"] }
      : undefined;
  return kind === "handle" && typeof copy["handle"] === "string"
    ? ({ kind, handle: copy["handle"] } as ItemRef)
    : undefined;
}
