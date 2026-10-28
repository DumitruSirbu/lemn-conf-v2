// M10 M2 (b), (b2), (b3): a book judged against the catalogue it will price (ADR 0177 A-7, A-7b; frame D3C).
import { describe, expect, it } from "vitest";

import { resolveWidthRangesMm, toInsertableBody } from "../../src/catalog.js";
import {
  judgeBookAgainstCatalog,
  type BookRefusal,
} from "../../src/price-dashboard/judge-book.js";
import {
  isInsertableRow,
  listBodiesPricedAs,
  listPricedRows,
  pricedRowOf,
  referenceCornerBuiltWidthsMm,
  type PricedRow,
} from "../../src/price-dashboard/priced-row.js";
import type { AnchoredFormula } from "../../src/pricing/anchored-price-formula.js";
import { MAX_CABINET_AMOUNT_MINOR } from "../../src/pricing/percentage-lines.js";
import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import type { BodyCatalog, BodyDefinition } from "../../src/void-engine.js";

import {
  CATALOG,
  ruleOf,
  withFormula,
  withoutRule,
  withPercentages,
  withRule,
} from "./m2-support.js";

function refusalsOf(
  book: PriceBook,
  catalog: BodyCatalog = CATALOG,
): readonly BookRefusal[] {
  const judgement = judgeBookAgainstCatalog(book, catalog);
  return judgement.ok ? [] : judgement.refusals;
}

function anchoredOf(buildId: string): AnchoredFormula {
  const { formula } = ruleOf(buildId);
  if (formula.shape === "price-per-size")
    throw new Error(`${buildId} is per-size`);
  return formula;
}

function narrowestWidthMmOf(buildId: string): number {
  const definition = CATALOG.get(buildId);
  const body = definition && toInsertableBody(buildId, definition);
  const range = body && resolveWidthRangesMm(body)[0];
  if (range === undefined) throw new Error(`No width range for ${buildId}`);
  return range.minMm;
}

function catalogWithSeededVariant(
  buildId: string,
  change: Partial<BodyDefinition>,
): BodyCatalog {
  const definition = CATALOG.get("base-cabinet");
  if (definition === undefined) throw new Error("No base-cabinet");
  return new Map([...CATALOG, [buildId, { ...definition, ...change }]]);
}

function fieldsOf(
  buildId: string,
  key: keyof BodyDefinition,
): Partial<BodyDefinition> {
  const value = CATALOG.get(buildId)?.[key];
  if (value === undefined) throw new Error(`No ${key} on ${buildId}`);
  return { [key]: value };
}

function requiredRow(buildId: string): PricedRow {
  const row = pricedRowOf(CATALOG, buildId);
  if (row === undefined) throw new Error(`No ${buildId}`);
  return row;
}

function catalogWith(
  buildId: string,
  change: Partial<BodyDefinition>,
): BodyCatalog {
  const definition = CATALOG.get(buildId);
  if (definition === undefined) throw new Error(`No ${buildId}`);
  return new Map([...CATALOG, [buildId, { ...definition, ...change }]]);
}

describe("judgeBookAgainstCatalog on the shipped book", () => {
  it("accepts the sample book against the shipped catalogue", () => {
    expect(judgeBookAgainstCatalog(SAMPLE_PRICE_BOOK, CATALOG)).toEqual({
      ok: true,
    });
  });
});

describe("a price at or below zero anywhere on the grid (A-7b, D3C)", () => {
  // The coordinator's witness: anchor 600 @ 100 000, narrower 30 000 per step, door 20 000. Its anchor width prices at
  // 100 000, and 200 mm prices below zero.
  const witness = withFormula(SAMPLE_PRICE_BOOK, "base-cabinet", {
    ...anchoredOf("base-cabinet"),
    anchorMinor: 100_000,
    perStepNarrowerMinor: 30_000,
    perExtraDoorLeafMinor: 20_000,
  });

  it("refuses the coordinator's witness at its narrowest width, naming the row, the height and the step that drives it", () => {
    const refusals = refusalsOf(witness);

    expect(refusals).toEqual([
      expect.objectContaining({
        code: "PRICE_NOT_POSITIVE",
        ruleId: "cabinet.base-cabinet",
        buildId: "base-cabinet",
        widthMm: 200,
        field: "perStepNarrowerMinor",
      }),
    ]);
    expect(refusals[0]).toHaveProperty("heightMm");
  });

  it("accepts a price of exactly 1 bani above zero at the narrowest width, and refuses exactly 0", () => {
    const stepMinor = 1_000;
    const narrowestMm = narrowestWidthMmOf("base-3drawer");
    const stepsToNarrowest = (600 - narrowestMm) / 50;
    const bookWith = (anchorMinor: number) =>
      withFormula(SAMPLE_PRICE_BOOK, "base-3drawer", {
        shape: "anchored-width",
        anchorWidthMm: 600,
        anchorMinor,
        perStepWiderMinor: 0,
        perStepNarrowerMinor: stepMinor,
      });

    const aboveZero = refusalsOf(bookWith(stepsToNarrowest * stepMinor + 1));
    const atZero = refusalsOf(bookWith(stepsToNarrowest * stepMinor));

    expect(aboveZero).toEqual([]);
    expect(atZero).toEqual([
      expect.objectContaining({
        code: "PRICE_NOT_POSITIVE",
        buildId: "base-3drawer",
        widthMm: narrowestMm,
      }),
    ]);
  });

  it("accepts the boundary 1 000 bani above zero", () => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-3drawer", {
      shape: "anchored-width",
      anchorWidthMm: 600,
      anchorMinor: 9_000,
      perStepWiderMinor: 0,
      perStepNarrowerMinor: 1_000,
    });

    expect(refusalsOf(book)).toEqual([]);
  });

  it("catches a negative that only the off-grid minimum produces", () => {
    // The row is built from 480 mm: below the 500 mm door threshold, so it carries one leaf where the 500 mm step it is
    // priced as carries two (A-3). At 500 the price is exactly 1 000; at 480 the leaf's panel comes off and it is below 0.
    const catalog = catalogWith("base-cabinet", {
      widthRangesMm: [{ minMm: 480, maxMm: 800 }],
      minWidthMm: 480,
    });
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-cabinet", {
      ...anchoredOf("base-cabinet"),
      anchorMinor: 11_000,
      perStepNarrowerMinor: 5_000,
      perExtraDoorLeafMinor: 5_000,
    });

    const refusals = refusalsOf(book, catalog);

    expect(refusals).toEqual([
      expect.objectContaining({
        code: "PRICE_NOT_POSITIVE",
        buildId: "base-cabinet",
        widthMm: 480,
        field: "perStepNarrowerMinor",
      }),
    ]);
  });

  it("evaluates a row built to its opening at every height, and names the height", () => {
    // `wall-cabinet` steps 3 500 per 50 mm of height: a shallow opening of 400 mm is 6 steps below the 700 mm anchor.
    const book = withFormula(SAMPLE_PRICE_BOOK, "wall-cabinet", {
      ...anchoredOf("wall-cabinet"),
      anchorMinor: 297_000,
      perStepNarrowerMinor: 0,
      perHeightStepMinor: 60_000,
    });

    const refusals = refusalsOf(book);

    expect(refusals).toEqual([
      expect.objectContaining({
        code: "PRICE_NOT_POSITIVE",
        buildId: "wall-cabinet",
        heightMm: 400,
        field: "perHeightStepMinor",
      }),
    ]);
  });

  it("refuses a price above what one cabinet may cost", () => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-3drawer", {
      ...anchoredOf("base-3drawer"),
      anchorMinor: MAX_CABINET_AMOUNT_MINOR + 1,
    });

    expect(refusalsOf(book)).toEqual([
      expect.objectContaining({
        code: "PRICE_TOO_LARGE",
        buildId: "base-3drawer",
        field: "anchorMinor",
      }),
    ]);
  });

  it("refuses a fixed-size price of zero, naming the amount", () => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-dishwasher", {
      shape: "price-per-size",
      sizes: [
        { widthMm: 450, amountMinor: 275_000 },
        { widthMm: 600, amountMinor: 0 },
      ],
    });

    expect(refusalsOf(book)).toEqual([
      expect.objectContaining({
        code: "PRICE_NOT_POSITIVE",
        buildId: "base-dishwasher",
        widthMm: 600,
        field: "amountMinor",
      }),
    ]);
  });
});

describe("a build id priced twice", () => {
  it("is refused: which rule prices a body would depend on the order of the book", () => {
    const twice: PriceBook = {
      ...SAMPLE_PRICE_BOOK,
      cabinetRules: [
        ...SAMPLE_PRICE_BOOK.cabinetRules,
        { ...ruleOf("base-sink"), ruleId: "cabinet.base-sink.again" },
      ],
    };

    expect(refusalsOf(twice)).toEqual([
      { code: "DUPLICATE_RULE_FOR_BODY", buildId: "base-sink" },
    ]);
  });
});

describe("a seeded body priced as a row is judged with its own door leaves (review m1)", () => {
  // A discount for a second leaf (a negative rate: the judge does not parse) is harmless on the row itself, whose leaves
  // follow its width to two. A seeded variant that stands on four leaves at every width takes it twice.
  const discounting = withFormula(SAMPLE_PRICE_BOOK, "base-cabinet", {
    ...anchoredOf("base-cabinet"),
    anchorMinor: 11_000,
    perStepWiderMinor: 0,
    perStepNarrowerMinor: 0,
    perExtraDoorLeafMinor: -6_000,
  });
  const fourLeaves = catalogWithSeededVariant("base-cabinet-four-leaves", {
    catalogEquivalentId: "base-cabinet",
    insertable: false,
    ...fieldsOf("tall-pantry", "fronts"),
  });

  it("accepts the discount while no seeded variant has more leaves than the row", () => {
    expect(refusalsOf(discounting)).toEqual([]);
  });

  it("refuses it at the width a variant with four leaves is priced at", () => {
    const refusals = refusalsOf(discounting, fourLeaves);

    expect(refusals).toEqual([
      expect.objectContaining({
        code: "PRICE_NOT_POSITIVE",
        buildId: "base-cabinet",
        field: "perExtraDoorLeafMinor",
      }),
    ]);
  });

  it("lists the seeded bodies priced as the wall cabinet beside the row, the row first", () => {
    const row = requiredRow("wall-cabinet");

    const ids = listBodiesPricedAs(CATALOG, row).map(({ buildId }) => buildId);

    expect(ids[0]).toBe("wall-cabinet");
    expect(ids).toContain("wall-1door-300");
    expect(ids).toContain("wall-2door-600");
  });
});

describe("customer-supplied rows (A-7b, P3-Q2, review B1)", () => {
  it("are free at every size, and held to the catalogue's anchor width as any other row", () => {
    const quotedAt800 = withFormula(SAMPLE_PRICE_BOOK, "hood", {
      shape: "anchored-width",
      anchorWidthMm: 800,
      anchorMinor: 0,
      perStepWiderMinor: 0,
      perStepNarrowerMinor: 0,
    });

    expect(refusalsOf(quotedAt800)).toEqual([
      expect.objectContaining({
        code: "ANCHOR_WIDTH_MISMATCH",
        buildId: "hood",
        expectedWidthMm: 600,
      }),
    ]);
  });

  it("must be free", () => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "fridge-free", {
      ...anchoredOf("fridge-free"),
      anchorMinor: 1,
    });

    expect(refusalsOf(book)).toEqual([
      expect.objectContaining({
        code: "CUSTOMER_ROW_PRICED",
        buildId: "fridge-free",
      }),
    ]);
  });

  it("must be evaluable: a retired shape, which still parses, is refused", () => {
    const retired = {
      shape: "linear-in-width",
      baseMinor: 0,
      perWidthMillimetreMinor: 0,
    } as unknown as AnchoredFormula;
    const book = withFormula(SAMPLE_PRICE_BOOK, "hood", retired);

    expect(parsePriceBook(book).ok).toBe(true);
    expect(refusalsOf(book)).toEqual([
      expect.objectContaining({
        code: "UNKNOWN_FORMULA_SHAPE",
        buildId: "hood",
      }),
    ]);
  });

  it("must list a size for every width it is built at: a hood is built from 600 to 800, and one size of 600 leaves 650 to 800 unpriced", () => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "hood", {
      shape: "price-per-size",
      sizes: [{ widthMm: 600, amountMinor: 0 }],
    });

    expect(refusalsOf(book)).toEqual([
      expect.objectContaining({
        code: "SIZE_LIST_MISMATCH",
        buildId: "hood",
        expectedWidthsMm: [600, 650, 700, 750, 800],
      }),
    ]);
  });
});

describe("a book against the rows the catalogue builds (P3-Q2)", () => {
  it("refuses a catalogue row the book does not price", () => {
    const refusals = refusalsOf(withoutRule(SAMPLE_PRICE_BOOK, "wall-lift"));

    expect(refusals).toEqual([
      { code: "NO_RULE_FOR_BODY", buildId: "wall-lift" },
    ]);
  });

  it("refuses a structural corner the book does not price", () => {
    const refusals = refusalsOf(
      withoutRule(SAMPLE_PRICE_BOOK, "wall-corner-x-900-top"),
    );

    expect(refusals).toEqual([
      { code: "NO_RULE_FOR_BODY", buildId: "wall-corner-x-900-top" },
    ]);
  });

  it("refuses a row whose formula is a retired linear shape, which still parses (the P3 hand-off)", () => {
    const retired = {
      shape: "linear-in-width",
      baseMinor: 100_000,
      perWidthMillimetreMinor: 10,
    } as unknown as AnchoredFormula;
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-sink", retired);

    const refusals = refusalsOf(book);

    expect(parsePriceBook(book).ok).toBe(true);
    expect(refusals).toEqual([
      {
        code: "UNKNOWN_FORMULA_SHAPE",
        ruleId: "cabinet.base-sink",
        buildId: "base-sink",
      },
    ]);
  });
});

describe("the anchor width and the size list against the catalogue (A-7)", () => {
  it("refuses an anchored row quoted at a width other than the catalogue's default", () => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-cabinet", {
      ...anchoredOf("base-cabinet"),
      anchorWidthMm: 650,
    });

    expect(refusalsOf(book)).toEqual([
      expect.objectContaining({
        code: "ANCHOR_WIDTH_MISMATCH",
        buildId: "base-cabinet",
        anchorWidthMm: 650,
        expectedWidthMm: 600,
      }),
    ]);
  });

  it.each([
    ["a size the catalogue does not build", [450, 650]],
    ["a missing size", [450]],
    ["an extra size", [450, 600, 650]],
  ])("refuses a fixed-size row with %s", (_name, widthsMm) => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-dishwasher", {
      shape: "price-per-size",
      sizes: widthsMm.map((widthMm) => ({ widthMm, amountMinor: 300_000 })),
    });

    expect(refusalsOf(book)).toEqual([
      expect.objectContaining({
        code: "SIZE_LIST_MISMATCH",
        buildId: "base-dishwasher",
        expectedWidthsMm: [450, 600],
      }),
    ]);
  });

  it("refuses an anchored formula on a structural corner", () => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-corner-x-900", {
      shape: "anchored-width",
      anchorWidthMm: 900,
      anchorMinor: 400_000,
      perStepWiderMinor: 0,
      perStepNarrowerMinor: 0,
    });

    expect(refusalsOf(book)).toEqual([
      expect.objectContaining({
        code: "STRUCTURAL_ROW_NOT_PER_SIZE",
        buildId: "base-corner-x-900",
      }),
    ]);
  });

  it.each([
    ["base-corner-return-320", 350],
    ["wall-corner-return-570", 600],
    ["wall-corner-x-900", 900],
  ])(
    "holds the corner %s to the round-up of its built width, %i",
    (buildId, keyMm) => {
      const priced = (widthMm: number) =>
        withFormula(SAMPLE_PRICE_BOOK, buildId, {
          shape: "price-per-size",
          sizes: [{ widthMm, amountMinor: 120_000 }],
        });

      expect(refusalsOf(priced(keyMm))).toEqual([]);
      expect(refusalsOf(priced(keyMm + 50))).toEqual([
        expect.objectContaining({ code: "SIZE_LIST_MISMATCH", buildId }),
      ]);
      expect(refusalsOf(priced(keyMm - 50))).toEqual([
        expect.objectContaining({ code: "SIZE_LIST_MISMATCH", buildId }),
      ]);
    },
  );

  it("takes a corner's built width from the caller when one is supplied", () => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-corner-return-320", {
      shape: "price-per-size",
      sizes: [{ widthMm: 400, amountMinor: 120_000 }],
    });

    const judgement = judgeBookAgainstCatalog(book, CATALOG, {
      builtWidthsMm: new Map([
        ...referenceCornerBuiltWidthsMm(),
        ["base-corner-return-320", 400],
      ]),
    });

    expect(judgement).toEqual({ ok: true });
  });

  it("refuses a structural row it has no built width for", () => {
    const judgement = judgeBookAgainstCatalog(SAMPLE_PRICE_BOOK, CATALOG, {
      builtWidthsMm: new Map(),
    });

    expect(judgement.ok).toBe(false);
    const codes = judgement.ok
      ? []
      : judgement.refusals.map(({ code }) => code);
    expect(new Set(codes)).toEqual(new Set(["NO_BUILT_WIDTH"]));
  });
});

describe("the structural corners' built widths", () => {
  it("are held for every corner row the shipped catalogue prices under its own id", () => {
    const corners = listPricedRows(CATALOG).filter(
      (row) => !isInsertableRow(row),
    );

    expect(corners.map(({ buildId }) => buildId).sort()).toEqual(
      [...referenceCornerBuiltWidthsMm().keys()].sort(),
    );
  });

  it("are read without any default width: a corner row declaring one changes nothing (M2-b3)", () => {
    const catalog = catalogWith("base-corner-x-900", { defaultWidthMm: 800 });

    expect(judgeBookAgainstCatalog(SAMPLE_PRICE_BOOK, catalog)).toEqual({
      ok: true,
    });
  });

  it("are the corner assembly's reference widths: 900 on wall A, 330 and 570 on wall B", () => {
    expect(Object.fromEntries(referenceCornerBuiltWidthsMm())).toEqual({
      "base-corner-x-900": 900,
      "base-corner-return-320": 330,
      "wall-corner-x-900": 900,
      "wall-corner-x-900-top": 900,
      "wall-corner-return-570": 570,
      "wall-corner-return-570-top": 570,
    });
  });
});

describe("the percentages' ranges", () => {
  it("accepts the range's own ends", () => {
    const book = withPercentages(SAMPLE_PRICE_BOOK, {
      materialPercent: 200,
      depthPercent: 100,
    });

    expect(refusalsOf(book)).toEqual([]);
  });

  it.each([
    [
      "a material above 200 %",
      { materialPercent: 201, depthPercent: 15 },
      "material.painted-mdf",
    ],
    [
      "a depth above 100 %",
      { materialPercent: 18, depthPercent: 101 },
      "depth",
    ],
    [
      "a depth that is not whole",
      { materialPercent: 18, depthPercent: 12.5 },
      "depth",
    ],
  ])("refuses %s", (_name, percentages, item) => {
    const book = withPercentages(SAMPLE_PRICE_BOOK, percentages);

    expect(refusalsOf(book)).toContainEqual({
      code: "PERCENT_OUT_OF_RANGE",
      item,
    });
  });

  it("refuses a default material above 0 %, which is the reference", () => {
    const book: PriceBook = {
      ...SAMPLE_PRICE_BOOK,
      material: {
        ...SAMPLE_PRICE_BOOK.material,
        tiers: SAMPLE_PRICE_BOOK.material.tiers.map((tier) =>
          tier.tierId === SAMPLE_PRICE_BOOK.material.defaultTierId
            ? { ...tier, percentOfCabinets: 5 }
            : tier,
        ),
      },
    };

    expect(refusalsOf(book)).toContainEqual({
      code: "PERCENT_OUT_OF_RANGE",
      item: SAMPLE_PRICE_BOOK.material.defaultTierId,
    });
  });
});

describe("a rule is only judged on the row it prices", () => {
  it("does not read a rule of a row the catalogue does not hold", () => {
    const book = withRule(SAMPLE_PRICE_BOOK, "hood", (rule) => ({
      ...rule,
      buildId: "no-such-row",
    }));

    expect(refusalsOf(book)).toEqual([
      { code: "NO_RULE_FOR_BODY", buildId: "hood" },
    ]);
  });
});
