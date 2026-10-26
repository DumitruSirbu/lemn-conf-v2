// Books and an independent editing oracle for the change-set tests. Nothing here calls `readEditableFields` or
// `applyChanges`: a slot is found by walking the book's JSON, and an edit is written by path, so a test that compares the
// module's result with `setSlots` is not fed by the module on both sides.
import type {
  BookFieldAddress,
  DraftChange,
} from "../../src/price-dashboard/book-field-address.js";
import type {
  AnchoredFormula,
  AnchoredShape,
} from "../../src/pricing/anchored-price-formula.js";
import type {
  CabinetPriceRule,
  MaterialTier,
  PriceBook,
} from "../../src/pricing/price-book.js";
import {
  MAX_DEEP_CABINET_PERCENT,
  MAX_MATERIAL_PERCENT,
} from "../../src/pricing/price-bounds.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

/** The flat form: linear cabinet formulas, flat material amounts, no depth rule. Only hardware, accessories and the
 *  provisional flag are editable in it. */
export const FLAT_BOOK: PriceBook = SAMPLE_PRICE_BOOK;

const ANCHORED_SHAPES_IN_ORDER: readonly AnchoredShape[] = [
  "anchored-width",
  "anchored-width-and-door-leaves",
  "anchored-width-and-height",
  "anchored-width-height-and-door-leaves",
];

export const FIXTURE_ANCHOR_WIDTH_MM = 600;
export const FIXTURE_ANCHOR_HEIGHT_MM = 700;
export const PER_SIZE_WIDTHS_MM = [400, 600, 800] as const;

function anchoredFormulaOf(
  shape: AnchoredShape,
  anchorMinor: number,
): AnchoredFormula {
  const readsDoors = shape.includes("door-leaves");
  const readsHeight = shape.includes("height");
  return {
    shape,
    anchorWidthMm: FIXTURE_ANCHOR_WIDTH_MM,
    anchorMinor,
    perStepWiderMinor: 8_000,
    perStepNarrowerMinor: 6_000,
    ...(readsDoors ? { perExtraDoorLeafMinor: 20_000 } : {}),
    ...(readsHeight
      ? { anchorHeightMm: FIXTURE_ANCHOR_HEIGHT_MM, perHeightStepMinor: 3_000 }
      : {}),
  };
}

function percentageRules(): readonly CabinetPriceRule[] {
  let manufacturerIndex = 0;
  return SAMPLE_PRICE_BOOK.cabinetRules.map((rule) => {
    if (rule.suppliedBy === "customer") return rule;
    const index = manufacturerIndex++;
    const anchorMinor = 100_000 + index * 10_000;
    const shape = ANCHORED_SHAPES_IN_ORDER[index % 4] ?? "anchored-width";
    const formula =
      index === 4
        ? {
            shape: "price-per-size" as const,
            sizes: PER_SIZE_WIDTHS_MM.map((widthMm, step) => ({
              widthMm,
              amountMinor: anchorMinor + step * 20_000,
            })),
          }
        : anchoredFormulaOf(shape, anchorMinor);
    return { ...rule, formula };
  });
}

function percentageTiers(): readonly MaterialTier[] {
  const percents = [0, 25, 60];
  return SAMPLE_PRICE_BOOK.material.tiers.map((tier, index) => {
    const { wholeKitchenMinor, ...identity } = tier;
    void wholeKitchenMinor;
    return {
      ...identity,
      percentOfCabinets: percents[index] ?? 0,
    } as unknown as MaterialTier;
  });
}

/** The percentage form: every manufacturer row anchored (all four shapes, a fixed-size row, the rest plain), customer
 *  rows kept, three material tiers (the default at 0 %) and a depth rule. */
export const PERCENTAGE_BOOK: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  cabinetRules: percentageRules(),
  material: {
    defaultTierId: SAMPLE_PRICE_BOOK.material.defaultTierId,
    tiers: percentageTiers(),
  },
  depthRule: { deepCabinetPercent: 15 },
};

export const FIXTURE_BOOKS = [
  { form: "flat", book: FLAT_BOOK },
  { form: "percentage", book: PERCENTAGE_BOOK },
] as const;

export function customerRuleOf(book: PriceBook): CabinetPriceRule {
  const rule = book.cabinetRules.find((row) => row.suppliedBy === "customer");
  if (rule === undefined) throw new Error("the fixture has no customer row");
  return rule;
}

export function perSizeRuleOf(book: PriceBook): CabinetPriceRule {
  const rule = book.cabinetRules.find(
    (row) => row.formula.shape === "price-per-size",
  );
  if (rule === undefined) throw new Error("the fixture has no fixed-size row");
  return rule;
}

export function anchoredRuleReading(
  book: PriceBook,
  shape: AnchoredShape,
): CabinetPriceRule {
  const rule = book.cabinetRules.find((row) => row.formula.shape === shape);
  if (rule === undefined) throw new Error(`the fixture has no ${shape} row`);
  return rule;
}

export type SlotPath = readonly (string | number)[];

export type SlotUnit = "amount" | "percent" | "flag";

export interface EditSlot {
  readonly path: SlotPath;
  readonly address: BookFieldAddress;
  readonly unit: SlotUnit;
  readonly maxValue: number;
  readonly arm: string;
}

const CABINET_KEYS = [
  "anchorMinor",
  "perStepWiderMinor",
  "perStepNarrowerMinor",
  "perExtraDoorLeafMinor",
  "perHeightStepMinor",
] as const;

export const SLOT_AMOUNT_CEILING = 1_000_000_000;

function amountSlot(
  path: SlotPath,
  address: BookFieldAddress,
  arm: string,
): EditSlot {
  return { path, address, unit: "amount", maxValue: SLOT_AMOUNT_CEILING, arm };
}

function cabinetSlots(rule: CabinetPriceRule, index: number): EditSlot[] {
  if (rule.suppliedBy === "customer") return [];
  const formula = rule.formula as unknown as Record<string, unknown>;
  if (formula["shape"] === "price-per-size") {
    return (formula["sizes"] as { widthMm: number }[]).map((size, at) =>
      amountSlot(
        ["cabinetRules", index, "formula", "sizes", at, "amountMinor"],
        { kind: "cabinet-size", ruleId: rule.ruleId, widthMm: size.widthMm },
        "cabinet-size",
      ),
    );
  }
  return CABINET_KEYS.filter((key) => typeof formula[key] === "number").map(
    (field) =>
      amountSlot(
        ["cabinetRules", index, "formula", field],
        { kind: "cabinet", ruleId: rule.ruleId, field },
        `cabinet.${String(formula["shape"])}`,
      ),
  );
}

/** Every editable field of a book, found by walking its JSON: the oracle's own enumeration. */
export function editSlotsOf(book: PriceBook): readonly EditSlot[] {
  const hardware = book.hardware.tiers.flatMap((tier, index) =>
    Object.keys(tier)
      .filter((key) => /^per[A-Za-z]+Minor$/.test(key))
      .map((field) =>
        amountSlot(
          ["hardware", "tiers", index, field],
          {
            kind: "hardware",
            tierId: tier.tierId,
            field: field as "perHingeMinor",
          },
          "hardware",
        ),
      ),
  );
  const materials = book.material.tiers.flatMap((tier, index): EditSlot[] =>
    tier.tierId !== book.material.defaultTierId && "percentOfCabinets" in tier
      ? [
          {
            path: ["material", "tiers", index, "percentOfCabinets"],
            address: {
              kind: "material",
              tierId: tier.tierId,
              field: "percentOfCabinets",
            },
            unit: "percent",
            maxValue: MAX_MATERIAL_PERCENT,
            arm: "material",
          },
        ]
      : [],
  );
  const depth: EditSlot[] =
    book.depthRule === undefined
      ? []
      : [
          {
            path: ["depthRule", "deepCabinetPercent"],
            address: { kind: "depth-rule" },
            unit: "percent",
            maxValue: MAX_DEEP_CABINET_PERCENT,
            arm: "depth-rule",
          },
        ];
  const accessories = (["sinkProtectiveCover", "dishDryingRack"] as const).map(
    (accessoryId) =>
      amountSlot(
        ["accessories", accessoryId, "perUnitMinor"],
        { kind: "accessory", accessoryId, field: "perUnitMinor" },
        "accessory",
      ),
  );
  const provisional: EditSlot = {
    path: ["amountsProvisional"],
    address: { kind: "provisional" },
    unit: "flag",
    maxValue: 1,
    arm: "provisional",
  };
  return [
    ...book.cabinetRules.flatMap(cabinetSlots),
    ...hardware,
    ...materials,
    ...depth,
    ...accessories,
    provisional,
  ];
}

export function valueForSeed(slot: EditSlot, seed: number): number | boolean {
  if (slot.unit === "flag") return seed % 2 === 0;
  return seed % (slot.maxValue + 1);
}

/** What the book holds at a slot's path. */
export function valueAt(book: PriceBook, slot: EditSlot): number | boolean {
  let node: unknown = book;
  for (const key of slot.path) {
    node = (node as Record<string | number, unknown>)[key];
  }
  return node as number | boolean;
}

/** A value that differs from what the book holds at the slot and stays inside the slot's range. */
export function otherValueAt(
  book: PriceBook,
  slot: EditSlot,
): number | boolean {
  const current = valueAt(book, slot);
  if (typeof current === "boolean") return !current;
  return current >= slot.maxValue ? current - 1 : current + 1;
}

export interface SlotEdit {
  readonly slot: EditSlot;
  readonly value: number | boolean;
}

/** A deep copy of `book` with each edit written at its path, later edits over earlier. Writes JSON, not the module. */
export function setSlots(
  book: PriceBook,
  edits: readonly SlotEdit[],
): PriceBook {
  const copy = JSON.parse(JSON.stringify(book)) as PriceBook;
  for (const { slot, value } of edits) writeAtPath(copy, slot.path, value);
  return copy;
}

function writeAtPath(
  root: unknown,
  path: SlotPath,
  value: number | boolean,
): void {
  const parent = path
    .slice(0, -1)
    .reduce<unknown>(
      (node, key) => (node as Record<string | number, unknown>)[key],
      root,
    ) as Record<string | number, unknown>;
  const last = path[path.length - 1];
  if (last === undefined) throw new Error("an empty path");
  parent[last] = value;
}

export function changeOf(edit: SlotEdit, groupId?: string): DraftChange {
  return {
    address: edit.slot.address,
    value: edit.value,
    ...(groupId === undefined ? {} : { groupId }),
  } as DraftChange;
}

/** Freezes a book and everything under it, so a write to the input of a pure function throws. */
export function deepFreeze<Value>(value: Value): Value {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const member of Object.values(value)) deepFreeze(member);
  }
  return value;
}
