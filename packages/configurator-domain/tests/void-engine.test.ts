import { describe, expect, it } from "vitest";

import type { Design, DesignPlacement } from "../src/design.js";
import {
  ACCESSORY_MAX_HEIGHT_M,
  deriveColumns,
  derivePlacementRecords,
  LEVELS,
  MIN_SPAN_M,
  recomputeVoids,
  UnknownBodyError,
  type BodyCatalog,
  type BodyDefinition,
  type Column,
  type PlacementRecord,
} from "../src/void-engine.js";

const now = "2026-08-25T00:00:00.000Z";

function makeDesign(placements: DesignPlacement[]): Design {
  return {
    room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
    presetId: null,
    placements,
    createdAt: now,
    updatedAt: now,
  };
}

function makePlacement(
  overrides: Partial<DesignPlacement> = {},
): DesignPlacement {
  return {
    id: "p0",
    wall: "A",
    alongMm: 1300,
    y0Mm: 0,
    body: { buildId: "base-600", widthMm: 600, heightMm: 720 },
    ...overrides,
  };
}

const baseDefinition: BodyDefinition = {
  kind: "base_cabinet",
  band: "base",
  frameDepthMm: 560,
  canFinish: true,
  canHandle: true,
  canReplace: true,
  canDelete: true,
  fixedWidth: false,
};

const tallDefinition: BodyDefinition = {
  ...baseDefinition,
  kind: "tall_unit",
  band: "column",
  frameHeightMm: 1850,
};

const wallDefinition: BodyDefinition = {
  ...baseDefinition,
  kind: "wall_cabinet",
  band: "wall",
  frameDepthMm: 330,
};

const accessoryDefinition: BodyDefinition = {
  ...baseDefinition,
  kind: "induction_cooktop",
  band: "base",
  frameDepthMm: 560,
  frameHeightMm: 40,
  canReplace: false,
  canDelete: false,
};

const catalog: BodyCatalog = new Map([
  ["base-600", baseDefinition],
  ["fridge-700", { ...tallDefinition, kind: "fridge_freestanding" }],
  ["wall-only-330", wallDefinition],
  ["cooktop", accessoryDefinition],
]);

/** A column occupying the full 0–2.6 height in a single member, matching `recomputeVoids`'
 *  pseudocode variables `y`/`top`/`regions` directly, for tests that don't need a `Design`. */
function makeColumn(overrides: Partial<Column> = {}): Column {
  return {
    key: "A|1.30",
    wall: "A",
    ry: 0,
    x: 1.3,
    z: 0.3,
    w: 0.6,
    d: 0.56,
    top: 2.6,
    regions: [[0, 2.6]],
    ...overrides,
  };
}

function makeRecord(overrides: Partial<PlacementRecord> = {}): PlacementRecord {
  return {
    id: "p0",
    buildId: "base-600",
    kind: "base_cabinet",
    frame: { x: 1.3, z: 0.3, ry: 0, y0: 0, w: 0.6, h: 2.6, d: 0.56 },
    col: "A|1.30",
    wall: "A",
    rotated: false,
    band: "base",
    widthMm: 600,
    heightMm: 2600,
    canFinish: true,
    canHandle: true,
    canReplace: true,
    canDelete: true,
    fixedWidth: false,
    accessory: false,
    ...overrides,
  };
}

describe("derivePlacementRecords", () => {
  it("derives frame width from the carcass, not a mesh bound", () => {
    const design = makeDesign([
      makePlacement({
        body: { buildId: "base-600", widthMm: 600, heightMm: 720 },
      }),
    ]);
    const [record] = derivePlacementRecords(design, catalog);
    expect(record?.frame.w).toBe(0.6);
  });

  it("derives frame height/depth from the catalog's full extent, not the nominal carcass height", () => {
    const design = makeDesign([
      makePlacement({
        body: { buildId: "fridge-700", widthMm: 700, heightMm: 1850 },
      }),
    ]);
    const [record] = derivePlacementRecords(design, catalog);
    expect(record?.frame.h).toBeCloseTo(1.85, 6);
    expect(record?.frame.d).toBeCloseTo(0.56, 6);
  });

  it("keys the column A|<x> on wall A and B|<z> on wall B", () => {
    const design = makeDesign([
      makePlacement({ id: "a", wall: "A", alongMm: 1300 }),
      makePlacement({ id: "b", wall: "B", alongMm: 1200 }),
    ]);
    const [wallA, wallB] = derivePlacementRecords(design, catalog);
    expect(wallA?.col).toBe("A|1.30");
    expect(wallB?.col).toBe("B|1.20");
    expect(wallB?.rotated).toBe(true);
  });

  it("flags a worktop accessory by frame height and marks it non-replaceable/non-deletable", () => {
    const design = makeDesign([
      makePlacement({
        body: { buildId: "cooktop", widthMm: 600, heightMm: 40 },
      }),
    ]);
    const [record] = derivePlacementRecords(design, catalog);
    expect(record?.accessory).toBe(true);
    expect(record?.frame.h).toBeLessThan(ACCESSORY_MAX_HEIGHT_M);
    expect(record?.canReplace).toBe(false);
    expect(record?.canDelete).toBe(false);
  });

  it("remembers finishKey/handleMode from the body", () => {
    const design = makeDesign([
      makePlacement({
        body: {
          buildId: "base-600",
          widthMm: 600,
          heightMm: 720,
          finish: "oak",
          handle: "black",
        },
      }),
    ]);
    const [record] = derivePlacementRecords(design, catalog);
    expect(record?.finishKey).toBe("oak");
    expect(record?.handleMode).toBe("black");
  });

  it("throws a domain error for an unknown buildId rather than returning null", () => {
    const design = makeDesign([
      makePlacement({
        body: { buildId: "missing", widthMm: 600, heightMm: 720 },
      }),
    ]);
    expect(() => derivePlacementRecords(design, catalog)).toThrow(
      UnknownBodyError,
    );
  });
});

describe("deriveColumns", () => {
  it("takes x/z from the deepest member, width from the narrowest, depth from the deepest", () => {
    const shallow = makeRecord({
      id: "shallow",
      frame: { x: 1.3, z: 0.3, ry: 0, y0: 0, w: 0.6, h: 0.86, d: 0.4 },
      col: "A|1.30",
    });
    const deep = makeRecord({
      id: "deep",
      frame: { x: 1.35, z: 0.32, ry: 0, y0: 1.5, w: 0.5, h: 0.7, d: 0.56 },
      col: "A|1.30",
    });
    const columns = deriveColumns([shallow, deep]);
    const column = columns.get("A|1.30");
    expect(column?.x).toBe(1.35);
    expect(column?.z).toBe(0.32);
    expect(column?.w).toBe(0.5);
    expect(column?.d).toBe(0.56);
  });

  it("derives top from the highest reach and regions from every member's vertical extent", () => {
    const lower = makeRecord({
      id: "lower",
      frame: { x: 1.3, z: 0.3, ry: 0, y0: 0, w: 0.6, h: 1.85, d: 0.56 },
      col: "A|1.30",
    });
    const upper = makeRecord({
      id: "upper",
      frame: { x: 1.3, z: 0.3, ry: 0, y0: 1.85, w: 0.6, h: 0.75, d: 0.56 },
      col: "A|1.30",
    });
    const columns = deriveColumns([lower, upper]);
    const column = columns.get("A|1.30");
    expect(column?.top).toBeCloseTo(2.6, 6);
    expect(column?.regions).toEqual([
      [0, 1.85],
      [1.85, 2.6],
    ]);
  });

  it("gives a wall-only column its own lowest module as the floor, not 0", () => {
    const wallOnly = makeRecord({
      id: "wall-only",
      buildId: "wall-only-330",
      kind: "wall_cabinet",
      band: "wall",
      frame: { x: 0.3, z: 0.165, ry: 0, y0: 1.5, w: 0.6, h: 0.7, d: 0.33 },
      col: "A|0.30",
    });
    const columns = deriveColumns([wallOnly]);
    expect(columns.get("A|0.30")?.regions[0]?.[0]).toBe(1.5);
  });

  it("contributes nothing from accessories", () => {
    const host = makeRecord({ id: "host", col: "A|1.30" });
    const accessory = makeRecord({
      id: "accessory",
      col: "A|1.30",
      accessory: true,
      frame: { x: 1.3, z: 0.36, ry: 0, y0: 0.86, w: 0.6, h: 0.04, d: 0.56 },
    });
    const columns = deriveColumns([host, accessory]);
    // Only the host's own 0.6 m width should count; an accessory would have narrowed nothing here,
    // but its region must not appear either.
    expect(columns.get("A|1.30")?.regions).toEqual([[0, 2.6]]);
  });
});

describe("recomputeVoids", () => {
  it("row 17: an interval intersecting no module line produces no void (no fallback)", () => {
    const column = makeColumn({ regions: [[0.86, 1.5]], top: 1.5 });
    const columns = new Map([[column.key, column]]);
    // Nothing occupies the column; its own regions already bound it to the backsplash gap.
    expect(recomputeVoids([], columns)).toEqual([]);
  });

  it("row 18: a wall-only column invents no floor space beneath it", () => {
    const column = makeColumn({ regions: [[1.5, 2.2]], top: 2.6 });
    const columns = new Map([[column.key, column]]);
    const voids = recomputeVoids([], columns);
    expect(voids.every((v) => v.y0 >= 1.5)).toBe(true);
    expect(voids.some((v) => v.y0 < 1.5)).toBe(false);
  });

  it("row 1: clearing a fridge column and re-inserting the fridge leaves one 750 mm slot, not two stubs", () => {
    const column = makeColumn({
      regions: [
        [0, 1.85],
        [1.85, 2.6],
      ],
      top: 2.6,
    });
    const columns = new Map([[column.key, column]]);
    const fridge = makeRecord({
      id: "fridge",
      col: column.key,
      frame: {
        x: column.x,
        z: column.z,
        ry: 0,
        y0: 0,
        w: 0.7,
        h: 1.85,
        d: 0.56,
      },
    });
    const voids = recomputeVoids([fridge], columns);
    expect(voids).toHaveLength(1);
    expect(voids[0]?.y0).toBeCloseTo(1.85, 6);
    expect(voids[0]?.h).toBeCloseTo(0.75, 6);
  });

  it("clearing a standard full column yields exactly three slots, each reporting spanH = 2.6", () => {
    const column = makeColumn();
    const columns = new Map([[column.key, column]]);
    const voids = recomputeVoids([], columns);
    expect(voids.map((v) => [v.y0, v.y0 + v.h])).toEqual([
      [0, 0.86],
      [1.5, 2.2],
      [2.2, 2.6],
    ]);
    expect(voids.every((v) => v.spanH === 2.6)).toBe(true);
  });

  it("merges two vertically adjacent freed openings before subdividing: fridge + unit above both cleared", () => {
    const column = makeColumn({
      regions: [
        [0, 1.85],
        [1.85, 2.6],
      ],
      top: 2.6,
    });
    const columns = new Map([[column.key, column]]);
    const voids = recomputeVoids([], columns);
    expect(voids.map((v) => [v.y0, v.y0 + v.h])).toEqual([
      [0, 0.86],
      [1.5, 2.2],
      [2.2, 2.6],
    ]);
    expect(voids.every((v) => v.spanH === 2.6)).toBe(true);
  });

  it("subdivides by module lines, not the column's original member history", () => {
    const column = makeColumn({
      regions: [
        [0, 1.85],
        [1.85, 2.6],
      ],
      top: 2.6,
    });
    const columns = new Map([[column.key, column]]);
    const voids = recomputeVoids([], columns);
    // Base/middle/top per LEVELS, never the fridge's own 0–1.85 / 1.85–2.6 split.
    expect(voids).toHaveLength(3);
    voids.forEach((v, index) => {
      expect(v.h).toBeCloseTo([0.86, 0.7, 0.4][index] ?? Number.NaN, 6);
    });
  });

  it(`a free interval shorter than MIN_SPAN (${String(MIN_SPAN_M)}) produces no void`, () => {
    const column = makeColumn({
      regions: [[0, 2.5]],
      top: 2.5 + MIN_SPAN_M / 2,
    });
    const columns = new Map([[column.key, column]]);
    const occupant = makeRecord({
      id: "filler",
      col: column.key,
      frame: {
        x: column.x,
        z: column.z,
        ry: 0,
        y0: 0,
        w: 0.6,
        h: 2.5,
        d: 0.56,
      },
    });
    expect(recomputeVoids([occupant], columns)).toEqual([]);
  });

  it("is deterministic and order-independent: same design produces the same void set", () => {
    const column = makeColumn();
    const columns = new Map([[column.key, column]]);
    const a = makeRecord({
      id: "a",
      col: column.key,
      frame: { x: 1.3, z: 0.3, ry: 0, y0: 0, w: 0.6, h: 0.86, d: 0.56 },
    });
    const b = makeRecord({
      id: "b",
      col: column.key,
      frame: { x: 1.3, z: 0.3, ry: 0, y0: 1.5, w: 0.6, h: 0.7, d: 0.56 },
    });
    const forward = recomputeVoids([a, b], columns);
    const reversed = recomputeVoids([b, a], columns);
    expect(reversed).toEqual(forward);
  });

  it("judges occupancy by the frame, not mesh bounds: an accessory's extent never inflates the module pitch", () => {
    const column = makeColumn();
    const columns = new Map([[column.key, column]]);
    const host = makeRecord({
      id: "host",
      col: column.key,
      frame: { x: 1.3, z: 0.3, ry: 0, y0: 0, w: 0.6, h: 0.86, d: 0.56 },
    });
    const accessory = makeRecord({
      id: "cooktop",
      col: column.key,
      accessory: true,
      frame: { x: 1.3, z: 0.36, ry: 0, y0: 0.86, w: 0.6, h: 0.04, d: 0.56 },
    });
    const withoutAccessory = recomputeVoids([host], columns);
    const withAccessory = recomputeVoids([host, accessory], columns);
    expect(withAccessory).toEqual(withoutAccessory);
  });

  it("pins the LEVELS boundaries as named constants", () => {
    expect(LEVELS).toEqual([
      [0, 0.86],
      [1.5, 2.2],
      [2.2, 2.6],
    ]);
  });
});
