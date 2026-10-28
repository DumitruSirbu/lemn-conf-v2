// M10 M2 (3), M2-c: the table beside a cabinet's price fields (frames D3A to D3G). Every cell is held to the whole query's
// answer for a kitchen of that one cabinet, so the preview and a customer's price cannot part.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  previewCabinet,
  type CabinetPreviewOptions,
  type PreviewRow,
} from "../../src/price-dashboard/cabinet-preview.js";
import { pricedRowOf } from "../../src/price-dashboard/priced-row.js";
import {
  MAX_DEEP_CABINET_PERCENT,
  MAX_MATERIAL_PERCENT,
} from "../../src/pricing/price-bounds.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

import {
  cabinetInMaterialAtDepthMinor,
  CATALOG,
  DEEP_DEPTH_MM,
  DEEPENING_ROWS,
  hardwareLineMinor,
  priceOneCabinet,
  REFERENCE_MATERIAL_ID,
  ruleOf,
  SHALLOW_DEPTH_MM,
  STANDARD_HARDWARE_ID,
  UPGRADE_MATERIAL_ID,
  withFormula,
  withPercentages,
} from "./m2-support.js";

const NUM_RUNS = 40;

function rowsOf(
  buildId: string,
  options: Partial<CabinetPreviewOptions> = {},
  book: PriceBook = SAMPLE_PRICE_BOOK,
): readonly PreviewRow[] {
  const preview = previewCabinet(ruleOf(buildId, book), CATALOG, book, {
    material: REFERENCE_MATERIAL_ID,
    depth: SHALLOW_DEPTH_MM,
    deepeningRows: DEEPENING_ROWS,
    ...options,
  });
  if (!preview.ok) throw new Error(preview.code);
  return preview.rows;
}

/** The floor a body of this row stands on in a kitchen, so its hardware is read as it would be there. */
function floorOf(buildId: string): number {
  return CATALOG.get(buildId)?.band === "wall" ? 1_500 : 0;
}

/** The height a body of this row is built to: the catalogue's nominal one, else the seeded kitchen's for its row. */
function heightOf(buildId: string): number {
  const definition = CATALOG.get(buildId);
  const seededHeightMm = definition?.band === "wall" ? 700 : 820;
  return definition?.nominalHeightMm ?? seededHeightMm;
}

describe("every preview cell is the whole query's price of a kitchen of that cabinet (M2-c)", () => {
  // The sink starts at its off-grid 560 mm and the base return is built at 330 and priced under its 350 key: the two cells
  // most likely to drift from the query.
  const rows = [
    "base-cabinet",
    "base-3drawer",
    "base-sink",
    "wall-cabinet",
    "tall-pantry",
    "base-dishwasher",
    "base-corner-return-320",
    "wall-corner-return-570",
  ] as const;

  const settings = fc.record({
    buildId: fc.constantFrom(...rows),
    materialPercent: fc.integer({ min: 0, max: MAX_MATERIAL_PERCENT }),
    depthPercent: fc.integer({ min: 0, max: MAX_DEEP_CABINET_PERCENT }),
    anchorMinor: fc.integer({ min: 200_000, max: 900_000 }),
    isUpgradeMaterial: fc.boolean(),
    depthMm: fc.constantFrom(SHALLOW_DEPTH_MM, DEEP_DEPTH_MM),
    hardwareTierId: fc.constantFrom(
      ...SAMPLE_PRICE_BOOK.hardware.tiers.map(({ tierId }) => tierId),
    ),
  });

  it("holds for cabinet, material and depth, and for the hardware line when it is asked for", () => {
    fc.assert(
      fc.property(settings, (s) => {
        const book = withAnchor(
          withPercentages(SAMPLE_PRICE_BOOK, s),
          s.buildId,
          s.anchorMinor,
        );
        const materialTierId = s.isUpgradeMaterial
          ? UPGRADE_MATERIAL_ID
          : REFERENCE_MATERIAL_ID;
        const options = {
          material: materialTierId,
          depth: s.depthMm,
          hardwareTier: s.hardwareTierId,
        };

        for (const row of rowsOf(s.buildId, options, book)) {
          const priced = priceOneCabinet(
            {
              buildId: s.buildId,
              widthMm: row.widthMm,
              heightMm: heightOf(s.buildId),
              y0Mm: floorOf(s.buildId),
            },
            {
              book,
              depthMm: s.depthMm,
              materialTierId,
              hardwareTierId: s.hardwareTierId,
            },
          );

          expect(row.priceMinor - (row.hardwareMinor ?? 0)).toBe(
            cabinetInMaterialAtDepthMinor(priced),
          );
          expect(row.hardwareMinor).toBe(hardwareLineMinor(priced));
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("previewCabinet", () => {
  it("lists a hinged base from its narrowest to its widest width, a row every 50 mm", () => {
    const widths = rowsOf("base-cabinet").map(({ widthMm }) => widthMm);

    expect(widths).toEqual(range(200, 800, 50));
  });

  it("starts a sink base at its off-grid 560 mm, priced as 600, then continues on the grid", () => {
    const rows = rowsOf("base-sink");
    const [first, second] = rows;

    expect(first).toMatchObject({
      widthMm: 560,
      pricedAsWidthMm: 600,
      isOffGridMinimum: true,
    });
    expect(second).toMatchObject({ widthMm: 600, isOffGridMinimum: false });
    expect(first?.priceMinor).toBe(second?.priceMinor);
    expect(rows.slice(1).map(({ widthMm }) => widthMm)).toEqual(
      range(600, 800, 50),
    );
  });

  it("marks the row where the leaf count changes as a door step, by the width the body is built at", () => {
    const rows = rowsOf("base-cabinet");

    const steps = rows.filter(({ isDoorStep }) => isDoorStep);

    expect(steps.map(({ widthMm }) => widthMm)).toEqual([500]);
    expect(rows.find(({ widthMm }) => widthMm === 450)?.doorLeaves).toBe(1);
    expect(rows.find(({ widthMm }) => widthMm === 500)?.doorLeaves).toBe(2);
  });

  it("marks no door step on a row whose price does not read door leaves", () => {
    const rows = rowsOf("base-3drawer");

    expect(rows.some(({ isDoorStep }) => isDoorStep)).toBe(false);
  });

  it("lists one row per size of a fixed-size row, at the listed price", () => {
    const rows = rowsOf("base-dishwasher");

    expect(rows.map(({ widthMm }) => widthMm)).toEqual([450, 600]);
    expect(rows[0]?.priceMinor).toBe(275_000);
    expect(rows[1]?.priceMinor).toBe(320_000);
  });

  it("shows a structural corner at the width it is built, never at the rounded key it is priced under", () => {
    const rows = rowsOf("base-corner-return-320");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ widthMm: 330, pricedAsWidthMm: 350 });
    expect(rows[0]?.priceMinor).toBe(120_000);
  });

  it("prices a row built to its opening at the height asked for, else its anchor height", () => {
    const atAnchor = rowsOf("wall-cabinet").find(
      ({ widthMm }) => widthMm === 600,
    );
    const lower = rowsOf("wall-cabinet", { heightMm: 400 }).find(
      ({ widthMm }) => widthMm === 600,
    );

    expect(atAnchor?.priceMinor).toBe(297_000);
    expect(lower?.priceMinor).toBe(297_000 - 6 * 3_500);
  });

  it("adds the depth percentage only at the deep depth and only to a row that deepens", () => {
    const shallow = rowsOf("base-cabinet", { depth: SHALLOW_DEPTH_MM });
    const deep = rowsOf("base-cabinet", { depth: DEEP_DEPTH_MM });
    const hoodDeep = rowsOf("hood", { depth: DEEP_DEPTH_MM });
    const fridgeShallow = rowsOf("fridge-free", { depth: SHALLOW_DEPTH_MM });

    expect(deep[0]?.priceMinor).toBeGreaterThan(
      shallow[0]?.priceMinor ?? Infinity,
    );
    expect(hoodDeep.every(({ priceMinor }) => priceMinor === 0)).toBe(true);
    expect(fridgeShallow.every(({ priceMinor }) => priceMinor === 0)).toBe(
      true,
    );
  });

  it("carries the hardware of the body, which is none on a row with no hinge or drawer", () => {
    const options = { hardwareTier: STANDARD_HARDWARE_ID };

    const corner = rowsOf("base-corner-return-320", options);
    const drawers = rowsOf("base-3drawer", options);

    expect(corner[0]?.hardwareMinor).toBe(0);
    expect(drawers[0]?.hardwareMinor).toBeGreaterThan(0);
    expect(rowsOf("base-3drawer")[0]?.hardwareMinor).toBeUndefined();
  });
});

describe("previewCabinet refuses what it cannot draw", () => {
  const rule = ruleOf("base-cabinet");
  const options: CabinetPreviewOptions = {
    material: REFERENCE_MATERIAL_ID,
    depth: SHALLOW_DEPTH_MM,
    deepeningRows: DEEPENING_ROWS,
  };

  it.each([
    [
      "an unknown material",
      { material: "material.nothing" },
      "UNKNOWN_MATERIAL",
    ],
    [
      "an unknown hardware class",
      { hardwareTier: "hardware.nothing" },
      "UNKNOWN_HARDWARE",
    ],
    ["a depth the catalogue does not declare", { depth: 650 }, "UNKNOWN_DEPTH"],
  ] as const)("refuses %s", (_name, change, code) => {
    expect(
      previewCabinet(rule, CATALOG, SAMPLE_PRICE_BOOK, {
        ...options,
        ...change,
      }),
    ).toEqual({ ok: false, code });
  });

  it.each([
    [
      "a material percentage above 200",
      { materialPercent: 201, depthPercent: 15 },
    ],
    [
      "a depth percentage above 100",
      { materialPercent: 18, depthPercent: 101 },
    ],
    [
      "a depth percentage that is not whole",
      { materialPercent: 18, depthPercent: 15.5 },
    ],
  ])("refuses %s before the percentage seam is asked", (_name, percentages) => {
    const book = withPercentages(SAMPLE_PRICE_BOOK, percentages);

    expect(
      previewCabinet(rule, CATALOG, book, {
        ...options,
        material: UPGRADE_MATERIAL_ID,
      }),
    ).toEqual({ ok: false, code: "PERCENT_OUT_OF_RANGE" });
  });

  it("refuses a rule whose catalogue row is not held", () => {
    expect(
      previewCabinet(
        { ...rule, buildId: "no-such-row" },
        CATALOG,
        SAMPLE_PRICE_BOOK,
        options,
      ),
    ).toEqual({ ok: false, code: "NO_CATALOGUE_ROW" });
  });

  it("refuses a shape this build cannot evaluate", () => {
    const retired = { shape: "linear-in-width" } as never;

    expect(
      previewCabinet(
        { ...rule, formula: retired },
        CATALOG,
        withFormula(SAMPLE_PRICE_BOOK, "base-cabinet", retired),
        options,
      ),
    ).toEqual({ ok: false, code: "UNKNOWN_FORMULA_SHAPE" });
  });

  it("refuses a fixed-size rule that lists no size for a width the row is built at, as the query does", () => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-dishwasher", {
      shape: "price-per-size",
      sizes: [{ widthMm: 450, amountMinor: 275_000 }],
    });

    expect(
      previewCabinet(ruleOf("base-dishwasher", book), CATALOG, book, options),
    ).toEqual({ ok: false, code: "NO_PRICE_FOR_SIZE" });
  });

  it("uses the row the rule prices, not the id the rule is named for", () => {
    expect(pricedRowOf(CATALOG, "base-cabinet")?.buildId).toBe("base-cabinet");
  });
});

// Helpers

function range(fromMm: number, toMm: number, stepMm: number): number[] {
  const widths: number[] = [];
  for (let widthMm = fromMm; widthMm <= toMm; widthMm += stepMm)
    widths.push(widthMm);
  return widths;
}

function withAnchor(
  book: PriceBook,
  buildId: string,
  anchorMinor: number,
): PriceBook {
  const { formula } = ruleOf(buildId, book);
  return formula.shape === "price-per-size"
    ? book
    : withFormula(book, buildId, { ...formula, anchorMinor });
}
