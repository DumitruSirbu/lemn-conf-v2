// Adversarial QA for wave P2 (ADR 0177 A-1, A-5, A-6, A-7b, A-8; owner ruling 2026-10-26: every cabinet that measures
// deeper takes the depth percentage, walls included; customer-supplied rows never take any uplift).
//
// The implementer's suites check `priceDesign` against `percentageStagesOf`, the function under test. These check it
// against an independent BigInt oracle written from the A-1 formula alone, and go looking for what that formula leaves
// open: ties, the cross term, which rows and depths take the uplift, the cap boundary, and hostile percentages.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { MAX_PLACEMENTS } from "../../src/design-bounds.js";
import {
  cabinetDepthMmOf,
  type Design,
  type DesignPlacement,
} from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  CORNER_WALL_UNIT_TEMPLATES,
  KITCHEN_L_DESIGN,
  KITCHEN_L_PLACEMENTS,
} from "../../src/fixtures/kitchen-l-design.js";
import { finishesAtMm } from "../../src/occupied-depth.js";
import { measureDeepeningRows } from "../../src/pricing/deepening-rows.js";
import {
  MAX_CABINET_AMOUNT_MINOR,
  percentageStagesOf,
  roundHalfUpToTenLei,
} from "../../src/pricing/percentage-lines.js";
import type {
  CabinetPriceRule,
  PriceBook,
} from "../../src/pricing/price-book.js";
import {
  MAX_DEEP_CABINET_PERCENT,
  MAX_MATERIAL_PERCENT,
} from "../../src/pricing/price-bounds.js";
import {
  priceDesign,
  type PriceDesignRequest,
} from "../../src/pricing/price-design.js";
import type {
  CabinetPriceLine,
  PricedDesign,
  PricingFailure,
} from "../../src/pricing/price-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import type { BodyCatalog, BodyDefinition } from "../../src/void-engine.js";
import {
  anchoredRules,
  percentageBookOf,
  REFERENCE_TIER_ID,
  UPGRADE_TIER_ID,
} from "./percentage-book-support.js";

const NUM_RUNS = 100;
const SHALLOW_MM = 600;
const DEEP_MM = 700;
const TEN_LEI = 1_000n;

/** What a caller that measured and found nothing deeper passes: a real answer, not an absent one. */
const NOTHING_DEEPENS: ReadonlySet<string> = new Set();

const MANUFACTURER_ROWS = SAMPLE_PRICE_BOOK.cabinetRules
  .filter((rule) => rule.suppliedBy !== "customer")
  .map((rule) => rule.buildId);
const CUSTOMER_ROWS = SAMPLE_PRICE_BOOK.cabinetRules
  .filter((rule) => rule.suppliedBy === "customer")
  .map((rule) => rule.buildId);

// ---------------------------------------------------------------------------------------------------------------
// The oracle: A-1 written out in BigInt, sharing no code with production.
// ---------------------------------------------------------------------------------------------------------------

/** `numerator / denominator` to the nearest ten lei, a tie going up. Numerators here are never negative. */
function oracleRound(numerator: bigint, denominator: bigint): bigint {
  const grain = TEN_LEI * denominator;
  return ((numerator + grain / 2n) / grain) * TEN_LEI;
}

interface OracleStages {
  readonly cabinet: bigint;
  readonly withMaterial: bigint;
  readonly withDepth: bigint;
}

function oracleStages(
  exact: number,
  materialPercent: number,
  depthPercent: number,
): OracleStages {
  const b = BigInt(exact);
  const material = BigInt(100 + materialPercent);
  const depth = BigInt(100 + depthPercent);
  return {
    cabinet: oracleRound(b, 1n),
    withMaterial: oracleRound(b * material, 100n),
    withDepth: oracleRound(b * material * depth, 10_000n),
  };
}

interface OracleLines {
  readonly cabinets: ReadonlyMap<string, bigint>;
  readonly material: bigint;
  readonly depth: bigint;
  readonly hasDepthLine: boolean;
}

/** What the cabinet, material and depth lines must be, from the priced cabinet lines' own rows and suppliers. */
function oracleLines(
  cabinetLines: readonly CabinetPriceLine[],
  scenario: {
    readonly exactOf: (buildId: string) => number;
    readonly materialPercent: number;
    readonly depthPercent: number;
    readonly builtAtMm: number;
    readonly deepeningRows: ReadonlySet<string>;
  },
): OracleLines {
  const cabinets = new Map<string, bigint>();
  let material = 0n;
  let depth = 0n;
  let hasDepthLine = false;
  for (const line of cabinetLines) {
    const isCustomer = line.suppliedBy === "customer";
    const deepens =
      scenario.builtAtMm === DEEP_MM &&
      !isCustomer &&
      scenario.deepeningRows.has(line.pricedAsBuildId);
    hasDepthLine ||= deepens;
    const stages = oracleStages(
      isCustomer ? 0 : scenario.exactOf(line.pricedAsBuildId),
      scenario.materialPercent,
      deepens ? scenario.depthPercent : 0,
    );
    cabinets.set(line.placementId, stages.cabinet);
    material += stages.withMaterial - stages.cabinet;
    depth += stages.withDepth - stages.withMaterial;
  }
  return { cabinets, material, depth, hasDepthLine };
}

// ---------------------------------------------------------------------------------------------------------------
// Pricing helpers.
// ---------------------------------------------------------------------------------------------------------------

function designAt(
  depthMm: number,
  placements: readonly DesignPlacement[] = KITCHEN_L_PLACEMENTS,
): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: [...placements],
    settings: { ...KITCHEN_L_DESIGN.settings, cabinetDepthMm: depthMm },
  };
}

/** The catalogue exists at the two declared depths only; a design at any other depth is priced from the deep one. */
function catalogDepthFor(design: Design): number {
  const builtAtMm = cabinetDepthMmOf(design);
  return builtAtMm === SHALLOW_MM ? SHALLOW_MM : DEEP_MM;
}

function requestOf(
  book: PriceBook,
  options: {
    readonly design: Design;
    readonly deepeningRows?: ReadonlySet<string> | undefined;
    readonly materialTierId?: string | undefined;
  },
): PriceDesignRequest {
  return {
    design: options.design,
    catalog: buildKitchenLBodyCatalog(catalogDepthFor(options.design)),
    book,
    pricingVersion: book.version,
    selections: { materialTierId: options.materialTierId },
    deepeningRows: options.deepeningRows ?? NOTHING_DEEPENS,
  };
}

function pricedOrThrow(request: PriceDesignRequest): PricedDesign {
  const result = priceDesign(request);
  if (!result.ok) {
    throw new Error(`${result.failure.code}: ${result.failure.detail}`);
  }
  return result.priced;
}

function refusalOf(request: PriceDesignRequest): PricingFailure {
  const result = priceDesign(request);
  if (result.ok) throw new Error("expected a refusal, got a price");
  return result.failure;
}

function cabinetLinesOf(priced: PricedDesign): readonly CabinetPriceLine[] {
  return priced.lines.filter(
    (line): line is CabinetPriceLine => line.kind === "cabinet",
  );
}

function amountOfKind(priced: PricedDesign, kind: string): bigint {
  return priced.lines
    .filter((line) => line.kind === kind)
    .reduce((sum, line) => sum + BigInt(line.amountMinor), 0n);
}

function countOfKind(priced: PricedDesign, kind: string): number {
  return priced.lines.filter((line) => line.kind === kind).length;
}

function anchorsBy(anchors: readonly number[]): (buildId: string) => number {
  return (buildId) => {
    const index = MANUFACTURER_ROWS.indexOf(buildId);
    return anchors[Math.max(index, 0) % anchors.length] ?? 0;
  };
}

function sumOfLines(priced: PricedDesign): bigint {
  return priced.lines.reduce((sum, line) => sum + BigInt(line.amountMinor), 0n);
}

/** Anchors that sit on or near the rounding ties of all three stages as often as off them. */
const anchorAmounts = fc.oneof(
  fc.integer({ min: 0, max: 900_000 }),
  fc.integer({ min: 0, max: 1_800 }).map((halfTens) => halfTens * 500),
  fc.integer({ min: 0, max: 3_600 }).map((quarters) => quarters * 250),
);

// ---------------------------------------------------------------------------------------------------------------
// 1. Three stages, one rounding each, multiplied not added, lines summing exactly.
// ---------------------------------------------------------------------------------------------------------------

describe("every line equals an independent BigInt oracle of A-1, and the lines are the total", () => {
  const scenarios = fc.record({
    anchors: fc.array(anchorAmounts, { minLength: 1, maxLength: 10 }),
    materialPercent: fc.integer({ min: 0, max: MAX_MATERIAL_PERCENT }),
    depthPercent: fc.integer({ min: 0, max: MAX_DEEP_CABINET_PERCENT }),
    builtAtMm: fc.constantFrom(SHALLOW_MM, DEEP_MM),
    deepeningRows: fc
      .subarray([...MANUFACTURER_ROWS, ...CUSTOMER_ROWS])
      .map((rows): ReadonlySet<string> => new Set(rows)),
  });

  it("matches the oracle line by line, over material %, depth %, depth setting and which rows deepen", () => {
    fc.assert(
      fc.property(scenarios, (scenario) => {
        const exactOf = anchorsBy(scenario.anchors);
        const book = percentageBookOf({
          materialPercent: scenario.materialPercent,
          deepCabinetPercent: scenario.depthPercent,
          cabinetRules: anchoredRules(exactOf),
        });
        const priced = pricedOrThrow(
          requestOf(book, {
            design: designAt(scenario.builtAtMm),
            deepeningRows: scenario.deepeningRows,
            materialTierId: UPGRADE_TIER_ID,
          }),
        );
        const expected = oracleLines(cabinetLinesOf(priced), {
          ...scenario,
          exactOf,
        });

        for (const line of cabinetLinesOf(priced)) {
          expect(BigInt(line.amountMinor)).toBe(
            expected.cabinets.get(line.placementId),
          );
        }
        expect(amountOfKind(priced, "material")).toBe(expected.material);
        expect(amountOfKind(priced, "depth")).toBe(expected.depth);
        expect(countOfKind(priced, "depth")).toBe(
          expected.hasDepthLine ? 1 : 0,
        );
        expect(BigInt(priced.totalMinor)).toBe(sumOfLines(priced));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("publishes no negative line and no negative zero, anywhere", () => {
    fc.assert(
      fc.property(
        fc.array(anchorAmounts, { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 0, max: MAX_MATERIAL_PERCENT }),
        fc.integer({ min: 0, max: MAX_DEEP_CABINET_PERCENT }),
        (anchors, materialPercent, depthPercent) => {
          const book = percentageBookOf({
            materialPercent,
            deepCabinetPercent: depthPercent,
            cabinetRules: anchoredRules(anchorsBy(anchors)),
          });
          const priced = pricedOrThrow(
            requestOf(book, {
              design: designAt(DEEP_MM),
              deepeningRows: new Set(MANUFACTURER_ROWS),
              materialTierId: UPGRADE_TIER_ID,
            }),
          );

          for (const line of priced.lines) {
            expect(line.amountMinor).toBeGreaterThanOrEqual(0);
            expect(Object.is(line.amountMinor, -0)).toBe(false);
            expect(Object.is(line.unitAmountMinor, -0)).toBe(false);
          }
          expect(Object.is(priced.totalMinor, -0)).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("multiplies the two percentages: the cross term lands in the depth line (1 000 lei, +50 % material, +20 % depth = 1 800 lei, not 1 700)", () => {
    const book = percentageBookOf({
      materialPercent: 50,
      deepCabinetPercent: 20,
      cabinetRules: anchoredRules(() => 100_000),
    });
    const onlyBase = KITCHEN_L_PLACEMENTS.filter(
      (placement) => placement.id === "p4",
    );
    const priced = pricedOrThrow(
      requestOf(book, {
        design: designAt(DEEP_MM, onlyBase),
        deepeningRows: new Set(["base-3drawer"]),
        materialTierId: UPGRADE_TIER_ID,
      }),
    );

    expect(amountOfKind(priced, "cabinet")).toBe(100_000n);
    expect(amountOfKind(priced, "material")).toBe(50_000n);
    expect(amountOfKind(priced, "depth")).toBe(30_000n);
  });

  it("rounds once per stage, to the nearest ten lei with a tie going up, in every combination of percentages", () => {
    const tieProne = [1, 249, 250, 499, 500, 501, 1_250, 1_500, 2_500, 12_345];
    for (const exact of tieProne) {
      for (let materialPercent = 0; materialPercent <= 200; materialPercent++) {
        for (let depthPercent = 0; depthPercent <= 100; depthPercent += 1) {
          const stages = percentageStagesOf(exact, {
            materialPercent,
            deepCabinetPercent: depthPercent,
          });
          const expected = oracleStages(exact, materialPercent, depthPercent);
          if (
            BigInt(stages.cabinetMinor) !== expected.cabinet ||
            BigInt(stages.withMaterialMinor) !== expected.withMaterial ||
            BigInt(stages.withDepthMinor) !== expected.withDepth
          ) {
            throw new Error(
              `b=${String(exact)} m=${String(materialPercent)} d=${String(depthPercent)}: ` +
                `${JSON.stringify(stages)} against ${String(expected.cabinet)}/` +
                `${String(expected.withMaterial)}/${String(expected.withDepth)}`,
            );
          }
        }
      }
    }
  });

  it("is monotone: a dearer material or a greater depth percentage never makes a cabinet cheaper", () => {
    fc.assert(
      fc.property(
        anchorAmounts,
        fc.integer({ min: 0, max: MAX_MATERIAL_PERCENT - 1 }),
        fc.integer({ min: 0, max: MAX_DEEP_CABINET_PERCENT - 1 }),
        (exact, materialPercent, depthPercent) => {
          const at = (m: number, d: number) =>
            percentageStagesOf(exact, {
              materialPercent: m,
              deepCabinetPercent: d,
            }).withDepthMinor;

          expect(at(materialPercent + 1, depthPercent)).toBeGreaterThanOrEqual(
            at(materialPercent, depthPercent),
          );
          expect(at(materialPercent, depthPercent + 1)).toBeGreaterThanOrEqual(
            at(materialPercent, depthPercent),
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("roundHalfUpToTenLei", () => {
  it.each([
    [0, 0],
    [499, 0],
    [500, 1_000],
    [1_499, 1_000],
    [1_500, 2_000],
    [1_501, 2_000],
    [-499, 0],
    [-500, 0],
    [-501, -1_000],
    [-1_500, -1_000],
    [-1_501, -2_000],
  ])("rounds %i bani to %i, a tie towards +infinity", (input, expected) => {
    expect(roundHalfUpToTenLei(input)).toBe(expected);
  });

  it("never returns negative zero", () => {
    for (const input of [0, -0, 1, 499, -499, -500]) {
      expect(Object.is(roundHalfUpToTenLei(input), -0)).toBe(false);
    }
  });

  it("agrees with the oracle, is idempotent, and lands within five lei, over the whole safe range", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER - 1_000 }),
        (amount) => {
          const rounded = roundHalfUpToTenLei(amount);

          expect(BigInt(rounded)).toBe(oracleRound(BigInt(amount), 1n));
          expect(rounded % 1_000).toBe(0);
          expect(roundHalfUpToTenLei(rounded)).toBe(rounded);
          expect(Math.abs(rounded - amount)).toBeLessThanOrEqual(500);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it.each([
    ["a fraction", 1_000.5],
    ["NaN", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
    ["a number past the safe range", Number.MAX_SAFE_INTEGER],
  ])("throws on %s instead of publishing a rounded figure", (_label, input) => {
    expect(() => roundHalfUpToTenLei(input)).toThrow();
  });

  it("throws on a denominator that is zero, negative or fractional", () => {
    expect(() => roundHalfUpToTenLei(100, 0)).toThrow();
    expect(() => roundHalfUpToTenLei(100, -1)).toThrow();
    expect(() => roundHalfUpToTenLei(100, 0.5)).toThrow();
  });
});

describe("hardware and accessories are rounded to ten lei and never scaled by material or depth", () => {
  it("equals r10 of what the same book prices without any percentage", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_MATERIAL_PERCENT }),
        fc.integer({ min: 0, max: MAX_DEEP_CABINET_PERCENT }),
        (materialPercent, depthPercent) => {
          const rules = anchoredRules(() => 100_000);
          const percentageBook = percentageBookOf({
            materialPercent,
            deepCabinetPercent: depthPercent,
            cabinetRules: rules,
          });
          // The same book with no percentage in it: PAL is the reference and the depth rule states 0 %.
          const withoutPercentages = percentageBookOf({
            materialPercent: 0,
            deepCabinetPercent: 0,
            cabinetRules: rules,
          });
          const design = designAt(DEEP_MM);
          const flat = pricedOrThrow(
            requestOf(withoutPercentages, {
              design,
              deepeningRows: new Set(MANUFACTURER_ROWS),
            }),
          );
          const priced = pricedOrThrow(
            requestOf(percentageBook, {
              design,
              deepeningRows: new Set(MANUFACTURER_ROWS),
              materialTierId: UPGRADE_TIER_ID,
            }),
          );

          for (const kind of ["hardware", "accessory"] as const) {
            const expected = flat.lines
              .filter((line) => line.kind === kind)
              .map((line) => oracleRound(BigInt(line.amountMinor), 1n));
            const actual = priced.lines
              .filter((line) => line.kind === kind)
              .map((line) => BigInt(line.amountMinor));

            expect(actual).toEqual(expected);
          }
          expect(
            flat.lines.filter((line) => line.kind === "accessory").length,
          ).toBeGreaterThan(0);
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe("pricing is order-independent and does not touch its input", () => {
  it("gives the same lines for the same placements in any order", () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray([...KITCHEN_L_PLACEMENTS], {
          minLength: KITCHEN_L_PLACEMENTS.length,
        }),
        (shuffled) => {
          const book = percentageBookOf({
            materialPercent: 37,
            deepCabinetPercent: 23,
            cabinetRules: anchoredRules((id) => 1_000 + id.length * 7_777),
          });
          const options = {
            deepeningRows: new Set(MANUFACTURER_ROWS),
            materialTierId: UPGRADE_TIER_ID,
          };
          const reference = pricedOrThrow(
            requestOf(book, { ...options, design: designAt(DEEP_MM) }),
          );
          const reordered = pricedOrThrow(
            requestOf(book, {
              ...options,
              design: designAt(DEEP_MM, shuffled),
            }),
          );
          const byLineId = (priced: PricedDesign) =>
            Object.fromEntries(
              priced.lines.map((line) => [line.lineId, line.amountMinor]),
            );

          expect(byLineId(reordered)).toEqual(byLineId(reference));
          expect(reordered.totalMinor).toBe(reference.totalMinor);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("leaves the design, the book and the deepening set exactly as given", () => {
    const book = percentageBookOf({
      materialPercent: 40,
      deepCabinetPercent: 25,
      cabinetRules: anchoredRules(() => 123_456),
    });
    const deepeningRows = new Set(MANUFACTURER_ROWS);
    const before = JSON.stringify([
      designAt(DEEP_MM),
      book,
      [...deepeningRows],
    ]);

    pricedOrThrow(
      requestOf(book, {
        design: designAt(DEEP_MM),
        deepeningRows,
        materialTierId: UPGRADE_TIER_ID,
      }),
    );

    expect(JSON.stringify([designAt(DEEP_MM), book, [...deepeningRows]])).toBe(
      before,
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Which cabinets deepen: only at 700, only rows in `deepeningRows`, never a customer-supplied row.
// ---------------------------------------------------------------------------------------------------------------

describe("the depth line covers exactly the rows in deepeningRows, at 700 only", () => {
  const DISTINCT_ANCHORS = MANUFACTURER_ROWS.map(
    (_row, index) => 40_000 + index * 13_337,
  );
  const exactOf = anchorsBy(DISTINCT_ANCHORS);
  const book = percentageBookOf({
    materialPercent: 30,
    deepCabinetPercent: 40,
    cabinetRules: anchoredRules(exactOf),
  });
  const pricedRowsAt700 = new Set(
    cabinetLinesOf(
      pricedOrThrow(
        requestOf(book, {
          design: designAt(DEEP_MM),
          deepeningRows: new Set(),
          materialTierId: UPGRADE_TIER_ID,
        }),
      ),
    )
      .filter((line) => line.suppliedBy === "manufacturer")
      .map((line) => line.pricedAsBuildId),
  );

  it("prices the kitchen with several distinct manufacturer rows, so a single-row leak is visible", () => {
    expect(pricedRowsAt700.size).toBeGreaterThan(8);
  });

  it.each([...pricedRowsAt700])(
    "deepens only the cabinets priced as %s when it alone is listed",
    (row) => {
      const priced = pricedOrThrow(
        requestOf(book, {
          design: designAt(DEEP_MM),
          deepeningRows: new Set([row]),
          materialTierId: UPGRADE_TIER_ID,
        }),
      );
      const expected = oracleLines(cabinetLinesOf(priced), {
        exactOf,
        materialPercent: 30,
        depthPercent: 40,
        builtAtMm: DEEP_MM,
        deepeningRows: new Set([row]),
      });

      expect(amountOfKind(priced, "depth")).toBe(expected.depth);
      expect(expected.depth).toBeGreaterThan(0n);
    },
  );

  it.each([SHALLOW_MM, 599, 650, 699, 701, 800])(
    "publishes no depth line when the kitchen is built at %i mm, whatever the set holds",
    (builtAtMm) => {
      const priced = pricedOrThrow(
        requestOf(book, {
          design: designAt(builtAtMm),
          deepeningRows: new Set(MANUFACTURER_ROWS),
          materialTierId: UPGRADE_TIER_ID,
        }),
      );

      expect(countOfKind(priced, "depth")).toBe(0);
    },
  );

  it("publishes no depth line when the set holds only rows the design does not contain", () => {
    const priced = pricedOrThrow(
      requestOf(book, {
        design: designAt(DEEP_MM),
        deepeningRows: new Set(["row-nobody-placed", "base-cabinet-xl"]),
        materialTierId: UPGRADE_TIER_ID,
      }),
    );

    expect(countOfKind(priced, "depth")).toBe(0);
  });

  it("does not match a row by prefix or case", () => {
    const priced = pricedOrThrow(
      requestOf(book, {
        design: designAt(DEEP_MM),
        deepeningRows: new Set(["base", "WALL-CABINET", " wall-cabinet"]),
        materialTierId: UPGRADE_TIER_ID,
      }),
    );

    expect(countOfKind(priced, "depth")).toBe(0);
  });

  it("applies the same set to the whole design whatever the material: a PAL kitchen still takes the depth line", () => {
    const priced = pricedOrThrow(
      requestOf(book, {
        design: designAt(DEEP_MM),
        deepeningRows: new Set(MANUFACTURER_ROWS),
        materialTierId: REFERENCE_TIER_ID,
      }),
    );

    expect(amountOfKind(priced, "material")).toBe(0n);
    expect(amountOfKind(priced, "depth")).toBeGreaterThan(0n);
  });
});

describe("a customer-supplied row is never priced and never takes the uplift", () => {
  const book = percentageBookOf({
    materialPercent: 200,
    deepCabinetPercent: 100,
    cabinetRules: anchoredRules(() => 250_000),
  });

  it("prices every customer row at 0 whatever the percentages and the set", () => {
    const priced = pricedOrThrow(
      requestOf(book, {
        design: designAt(DEEP_MM),
        deepeningRows: new Set([...MANUFACTURER_ROWS, ...CUSTOMER_ROWS]),
        materialTierId: UPGRADE_TIER_ID,
      }),
    );
    const customerLines = cabinetLinesOf(priced).filter(
      (line) => line.suppliedBy === "customer",
    );

    expect(customerLines.length).toBeGreaterThan(0);
    expect(customerLines.map((line) => line.amountMinor)).toEqual(
      customerLines.map(() => 0),
    );
  });

  it("publishes no depth line for a design holding only customer rows, even with every one declared deepening", () => {
    const onlyCustomerRows = KITCHEN_L_PLACEMENTS.filter((placement) =>
      ["p7", "p13"].includes(placement.id),
    );
    const priced = pricedOrThrow(
      requestOf(book, {
        design: designAt(DEEP_MM, onlyCustomerRows),
        deepeningRows: new Set(CUSTOMER_ROWS),
        materialTierId: UPGRADE_TIER_ID,
      }),
    );

    expect(cabinetLinesOf(priced)).toHaveLength(2);
    expect(
      cabinetLinesOf(priced).every((line) => line.suppliedBy === "customer"),
    ).toBe(true);
    expect(countOfKind(priced, "depth")).toBe(0);
  });

  it("is not made to deepen by a manufacturer row that shares its set", () => {
    const withBase = KITCHEN_L_PLACEMENTS.filter((placement) =>
      ["p7", "p13", "p4"].includes(placement.id),
    );
    const priced = pricedOrThrow(
      requestOf(book, {
        design: designAt(DEEP_MM, withBase),
        deepeningRows: new Set([...CUSTOMER_ROWS, "base-3drawer"]),
        materialTierId: UPGRADE_TIER_ID,
      }),
    );
    const expected = oracleStages(250_000, 200, 100);

    expect(amountOfKind(priced, "depth")).toBe(
      expected.withDepth - expected.withMaterial,
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 3. Walls and wall corners are in the measured set (owner ruling 2026-10-26).
// ---------------------------------------------------------------------------------------------------------------

describe("walls, lift-ups, open shelves and wall corners take the depth percentage at 700 and not at 600", () => {
  const shallow = buildKitchenLBodyCatalog(SHALLOW_MM);
  const deep = buildKitchenLBodyCatalog(DEEP_MM);
  const measured = measureDeepeningRows(shallow, deep);
  const WALL_BAND_ROWS = [
    "wall-cabinet",
    "wall-lift",
    "open-shelf",
    "wall-corner-return-570",
    "wall-corner-x-900",
    "wall-corner-return-570-top",
    "wall-corner-x-900-top",
  ];
  const placements = [...KITCHEN_L_PLACEMENTS, ...CORNER_WALL_UNIT_TEMPLATES];
  const exactOf = (buildId: string) => 80_000 + buildId.length * 1_111;
  const book = percentageBookOf({
    materialPercent: 25,
    deepCabinetPercent: 35,
    cabinetRules: anchoredRules(exactOf),
  });

  function priceWith(builtAtMm: number, rows: ReadonlySet<string>) {
    return pricedOrThrow(
      requestOf(book, {
        design: designAt(builtAtMm, placements),
        deepeningRows: rows,
        materialTierId: UPGRADE_TIER_ID,
      }),
    );
  }

  it("measures every wall-band row as deepening", () => {
    for (const row of WALL_BAND_ROWS) expect(measured.has(row)).toBe(true);
  });

  it("charges a wall-only deepening set at 700 the oracle's amount, and charges nothing at 600", () => {
    const wallOnly = new Set(WALL_BAND_ROWS);
    const at700 = priceWith(DEEP_MM, wallOnly);
    const expected = oracleLines(cabinetLinesOf(at700), {
      exactOf,
      materialPercent: 25,
      depthPercent: 35,
      builtAtMm: DEEP_MM,
      deepeningRows: wallOnly,
    });

    expect(expected.depth).toBeGreaterThan(0n);
    expect(amountOfKind(at700, "depth")).toBe(expected.depth);
    expect(countOfKind(priceWith(SHALLOW_MM, wallOnly), "depth")).toBe(0);
  });

  it("charges the real measured set at 700 for every manufacturer cabinet, wall band included, and at 600 for none", () => {
    const at700 = priceWith(DEEP_MM, measured);
    const expected = oracleLines(cabinetLinesOf(at700), {
      exactOf,
      materialPercent: 25,
      depthPercent: 35,
      builtAtMm: DEEP_MM,
      deepeningRows: measured,
    });
    const wallBandLines = cabinetLinesOf(at700).filter((line) =>
      WALL_BAND_ROWS.includes(line.pricedAsBuildId),
    );

    expect(wallBandLines.length).toBeGreaterThan(8);
    expect(amountOfKind(at700, "depth")).toBe(expected.depth);
    expect(countOfKind(priceWith(SHALLOW_MM, measured), "depth")).toBe(0);
  });

  it("prices the lifted-column tops and the over-fridge wall unit as `wall-cabinet`, so they deepen with it", () => {
    const at700 = priceWith(DEEP_MM, new Set(["wall-cabinet"]));
    const pricedAs = (placementId: string) =>
      cabinetLinesOf(at700).find((line) => line.placementId === placementId)
        ?.pricedAsBuildId;

    expect(pricedAs("p22")).toBe("wall-cabinet");
    expect(pricedAs("p24")).toBe("wall-cabinet");
    const expected = oracleLines(cabinetLinesOf(at700), {
      exactOf,
      materialPercent: 25,
      depthPercent: 35,
      builtAtMm: DEEP_MM,
      deepeningRows: new Set(["wall-cabinet"]),
    });
    expect(amountOfKind(at700, "depth")).toBe(expected.depth);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 4. measureDeepeningRows.
// ---------------------------------------------------------------------------------------------------------------

function rowOf(catalog: BodyCatalog, buildId: string): BodyDefinition {
  const row = catalog.get(buildId);
  if (row === undefined) throw new Error(`${buildId} row missing`);
  return row;
}

function withFinishedDepth(row: BodyDefinition, mm: number): BodyDefinition {
  return { ...row, occupiedDepth: finishesAtMm(mm) };
}

describe("measureDeepeningRows over generated catalogues", () => {
  const baseRow = rowOf(buildKitchenLBodyCatalog(SHALLOW_MM), "base-cabinet");

  const depthsByRow = fc.dictionary(
    fc.stringMatching(/^[a-z]{1,6}$/),
    fc.integer({ min: 100, max: 1_200 }),
    { maxKeys: 8 },
  );

  function catalogOf(depths: Readonly<Record<string, number>>): BodyCatalog {
    const rows = new Map<string, BodyDefinition>();
    for (const [id, mm] of Object.entries(depths)) {
      rows.set(id, withFinishedDepth(baseRow, mm));
    }
    return rows;
  }

  it("is exactly the rows both catalogues hold whose depth strictly grows", () => {
    fc.assert(
      fc.property(depthsByRow, depthsByRow, (atShallow, atDeep) => {
        const expected = Object.keys(atShallow).filter(
          (id) => id in atDeep && (atDeep[id] ?? 0) > (atShallow[id] ?? 0),
        );

        expect(
          [
            ...measureDeepeningRows(catalogOf(atShallow), catalogOf(atDeep)),
          ].sort(),
        ).toEqual(expected.sort());
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("is antisymmetric: swapping the two catalogues lists the rows that got shallower, and no row is in both answers", () => {
    fc.assert(
      fc.property(depthsByRow, depthsByRow, (atShallow, atDeep) => {
        const forward = measureDeepeningRows(
          catalogOf(atShallow),
          catalogOf(atDeep),
        );
        const backward = measureDeepeningRows(
          catalogOf(atDeep),
          catalogOf(atShallow),
        );

        expect([...forward].filter((id) => backward.has(id))).toEqual([]);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("answers an empty set for empty catalogues, and for one empty catalogue", () => {
    const some = catalogOf({ a: 500 });

    expect(measureDeepeningRows(new Map(), new Map()).size).toBe(0);
    expect(measureDeepeningRows(some, new Map()).size).toBe(0);
    expect(measureDeepeningRows(new Map(), some).size).toBe(0);
  });

  it("measures the shipped catalogue the same whichever order its rows were built in", () => {
    const shallow = buildKitchenLBodyCatalog(SHALLOW_MM);
    const deep = buildKitchenLBodyCatalog(DEEP_MM);
    const reversed: BodyCatalog = new Map([...shallow].reverse());

    expect([...measureDeepeningRows(reversed, deep)].sort()).toEqual(
      [...measureDeepeningRows(shallow, deep)].sort(),
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 5. A percentage-form book without deepeningRows.
// ---------------------------------------------------------------------------------------------------------------

describe("a caller that has not measured the deepening rows gets no price that silently omits the depth line", () => {
  const book = percentageBookOf({
    materialPercent: 10,
    deepCabinetPercent: 10,
    cabinetRules: anchoredRules(() => 100_000),
  });

  /** The request as a caller that forgot the set (or a JavaScript caller) would send it. The type forbids it, and
   *  that is the first line of defence: the `@ts-expect-error` goes red the day the field turns optional. */
  function requestWithoutTheSet(builtAtMm: number): PriceDesignRequest {
    const request = requestOf(book, { design: designAt(builtAtMm) });
    // @ts-expect-error `deepeningRows` is required (ADR 0177 A-6, P3)
    const missing: PriceDesignRequest = {
      ...request,
      deepeningRows: undefined,
    };
    return missing;
  }

  it("never returns a price at 700 mm, where the depth line depends on the set", () => {
    // It raises rather than refuses: the set is supplied by code, not by a book, so a missing one is a defect in the
    // caller and not a fact a surface could render. What must never happen is a figure without its depth line.
    const answer = (() => {
      try {
        return priceDesign(requestWithoutTheSet(DEEP_MM));
      } catch {
        return undefined;
      }
    })();

    expect(answer?.ok ?? false).toBe(false);
  });

  it("prices at 600 mm, where no cabinet deepens and so the set decides nothing", () => {
    const priced = pricedOrThrow(requestWithoutTheSet(SHALLOW_MM));

    expect(countOfKind(priced, "depth")).toBe(0);
  });

  it("prices with an empty set, which is a real answer ('nothing deepens') and not an absence", () => {
    const priced = pricedOrThrow(
      requestOf(book, {
        design: designAt(DEEP_MM),
        deepeningRows: new Set(),
        materialTierId: UPGRADE_TIER_ID,
      }),
    );

    expect(countOfKind(priced, "depth")).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 6. The per-cabinet amount cap (A-5).
// ---------------------------------------------------------------------------------------------------------------

describe("the per-cabinet cap", () => {
  const onlyPlacement = (id: string) =>
    KITCHEN_L_PLACEMENTS.filter((placement) => placement.id === id);

  /** One dear row among free ones, so the refusal can only name that row's placement. */
  function bookWithOneDearRow(dearMinor: number): PriceBook {
    return percentageBookOf({
      materialPercent: MAX_MATERIAL_PERCENT,
      deepCabinetPercent: MAX_DEEP_CABINET_PERCENT,
      cabinetRules: anchoredRules((buildId) =>
        buildId === "base-3drawer" ? dearMinor : 0,
      ),
    });
  }

  it.each([
    ["at 700 and deepening", DEEP_MM, new Set(["base-3drawer"])],
    ["at 700 and not deepening", DEEP_MM, new Set<string>()],
    ["at 600", SHALLOW_MM, new Set(["base-3drawer"])],
  ])("prices a cabinet exactly at the cap %s", (_label, builtAtMm, rows) => {
    const priced = pricedOrThrow(
      requestOf(bookWithOneDearRow(MAX_CABINET_AMOUNT_MINOR), {
        design: designAt(builtAtMm, KITCHEN_L_PLACEMENTS),
        deepeningRows: rows,
        materialTierId: UPGRADE_TIER_ID,
      }),
    );

    expect(BigInt(priced.totalMinor)).toBe(sumOfLines(priced));
    expect(priced.lines.every((line) => line.amountMinor % 1_000 === 0)).toBe(
      true,
    );
  });

  it.each([
    ["at 700 and deepening", DEEP_MM, new Set(["base-3drawer"])],
    ["at 700 and not deepening", DEEP_MM, new Set<string>()],
    ["at 600", SHALLOW_MM, new Set(["base-3drawer"])],
  ])(
    "refuses a cabinet one bani past the cap %s, with INVALID_AMOUNT naming that placement",
    (_label, builtAtMm, rows) => {
      const failure = refusalOf(
        requestOf(bookWithOneDearRow(MAX_CABINET_AMOUNT_MINOR + 1), {
          design: designAt(builtAtMm, KITCHEN_L_PLACEMENTS),
          deepeningRows: rows,
          materialTierId: UPGRADE_TIER_ID,
        }),
      );

      expect(failure.code).toBe("INVALID_AMOUNT");
      expect(failure.placementId).toBe("p4");
    },
  );

  it("refuses a cabinet far past the cap and a cabinet at the safe-integer limit without throwing", () => {
    for (const dearMinor of [
      MAX_CABINET_AMOUNT_MINOR * 1_000,
      Number.MAX_SAFE_INTEGER,
    ]) {
      const result = priceDesign(
        requestOf(bookWithOneDearRow(dearMinor), {
          design: designAt(DEEP_MM, onlyPlacement("p4")),
          deepeningRows: new Set(["base-3drawer"]),
          materialTierId: UPGRADE_TIER_ID,
        }),
      );

      expect(result.ok).toBe(false);
    }
  });

  it("keeps every line exact with the maximum number of placements, each at the cap, at the dearest material and depth", () => {
    const template = KITCHEN_L_PLACEMENTS.find(
      (placement) => placement.id === "p4",
    );
    if (template === undefined) throw new Error("p4 missing");
    const everyPlacement = Array.from(
      { length: MAX_PLACEMENTS },
      (_unused, index): DesignPlacement => ({
        ...template,
        id: `cap${String(index)}`,
      }),
    );
    const priced = pricedOrThrow(
      requestOf(bookWithOneDearRow(MAX_CABINET_AMOUNT_MINOR), {
        design: designAt(DEEP_MM, everyPlacement),
        deepeningRows: new Set(["base-3drawer"]),
        materialTierId: UPGRADE_TIER_ID,
      }),
    );
    const stages = oracleStages(
      MAX_CABINET_AMOUNT_MINOR,
      MAX_MATERIAL_PERCENT,
      MAX_DEEP_CABINET_PERCENT,
    );
    const placements = BigInt(MAX_PLACEMENTS);

    expect(cabinetLinesOf(priced)).toHaveLength(MAX_PLACEMENTS);
    expect(amountOfKind(priced, "cabinet")).toBe(stages.cabinet * placements);
    expect(amountOfKind(priced, "material")).toBe(
      (stages.withMaterial - stages.cabinet) * placements,
    );
    expect(amountOfKind(priced, "depth")).toBe(
      (stages.withDepth - stages.withMaterial) * placements,
    );
    expect(Number.isSafeInteger(priced.totalMinor)).toBe(true);
    expect(BigInt(priced.totalMinor)).toBe(sumOfLines(priced));
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 7. Hostile percentages and amounts.
// ---------------------------------------------------------------------------------------------------------------

describe("hostile percentages are refused before any price is formed", () => {
  const design = designAt(DEEP_MM);

  function bookWithMaterialPercent(declared: unknown): PriceBook {
    const book = percentageBookOf({
      materialPercent: 10,
      deepCabinetPercent: 10,
      cabinetRules: anchoredRules(() => 100_000),
    });
    const tiers = book.material.tiers.map((tier) =>
      tier.tierId === UPGRADE_TIER_ID
        ? { ...tier, percentOfCabinets: declared }
        : tier,
    );
    return { ...book, material: { ...book.material, tiers } } as PriceBook;
  }

  function bookWithDepthPercent(declared: unknown): PriceBook {
    const book = percentageBookOf({
      materialPercent: 10,
      deepCabinetPercent: 10,
      cabinetRules: anchoredRules(() => 100_000),
    });
    return {
      ...book,
      depthRule: { deepCabinetPercent: declared },
    } as PriceBook;
  }

  const hostile: readonly (readonly [string, unknown])[] = [
    ["NaN", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
    ["negative infinity", Number.NEGATIVE_INFINITY],
    ["a fraction", 12.5],
    ["a tiny fraction", 0.1 + 0.2],
    ["a negative", -1],
    ["a digit string", "10"],
    ["null", null],
    ["a boolean", true],
    ["an object", { value: 10 }],
    ["the largest safe integer", Number.MAX_SAFE_INTEGER],
  ];

  it.each(hostile)(
    "refuses a material percentage that is %s",
    (_label, declared) => {
      const failure = refusalOf(
        requestOf(bookWithMaterialPercent(declared), {
          design,
          deepeningRows: new Set(MANUFACTURER_ROWS),
          materialTierId: UPGRADE_TIER_ID,
        }),
      );

      expect(failure.code).toBe("INVALID_PRICE_BOOK");
    },
  );

  it.each(hostile)(
    "refuses a depth percentage that is %s",
    (_label, declared) => {
      const failure = refusalOf(
        requestOf(bookWithDepthPercent(declared), {
          design,
          deepeningRows: new Set(MANUFACTURER_ROWS),
          materialTierId: UPGRADE_TIER_ID,
        }),
      );

      expect(failure.code).toBe("INVALID_PRICE_BOOK");
    },
  );

  it("refuses one past each maximum and accepts each maximum", () => {
    const request = (book: PriceBook) =>
      requestOf(book, {
        design,
        deepeningRows: new Set(MANUFACTURER_ROWS),
        materialTierId: UPGRADE_TIER_ID,
      });

    expect(priceDesign(request(bookWithMaterialPercent(200))).ok).toBe(true);
    expect(priceDesign(request(bookWithMaterialPercent(201))).ok).toBe(false);
    expect(priceDesign(request(bookWithDepthPercent(100))).ok).toBe(true);
    expect(priceDesign(request(bookWithDepthPercent(101))).ok).toBe(false);
    expect(priceDesign(request(bookWithMaterialPercent(-1))).ok).toBe(false);
    expect(priceDesign(request(bookWithDepthPercent(-1))).ok).toBe(false);
  });

  it("reads a negative-zero percentage as 0 and publishes no negative zero", () => {
    const negativeZero = pricedOrThrow(
      requestOf(bookWithDepthPercent(-0), {
        design,
        deepeningRows: new Set(MANUFACTURER_ROWS),
        materialTierId: UPGRADE_TIER_ID,
      }),
    );
    const positiveZero = pricedOrThrow(
      requestOf(bookWithDepthPercent(0), {
        design,
        deepeningRows: new Set(MANUFACTURER_ROWS),
        materialTierId: UPGRADE_TIER_ID,
      }),
    );

    expect(negativeZero.totalMinor).toBe(positiveZero.totalMinor);
    for (const line of negativeZero.lines) {
      expect(Object.is(line.amountMinor, -0)).toBe(false);
      expect(Object.is(line.unitAmountMinor, -0)).toBe(false);
    }
  });

  it("refuses a default material above 0 %, since the pricing fallback is the PAL reference (A-8)", () => {
    const book = percentageBookOf({
      materialPercent: 10,
      deepCabinetPercent: 10,
      cabinetRules: anchoredRules(() => 100_000),
    });
    const tiers = book.material.tiers.map((tier) => ({
      ...tier,
      percentOfCabinets: 1,
    })) as unknown as PriceBook["material"]["tiers"];

    const failure = refusalOf(
      requestOf(
        { ...book, material: { ...book.material, tiers } },
        {
          design,
          deepeningRows: new Set(),
        },
      ),
    );

    expect(failure.code).toBe("INVALID_PRICE_BOOK");
  });

  it("ignores a retired whole-kitchen amount left on a percentage tier: the price is by the percentage alone (a named gap)", () => {
    // KNOWN GAP, recorded and not endorsed: the book parser sweeps a formula for a field its shape does not read, but a
    // tier's own fields are not swept, and `wholeKitchenMinor` cannot be named in source (P3-b). An author who leaves
    // the retired amount beside a percentage is told nothing and is billed the percentage. This pin flips, loudly, the
    // day the tier parser refuses an unread field.
    const book = percentageBookOf({
      materialPercent: 10,
      deepCabinetPercent: 10,
      cabinetRules: anchoredRules(() => 100_000),
    });
    const withRetiredAmount = book.material.tiers.map((tier) => ({
      ...tier,
      wholeKitchenMinor: 5_000,
    })) as unknown as PriceBook["material"]["tiers"];
    const options = {
      design,
      deepeningRows: new Set<string>(),
      materialTierId: UPGRADE_TIER_ID,
    };

    const withField = pricedOrThrow(
      requestOf(
        { ...book, material: { ...book.material, tiers: withRetiredAmount } },
        options,
      ),
    );

    expect(withField).toEqual(pricedOrThrow(requestOf(book, options)));
  });
});

describe("a cabinet that would price below zero is refused, never rounded into a line (A-7b)", () => {
  /** A book states no negative price, so a cabinet reaches a negative amount the one way left: stepping down from an
   *  anchor by more than the anchor. The 3-drawer base is quoted at `amountMinor` plus six steps' worth at 600 mm and
   *  built at 300 mm, six steps narrower, so its exact amount is `amountMinor`. */
  const STEPS_BELOW_THE_ANCHOR = 6;
  const STEP_DOWN_MINOR = 400_000;
  const NARROW_WIDTH_MM = 300;

  function bookWithBaseDrawerAt(amountMinor: number): PriceBook {
    const rules: readonly CabinetPriceRule[] = anchoredRules(() => 100_000).map(
      (rule) =>
        rule.buildId === "base-3drawer"
          ? {
              ...rule,
              formula: {
                shape: "anchored-width",
                anchorWidthMm: 600,
                anchorMinor:
                  amountMinor + STEPS_BELOW_THE_ANCHOR * STEP_DOWN_MINOR,
                perStepWiderMinor: 0,
                perStepNarrowerMinor: STEP_DOWN_MINOR,
              },
            }
          : rule,
    );
    return percentageBookOf({
      materialPercent: 50,
      deepCabinetPercent: 50,
      cabinetRules: rules,
    });
  }

  function narrowDrawerDesign(): Design {
    const deep = designAt(DEEP_MM);
    return {
      ...deep,
      placements: deep.placements.map((placement) =>
        placement.id === "p4"
          ? {
              ...placement,
              body: { ...placement.body, widthMm: NARROW_WIDTH_MM },
            }
          : placement,
      ),
    };
  }

  it.each([-1, -499, -500, -501, -1_000_000])(
    "refuses %i bani with INVALID_AMOUNT naming the placement",
    (amountMinor) => {
      const failure = refusalOf(
        requestOf(bookWithBaseDrawerAt(amountMinor), {
          design: narrowDrawerDesign(),
          deepeningRows: new Set(MANUFACTURER_ROWS),
          materialTierId: UPGRADE_TIER_ID,
        }),
      );

      expect(failure.code).toBe("INVALID_AMOUNT");
      expect(failure.placementId).toBe("p4");
    },
  );

  it.each([0, 1, 499, 500])(
    "prices %i bani without a negative line",
    (amountMinor) => {
      const priced = pricedOrThrow(
        requestOf(bookWithBaseDrawerAt(amountMinor), {
          design: narrowDrawerDesign(),
          deepeningRows: new Set(MANUFACTURER_ROWS),
          materialTierId: UPGRADE_TIER_ID,
        }),
      );

      expect(priced.lines.every((line) => line.amountMinor >= 0)).toBe(true);
    },
  );
});
