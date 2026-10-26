// The anchored shapes' arithmetic (ADR 0175, ADR 0177 A-2, A-3, A-4, A-7), swept over drawn rates and widths.
// Every rate is drawn: no figure here is a price, and no test asserts one. The oracle in this file restates the
// rule from the ruling in plain integer arithmetic, so a wrong rounding direction or a swapped step cannot
// agree with it by sharing code.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { deriveDoorCount } from "../../src/catalog.js";
import { MAX_DESIGN_DIMENSION_MM } from "../../src/design-bounds.js";
import {
  ANCHORED_SHAPES,
  MalformedPriceDimensionError,
  MissingAnchorLeafCountError,
  NoPriceForSizeError,
  PRICE_STEP_MM,
  roundUpToPriceStepMm,
  type AnchoredFormula,
  type AnchoredShape,
  type PricedSize,
} from "../../src/pricing/anchored-price-formula.js";
import { MAX_PRICE_COEFFICIENT_MINOR } from "../../src/pricing/parse-price-book.js";
import {
  amountForBody,
  MalformedPriceCoefficientError,
  type PricedBody,
} from "../../src/pricing/price-book.js";

const CATALOGUE_MIN_WIDTH_MM = 200;
const CATALOGUE_MAX_WIDTH_MM = 800;
const NO_DOOR_TIERS = 0;

/** A body's leaves at a width, as a row with this many stacked door bands derives them. */
function leavesAt(doorTiers: number): (widthMm: number) => number {
  return (widthMm) => doorTiers * deriveDoorCount(widthMm);
}

function bodyOf(
  widthMm: number,
  options: { readonly heightMm?: number; readonly doorTiers?: number } = {},
): PricedBody {
  const leaves = leavesAt(options.doorTiers ?? 1);
  return {
    widthMm,
    heightMm: options.heightMm ?? 700,
    doorLeafCount: leaves(widthMm),
    doorLeafCountAt: leaves,
  };
}

interface DrawnRates {
  readonly anchorMinor: number;
  readonly perStepWiderMinor: number;
  readonly perStepNarrowerMinor: number;
  readonly perExtraDoorLeafMinor: number;
  readonly perHeightStepMinor: number;
  readonly anchorWidthMm: number;
  readonly anchorHeightMm: number;
}

const ratesArbitrary: fc.Arbitrary<DrawnRates> = fc.record({
  anchorMinor: fc.integer({ min: 0, max: 100_000_000 }),
  perStepWiderMinor: fc.integer({ min: 0, max: 1_000_000 }),
  perStepNarrowerMinor: fc.integer({ min: 0, max: 1_000_000 }),
  perExtraDoorLeafMinor: fc.integer({ min: 0, max: 1_000_000 }),
  perHeightStepMinor: fc.integer({ min: 0, max: 1_000_000 }),
  anchorWidthMm: fc.integer({ min: 4, max: 16 }).map((n) => n * PRICE_STEP_MM),
  anchorHeightMm: fc.integer({ min: 4, max: 20 }).map((n) => n * PRICE_STEP_MM),
});

const catalogueWidthArbitrary = fc.integer({
  min: CATALOGUE_MIN_WIDTH_MM,
  max: CATALOGUE_MAX_WIDTH_MM,
});

function formulaOf(shape: AnchoredShape, rates: DrawnRates): AnchoredFormula {
  const door = shape.includes("door-leaves");
  const height = shape.includes("height");
  return {
    shape,
    anchorWidthMm: rates.anchorWidthMm,
    anchorMinor: rates.anchorMinor,
    perStepWiderMinor: rates.perStepWiderMinor,
    perStepNarrowerMinor: rates.perStepNarrowerMinor,
    ...(door ? { perExtraDoorLeafMinor: rates.perExtraDoorLeafMinor } : {}),
    ...(height
      ? {
          anchorHeightMm: rates.anchorHeightMm,
          perHeightStepMinor: rates.perHeightStepMinor,
        }
      : {}),
  };
}

/** The ruling, restated: the width and height round up, steps are counted from the anchor, a step down takes
 *  the narrower rate off, and the door step is leaves at the actual width less leaves at the anchor's. */
function oracleAmount(
  shape: AnchoredShape,
  rates: DrawnRates,
  body: { readonly widthMm: number; readonly heightMm: number },
  doorTiers: number,
): number {
  const widthSteps =
    Math.ceil(body.widthMm / PRICE_STEP_MM) -
    rates.anchorWidthMm / PRICE_STEP_MM;
  const widthTerm =
    widthSteps >= 0
      ? widthSteps * rates.perStepWiderMinor
      : widthSteps * rates.perStepNarrowerMinor;
  const heightSteps =
    Math.ceil(body.heightMm / PRICE_STEP_MM) -
    rates.anchorHeightMm / PRICE_STEP_MM;
  const heightTerm = shape.includes("height")
    ? heightSteps * rates.perHeightStepMinor
    : 0;
  const leafDelta =
    doorTiers * deriveDoorCount(body.widthMm) -
    doorTiers * deriveDoorCount(rates.anchorWidthMm);
  const doorTerm = shape.includes("door-leaves")
    ? leafDelta * rates.perExtraDoorLeafMinor
    : 0;
  return rates.anchorMinor + widthTerm + heightTerm + doorTerm;
}

function priceOf(
  shape: AnchoredShape,
  rates: DrawnRates,
  body: PricedBody,
): number {
  const amount = amountForBody(formulaOf(shape, rates), body);
  if (amount === undefined) throw new Error(`${shape} has no arm`);
  return amount;
}

const shapeArbitrary = fc.constantFrom(...ANCHORED_SHAPES);
const NON_DOOR_SHAPES = ANCHORED_SHAPES.filter(
  (shape) => !shape.includes("door-leaves"),
);
const DOOR_SHAPES = ANCHORED_SHAPES.filter((shape) =>
  shape.includes("door-leaves"),
);

describe("round-up to the pricing step (A-2, A-4)", () => {
  propertyTest.prop([fc.integer({ min: 1, max: MAX_DESIGN_DIMENSION_MM })])(
    "lands on the next multiple at or above the dimension, never below it and never a whole step above",
    (millimetres) => {
      const rounded = roundUpToPriceStepMm(millimetres);

      expect(rounded % PRICE_STEP_MM).toBe(0);
      expect(rounded).toBeGreaterThanOrEqual(millimetres);
      expect(rounded - millimetres).toBeLessThan(PRICE_STEP_MM);
    },
  );

  it("leaves a multiple alone and lifts one millimetre past it to the next", () => {
    expect(roundUpToPriceStepMm(600)).toBe(600);
    expect(roundUpToPriceStepMm(601)).toBe(650);
    expect(roundUpToPriceStepMm(575)).toBe(600);
    expect(roundUpToPriceStepMm(560)).toBe(600);
    expect(roundUpToPriceStepMm(551)).toBe(600);
    expect(roundUpToPriceStepMm(550)).toBe(550);
  });
});

describe("an anchored price equals the rule, for every shape (P1-a)", () => {
  propertyTest.prop([
    shapeArbitrary,
    ratesArbitrary,
    catalogueWidthArbitrary,
    fc.integer({ min: 300, max: 1500 }),
    fc.constantFrom(1, 2),
  ])(
    "matches the ruling restated in integers at any width and height",
    (shape, rates, widthMm, heightMm, doorTiers) => {
      const body = bodyOf(widthMm, { heightMm, doorTiers });

      expect(priceOf(shape, rates, body)).toBe(
        oracleAmount(shape, rates, body, doorTiers),
      );
    },
  );

  propertyTest.prop([
    fc.constantFrom(...NON_DOOR_SHAPES),
    ratesArbitrary,
    catalogueWidthArbitrary,
    fc.integer({ min: 300, max: 1500 }),
  ])(
    "prices a width as the width rounded up, where no door term reads it",
    (shape, rates, widthMm, heightMm) => {
      const rounded = roundUpToPriceStepMm(widthMm);

      expect(priceOf(shape, rates, bodyOf(widthMm, { heightMm }))).toBe(
        priceOf(shape, rates, bodyOf(rounded, { heightMm })),
      );
    },
  );

  propertyTest.prop([
    fc.constantFrom(
      ...ANCHORED_SHAPES.filter((shape) => shape.includes("height")),
    ),
    ratesArbitrary,
    fc.integer({ min: 300, max: 1500 }),
  ])("prices a height as the height rounded up", (shape, rates, heightMm) => {
    const rounded = roundUpToPriceStepMm(heightMm);

    expect(priceOf(shape, rates, bodyOf(600, { heightMm }))).toBe(
      priceOf(shape, rates, bodyOf(600, { heightMm: rounded })),
    );
  });

  propertyTest.prop([
    fc.constantFrom(...DOOR_SHAPES),
    ratesArbitrary,
    catalogueWidthArbitrary,
    fc.constantFrom(1, 2),
  ])(
    "prices a door shape as its rounded width wherever rounding does not cross the door threshold, and by exactly one door step where it does",
    (shape, rates, widthMm, doorTiers) => {
      const rounded = roundUpToPriceStepMm(widthMm);
      const tiers = { doorTiers };
      const crossedLeaves =
        doorTiers * (deriveDoorCount(rounded) - deriveDoorCount(widthMm));

      expect(priceOf(shape, rates, bodyOf(rounded, tiers))).toBe(
        priceOf(shape, rates, bodyOf(widthMm, tiers)) +
          crossedLeaves * rates.perExtraDoorLeafMinor,
      );
    },
  );

  propertyTest.prop([shapeArbitrary, ratesArbitrary, fc.constantFrom(1, 2)])(
    "prices the anchor width and height at exactly the anchor amount",
    (shape, rates, doorTiers) => {
      const body = bodyOf(rates.anchorWidthMm, {
        heightMm: rates.anchorHeightMm,
        doorTiers,
      });

      expect(priceOf(shape, rates, body)).toBe(rates.anchorMinor);
    },
  );

  propertyTest.prop([
    shapeArbitrary,
    ratesArbitrary,
    catalogueWidthArbitrary,
    catalogueWidthArbitrary,
    fc.constantFrom(1, 2),
  ])(
    "never prices a wider body below a narrower one, while the steps and the door term are not negative",
    (shape, rates, firstMm, secondMm, doorTiers) => {
      const narrowerMm = Math.min(firstMm, secondMm);
      const widerMm = Math.max(firstMm, secondMm);

      expect(
        priceOf(shape, rates, bodyOf(narrowerMm, { doorTiers })),
      ).toBeLessThanOrEqual(
        priceOf(shape, rates, bodyOf(widerMm, { doorTiers })),
      );
    },
  );

  it("prices 575 and 560 as 600 and 601 as 650, on the anchored shape (the old 575-at-575 is the linear shape's)", () => {
    const rates: DrawnRates = {
      anchorMinor: 1_000_000,
      perStepWiderMinor: 70_000,
      perStepNarrowerMinor: 30_000,
      perExtraDoorLeafMinor: 0,
      perHeightStepMinor: 0,
      anchorWidthMm: 600,
      anchorHeightMm: 700,
    };
    const priceAt = (widthMm: number) =>
      priceOf("anchored-width", rates, bodyOf(widthMm));

    expect(priceAt(575)).toBe(priceAt(600));
    expect(priceAt(560)).toBe(priceAt(600));
    expect(priceAt(601)).toBe(priceAt(650));
    expect(priceAt(650) - priceAt(600)).toBe(rates.perStepWiderMinor);
    expect(priceAt(550)).toBe(priceAt(600) - rates.perStepNarrowerMinor);
  });
});

describe("the door term follows the actual width, never the rounded one (A-3, P1-c)", () => {
  /** An anchor at one leaf, so every width at or above the threshold is one door step away. */
  const oneLeafAnchor: DrawnRates = {
    anchorMinor: 0,
    perStepWiderMinor: 0,
    perStepNarrowerMinor: 0,
    perExtraDoorLeafMinor: 1_000_000,
    perHeightStepMinor: 0,
    anchorWidthMm: 400,
    anchorHeightMm: 700,
  };

  propertyTest.prop([
    fc.integer({ min: PRICE_STEP_MM * 9 + 1, max: 499 }),
    fc.constantFrom(1, 2),
  ])(
    "charges a body one leaf wide no second leaf's panel, at any width from 451 to 499",
    (widthMm, doorTiers) => {
      const amount = priceOf(
        "anchored-width-and-door-leaves",
        oneLeafAnchor,
        bodyOf(widthMm, { doorTiers }),
      );

      expect(deriveDoorCount(widthMm)).toBe(1);
      expect(amount).toBe(0);
    },
  );

  it("charges the second leaf at 500 and not at 499, on both sides of the threshold", () => {
    const priceAt = (widthMm: number) =>
      priceOf("anchored-width-and-door-leaves", oneLeafAnchor, bodyOf(widthMm));

    expect(priceAt(499)).toBe(0);
    expect(priceAt(500)).toBe(oneLeafAnchor.perExtraDoorLeafMinor);
  });

  it("gives one leaf's panel back below the door threshold when the anchor is above it", () => {
    const twoLeafAnchor = { ...oneLeafAnchor, anchorWidthMm: 600 };

    expect(
      priceOf("anchored-width-and-door-leaves", twoLeafAnchor, bodyOf(499)),
    ).toBe(-oneLeafAnchor.perExtraDoorLeafMinor);
  });

  it("refuses to evaluate an anchored door shape for a body that cannot say its leaves at the anchor", () => {
    const withoutAnchorLeaves: PricedBody = {
      widthMm: 600,
      heightMm: 700,
      doorLeafCount: 2,
    };

    expect(() =>
      amountForBody(
        formulaOf("anchored-width-and-door-leaves", oneLeafAnchor),
        withoutAnchorLeaves,
      ),
    ).toThrow(MissingAnchorLeafCountError);
  });

  it("needs no leaf count for a shape that reads no door term", () => {
    const withoutAnchorLeaves: PricedBody = {
      widthMm: 600,
      heightMm: 700,
      doorLeafCount: 0,
    };

    const rates = { ...oneLeafAnchor, anchorMinor: 5, perStepWiderMinor: 3 };

    expect(
      amountForBody(formulaOf("anchored-width", rates), withoutAnchorLeaves),
    ).toBe(5 + 4 * 3);
  });
});

describe("a fixed-size row prices at the smallest listed size that reaches the body (A-7, P1-d)", () => {
  const sizesArbitrary = fc
    .uniqueArray(fc.integer({ min: 1, max: 40 }), {
      minLength: 1,
      maxLength: 12,
    })
    .map((steps) => steps.sort((a, b) => a - b))
    .chain((steps) =>
      fc
        .array(fc.integer({ min: 0, max: 500_000_000 }), {
          minLength: steps.length,
          maxLength: steps.length,
        })
        .map((amounts) =>
          steps.map(
            (step, index): PricedSize => ({
              widthMm: step * PRICE_STEP_MM,
              amountMinor: amounts[index] ?? 0,
            }),
          ),
        ),
    );

  /** A list and a width drawn on the side of it the property is about, so neither arm can go unexercised. */
  const listWithAWidthItReaches = sizesArbitrary.chain((sizes) =>
    fc
      .integer({ min: 1, max: widestOf(sizes) })
      .map((widthMm) => [sizes, widthMm] as const),
  );
  const listWithAWidthPastIt = sizesArbitrary.chain((sizes) =>
    fc
      .integer({ min: widestOf(sizes) + 1, max: MAX_DESIGN_DIMENSION_MM })
      .map((widthMm) => [sizes, widthMm] as const),
  );

  function widestOf(sizes: readonly PricedSize[]): number {
    return Math.max(...sizes.map((size) => size.widthMm));
  }

  function priceWith(sizes: readonly PricedSize[], widthMm: number) {
    return amountForBody(
      { shape: "price-per-size", sizes },
      bodyOf(widthMm, { doorTiers: NO_DOOR_TIERS }),
    );
  }

  propertyTest.prop([listWithAWidthItReaches])(
    "answers the first listed size at least as wide, in whatever order the list is held",
    ([sizes, widthMm]) => {
      const expected = sizes.find((size) => size.widthMm >= widthMm);

      expect(priceWith(sizes, widthMm)).toBe(expected?.amountMinor);
      expect(priceWith([...sizes].reverse(), widthMm)).toBe(
        expected?.amountMinor,
      );
    },
  );

  propertyTest.prop([listWithAWidthPastIt])(
    "refuses every body wider than the widest listed size, never answering a nearer size or zero",
    ([sizes, widthMm]) => {
      expect(() => priceWith(sizes, widthMm)).toThrow(NoPriceForSizeError);
    },
  );

  it("prices a listed width at that size and a width past the widest refuses, never zero and never the nearest size", () => {
    const sizes: readonly PricedSize[] = [
      { widthMm: 200, amountMinor: 11_000 },
      { widthMm: 300, amountMinor: 17_000 },
    ];
    const priceAt = (widthMm: number) =>
      amountForBody(
        { shape: "price-per-size", sizes },
        bodyOf(widthMm, { doorTiers: NO_DOOR_TIERS }),
      );

    expect(priceAt(200)).toBe(11_000);
    expect(priceAt(201)).toBe(17_000);
    expect(priceAt(300)).toBe(17_000);
    expect(() => priceAt(301)).toThrow(NoPriceForSizeError);
  });

  it("looks a size up by the width rounded up to the step, even in a list the parser never saw", () => {
    const offStep: readonly PricedSize[] = [{ widthMm: 225, amountMinor: 9 }];

    expect(priceWith(offStep, 200)).toBe(9);
    expect(() => priceWith(offStep, 201)).toThrow(NoPriceForSizeError);
  });

  it("names the width and the listed sizes in the refusal", () => {
    expect(() =>
      amountForBody(
        {
          shape: "price-per-size",
          sizes: [{ widthMm: 300, amountMinor: 1 }],
        },
        bodyOf(350),
      ),
    ).toThrow(/350 mm.*300 mm/);
  });
});

describe("a dimension the arithmetic cannot read is thrown, never rounded into a price", () => {
  const rates: DrawnRates = {
    anchorMinor: 1,
    perStepWiderMinor: 1,
    perStepNarrowerMinor: 1,
    perExtraDoorLeafMinor: 1,
    perHeightStepMinor: 1,
    anchorWidthMm: 600,
    anchorHeightMm: 700,
  };

  it.each([575.5, 0, -50, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses a body width of %s",
    (widthMm) => {
      expect(() => priceOf("anchored-width", rates, bodyOf(widthMm))).toThrow(
        MalformedPriceDimensionError,
      );
    },
  );

  it.each([575.5, 0, Number.NaN])("refuses a body height of %s", (heightMm) => {
    expect(() =>
      priceOf("anchored-width-and-height", rates, bodyOf(600, { heightMm })),
    ).toThrow(MalformedPriceDimensionError);
  });

  it.each([601, 25, 0, -50])(
    "refuses an anchor width of %s, which is not a positive multiple of the step",
    (anchorWidthMm) => {
      expect(() =>
        priceOf("anchored-width", { ...rates, anchorWidthMm }, bodyOf(600)),
      ).toThrow(MalformedPriceDimensionError);
    },
  );
});

describe("every rate is checked, even where its count is zero", () => {
  const rates: DrawnRates = {
    anchorMinor: 1,
    perStepWiderMinor: 1,
    perStepNarrowerMinor: 1,
    perExtraDoorLeafMinor: 1,
    perHeightStepMinor: 1,
    anchorWidthMm: 600,
    anchorHeightMm: 700,
  };

  const CASES: readonly (readonly [AnchoredShape, keyof DrawnRates])[] = [
    ["anchored-width", "anchorMinor"],
    ["anchored-width", "perStepWiderMinor"],
    ["anchored-width", "perStepNarrowerMinor"],
    ["anchored-width-and-door-leaves", "perExtraDoorLeafMinor"],
    ["anchored-width-and-height", "perHeightStepMinor"],
  ];

  it.each(CASES)(
    "refuses a %s book whose %s is null, naming the field, at the anchor itself",
    (shape, field) => {
      const formula = {
        ...formulaOf(shape, rates),
        [field]: null,
      } as unknown as AnchoredFormula;
      const atTheAnchor = bodyOf(rates.anchorWidthMm, {
        heightMm: rates.anchorHeightMm,
      });

      expect(() => amountForBody(formula, atTheAnchor)).toThrow(
        MalformedPriceCoefficientError,
      );
      expect(() => amountForBody(formula, atTheAnchor)).toThrow(
        new RegExp(`"${field}"`),
      );
    },
  );
});

describe("the worst case an anchored shape can form stays exact at the bound every book is held to", () => {
  it("evaluates the largest rates over the largest dimensions to the exact integer", () => {
    const bound = MAX_PRICE_COEFFICIENT_MINOR;
    const formula: AnchoredFormula = {
      shape: "anchored-width-height-and-door-leaves",
      anchorWidthMm: PRICE_STEP_MM,
      anchorMinor: bound,
      perStepWiderMinor: bound,
      perStepNarrowerMinor: bound,
      perExtraDoorLeafMinor: bound,
      anchorHeightMm: PRICE_STEP_MM,
      perHeightStepMinor: bound,
    };
    const body = bodyOf(MAX_DESIGN_DIMENSION_MM, {
      heightMm: MAX_DESIGN_DIMENSION_MM,
      doorTiers: 2,
    });
    const stepsUp = BigInt(
      (MAX_DESIGN_DIMENSION_MM - PRICE_STEP_MM) / PRICE_STEP_MM,
    );
    const leavesUp =
      2n *
      BigInt(
        deriveDoorCount(MAX_DESIGN_DIMENSION_MM) -
          deriveDoorCount(PRICE_STEP_MM),
      );
    const widerSteps = stepsUp;
    const heightSteps = stepsUp;
    const exact = BigInt(bound) * (1n + widerSteps + heightSteps + leavesUp);

    expect(BigInt(amountForBody(formula, body) ?? Number.NaN)).toBe(exact);
    expect(exact).toBeLessThan(BigInt(Number.MAX_SAFE_INTEGER));
  });
});
