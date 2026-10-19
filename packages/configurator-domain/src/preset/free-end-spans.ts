// Where a wall's free end is in a preset: the stretch of its floor run past the last column that holds a body. The
// owner's "free end" (ADR 0109 Amendment A3.1) is the end away from the corner, and Amendment E3 gives a U's back
// wall its right end by the same reading. A recorded empty column in that stretch is a bare end the preset left, and
// it is no more precious than the wall the room does not have: adaptation refills it (E1).

import { alongWallCoordinate } from "../module-grid.js";
import type { DesignWall } from "../design.js";

import {
  isInTheRightCornerZone,
  type RightCornerZone,
} from "./preset-room-fit.js";
import type { WallRunMm } from "./target-shell.js";
import type { PresetWorld } from "./preset-world.js";

const MILLIMETRES_PER_METRE = 1000;

/** One column that holds at least one body, in the along-wall millimetres of its wall. */
interface OccupiedSpan {
  readonly wall: DesignWall;
  readonly startMm: number;
  readonly endMm: number;
  readonly memberIds: readonly string[];
}

/** The stretch of a floor run past its last occupied column. */
export interface FreeEnd {
  readonly wall: DesignWall;
  /** The run's own near end, so the occupied stretch before the free end can be told from the corner. */
  readonly runStartMm: number;
  readonly startMm: number;
  readonly endMm: number;
}

/** Every occupied column of `wall` outside the right corner's zone, from the recorded face, which no wall clips. */
export function occupiedSpansOn(
  world: PresetWorld,
  input: {
    readonly wall: DesignWall;
    readonly zone: RightCornerZone | undefined;
  },
): readonly OccupiedSpan[] {
  const { wall, zone } = input;
  const memberIdsByKey = new Map<string, string[]>();
  for (const record of world.records) {
    if (record.wall !== wall) continue;
    memberIdsByKey.set(record.col, [
      ...(memberIdsByKey.get(record.col) ?? []),
      record.id,
    ]);
  }
  return [...world.recordedColumns.values()]
    .filter((column) => column.wall === wall && memberIdsByKey.has(column.key))
    .map((column) => {
      const centreMm =
        alongWallCoordinate(wall, column) * MILLIMETRES_PER_METRE;
      const halfWidthMm = (column.w * MILLIMETRES_PER_METRE) / 2;
      return {
        wall,
        startMm: Math.round(centreMm - halfWidthMm),
        endMm: Math.round(centreMm + halfWidthMm),
        memberIds: memberIdsByKey.get(column.key) ?? [],
      };
    })
    .filter((span) => !isInTheRightCornerZone(span, zone));
}

/** The free end of `wall`: from the far edge of its last occupied column, never nearer the corner than its run. */
function freeEndOf(
  world: PresetWorld,
  input: {
    readonly wall: DesignWall;
    readonly run: WallRunMm;
    readonly zone: RightCornerZone | undefined;
  },
): FreeEnd {
  const farEdgesMm = occupiedSpansOn(world, input).map((span) => span.endMm);
  return {
    wall: input.wall,
    runStartMm: input.run.startMm,
    startMm: Math.max(input.run.startMm, ...farEdgesMm),
    endMm: input.run.endMm,
  };
}

/** The free end of each of `walls` that has a floor run. */
export function freeEndsOf(
  world: PresetWorld,
  input: {
    readonly walls: readonly DesignWall[];
    readonly runs: Partial<Readonly<Record<DesignWall, WallRunMm>>>;
    readonly zone: RightCornerZone | undefined;
  },
): readonly FreeEnd[] {
  return input.walls.flatMap((wall) => {
    const run = input.runs[wall];
    return run === undefined
      ? []
      : [freeEndOf(world, { wall, run, zone: input.zone })];
  });
}
