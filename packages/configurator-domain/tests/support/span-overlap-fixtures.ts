// Fixtures for the tests of `overlapsAlongWall` and of the editor paths that follow it (M7C wave C7, M7-FB-013):
// a run is told by its whole-millimetre start and end, a record and a column extent are built over it, and the
// oracle is plain interval arithmetic, never the predicate under test. Also the seat depths those tests expect.
import type { DesignWall } from "../../src/design.js";
import type { ColumnExtent, PlacementRecord } from "../../src/void-engine.js";

export interface Run {
  readonly startMm: number;
  readonly endMm: number;
}

export const WALLS: readonly DesignWall[] = ["A", "B", "C"];

export const FULL_HEIGHT_M = 1.85;
const COLUMN_TOP_M = 2.6;
const CLEARANCE_M = 0.58;
const OFF_AXIS_M = 0.3;
const MILLIMETRES_PER_METRE = 1000;

/** A wall carcass's seat where the head-clearance cap applies, and where a full-height member lifts it:
 *  the wall depth less the 39 mm a door and its handle take (330 and 400), and the cabinet-depth line
 *  less the same (600 and 700). An open shelf has no door, so beside a member it takes the whole wall
 *  depth. */
export const CAPPED_SEAT_AT_600_MM = 291;
export const CAPPED_SEAT_AT_700_MM = 361;
export const CAPPED_DOORLESS_SEAT_AT_600_MM = 330;
export const CAPPED_DOORLESS_SEAT_AT_700_MM = 400;
export const LIFTED_SEAT_AT_600_MM = 561;
export const LIFTED_SEAT_AT_700_MM = 661;

export const CAPPED_SEAT_MM: Readonly<Record<number, number>> = {
  600: CAPPED_SEAT_AT_600_MM,
  700: CAPPED_SEAT_AT_700_MM,
};
export const CAPPED_DOORLESS_SEAT_MM: Readonly<Record<number, number>> = {
  600: CAPPED_DOORLESS_SEAT_AT_600_MM,
  700: CAPPED_DOORLESS_SEAT_AT_700_MM,
};
export const LIFTED_SEAT_MM: Readonly<Record<number, number>> = {
  600: LIFTED_SEAT_AT_600_MM,
  700: LIFTED_SEAT_AT_700_MM,
};

export function metres(mm: number): number {
  return mm / MILLIMETRES_PER_METRE;
}

export function spansOverlapByMoreThanNothing(
  first: Run,
  second: Run,
): boolean {
  return (
    Math.min(first.endMm, second.endMm) -
      Math.max(first.startMm, second.startMm) >
    0
  );
}

/** The position fields every run carries: along-wall `x` on wall A, `z` on B and C, at the run's centre. */
function positionOf(wall: DesignWall, run: Run): { x: number; z: number } {
  const centreM = metres((run.startMm + run.endMm) / 2);
  return wall === "A"
    ? { x: centreM, z: OFF_AXIS_M }
    : { x: OFF_AXIS_M, z: centreM };
}

interface RecordOptions {
  readonly heightM?: number;
  readonly y0M?: number;
  readonly col?: string;
}

export function recordOver(
  wall: DesignWall,
  run: Run,
  { heightM = FULL_HEIGHT_M, y0M = 0, col = "elsewhere" }: RecordOptions = {},
): PlacementRecord {
  return {
    id: `body-${String(run.startMm)}`,
    buildId: "fridge-free",
    wall,
    col,
    band: heightM === FULL_HEIGHT_M ? "column" : "base",
    frame: {
      ...positionOf(wall, run),
      ry: 0,
      y0: y0M,
      w: metres(run.endMm - run.startMm),
      h: heightM,
      d: CLEARANCE_M,
    },
  } as unknown as PlacementRecord;
}

export function extentOver(
  wall: DesignWall,
  run: Run,
  key = "A|extent",
): ColumnExtent {
  return {
    key,
    wall,
    ry: 0,
    ...positionOf(wall, run),
    w: metres(run.endMm - run.startMm),
    d: CLEARANCE_M,
    top: COLUMN_TOP_M,
    regions: [[0, COLUMN_TOP_M]],
  } as unknown as ColumnExtent;
}
