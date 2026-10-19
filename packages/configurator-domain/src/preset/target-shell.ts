// The shell of the room a preset is adapted to, built by the builders generation uses (ADR 0110 decision 1), and
// the floor runs they tile. Adaptation reads the runs for where a wall's free end is (the run, not the wall, so the
// slide reserve of walls B and C holds, ADR 0109 Amendment D) and the shell for the corner pieces the room admits and
// for the tiles it records, so no second author of either exists (ADR 0102).

import type { Design, DesignRoom, DesignWall } from "../design.js";
import {
  buildLinearShellDesign,
  buildLShellDesign,
  buildUShellDesign,
  linearShellFloorRuns,
  lShellFloorRuns,
  uShellFloorRuns,
} from "../generation/shell-design.js";
import type { PlannedBoundariesMm } from "../void-engine.js";

export interface WallRunMm {
  readonly startMm: number;
  readonly endMm: number;
}

/** Each wall's floor run in the shell's own along-wall millimetres: the walls the shape has, and no other. */
export function floorRunsOf(
  room: DesignRoom,
): Partial<Readonly<Record<DesignWall, WallRunMm>>> {
  if (room.shape === "U") return uShellFloorRuns(room);
  if (room.shape === "L") return lShellFloorRuns(room);
  return { A: linearShellFloorRuns(room) };
}

/** The tiles to cut a wall's floor run into from its near end: widths in order, and the edges between them that
 *  composition's merge never joins across. */
export interface ShellTiling {
  readonly widthsMm: Partial<Readonly<Record<DesignWall, readonly number[]>>>;
  readonly plannedBoundariesMm: PlannedBoundariesMm;
}

/** The shell of `room`: its corner pieces under the ceiling and every free run recorded as empty space, cut as
 *  `tiling` says where it names a wall and at the ordinary 800 mm elsewhere. */
export function shellOf(input: {
  readonly room: DesignRoom;
  readonly occurredAt: string;
  readonly tiling?: ShellTiling;
}): Design {
  const { room, occurredAt, tiling } = input;
  const widthsOn = (wall: DesignWall): readonly number[] =>
    tiling?.widthsMm[wall] ?? [];
  const plannedBoundariesMm = tiling?.plannedBoundariesMm;
  const withBoundaries =
    plannedBoundariesMm === undefined ? {} : { plannedBoundariesMm };
  if (room.shape === "linear") {
    return buildLinearShellDesign({
      room,
      occurredAt,
      ...(tiling === undefined
        ? {}
        : {
            compositionPlan: {
              floorWidthsMm: widthsOn("A"),
              ...withBoundaries,
            },
          }),
    });
  }
  if (room.shape === "L") {
    return buildLShellDesign({
      room,
      occurredAt,
      ...(tiling === undefined
        ? {}
        : {
            compositionPlan: {
              floorWidthsMm: { A: widthsOn("A"), B: widthsOn("B") },
              ...withBoundaries,
            },
          }),
    });
  }
  return buildUShellDesign({
    room,
    occurredAt,
    ...(tiling === undefined
      ? {}
      : {
          compositionPlan: {
            floorWidthsMm: {
              A: widthsOn("A"),
              B: widthsOn("B"),
              C: widthsOn("C"),
            },
            ...withBoundaries,
          },
        }),
  });
}
