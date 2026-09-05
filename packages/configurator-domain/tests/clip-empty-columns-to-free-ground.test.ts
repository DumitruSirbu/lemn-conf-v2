// ADR 0090 decision 4b — the funnel's fourth stage: a member-less column standing on ground a
// placement occupies is dropped whole.
//
// Mirrors `clip-empty-columns-at-wall-end.test.ts`'s structure, because it is that pass's sibling:
// both are map-level passes that hold a member-less column to a bound no single command sees
// end-to-end, both only ever remove, and both decline rather than refuse.
//
// **A guard that cannot fire and a guard that quietly eats a space are the two failures here**, and
// both are checked: the vacuity cases below say what it must not touch, and the non-vacuity case
// says it can drop.
import { describe, expect, it } from "vitest";

import { finishesAtMm } from "../src/occupied-depth.js";
import {
  clipEmptyColumnsToFreeGround,
  type ColumnExtent,
  type PlacementRecord,
} from "../src/void-engine.js";

/** A member-less base column at the given along-wall centre and width, on wall A unless overridden —
 *  structurally the `ColumnExtent` the funnel hands this pass. */
function columnAt(
  alongM: number,
  widthM: number,
  overrides: Partial<ColumnExtent> = {},
): ColumnExtent {
  return {
    key: `A|${alongM.toFixed(2)}`,
    wall: "A",
    ry: 0,
    x: alongM,
    z: 0.29,
    w: widthM,
    d: 0.58,
    top: 0.82,
    regions: [[0, 0.82]],
    ...overrides,
  };
}

function mapOf(
  columns: readonly ColumnExtent[],
): ReadonlyMap<string, ColumnExtent> {
  return new Map(columns.map((column) => [column.key, column]));
}

/** One standing body, at an along-wall centre and a vertical interval. `col` is what makes a column
 *  "occupied"; the frame is what this pass measures the overlap against. */
function recordAt(input: {
  readonly col: string;
  readonly alongM: number;
  readonly widthM: number;
  readonly y0M?: number;
  readonly heightM?: number;
  readonly wall?: "A" | "B";
}): PlacementRecord {
  const wall = input.wall ?? "A";
  const alongAxis =
    wall === "A" ? { x: input.alongM, z: 0.29 } : { x: 0.29, z: input.alongM };
  return {
    id: `p-${input.col}`,
    buildId: "base-600",
    kind: "base_cabinet",
    frame: {
      ...alongAxis,
      ry: 0,
      y0: input.y0M ?? 0,
      w: input.widthM,
      h: input.heightM ?? 0.82,
      d: 0.58,
    },
    occupiedDepth: finishesAtMm(580),
    col: input.col,
    wall,
    rotated: false,
    band: "base",
    widthMm: Math.round(input.widthM * 1000),
    heightMm: Math.round((input.heightM ?? 0.82) * 1000),
    canFinish: true,
    canHandle: true,
    canReplace: true,
    canDelete: true,
    fixedWidth: false,
  };
}

describe("what the pass leaves alone", () => {
  it("returns the map by identity when nothing stands on any free ground", () => {
    const columns = mapOf([columnAt(1.0, 0.6)]);

    expect(
      clipEmptyColumnsToFreeGround(columns, [
        recordAt({ col: "A|2.00", alongM: 2.0, widthM: 0.6 }),
      ]),
    ).toBe(columns);
  });

  // An occupied column's extent is what holds its own members, and `extentContains` is what judges
  // those. Dropping it would delete a run's own frozen extent for the crime of holding a body.
  it("never drops a column that has a member of its own", () => {
    const columns = mapOf([columnAt(1.0, 0.6)]);
    const standing = recordAt({ col: "A|1.00", alongM: 1.0, widthM: 0.6 });

    expect(clipEmptyColumnsToFreeGround(columns, [standing])).toBe(columns);
  });

  // ADR 0046 merges two spaces that meet at a coordinate, so `a.end === b.start` is an input the
  // product reads rather than an overlap. `1.2 ± 0.3` against `0.74 ± 0.16` is the pair that reads
  // as a 1.11e-16 m overlap in metres and as exactly zero in millimetres — the cleared oven tower
  // beside the corner return, on the shipped kitchen.
  it("treats two runs that merely abut as sharing no ground", () => {
    const columns = mapOf([columnAt(1.2, 0.6)]);
    const neighbours = [
      recordAt({ col: "A|0.74", alongM: 0.74, widthM: 0.32 }),
      recordAt({ col: "A|1.80", alongM: 1.8, widthM: 0.6 }),
    ];

    expect(clipEmptyColumnsToFreeGround(columns, neighbours)).toBe(columns);
  });

  // The vertical half, which is as much of the overlap as the horizontal one: a member-less wall
  // column and a base cabinet at the same along-wall coordinate share nothing at all.
  it("ignores a body standing under it at another level", () => {
    const wallColumn = columnAt(1.0, 0.6, {
      top: 2.2,
      regions: [[1.5, 2.2]],
    });
    const columns = mapOf([wallColumn]);

    expect(
      clipEmptyColumnsToFreeGround(columns, [
        recordAt({ col: "A|1.00b", alongM: 1.0, widthM: 0.6, heightM: 0.82 }),
      ]),
    ).toBe(columns);
  });

  // Both walls originate at the same corner and walk their own axis (§2), so the same along-wall
  // coordinate on wall A and on wall B are two different places.
  it("never compares a column on one wall with a body on the other", () => {
    const columns = mapOf([columnAt(1.0, 0.6)]);

    expect(
      clipEmptyColumnsToFreeGround(columns, [
        recordAt({ col: "B|1.00", alongM: 1.0, widthM: 0.6, wall: "B" }),
      ]),
    ).toBe(columns);
  });
});

describe("what the pass drops", () => {
  // **The non-vacuity case, and the population ADR 0090 decision 4a leaves it for**: an extent with
  // no recorded source cannot follow a sliding run, so the run slides out from under it and a body
  // ends up standing on recorded free space. Without this drop the document carries
  // `EMPTY_COLUMN_OVERLAPS_PLACEMENT`, which is a refusal at the `PUT` seam.
  it("drops a member-less column a body has slid onto", () => {
    const stranded = columnAt(1.2, 0.6);
    const columns = mapOf([stranded, columnAt(2.4, 0.6)]);
    // The run moved 100 mm along the wall and now reaches 100 mm into the stranded space.
    const slid = recordAt({ col: "A|1.30", alongM: 1.3, widthM: 0.6 });

    const free = clipEmptyColumnsToFreeGround(columns, [slid]);

    expect(free.has(stranded.key)).toBe(false);
    expect(free.has("A|2.40")).toBe(true);
  });

  // **Dropped whole, not cut back** (ADR 0090's alternatives): a partial cut invents a coordinate as
  // surely as a chain default does, and an interior overlap would split one recorded space into two
  // the customer never made.
  it("removes the whole column rather than the overlapping part of it", () => {
    const wide = columnAt(1.2, 0.8);
    const columns = mapOf([wide]);

    const free = clipEmptyColumnsToFreeGround(columns, [
      recordAt({ col: "A|1.55", alongM: 1.55, widthM: 0.1 }),
    ]);

    expect([...free.keys()]).toEqual([]);
  });

  // Overlap on both axes at once, so the drop is not passing on the along-wall half alone.
  it("drops only where the vertical intervals overlap too", () => {
    const wallColumn = columnAt(1.2, 0.6, { top: 2.2, regions: [[1.5, 2.2]] });
    const columns = mapOf([wallColumn]);
    const under = recordAt({ col: "A|1.30", alongM: 1.3, widthM: 0.6 });
    const beside = recordAt({
      col: "A|1.30w",
      alongM: 1.3,
      widthM: 0.6,
      y0M: 1.5,
      heightM: 0.7,
    });

    expect(clipEmptyColumnsToFreeGround(columns, [under])).toBe(columns);
    expect(clipEmptyColumnsToFreeGround(columns, [beside]).size).toBe(0);
  });
});

describe("what the pass declines to judge", () => {
  // The same stance `reachesPastWallEnd` takes for its own ungriddable input, and the safe direction
  // for a guard whose only action is to remove: a column no document could carry is one this pass
  // has nothing to say about.
  it("leaves a column whose coordinate is off the millimetre grid", () => {
    const columns = mapOf([columnAt(1.2005, 0.6)]);

    expect(
      clipEmptyColumnsToFreeGround(columns, [
        recordAt({ col: "A|1.30", alongM: 1.3, widthM: 0.6 }),
      ]),
    ).toBe(columns);
  });

  it("leaves a column with no region to stand on", () => {
    const columns = mapOf([columnAt(1.2, 0.6, { regions: [] })]);

    expect(
      clipEmptyColumnsToFreeGround(columns, [
        recordAt({ col: "A|1.30", alongM: 1.3, widthM: 0.6 }),
      ]),
    ).toBe(columns);
  });
});
