// Generator and editing oracle for the M1 adversarial QA. Written from plan §8.4 (a) and (b), not from the module under
// test and not from `change-set-books.ts`: the enumeration of editable fields below spells every field name out, finds
// customer-supplied rows by their own flag and the default material tier by its own id, and writes an edit by JSON path.
// Books vary in structure (which rules exist, each rule's shape, size lists, which tiers exist, which tier is the
// default), not only in value. Since the P3 cut-over every book is percentage-form with a depth rule: a book that
// states neither is one the parser refuses, so the generator no longer makes one.
import { fc } from "@fast-check/vitest";

import type {
  BookFieldAddress,
  DraftChange,
} from "../../src/price-dashboard/book-field-address.js";
import { MAX_PRICE_COEFFICIENT_MINOR } from "../../src/pricing/book-reading.js";
import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

export const MAX_AMOUNT = MAX_PRICE_COEFFICIENT_MINOR;
export const MAX_MATERIAL = 200;
export const MAX_DEPTH = 100;

type Json = Record<string, unknown>;
export type Path = readonly (string | number)[];
export type SlotUnit = "amount" | "percent" | "flag";

export interface Slot {
  readonly address: BookFieldAddress;
  /** Equal for equal addresses, whatever the order a book states them in. */
  readonly key: string;
  readonly path: Path;
  readonly unit: SlotUnit;
  readonly max: number;
  /** The kind of field, finer for a cabinet price (the shape of its formula), for a floor per arm. */
  readonly arm: string;
}

const SAMPLE_JSON = JSON.parse(JSON.stringify(SAMPLE_PRICE_BOOK)) as Json;
const SAMPLE_RULES = SAMPLE_JSON["cabinetRules"] as Json[];
const MANUFACTURER_INDEXES = SAMPLE_RULES.flatMap((rule, index) =>
  rule["suppliedBy"] === "customer" ? [] : [index],
);

const CABINET_FIELDS = [
  "anchorMinor",
  "perStepWiderMinor",
  "perStepNarrowerMinor",
  "perExtraDoorLeafMinor",
  "perHeightStepMinor",
] as const;
const HARDWARE_FIELDS = [
  "perHingeMinor",
  "perDrawerMinor",
  "perPushToOpenMinor",
  "perLiftMinor",
] as const;
const ACCESSORY_IDS = ["sinkProtectiveCover", "dishDryingRack"] as const;

function at(node: unknown, key: string | number): unknown {
  return (node as Record<string | number, unknown>)[key];
}

/** The identity of an address, whatever order its members were written in. */
export function addressKeyOf(address: BookFieldAddress): string {
  return Object.entries(address)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([member, value]) => `${member}=${String(value)}`)
    .join("|");
}

function slot(
  address: BookFieldAddress,
  path: Path,
  unit: SlotUnit,
  max: number,
  arm: string = address.kind,
): Slot {
  return { address, key: addressKeyOf(address), path, unit, max, arm };
}

function cabinetSlots(rule: Json, index: number): Slot[] {
  if (rule["suppliedBy"] === "customer") return [];
  const ruleId = rule["ruleId"] as string;
  const formula = rule["formula"] as Json;
  const base: Path = ["cabinetRules", index, "formula"];
  if (formula["shape"] === "price-per-size") {
    return (formula["sizes"] as Json[]).map((size, position) =>
      slot(
        { kind: "cabinet-size", ruleId, widthMm: size["widthMm"] as number },
        [...base, "sizes", position, "amountMinor"],
        "amount",
        MAX_AMOUNT,
      ),
    );
  }
  if (!("anchorWidthMm" in formula)) return [];
  return CABINET_FIELDS.filter((field) => field in formula).map((field) =>
    slot(
      { kind: "cabinet", ruleId, field },
      [...base, field],
      "amount",
      MAX_AMOUNT,
      `cabinet.${String(formula["shape"])}`,
    ),
  );
}

function hardwareSlots(book: Json): Slot[] {
  const tiers = (book["hardware"] as Json)["tiers"] as Json[];
  return tiers.flatMap((tier, index) =>
    HARDWARE_FIELDS.filter((field) => field in tier).map((field) =>
      slot(
        { kind: "hardware", tierId: tier["tierId"] as string, field },
        ["hardware", "tiers", index, field],
        "amount",
        MAX_AMOUNT,
      ),
    ),
  );
}

function materialSlots(book: Json): Slot[] {
  const material = book["material"] as Json;
  const tiers = material["tiers"] as Json[];
  return tiers.flatMap((tier, index) =>
    "percentOfCabinets" in tier && tier["tierId"] !== material["defaultTierId"]
      ? [
          slot(
            {
              kind: "material",
              tierId: tier["tierId"] as string,
              field: "percentOfCabinets",
            },
            ["material", "tiers", index, "percentOfCabinets"],
            "percent",
            MAX_MATERIAL,
          ),
        ]
      : [],
  );
}

/** Every field a change of the applied kinds may set in this book, found by walking its JSON. */
export function slotsOf(book: PriceBook): readonly Slot[] {
  const json = book as unknown as Json;
  const rules = json["cabinetRules"] as Json[];
  const depth: Slot[] =
    "depthRule" in json && json["depthRule"] !== undefined
      ? [
          slot(
            { kind: "depth-rule" },
            ["depthRule", "deepCabinetPercent"],
            "percent",
            MAX_DEPTH,
          ),
        ]
      : [];
  const accessories = ACCESSORY_IDS.map((accessoryId) =>
    slot(
      { kind: "accessory", accessoryId, field: "perUnitMinor" },
      ["accessories", accessoryId, "perUnitMinor"],
      "amount",
      MAX_AMOUNT,
    ),
  );
  return [
    ...rules.flatMap(cabinetSlots),
    ...hardwareSlots(json),
    ...materialSlots(json),
    ...depth,
    ...accessories,
    slot({ kind: "provisional" }, ["amountsProvisional"], "flag", 1),
  ];
}

export function valueAt(book: PriceBook, found: Slot): number | boolean {
  return found.path.reduce<unknown>(at, book) as number | boolean;
}

export interface Edit {
  readonly slot: Slot;
  readonly value: number | boolean;
}

/** A deep copy of `book` with each edit written at its path, later over earlier. */
export function written(book: PriceBook, edits: readonly Edit[]): PriceBook {
  const copy = JSON.parse(JSON.stringify(book)) as PriceBook;
  for (const { slot: target, value } of edits) {
    const parent = target.path.slice(0, -1).reduce<unknown>(at, copy) as Json;
    parent[target.path[target.path.length - 1] as string] = value;
  }
  return copy;
}

export function changeFor(edit: Edit, extra: Json = {}): DraftChange {
  return {
    address: edit.slot.address,
    value: edit.value,
    ...extra,
  } as DraftChange;
}

export function cabinetSlotsOf(book: PriceBook): readonly Slot[] {
  return slotsOf(book).filter(
    (found) =>
      found.address.kind === "cabinet" || found.address.kind === "cabinet-size",
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// The generator.

const amountArb = fc.oneof(
  { weight: 6, arbitrary: fc.integer({ min: 0, max: 3_000_000 }) },
  {
    weight: 1,
    arbitrary: fc.constantFrom(0, 1, MAX_AMOUNT - 1, MAX_AMOUNT),
  },
);
const multipleOf50 = (maxSteps: number) =>
  fc.integer({ min: 1, max: maxSteps }).map((steps) => steps * 50);

function anchoredArb(shape: string): fc.Arbitrary<Json> {
  const readsDoors = shape.includes("door-leaves");
  const readsHeight = shape.includes("height");
  return fc
    .record({
      anchorWidthMm: multipleOf50(40),
      anchorMinor: amountArb,
      perStepWiderMinor: amountArb,
      perStepNarrowerMinor: amountArb,
      perExtraDoorLeafMinor: amountArb,
      anchorHeightMm: multipleOf50(40),
      perHeightStepMinor: amountArb,
    })
    .map((fields) => ({
      shape,
      anchorWidthMm: fields.anchorWidthMm,
      anchorMinor: fields.anchorMinor,
      perStepWiderMinor: fields.perStepWiderMinor,
      perStepNarrowerMinor: fields.perStepNarrowerMinor,
      ...(readsDoors
        ? { perExtraDoorLeafMinor: fields.perExtraDoorLeafMinor }
        : {}),
      ...(readsHeight
        ? {
            anchorHeightMm: fields.anchorHeightMm,
            perHeightStepMinor: fields.perHeightStepMinor,
          }
        : {}),
    }));
}

const perSizeArb: fc.Arbitrary<Json> = fc
  .uniqueArray(fc.integer({ min: 1, max: 30 }), {
    minLength: 1,
    maxLength: 6,
  })
  .chain((steps) =>
    fc
      .array(amountArb, { minLength: steps.length, maxLength: steps.length })
      .map((amounts) => ({
        shape: "price-per-size",
        sizes: [...steps]
          .sort((left, right) => left - right)
          .map((step, position) => ({
            widthMm: step * 50,
            amountMinor: amounts[position] ?? 0,
          })),
      })),
  );

const formulaArb: fc.Arbitrary<Json> = fc.oneof(
  anchoredArb("anchored-width"),
  anchoredArb("anchored-width-and-door-leaves"),
  anchoredArb("anchored-width-and-height"),
  anchoredArb("anchored-width-height-and-door-leaves"),
  perSizeArb,
);

const hardwareTierArb = fc.record({
  perHingeMinor: amountArb,
  perDrawerMinor: amountArb,
  perPushToOpenMinor: amountArb,
  perLiftMinor: fc.option(amountArb, { nil: undefined }),
});

export interface BookPlan {
  readonly keptManufacturerRules: readonly number[];
  readonly formulas: readonly Json[];
  readonly keptHardware: readonly number[];
  readonly hardwareRates: readonly Json[];
  readonly hardwareDefault: number;
  readonly keptMaterials: readonly number[];
  readonly materialPercents: readonly number[];
  readonly materialDefault: number;
  readonly depthPercent: number;
  readonly sinkCover: number;
  readonly dryingRack: number;
  readonly isProvisional: boolean;
}

const planArb: fc.Arbitrary<BookPlan> = fc.record({
  keptManufacturerRules: fc.subarray(MANUFACTURER_INDEXES, { minLength: 2 }),
  formulas: fc.array(formulaArb, {
    minLength: MANUFACTURER_INDEXES.length,
    maxLength: MANUFACTURER_INDEXES.length,
  }),
  keptHardware: fc.subarray([0, 1, 2], { minLength: 1 }),
  hardwareRates: fc.array(hardwareTierArb, { minLength: 3, maxLength: 3 }),
  hardwareDefault: fc.nat(2),
  keptMaterials: fc.subarray([0, 1, 2], { minLength: 1 }),
  materialPercents: fc.array(fc.integer({ min: 0, max: MAX_MATERIAL }), {
    minLength: 3,
    maxLength: 3,
  }),
  materialDefault: fc.nat(2),
  depthPercent: fc.integer({ min: 0, max: MAX_DEPTH }),
  sinkCover: amountArb,
  dryingRack: amountArb,
  isProvisional: fc.boolean(),
});

function dropUndefined(record: Json): Json {
  return Object.fromEntries(
    Object.entries(record).filter(([, member]) => member !== undefined),
  );
}

function rulesOf(plan: BookPlan): Json[] {
  return SAMPLE_RULES.flatMap((rule, index) => {
    if (rule["suppliedBy"] === "customer") return [rule];
    const position = MANUFACTURER_INDEXES.indexOf(index);
    if (!plan.keptManufacturerRules.includes(index)) return [];
    return [{ ...rule, formula: plan.formulas[position] }];
  });
}

function hardwareOf(plan: BookPlan): Json {
  const sampleTiers = (SAMPLE_JSON["hardware"] as Json)["tiers"] as Json[];
  const tiers = plan.keptHardware.map((index) => ({
    ...must(sampleTiers[index]),
    ...dropUndefined(must(plan.hardwareRates[index])),
  }));
  const defaultSource = must(
    plan.keptHardware[plan.hardwareDefault % plan.keptHardware.length],
  );
  return {
    defaultTierId: must(sampleTiers[defaultSource])["tierId"],
    tiers,
  };
}

function materialOf(plan: BookPlan): Json {
  const sampleTiers = (SAMPLE_JSON["material"] as Json)["tiers"] as Json[];
  const defaultSource = must(
    plan.keptMaterials[plan.materialDefault % plan.keptMaterials.length],
  );
  const tiers = plan.keptMaterials.map((index) => {
    const { wholeKitchenMinor, ...identity } = must(sampleTiers[index]);
    void wholeKitchenMinor;
    return {
      ...identity,
      percentOfCabinets:
        index === defaultSource ? 0 : (plan.materialPercents[index] ?? 0),
    };
  });
  return {
    defaultTierId: must(sampleTiers[defaultSource])["tierId"],
    tiers,
  };
}

function bookOf(plan: BookPlan): Json {
  const accessories = SAMPLE_JSON["accessories"] as Json;
  return {
    ...SAMPLE_JSON,
    amountsProvisional: plan.isProvisional,
    cabinetRules: rulesOf(plan),
    hardware: hardwareOf(plan),
    material: materialOf(plan),
    depthRule: { deepCabinetPercent: plan.depthPercent },
    accessories: {
      sinkProtectiveCover: {
        ...(accessories["sinkProtectiveCover"] as Json),
        perUnitMinor: plan.sinkCover,
      },
      dishDryingRack: {
        ...(accessories["dishDryingRack"] as Json),
        perUnitMinor: plan.dryingRack,
      },
    },
  };
}

/** A book as the parser returns it, so `applyChanges` (which re-parses) has nothing to normalise. */
export function parsedBookOf(plan: BookPlan): PriceBook {
  const parsed = parsePriceBook(bookOf(plan));
  if (!parsed.ok) {
    throw new Error(
      `the generator made a book the parser refuses: ${JSON.stringify(parsed.failure)}`,
    );
  }
  return parsed.book;
}

export const bookArb: fc.Arbitrary<PriceBook> = planArb.map(parsedBookOf);

type ValuePick = "zero" | "one" | "max-1" | "max" | "mid";
const valuePickArb = fc.constantFrom<ValuePick>(
  "zero",
  "one",
  "max-1",
  "max",
  "mid",
  "mid",
  "mid",
);

export function valueFor(
  found: Slot,
  pick: ValuePick,
  seed: number,
): number | boolean {
  if (found.unit === "flag") return seed % 2 === 0;
  const picked: Record<ValuePick, number> = {
    zero: 0,
    one: 1,
    "max-1": found.max - 1,
    max: found.max,
    mid: seed % (found.max + 1),
  };
  return picked[pick];
}

/** Edits of random slots of `book`; the same slot may be drawn twice. */
export function editsArb(
  book: PriceBook,
  size: { readonly min: number; readonly max: number },
): fc.Arbitrary<readonly Edit[]> {
  const slots = slotsOf(book);
  return fc
    .array(
      fc.record({
        index: fc.nat(slots.length - 1),
        pick: valuePickArb,
        seed: fc.nat(2_147_483_647),
      }),
      { minLength: size.min, maxLength: size.max },
    )
    .map((drawn) =>
      drawn.map(({ index, pick, seed }) => {
        const target = must(slots[index]);
        return { slot: target, value: valueFor(target, pick, seed) };
      }),
    );
}

/** A book with a list of edits, the usual unit of a property. */
export const bookWithEditsArb: fc.Arbitrary<{
  readonly book: PriceBook;
  readonly edits: readonly Edit[];
}> = bookArb.chain((book) =>
  editsArb(book, { min: 0, max: 12 }).map((edits) => ({ book, edits })),
);

/** The edits with the later of any two on one address kept, in the order they last appear. */
export function lastWins(edits: readonly Edit[]): readonly Edit[] {
  return edits.filter(
    (edit, index) =>
      !edits.slice(index + 1).some((later) => later.slot.key === edit.slot.key),
  );
}

export const PROPERTY_RUNS = 300;
export const PROPERTY_SEED = 20261027;

const FIXED_FORMULAS: readonly Json[] = [
  {
    shape: "anchored-width",
    anchorWidthMm: 600,
    anchorMinor: 100_000,
    perStepWiderMinor: 8_000,
    perStepNarrowerMinor: 6_000,
  },
  {
    shape: "anchored-width-and-door-leaves",
    anchorWidthMm: 600,
    anchorMinor: 120_000,
    perStepWiderMinor: 8_000,
    perStepNarrowerMinor: 6_000,
    perExtraDoorLeafMinor: 20_000,
  },
  {
    shape: "anchored-width-and-height",
    anchorWidthMm: 600,
    anchorMinor: 140_000,
    perStepWiderMinor: 8_000,
    perStepNarrowerMinor: 6_000,
    anchorHeightMm: 700,
    perHeightStepMinor: 3_000,
  },
  {
    shape: "anchored-width-height-and-door-leaves",
    anchorWidthMm: 600,
    anchorMinor: 160_000,
    perStepWiderMinor: 8_000,
    perStepNarrowerMinor: 6_000,
    perExtraDoorLeafMinor: 20_000,
    anchorHeightMm: 700,
    perHeightStepMinor: 3_000,
  },
  {
    shape: "price-per-size",
    sizes: [
      { widthMm: 400, amountMinor: 90_000 },
      { widthMm: 600, amountMinor: 110_000 },
      { widthMm: 800, amountMinor: 130_000 },
    ],
  },
];

/** A fixed plan: every rule kept, the five formulas in turn, all three tiers of each group, the default material
 *  tier at 0 % and the others at 25 % and 60 %. Hand-written, so no property depends on the generator. */
export function fixedPlan(): BookPlan {
  return {
    keptManufacturerRules: MANUFACTURER_INDEXES,
    formulas: MANUFACTURER_INDEXES.map((_, position) =>
      must(FIXED_FORMULAS[position % FIXED_FORMULAS.length]),
    ),
    keptHardware: [0, 1, 2],
    hardwareRates: [0, 1, 2].map((index) => ({
      perHingeMinor: 1_000 + index,
      perDrawerMinor: 60_000 + index,
      perPushToOpenMinor: 4_000 + index,
      perLiftMinor: undefined,
    })),
    hardwareDefault: 0,
    keptMaterials: [0, 1, 2],
    materialPercents: [0, 25, 60],
    materialDefault: 0,
    depthPercent: 15,
    sinkCover: 20_000,
    dryingRack: 40_000,
    isProvisional: true,
  };
}

export function fixedBook(): PriceBook {
  return parsedBookOf(fixedPlan());
}

/** The value, or a thrown error: for a lookup the test has already made certain of. */
export function must<Value>(value: Value | undefined): Value {
  if (value === undefined)
    throw new Error("a lookup the test relies on found nothing");
  return value;
}
