// M10 M2 adversarial QA, a book judged against the catalogue (M2-b, M2-b2, M2-b3; ADR 0177 A-3, A-5, A-7, A-7b).
// Counter-examples sought: a book the judgement accepts and the whole query then refuses to price at some width or height a
// customer can build; a row of the shipped book the judgement does not hold to its own shape; a corner key that some room or
// depth outgrows; a percentage the ranges let through.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { resolveWidthRangesMm, toInsertableBody } from "../../src/catalog.js";
import { cornerAssemblyWidthsMm } from "../../src/corner-assembly-size.js";
import {
  CABINET_SIZED_OPENING_MAX_M,
  HEIGHT_FLEX_MIN_OPENING_MM,
} from "../../src/commands/insert-fit.js";
import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import {
  judgeBookAgainstCatalog,
  type BookRefusal,
} from "../../src/price-dashboard/judge-book.js";
import {
  isInsertableRow,
  listPricedRows,
  pricedRowOf,
  referenceCornerBuiltWidthsMm,
} from "../../src/price-dashboard/priced-row.js";
import {
  isAnchoredShape,
  PRICE_STEP_MM,
  roundUpToPriceStepMm,
  type AnchoredFormula,
} from "../../src/pricing/anchored-price-formula.js";
import type { PriceBook, PriceFormula } from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

import { required } from "./qa-m2-required.js";
import {
  cabinetInMaterialAtDepthMinor,
  CATALOG,
  DEEP_DEPTH_MM,
  priceOneCabinet,
  ruleOf,
  withFormula,
  withoutRule,
  withPercentages,
  withRule,
} from "./m2-support.js";

const MANUFACTURER_RULES = SAMPLE_PRICE_BOOK.cabinetRules.filter(
  ({ suppliedBy }) => suppliedBy !== "customer",
);
const CUSTOMER_RULES = SAMPLE_PRICE_BOOK.cabinetRules.filter(
  ({ suppliedBy }) => suppliedBy === "customer",
);
const STRUCTURAL_CORNER_IDS = [
  "base-corner-x-900",
  "base-corner-return-320",
  "wall-corner-x-900",
  "wall-corner-x-900-top",
  "wall-corner-return-570",
  "wall-corner-return-570-top",
] as const;

function refusalsOf(
  book: PriceBook,
  catalog = CATALOG,
): readonly BookRefusal[] {
  const judgement = judgeBookAgainstCatalog(book, catalog);
  return judgement.ok ? [] : judgement.refusals;
}

function anchoredFormulaOf(buildId: string): AnchoredFormula {
  const { formula } = ruleOf(buildId);
  if (!isAnchoredShape(formula.shape))
    throw new Error(`${buildId} not anchored`);
  return formula as AnchoredFormula;
}

// ---------------------------------------------------------------------------------------------------------------------
// The whole query is the oracle: a book the judgement accepts prices every body a customer can build

describe("a judged book is a book the whole query prices at every buildable width and height (A-7b against priceDesign)", () => {
  const ROWS = [
    "base-cabinet",
    "tall-pantry",
    "base-sink",
    "base-3drawer",
    "wall-cabinet",
    "wall-lift",
    "open-shelf",
  ] as const;
  const OFF_GRID_OPENING_MM = 437;

  const TEN_LEI_MINOR = 1_000;

  /** Amounts that straddle zero on the row, every one a whole ten lei so that the cabinet line the query prints is the
   *  exact amount (a price of 400 bani is above zero and prints as 0): the steps are scaled to how many a row's grid has
   *  below its anchor, and the anchor may be 0 (the sink built from 560 has no step under its anchor). */
  function amountsFor(buildId: string) {
    const isWall = CATALOG.get(buildId)?.band === "wall";
    const stepMax = isWall ? 30 : 80;
    const tenLei = (max: number) =>
      fc.integer({ min: 0, max }).map((count) => count * TEN_LEI_MINOR);
    return fc.record({
      anchorMinor: tenLei(isWall ? 250 : 300),
      perStepWiderMinor: tenLei(stepMax),
      perStepNarrowerMinor: tenLei(stepMax),
      perExtraDoorLeafMinor: tenLei(stepMax),
      perHeightStepMinor: tenLei(isWall ? 15 : 60),
    });
  }

  function widthsOf(buildId: string): readonly number[] {
    const definition = CATALOG.get(buildId);
    const body = definition && toInsertableBody(buildId, definition);
    if (body === undefined) throw new Error(`${buildId} is not insertable`);
    return resolveWidthRangesMm(body).flatMap(({ minMm, maxMm }) =>
      Array.from({ length: maxMm - minMm + 1 }, (_, offset) => minMm + offset),
    );
  }

  function heightsOf(buildId: string): readonly number[] {
    const definition = CATALOG.get(buildId);
    if (definition?.heightFlex === true) {
      return [
        HEIGHT_FLEX_MIN_OPENING_MM,
        OFF_GRID_OPENING_MM,
        CABINET_SIZED_OPENING_MAX_M * 1_000,
      ];
    }
    return [definition?.nominalHeightMm ?? 860];
  }

  /** `undefined` when the query prices every body above zero, else why it did not: the code it refused one with, or that
   *  its cabinet line is not above zero (the query itself only refuses below zero; A-7b also refuses zero). */
  function firstRefusalByTheQuery(
    book: PriceBook,
    buildId: string,
  ): string | undefined {
    const band = CATALOG.get(buildId)?.band;
    for (const heightMm of heightsOf(buildId)) {
      for (const widthMm of widthsOf(buildId)) {
        try {
          const priced = priceOneCabinet(
            { buildId, widthMm, heightMm, y0Mm: band === "wall" ? 1_500 : 0 },
            {
              book,
              depthMm: 600,
              materialTierId: book.material.defaultTierId,
              hardwareTierId: book.hardware.defaultTierId,
            },
          );
          if (cabinetInMaterialAtDepthMinor(priced) <= 0)
            return "NOT_ABOVE_ZERO";
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      }
    }
    return undefined;
  }

  function bookOf(buildId: string, coefficients: Record<string, number>) {
    const sample = anchoredFormulaOf(buildId);
    const formula: Record<string, unknown> = { ...sample };
    for (const field of Object.keys(sample)) {
      if (field.endsWith("Minor")) formula[field] = coefficients[field];
    }
    return withFormula(
      SAMPLE_PRICE_BOOK,
      buildId,
      formula as unknown as PriceFormula,
    );
  }

  it.each(ROWS)(
    "agrees with the query on %s: accepted exactly when no buildable body is refused a price",
    (buildId) => {
      const outcomes = new Set<boolean>();

      fc.assert(
        fc.property(amountsFor(buildId), (coefficients) => {
          const book = bookOf(buildId, coefficients);

          const refusedByQuery = firstRefusalByTheQuery(book, buildId);
          const judged = judgeBookAgainstCatalog(book, CATALOG);

          expect(judged.ok).toBe(refusedByQuery === undefined);
          if (refusedByQuery !== undefined) {
            expect(["INVALID_AMOUNT", "NOT_ABOVE_ZERO"]).toContain(
              refusedByQuery,
            );
          }
          outcomes.add(judged.ok);
        }),
        {
          numRuns: 14,
          // One book each side of zero, so that both outcomes are always met whatever the seed draws.
          examples: [
            [
              {
                anchorMinor: 0,
                perStepWiderMinor: 0,
                perStepNarrowerMinor: 0,
                perExtraDoorLeafMinor: 0,
                perHeightStepMinor: 0,
              },
            ],
            [
              {
                anchorMinor: 250_000,
                perStepWiderMinor: 1_000,
                perStepNarrowerMinor: 1_000,
                perExtraDoorLeafMinor: 1_000,
                perHeightStepMinor: 1_000,
              },
            ],
          ],
        },
      );

      expect(outcomes).toEqual(new Set([true, false]));
    },
    60_000,
  );
});

// ---------------------------------------------------------------------------------------------------------------------
// Every row of the shipped book is held to its own judgement, one row at a time (non-vacuity of each branch)

describe("the judgement does not rest on every coefficient being non-negative (A-7b)", () => {
  // The parser refuses a negative step, so a stored book never carries one, and every price then rises with the width and
  // the lowest width is the cheapest. A-7b still requires the grid, so that rule does not depend on it: here a narrower step
  // that adds takes the price to its least at 451 mm (one leaf, priced as the 500 mm step), where no grid width is.
  it("catches a price at or below zero that only the lowest width rounding up to a step produces", () => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-cabinet", {
      shape: "anchored-width-and-door-leaves",
      anchorWidthMm: 600,
      anchorMinor: 30_000,
      perStepWiderMinor: 0,
      perStepNarrowerMinor: -6_000,
      perExtraDoorLeafMinor: 45_000,
    });

    const refusals = refusalsOf(book);

    expect(refusals).toEqual([
      expect.objectContaining({
        code: "PRICE_NOT_POSITIVE",
        buildId: "base-cabinet",
        widthMm: 451,
      }),
    ]);
  });
});

describe("each manufacturer row of the shipped book is judged for itself", () => {
  it("accepts the sample book against the catalogue built at 700 mm too", () => {
    expect(
      judgeBookAgainstCatalog(
        SAMPLE_PRICE_BOOK,
        buildKitchenLBodyCatalog(DEEP_DEPTH_MM),
      ),
    ).toEqual({ ok: true });
  });

  it.each(MANUFACTURER_RULES.map(({ buildId }) => buildId))(
    "refuses %s once its price is driven to zero, naming that row",
    (buildId) => {
      const formula = ruleOf(buildId).formula;
      const zeroed: PriceFormula =
        formula.shape === "price-per-size"
          ? {
              ...formula,
              sizes: formula.sizes.map((size, index) =>
                index === 0 ? { ...size, amountMinor: 0 } : size,
              ),
            }
          : ({ ...formula, anchorMinor: 0 } as PriceFormula);

      const refusals = refusalsOf(
        withFormula(SAMPLE_PRICE_BOOK, buildId, zeroed),
      );

      expect(refusals).toEqual([
        expect.objectContaining({ code: "PRICE_NOT_POSITIVE", buildId }),
      ]);
    },
  );

  it.each(MANUFACTURER_RULES.map(({ buildId }) => buildId))(
    "refuses %s once the book states a shape this build retired, and only that row",
    (buildId) => {
      const retired = {
        shape: "linear-in-width",
        baseMinor: 100_000,
        perWidthMillimetreMinor: 10,
      } as unknown as PriceFormula;

      expect(
        refusalsOf(withFormula(SAMPLE_PRICE_BOOK, buildId, retired)),
      ).toEqual([
        expect.objectContaining({ code: "UNKNOWN_FORMULA_SHAPE", buildId }),
      ]);
    },
  );

  it.each(SAMPLE_PRICE_BOOK.cabinetRules.map(({ buildId }) => buildId))(
    "refuses a book that leaves %s unpriced, and names it",
    (buildId) => {
      expect(refusalsOf(withoutRule(SAMPLE_PRICE_BOOK, buildId))).toEqual([
        { code: "NO_RULE_FOR_BODY", buildId },
      ]);
    },
  );

  it("names every row at once when a book prices none of them", () => {
    const empty: PriceBook = { ...SAMPLE_PRICE_BOOK, cabinetRules: [] };

    const missing = refusalsOf(empty)
      .filter(({ code }) => code === "NO_RULE_FOR_BODY")
      .map((refusal) => (refusal as { buildId: string }).buildId);

    expect(new Set(missing)).toEqual(
      new Set(listPricedRows(CATALOG).map(({ buildId }) => buildId)),
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// A-3, A-7: the anchor is the default width, the size list the catalogue's sizes

describe("the anchor width and the size list (M2-b3)", () => {
  const ANCHORED_INSERTABLE = MANUFACTURER_RULES.filter(
    ({ formula, buildId }) =>
      isAnchoredShape(formula.shape) &&
      isInsertableRow(pricedRowOf(CATALOG, buildId) as never),
  );

  it("holds more than a handful of rows to the default width, so the sweep below is not vacuous", () => {
    expect(ANCHORED_INSERTABLE.length).toBeGreaterThanOrEqual(8);
  });

  it.each(ANCHORED_INSERTABLE.map(({ buildId }) => buildId))(
    "refuses %s quoted one step either side of the catalogue's default width, and accepts it at the default",
    (buildId) => {
      const defaultMm = pricedRowOf(CATALOG, buildId)?.definition
        .defaultWidthMm;
      const formula = anchoredFormulaOf(buildId);

      expect(defaultMm).toBe(formula.anchorWidthMm);
      for (const offMm of [
        required(defaultMm) - PRICE_STEP_MM,
        required(defaultMm) + PRICE_STEP_MM,
      ]) {
        const book = withFormula(SAMPLE_PRICE_BOOK, buildId, {
          ...formula,
          anchorWidthMm: offMm,
        });

        expect(refusalsOf(book)).toEqual([
          expect.objectContaining({
            code: "ANCHOR_WIDTH_MISMATCH",
            buildId,
            anchorWidthMm: offMm,
            expectedWidthMm: defaultMm,
          }),
        ]);
      }
    },
  );

  it.each(STRUCTURAL_CORNER_IDS)(
    "refuses an anchored formula on the corner %s, however it is anchored",
    (buildId) => {
      for (const anchorWidthMm of [300, 350, 600, 900]) {
        const book = withFormula(SAMPLE_PRICE_BOOK, buildId, {
          shape: "anchored-width",
          anchorWidthMm,
          anchorMinor: 400_000,
          perStepWiderMinor: 0,
          perStepNarrowerMinor: 0,
        });

        expect(refusalsOf(book)).toEqual([
          expect.objectContaining({
            code: "STRUCTURAL_ROW_NOT_PER_SIZE",
            buildId,
          }),
        ]);
      }
    },
  );

  it.each(STRUCTURAL_CORNER_IDS)(
    "accepts the corner %s only at the round-up of the width it is built at: one key, on the grid, no other",
    (buildId) => {
      const builtMm = required(referenceCornerBuiltWidthsMm().get(buildId));
      const keyMm = roundUpToPriceStepMm(builtMm);
      const keyed = (...widthsMm: number[]) =>
        withFormula(SAMPLE_PRICE_BOOK, buildId, {
          shape: "price-per-size",
          sizes: widthsMm.map((widthMm) => ({ widthMm, amountMinor: 100_000 })),
        });

      expect(refusalsOf(keyed(keyMm))).toEqual([]);
      expect(refusalsOf(keyed(keyMm - PRICE_STEP_MM))).toEqual([
        expect.objectContaining({ code: "SIZE_LIST_MISMATCH", buildId }),
      ]);
      expect(refusalsOf(keyed(keyMm + PRICE_STEP_MM))).toEqual([
        expect.objectContaining({ code: "SIZE_LIST_MISMATCH", buildId }),
      ]);
      expect(refusalsOf(keyed(keyMm - PRICE_STEP_MM, keyMm))).toEqual([
        expect.objectContaining({ code: "SIZE_LIST_MISMATCH", buildId }),
      ]);
      expect(refusalsOf(keyed(keyMm, keyMm + PRICE_STEP_MM))).toEqual([
        expect.objectContaining({ code: "SIZE_LIST_MISMATCH", buildId }),
      ]);
      expect(refusalsOf(keyed(builtMm)).length === 0).toBe(builtMm === keyMm);
    },
  );

  it("is the built width and not the id that is asked: 330 for the return the catalogue calls 320 (ADR 0135)", () => {
    expect(referenceCornerBuiltWidthsMm().get("base-corner-return-320")).toBe(
      330,
    );
    const keyedAtTheIdsNumber = withFormula(
      SAMPLE_PRICE_BOOK,
      "base-corner-return-320",
      {
        shape: "price-per-size",
        sizes: [{ widthMm: 300, amountMinor: 120_000 }],
      },
    );

    expect(refusalsOf(keyedAtTheIdsNumber)).toEqual([
      expect.objectContaining({
        code: "SIZE_LIST_MISMATCH",
        buildId: "base-corner-return-320",
        expectedWidthsMm: [350],
      }),
    ]);
  });

  it("holds an insertable fixed-size row to the round-up of each catalogue width, off-grid ones included", () => {
    const offGrid: typeof CATALOG = new Map([
      ...CATALOG,
      [
        "base-dishwasher",
        {
          ...required(CATALOG.get("base-dishwasher")),
          widthRangesMm: [
            { minMm: 450, maxMm: 450 },
            { minMm: 580, maxMm: 580 },
          ],
        },
      ],
    ]);
    const keyed = (...widthsMm: number[]) =>
      withFormula(SAMPLE_PRICE_BOOK, "base-dishwasher", {
        shape: "price-per-size",
        sizes: widthsMm.map((widthMm) => ({ widthMm, amountMinor: 300_000 })),
      });

    expect(refusalsOf(keyed(450, 600), offGrid)).toEqual([]);
    expect(refusalsOf(keyed(450, 580), offGrid)).toEqual([
      expect.objectContaining({ code: "SIZE_LIST_MISMATCH" }),
    ]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The corners: every room and depth builds a corner the one listed key prices

describe("a book the judgement accepts prices every corner a room can build (ADR 0135, A-7)", () => {
  const DEPTHS_MM = [600, 700] as const;
  const ROOM_SIDES_MM = Array.from(
    { length: 16 },
    (_, index) => 1_500 + index * 500,
  );
  const CORNER_PIECE_OF: Readonly<Record<string, string>> = {
    "base-corner-x-900": "A:base",
    "base-corner-return-320": "B:base",
    "wall-corner-x-900": "A:wall",
    "wall-corner-x-900-top": "A:top",
    "wall-corner-return-570": "B:wall",
    "wall-corner-return-570-top": "B:top",
  };

  function listedKeyOf(buildId: string): number {
    const { formula } = ruleOf(buildId);
    if (formula.shape !== "price-per-size") throw new Error("not per-size");
    return required(formula.sizes[0]?.widthMm);
  }

  it("builds no corner wider than the width the judgement reads, in any room or at either depth", () => {
    const widestMm = new Map<string, number>();

    for (const cabinetDepthMm of DEPTHS_MM) {
      for (const widthMm of ROOM_SIDES_MM) {
        for (const depthMm of ROOM_SIDES_MM) {
          const assembly = cornerAssemblyWidthsMm({
            cabinetDepthMm,
            room: { shape: "L", widthMm, depthMm, heightMm: 2_600 },
          });
          for (const { wall, band, widthMm: builtMm } of assembly.pieces) {
            const key = `${wall}:${band}`;
            widestMm.set(key, Math.max(widestMm.get(key) ?? 0, builtMm));
          }
        }
      }
    }

    expect(widestMm.size).toBe(STRUCTURAL_CORNER_IDS.length);
    for (const [buildId, piece] of Object.entries(CORNER_PIECE_OF)) {
      const builtMm = required(widestMm.get(piece));
      expect(builtMm).toBeLessThanOrEqual(
        required(referenceCornerBuiltWidthsMm().get(buildId)),
      );
      expect(roundUpToPriceStepMm(builtMm)).toBe(listedKeyOf(buildId));
    }
  });

  it.each(STRUCTURAL_CORNER_IDS)(
    "prices %s at every width up to the one listed, at the one listed price (a narrower body takes the key above it)",
    (buildId) => {
      const builtMm = required(referenceCornerBuiltWidthsMm().get(buildId));
      const priced = (widthMm: number) =>
        priceOneCabinet(
          { buildId, widthMm, heightMm: 800, y0Mm: 0 },
          {
            book: SAMPLE_PRICE_BOOK,
            depthMm: 600,
            materialTierId: SAMPLE_PRICE_BOOK.material.defaultTierId,
            hardwareTierId: SAMPLE_PRICE_BOOK.hardware.defaultTierId,
          },
        ).totalMinor;

      const atBuiltWidth = priced(builtMm);

      expect(judgeBookAgainstCatalog(SAMPLE_PRICE_BOOK, CATALOG)).toEqual({
        ok: true,
      });
      for (let widthMm = 200; widthMm <= builtMm; widthMm += 10) {
        expect(priced(widthMm)).toBe(atBuiltWidth);
      }
    },
  );
});

// ---------------------------------------------------------------------------------------------------------------------
// Customer-supplied rows (ADR 0107 d2)

describe("customer-supplied rows must be free, in every field a formula may state", () => {
  /** The widths a customer row is built at, so a fixed-size formula states the sizes the shape check asks for. */
  const SIZES_OF: Readonly<Record<string, readonly number[]>> = {
    hood: [600, 650, 700, 750, 800],
    "fridge-free": [700],
  };
  const defaultWidthOf = (buildId: string) =>
    required(CATALOG.get(buildId)?.defaultWidthMm);

  it.each(CUSTOMER_RULES.map(({ buildId }) => buildId))(
    "accepts %s at zero and refuses it at any amount in any field",
    (buildId) => {
      const free = (changes: Record<string, number>): PriceFormula =>
        ({
          shape: "anchored-width-height-and-door-leaves",
          anchorWidthMm: defaultWidthOf(buildId),
          anchorHeightMm: 700,
          anchorMinor: 0,
          perStepWiderMinor: 0,
          perStepNarrowerMinor: 0,
          perExtraDoorLeafMinor: 0,
          perHeightStepMinor: 0,
          ...changes,
        }) as PriceFormula;

      expect(
        refusalsOf(withFormula(SAMPLE_PRICE_BOOK, buildId, free({}))),
      ).toEqual([]);
      for (const field of [
        "anchorMinor",
        "perStepWiderMinor",
        "perStepNarrowerMinor",
        "perExtraDoorLeafMinor",
        "perHeightStepMinor",
      ]) {
        expect(
          refusalsOf(
            withFormula(SAMPLE_PRICE_BOOK, buildId, free({ [field]: 1 })),
          ),
        ).toEqual([
          expect.objectContaining({ code: "CUSTOMER_ROW_PRICED", buildId }),
        ]);
      }
      expect(
        refusalsOf(
          withFormula(SAMPLE_PRICE_BOOK, buildId, {
            shape: "price-per-size",
            sizes: required(SIZES_OF[buildId]).map((widthMm) => ({
              widthMm,
              amountMinor: 1_000,
            })),
          }),
        ),
      ).toEqual([
        expect.objectContaining({ code: "CUSTOMER_ROW_PRICED", buildId }),
      ]);
    },
  );

  it("holds a customer row to the size list the catalogue builds it at, as any other row (review B1)", () => {
    const book = withRule(SAMPLE_PRICE_BOOK, "hood", (rule) => ({
      ...rule,
      formula: {
        shape: "price-per-size",
        sizes: [
          { widthMm: 50, amountMinor: 0 },
          { widthMm: 3_000, amountMinor: 0 },
        ],
      } as PriceFormula,
    }));

    expect(refusalsOf(book)).toEqual([
      expect.objectContaining({ code: "SIZE_LIST_MISMATCH", buildId: "hood" }),
    ]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The percentages' ranges, at their ends

describe("the percentage ranges are held at their ends, for every tier", () => {
  const upgradeTiers = SAMPLE_PRICE_BOOK.material.tiers.filter(
    ({ tierId }) => tierId !== SAMPLE_PRICE_BOOK.material.defaultTierId,
  );

  it("accepts every whole material percent from 0 to 200 and every depth percent from 0 to 100, and refuses the next one either side", () => {
    for (let percent = -2; percent <= 203; percent += 1) {
      const material = refusalsOf(
        withPercentages(SAMPLE_PRICE_BOOK, {
          materialPercent: percent,
          depthPercent: 0,
        }),
      );
      const depth = refusalsOf(
        withPercentages(SAMPLE_PRICE_BOOK, {
          materialPercent: 0,
          depthPercent: percent,
        }),
      );

      expect(material.length === 0).toBe(percent >= 0 && percent <= 200);
      expect(depth.length === 0).toBe(percent >= 0 && percent <= 100);
    }
  });

  it.each([
    ["a fraction", 12.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a numeric string", "15"],
    ["undefined", undefined],
    ["null", null],
    ["an unsafe whole number", 2 ** 60],
  ])(
    "refuses %s as a material percent and as the depth percent",
    (_name, value) => {
      const tierId = required(upgradeTiers[0]?.tierId);
      const material: PriceBook = {
        ...SAMPLE_PRICE_BOOK,
        material: {
          ...SAMPLE_PRICE_BOOK.material,
          tiers: SAMPLE_PRICE_BOOK.material.tiers.map((tier) =>
            tier.tierId === tierId
              ? ({ ...tier, percentOfCabinets: value } as never)
              : tier,
          ),
        },
      };
      const depth: PriceBook = {
        ...SAMPLE_PRICE_BOOK,
        depthRule: { deepCabinetPercent: value as number },
      };

      expect(refusalsOf(material)).toContainEqual({
        code: "PERCENT_OUT_OF_RANGE",
        item: tierId,
      });
      expect(refusalsOf(depth)).toContainEqual({
        code: "PERCENT_OUT_OF_RANGE",
        item: "depth",
      });
    },
  );
});

describe("the judgement is a pure function of its inputs", () => {
  it("answers the same refusals, in the same order, for the same book, and reads a frozen book without touching it", () => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-cabinet", {
      ...anchoredFormulaOf("base-cabinet"),
      anchorMinor: 1,
    });
    const frozen = structuredClone(book);
    const freeze = (value: unknown): void => {
      if (typeof value !== "object" || value === null) return;
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    };
    freeze(frozen);

    expect(judgeBookAgainstCatalog(frozen, CATALOG)).toEqual(
      judgeBookAgainstCatalog(book, CATALOG),
    );
    expect(frozen).toEqual(book);
  });
});
