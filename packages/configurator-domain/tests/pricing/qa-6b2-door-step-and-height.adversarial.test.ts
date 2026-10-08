// No figure here is a price: every amount is read off the book under test or one built here (ADR 0001 decision 4).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { widthDerivedDoorLeafCount } from "../../src/cabinet-handles.js";
import {
  doorLeafHeightsMm,
  frontPopulationQueryFor,
} from "../../src/front-population.js";
import {
  HINGES_PER_DOOR_LEAF,
  HINGES_PER_TALL_DOOR_LEAF,
  TALL_DOOR_LEAF_THRESHOLD_MM,
} from "../../src/hardware-mechanisms.js";
import {
  buildableSizes,
  INSERTABLE_BODY_DEFINITIONS,
  resolveWidthRangesMm,
  toInsertableBody,
  TWO_DOOR_MIN_WIDTH_MM,
} from "../../src/catalog.js";
import { deriveDoorCount } from "../../src/door-count.js";
import type { CabinetBody, Design, DesignPlacement } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  amountForBody,
  type CabinetPriceRule,
  type PriceBook,
  type PriceCoefficientField,
  type PriceFormula,
} from "../../src/pricing/price-book.js";
import {
  priceDesign,
  type PriceDesignRequest,
} from "../../src/pricing/price-design.js";
import type {
  CabinetPriceLine,
  PriceLine,
  PricedDesign,
  PriceLineKind,
} from "../../src/pricing/price-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { projectDesignForDisplay } from "../../src/queries/design-projection.js";
import type { BodyDefinition } from "../../src/void-engine.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const BOOK = SAMPLE_PRICE_BOOK;

/** Both cabinet depths, so a whole-catalogue sweep covers both materialisations of the catalogue. */
const CABINET_DEPTHS_MM = [600, 700] as const;

function designOf(placements: readonly DesignPlacement[]): Design {
  return { ...KITCHEN_L_DESIGN, placements: [...placements] };
}

function placedAt(
  overrides: Omit<Partial<DesignPlacement>, "body"> & {
    readonly id: string;
    readonly body?: Partial<CabinetBody>;
  },
): DesignPlacement {
  return {
    wall: "A",
    alongMm: 1300,
    y0Mm: 1500,
    ...overrides,
    body: {
      buildId: "wall-cabinet",
      widthMm: 600,
      heightMm: 700,
      ...overrides.body,
    },
  };
}

function request(
  overrides: Partial<PriceDesignRequest> = {},
): PriceDesignRequest {
  return {
    design: KITCHEN_L_DESIGN,
    catalog: CATALOG,
    book: BOOK,
    pricingVersion: BOOK.version,
    ...overrides,
  };
}

function priceOrFail(
  overrides: Partial<PriceDesignRequest> = {},
): PricedDesign {
  const result = priceDesign(request(overrides));
  if (!result.ok) {
    throw new Error(`${result.failure.code}: ${result.failure.detail}`);
  }
  return result.priced;
}

function refusalFrom(overrides: Partial<PriceDesignRequest>) {
  const result = priceDesign(request(overrides));
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected a refusal");
  expect(result).not.toHaveProperty("priced");
  return result.failure;
}

function cabinetLinesOf(priced: PricedDesign): readonly CabinetPriceLine[] {
  return priced.lines.filter(
    (line): line is CabinetPriceLine => line.kind === "cabinet",
  );
}

function lineOfKind(priced: PricedDesign, kind: PriceLineKind): PriceLine {
  const line = priced.lines.find((candidate) => candidate.kind === kind);
  if (!line) throw new Error(`no ${kind} line`);
  return line;
}

/** One body, priced alone, so an amount is read without a whole kitchen's lines around it. */
function amountOfOneBody(
  body: Partial<CabinetBody>,
  overrides: Partial<PriceDesignRequest> = {},
): number {
  const priced = priceOrFail({
    design: designOf([placedAt({ id: "solo", body })]),
    ...overrides,
  });
  const amount = cabinetLinesOf(priced)[0]?.amountMinor;
  if (amount === undefined) throw new Error("no cabinet line was published");
  return amount;
}

function ruleFor(book: PriceBook, buildId: string): CabinetPriceRule {
  const rule = book.cabinetRules.find(
    (candidate) => candidate.buildId === buildId,
  );
  if (!rule) throw new Error(`the book prices no "${buildId}"`);
  return rule;
}

function bookPricing(buildId: string, formula: PriceFormula): PriceBook {
  return {
    ...BOOK,
    cabinetRules: BOOK.cabinetRules.map((candidate) =>
      candidate.buildId === buildId ? { ...candidate, formula } : candidate,
    ),
  };
}

function coefficient(
  formula: PriceFormula,
  field: PriceCoefficientField,
): number {
  const held = (formula as unknown as Record<string, unknown>)[field];
  if (typeof held !== "number") {
    throw new Error(`the formula declares no numeric "${field}"`);
  }
  return held;
}

function hasCoefficient(
  formula: PriceFormula,
  field: PriceCoefficientField,
): boolean {
  return (
    typeof (formula as unknown as Record<string, unknown>)[field] === "number"
  );
}

/** Catalogue rows the two ADR 0068 terms apply to, read off the catalogue's flags rather than a hand-kept list. */
function insertableRowsWhere(
  predicate: (definition: BodyDefinition) => boolean,
): readonly string[] {
  return INSERTABLE_BODY_DEFINITIONS.filter(([, definition]) =>
    predicate(definition),
  ).map(([buildId]) => buildId);
}

const HEIGHT_FLEX_ROWS = insertableRowsWhere(
  (definition) => definition.heightFlex === true,
);
const DOOR_COUNT_ROWS = insertableRowsWhere(
  (definition) => definition.doorCountFollowsWidth === true,
);

/** Every whole mm a row may be built at: a cabinetry row yields the continuum, not only the panel's 50 mm ladder. */
function buildableWidthsOf(
  buildId: string,
  definition: BodyDefinition,
): readonly number[] {
  const insertable = toInsertableBody(buildId, definition);
  if (!insertable) return [];
  const widths = new Set<number>();
  for (const range of resolveWidthRangesMm(insertable)) {
    for (let widthMm = range.minMm; widthMm <= range.maxMm; widthMm += 1) {
      widths.add(widthMm);
    }
  }
  for (const size of buildableSizes(
    insertable.minWidthMm,
    insertable.sizesMm,
  )) {
    widths.add(size);
  }
  return [...widths].sort((a, b) => a - b);
}

describe("money is integer arithmetic, and no path can make it anything else", () => {
  it("sums twenty-five wide bodies to an exact integer, order-independently", () => {
    // Float addition is not associative, so the sum also runs in reverse; only an exact integer survives both.
    const placements = Array.from({ length: 25 }, (_unused, index) =>
      placedAt({
        id: `p${String(index)}`,
        alongMm: 100 + index,
        body: { widthMm: 1000 + index * 7, heightMm: 700 + index },
      }),
    );

    const priced = priceOrFail({ design: designOf(placements) });
    const amounts = priced.lines.map((line) => line.amountMinor);

    expect(amounts.every((amount) => Number.isSafeInteger(amount))).toBe(true);
    expect(Number.isSafeInteger(priced.totalMinor)).toBe(true);
    expect(priced.totalMinor).toBe(amounts.reduce((sum, a) => sum + a, 0));
    expect(priced.totalMinor).toBe(
      [...amounts].reverse().reduce((sum, a) => sum + a, 0),
    );
    expect(
      priceOrFail({ design: designOf([...placements].reverse()) }).totalMinor,
    ).toBe(priced.totalMinor);
  });

  it("divides nothing and rounds nothing, in the source and not only in the answer", () => {
    // A later Math.round would keep every total an integer yet move an amount, so absence is asserted on the source.
    const sources = [
      "src/pricing/price-book.ts",
      "src/pricing/price-design.ts",
      "src/pricing/price-lines.ts",
    ];
    for (const source of sources) {
      const code = readPackageSource(source);
      const executable = withoutCommentsOrStrings(code);
      expect(executable).not.toMatch(/Math\.(round|floor|ceil|trunc)/);
      expect(executable).not.toMatch(/toFixed|toPrecision/);
      expect(executable).not.toMatch(/[^/*\s]\s*\/\s*[^/*=]/);
    }
  });

  propertyTest.prop([
    fc.integer({ min: -1_000_000, max: 1_000_000 }),
    fc.integer({ min: -1000, max: 1000 }),
    fc.integer({ min: -1000, max: 1000 }),
    fc.integer({ min: -1000, max: 1000 }),
    fc.integer({ min: 1, max: 3000 }),
    fc.integer({ min: 1, max: 3000 }),
    fc.integer({ min: 0, max: 8 }),
  ])(
    "answers an exact integer for every integer coefficient, sign included",
    (
      baseMinor,
      perWidthMillimetreMinor,
      perHeightMillimetreMinor,
      perDoorLeafMinor,
      widthMm,
      heightMm,
      doorLeafCount,
    ) => {
      // Zero and negative rates are swept deliberately: a manufacturer typing a minus sign produces a negative one.
      const amount = amountForBody(
        {
          shape: "linear-in-width-height-and-door-leaves",
          baseMinor,
          perWidthMillimetreMinor,
          perHeightMillimetreMinor,
          perDoorLeafMinor,
        },
        { widthMm, heightMm, doorLeafCount },
      );

      expect(amount).toBe(
        baseMinor +
          perWidthMillimetreMinor * widthMm +
          perHeightMillimetreMinor * heightMm +
          perDoorLeafMinor * doorLeafCount,
      );
      expect(Number.isSafeInteger(amount)).toBe(true);
    },
  );

  /** An odd multiplier (499 mm wide, 701 mm high) keeps the half a half: 0.5 × 700 is whole and would pass
   *  for the wrong reason. */
  const HALF_COEFFICIENTS = [
    { field: "perWidthMillimetreMinor", value: 0.5 },
    { field: "perHeightMillimetreMinor", value: 0.5 },
    { field: "perDoorLeafMinor", value: 0.5 },
    { field: "baseMinor", value: -0.5 },
  ] as const;

  for (const half of HALF_COEFFICIENTS) {
    it(`refuses rather than rounds a half in ${half.field}`, () => {
      const formula = {
        ...ruleFor(BOOK, "wall-cabinet").formula,
        [half.field]: half.value,
      } as PriceFormula;

      const failure = refusalFrom({
        design: designOf([
          placedAt({ id: "solo", body: { widthMm: 499, heightMm: 701 } }),
        ]),
        book: bookPricing("wall-cabinet", formula),
      });

      expect(failure.code).toBe("INVALID_AMOUNT");
      expect(failure.id).toBe("cabinet.wall-cabinet");
    });
  }

  const UNUSABLE_COEFFICIENTS: readonly {
    readonly name: string;
    readonly value: unknown;
  }[] = [
    { name: "an absent coefficient", value: undefined },
    { name: "an infinite coefficient", value: Number.POSITIVE_INFINITY },
    { name: "a NaN coefficient", value: Number.NaN },
    { name: "a coefficient past the safe-integer range", value: 2 ** 62 },
  ];

  for (const unusable of UNUSABLE_COEFFICIENTS) {
    it(`refuses ${unusable.name} on the height term rather than pricing around it`, () => {
      const formula = {
        ...ruleFor(BOOK, "wall-cabinet").formula,
        perHeightMillimetreMinor: unusable.value,
      } as unknown as PriceFormula;

      expect(
        refusalFrom({
          design: designOf([placedAt({ id: "solo" })]),
          book: bookPricing("wall-cabinet", formula),
        }).code,
      ).toBe("INVALID_AMOUNT");
    });
  }

  /** Values that multiply to a whole number rather than NaN (`null × 700` is 0), so the integer check alone
   *  would price them as though the height term did not apply. */
  const SILENTLY_ZEROING_COEFFICIENTS: readonly {
    readonly name: string;
    readonly value: unknown;
  }[] = [
    { name: "null", value: null },
    { name: "false", value: false },
    { name: "an empty array", value: [] },
    { name: "empty text", value: "" },
  ];

  it("holds every coefficient to being a number, not only its answer to being an integer", () => {
    const refused: string[] = [];
    const priced: string[] = [];

    for (const zeroing of SILENTLY_ZEROING_COEFFICIENTS) {
      const unusable = bookPricing("wall-cabinet", {
        ...ruleFor(BOOK, "wall-cabinet").formula,
        perHeightMillimetreMinor: zeroing.value,
      } as unknown as PriceFormula);
      const result = priceDesign(
        request({
          design: designOf([placedAt({ id: "solo" })]),
          book: unusable,
        }),
      );
      (result.ok ? priced : refused).push(zeroing.name);
    }

    expect(priced).toEqual([]);
    expect(refused).toEqual(
      SILENTLY_ZEROING_COEFFICIENTS.map((zeroing) => zeroing.name),
    );
  });
});

describe("one composition of the door count, and no second derivation anywhere", () => {
  it("has no module under pricing/ deriving a door count of its own", () => {
    // A second reader calling deriveDoorCount directly would quietly under-count every banded cabinet.
    for (const source of [
      "src/pricing/price-book.ts",
      "src/pricing/price-design.ts",
      "src/pricing/price-lines.ts",
      "src/pricing/sample-price-book.ts",
    ]) {
      const executable = withoutCommentsOrStrings(readPackageSource(source));
      expect(executable).not.toMatch(/deriveDoorCount/);
      expect(executable).not.toMatch(/doorTiers/);
      expect(executable).not.toMatch(/TWO_DOOR_MIN_WIDTH_MM/);
    }
  });

  it("calls deriveDoorCount from exactly four modules, and each for a different question", () => {
    // The whole caller population, pinned: door-count.ts declares it, catalog.ts asks it for a label,
    // cabinet-handles.ts multiplies it by doorTiers, and front-population.ts counts leaves per band for the hinge count
    // (ADR 0070). A fifth caller is a second derivation.
    const calling = packageSourceFiles().filter((file) =>
      withoutCommentsOrStrings(readPackageSource(file)).includes(
        "deriveDoorCount",
      ),
    );

    expect(calling).toEqual([
      "src/cabinet-handles.ts",
      "src/catalog.ts",
      "src/door-count.ts",
      "src/front-population.ts",
    ]);
  });

  it("multiplies doorTiers by a derived door count in exactly one module", () => {
    const composing = packageSourceFiles().filter((file) =>
      /doorTiers[^;]*deriveDoorCount\(/.test(
        withoutCommentsOrStrings(readPackageSource(file)),
      ),
    );

    expect(composing).toEqual(["src/cabinet-handles.ts"]);
  });

  /** One minor unit per hinge, so the hardware amount divides back to a count with no rounding. */
  const ONE_MINOR_UNIT_PER_HINGE = 1;

  /** Charges for hinges and nothing else, so the hardware amount reads as a hinge count. */
  function hingeOnlyBook(perHingeMinor: number): PriceBook {
    return {
      ...BOOK,
      hardware: {
        ...BOOK.hardware,
        tiers: BOOK.hardware.tiers.map((tier) => ({
          ...tier,
          perHingeMinor,
          perDrawerMinor: 0,
          perPushToOpenMinor: 0,
        })),
      },
    };
  }

  /** Hinges for these leaves: two each, three above the tall threshold. Recomposed from the leaf heights because
   *  tall-pantry has two bands and a flat multiplier would agree with itself while being wrong. */
  function hingesOn(leafHeightsMm: readonly number[]): number {
    return leafHeightsMm.reduce(
      (total, leafHeightMm) =>
        total +
        (leafHeightMm > TALL_DOOR_LEAF_THRESHOLD_MM
          ? HINGES_PER_TALL_DOOR_LEAF
          : HINGES_PER_DOOR_LEAF),
      0,
    );
  }

  const LEAF_ROWS = [
    { buildId: "wall-cabinet", handlesPerLeaf: 1 },
    { buildId: "base-cabinet", handlesPerLeaf: 1 },
    { buildId: "tall-pantry", handlesPerLeaf: 1 },
  ] as const;

  for (const row of LEAF_ROWS) {
    it(`bills ${row.buildId}'s hinges and its door step off the same count, at every width`, () => {
      // The leaf count billed by the price step (difference between two books differing only in perDoorLeafMinor) must
      // equal the count the hardware line is billed over (a hinge-only tier), at every width including the threshold.
      const definition = CATALOG.get(row.buildId);
      if (!definition) throw new Error(`fixture has no "${row.buildId}"`);
      const base = ruleFor(BOOK, row.buildId).formula;
      const stepMinor = 1;
      const withoutStep = bookPricing(row.buildId, {
        ...base,
        perDoorLeafMinor: 0,
      } as PriceFormula);
      const withStep = bookPricing(row.buildId, {
        ...base,
        perDoorLeafMinor: stepMinor,
      } as PriceFormula);

      for (const widthMm of sweptWidths(row.buildId, definition)) {
        const body = { buildId: row.buildId, widthMm, heightMm: 700 };
        const pricedLeaves =
          amountOfOneBody(body, { book: withStep }) -
          amountOfOneBody(body, { book: withoutStep });
        const billedHinges =
          lineOfKind(
            priceOrFail({
              design: designOf([placedAt({ id: "solo", body })]),
              book: hingeOnlyBook(ONE_MINOR_UNIT_PER_HINGE),
              selections: { hardwareTierId: BOOK.hardware.defaultTierId },
            }),
            "hardware",
          ).amountMinor / ONE_MINOR_UNIT_PER_HINGE;

        const leafHeightsMm = doorLeafHeightsMm(
          frontPopulationQueryFor({ body, definition }),
        );

        expect(pricedLeaves).toBe(
          widthDerivedDoorLeafCount({
            buildId: row.buildId,
            rule: definition.cabinetHandles,
            widthMm,
          }),
        );
        expect(leafHeightsMm.length).toBe(pricedLeaves * row.handlesPerLeaf);
        expect(billedHinges).toBe(hingesOn(leafHeightsMm));
      }
    });
  }

  it("steps at deriveDoorCount's threshold and at no width of its own", () => {
    // 499 and below is one door, 500 and above two (ADR 0035 decision 4); the price's only jump must land there.
    // price was billed for changes.
    const base = ruleFor(BOOK, "wall-cabinet").formula;
    const flat = bookPricing("wall-cabinet", {
      ...base,
      baseMinor: 0,
      perWidthMillimetreMinor: 0,
      perHeightMillimetreMinor: 0,
      perDoorLeafMinor: 1,
    } as PriceFormula);
    const transitions: number[] = [];
    let previous: number | undefined;

    for (let widthMm = 200; widthMm <= 800; widthMm += 1) {
      const leaves = amountOfOneBody(
        { buildId: "wall-cabinet", widthMm },
        { book: flat },
      );
      expect(leaves).toBe(deriveDoorCount(widthMm));
      if (previous !== undefined && leaves !== previous) {
        transitions.push(widthMm);
      }
      previous = leaves;
    }

    expect(transitions).toEqual([TWO_DOOR_MIN_WIDTH_MM]);
  });

  it("gives a banded column twice a one-band cabinet's leaf count at every width", () => {
    // deriveDoorCount answers leaves per band, so a two-band column is billed two steps where a one-band cabinet is
    // billed one; a consumer counting bands instead of leaves would halve this.
    for (const widthMm of [200, 300, 499, 500, 501, 600, 800]) {
      const leavesOf = (buildId: string) =>
        widthDerivedDoorLeafCount({
          buildId,
          rule: CATALOG.get(buildId)?.cabinetHandles,
          widthMm,
        });

      expect(leavesOf("tall-pantry")).toBe(2 * leavesOf("wall-cabinet"));
    }
  });
});

describe("every body a customer can stand in a design has a price", () => {
  it("prices every catalogue row at every buildable width, at both cabinet depths", () => {
    for (const cabinetDepthMm of CABINET_DEPTHS_MM) {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      for (const [buildId, definition] of catalog) {
        for (const widthMm of sweptWidths(buildId, definition)) {
          const heightMm = definition.nominalHeightMm ?? 700;
          const amount = amountOfOneBody(
            { buildId, widthMm, heightMm },
            { catalog },
          );

          expect(Number.isSafeInteger(amount)).toBe(true);
          expect(amount).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("refuses loudly for a body no rule prices, rather than billing it at nothing", () => {
    // A silently-zero body under-quotes the customer and looks like a cabinet that was included.
    const withoutTheWallCabinet: PriceBook = {
      ...BOOK,
      cabinetRules: BOOK.cabinetRules.filter(
        (rule) => rule.buildId !== "wall-cabinet",
      ),
    };

    const failure = refusalFrom({
      design: designOf([placedAt({ id: "solo" })]),
      book: withoutTheWallCabinet,
    });

    expect(failure.code).toBe("NO_RULE_FOR_BODY");
    expect(failure.id).toBe("wall-cabinet");
    expect(failure.placementId).toBe("solo");
  });

  it("prices every seeded cabinetry placement in the shipped kitchen with a positive amount", () => {
    // The exception keys on the book's `suppliedBy` declaration, never on the amount, so a cabinetry row that reaches
    // zero still fails (ADR 0107 decision 2).
    const lines = cabinetLinesOf(priceOrFail());
    const cabinetry = lines.filter((line) => line.suppliedBy !== "customer");
    const notSupplied = lines.filter((line) => line.suppliedBy === "customer");

    for (const line of cabinetry) {
      expect(Number.isSafeInteger(line.amountMinor), line.placementId).toBe(
        true,
      );
      expect(line.amountMinor, line.placementId).toBeGreaterThan(0);
    }

    // Not vacuous: the seeded kitchen holds both appliances and both bill nothing.
    expect(notSupplied.map((line) => line.pricedAsBuildId).sort()).toEqual([
      "fridge-free",
      "hood",
    ]);
    for (const line of notSupplied) {
      expect(line.amountMinor, line.placementId).toBe(0);
    }
  });
});

describe("taller costs more, on every shape that carries the term", () => {
  it("prices every height-flexible row with a strictly positive height coefficient", () => {
    // Monotonicity below is vacuous against a zero coefficient, so the coefficient is pinned first.
    for (const buildId of HEIGHT_FLEX_ROWS) {
      const { formula } = ruleFor(BOOK, buildId);
      expect(hasCoefficient(formula, "perHeightMillimetreMinor")).toBe(true);
      expect(coefficient(formula, "perHeightMillimetreMinor")).toBeGreaterThan(
        0,
      );
    }
  });

  for (const buildId of HEIGHT_FLEX_ROWS) {
    it(`prices ${buildId} strictly higher at every greater height`, () => {
      const widthMm = 600;
      let previous: number | undefined;
      for (let heightMm = 200; heightMm <= 900; heightMm += 1) {
        const amount = amountOfOneBody({ buildId, widthMm, heightMm });
        if (previous !== undefined) expect(amount).toBeGreaterThan(previous);
        previous = amount;
      }
    });

    it(`prices two instances of ${buildId} at one height identically`, () => {
      const body = { buildId, widthMm: 617, heightMm: 543 };
      expect(amountOfOneBody(body)).toBe(amountOfOneBody(body));
    });
  }

  propertyTest.prop([
    fc.constantFrom(...HEIGHT_FLEX_ROWS),
    fc.integer({ min: 150, max: 1200 }),
    fc.integer({ min: 150, max: 1200 }),
    fc.integer({ min: 200, max: 800 }),
  ])(
    "orders any two heights of one row the way the heights are ordered",
    (buildId, first, second, widthMm) => {
      const [lower, higher] =
        first <= second ? [first, second] : [second, first];
      const amountAt = (heightMm: number) =>
        amountOfOneBody({ buildId, widthMm, heightMm });

      if (lower === higher) {
        expect(amountAt(lower)).toBe(amountAt(higher));
        return;
      }
      expect(amountAt(higher)).toBeGreaterThan(amountAt(lower));
    },
  );

  it("adds height, and does not multiply it into the width", () => {
    // Price is not by front area: `a + b·w + c·h` keeps the width term when height changes; `k·w·h` does not.
    const widthStep = (heightMm: number) =>
      amountOfOneBody({ buildId: "wall-lift", widthMm: 601, heightMm }) -
      amountOfOneBody({ buildId: "wall-lift", widthMm: 600, heightMm });

    const steps = new Set([400, 600, 800, 900].map(widthStep));
    expect(steps.size).toBe(1);
    expect([...steps][0]).toBe(
      coefficient(
        ruleFor(BOOK, "wall-lift").formula,
        "perWidthMillimetreMinor",
      ),
    );
  });

  it("prices a row of fixed height identically at every height", () => {
    for (const buildId of ["base-3drawer", "tall-oven-tower", "hood"]) {
      const amounts = new Set(
        [300, 700, 820, 2200].map((heightMm) =>
          amountOfOneBody({ buildId, widthMm: 600, heightMm }),
        ),
      );
      expect(amounts.size).toBe(1);
    }
  });
});

describe("a second door costs more, and costs exactly what the book says it costs", () => {
  // The loop below generates its cases from this population, so an empty one would generate none and
  // stay green. The three ids themselves are pinned in pricing-seams.test.ts ("prices every row whose
  // door count follows its width with a shape that steps").
  it("sweeps three rows whose door count follows their width (premise)", () => {
    expect(DOOR_COUNT_ROWS).toHaveLength(3);
  });

  for (const buildId of DOOR_COUNT_ROWS) {
    it(`prices ${buildId} higher with two doors than with one, at one width`, () => {
      // Needs two books because a real cabinet cannot have both door counts at one width.
      const base = ruleFor(BOOK, buildId).formula;
      const widthMm = TWO_DOOR_MIN_WIDTH_MM;
      const heightMm = 700;
      const stepless = bookPricing(buildId, {
        ...base,
        perDoorLeafMinor: 0,
      } as PriceFormula);

      const twoDoors = amountOfOneBody({ buildId, widthMm, heightMm });
      const withNoStep = amountOfOneBody(
        { buildId, widthMm, heightMm },
        { book: stepless },
      );

      expect(twoDoors).toBeGreaterThan(withNoStep);
    });

    it(`steps ${buildId} by the declared perDoorLeafMinor and not by the width term`, () => {
      // Subtracting the width term from the step across the threshold leaves the door step: the declared coefficient
      // times the leaves the row's bands add.
      const { formula } = ruleFor(BOOK, buildId);
      const definition = CATALOG.get(buildId);
      if (!definition) throw new Error(`fixture has no "${buildId}"`);
      const heightMm = 700;
      const leavesAdded =
        widthDerivedDoorLeafCount({
          buildId,
          rule: definition.cabinetHandles,
          widthMm: TWO_DOOR_MIN_WIDTH_MM,
        }) -
        widthDerivedDoorLeafCount({
          buildId,
          rule: definition.cabinetHandles,
          widthMm: TWO_DOOR_MIN_WIDTH_MM - 1,
        });

      const across =
        amountOfOneBody({ buildId, widthMm: TWO_DOOR_MIN_WIDTH_MM, heightMm }) -
        amountOfOneBody({
          buildId,
          widthMm: TWO_DOOR_MIN_WIDTH_MM - 1,
          heightMm,
        });

      expect(leavesAdded).toBeGreaterThan(0);
      expect(across - coefficient(formula, "perWidthMillimetreMinor")).toBe(
        coefficient(formula, "perDoorLeafMinor") * leavesAdded,
      );
    });

    it(`changes ${buildId} by the width coefficient alone away from the threshold`, () => {
      const perWidth = coefficient(
        ruleFor(BOOK, buildId).formula,
        "perWidthMillimetreMinor",
      );
      const definition = CATALOG.get(buildId);
      if (!definition) throw new Error(`fixture has no "${buildId}"`);
      const widths = buildableWidthsOf(buildId, definition);
      if (widths.length === 0) return;

      for (const widthMm of widths) {
        const next = widthMm + 1;
        if (!widths.includes(next)) continue;
        if (next === TWO_DOOR_MIN_WIDTH_MM) continue;
        expect(
          amountOfOneBody({ buildId, widthMm: next, heightMm: 700 }) -
            amountOfOneBody({ buildId, widthMm, heightMm: 700 }),
        ).toBe(perWidth);
      }
    });
  }

  it("does not step a row whose front population its width does not decide", () => {
    for (const buildId of ["base-3drawer", "base-panbank", "base-sink"]) {
      const perWidth = coefficient(
        ruleFor(BOOK, buildId).formula,
        "perWidthMillimetreMinor",
      );
      expect(
        amountOfOneBody({
          buildId,
          widthMm: TWO_DOOR_MIN_WIDTH_MM,
          heightMm: 820,
        }) -
          amountOfOneBody({
            buildId,
            widthMm: TWO_DOOR_MIN_WIDTH_MM - 1,
            heightMm: 820,
          }),
      ).toBe(perWidth);
    }
  });
});

describe("the book is data with one authority, and is refused when it is not", () => {
  it("refuses a book pricing one catalogue row twice, naming the row", () => {
    // Adding a second rule rather than editing one: the ids differ so the rule-id sweep passes it, and a Map would
    // silently keep whichever came last.
    const duplicated: PriceBook = {
      ...BOOK,
      cabinetRules: [
        ...BOOK.cabinetRules,
        {
          ...ruleFor(BOOK, "wall-cabinet"),
          ruleId: "cabinet.wall-cabinet.second-opinion",
        },
      ],
    };

    const failure = refusalFrom({ book: duplicated });

    expect(failure.code).toBe("INVALID_PRICE_BOOK");
    expect(failure.id).toBe("wall-cabinet");
    expect(failure.detail).toContain("wall-cabinet");
  });

  it("refuses a duplicated row before it prices a single line, whatever the design", () => {
    // Refused as a property of the book, so an empty design is refused too.
    const duplicated: PriceBook = {
      ...BOOK,
      cabinetRules: [
        ...BOOK.cabinetRules,
        { ...ruleFor(BOOK, "open-shelf"), ruleId: "cabinet.open-shelf.again" },
      ],
    };

    expect(refusalFrom({ design: designOf([]), book: duplicated }).code).toBe(
      "INVALID_PRICE_BOOK",
    );
  });

  it("refuses a book whose two rules for one row disagree in shape", () => {
    // Rules for one row can differ in shape (ADR 0068), so the discarded one may be the intended one.
    const shapeClash: PriceBook = {
      ...BOOK,
      cabinetRules: [
        ...BOOK.cabinetRules,
        {
          ruleId: "cabinet.wall-cabinet.flat",
          buildId: "wall-cabinet",
          formula: {
            shape: "linear-in-width",
            baseMinor: 1,
            perWidthMillimetreMinor: 0,
          },
        },
      ],
    };

    expect(refusalFrom({ book: shapeClash }).code).toBe("INVALID_PRICE_BOOK");
  });

  it("refuses a book carrying a shape this build has never heard of", () => {
    const invented = bookPricing("wall-cabinet", {
      shape: "linear-in-front-area",
      baseMinor: 1,
      perWidthMillimetreMinor: 1,
      perHeightMillimetreMinor: 1,
    } as unknown as PriceFormula);

    const failure = refusalFrom({
      design: designOf([placedAt({ id: "solo" })]),
      book: invented,
    });

    expect(failure.code).toBe("UNKNOWN_FORMULA_SHAPE");
    expect(failure.id).toBe("cabinet.wall-cabinet");
  });

  it("refuses a rule whose formula is missing altogether", () => {
    const formulaless = bookPricing(
      "wall-cabinet",
      undefined as unknown as PriceFormula,
    );

    expect(
      refusalFrom({
        design: designOf([placedAt({ id: "solo" })]),
        book: formulaless,
      }).code,
    ).toBe("UNKNOWN_FORMULA_SHAPE");
  });

  it("cannot lose a book's status, whatever the book says", () => {
    for (const status of ["estimate", "commercial"] as const) {
      expect(priceOrFail({ book: { ...BOOK, status } }).status).toBe(status);
    }
  });

  it("publishes no cabinet line, and no total, below zero", () => {
    // Asserts on the published amount, not a failure code: refusing at the book or at the line are both acceptable.
    const negative = bookPricing("wall-cabinet", {
      shape: "linear-in-width-height-and-door-leaves",
      baseMinor: -1_000_000,
      perWidthMillimetreMinor: -1,
      perHeightMillimetreMinor: -1,
      perDoorLeafMinor: -1,
    });
    const result = priceDesign(
      request({
        design: designOf([placedAt({ id: "solo" })]),
        book: negative,
      }),
    );

    if (!result.ok) return;
    for (const line of result.priced.lines) {
      expect(line.amountMinor).toBeGreaterThanOrEqual(0);
    }
    expect(result.priced.totalMinor).toBeGreaterThanOrEqual(0);
  });
});

describe("the query is pure, and reads the projection rather than an order of its own", () => {
  it("mutates neither the design, nor the catalogue, nor the book", () => {
    const design = deepFrozen(designOf([...KITCHEN_L_DESIGN.placements]));
    const book = deepFrozen({ ...BOOK });

    expect(() => priceOrFail({ design, book })).not.toThrow();
  });

  it("returns an identical value for a permuted placements array", () => {
    const permuted = [...KITCHEN_L_DESIGN.placements].reverse();

    expect(priceOrFail({ design: designOf(permuted) })).toEqual(priceOrFail());
  });

  it("returns an identical value on a second call with the same arguments", () => {
    expect(priceOrFail()).toEqual(priceOrFail());
  });

  it("lists cabinet lines in exactly the projection's order and never sorts its own", () => {
    // The expectation is read from `projectDesignForDisplay`, so a pricing-side sort that agrees today must still agree
    // on a design nobody chose.
    const shuffled = [...KITCHEN_L_DESIGN.placements].sort((a, b) =>
      a.id < b.id ? 1 : -1,
    );

    expect(
      cabinetLinesOf(priceOrFail({ design: designOf(shuffled) })).map(
        (line) => line.placementId,
      ),
    ).toEqual(
      projectDesignForDisplay(designOf(shuffled), CATALOG)
        .flatMap((group) => group.entries)
        .map((entry) => entry.placementId),
    );
  });

  it("lists the seeded kitchen in one literal order, so a swapped comparator key is red", () => {
    // A literal pin: the test above moves together with a comparator key swapped inside the projection.
    // Order is wall, normalised band, `y0Mm`, `alongMm`, placement id, row-major (ADR 0063).
    expect(
      cabinetLinesOf(priceOrFail()).map((line) => line.placementId),
    ).toEqual([
      "p25",
      "p0",
      "p1",
      "p2",
      "p4",
      "p8",
      "p10",
      "p11",
      "p12",
      "p13",
      "p14",
      "p15",
      "p16",
      "p17",
      "p18",
      "p19",
      "p20",
      "p26",
      "p9",
      "p24",
      "p21",
      "p22",
      "p23",
      "p5",
      "p6",
      "p7",
    ]);
  });

  it("sorts nothing under pricing/", () => {
    for (const source of [
      "src/pricing/price-book.ts",
      "src/pricing/price-design.ts",
      "src/pricing/price-lines.ts",
    ]) {
      const executable = withoutCommentsOrStrings(readPackageSource(source));
      expect(executable).not.toMatch(/\.sort\(/);
      expect(executable).not.toMatch(/localeCompare/);
    }
  });
});

/** Dense where a transition can hide (declared sizes, range ends, the door threshold and its neighbours), strided
 *  elsewhere: a whole-continuum sweep of every row at both depths prices far too many designs. */
function sweptWidths(
  buildId: string,
  definition: BodyDefinition,
): readonly number[] {
  const buildable = buildableWidthsOf(buildId, definition);
  if (buildable.length === 0) return [];
  const buildableSet = new Set(buildable);
  const swept = new Set<number>([
    buildable[0] ?? 0,
    buildable[buildable.length - 1] ?? 0,
  ]);
  for (const candidate of [
    TWO_DOOR_MIN_WIDTH_MM - 1,
    TWO_DOOR_MIN_WIDTH_MM,
    TWO_DOOR_MIN_WIDTH_MM + 1,
    575,
  ]) {
    if (buildableSet.has(candidate)) swept.add(candidate);
  }
  for (let index = 0; index < buildable.length; index += 37) {
    swept.add(buildable[index] ?? 0);
  }
  return [...swept].sort((a, b) => a - b);
}

function deepFrozen<TValue>(value: TValue): TValue {
  if (value === null || typeof value !== "object") return value;
  for (const held of Object.values(value)) deepFrozen(held);
  return Object.freeze(value);
}

const SOURCE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readPackageSource(relativePath: string): string {
  return readFileSync(path.join(SOURCE_ROOT, relativePath), "utf8");
}

function packageSourceFiles(): readonly string[] {
  return readdirSync(path.join(SOURCE_ROOT, "src"), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) =>
      path
        .relative(SOURCE_ROOT, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/"),
    )
    .sort();
}

/** Strips comments and strings so a name mentioned in prose does not read as a use of it. */
function withoutCommentsOrStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}
