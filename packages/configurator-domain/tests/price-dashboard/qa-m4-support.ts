// Shared by the M10 M4 adversarial suites: change builders, the book the structural drafts start from, and an
// independent reading of the rows a book states (written here, so a diff is not checked against the diff's own walker).
import {
  applyChanges,
  type ApplyChangesResult,
} from "../../src/price-dashboard/apply-changes.js";
import { fc } from "@fast-check/vitest";

import { addressKey } from "../../src/price-dashboard/address-key.js";
import type {
  BookFieldAddress,
  DraftChange,
} from "../../src/price-dashboard/book-field-address.js";
import type { ItemRef } from "../../src/pricing/catalogue-availability.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import { SUPPLIED_ROW_IDS } from "../support/linked-accessory-books.js";

import { PERCENTAGE_BOOK } from "./change-set-books.js";

export const BASE: PriceBook = PERCENTAGE_BOOK;

export const RATE_FIELDS = [
  "perHingeMinor",
  "perDrawerMinor",
  "perPushToOpenMinor",
  "perLiftMinor",
] as const;
export type RateField = (typeof RATE_FIELDS)[number];

export function change(address: unknown, value: unknown): DraftChange {
  return { address, value } as DraftChange;
}

export function createTier(
  tierId: string,
  words: unknown = { name: "Economic", description: "Glisiere simple." },
): DraftChange {
  return change({ kind: "hardware-tier-created", tierId }, words);
}

export function setRate(
  tierId: string,
  field: RateField,
  value: number,
): DraftChange {
  return change({ kind: "hardware", tierId, field }, value);
}

export function allRates(tierId: string): readonly DraftChange[] {
  return RATE_FIELDS.map((field, index) =>
    setRate(tierId, field, 1_000 * (index + 1)),
  );
}

export function createAccessory(
  accessoryId: string,
  member: Record<string, unknown> = {},
): DraftChange {
  return change(
    { kind: "accessory-created", accessoryId },
    {
      linkedBuildId: "base-3drawer",
      perUnitMinor: 5_000,
      name: "Organizator",
      ...member,
    },
  );
}

export function setAccessoryPrice(
  accessoryId: string,
  value: number,
): DraftChange {
  return change(
    { kind: "accessory", accessoryId, field: "perUnitMinor" },
    value,
  );
}

export function rewordRow(
  item: unknown,
  field: string,
  value: unknown,
): DraftChange {
  return change({ kind: "created-row-text", item, field }, value);
}

export function deleteItem(item: unknown, value: unknown = true): DraftChange {
  return change({ kind: "item-deleted", item }, value);
}

export const hardwareItem = (tierId: string): ItemRef => ({
  kind: "hardware",
  tierId,
});
export const materialItem = (tierId: string): ItemRef => ({
  kind: "material",
  tierId,
});
export const accessoryItem = (accessoryId: string): ItemRef => ({
  kind: "accessory",
  accessoryId,
});

/** A whole hardware class: its creation and the four rates it owes. */
export function tierDraft(tierId: string): readonly DraftChange[] {
  return [createTier(tierId), ...allRates(tierId)];
}

export function applied(
  book: PriceBook,
  changes: readonly DraftChange[],
): PriceBook {
  const result = applyChanges(book, changes);
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result)}`);
  return result.book;
}

export function refusalCodes(result: ApplyChangesResult): string {
  if (result.ok) return "ok";
  if (result.reason !== "changes-refused") return `candidate-refused`;
  return result.refusals
    .map(({ index, code }) => `${String(index)}:${code}`)
    .join(",");
}

export function addressOf(change_: DraftChange): BookFieldAddress {
  return change_.address;
}

/** The members a row states, read straight from the book's own arrays. */
export interface StatedRow {
  readonly item: ItemRef;
  readonly fields: Readonly<Record<string, string | number | undefined>>;
}

export function statedRowsOf(book: PriceBook): readonly StatedRow[] {
  return [
    ...book.hardware.tiers.map(
      (tier): StatedRow => ({
        item: hardwareItem(tier.tierId),
        fields: {
          name: tier.name,
          description: tier.description,
          perHingeMinor: tier.perHingeMinor,
          perDrawerMinor: tier.perDrawerMinor,
          perPushToOpenMinor: tier.perPushToOpenMinor,
          perLiftMinor: tier.perLiftMinor,
        },
      }),
    ),
    ...book.material.tiers.map(
      (tier): StatedRow => ({
        item: materialItem(tier.tierId),
        fields: { percentOfCabinets: tier.percentOfCabinets },
      }),
    ),
    ...book.linkedAccessories.map(
      (linked): StatedRow => ({
        item: accessoryItem(linked.accessoryId),
        fields: {
          name: linked.name,
          description: linked.description,
          perUnitMinor: linked.perUnitMinor,
        },
      }),
    ),
  ];
}

export function keyOfItem(item: ItemRef): string {
  return JSON.stringify(item);
}

export const SHIPPED_HARDWARE = BASE.hardware.tiers.map((tier) => tier.tierId);
export const SHIPPED_MATERIAL = BASE.material.tiers.map((tier) => tier.tierId);

// ---------------------------------------------------------------------------------------------------------------------
// Random drafts

export const aTierId = fc.constantFrom("hw.a", "hw.b", "hw.c");
const anAccessoryId = fc.constantFrom("acc.a", "acc.b", "acc.c");
const aLink = fc.constantFrom(...SUPPLIED_ROW_IDS);
// eslint-disable-next-line no-restricted-syntax -- the judgement is about Romanian wording: this input must pass or be refused
const aWord = fc.constantFrom("Alfa", "Beta", "Gama", "Sertar ad\u00e2nc");
const aRate = fc.constantFrom(...RATE_FIELDS);
const anAmount = fc.integer({ min: 0, max: 200_000 });

export const aTierBlock = fc
  .tuple(
    aTierId,
    fc.oneof(
      {
        weight: 5,
        arbitrary: fc.shuffledSubarray([...RATE_FIELDS], {
          minLength: RATE_FIELDS.length,
        }),
      },
      { weight: 1, arbitrary: fc.shuffledSubarray([...RATE_FIELDS]) },
    ),
    anAmount,
    fc.option(aWord, { nil: undefined }),
    fc.boolean(),
  )
  .map(([id, fields, amount, reword, isDeleted]): readonly DraftChange[] => [
    createTier(id),
    ...fields.map((field) => setRate(id, field as "perHingeMinor", amount)),
    ...(reword === undefined
      ? []
      : [rewordRow(hardwareItem(id), "name", reword)]),
    ...(isDeleted ? [deleteItem(hardwareItem(id))] : []),
  ]);

export const anAccessoryBlock = fc
  .tuple(
    anAccessoryId,
    aLink,
    fc.option(anAmount, { nil: undefined }),
    fc.option(aWord, { nil: undefined }),
    fc.boolean(),
  )
  .map(([id, link, price, reword, isDeleted]): readonly DraftChange[] => [
    createAccessory(id, { linkedBuildId: link }),
    ...(price === undefined ? [] : [setAccessoryPrice(id, price)]),
    ...(reword === undefined
      ? []
      : [rewordRow(accessoryItem(id), "description", reword)]),
    ...(isDeleted ? [deleteItem(accessoryItem(id))] : []),
  ]);

export const aShippedBlock = fc
  .tuple(fc.constantFrom(...SHIPPED_HARDWARE), aRate, anAmount, fc.boolean())
  .map(([id, field, amount, isDeleted]): readonly DraftChange[] => [
    setRate(id, field, amount),
    ...(isDeleted ? [deleteItem(hardwareItem(id))] : []),
  ]);

/** Blocks in any order, then the draft rule: one change per address, the later one standing. */
export const aMaterialBlock = fc
  .constantFrom(
    ...SHIPPED_MATERIAL.filter((id) => id !== BASE.material.defaultTierId),
  )
  .map((id): readonly DraftChange[] => [deleteItem(materialItem(id))]);

export const aDraft = fc
  .array(
    fc.oneof(aTierBlock, anAccessoryBlock, aShippedBlock, aMaterialBlock),
    {
      maxLength: 6,
    },
  )
  .map((blocks) => oneChangePerAddress(blocks.flat()));

export function oneChangePerAddress(
  changes: readonly DraftChange[],
): readonly DraftChange[] {
  return changes.filter(
    (change, index) =>
      !changes
        .slice(index + 1)
        .some(
          (later) => addressKey(later.address) === addressKey(change.address),
        ),
  );
}

export function itemKeys(items: readonly { kind: string }[]): string[] {
  return items.map((item) => JSON.stringify(item)).sort();
}

export function createdAndDeletedIn(book: PriceBook, result: PriceBook) {
  const idsOf = (from: PriceBook) => [
    ...from.hardware.tiers.map((tier) => hardwareItem(tier.tierId)),
    ...from.linkedAccessories.map((linked) =>
      accessoryItem(linked.accessoryId),
    ),
  ];
  const before = new Set(itemKeys(idsOf(book)));
  const after = new Set(itemKeys(idsOf(result)));
  return {
    created: [...after].filter((key) => !before.has(key)).sort(),
    deleted: [...before].filter((key) => !after.has(key)).sort(),
  };
}
