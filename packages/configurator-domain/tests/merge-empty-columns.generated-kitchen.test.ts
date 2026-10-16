// Spaces cleared in a generated kitchen through the store's own path: `removePlacement`, then
// `reconcileSuccessfulCommandResult`. Cleared neighbours become one space whatever their total, wherever they
// stand in the run (see 8U plan §5).
import { describe, expect, it } from "vitest";

import { reconcileSuccessfulCommandResult } from "../src/commands/reconcile-command-result.js";
import { removePlacement } from "../src/commands/remove-placement.js";
import {
  cabinetDepthMmOf,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type DesignWall,
} from "../src/design.js";
import { buildKitchenLBodyCatalog } from "../src/fixtures/kitchen-l-design.js";
import { generateKitchen } from "../src/generation/generate-kitchen.js";
import { toExactMillimetres, toMetres } from "../src/millimetres.js";
import { LEVELS } from "../src/module-grid.js";
import {
  deriveColumns,
  derivePlacementRecords,
  deriveRecordedColumns,
  recomputeVoids,
  type BodyCatalog,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../src/void-engine.js";
import { createFakeProbeFactory } from "./support/fake-probe.js";

const OCCURRED_AT = "2026-10-16T12:00:00.000Z";
const LEVEL_FLOORS_MM = LEVELS.map(([floorM]) => millimetresOf(floorM));

/** The room the owner reported from: wall A has the sink at 900-1500, drawers 1800, hob 2400, free end 3600-4100. */
const OWNERS_L_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 4100,
  depthMm: 3300,
  heightMm: 2600,
};
const DRAWERS_COLUMN_KEY = "A|1.80";
const HOB_COLUMN_KEY = "A|2.40";

/** Wall A of this U: sink column 900-1500, hob column 1500-2100, an empty 100 at 2100-2200, then the A∩C corner. */
const U_ROOM_WITH_A_100_LEFTOVER: DesignRoom = {
  shape: "U",
  widthMm: 3100,
  depthMm: 1000,
  wallCMm: 1000,
  heightMm: 2600,
};
const HOB_BESIDE_THE_LEFTOVER_KEY = "A|1.80";

interface Kitchen {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly records: readonly PlacementRecord[];
  readonly recordedColumns: ReadonlyMap<string, Column>;
  readonly columns: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
}

interface SpanMm {
  readonly startMm: number;
  readonly endMm: number;
}

interface LevelOpeningMm extends SpanMm {
  readonly floorMm: number;
}

describe("spaces cleared in a generated kitchen", () => {
  it("joins a cleared 600 and the empty 100 beside it, between standing bodies, into one 700 space per level", () => {
    const generated = generatedKitchen(U_ROOM_WITH_A_100_LEFTOVER);
    expect(memberFloorsMm(generated, HOB_BESIDE_THE_LEFTOVER_KEY)).toEqual(
      LEVEL_FLOORS_MM,
    );

    const cleared = clearColumns(generated, [HOB_BESIDE_THE_LEFTOVER_KEY]);

    const [space, ...others] = memberlessSpans(cleared, "A");
    expect(space).toEqual({ startMm: 1500, endMm: 2200 });
    expect(others).toEqual([]);
    expect(hasBodyEndingAt(cleared, "A", 1500)).toBe(true);
    expect(hasBodyStartingAt(cleared, "A", 2200)).toBe(true);
    expect(levelOpeningsOnWall(cleared, "A")).toEqual(
      LEVEL_FLOORS_MM.map((floorMm) => ({ floorMm, ...space })),
    );
    expect(cleared.design.placements).toEqual(
      standingAfterClear(generated, [HOB_BESIDE_THE_LEFTOVER_KEY]),
    );
  });

  // The owner's case: see 8U plan criterion 6.
  it("clearing A|1.80 and A|2.40 at every level leaves one 1200 mm space at 1500-2700 and moves no neighbour", () => {
    const generated = generatedKitchen(OWNERS_L_ROOM);
    const clearedKeys = [DRAWERS_COLUMN_KEY, HOB_COLUMN_KEY];
    for (const key of clearedKeys) {
      expect(memberFloorsMm(generated, key)).toEqual(LEVEL_FLOORS_MM);
    }

    const cleared = clearColumns(generated, clearedKeys);

    const joinedSpace = { startMm: 1500, endMm: 2700 };
    const freeEnd = { startMm: 3600, endMm: 4100 };
    expect(memberlessSpans(cleared, "A")).toEqual([joinedSpace, freeEnd]);
    expect(levelOpeningsOnWall(cleared, "A")).toEqual(
      [joinedSpace, freeEnd].flatMap((span) =>
        LEVEL_FLOORS_MM.map((floorMm) => ({ floorMm, ...span })),
      ),
    );
    expect(storedEmptySpans(cleared.design, "A")).toEqual([
      joinedSpace,
      freeEnd,
    ]);
    expect(hasBodyEndingAt(cleared, "A", 1500)).toBe(true);
    expect(hasBodyStartingAt(cleared, "A", 2700)).toBe(true);
    expect(cleared.design.placements).toEqual(
      standingAfterClear(generated, clearedKeys),
    );
  });
});

function generatedKitchen(room: DesignRoom): Kitchen {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  if (!result.ok) {
    throw new Error(`${JSON.stringify(room)} did not compose`);
  }
  const { design } = result;
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  const records = derivePlacementRecords(design, catalog);
  const columns = deriveColumns(records, design, design.room);
  return {
    design,
    catalog,
    records,
    recordedColumns: deriveRecordedColumns(
      records,
      design,
      toMetres(design.room.widthMm),
    ),
    columns,
    voids: recomputeVoids(records, columns),
  };
}

/** Every body filed under `keys`, removed one at a time and reconciled as the store does. */
function clearColumns(kitchen: Kitchen, keys: readonly string[]): Kitchen {
  return membersOf(kitchen, keys).reduce(removeOne, kitchen);
}

function removeOne(kitchen: Kitchen, placementId: string): Kitchen {
  const result = removePlacement({
    design: kitchen.design,
    catalog: kitchen.catalog,
    target: { kind: "placement", id: placementId },
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) {
    throw new Error(`removing ${placementId} refused: ${result.reason.code}`);
  }
  const reconciled = reconcileSuccessfulCommandResult({
    result,
    catalog: kitchen.catalog,
    previousRecordedColumns: kitchen.recordedColumns,
  });
  return { ...reconciled, catalog: kitchen.catalog };
}

function membersOf(kitchen: Kitchen, keys: readonly string[]): string[] {
  return kitchen.records
    .filter((record) => keys.includes(record.col))
    .map((record) => record.id);
}

function memberFloorsMm(kitchen: Kitchen, key: string): number[] {
  return kitchen.records
    .filter((record) => record.col === key)
    .map((record) => millimetresOf(record.frame.y0))
    .sort((a, b) => a - b);
}

function standingAfterClear(
  kitchen: Kitchen,
  keys: readonly string[],
): DesignPlacement[] {
  const cleared = new Set(membersOf(kitchen, keys));
  return kitchen.design.placements.filter(({ id }) => !cleared.has(id));
}

/** The published member-less columns on `wall`, as along-wall spans in order. */
function memberlessSpans(kitchen: Kitchen, wall: DesignWall): SpanMm[] {
  return memberlessColumns(kitchen, wall)
    .map((column) => spanAround(alongOf(wall, column), millimetresOf(column.w)))
    .sort(byStart);
}

/** Every opening a member-less column on `wall` publishes, so a seam inside a space shows as two openings. */
function levelOpeningsOnWall(
  kitchen: Kitchen,
  wall: DesignWall,
): LevelOpeningMm[] {
  const memberlessKeys = new Set(
    memberlessColumns(kitchen, wall).map(({ key }) => key),
  );
  return kitchen.voids
    .filter((opening) => memberlessKeys.has(opening.col))
    .map((opening) => ({
      floorMm: millimetresOf(opening.y0),
      ...spanAround(alongOf(wall, opening), millimetresOf(opening.w)),
    }))
    .sort((a, b) => byStart(a, b) || a.floorMm - b.floorMm);
}

function memberlessColumns(kitchen: Kitchen, wall: DesignWall): Column[] {
  const occupied = new Set(kitchen.records.map((record) => record.col));
  return [...kitchen.columns.values()].filter(
    (column) => column.wall === wall && !occupied.has(column.key),
  );
}

function storedEmptySpans(design: Design, wall: DesignWall): SpanMm[] {
  return (design.emptyColumns ?? [])
    .filter((space) => space.wall === wall)
    .map((space) => spanAround(space.alongMm, space.widthMm))
    .sort(byStart);
}

function hasBodyEndingAt(
  kitchen: Kitchen,
  wall: DesignWall,
  edgeMm: number,
): boolean {
  return bodySpans(kitchen, wall).some(({ endMm }) => endMm === edgeMm);
}

function hasBodyStartingAt(
  kitchen: Kitchen,
  wall: DesignWall,
  edgeMm: number,
): boolean {
  return bodySpans(kitchen, wall).some(({ startMm }) => startMm === edgeMm);
}

function bodySpans(kitchen: Kitchen, wall: DesignWall): SpanMm[] {
  return kitchen.design.placements
    .filter((placement) => placement.wall === wall)
    .map((placement) => spanAround(placement.alongMm, placement.body.widthMm));
}

function alongOf(
  wall: DesignWall,
  located: { readonly x: number; readonly z: number },
): number {
  return millimetresOf(wall === "A" ? located.x : located.z);
}

function spanAround(centreMm: number, widthMm: number): SpanMm {
  return { startMm: centreMm - widthMm / 2, endMm: centreMm + widthMm / 2 };
}

function byStart(a: SpanMm, b: SpanMm): number {
  return a.startMm - b.startMm;
}

function millimetresOf(valueM: number): number {
  const valueMm = toExactMillimetres(valueM);
  if (valueMm === undefined) {
    throw new Error(`${String(valueM)} m is not on whole millimetres`);
  }
  return valueMm;
}
