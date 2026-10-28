// Adversarial QA for wave P3, the pricing cut-over (ADR 0177 A-1, A-2, A-3, A-6, A-7; M10 criteria P3-a to P3-c).
//
// `sample-cut-over-parity.test.ts` holds the converted sample book to the retired one at the catalogue's listed widths.
// This file goes where it does not: every whole millimetre a row can be built at and every height a flexible row can
// take, the seeded kitchen line by line, the depth line at both depths over every subset of the seeded kitchen, the
// material and depth composition against an oracle written from A-1 alone, and the books the cut-over turned from
// valid to invalid. The retired coefficients are restated here as data and evaluated by code of this file's own: nothing
// below imports a formula, a rounding or a step from `src/pricing`.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  INSERTABLE_BODY_DEFINITIONS,
  resolveCatalogEquivalent,
  resolveWidthRangesMm,
  toInsertableBody,
} from "../../src/catalog.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { measureDeepeningRows } from "../../src/pricing/deepening-rows.js";
import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import type {
  CabinetPriceLine,
  PricedDesign,
} from "../../src/pricing/price-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import { roundedToTenLei } from "../support/line-amounts.js";

const SHALLOW_MM = 600;
const DEEP_MM = 700;
const STEP_MM = 50;

// ---------------------------------------------------------------------------------------------------------------
// The retired book, as data, and the oracle that evaluates it.
// ---------------------------------------------------------------------------------------------------------------

interface RetiredLinearRule {
  readonly baseMinor: number;
  readonly perWidthMillimetreMinor: number;
  readonly perHeightMillimetreMinor?: number;
  readonly perDoorLeafMinor?: number;
}

/** The retired sample book's rules, transcribed from `b8ef4118:sample-price-book.ts`. A flat row has no width term. */
const RETIRED: Readonly<Record<string, RetiredLinearRule>> = {
  "base-cabinet": {
    baseMinor: 120_000,
    perWidthMillimetreMinor: 400,
    perDoorLeafMinor: 18_000,
  },
  "base-3drawer": { baseMinor: 180_000, perWidthMillimetreMinor: 500 },
  "base-panbank": { baseMinor: 160_000, perWidthMillimetreMinor: 480 },
  "base-hob-2drawer": { baseMinor: 350_000, perWidthMillimetreMinor: 0 },
  "base-hob-oven": { baseMinor: 420_000, perWidthMillimetreMinor: 0 },
  "base-bottle-cargo": { baseMinor: 90_000, perWidthMillimetreMinor: 450 },
  "base-sink": { baseMinor: 150_000, perWidthMillimetreMinor: 420 },
  "base-dishwasher": { baseMinor: 140_000, perWidthMillimetreMinor: 300 },
  "wall-cabinet": {
    baseMinor: 40_000,
    perWidthMillimetreMinor: 300,
    perHeightMillimetreMinor: 70,
    perDoorLeafMinor: 14_000,
  },
  "wall-lift": {
    baseMinor: 70_000,
    perWidthMillimetreMinor: 350,
    perHeightMillimetreMinor: 100,
  },
  "open-shelf": {
    baseMinor: 30_000,
    perWidthMillimetreMinor: 200,
    perHeightMillimetreMinor: 50,
  },
  "tall-pantry": {
    baseMinor: 300_000,
    perWidthMillimetreMinor: 700,
    perDoorLeafMinor: 22_000,
  },
  "tall-oven-tower": { baseMinor: 900_000, perWidthMillimetreMinor: 0 },
  "tall-fridge-housing": { baseMinor: 700_000, perWidthMillimetreMinor: 0 },
};

/** The six structural corners, flat in the retired book, priced under their own ids at the one width each is made. */
const RETIRED_CORNER_MINOR: Readonly<Record<string, number>> = {
  "base-corner-x-900": 400_000,
  "base-corner-return-320": 120_000,
  "wall-corner-return-570": 160_000,
  "wall-corner-return-570-top": 90_000,
  "wall-corner-x-900": 160_000,
  "wall-corner-x-900-top": 90_000,
};

/** What the rows the customer supplies cost: nothing. */
const CUSTOMER_ROWS = ["hood", "fridge-free"] as const;

const TWO_DOOR_FROM_MM = 500;

/** The leaves a row's width gives a body: one below 500 mm and two from it, per stacked band (ADR 0035 decision 4;
 *  the pantry has two bands). Restated, so the oracle does not ask the catalogue. */
function leavesAt(buildId: string, widthMm: number): number {
  const perBand = widthMm >= TWO_DOOR_FROM_MM ? 2 : 1;
  return buildId === "tall-pantry" ? 2 * perBand : perBand;
}

function roundedUpToStep(millimetres: number): number {
  return Math.ceil(millimetres / STEP_MM) * STEP_MM;
}

/** The retired rule's exact amount for a body, with the width and height taken at the step a body prices at. */
function exactAmountOf(
  buildId: string,
  body: { readonly widthMm: number; readonly heightMm: number },
): number {
  const rule = RETIRED[buildId];
  if (rule === undefined) throw new Error(`no retired rule for "${buildId}"`);
  return (
    rule.baseMinor +
    rule.perWidthMillimetreMinor * roundedUpToStep(body.widthMm) +
    (rule.perHeightMillimetreMinor ?? 0) * roundedUpToStep(body.heightMm) +
    (rule.perDoorLeafMinor ?? 0) * leavesAt(buildId, body.widthMm)
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Pricing helpers.
// ---------------------------------------------------------------------------------------------------------------

function designAt(
  depthMm: number,
  placements: readonly DesignPlacement[],
): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: [...placements],
    settings: { ...KITCHEN_L_DESIGN.settings, cabinetDepthMm: depthMm },
  };
}

function priceAt(
  depthMm: number,
  placements: readonly DesignPlacement[],
  options: {
    readonly book?: PriceBook;
    readonly materialTierId?: string;
    readonly deepeningRows?: ReadonlySet<string>;
  } = {},
): PricedDesign {
  const book = options.book ?? SAMPLE_PRICE_BOOK;
  const result = priceDesign({
    design: designAt(depthMm, placements),
    catalog: buildKitchenLBodyCatalog(depthMm),
    book,
    pricingVersion: book.version,
    selections: { materialTierId: options.materialTierId },
    deepeningRows: options.deepeningRows ?? MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
  });
  if (!result.ok) {
    throw new Error(`${result.failure.code}: ${result.failure.detail}`);
  }
  return result.priced;
}

function soloOf(
  buildId: string,
  widthMm: number,
  heightMm: number,
): readonly DesignPlacement[] {
  return [
    {
      id: "x",
      wall: "A",
      alongMm: 1300,
      y0Mm: 0,
      body: { buildId, widthMm, heightMm },
    },
  ];
}

function cabinetLinesOf(priced: PricedDesign): readonly CabinetPriceLine[] {
  return priced.lines.filter(
    (line): line is CabinetPriceLine => line.kind === "cabinet",
  );
}

function soloAmount(
  buildId: string,
  widthMm: number,
  heightMm: number,
): number {
  const [line] = cabinetLinesOf(
    priceAt(SHALLOW_MM, soloOf(buildId, widthMm, heightMm)),
  );
  if (line === undefined) throw new Error("no cabinet line");
  return line.amountMinor;
}

/** Every whole millimetre a row may be built at, from the catalogue's own ranges. */
function buildableWidthsOf(buildId: string): readonly number[] {
  const definition = buildKitchenLBodyCatalog(SHALLOW_MM).get(buildId);
  if (definition === undefined) throw new Error(`no row ${buildId}`);
  const insertable = toInsertableBody(buildId, definition);
  if (insertable === undefined) throw new Error(`${buildId} is not insertable`);
  const widths = new Set<number>();
  for (const range of resolveWidthRangesMm(insertable)) {
    for (let widthMm = range.minMm; widthMm <= range.maxMm; widthMm += 1) {
      widths.add(widthMm);
    }
  }
  return [...widths].sort((a, b) => a - b);
}

const INSERTABLE_IDS = INSERTABLE_BODY_DEFINITIONS.map(([buildId]) => buildId);
const CATALOGUE = buildKitchenLBodyCatalog(SHALLOW_MM);

function nominalHeightOf(buildId: string): number {
  return CATALOGUE.get(buildId)?.nominalHeightMm ?? 700;
}

function isHeightFlexible(buildId: string): boolean {
  return CATALOGUE.get(buildId)?.heightFlex === true;
}

// ---------------------------------------------------------------------------------------------------------------
// 1. Parity with the retired book, at every width and height the catalogue builds.
// ---------------------------------------------------------------------------------------------------------------

describe("P3 parity: every cabinet price is the retired price at its step, to ten lei, at every width a row is built at", () => {
  it("covers every insertable manufacturer row, so no row is left out of the sweep", () => {
    const manufacturerRows = INSERTABLE_IDS.filter(
      (buildId) => !(CUSTOMER_ROWS as readonly string[]).includes(buildId),
    );

    expect([...manufacturerRows].sort()).toEqual(Object.keys(RETIRED).sort());
    expect(INSERTABLE_IDS).toHaveLength(16);
  });

  it.each(Object.keys(RETIRED))(
    "%s: the line is the retired amount at the width rounded up to 50 mm, with the leaves of the width as built, at every whole millimetre",
    (buildId) => {
      const heightMm = nominalHeightOf(buildId);
      const disagreements: string[] = [];

      for (const widthMm of buildableWidthsOf(buildId)) {
        const expected = roundedToTenLei(
          exactAmountOf(buildId, { widthMm, heightMm }),
        );
        const actual = soloAmount(buildId, widthMm, heightMm);
        if (actual !== expected) {
          disagreements.push(
            `${String(widthMm)} mm: wanted ${String(expected)}, got ${String(actual)}`,
          );
        }
      }

      expect(disagreements.slice(0, 5)).toEqual([]);
    },
  );

  it.each(Object.keys(RETIRED).filter(isHeightFlexible))(
    "%s: every whole millimetre of height from 250 to 1100 prices at the retired height term of its step, at 600 and at 450 mm wide",
    (buildId) => {
      const disagreements: string[] = [];
      for (const widthMm of [600, 450]) {
        for (let heightMm = 250; heightMm <= 1_100; heightMm += 1) {
          const expected = roundedToTenLei(
            exactAmountOf(buildId, { widthMm, heightMm }),
          );
          const actual = soloAmount(buildId, widthMm, heightMm);
          if (actual !== expected) {
            disagreements.push(
              `${String(widthMm)}x${String(heightMm)}: wanted ${String(expected)}, got ${String(actual)}`,
            );
          }
        }
      }

      expect(disagreements.slice(0, 5)).toEqual([]);
    },
  );

  it("an on-grid body costs exactly its retired price: no row's conversion moved a figure at a width the step reaches", () => {
    // The off-grid claim above restates the rounding; this one does not round at all, so it cannot agree with a wrong
    // step by sharing it. A 50 mm multiple is priced at its own retired linear amount.
    for (const buildId of Object.keys(RETIRED)) {
      const heightMm = nominalHeightOf(buildId);
      for (const widthMm of buildableWidthsOf(buildId).filter(
        (w) => w % STEP_MM === 0,
      )) {
        const rule = RETIRED[buildId];
        if (rule === undefined) throw new Error("unreachable");
        const linear =
          rule.baseMinor +
          rule.perWidthMillimetreMinor * widthMm +
          (rule.perHeightMillimetreMinor ?? 0) * heightMm +
          (rule.perDoorLeafMinor ?? 0) * leavesAt(buildId, widthMm);
        expect(
          soloAmount(buildId, widthMm, heightMm),
          `${buildId} ${String(widthMm)}`,
        ).toBe(roundedToTenLei(linear));
      }
    }
  });

  it.each(Object.entries(RETIRED_CORNER_MINOR))(
    "the structural corner %s still costs its retired amount at the width it is made",
    (buildId, retiredMinor) => {
      const widthMm = Number(/-(\d+)(?:-top)?$/.exec(buildId)?.[1]);

      expect(soloAmount(buildId, widthMm, 700)).toBe(retiredMinor);
    },
  );

  it.each(CUSTOMER_ROWS)(
    "the customer's %s costs nothing at every width and is never charged for",
    (buildId) => {
      for (const widthMm of buildableWidthsOf(buildId)) {
        expect(soloAmount(buildId, widthMm, nominalHeightOf(buildId))).toBe(0);
      }
    },
  );

  it("prices the seeded kitchen's every cabinet at its retired amount, row by row", () => {
    const catalog = buildKitchenLBodyCatalog(SHALLOW_MM);
    const priced = priceAt(SHALLOW_MM, KITCHEN_L_DESIGN.placements);
    const byPlacement = new Map(
      cabinetLinesOf(priced).map((line) => [line.placementId, line]),
    );
    const disagreements: string[] = [];

    for (const placement of KITCHEN_L_DESIGN.placements) {
      const pricedAs =
        resolveCatalogEquivalent(catalog, placement.body.buildId)?.buildId ??
        placement.body.buildId;
      const line = byPlacement.get(placement.id);
      const expected = (CUSTOMER_ROWS as readonly string[]).includes(pricedAs)
        ? 0
        : (RETIRED_CORNER_MINOR[pricedAs] ??
          roundedToTenLei(
            exactAmountOf(pricedAs, {
              widthMm: placement.body.widthMm,
              heightMm: placement.body.heightMm,
            }),
          ));
      if (line?.amountMinor !== expected) {
        disagreements.push(
          `${placement.id} (${placement.body.buildId} as ${pricedAs}, ${String(placement.body.widthMm)}x${String(placement.body.heightMm)}): wanted ${String(expected)}, got ${String(line?.amountMinor)}`,
        );
      }
    }

    expect(disagreements).toEqual([]);
    expect(byPlacement.size).toBe(KITCHEN_L_DESIGN.placements.length);
  });
});

describe("P3 positivity: no buildable manufacturer body prices at or below zero, at either depth", () => {
  it.each(Object.keys(RETIRED))(
    "%s: every whole millimetre of width, at its narrowest and its flexible extremes of height, prices above zero",
    (buildId) => {
      const heights = isHeightFlexible(buildId)
        ? [250, nominalHeightOf(buildId), 1_100]
        : [nominalHeightOf(buildId)];
      for (const depthMm of [SHALLOW_MM, DEEP_MM]) {
        for (const widthMm of buildableWidthsOf(buildId)) {
          for (const heightMm of heights) {
            const [line] = cabinetLinesOf(
              priceAt(depthMm, soloOf(buildId, widthMm, heightMm)),
            );
            expect(
              line?.amountMinor,
              `${buildId} ${String(widthMm)}x${String(heightMm)} at ${String(depthMm)}`,
            ).toBeGreaterThan(0);
          }
        }
      }
    },
  );
});

// ---------------------------------------------------------------------------------------------------------------
// 2. The sample book as the cut-over left it (P3-a), and the books the cut-over turned invalid.
// ---------------------------------------------------------------------------------------------------------------

describe("P3-a: the sample book parses, is provisional, and is percentage-form throughout", () => {
  it("parses, states itself provisional and an estimate, and its default material is the 0 % reference", () => {
    const parsed = parsePriceBook(SAMPLE_PRICE_BOOK);

    expect(parsed.ok).toBe(true);
    expect(SAMPLE_PRICE_BOOK.amountsProvisional).toBe(true);
    expect(SAMPLE_PRICE_BOOK.status).toBe("estimate");
    const reference = SAMPLE_PRICE_BOOK.material.tiers.find(
      (tier) => tier.tierId === SAMPLE_PRICE_BOOK.material.defaultTierId,
    );
    expect(reference?.percentOfCabinets).toBe(0);
  });

  it("states every material as a percentage and none as an amount, and every cabinet as an anchor or a listed size", () => {
    for (const tier of SAMPLE_PRICE_BOOK.material.tiers) {
      expect(Number.isInteger(tier.percentOfCabinets), tier.tierId).toBe(true);
      expect(
        Object.keys(tier).filter((key) => key.endsWith("Minor")),
        tier.tierId,
      ).toEqual([]);
    }
    for (const rule of SAMPLE_PRICE_BOOK.cabinetRules) {
      expect(
        [
          "anchored-width",
          "anchored-width-and-door-leaves",
          "anchored-width-and-height",
          "anchored-width-height-and-door-leaves",
          "price-per-size",
        ],
        rule.ruleId,
      ).toContain(rule.formula.shape);
    }
    expect(
      SAMPLE_PRICE_BOOK.depthRule.deepCabinetPercent,
    ).toBeGreaterThanOrEqual(0);
  });
});

describe("P3: a book of the retired form is not priced", () => {
  const RETIRED_LINEAR_FORMULA = {
    shape: "linear-in-width",
    baseMinor: 100_000,
    perWidthMillimetreMinor: 400,
  };

  /** A book as it was stored before the cut-over: linear shapes, a flat amount per material, no depth rule. */
  function bookStoredBeforeTheCutOver(): PriceBook {
    const withoutDepthRule: {
      -readonly [K in keyof PriceBook]?: PriceBook[K];
    } = structuredClone(SAMPLE_PRICE_BOOK);
    delete withoutDepthRule.depthRule;
    return {
      ...withoutDepthRule,
      cabinetRules: SAMPLE_PRICE_BOOK.cabinetRules.map((rule) => ({
        ...rule,
        formula: RETIRED_LINEAR_FORMULA,
      })),
      material: {
        ...SAMPLE_PRICE_BOOK.material,
        tiers: SAMPLE_PRICE_BOOK.material.tiers.map((tier, index) => {
          const identity: {
            -readonly [K in keyof typeof tier]?: (typeof tier)[K];
          } = { ...tier };
          delete identity.percentOfCabinets;
          return { ...identity, wholeKitchenMinor: index * 900_000 };
        }),
      },
    } as unknown as PriceBook;
  }

  it("is refused by the parser, naming what it lacks, and by the query with the same code and no price", () => {
    const stored = bookStoredBeforeTheCutOver();

    const parsed = parsePriceBook(stored);
    const result = priceDesign({
      design: KITCHEN_L_DESIGN,
      catalog: buildKitchenLBodyCatalog(SHALLOW_MM),
      book: stored,
      pricingVersion: stored.version,
      deepeningRows: MEASURED_DEEPENING_ROWS,
      availability: NOTHING_DISABLED,
    });

    expect(parsed.ok).toBe(false);
    expect(result.ok).toBe(false);
    if (parsed.ok || result.ok) return;
    expect(parsed.failure.code).toBe("INVALID_PRICE_BOOK");
    expect(result.failure.code).toBe("INVALID_PRICE_BOOK");
    expect(result).not.toHaveProperty("priced");
  });

  it("parses a book that keeps a retired linear shape beside the new percentages, and refuses it only where a body needs the rule: a named gap at the book parser", () => {
    // KNOWN GAP, recorded and not endorsed: `parsePriceBook` accepts a formula of a shape this build does not know (a
    // shape is refused when a body is priced, ADR 0062 seam 1), so a book that keeps the retired linear shapes beside
    // the new percentages parses, and would publish if nothing else judged it. The query refuses the first body that
    // reaches such a rule, with the rule and the placement named. This pin flips, loudly, when the book parser (or the
    // M2 judgement against the catalogue) refuses a shape it cannot evaluate.
    const linearBeside: PriceBook = {
      ...SAMPLE_PRICE_BOOK,
      cabinetRules: SAMPLE_PRICE_BOOK.cabinetRules.map((rule) =>
        rule.buildId === "base-cabinet"
          ? ({
              ...rule,
              formula: RETIRED_LINEAR_FORMULA,
            } as unknown as typeof rule)
          : rule,
      ),
    };

    expect(parsePriceBook(linearBeside).ok).toBe(true);
    const result = priceDesign({
      design: designAt(SHALLOW_MM, soloOf("base-cabinet", 600, 820)),
      catalog: buildKitchenLBodyCatalog(SHALLOW_MM),
      book: linearBeside,
      pricingVersion: linearBeside.version,
      deepeningRows: MEASURED_DEEPENING_ROWS,
      availability: NOTHING_DISABLED,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toMatchObject({
      code: "UNKNOWN_FORMULA_SHAPE",
      id: "cabinet.base-cabinet",
      placementId: "x",
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 3. The depth line: which cabinets deepen, when a depth line exists, and what it is.
// ---------------------------------------------------------------------------------------------------------------

describe("P3 deepening rows (A-6): measured from the 600 and 700 catalogues, and every deeper manufacturer row takes the percentage", () => {
  const deep = buildKitchenLBodyCatalog(DEEP_MM);

  it("is every catalogue row but the free-standing fridge: base, tall, hob, sink, corners, wall rows and wall corners alike", () => {
    // The owner's 2026-10-26 ruling: "surcharge every deeper cabinet". A literal tripwire on the catalogue: a row that
    // stops deepening, or one that starts, is a decision and not a drift.
    const measured = measureDeepeningRows(CATALOGUE, deep);
    const notDeeper = [...CATALOGUE.keys()].filter(
      (buildId) => !measured.has(buildId),
    );

    expect(notDeeper.sort()).toEqual(["fridge-free", "fridge-free-700"]);
    for (const row of [
      "wall-cabinet",
      "wall-lift",
      "open-shelf",
      "wall-corner-x-900",
      "wall-corner-return-570",
      "wall-1door-300",
    ]) {
      expect(measured.has(row), row).toBe(true);
    }
  });

  it("is the same set whichever depth is called the shallow one's argument order, never empty and never the whole catalogue", () => {
    expect(MEASURED_DEEPENING_ROWS.size).toBeGreaterThan(0);
    expect(MEASURED_DEEPENING_ROWS.size).toBeLessThan(CATALOGUE.size);
    expect([...measureDeepeningRows(CATALOGUE, CATALOGUE)]).toEqual([]);
    expect([...measureDeepeningRows(deep, CATALOGUE)]).toEqual([]);
  });

  it("gives a depth line at 700 for every manufacturer cabinet that deepens, on its own, and none at 600", () => {
    for (const buildId of Object.keys(RETIRED).concat(
      Object.keys(RETIRED_CORNER_MINOR),
    )) {
      // The widest width the row is built at up to 600 mm: a fixed-size row lists its own sizes, and 600 is not one of
      // every row's.
      const widthMm = Object.hasOwn(RETIRED_CORNER_MINOR, buildId)
        ? Number(/-(\d+)(?:-top)?$/.exec(buildId)?.[1])
        : Math.max(
            ...buildableWidthsOf(buildId).filter((width) => width <= 600),
          );
      const heightMm = nominalHeightOf(buildId);
      const atDeep = priceAt(DEEP_MM, soloOf(buildId, widthMm, heightMm));
      const atShallow = priceAt(SHALLOW_MM, soloOf(buildId, widthMm, heightMm));

      expect(
        atDeep.lines.some((line) => line.kind === "depth"),
        `${buildId} at 700`,
      ).toBe(MEASURED_DEEPENING_ROWS.has(buildId));
      expect(
        atShallow.lines.some((line) => line.kind === "depth"),
        `${buildId} at 600`,
      ).toBe(false);
    }
  });

  it("never gives the customer's own rows an uplift, though the hood deepens: a kitchen of hood and fridge has no depth line at 700", () => {
    expect(MEASURED_DEEPENING_ROWS.has("hood")).toBe(true);
    const priced = priceAt(DEEP_MM, [
      ...soloOf("hood", 600, 700),
      {
        id: "y",
        wall: "A",
        alongMm: 2500,
        y0Mm: 0,
        body: { buildId: "fridge-free", widthMm: 700, heightMm: 1800 },
      },
    ]);

    expect(priced.lines.some((line) => line.kind === "depth")).toBe(false);
    expect(priced.totalMinor).toBe(
      priced.lines.reduce((sum, line) => sum + line.amountMinor, 0),
    );
  });

  const SEEDED_IDS = KITCHEN_L_DESIGN.placements.map(
    (placement) => placement.id,
  );
  const catalogAtShallow = buildKitchenLBodyCatalog(SHALLOW_MM);

  function deepensWhenSupplied(placement: DesignPlacement): boolean {
    const pricedAs =
      resolveCatalogEquivalent(catalogAtShallow, placement.body.buildId)
        ?.buildId ?? placement.body.buildId;
    return (
      !(CUSTOMER_ROWS as readonly string[]).includes(pricedAs) &&
      MEASURED_DEEPENING_ROWS.has(pricedAs)
    );
  }

  propertyTest.prop([fc.subarray(SEEDED_IDS)], { numRuns: 200 })(
    "over every subset of the seeded kitchen, a depth line exists at 700 exactly when a manufacturer cabinet that deepens is in it, and never at 600",
    (ids) => {
      const placements = KITCHEN_L_DESIGN.placements.filter((placement) =>
        ids.includes(placement.id),
      );

      const atDeep = priceAt(DEEP_MM, placements);
      const atShallow = priceAt(SHALLOW_MM, placements);

      expect(atDeep.lines.some((line) => line.kind === "depth")).toBe(
        placements.some(deepensWhenSupplied),
      );
      expect(atShallow.lines.some((line) => line.kind === "depth")).toBe(false);
      // The depth line is one line, and the total is the sum of every line either way.
      expect(
        atDeep.lines.filter((line) => line.kind === "depth").length,
      ).toBeLessThanOrEqual(1);
      expect(atDeep.totalMinor).toBe(
        atDeep.lines.reduce((sum, line) => sum + line.amountMinor, 0),
      );
    },
  );

  it("is no cheaper at 700 than at 600 for any subset, and the difference is the depth line alone (hardware, accessories, cabinets and material do not move)", () => {
    fc.assert(
      fc.property(fc.subarray(SEEDED_IDS), (ids) => {
        const placements = KITCHEN_L_DESIGN.placements.filter((placement) =>
          ids.includes(placement.id),
        );
        const atDeep = priceAt(DEEP_MM, placements, {
          materialTierId: "material.painted-mdf",
        });
        const atShallow = priceAt(SHALLOW_MM, placements, {
          materialTierId: "material.painted-mdf",
        });
        const depth =
          atDeep.lines.find((line) => line.kind === "depth")?.amountMinor ?? 0;

        expect(atDeep.lines.filter((line) => line.kind !== "depth")).toEqual(
          atShallow.lines,
        );
        expect(atDeep.totalMinor - atShallow.totalMinor).toBe(depth);
        expect(depth).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 4. Material x depth, multiplied, on the sample book and the seeded kitchen (A-1).
// ---------------------------------------------------------------------------------------------------------------

describe("P3 material x depth (A-1): each cabinet is carried through three roundings, and the cross term lands in the depth line", () => {
  /** `n / d` to the nearest ten lei, half up, in the integers of this file. */
  function r10(numerator: number, denominator: number): number {
    return (
      Math.floor((numerator + 500 * denominator) / (1_000 * denominator)) *
      1_000
    );
  }

  const catalog = buildKitchenLBodyCatalog(SHALLOW_MM);

  /** The exact amount of each seeded cabinet and whether it deepens at 700, from the retired data. */
  const EXACT = KITCHEN_L_DESIGN.placements.map((placement) => {
    const pricedAs =
      resolveCatalogEquivalent(catalog, placement.body.buildId)?.buildId ??
      placement.body.buildId;
    const isCustomer = (CUSTOMER_ROWS as readonly string[]).includes(pricedAs);
    const exactMinor = isCustomer
      ? 0
      : (RETIRED_CORNER_MINOR[pricedAs] ??
        exactAmountOf(pricedAs, {
          widthMm: placement.body.widthMm,
          heightMm: placement.body.heightMm,
        }));
    return {
      exactMinor,
      deepens: !isCustomer && MEASURED_DEEPENING_ROWS.has(pricedAs),
    };
  });

  it.each(
    SAMPLE_PRICE_BOOK.material.tiers.map(
      (tier) => [tier.tierId, tier.percentOfCabinets] as const,
    ),
  )(
    "%s at 700 mm: the cabinet, material and depth lines are the sums of the three roundings of each cabinet",
    (tierId, materialPercent) => {
      const depthPercent = SAMPLE_PRICE_BOOK.depthRule.deepCabinetPercent;
      const priced = priceAt(DEEP_MM, KITCHEN_L_DESIGN.placements, {
        materialTierId: tierId,
      });

      let cabinets = 0;
      let material = 0;
      let depth = 0;
      for (const { exactMinor, deepens } of EXACT) {
        const c = r10(exactMinor, 1);
        const cm = r10(exactMinor * (100 + materialPercent), 100);
        const cmd = r10(
          exactMinor *
            (100 + materialPercent) *
            (100 + (deepens ? depthPercent : 0)),
          10_000,
        );
        cabinets += c;
        material += cm - c;
        depth += cmd - cm;
      }
      const linesOf = (kind: string) =>
        priced.lines
          .filter((line) => line.kind === kind)
          .reduce((sum, line) => sum + line.amountMinor, 0);

      expect(linesOf("cabinet")).toBe(cabinets);
      expect(linesOf("material")).toBe(material);
      expect(linesOf("depth")).toBe(depth);
      // The kitchen's cabinets, in material and at depth, price as the sum of each cabinet's third stage.
      expect(linesOf("cabinet") + linesOf("material") + linesOf("depth")).toBe(
        EXACT.reduce(
          (sum, { exactMinor, deepens }) =>
            sum +
            r10(
              exactMinor *
                (100 + materialPercent) *
                (100 + (deepens ? depthPercent : 0)),
              10_000,
            ),
          0,
        ),
      );
    },
  );

  it("puts the cross term in the depth line: at a material above the reference the depth line is dearer than at the reference, for the same depth percentage", () => {
    const upgrade = SAMPLE_PRICE_BOOK.material.tiers.find(
      (tier) => tier.percentOfCabinets > 0,
    );
    if (upgrade === undefined)
      throw new Error("the sample has no upgrade tier");
    const depthAt = (tierId: string) =>
      priceAt(DEEP_MM, KITCHEN_L_DESIGN.placements, {
        materialTierId: tierId,
      }).lines.find((line) => line.kind === "depth")?.amountMinor ?? Number.NaN;

    expect(depthAt(upgrade.tierId)).toBeGreaterThan(
      depthAt(SAMPLE_PRICE_BOOK.material.defaultTierId),
    );
  });

  it("leaves hardware and every accessory at their own figures whatever the material and depth", () => {
    const reference = priceAt(SHALLOW_MM, KITCHEN_L_DESIGN.placements);
    for (const tier of SAMPLE_PRICE_BOOK.material.tiers) {
      const priced = priceAt(DEEP_MM, KITCHEN_L_DESIGN.placements, {
        materialTierId: tier.tierId,
      });
      const untouched = (lines: PricedDesign["lines"]) =>
        lines.filter(
          (line) => line.kind === "hardware" || line.kind === "accessory",
        );

      expect(untouched(priced.lines), tier.tierId).toEqual(
        untouched(reference.lines),
      );
    }
  });

  it("answers a 0 % depth rule with a depth line of zero and a 0 % material with a material line of zero, both still present where they apply", () => {
    const flatDepth: PriceBook = {
      ...SAMPLE_PRICE_BOOK,
      depthRule: { deepCabinetPercent: 0 },
    };
    const priced = priceAt(DEEP_MM, KITCHEN_L_DESIGN.placements, {
      book: flatDepth,
    });

    expect(
      priced.lines.find((line) => line.kind === "depth")?.amountMinor,
    ).toBe(0);
    expect(
      priced.lines.find((line) => line.kind === "material")?.amountMinor,
    ).toBe(0);
  });
});
