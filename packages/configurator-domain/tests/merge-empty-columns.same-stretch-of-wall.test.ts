// Empty spaces that would merge into a run standing over the same stretch of wall as another column, the upper row
// over a corner base, stay apart when each outer edge is within one key bucket of that column's own.
import { describe, expect, it } from "vitest";

import { reconcileSuccessfulCommandResult } from "../src/commands/reconcile-command-result.js";
import { removePlacement } from "../src/commands/remove-placement.js";
import {
  cabinetDepthMmOf,
  DesignSchema,
  type Design,
  type DesignRoom,
  type EmptyColumn,
} from "../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
} from "../src/fixtures/kitchen-l-design.js";
import { generateKitchen } from "../src/generation/generate-kitchen.js";
import { toExactMillimetres, toMetres } from "../src/millimetres.js";
import { deriveColumnKeyAt } from "../src/module-grid.js";
import {
  deriveColumns,
  derivePlacementRecords,
  deriveRecordedColumns,
  type BodyCatalog,
  type Column,
  type PlacementRecord,
} from "../src/void-engine.js";
import { createFakeProbeFactory } from "./support/fake-probe.js";

/** Passed explicitly: under the editor's 800 mm limit no 900 mm run reaches the guards, so the limit, not the
 *  stretch of wall, would be what keeps it apart. */
const UNCAPPED_MM = Number.POSITIVE_INFINITY;
const NOW = "2026-10-16T12:00:00.000Z";
const CORNER_BASE_WIDTH_MM = 900;
const WALL_ROW_FLOOR_MM = 1500;

/** The off-grid U whose upper row runs 5084-5984 against its right corner base's 5085-5985. */
const ODD_WIDTH_U_ROOM: DesignRoom = {
  shape: "U",
  widthMm: 5985,
  depthMm: 3000,
  wallCMm: 3000,
  heightMm: 2200,
};
const EVEN_WIDTH_U_ROOM: DesignRoom = {
  shape: "U",
  widthMm: 5900,
  depthMm: 3000,
  wallCMm: 3000,
  heightMm: 2600,
};
const L_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 4200,
  depthMm: 2400,
  heightMm: 2600,
};

const HIGH_END_CORNER_CENTRE_MM =
  ODD_WIDTH_U_ROOM.widthMm - CORNER_BASE_WIDTH_MM / 2;
const LOW_END_CORNER_CENTRE_MM = CORNER_BASE_WIDTH_MM / 2;

interface StretchMm {
  readonly startMm: number;
  readonly endMm: number;
}

interface SpaceMm extends StretchMm {
  readonly floorMm: number;
}

interface CornerCase {
  readonly name: string;
  readonly room: DesignRoom;
  readonly cornerCentreMm: number;
  readonly strips: readonly [StretchMm, StretchMm];
}

describe("8U criterion 1 (F2′): a run over a corner base's stretch of wall stays two spaces", () => {
  const declines: readonly CornerCase[] = [
    {
      name: "the U's right corner, its upper row trimmed 1 mm (5084-5984 over 5085-5985)",
      room: ODD_WIDTH_U_ROOM,
      cornerCentreMm: HIGH_END_CORNER_CENTRE_MM,
      strips: [
        { startMm: 5084, endMm: 5884 },
        { startMm: 5884, endMm: 5984 },
      ],
    },
    {
      name: "the U's right corner, its upper row 10 mm short of both edges",
      room: ODD_WIDTH_U_ROOM,
      cornerCentreMm: HIGH_END_CORNER_CENTRE_MM,
      strips: [
        { startMm: 5075, endMm: 5875 },
        { startMm: 5875, endMm: 5975 },
      ],
    },
    {
      name: "the L's corner, its upper row 10 mm past both edges (10-910 over 0-900)",
      room: L_ROOM,
      cornerCentreMm: LOW_END_CORNER_CENTRE_MM,
      strips: [
        { startMm: 10, endMm: 810 },
        { startMm: 810, endMm: 910 },
      ],
    },
  ];

  it.each(declines)(
    "keeps the strips apart over $name, though the merged centre keys onto no column",
    ({ room, cornerCentreMm, strips }) => {
      const design = designWithCornerAndStrips(room, cornerCentreMm, strips);
      const mergedKey = deriveColumnKeyAt("A", toMetres(midpointMm(strips)));

      const columns = uncappedColumnsOf(design);

      expect(columns.has(mergedKey)).toBe(false);
      expect(memberlessStretchesOnWallA(columns, design)).toEqual(strips);
    },
  );

  const exactCorners: readonly CornerCase[] = [
    {
      name: "the U's right corner, exactly (5085-5985)",
      room: ODD_WIDTH_U_ROOM,
      cornerCentreMm: HIGH_END_CORNER_CENTRE_MM,
      strips: [
        { startMm: 5085, endMm: 5885 },
        { startMm: 5885, endMm: 5985 },
      ],
    },
    {
      name: "the L's corner, exactly (0-800 and 800-900 over 0-900; F4's F2 witness)",
      room: L_ROOM,
      cornerCentreMm: LOW_END_CORNER_CENTRE_MM,
      strips: [
        { startMm: 0, endMm: 800 },
        { startMm: 800, endMm: 900 },
      ],
    },
    {
      name: "the L's corner, 1 mm past both edges (1-901 over 0-900)",
      room: L_ROOM,
      cornerCentreMm: LOW_END_CORNER_CENTRE_MM,
      strips: [
        { startMm: 1, endMm: 801 },
        { startMm: 801, endMm: 901 },
      ],
    },
  ];

  // Control: here the merged centre keys onto the corner's own column, so the key test declines it as well.
  it.each(exactCorners)(
    "keeps the strips apart over $name, where the merged centre keys onto the corner's column",
    ({ room, cornerCentreMm, strips }) => {
      const design = designWithCornerAndStrips(room, cornerCentreMm, strips);
      const cornerKey = deriveColumnKeyAt("A", toMetres(cornerCentreMm));

      const columns = uncappedColumnsOf(design);

      expect(deriveColumnKeyAt("A", toMetres(midpointMm(strips)))).toBe(
        cornerKey,
      );
      expect(memberlessStretchesOnWallA(columns, design)).toEqual(strips);
    },
  );

  const merges: readonly CornerCase[] = [
    {
      name: "the U's right corner, 11 mm short of both edges",
      room: ODD_WIDTH_U_ROOM,
      cornerCentreMm: HIGH_END_CORNER_CENTRE_MM,
      strips: [
        { startMm: 5074, endMm: 5874 },
        { startMm: 5874, endMm: 5974 },
      ],
    },
    {
      name: "the L's corner, 11 mm past both edges",
      room: L_ROOM,
      cornerCentreMm: LOW_END_CORNER_CENTRE_MM,
      strips: [
        { startMm: 11, endMm: 811 },
        { startMm: 811, endMm: 911 },
      ],
    },
    {
      name: "the U's right corner, its left edge 10 mm off and its right edge 12 mm off",
      room: ODD_WIDTH_U_ROOM,
      cornerCentreMm: HIGH_END_CORNER_CENTRE_MM,
      strips: [
        { startMm: 5075, endMm: 5875 },
        { startMm: 5875, endMm: 5973 },
      ],
    },
    {
      name: "the U's right corner, its left edge 12 mm off and its right edge 10 mm off",
      room: ODD_WIDTH_U_ROOM,
      cornerCentreMm: HIGH_END_CORNER_CENTRE_MM,
      strips: [
        { startMm: 5073, endMm: 5873 },
        { startMm: 5873, endMm: 5975 },
      ],
    },
  ];

  it.each(merges)(
    "merges the strips into one space beside $name",
    ({ room, cornerCentreMm, strips }) => {
      const design = designWithCornerAndStrips(room, cornerCentreMm, strips);

      const columns = uncappedColumnsOf(design);

      expect(memberlessStretchesOnWallA(columns, design)).toEqual([
        { startMm: strips[0].startMm, endMm: strips[1].endMm },
      ]);
    },
  );
});

describe("8U criterion 1 (F2′) in generated U kitchens, the editor uncapped", () => {
  it("keeps the odd-width U's upper row over its right corner as two spaces once loaded", () => {
    const kitchen = generatedKitchen(ODD_WIDTH_U_ROOM);

    expect(
      spacesOnWallA(kitchen).filter(({ startMm }) => startMm >= 5000),
    ).toEqual([
      { startMm: 5084, endMm: 5884, floorMm: WALL_ROW_FLOOR_MM },
      { startMm: 5884, endMm: 5984, floorMm: WALL_ROW_FLOOR_MM },
    ]);
  });

  // §4.1's case: B3's floor test keeps the freed full-height column off the strips, and the corner keeps its two.
  it("keeps the left corner's two strips, and the column freed beside them apart, when the sink beside it is removed", () => {
    const kitchen = removeThroughTheEditor(
      generatedKitchen(EVEN_WIDTH_U_ROOM),
      "n1",
    );

    expect(spacesOnWallA(kitchen).filter(({ endMm }) => endMm <= 1500)).toEqual(
      [
        { startMm: 0, endMm: 800, floorMm: WALL_ROW_FLOOR_MM },
        { startMm: 800, endMm: 900, floorMm: WALL_ROW_FLOOR_MM },
        { startMm: 900, endMm: 1500, floorMm: 0 },
      ],
    );
  });

  it("keeps the odd-width U's right corner strips two, and the space freed beside them apart, when n9 is removed", () => {
    const kitchen = removeThroughTheEditor(
      generatedKitchen(ODD_WIDTH_U_ROOM),
      "n9",
    );

    expect(
      spacesOnWallA(kitchen).filter(({ startMm }) => startMm >= 4200),
    ).toEqual([
      { startMm: 4200, endMm: 5084, floorMm: 0 },
      { startMm: 5084, endMm: 5884, floorMm: WALL_ROW_FLOOR_MM },
      { startMm: 5884, endMm: 5984, floorMm: WALL_ROW_FLOOR_MM },
    ]);
  });
});

interface Kitchen {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly records: readonly PlacementRecord[];
  readonly recordedColumns: ReadonlyMap<string, Column>;
}

function designWithCornerAndStrips(
  room: DesignRoom,
  cornerCentreMm: number,
  strips: readonly StretchMm[],
): Design {
  return DesignSchema.parse({
    room,
    presetId: null,
    placements: [
      {
        id: "corner",
        wall: "A",
        alongMm: cornerCentreMm,
        y0Mm: 0,
        body: {
          buildId: "base-corner-x-900",
          widthMm: CORNER_BASE_WIDTH_MM,
          heightMm: 820,
        },
      },
    ],
    emptyColumns: strips.map((strip) => upperRowSpace(room, strip)),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function upperRowSpace(room: DesignRoom, strip: StretchMm): EmptyColumn {
  const widthMm = strip.endMm - strip.startMm;
  return {
    wall: "A",
    alongMm: strip.startMm + widthMm / 2,
    widthMm,
    y0Mm: WALL_ROW_FLOOR_MM,
    topMm: room.heightMm,
    depthMm: 330,
  };
}

function uncappedColumnsOf(design: Design): ReadonlyMap<string, Column> {
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  return deriveColumns(records, design, design.room, UNCAPPED_MM);
}

function memberlessStretchesOnWallA(
  columns: ReadonlyMap<string, Column>,
  design: Design,
): StretchMm[] {
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  return memberlessOnWallA(columns, records).map(({ startMm, endMm }) => ({
    startMm,
    endMm,
  }));
}

function generatedKitchen(room: DesignRoom): Kitchen {
  const result = generateKitchen({
    room,
    occurredAt: NOW,
    probeAt: createFakeProbeFactory(),
  });
  if (!result.ok) throw new Error(`${JSON.stringify(room)} did not compose`);
  const { design } = result;
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  const records = derivePlacementRecords(design, catalog);
  const recordedColumns = deriveRecordedColumns(
    records,
    design,
    toMetres(design.room.widthMm),
    UNCAPPED_MM,
  );
  return { design, catalog, records, recordedColumns };
}

/** `removePlacement`, then the store's reconcile, at the editor's uncapped limit. */
function removeThroughTheEditor(
  kitchen: Kitchen,
  placementId: string,
): Kitchen {
  const result = removePlacement({
    design: kitchen.design,
    catalog: kitchen.catalog,
    target: { kind: "placement", id: placementId },
    occurredAt: NOW,
  });
  if (!result.ok) {
    throw new Error(`removing ${placementId} refused: ${result.reason.code}`);
  }
  const reconciled = reconcileSuccessfulCommandResult({
    result,
    catalog: kitchen.catalog,
    previousRecordedColumns: kitchen.recordedColumns,
    emptyColumnWidthLimitMm: UNCAPPED_MM,
  });
  return {
    design: reconciled.design,
    catalog: kitchen.catalog,
    records: reconciled.records,
    recordedColumns: reconciled.recordedColumns,
  };
}

function spacesOnWallA(kitchen: Kitchen): SpaceMm[] {
  return memberlessOnWallA(kitchen.recordedColumns, kitchen.records);
}

function memberlessOnWallA(
  columns: ReadonlyMap<string, Column>,
  records: readonly PlacementRecord[],
): SpaceMm[] {
  const occupied = new Set(records.map((record) => record.col));
  return [...columns.values()]
    .filter((column) => column.wall === "A" && !occupied.has(column.key))
    .map(spaceOf)
    .sort((a, b) => a.startMm - b.startMm);
}

function spaceOf(column: Column): SpaceMm {
  const centreMm = millimetresOf(column.x);
  const widthMm = millimetresOf(column.w);
  const floorMm = millimetresOf(
    Math.min(...column.regions.map(([start]) => start)),
  );
  return {
    startMm: centreMm - widthMm / 2,
    endMm: centreMm + widthMm / 2,
    floorMm,
  };
}

function midpointMm(strips: readonly [StretchMm, StretchMm]): number {
  return (strips[0].startMm + strips[1].endMm) / 2;
}

function millimetresOf(valueM: number): number {
  const valueMm = toExactMillimetres(valueM);
  if (valueMm === undefined) {
    throw new Error(`${String(valueM)} m is not on whole millimetres`);
  }
  return valueMm;
}
