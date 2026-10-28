// Adversarial QA of the anchored arithmetic against an oracle that shares no code with it.
//
// The oracle is BigInt, so it cannot lose precision the way the implementation could; the implementation's answer
// must equal it at every width and height a design can hold (1..MAX_DESIGN_DIMENSION_MM), at rates up to
// `MAX_PRICE_COEFFICIENT_MINOR`, for all four shapes. A result is either an exact integer equal to the oracle or a
// refusal: never a rounded, clamped, negative-zero or silently-zero figure.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { test as propertyTest } from "@fast-check/vitest";

import { deriveDoorCount } from "../../src/door-count.js";
import {
  MAX_DESIGN_DIMENSION_MM,
  MAX_PLACEMENTS,
} from "../../src/design-bounds.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  ANCHORED_SHAPES,
  PRICE_STEP_MM,
  roundUpToPriceStepMm,
  type AnchoredFormula,
  type AnchoredShape,
} from "../../src/pricing/anchored-price-formula.js";
import { MAX_PRICE_COEFFICIENT_MINOR } from "../../src/pricing/parse-price-book.js";
import {
  amountForBody,
  type CabinetPriceRule,
  type PriceBook,
  type PricedBody,
} from "../../src/pricing/price-book.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";
import { NOTHING_DISABLED } from "../support/availability.js";

const MAX_DIMENSION = MAX_DESIGN_DIMENSION_MM;
const STEP = BigInt(PRICE_STEP_MM);

/** Leaves at a width for a one-band row, exactly as the catalogue derives them (500 mm is the second leaf). */
function leavesAt(tiers: number): (widthMm: number) => number {
  return (widthMm) => tiers * deriveDoorCount(widthMm);
}

function bodyOf(widthMm: number, heightMm: number, tiers: number): PricedBody {
  const leaves = leavesAt(tiers);
  return {
    widthMm,
    heightMm,
    doorLeafCount: leaves(widthMm),
    doorLeafCountAt: leaves,
  };
}

/** The most one cabinet may cost before its three percentage stages could leave the exact-integer range (ADR 0177 A-5):
 *  the safe-integer ceiling over every placement at the dearest material (+200 %) and depth (+100 %). Restated. */
const ORACLE_CABINET_CAP =
  BigInt(Number.MAX_SAFE_INTEGER) / (BigInt(MAX_PLACEMENTS) * 300n * 200n);

const TEN_LEI = 1_000n;
const HALF_A_GRAIN = 500n;

/** A cabinet line is its exact amount rounded half up to ten lei (ADR 0177 A-1). Restated in BigInt, so the oracle
 *  shares nothing with the seam it checks; the amount is non-negative where a line is published. */
function oracleRoundedToTenLei(exactMinor: bigint): bigint {
  return ((exactMinor + HALF_A_GRAIN) / TEN_LEI) * TEN_LEI;
}

/** Integer-only ceil to the pricing step, with no division. */
function oracleRoundedUp(millimetres: number): number {
  const rest = millimetres % PRICE_STEP_MM;
  return rest === 0 ? millimetres : millimetres + (PRICE_STEP_MM - rest);
}

function readsDoors(shape: AnchoredShape): boolean {
  return shape.includes("door-leaves");
}

function readsHeight(shape: AnchoredShape): boolean {
  return shape.includes("height");
}

/** The plan's A-2/A-3 formula, in BigInt, written from the plan and not from the implementation. */
function oracleAmount(formula: AnchoredFormula, body: PricedBody): bigint {
  const widthDelta = BigInt(
    oracleRoundedUp(body.widthMm) - formula.anchorWidthMm,
  );
  const widthSteps = widthDelta / STEP;
  const widthTerm =
    widthSteps >= 0n
      ? widthSteps * BigInt(formula.perStepWiderMinor)
      : widthSteps * BigInt(formula.perStepNarrowerMinor);
  let total = BigInt(formula.anchorMinor) + widthTerm;
  if (readsDoors(formula.shape)) {
    const extraLeaves = BigInt(
      body.doorLeafCount - (body.doorLeafCountAt?.(formula.anchorWidthMm) ?? 0),
    );
    total += extraLeaves * BigInt(formula.perExtraDoorLeafMinor ?? 0);
  }
  if (readsHeight(formula.shape)) {
    const heightDelta = BigInt(
      oracleRoundedUp(body.heightMm) - (formula.anchorHeightMm ?? 0),
    );
    total += (heightDelta / STEP) * BigInt(formula.perHeightStepMinor ?? 0);
  }
  return total;
}

const rateArbitrary = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 5_000_000 }) },
  { weight: 1, arbitrary: fc.constant(MAX_PRICE_COEFFICIENT_MINOR) },
  {
    weight: 1,
    arbitrary: fc.integer({
      min: MAX_PRICE_COEFFICIENT_MINOR - 1_000,
      max: MAX_PRICE_COEFFICIENT_MINOR,
    }),
  },
  { weight: 1, arbitrary: fc.constant(0) },
);
const anchorMmArbitrary = fc
  .oneof(
    fc.integer({ min: 1, max: MAX_DIMENSION / PRICE_STEP_MM }),
    fc.constantFrom(1, MAX_DIMENSION / PRICE_STEP_MM),
  )
  .map((steps) => steps * PRICE_STEP_MM);
const dimensionArbitrary = fc.oneof(
  fc.integer({ min: 1, max: MAX_DIMENSION }),
  fc.constantFrom(
    1,
    49,
    50,
    51,
    499,
    500,
    501,
    MAX_DIMENSION - 1,
    MAX_DIMENSION,
  ),
);

const formulaArbitrary: fc.Arbitrary<AnchoredFormula> = fc
  .record({
    shape: fc.constantFrom(...ANCHORED_SHAPES),
    anchorWidthMm: anchorMmArbitrary,
    anchorHeightMm: anchorMmArbitrary,
    anchorMinor: rateArbitrary,
    perStepWiderMinor: rateArbitrary,
    perStepNarrowerMinor: rateArbitrary,
    perExtraDoorLeafMinor: rateArbitrary,
    perHeightStepMinor: rateArbitrary,
  })
  .map(({ shape, ...fields }): AnchoredFormula => {
    const door = readsDoors(shape)
      ? { perExtraDoorLeafMinor: fields.perExtraDoorLeafMinor }
      : {};
    const height = readsHeight(shape)
      ? {
          anchorHeightMm: fields.anchorHeightMm,
          perHeightStepMinor: fields.perHeightStepMinor,
        }
      : {};
    return {
      shape,
      anchorWidthMm: fields.anchorWidthMm,
      anchorMinor: fields.anchorMinor,
      perStepWiderMinor: fields.perStepWiderMinor,
      perStepNarrowerMinor: fields.perStepNarrowerMinor,
      ...door,
      ...height,
    };
  });

const NUM_RUNS = 4_000;

/** `amountForBody` answers `undefined` only for a shape with no arm; every shape drawn here has one. */
function pricedAmount(formula: AnchoredFormula, body: PricedBody): number {
  const amount: number | undefined = amountForBody(formula, body);
  if (amount === undefined) throw new Error(`no arm for ${formula.shape}`);
  return amount;
}

describe("round-up to the pricing step, at every millimetre (A-2, A-4)", () => {
  it("equals the integer ceil for every width and height from 1 to the design maximum", () => {
    for (let millimetres = 1; millimetres <= MAX_DIMENSION; millimetres += 1) {
      expect(roundUpToPriceStepMm(millimetres), String(millimetres)).toBe(
        oracleRoundedUp(millimetres),
      );
    }
  });

  it("leaves exact multiples unchanged and never rounds down", () => {
    for (let steps = 1; steps <= MAX_DIMENSION / PRICE_STEP_MM; steps += 1) {
      const exact = steps * PRICE_STEP_MM;
      expect(roundUpToPriceStepMm(exact)).toBe(exact);
      expect(roundUpToPriceStepMm(exact - 1)).toBe(exact);
      expect(roundUpToPriceStepMm(exact + 1)).toBe(exact + PRICE_STEP_MM);
    }
  });

  it("names the plan's own examples: 560 and 575 are 600, 601 is 650", () => {
    expect([560, 575, 600, 601].map(roundUpToPriceStepMm)).toEqual([
      600, 600, 600, 650,
    ]);
  });
});

describe("the anchored amount equals a BigInt oracle (A-2, A-3, A-5)", () => {
  propertyTest.prop(
    [
      formulaArbitrary,
      dimensionArbitrary,
      dimensionArbitrary,
      fc.integer({ min: 1, max: 2 }),
    ],
    { numRuns: NUM_RUNS },
  )(
    "answers the exact oracle integer at any width, height and rate up to the bound, or refuses and never rounds",
    (formula, widthMm, heightMm, tiers) => {
      const body = bodyOf(widthMm, heightMm, tiers);
      const expected = oracleAmount(formula, body);

      const amount = pricedAmount(formula, body);

      expect(Number.isSafeInteger(amount)).toBe(true);
      expect(BigInt(amount)).toBe(expected);
      expect(Object.is(amount, -0)).toBe(false);
    },
  );

  propertyTest.prop(
    [formulaArbitrary, dimensionArbitrary, dimensionArbitrary],
    {
      numRuns: NUM_RUNS,
    },
  )(
    "prices a body at its width rounded up exactly when the door term cannot tell them apart",
    (formula, widthMm, heightMm) => {
      const rounded = roundUpToPriceStepMm(widthMm);
      const price = (width: number) =>
        amountForBody(formula, {
          widthMm: width,
          heightMm,
          doorLeafCount: 1,
          doorLeafCountAt: () => 1,
        });

      expect(price(widthMm)).toBe(price(rounded));
    },
  );

  propertyTest.prop([formulaArbitrary, dimensionArbitrary])(
    "prices the anchor width and anchor height at exactly the anchor, with the leaf count the anchor has",
    (formula, tiers) => {
      const body = bodyOf(
        formula.anchorWidthMm,
        formula.anchorHeightMm ?? tiers,
        1 + (tiers % 2),
      );

      expect(amountForBody(formula, body)).toBe(formula.anchorMinor);
    },
  );

  it("evaluates the worst case at the bound exactly: every rate at the maximum, the widest body against the narrowest anchor", () => {
    const worst: AnchoredFormula = {
      shape: "anchored-width-height-and-door-leaves",
      anchorWidthMm: PRICE_STEP_MM,
      anchorHeightMm: PRICE_STEP_MM,
      anchorMinor: MAX_PRICE_COEFFICIENT_MINOR,
      perStepWiderMinor: MAX_PRICE_COEFFICIENT_MINOR,
      perStepNarrowerMinor: MAX_PRICE_COEFFICIENT_MINOR,
      perExtraDoorLeafMinor: MAX_PRICE_COEFFICIENT_MINOR,
      perHeightStepMinor: MAX_PRICE_COEFFICIENT_MINOR,
    };
    const body = bodyOf(MAX_DIMENSION, MAX_DIMENSION, 2);

    const amount = pricedAmount(worst, body);

    expect(BigInt(amount)).toBe(oracleAmount(worst, body));
    expect(Number.isSafeInteger(amount)).toBe(true);
  });

  it("evaluates the most negative reachable running sum exactly: the highest narrow count against a zero anchor, then refuses it", () => {
    const negative: AnchoredFormula = {
      shape: "anchored-width-height-and-door-leaves",
      anchorWidthMm: MAX_DIMENSION,
      anchorHeightMm: MAX_DIMENSION,
      anchorMinor: 0,
      perStepWiderMinor: 0,
      perStepNarrowerMinor: MAX_PRICE_COEFFICIENT_MINOR,
      perExtraDoorLeafMinor: MAX_PRICE_COEFFICIENT_MINOR,
      perHeightStepMinor: MAX_PRICE_COEFFICIENT_MINOR,
    };
    const body = bodyOf(PRICE_STEP_MM, PRICE_STEP_MM, 2);

    const amount = pricedAmount(negative, body);

    expect(BigInt(amount)).toBe(oracleAmount(negative, body));
    expect(amount).toBeLessThan(0);
  });
});

describe("monotone in width when both steps and the door rate are non-negative", () => {
  propertyTest.prop(
    [
      formulaArbitrary,
      dimensionArbitrary,
      dimensionArbitrary,
      dimensionArbitrary,
      fc.integer({ min: 1, max: 2 }),
    ],
    { numRuns: NUM_RUNS },
  )(
    "never prices a wider body below a narrower one of the same height",
    (formula, first, second, heightMm, tiers) => {
      const [narrow, wide] =
        first <= second ? [first, second] : [second, first];

      const narrowAmount = pricedAmount(
        formula,
        bodyOf(narrow, heightMm, tiers),
      );
      const wideAmount = pricedAmount(formula, bodyOf(wide, heightMm, tiers));

      expect(wideAmount).toBeGreaterThanOrEqual(narrowAmount);
    },
  );
});

describe("through priceDesign: a line is the oracle's integer, or a coded refusal, never a negative or zero guess", () => {
  const CATALOG = KITCHEN_L_BODY_CATALOG;
  const BUILD_ID = "base-cabinet";

  function priceOne(
    formula: AnchoredFormula,
    widthMm: number,
    heightMm: number,
  ) {
    const rule: CabinetPriceRule = {
      ruleId: "cabinet.anchored",
      buildId: BUILD_ID,
      formula,
    };
    const book: PriceBook = { ...SAMPLE_PRICE_BOOK, cabinetRules: [rule] };
    return priceDesign({
      design: {
        ...KITCHEN_L_DESIGN,
        placements: [
          {
            id: "p1",
            wall: "A",
            alongMm: 1300,
            y0Mm: 0,
            body: { buildId: BUILD_ID, widthMm, heightMm },
          },
        ],
      },
      catalog: CATALOG,
      book,
      pricingVersion: book.version,
      deepeningRows: MEASURED_DEEPENING_ROWS,
      availability: NOTHING_DISABLED,
    });
  }

  const planningRate = fc.integer({ min: 0, max: 3_000_000 });
  const planningFormula = fc
    .record({
      shape: fc.constantFrom(...ANCHORED_SHAPES),
      anchorWidthMm: fc.integer({ min: 4, max: 24 }).map((s) => s * 50),
      anchorHeightMm: fc.integer({ min: 8, max: 20 }).map((s) => s * 50),
      anchorMinor: planningRate,
      perStepWiderMinor: planningRate,
      perStepNarrowerMinor: planningRate,
      perExtraDoorLeafMinor: planningRate,
      perHeightStepMinor: planningRate,
    })
    .map(
      ({ shape, ...fields }): AnchoredFormula => ({
        shape,
        anchorWidthMm: fields.anchorWidthMm,
        anchorMinor: fields.anchorMinor,
        perStepWiderMinor: fields.perStepWiderMinor,
        perStepNarrowerMinor: fields.perStepNarrowerMinor,
        ...(readsDoors(shape)
          ? { perExtraDoorLeafMinor: fields.perExtraDoorLeafMinor }
          : {}),
        ...(readsHeight(shape)
          ? {
              anchorHeightMm: fields.anchorHeightMm,
              perHeightStepMinor: fields.perHeightStepMinor,
            }
          : {}),
      }),
    );

  propertyTest.prop(
    [
      planningFormula,
      fc.integer({ min: 150, max: 1200 }),
      fc.integer({ min: 300, max: 1000 }),
    ],
    { numRuns: 2_000 },
  )(
    "is ok exactly when the oracle is non-negative, and then the line is the oracle; otherwise INVALID_AMOUNT",
    (formula, widthMm, heightMm) => {
      const body = bodyOf(widthMm, heightMm, 1);
      const expected = oracleAmount(formula, body);

      const result = priceOne(formula, widthMm, heightMm);

      if (expected > ORACLE_CABINET_CAP) {
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure).toMatchObject({
          code: "INVALID_AMOUNT",
          placementId: "p1",
        });
      } else if (expected >= 0n) {
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const line = result.priced.lines.find((l) => l.kind === "cabinet");
        expect(BigInt(line?.amountMinor ?? -1)).toBe(
          oracleRoundedToTenLei(expected),
        );
        expect(Object.is(line?.amountMinor, -0)).toBe(false);
      } else {
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure).toMatchObject({
          code: "INVALID_AMOUNT",
          placementId: "p1",
          id: "cabinet.anchored",
        });
      }
    },
  );

  it("refuses a body whose height term alone drives the price below zero, instead of clamping at zero", () => {
    const formula: AnchoredFormula = {
      shape: "anchored-width-and-height",
      anchorWidthMm: 600,
      anchorHeightMm: 900,
      anchorMinor: 10_000,
      perStepWiderMinor: 0,
      perStepNarrowerMinor: 0,
      perHeightStepMinor: 6_000,
    };

    const shorterBy50 = priceOne(formula, 600, 850);
    const shorterBy100 = priceOne(formula, 600, 800);

    expect(shorterBy50.ok).toBe(true);
    expect(shorterBy100.ok).toBe(false);
    if (!shorterBy100.ok) {
      expect(shorterBy100.failure.code).toBe("INVALID_AMOUNT");
    }
  });

  it("prices the same design byte-identically on every call and leaves a deep-frozen book untouched", () => {
    const formula: AnchoredFormula = {
      shape: "anchored-width-height-and-door-leaves",
      anchorWidthMm: 600,
      anchorHeightMm: 700,
      anchorMinor: 100_000,
      perStepWiderMinor: 7_000,
      perStepNarrowerMinor: 3_000,
      perExtraDoorLeafMinor: 11_000,
      perHeightStepMinor: 2_000,
    };
    const frozen = Object.freeze({ ...formula });

    const first = priceOne(frozen, 575, 730);
    const second = priceOne(frozen, 575, 730);

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.ok).toBe(true);
  });
});

describe("a fixed-size row against a listed-size oracle (A-7)", () => {
  const CATALOG = KITCHEN_L_BODY_CATALOG;
  const BUILD_ID = "base-bottle-cargo";
  const sizesArbitrary = fc
    .uniqueArray(fc.integer({ min: 1, max: 40 }), {
      minLength: 1,
      maxLength: 20,
    })
    .map((steps) => [...steps].sort((a, b) => a - b))
    .chain((steps) =>
      fc
        .array(fc.integer({ min: 0, max: MAX_PRICE_COEFFICIENT_MINOR }), {
          minLength: steps.length,
          maxLength: steps.length,
        })
        .map((amounts) =>
          steps.map((step, index) => ({
            widthMm: step * PRICE_STEP_MM,
            amountMinor: amounts[index] ?? 0,
          })),
        ),
    );

  function priceAt(
    sizes: readonly { widthMm: number; amountMinor: number }[],
    widthMm: number,
  ) {
    const rule: CabinetPriceRule = {
      ruleId: "cabinet.anchored-size",
      buildId: BUILD_ID,
      formula: { shape: "price-per-size", sizes },
    };
    const book: PriceBook = { ...SAMPLE_PRICE_BOOK, cabinetRules: [rule] };
    return priceDesign({
      design: {
        ...KITCHEN_L_DESIGN,
        placements: [
          {
            id: "p1",
            wall: "A",
            alongMm: 1300,
            y0Mm: 0,
            body: { buildId: BUILD_ID, widthMm, heightMm: 700 },
          },
        ],
      },
      catalog: CATALOG,
      book,
      pricingVersion: book.version,
      deepeningRows: MEASURED_DEEPENING_ROWS,
      availability: NOTHING_DISABLED,
    });
  }

  propertyTest.prop([sizesArbitrary, fc.integer({ min: 1, max: 2_200 })], {
    numRuns: 1_500,
  })(
    "answers the smallest listed size at least as wide, or refuses with NO_PRICE_FOR_SIZE naming the placement and the rule; never a zero or a nearer size",
    (sizes, widthMm) => {
      const reaching = sizes.find((size) => size.widthMm >= widthMm);

      const result = priceAt(sizes, widthMm);

      if (reaching === undefined) {
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure).toMatchObject({
          code: "NO_PRICE_FOR_SIZE",
          placementId: "p1",
          id: "cabinet.anchored-size",
        });
        return;
      }
      if (BigInt(reaching.amountMinor) > ORACLE_CABINET_CAP) {
        // The parser admits a listed amount up to the coefficient bound; the percentage seam refuses the cabinet that
        // would leave its stages inexact, naming the placement (ADR 0177 A-5).
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure).toMatchObject({
          code: "INVALID_AMOUNT",
          placementId: "p1",
        });
        return;
      }
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const line = result.priced.lines.find((l) => l.kind === "cabinet");
      expect(BigInt(line?.amountMinor ?? -1)).toBe(
        oracleRoundedToTenLei(BigInt(reaching.amountMinor)),
      );
    },
  );

  it("refuses at one millimetre past the widest size and prices at the widest size itself", () => {
    const sizes = [
      { widthMm: 200, amountMinor: 11_000 },
      { widthMm: 300, amountMinor: 17_000 },
    ];

    expect(priceAt(sizes, 300).ok).toBe(true);
    const past = priceAt(sizes, 301);
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.failure.code).toBe("NO_PRICE_FOR_SIZE");
  });

  it("is a refusal of the whole design, so a refused body never shows a partial total", () => {
    const result = priceAt([{ widthMm: 200, amountMinor: 11_000 }], 250);

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("priced");
  });
});

describe("a whole kitchen priced on the anchored shapes: no body the seeded or generated kitchens hold is unreadable", () => {
  // Converts every rule of the shipped book to the widest anchored shape, so every width, height and leaf count a
  // real design carries (seeded, resized, generated, corner, tall) goes through the new dimension readers.
  const CATALOG = KITCHEN_L_BODY_CATALOG;
  const anchoredBook: PriceBook = {
    ...SAMPLE_PRICE_BOOK,
    cabinetRules: SAMPLE_PRICE_BOOK.cabinetRules.map(
      (rule): CabinetPriceRule => {
        const isFree = rule.suppliedBy === "customer";
        const rate = (minor: number) => (isFree ? 0 : minor);
        return {
          ...rule,
          formula: {
            shape: "anchored-width-height-and-door-leaves",
            anchorWidthMm: 600,
            anchorHeightMm: 700,
            anchorMinor: rate(5_000_000),
            perStepWiderMinor: rate(10_000),
            perStepNarrowerMinor: rate(10_000),
            perExtraDoorLeafMinor: rate(20_000),
            perHeightStepMinor: rate(3_000),
          },
        };
      },
    ),
  };

  it("prices the seeded kitchen, and the seeded kitchen with every body resized to every odd width from 200 to 1000", () => {
    for (let widthMm = 200; widthMm <= 1_000; widthMm += 7) {
      const design = {
        ...KITCHEN_L_DESIGN,
        placements: KITCHEN_L_DESIGN.placements.map((placement) => ({
          ...placement,
          body: { ...placement.body, widthMm },
        })),
      };

      const result = priceDesign({
        design,
        catalog: CATALOG,
        book: anchoredBook,
        pricingVersion: anchoredBook.version,
        deepeningRows: MEASURED_DEEPENING_ROWS,
        availability: NOTHING_DISABLED,
      });

      expect(
        result.ok ? "ok" : `${result.failure.code}: ${result.failure.detail}`,
        `every body at ${String(widthMm)} mm`,
      ).toBe("ok");
    }
  });

  it("prices every cabinet of the seeded kitchen to an integer that is a whole number of bani, never negative", () => {
    const result = priceDesign({
      design: KITCHEN_L_DESIGN,
      catalog: CATALOG,
      book: anchoredBook,
      pricingVersion: anchoredBook.version,
      deepeningRows: MEASURED_DEEPENING_ROWS,
      availability: NOTHING_DISABLED,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const line of result.priced.lines) {
      expect(Number.isSafeInteger(line.amountMinor), line.lineId).toBe(true);
      expect(line.amountMinor, line.lineId).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("the plan's QA grid through priceDesign (§12): every millimetre of width against the heights 350 and 700, plus and minus one", () => {
  const CATALOG = KITCHEN_L_BODY_CATALOG;
  const GRID_RULE: AnchoredFormula = {
    shape: "anchored-width-height-and-door-leaves",
    anchorWidthMm: 600,
    anchorHeightMm: 700,
    anchorMinor: 9_000_000,
    perStepWiderMinor: 70_000,
    perStepNarrowerMinor: 30_000,
    perExtraDoorLeafMinor: 110_000,
    perHeightStepMinor: 13_000,
  };

  it("prices every body from 150 to 1200 mm wide at 349, 350, 351, 699, 700 and 701 mm tall as the oracle does", () => {
    const rule: CabinetPriceRule = {
      ruleId: "cabinet.anchored-grid",
      buildId: "base-cabinet",
      formula: GRID_RULE,
    };
    const book: PriceBook = { ...SAMPLE_PRICE_BOOK, cabinetRules: [rule] };

    for (const heightMm of [349, 350, 351, 699, 700, 701]) {
      for (let widthMm = 150; widthMm <= 1_200; widthMm += 1) {
        const result = priceDesign({
          design: {
            ...KITCHEN_L_DESIGN,
            placements: [
              {
                id: "p1",
                wall: "A",
                alongMm: 1300,
                y0Mm: 0,
                body: { buildId: "base-cabinet", widthMm, heightMm },
              },
            ],
          },
          catalog: CATALOG,
          book,
          pricingVersion: book.version,
          deepeningRows: MEASURED_DEEPENING_ROWS,
          availability: NOTHING_DISABLED,
        });
        const expected = oracleAmount(GRID_RULE, bodyOf(widthMm, heightMm, 1));

        expect(result.ok, `${String(widthMm)} x ${String(heightMm)}`).toBe(
          true,
        );
        if (!result.ok) return;
        const line = result.priced.lines.find(
          (candidate) => candidate.kind === "cabinet",
        );
        expect(
          BigInt(line?.amountMinor ?? -1),
          `${String(widthMm)} x ${String(heightMm)}`,
        ).toBe(expected);
      }
    }
  });
});

describe("a fixed-size row looks up the width rounded up to the pricing step (A-2, A-7)", () => {
  const body = (widthMm: number): PricedBody => ({
    widthMm,
    heightMm: 700,
    doorLeafCount: 0,
  });

  it("prices a body at the smallest size at least as wide as its rounded-up width, even on a list the parser has not seen", () => {
    const offStep = {
      shape: "price-per-size" as const,
      sizes: [
        { widthMm: 280, amountMinor: 1 },
        { widthMm: 300, amountMinor: 2 },
      ],
    };

    expect(amountForBody(offStep, body(275))).toBe(2);
    expect(amountForBody(offStep, body(251))).toBe(2);
    expect(amountForBody(offStep, body(250))).toBe(1);
  });

  it("answers the same for every width inside one pricing step", () => {
    const sizes = [
      { widthMm: 200, amountMinor: 11 },
      { widthMm: 300, amountMinor: 17 },
    ];
    const formula = { shape: "price-per-size" as const, sizes };

    for (let widthMm = 1; widthMm <= 300; widthMm += 1) {
      const rounded = roundUpToPriceStepMm(widthMm);

      expect(amountForBody(formula, body(widthMm)), String(widthMm)).toBe(
        amountForBody(formula, body(rounded)),
      );
    }
  });

  it("refuses at 301 and prices at 300", () => {
    const formula = {
      shape: "price-per-size" as const,
      sizes: [{ widthMm: 300, amountMinor: 17 }],
    };

    expect(amountForBody(formula, body(300))).toBe(17);
    expect(() => amountForBody(formula, body(301))).toThrow(/No listed size/);
  });
});
