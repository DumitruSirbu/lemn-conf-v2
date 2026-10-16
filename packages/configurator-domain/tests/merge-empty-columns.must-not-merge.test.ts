// 8U criterion 7, the anti-invariants, on hand-built maps (F4; ADR 0093): no generated pair of 800 mm or less is
// occupied or disagrees, so only these can fail for the reason each title names. The uncapped merge must still
// leave apart a column a body stands in, a pair that disagrees by more than 20 mm, and spans on two walls.
//
// R6, each through a mocked copy of the merge (src untouched): 7(a) goes red only with both the occupied filter and
// `standsIn` dropped, since each alone is caught by the other; each 7(b) dimension goes red only when its own
// agreement test is dropped; 7(c) goes red when the walls are scanned as one, or when wall B is unfolded onto wall
// A's axis at the corner; the key-only pin goes red with `isKeyTaken` dropped. Writing merged columns in another map
// order keeps all of it green.
import { describe, expect, it } from "vitest";

import { reconcileSuccessfulCommandResult } from "../src/commands/reconcile-command-result.js";
import { removePlacement } from "../src/commands/remove-placement.js";
import {
  DesignSchema,
  type Design,
  type DesignRoom,
  type EmptyColumn,
} from "../src/design.js";
import { KITCHEN_L_BODY_CATALOG } from "../src/fixtures/kitchen-l-design.js";
import { toMetres } from "../src/millimetres.js";
import {
  deriveColumns,
  derivePlacementRecords,
  deriveRecordedColumns,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../src/void-engine.js";
import { memberlessSpaces } from "./support/merge-oracle.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-10-16T12:00:00.000Z";
const L_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 4200,
  depthMm: 2400,
  heightMm: 2600,
};
const U_ROOM: DesignRoom = {
  shape: "U",
  widthMm: 4200,
  depthMm: 3000,
  wallCMm: 3000,
  heightMm: 2600,
};
const FULL_HEIGHT = { y0Mm: 0, topMm: 2600, depthMm: 580 } as const;
const DISAGREEMENT_MM = 30;
const AT_THE_TOLERANCE_MM = 20;
const PAST_THE_TOLERANCE_MM = 21;

interface World {
  readonly design: Design;
  readonly records: readonly PlacementRecord[];
  readonly recordedColumns: ReadonlyMap<string, Column>;
  readonly columns: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
}

describe("8U criterion 7(a), E6: bases cleared under standing uppers stay two base voids", () => {
  it("keeps two adjacent 300 mm columns, each under its own wall cabinet, as two keys with one 300 mm base void each", () => {
    const cleared = removedThroughTheStore(loadedTwoNarrowColumns(), [
      "b1",
      "b2",
    ]);

    expect([...cleared.columns.keys()].sort()).toEqual(["A|1.65", "A|1.95"]);
    expect(baseVoidsOf(cleared)).toEqual([
      { col: "A|1.65", widthMm: 300 },
      { col: "A|1.95", widthMm: 300 },
    ]);
  });
});

describe("8U criterion 7(b), E8: a 600 + 200 pair that disagrees stays two, with no neighbour to bridge it", () => {
  const dimensions: readonly (keyof typeof FULL_HEIGHT)[] = [
    "topMm",
    "y0Mm",
    "depthMm",
  ];

  it.each(dimensions)(
    "keeps the pair apart when %s alone differs by 30 mm, though 800 mm is within every limit",
    (dimension) => {
      const loaded = loadedSpaces(
        L_ROOM,
        pairDifferingIn(dimension, DISAGREEMENT_MM),
      );

      expect(memberlessKeys(loaded)).toEqual(["A|1.80", "A|2.20"]);
    },
  );

  it.each(dimensions)(
    "keeps the pair apart when %s differs by 21 mm, one past the tolerance",
    (dimension) => {
      const loaded = loadedSpaces(
        L_ROOM,
        pairDifferingIn(dimension, PAST_THE_TOLERANCE_MM),
      );

      expect(memberlessKeys(loaded)).toEqual(["A|1.80", "A|2.20"]);
    },
  );

  it.each(dimensions)(
    "merges the pair into one 800 mm column when %s differs by exactly 20 mm",
    (dimension) => {
      const loaded = loadedSpaces(
        L_ROOM,
        pairDifferingIn(dimension, AT_THE_TOLERANCE_MM),
      );

      expect(memberlessKeys(loaded)).toEqual(["A|1.90"]);
    },
  );
});

describe("8U criterion 7(c): nothing merges across walls B and C, which share the z axis, or across a corner", () => {
  it("keeps a wall-B span and a wall-C span apart where their z extents abut", () => {
    const loaded = loadedSpaces(U_ROOM, [
      space("B", 1650, 300),
      space("C", 1950, 300),
    ]);

    expect(memberlessKeys(loaded)).toEqual(["B|1.65", "C|1.95"]);
  });

  it("keeps a wall-B span and a wall-C span apart over the same z stretch, facing each other", () => {
    const loaded = loadedSpaces(U_ROOM, [
      space("C", 1800, 600),
      space("B", 2400, 600),
      space("C", 2400, 600),
    ]);

    expect(memberlessKeys(loaded)).toEqual(["B|2.40", "C|2.10"]);
  });

  it("keeps the spans that meet at the L's corner apart, one on each wall", () => {
    const loaded = loadedSpaces(L_ROOM, [
      space("A", 300, 600),
      space("B", 300, 600),
    ]);

    expect(memberlessKeys(loaded)).toEqual(["A|0.30", "B|0.30"]);
  });
});

describe("8U criterion 1, B4: a pair only the key guard declines", () => {
  // The merged centre (450) keys onto a 300 mm base's column at 300-600, whose stretch of wall is not the strips'.
  it("keeps the wall-row strips 0-800 and 800-900 apart over a 300 mm base keyed A|0.45, and the base's column as it was", () => {
    const loaded = loadedSpaces(
      L_ROOM,
      [wallRowStrip(400, 800), wallRowStrip(850, 100)],
      [baseBody("b", 450, 300)],
    );

    expect(memberlessKeys(loaded)).toEqual(["A|0.40", "A|0.85"]);
    expect(loaded.columns.get("A|0.45")?.w).toBe(toMetres(300));
  });
});

function pairDifferingIn(
  dimension: keyof typeof FULL_HEIGHT,
  differenceMm: number,
): EmptyColumn[] {
  return [
    space("A", 1800, 600),
    space("A", 2200, 200, {
      [dimension]:
        FULL_HEIGHT[dimension] + signedDifference(dimension, differenceMm),
    }),
  ];
}

/** Down for the top, so the column keeps its height; up for the floor and the depth. */
function signedDifference(
  dimension: keyof typeof FULL_HEIGHT,
  differenceMm: number,
): number {
  return dimension === "topMm" ? -differenceMm : differenceMm;
}

function space(
  wall: EmptyColumn["wall"],
  alongMm: number,
  widthMm: number,
  overrides: Partial<EmptyColumn> = {},
): EmptyColumn {
  return { wall, alongMm, widthMm, ...FULL_HEIGHT, ...overrides };
}

function wallRowStrip(alongMm: number, widthMm: number): EmptyColumn {
  return space("A", alongMm, widthMm, { y0Mm: 1500, depthMm: 330 });
}

function baseBody(id: string, alongMm: number, widthMm: number) {
  return {
    id,
    wall: "A",
    alongMm,
    y0Mm: 0,
    body: { buildId: "base-cabinet", widthMm, heightMm: 820 },
  };
}

function wallBody(id: string, alongMm: number) {
  return {
    id,
    wall: "A",
    alongMm,
    y0Mm: 1500,
    body: { buildId: "wall-1door-300", widthMm: 300, heightMm: 700 },
  };
}

/** Two 300 mm columns at 1500-2100, each a base and a wall cabinet. */
function loadedTwoNarrowColumns(): World {
  return loadedSpaces(
    L_ROOM,
    [],
    [
      baseBody("b1", 1650, 300),
      baseBody("b2", 1950, 300),
      wallBody("u1", 1650),
      wallBody("u2", 1950),
    ],
  );
}

function loadedSpaces(
  room: DesignRoom,
  emptyColumns: readonly EmptyColumn[],
  placements: readonly unknown[] = [],
): World {
  const design = DesignSchema.parse({
    room,
    presetId: null,
    placements,
    emptyColumns,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const records = derivePlacementRecords(design, CATALOG);
  const columns = deriveColumns(records, design, design.room);
  return {
    design,
    records,
    recordedColumns: deriveRecordedColumns(
      records,
      design,
      toMetres(design.room.widthMm),
    ),
    columns,
    voids: [],
  };
}

function removedThroughTheStore(start: World, ids: readonly string[]): World {
  return ids.reduce((world, id) => {
    const result = removePlacement({
      design: world.design,
      catalog: CATALOG,
      target: { kind: "placement", id },
      occurredAt: NOW,
    });
    if (!result.ok)
      throw new Error(`removing ${id} refused: ${result.reason.code}`);
    const reconciled = reconcileSuccessfulCommandResult({
      result,
      catalog: CATALOG,
      previousRecordedColumns: world.recordedColumns,
    });
    return {
      design: reconciled.design,
      records: reconciled.records,
      recordedColumns: reconciled.recordedColumns,
      columns: reconciled.columns,
      voids: reconciled.voids,
    };
  }, start);
}

function memberlessKeys(world: World): string[] {
  return memberlessSpaces(world.columns, world.records)
    .map((space) => space.key)
    .sort();
}

function baseVoidsOf(world: World): { col: string; widthMm: number }[] {
  return world.voids
    .filter((record) => record.y0 === 0)
    .map((record) => ({
      col: record.col,
      widthMm: Math.round(record.w * 1000),
    }))
    .sort((first, second) => first.col.localeCompare(second.col));
}
