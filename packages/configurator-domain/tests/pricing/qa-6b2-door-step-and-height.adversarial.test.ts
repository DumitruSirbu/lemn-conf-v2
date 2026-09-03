// Adversarial QA for wave 6B2 — the door step and the height term (ADR 0068).
//
// The wave shipped without QA, so this file is the gate 6C depends on. It attacks what
// `price-design.test.ts`, `pricing-seams.test.ts` and `qa-6b-pricing.adversarial.test.ts` assert
// from the other side: the arithmetic that could drift off an integer, the second door-count
// derivation that must not exist, the catalogue rows a body can be built at that nothing prices,
// the shapes that could carry a height term the owner ruled and evaluate it as an area, and the
// book read as **data a manufacturer edits** rather than as a literal a developer wrote.
//
// Every amount here is read off the book under test or off a book this file constructs from
// deliberately arbitrary coefficients. No figure asserted here is a price (ADR 0001 decision 4).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { widthDerivedDoorLeafCount } from "../../src/cabinet-handles.js";
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

/** The two cabinet depths §7 declares a wall depth for, so a sweep of "the whole catalogue" means
 *  both materialisations of it and not only the one the fixture happens to be built at. */
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

/** The catalogue rows the two ADR 0068 terms are *supposed* to apply to, read off the catalogue's
 *  own flags rather than off a list kept up to date by hand — which is the criterion. */
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

/** Every whole millimetre a row may be built at, from the ranges the catalogue declares — the same
 *  answer `acceptsWidthMm` gives, enumerated. A discrete row yields its sizes and nothing between
 *  them; a cabinetry row yields the whole continuum, because the 50 mm ladder is what the panel
 *  offers and not what the workshop builds. */
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
    // A per-millimetre rate times a four-figure width, summed twenty-five times, is where a float
    // would first show. The permutation is summed in the *other* direction as well, because
    // floating-point addition is not associative and an exact integer sum is the only thing that
    // survives both.
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
    // The criterion is *"rounding is not in the query"*. A `Math.round` added later would keep every
    // total an integer and would silently move an amount, so the absence is asserted on the source.
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
      // Zero and negative rates are swept deliberately: `0` is a real coefficient (`pricedFlat`),
      // and a negative one is what a manufacturer typing a minus sign produces. Whatever the
      // arithmetic answers, it must never be a fraction or a `NaN`.
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

  /** A half in each coefficient, against a body chosen so the half stays a half: an **odd**
   *  multiplier, because `0.5 × 700` is a whole number and would have made the assertion pass for
   *  the wrong reason. 499 mm is one leaf and 701 mm of height is odd. */
  const HALF_COEFFICIENTS = [
    { field: "perWidthMillimetreMinor", value: 0.5 },
    { field: "perHeightMillimetreMinor", value: 0.5 },
    { field: "perDoorLeafMinor", value: 0.5 },
    { field: "baseMinor", value: -0.5 },
  ] as const;

  for (const half of HALF_COEFFICIENTS) {
    it(`refuses rather than rounds a half in ${half.field}`, () => {
      // A half is the value a rounding rule would have to pick a direction for. There is no
      // direction to pick, because there is no rounding: the amount is refused whole.
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

  /** The values that multiply to a **whole number** instead of to a `NaN`, which is what makes them
   *  the dangerous half of the same family: `null × 700` is `0`, and so is `false × 700` and
   *  `[] × 700`. The result passes `Number.isSafeInteger`, so the only guard the query has says yes
   *  and the row is priced as though the owner's height ruling did not apply to it. */
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
    // **DEFECT.** `amountForBody` validates its *answer* and never its coefficients, so a book
    // assembled outside TypeScript — which ADR 0062 seam 1 exists to make possible — drops the
    // height term silently on the row the owner ruled it for, and the design prices as though
    // ADR 0068 decision 2 did not apply to it. `cabinet-handles.ts` already holds the sibling
    // numbers to "whole, non-negative, safe integer" in `usableCountOf` and throws rather than
    // guessing; the price coefficients have no equivalent.
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

  it("never publishes a line or a total that is not an exact integer, on the shipped book", () => {
    for (const selections of [
      undefined,
      { hardwareTierId: "hardware.premium" },
      { materialTierId: "material.veneer" },
    ]) {
      const priced = priceOrFail(selections ? { selections } : {});
      for (const line of priced.lines) {
        expect(Number.isSafeInteger(line.quantity)).toBe(true);
        expect(Number.isSafeInteger(line.unitAmountMinor)).toBe(true);
        expect(Number.isSafeInteger(line.amountMinor)).toBe(true);
        expect(line.amountMinor).toBe(line.quantity * line.unitAmountMinor);
      }
      expect(Number.isSafeInteger(priced.totalMinor)).toBe(true);
    }
  });
});

describe("one composition of the door count, and no second derivation anywhere", () => {
  it("has no module under pricing/ deriving a door count of its own", () => {
    // `widthDerivedDoorLeafCount` is the one composition of `doorTiers × deriveDoorCount`. A second
    // reader that called `deriveDoorCount` directly would under-count every banded cabinet, and
    // would do it quietly.
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

  it("calls deriveDoorCount from exactly three modules, and each for a different question", () => {
    // Not a co-occurrence heuristic: this is the whole population of callers, pinned. `door-count.ts`
    // declares it, `catalog.ts` re-exports it and asks it for the **label** — leaves per band, which
    // is the right answer for a name — and `cabinet-handles.ts` is the one module that multiplies it
    // by `doorTiers`. A fourth caller is either a second derivation or owes an explanation here.
    const calling = packageSourceFiles().filter((file) =>
      withoutCommentsOrStrings(readPackageSource(file)).includes(
        "deriveDoorCount",
      ),
    );

    expect(calling).toEqual([
      "src/cabinet-handles.ts",
      "src/catalog.ts",
      "src/door-count.ts",
    ]);
  });

  it("multiplies doorTiers by a derived door count in exactly one module", () => {
    // `catalog.ts` names `doorTiers` where its rows **declare** it and calls `deriveDoorCount` for a
    // label, and never puts the two in one expression. The composition itself lives in one place.
    const composing = packageSourceFiles().filter((file) =>
      /doorTiers[^;]*deriveDoorCount\(/.test(
        withoutCommentsOrStrings(readPackageSource(file)),
      ),
    );

    expect(composing).toEqual(["src/cabinet-handles.ts"]);
  });

  const LEAF_ROWS = [
    { buildId: "wall-cabinet", handlesPerLeaf: 1 },
    { buildId: "base-cabinet", handlesPerLeaf: 1 },
    { buildId: "tall-pantry", handlesPerLeaf: 1 },
  ] as const;

  for (const row of LEAF_ROWS) {
    it(`bills ${row.buildId}'s handles and its door step off the same count, at every width`, () => {
      // The step is isolated by pricing the same body twice against two books that differ only in
      // `perDoorLeafMinor`: the difference divided by the delta is the leaf count the price step was
      // billed for, whatever the base and width terms are. It must equal the count the handle line
      // is billed for, at every width including the threshold and one millimetre either side.
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
        const handleQuantity = lineOfKind(
          priceOrFail({
            design: designOf([placedAt({ id: "solo", body })]),
            selections: { hardwareTierId: "hardware.premium" },
          }),
          "hardware",
        ).quantity;

        expect(pricedLeaves).toBe(
          widthDerivedDoorLeafCount({
            buildId: row.buildId,
            rule: definition.cabinetHandles,
            widthMm,
          }),
        );
        expect(handleQuantity).toBe(pricedLeaves * row.handlesPerLeaf);
      }
    });
  }

  it("steps at deriveDoorCount's threshold and at no width of its own", () => {
    // 499 and below is one door, 500 and above is two (ADR 0035 decision 4). The price's only jump
    // must land on that transition, so the sweep looks for *every* width where the leaf count the
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
    // 6G's open question, pinned from the price side: `deriveDoorCount` answers leaves **per band**,
    // so a two-band column must be billed two steps where a one-band cabinet is billed one. A
    // second consumer counting bands instead of leaves would halve this.
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

  it("prices every seeded placement in the shipped kitchen with a positive amount", () => {
    for (const line of cabinetLinesOf(priceOrFail())) {
      expect(Number.isSafeInteger(line.amountMinor)).toBe(true);
      expect(line.amountMinor).toBeGreaterThan(0);
    }
  });
});

describe("taller costs more, on every shape that carries the term", () => {
  it("finds the height-flexible population wider than the two rows the owner named", () => {
    // ADR 0068's population correction. A two-shape implementation would have been silently wrong
    // on `wall-cabinet`, which is height-flexible **and** hinged.
    expect(HEIGHT_FLEX_ROWS).toContain("wall-cabinet");
    expect(HEIGHT_FLEX_ROWS).toContain("wall-lift");
    expect(HEIGHT_FLEX_ROWS).toContain("open-shelf");
    expect(HEIGHT_FLEX_ROWS.length).toBeGreaterThanOrEqual(3);
  });

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
    // The owner did not take price by front area. `a + b·w + c·h` keeps the width term unchanged
    // when the height changes; `k·w·h` does not, and that is the whole difference.
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
  it("finds every row whose door count follows its width priced by a shape that steps", () => {
    expect(DOOR_COUNT_ROWS.length).toBeGreaterThanOrEqual(3);
    for (const buildId of DOOR_COUNT_ROWS) {
      const { formula } = ruleFor(BOOK, buildId);
      expect(hasCoefficient(formula, "perDoorLeafMinor")).toBe(true);
      expect(coefficient(formula, "perDoorLeafMinor")).toBeGreaterThan(0);
    }
  });

  for (const buildId of DOOR_COUNT_ROWS) {
    it(`prices ${buildId} higher with two doors than with one, at one width`, () => {
      // Same body, same width, one door versus two — which needs the two books, because a real
      // cabinet cannot have both counts at one width. This is the owner's ruling stated directly:
      // the second door costs more than the first, at the *same* size.
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
      // The step across the threshold is a millimetre of width plus the leaves the threshold adds.
      // Subtracting the width term leaves the door step, and it must be exactly the coefficient the
      // book declares, multiplied by the leaves the row's bands add — never an accident of width.
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
    // The manufacturer-dashboard failure mode: "price this cabinet differently" made by *adding* a
    // rule rather than editing one. The ids differ, so the rule-id sweep passes it; the Map would
    // keep whichever came last and nothing would say so.
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
    // Refused as a property of the *book*, so an empty design is refused too. A book that is only
    // rejected when the duplicated row happens to be placed is a book that ships broken.
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
    // Since ADR 0068 two rules for one row can differ in shape, so the discarded one is likelier to
    // be the intended one — the height term simply vanishing is the quiet outcome.
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

  it("carries the book's status and provisional flag into the priced result", () => {
    const priced = priceOrFail();

    expect(BOOK.status).toBe("estimate");
    expect(BOOK.amountsProvisional).toBe(true);
    expect(priced.status).toBe(BOOK.status);
    expect(priced.status).not.toBe("commercial");
    expect(priced.pricingVersion).toBe(BOOK.version);
  });

  it("cannot lose a book's status, whatever the book says", () => {
    for (const status of ["estimate", "commercial"] as const) {
      expect(priceOrFail({ book: { ...BOOK, status } }).status).toBe(status);
    }
  });

  it("publishes no cabinet line, and no total, below zero", () => {
    // **DEFECT.** A manufacturer editing a book through ADR 0062's dashboard types a minus sign.
    // `isExactAmount` asks only `Number.isSafeInteger`, which a negative satisfies, so the line and
    // the total are published as they stand — a cabinet the customer is *paid* to take, and a total
    // that under-quotes without a single refusal anywhere. This is the same gap the coefficient
    // tests above show from the other side: the query validates integrality and nothing else.
    //
    // The assertion is on the *published amount* rather than on a failure code, deliberately:
    // whether a negative coefficient is refused at the book boundary or the amount is refused at
    // the line is the implementer's call. Publishing it is not.
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
    // Not a re-derivation of the same comparator: the expectation is read from
    // `projectDesignForDisplay` itself, so a pricing-side sort that happened to agree today would
    // still have to agree on a design nobody chose.
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
    // The test above reads its expectation from `projectDesignForDisplay`, which is the right way to
    // say "pricing does not sort" — and it is exactly the wrong way to catch a comparator key
    // swapped *inside* the projection, because both sides would move together. This one is the
    // literal pin: wall → normalised band → `y0Mm` → `alongMm` → placement id, row-major
    // (ADR 0063), spelled out on the document a customer is shown.
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

/** A width sweep that is dense where a transition can hide and sampled where it cannot: every
 *  declared size, both range ends, the door threshold and its neighbours, and a stride through the
 *  rest. A whole-continuum sweep of every row at both depths is ~24 000 priced designs; this keeps
 *  the transitions and drops only the widths between them where the formula is affine. */
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

// The source-reading helpers, at the foot of the file: they are the mechanism of the seam
// assertions above and not the subject of any of them. Same approach `pricing-seams.test.ts` takes.

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

/** **This package comments more than it codes**, and every name a comment mentions would otherwise
 *  read as a use of it. Stripping comments and string literals is what makes "no module under
 *  `pricing/` derives a door count" an assertion about the code rather than about the prose. */
function withoutCommentsOrStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}
