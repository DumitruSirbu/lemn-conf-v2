// Wave H1b QA (M10), `DisplayEntry.wornHandle`: the handle a customer-facing list names for a body.
//
// `worn-handle.test.ts` sweeps every row; this file attacks what that sweep leaves open. Its oracle counts opening
// fronts by `doorLeafHeightsMm(...).length + drawerCount(...)`, never by `openingFrontCount`, so a defect in the shared
// counter shows. The projection is a list of bodies and must stay total over a body whose fronts cannot be read (the
// price names that failure with its own code), so every row is driven through frame heights down to nothing at each
// floor around the module line, and the projection must neither throw nor let the price throw.
import { describe, expect, it } from "vitest";

import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { WALL_DOOR_BAND_INSET_MM } from "../../src/front-population.js";
import {
  countHardwareMechanisms,
  doorLeafHeightsMm,
  drawerCount,
  frontPopulationQueryFor,
  KITCHEN_L_DESIGN,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type BodyCatalog,
  type BodyDefinition,
  type Design,
  type DisplayEntry,
  type Handle,
} from "../../src/index.js";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";
import { NOTHING_DISABLED } from "../support/availability.js";

const MODULE_LINE_MM = 2_200;
const FLOORS_MM = [0, MODULE_LINE_MM - 1, MODULE_LINE_MM, MODULE_LINE_MM + 1];
const DEPTHS_MM = [600, 700];
const KITCHEN_HANDLES: readonly (Handle | undefined)[] = [
  undefined,
  "steel",
  "black",
  "push",
];
const ODD_HEIGHTS_MM = [1, 19, 20, 50, 99, 100, 101, 150];

function soloDesign(args: {
  readonly catalog: BodyCatalog;
  readonly buildId: string;
  readonly y0Mm: number;
  readonly heightMm: number;
  readonly kitchen: Handle | undefined;
}): Design {
  const definition = args.catalog.get(args.buildId);
  return {
    ...KITCHEN_L_DESIGN,
    settings: {
      ...KITCHEN_L_DESIGN.settings,
      ...(args.kitchen === undefined ? {} : { handle: args.kitchen }),
    },
    placements: [
      {
        id: "solo",
        wall: "A",
        alongMm: 300,
        y0Mm: args.y0Mm,
        body: {
          buildId: args.buildId,
          widthMm: definition?.sizesMm?.[0] ?? 600,
          heightMm: args.heightMm,
        },
      },
    ],
  };
}

function independentFronts(entry: DisplayEntry, catalog: BodyCatalog): number {
  const query = frontPopulationQueryFor({
    body: entry,
    definition: catalog.get(entry.buildId) ?? {},
  });
  return doorLeafHeightsMm(query).length + drawerCount(query);
}

describe("the projection stays total over a body whose fronts cannot be read", () => {
  it("never throws from projectDesignForDisplay, and the price returns a result rather than throwing, on every row at every height and floor", () => {
    const threw: string[] = [];
    let unreadable = 0;
    let swept = 0;

    for (const depthMm of DEPTHS_MM) {
      const catalog = buildKitchenLBodyCatalog(depthMm);
      for (const [buildId, definition] of catalog) {
        const heights = [...ODD_HEIGHTS_MM, definition.nominalHeightMm ?? 700];
        for (const heightMm of heights) {
          for (const y0Mm of FLOORS_MM) {
            for (const kitchen of KITCHEN_HANDLES) {
              const design = soloDesign({
                catalog,
                buildId,
                y0Mm,
                heightMm,
                kitchen,
              });
              swept += 1;
              try {
                const entries = projectDesignForDisplay(
                  design,
                  catalog,
                ).flatMap((group) => group.entries);
                const result = priceDesign({
                  design,
                  catalog,
                  book: SAMPLE_PRICE_BOOK,
                  pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
                  deepeningRows: MEASURED_DEEPENING_ROWS,
                  availability: NOTHING_DISABLED,
                });
                if (
                  !result.ok &&
                  result.failure.code === "UNBUILDABLE_DOOR_BAND"
                ) {
                  unreadable += 1;
                } else if (result.ok) {
                  const latches = countHardwareMechanisms(entries, catalog);
                  expect(latches.pushToOpen).toBeGreaterThanOrEqual(0);
                }
              } catch (error) {
                threw.push(
                  `${buildId} h=${String(heightMm)} y0=${String(y0Mm)} depth=${String(depthMm)}: ${String(error)}`,
                );
              }
            }
          }
        }
      }
    }

    expect(swept).toBeGreaterThan(5_000);
    expect(threw).toEqual([]);
    expect(unreadable).toBeGreaterThan(0);
  });

  it("prices a top-row body with an unbuildable band as UNBUILDABLE_DOOR_BAND, as it does below the top row", () => {
    const catalog = buildKitchenLBodyCatalog(600);
    const codeAt = (y0Mm: number) => {
      const result = priceDesign({
        design: soloDesign({
          catalog,
          buildId: "wall-cabinet",
          y0Mm,
          heightMm: WALL_DOOR_BAND_INSET_MM,
          kitchen: "push",
        }),
        catalog,
        book: SAMPLE_PRICE_BOOK,
        pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
        deepeningRows: MEASURED_DEEPENING_ROWS,
        availability: NOTHING_DISABLED,
      });
      return result.ok ? "ok" : result.failure.code;
    };

    expect(codeAt(MODULE_LINE_MM)).toBe(codeAt(0));
    expect(codeAt(0)).toBe("UNBUILDABLE_DOOR_BAND");
  });
});

describe("the worn handle is the oracle's with the front count taken independently", () => {
  it("names push exactly where the price bills a latch, every row, floor, handle choice and depth", () => {
    const wrong: string[] = [];

    for (const depthMm of DEPTHS_MM) {
      const catalog = buildKitchenLBodyCatalog(depthMm);
      for (const [buildId, definition] of catalog) {
        for (const y0Mm of FLOORS_MM) {
          for (const kitchen of KITCHEN_HANDLES) {
            for (const own of KITCHEN_HANDLES) {
              const design = soloDesign({
                catalog,
                buildId,
                y0Mm,
                heightMm: definition.nominalHeightMm ?? 700,
                kitchen,
              });
              const [placement] = design.placements;
              if (!placement) throw new Error("no placement");
              const dealt: Design =
                own === undefined
                  ? design
                  : {
                      ...design,
                      placements: [
                        {
                          ...placement,
                          body: { ...placement.body, handle: own },
                        },
                      ],
                    };
              const [entry] = projectDesignForDisplay(dealt, catalog).flatMap(
                (group) => group.entries,
              );
              if (!entry) throw new Error("no entry");
              const fronts = independentFronts(entry, catalog);
              const isTopRow = y0Mm >= MODULE_LINE_MM;
              const expected = definition.canHandle
                ? (own ?? (isTopRow ? "push" : (kitchen ?? "steel")))
                : isTopRow && fronts > 0
                  ? "push"
                  : undefined;
              const latches = countHardwareMechanisms(
                [entry],
                catalog,
              ).pushToOpen;
              if (
                entry.wornHandle !== expected ||
                (entry.wornHandle === "push") !== latches > 0
              ) {
                wrong.push(
                  `${buildId}@${String(y0Mm)} d${String(depthMm)} own=${String(own)} kitchen=${String(kitchen)}: worn ${String(entry.wornHandle)}, oracle ${String(expected)}, latches ${String(latches)}`,
                );
              }
            }
          }
        }
      }
    }

    expect(wrong).toEqual([]);
  });

  it("keeps wall-corner-return-570-top push at the line and nothing a millimetre below it", () => {
    const catalog = buildKitchenLBodyCatalog(600);
    const wornAt = (y0Mm: number) => {
      const [entry] = projectDesignForDisplay(
        soloDesign({
          catalog,
          buildId: "wall-corner-return-570-top",
          y0Mm,
          heightMm: 400,
          kitchen: "black",
        }),
        catalog,
      ).flatMap((group) => group.entries);
      return entry?.wornHandle;
    };

    expect(wornAt(MODULE_LINE_MM - 1)).toBeUndefined();
    expect(wornAt(MODULE_LINE_MM)).toBe("push");
    expect(wornAt(MODULE_LINE_MM + 1)).toBe("push");
  });
});

/**
 * `BodyCatalog` is a supplied port, so a row can take no handle yet declare fronts that cannot be read. The price names
 * that with its own refusal (ADR 0092 decision 16); a top-row body of such a row asks the projection to count its
 * fronts to decide `wornHandle`, so the projection (and the price, which projects first) must not throw where it is
 * total below the top row.
 */
describe("a top-row body that takes no handle and whose fronts cannot be read", () => {
  const TOP_ROW_CORNER = "wall-corner-return-570-top";

  function catalogWith(
    buildId: string,
    change: (row: BodyDefinition) => BodyDefinition,
  ): BodyCatalog {
    const base = buildKitchenLBodyCatalog(600);
    const row = base.get(buildId);
    if (!row) throw new Error(`no row ${buildId}`);
    return new Map([...base, [buildId, change(row)]]);
  }

  function withoutFronts(row: BodyDefinition): BodyDefinition {
    const undeclared: {
      -readonly [Key in keyof BodyDefinition]: BodyDefinition[Key];
    } = { ...row };
    delete undeclared.fronts;
    return undeclared;
  }

  const unbuildable = (row: BodyDefinition): BodyDefinition => ({
    ...row,
    canHandle: false,
  });

  const CASES = [
    ["undeclared fronts", TOP_ROW_CORNER, withoutFronts, 400],
    [
      "an unbuildable door band",
      "wall-cabinet",
      unbuildable,
      WALL_DOOR_BAND_INSET_MM,
    ],
  ] as const;

  it.each(CASES)(
    "%s: projects as it does below the top row, and the price refuses with its own code at both floors",
    (_name, buildId, change, heightMm) => {
      const catalog = catalogWith(buildId, change);
      const codeAt = (y0Mm: number) => {
        const design = soloDesign({
          catalog,
          buildId,
          y0Mm,
          heightMm,
          kitchen: undefined,
        });
        projectDesignForDisplay(design, catalog);
        const result = priceDesign({
          design,
          catalog,
          book: SAMPLE_PRICE_BOOK,
          pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
          deepeningRows: MEASURED_DEEPENING_ROWS,
          availability: NOTHING_DISABLED,
        });
        return result.ok ? "ok" : result.failure.code;
      };

      expect(codeAt(MODULE_LINE_MM)).toBe(codeAt(0));
      expect(codeAt(0)).not.toBe("ok");
    },
  );
});
