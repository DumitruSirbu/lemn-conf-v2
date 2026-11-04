// M10 M2 adversarial QA, the cabinet preview (M2-c; frames D3A to D3G; ADR 0177 A-1, A-3, A-6, ADR 0135).
// Counter-examples sought: a cell that parts from the whole query's price of a kitchen of that one cabinet, for any row of the
// shipped book, any material column, either depth, any hardware class and any opening a row built to its height is made at;
// a table whose rows are not the widths the owner can build; a door step marked where the price does not step.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  previewCabinet,
  type CabinetPreviewOptions,
  type PreviewRow,
} from "../../src/price-dashboard/cabinet-preview.js";
import {
  isInsertableRow,
  pricedRowOf,
} from "../../src/price-dashboard/priced-row.js";
import {
  isAnchoredShape,
  PRICE_STEP_MM,
} from "../../src/pricing/anchored-price-formula.js";
import type { PriceBook, PriceFormula } from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

import { required } from "./qa-m2-required.js";
import {
  cabinetInMaterialAtDepthMinor,
  CATALOG,
  DEEP_DEPTH_MM,
  DEEPENING_ROWS,
  hardwareLineMinor,
  priceOneCabinet,
  REFERENCE_MATERIAL_ID,
  SHALLOW_DEPTH_MM,
  withFormula,
  withPercentages,
} from "./m2-support.js";

const ALL_RULES = SAMPLE_PRICE_BOOK.cabinetRules;
const MATERIAL_IDS = SAMPLE_PRICE_BOOK.material.tiers.map(
  ({ tierId }) => tierId,
);
const HARDWARE_IDS = SAMPLE_PRICE_BOOK.hardware.tiers.map(
  ({ tierId }) => tierId,
);
const DEPTHS_MM = [SHALLOW_DEPTH_MM, DEEP_DEPTH_MM] as const;
const FLEX_OPENINGS_MM = [400, 437, 450, 700, 900] as const;

function ruleOf(buildId: string, book: PriceBook = SAMPLE_PRICE_BOOK) {
  const rule = book.cabinetRules.find(
    (candidate) => candidate.buildId === buildId,
  );
  if (rule === undefined) throw new Error(`No rule for ${buildId}`);
  return rule;
}

function rowsOf(
  buildId: string,
  options: Partial<CabinetPreviewOptions> = {},
  book: PriceBook = SAMPLE_PRICE_BOOK,
): readonly PreviewRow[] {
  const preview = previewCabinet({
    rule: ruleOf(buildId, book),
    catalog: CATALOG,
    book,
    material: REFERENCE_MATERIAL_ID,
    depth: SHALLOW_DEPTH_MM,
    deepeningRows: DEEPENING_ROWS,
    ...options,
  });
  if (!preview.ok) throw new Error(`${buildId}: ${preview.code}`);
  return preview.rows;
}

/** The height the oracle builds a body of this row at: the catalogue's nominal one, else a seeded kitchen's for its band. */
function nominalHeightMm(buildId: string): number {
  const definition = CATALOG.get(buildId);
  return (
    definition?.nominalHeightMm ?? (definition?.band === "wall" ? 700 : 820)
  );
}

function floorMm(buildId: string): number {
  return CATALOG.get(buildId)?.band === "wall" ? 1_500 : 0;
}

function queryPrice(
  buildId: string,
  at: {
    readonly widthMm: number;
    readonly heightMm: number;
    readonly depthMm: number;
    readonly materialTierId: string;
    readonly hardwareTierId: string;
    readonly book?: PriceBook;
  },
) {
  return priceOneCabinet(
    {
      buildId,
      widthMm: at.widthMm,
      heightMm: at.heightMm,
      y0Mm: floorMm(buildId),
    },
    {
      book: at.book ?? SAMPLE_PRICE_BOOK,
      depthMm: at.depthMm,
      materialTierId: at.materialTierId,
      hardwareTierId: at.hardwareTierId,
    },
  );
}

describe("every cell of every row of the shipped book is the whole query's price of that one cabinet (M2-c)", () => {
  it.each(ALL_RULES.map(({ buildId }) => buildId))(
    "%s: every width, every material column, both depths, every hardware class",
    (buildId) => {
      const heightMm = nominalHeightMm(buildId);

      for (const depthMm of DEPTHS_MM) {
        for (const material of MATERIAL_IDS) {
          for (const hardwareTier of HARDWARE_IDS) {
            const rows = rowsOf(buildId, {
              material,
              depth: depthMm,
              hardwareTier,
            });
            for (const row of rows) {
              const priced = queryPrice(buildId, {
                widthMm: row.widthMm,
                heightMm,
                depthMm,
                materialTierId: material,
                hardwareTierId: hardwareTier,
              });

              expect(row.priceMinor - (row.hardwareMinor ?? 0)).toBe(
                cabinetInMaterialAtDepthMinor(priced),
              );
              expect(row.hardwareMinor).toBe(hardwareLineMinor(priced));
            }
          }
        }
      }
    },
  );

  it.each(["wall-cabinet", "wall-lift", "open-shelf"])(
    "%s at every opening a row built to its height is made at, off the grid too",
    (buildId) => {
      for (const heightMm of FLEX_OPENINGS_MM) {
        for (const depthMm of DEPTHS_MM) {
          const rows = rowsOf(buildId, {
            heightMm,
            depth: depthMm,
            material: required(MATERIAL_IDS[1]),
            hardwareTier: required(HARDWARE_IDS[0]),
          });
          for (const row of rows) {
            const priced = queryPrice(buildId, {
              widthMm: row.widthMm,
              heightMm,
              depthMm,
              materialTierId: required(MATERIAL_IDS[1]),
              hardwareTierId: required(HARDWARE_IDS[0]),
            });

            expect(row.priceMinor - (row.hardwareMinor ?? 0)).toBe(
              cabinetInMaterialAtDepthMinor(priced),
            );
            expect(row.hardwareMinor).toBe(hardwareLineMinor(priced));
          }
        }
      }
    },
  );

  it("prices a wall-cabinet opening of 437 mm as the 450 mm one the query rounds it up to, and no dearer or cheaper", () => {
    const at437 = rowsOf("wall-cabinet", { heightMm: 437 });
    const at450 = rowsOf("wall-cabinet", { heightMm: 450 });

    expect(at437.map(({ priceMinor }) => priceMinor)).toEqual(
      at450.map(({ priceMinor }) => priceMinor),
    );
  });

  it("holds for books whose amounts and percentages are anything the dashboard may write", () => {
    const rows = ["base-cabinet", "wall-cabinet", "tall-pantry", "base-sink"];
    const settings = fc.record({
      buildId: fc.constantFrom(...rows),
      materialPercent: fc.integer({ min: 0, max: 200 }),
      depthPercent: fc.integer({ min: 0, max: 100 }),
      amounts: fc.record({
        anchorMinor: fc.integer({ min: 100_000, max: 900_000 }),
        stepMinor: fc.integer({ min: 0, max: 40_000 }),
        doorMinor: fc.integer({ min: 0, max: 40_000 }),
        heightMinor: fc.integer({ min: 0, max: 5_000 }),
      }),
      depthMm: fc.constantFrom(...DEPTHS_MM),
    });

    fc.assert(
      fc.property(settings, (s) => {
        const sample = ruleOf(s.buildId).formula;
        if (!isAnchoredShape(sample.shape)) throw new Error("not anchored");
        const book = withPercentages(
          withFormula(SAMPLE_PRICE_BOOK, s.buildId, {
            ...sample,
            anchorMinor: s.amounts.anchorMinor,
            perStepWiderMinor: s.amounts.stepMinor,
            perStepNarrowerMinor: s.amounts.stepMinor + 7,
            ...("perExtraDoorLeafMinor" in sample
              ? { perExtraDoorLeafMinor: s.amounts.doorMinor }
              : {}),
            ...("perHeightStepMinor" in sample
              ? { perHeightStepMinor: s.amounts.heightMinor }
              : {}),
          } as PriceFormula),
          s,
        );
        const material = required(MATERIAL_IDS[1]);
        const hardwareTier = required(HARDWARE_IDS[1]);
        fc.pre(isPricedEverywhere(s.buildId, book));

        for (const row of rowsOf(
          s.buildId,
          { material, depth: s.depthMm, hardwareTier },
          book,
        )) {
          const priced = queryPrice(s.buildId, {
            widthMm: row.widthMm,
            heightMm: nominalHeightMm(s.buildId),
            depthMm: s.depthMm,
            materialTierId: material,
            hardwareTierId: hardwareTier,
            book,
          });

          expect(row.priceMinor - (row.hardwareMinor ?? 0)).toBe(
            cabinetInMaterialAtDepthMinor(priced),
          );
        }
      }),
      { numRuns: 40 },
    );
  });
});

/** A book the judgement would accept prices every width; one it would not is not what the preview is compared on. */
function isPricedEverywhere(buildId: string, book: PriceBook): boolean {
  try {
    for (const row of rowsOf(buildId, {}, book)) {
      queryPrice(buildId, {
        widthMm: row.widthMm,
        heightMm: nominalHeightMm(buildId),
        depthMm: SHALLOW_DEPTH_MM,
        materialTierId: REFERENCE_MATERIAL_ID,
        hardwareTierId: required(HARDWARE_IDS[0]),
        book,
      });
    }
    return true;
  } catch {
    return false;
  }
}

describe("the hardware toggle adds exactly the mechanisms, and the depth toggle exactly the uplift", () => {
  it.each(ALL_RULES.map(({ buildId }) => buildId))(
    "%s: with hardware a cell is the cell without it plus its hardware, and the rest is unchanged",
    (buildId) => {
      for (const hardwareTier of HARDWARE_IDS) {
        const without = rowsOf(buildId);
        const withHardware = rowsOf(buildId, { hardwareTier });

        expect(withHardware.map(({ widthMm }) => widthMm)).toEqual(
          without.map(({ widthMm }) => widthMm),
        );
        withHardware.forEach((row, index) => {
          expect(without[index]).not.toHaveProperty("hardwareMinor");
          expect(row.hardwareMinor).toBeGreaterThanOrEqual(0);
          expect(required(row.hardwareMinor) % 1_000).toBe(0);
          expect(row.priceMinor).toBe(
            required(without[index]).priceMinor + required(row.hardwareMinor),
          );
        });
      }
    },
  );

  it("adds nothing at 600 mm and the uplift of the book's depth rule at 700, only to the rows the catalogue measures deeper", () => {
    for (const { buildId, suppliedBy } of ALL_RULES) {
      const shallow = rowsOf(buildId, { depth: SHALLOW_DEPTH_MM });
      const deep = rowsOf(buildId, { depth: DEEP_DEPTH_MM });

      shallow.forEach((row, index) => {
        const deepCell = required(deep[index]).priceMinor;
        const deepens =
          DEEPENING_ROWS.has(buildId) && suppliedBy !== "customer";
        if (deepens) {
          expect(deepCell).toBeGreaterThanOrEqual(row.priceMinor);
        } else {
          expect(deepCell).toBe(row.priceMinor);
        }
      });
    }
    const sanity = rowsOf("base-cabinet", { depth: DEEP_DEPTH_MM });
    const shallow = rowsOf("base-cabinet", { depth: SHALLOW_DEPTH_MM });
    expect(sanity.at(-1)?.priceMinor).toBeGreaterThan(
      required(shallow.at(-1)?.priceMinor),
    );
  });

  it("takes no uplift for any row when the caller names no deepening rows (the set is required, never defaulted)", () => {
    for (const { buildId } of ALL_RULES) {
      const none = rowsOf(buildId, {
        depth: DEEP_DEPTH_MM,
        deepeningRows: new Set<string>(),
      });
      const shallow = rowsOf(buildId, { depth: SHALLOW_DEPTH_MM });

      expect(none.map(({ priceMinor }) => priceMinor)).toEqual(
        shallow.map(({ priceMinor }) => priceMinor),
      );
    }
  });

  it("moves with the book's depth percentage cell by cell, at every whole percent from 0 to 100", () => {
    for (let percent = 0; percent <= 100; percent += 1) {
      const book = withPercentages(SAMPLE_PRICE_BOOK, {
        materialPercent: 0,
        depthPercent: percent,
      });
      for (const row of rowsOf(
        "base-3drawer",
        { depth: DEEP_DEPTH_MM },
        book,
      )) {
        const priced = queryPrice("base-3drawer", {
          widthMm: row.widthMm,
          heightMm: nominalHeightMm("base-3drawer"),
          depthMm: DEEP_DEPTH_MM,
          materialTierId: REFERENCE_MATERIAL_ID,
          hardwareTierId: required(HARDWARE_IDS[0]),
          book,
        });

        expect(row.priceMinor).toBe(cabinetInMaterialAtDepthMinor(priced));
      }
    }
  });

  it("is a column per material: the reference column is the cabinet alone and each upgrade is the query's price in it", () => {
    for (const material of MATERIAL_IDS) {
      for (const row of rowsOf("tall-pantry", { material })) {
        const priced = queryPrice("tall-pantry", {
          widthMm: row.widthMm,
          heightMm: nominalHeightMm("tall-pantry"),
          depthMm: SHALLOW_DEPTH_MM,
          materialTierId: material,
          hardwareTierId: required(HARDWARE_IDS[0]),
        });

        expect(row.priceMinor).toBe(cabinetInMaterialAtDepthMinor(priced));
      }
    }
    const reference = rowsOf("tall-pantry", {
      material: REFERENCE_MATERIAL_ID,
    });
    for (const material of MATERIAL_IDS.filter(
      (id) => id !== REFERENCE_MATERIAL_ID,
    )) {
      rowsOf("tall-pantry", { material }).forEach((row, index) => {
        expect(row.priceMinor).toBeGreaterThanOrEqual(
          required(reference[index]).priceMinor,
        );
      });
    }
  });
});

describe("a customer-supplied row never takes the depth percentage (A-6), whatever the set of deepening rows says", () => {
  it("shows the same cells at 700 mm as at 600 mm for a customer row the book prices, even one the catalogue measures deeper", () => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "hood", {
      shape: "anchored-width",
      anchorWidthMm: 600,
      anchorMinor: 100_000,
      perStepWiderMinor: 10_000,
      perStepNarrowerMinor: 10_000,
    });
    const everyRowDeepens = new Set(ALL_RULES.map(({ buildId }) => buildId));

    const shallow = rowsOf(
      "hood",
      { depth: SHALLOW_DEPTH_MM, deepeningRows: everyRowDeepens },
      book,
    );
    const deep = rowsOf(
      "hood",
      { depth: DEEP_DEPTH_MM, deepeningRows: everyRowDeepens },
      book,
    );

    expect(deep.map(({ priceMinor }) => priceMinor)).toEqual(
      shallow.map(({ priceMinor }) => priceMinor),
    );
    expect(deep[0]?.priceMinor).toBeGreaterThan(0);
  });
});

describe("the table's rows are the widths the owner can build, and nothing else", () => {
  it.each(ALL_RULES.map(({ buildId }) => buildId))(
    "%s: ascending and unique, a 50 mm step between grid rows, an off-grid row only first, priced as the step above it",
    (buildId) => {
      const rows = rowsOf(buildId);

      expect(rows.length).toBeGreaterThan(0);
      rows.forEach((row, index) => {
        if (index > 0) {
          expect(row.widthMm).toBeGreaterThan(
            required(rows[index - 1]).widthMm,
          );
        }
        // A structural row is built at one width and shows it, priced under its key, with no "priced as" note (m2).
        expect(row.isOffGridMinimum).toBe(
          isInsertableRow(required(pricedRowOf(CATALOG, buildId))) &&
            row.widthMm % PRICE_STEP_MM !== 0,
        );
        if (row.isOffGridMinimum) expect(index).toBe(0);
        expect(row.pricedAsWidthMm).toBeGreaterThanOrEqual(row.widthMm);
        expect(row.pricedAsWidthMm - row.widthMm).toBeLessThan(PRICE_STEP_MM);
        expect(row.pricedAsWidthMm % PRICE_STEP_MM).toBe(0);
        expect(row.isDoorStep && index === 0).toBe(false);
      });
      rows.slice(1).forEach((row, index) => {
        const previous = required(rows[index]);
        const gap = row.widthMm - previous.widthMm;
        if (previous.isOffGridMinimum) {
          expect(gap).toBeLessThanOrEqual(PRICE_STEP_MM);
        } else if (gap !== PRICE_STEP_MM) {
          // a gap wider than one step is a gap between two ranges of a fixed-size row
          expect(gap).toBeGreaterThan(PRICE_STEP_MM);
        }
      });
    },
  );

  it("lists the row's whole range: its narrowest and its widest buildable width, for every row with a range", () => {
    for (const { buildId } of ALL_RULES) {
      const definition = pricedRowOf(CATALOG, buildId)?.definition;
      const ranges = definition?.widthRangesMm;
      if (ranges === undefined || definition?.insertable !== true) continue;
      const widths = rowsOf(buildId).map(({ widthMm }) => widthMm);

      expect(widths[0]).toBe(
        Math.max(required(ranges[0]?.minMm), definition.minWidthMm ?? 0),
      );
      expect(widths.at(-1)).toBe(ranges.at(-1)?.maxMm);
    }
  });

  it("shows each structural corner at the width it is built at, once, and prices it under its listed key", () => {
    const built = {
      "base-corner-x-900": 900,
      "base-corner-return-320": 330,
      "wall-corner-x-900": 900,
      "wall-corner-x-900-top": 900,
      "wall-corner-return-570": 570,
      "wall-corner-return-570-top": 570,
    };

    for (const [buildId, widthMm] of Object.entries(built)) {
      const rows = rowsOf(buildId);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.widthMm).toBe(widthMm);
      expect(required(rows[0]).pricedAsWidthMm % PRICE_STEP_MM).toBe(0);
      expect(rows[0]?.isDoorStep).toBe(false);
    }
  });

  it("takes a corner's built width from the caller: a narrower body takes the listed key, a wider one is refused, never priced at the nearest", () => {
    const rule = ruleOf("base-corner-return-320");
    const previewAt = (widthMm: number) =>
      previewCabinet({
        rule,
        catalog: CATALOG,
        book: SAMPLE_PRICE_BOOK,
        material: REFERENCE_MATERIAL_ID,
        depth: SHALLOW_DEPTH_MM,
        deepeningRows: DEEPENING_ROWS,
        builtWidthsMm: new Map([["base-corner-return-320", widthMm]]),
      });

    const atTheBuiltWidth = previewAt(330);
    const narrower = previewAt(280);
    const atTheKey = previewAt(350);
    const wider = previewAt(352);

    expect(atTheBuiltWidth.ok && atTheBuiltWidth.rows[0]?.widthMm).toBe(330);
    expect(narrower.ok && narrower.rows[0]?.widthMm).toBe(280);
    expect(narrower.ok && narrower.rows[0]?.priceMinor).toBe(
      atTheKey.ok && atTheKey.rows[0]?.priceMinor,
    );
    expect(wider).toEqual({ ok: false, code: "NO_PRICE_FOR_SIZE" });
  });

  it("charges nothing on any row of a customer-supplied cabinet, in any column and at any depth", () => {
    const customerRules = ALL_RULES.filter(
      ({ suppliedBy }) => suppliedBy === "customer",
    );

    expect(customerRules.length).toBeGreaterThan(0);
    for (const { buildId } of customerRules) {
      for (const material of MATERIAL_IDS) {
        for (const depth of DEPTHS_MM) {
          const rows = rowsOf(buildId, { material, depth });

          expect(rows.every(({ priceMinor }) => priceMinor === 0)).toBe(true);
        }
      }
    }
  });
});

describe("a door step is marked exactly where a door leaf's price steps (A-3)", () => {
  // Every width step prices 0 and a door leaf prices 50 000, so a cell moves exactly when the leaf count under the body
  // does, as the whole query counts it: the marks are held to that, not to the preview's own leaf count.
  const STEP_BY_LEAF_ONLY = (shape: PriceFormula["shape"]): PriceFormula =>
    ({
      shape,
      anchorWidthMm: 600,
      anchorMinor: 800_000,
      perStepWiderMinor: 0,
      perStepNarrowerMinor: 0,
      perExtraDoorLeafMinor: 50_000,
      ...(shape === "anchored-width-height-and-door-leaves"
        ? { anchorHeightMm: 700, perHeightStepMinor: 0 }
        : {}),
    }) as PriceFormula;

  it.each([
    ["base-cabinet", "anchored-width-and-door-leaves"],
    ["tall-pantry", "anchored-width-and-door-leaves"],
    ["wall-cabinet", "anchored-width-height-and-door-leaves"],
  ] as const)(
    "%s: marks a row if and only if its price differs from the row above",
    (buildId, shape) => {
      const book = withFormula(
        SAMPLE_PRICE_BOOK,
        buildId,
        STEP_BY_LEAF_ONLY(shape),
      );

      const rows = rowsOf(buildId, {}, book);

      rows.forEach((row, index) => {
        const previous = rows[index - 1];
        const priceStepped =
          previous !== undefined && row.priceMinor !== previous.priceMinor;
        expect(row.isDoorStep).toBe(priceStepped);
      });
      expect(rows.some(({ isDoorStep }) => isDoorStep)).toBe(true);
    },
  );

  it("marks no row of a formula that does not price a door leaf, wherever the leaf count changes", () => {
    for (const { buildId, formula } of ALL_RULES) {
      const readsLeaves =
        isAnchoredShape(formula.shape) && formula.shape.includes("door-leaves");
      if (readsLeaves) continue;

      expect(rowsOf(buildId).some(({ isDoorStep }) => isDoorStep)).toBe(false);
    }
  });
});

describe("the preview is a pure function of its inputs", () => {
  it("answers the same table twice, and reads a frozen book and frozen options without touching them", () => {
    const frozen = structuredClone(SAMPLE_PRICE_BOOK);
    const freeze = (value: unknown): void => {
      if (typeof value !== "object" || value === null) return;
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    };
    freeze(frozen);
    const options = Object.freeze({
      material: required(MATERIAL_IDS[1]),
      depth: DEEP_DEPTH_MM,
      deepeningRows: DEEPENING_ROWS,
      hardwareTier: required(HARDWARE_IDS[0]),
    });
    const rule = ruleOf("base-cabinet", frozen);

    const request = { rule, catalog: CATALOG, book: frozen, ...options };
    const first = previewCabinet(request);
    const second = previewCabinet(request);

    expect(second).toEqual(first);
    expect(frozen).toEqual(SAMPLE_PRICE_BOOK);
  });
});
