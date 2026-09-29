// M7B U3b S1 item 5, the U2 close-out's owed test: **a composed wall-C run ends 100 mm short of the
// wall, exactly as wall B's does in the room with B and C swapped.** A deeper corner slides a side
// wall's whole run along it, so each side wall's floor run stops short of the wall by the slide to the
// deepest declared depth (ADR 0108 H3's 100 mm reserve, F7). Wall C gets it through the same
// `slideReserveMm` reuse wall B does; until now only shell-level tests read it, and none through a
// generated kitchen.
//
// The 100 here is the reserve as the ADR states it, written down rather than read from the shell, so a
// reserve dropped for C (or changed for both) disagrees with this file.
import { describe, expect, it } from "vitest";

import {
  derivePlacementRecords,
  deriveColumns,
  toMillimetres,
  type Design,
  type DesignRoom,
  type DesignWall,
} from "../../src/index.js";
import { composeU } from "../support/generated-u.js";
import { SHELL_CATALOG } from "../support/shell-design.js";
import { uRoom } from "../support/u-plan-fixtures.js";

const SLIDE_RESERVE_MM = 100;

/** How far along `wall` a column of the generated design reaches, floor tiles and bodies alike. */
function farthestReachMm(design: Design, wall: DesignWall): number {
  const columns = deriveColumns(
    derivePlacementRecords(design, SHELL_CATALOG),
    design,
    design.room,
  );
  const reachesMm = [...columns.values()]
    .filter((column) => column.wall === wall)
    .map((column) => {
      const centreM = wall === "A" ? column.x : column.z;
      return toMillimetres(centreM + column.w / 2);
    });
  return Math.max(...reachesMm);
}

function wallEndOfPlannedBodiesMm(room: DesignRoom, wall: DesignWall): number {
  const { log } = composeU(room);
  return Math.max(
    ...log.plan.bases
      .filter((base) => base.wall === wall)
      .map((base) => base.endMm),
  );
}

const ROOMS_WHOSE_WALL_C_FILLS_TO_ITS_END: readonly DesignRoom[] = [
  uRoom(4200, 3200, 2400),
  uRoom(4200, 2400, 2400),
];

describe("a composed wall-C run ends 100 mm short of wallCMm (U3b AC7)", () => {
  it.each(ROOMS_WHOSE_WALL_C_FILLS_TO_ITS_END)(
    "%j: wall C's last body ends at wallCMm - 100, and its floor run reaches no further",
    (room) => {
      const wallCMm = room.wallCMm ?? 0;
      const composed = composeU(room);

      expect(wallEndOfPlannedBodiesMm(room, "C")).toBe(
        wallCMm - SLIDE_RESERVE_MM,
      );
      expect(farthestReachMm(composed.design, "C")).toBe(
        wallCMm - SLIDE_RESERVE_MM,
      );
    },
  );

  it.each(ROOMS_WHOSE_WALL_C_FILLS_TO_ITS_END)(
    "%j: the room with B and C swapped ends wall B exactly as far short of its wall",
    (room) => {
      const swapped: DesignRoom = {
        ...room,
        depthMm: room.wallCMm ?? 0,
        wallCMm: room.depthMm,
      };
      const composed = composeU(room);
      const composedSwapped = composeU(swapped);

      const shortOfWallC =
        (room.wallCMm ?? 0) - farthestReachMm(composed.design, "C");
      const shortOfWallB =
        swapped.depthMm - farthestReachMm(composedSwapped.design, "B");

      expect(shortOfWallC).toBe(SLIDE_RESERVE_MM);
      expect(shortOfWallB).toBe(shortOfWallC);
    },
  );
});
