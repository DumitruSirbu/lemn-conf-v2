// M7B U2 S2, AC2: `buildUShellDesign`'s rules as properties over the engine's own U range (still
// `interim-unapproved` — the owner's bounds land at U6), the same shape wave 7D1's L property suite
// already holds the L to. **The oracle recomputes each corner's reach from `corner-assembly-size.ts`'s
// own public entry points** — the module `shell-design.ts` itself reads for the identical number —
// rather than from the built shell's placements: a placement a low ceiling excludes still reserves
// its footprint (Adjudication 7D1-P, P5 (iii)), which reading the shell's own output would miss. This
// stays an independent check of `shell-design.ts`'s tiling because it never calls that module's own
// `cornerReachMm`/`wallRowStartMm`/`freeRunTiles`, only the corner-sizing module underneath them.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  cornerAssemblyWidthsMm,
  cornerFarEdgeMm,
  rightCornerAlongWallCentreMm,
  rightCornerAssemblyWidthsMm,
} from "../../src/corner-assembly-size.js";
import {
  buildUShellDesign,
  validateDesignForCatalog,
  wallLengthMm,
  type Design,
  type DesignRoom,
  type DesignWall,
} from "../../src/index.js";
import { ENGINE_ROOM_LIMITS } from "../../src/room/room-policy.js";
import { MAX_EMPTY_COLUMN_WIDTH_MM } from "../../src/module-grid.js";
import { engineUWallBounds } from "../support/room-input.js";
import {
  bandsUnder,
  emptyIntervalsIn,
  overlapMm,
  SHELL_CABINET_DEPTH_MM,
  SHELL_CATALOG,
  unionOf,
  wallBReserveMm,
  type BandMm,
  type IntervalMm,
} from "../support/shell-design.js";

const SHELL_OCCURRED_AT = "2026-09-29T12:00:00.000Z";

/** Criterion 1's floor on the whole property. */
const RUNS = 200;

const WALLS: readonly DesignWall[] = ["A", "B", "C"];

function shellIn(room: DesignRoom): Design {
  return buildUShellDesign({ room, occurredAt: SHELL_OCCURRED_AT });
}

function millimetresIn(bounds: {
  readonly minMm: number;
  readonly maxMm: number;
}) {
  return fc.integer({ min: bounds.minMm, max: bounds.maxMm });
}

function engineU() {
  const walls = engineUWallBounds();
  return { ...walls, height: ENGINE_ROOM_LIMITS.heightBounds };
}

function engineURoom() {
  const u = engineU();
  return fc.record({
    shape: fc.constant("U" as const),
    widthMm: millimetresIn(u.wallA),
    depthMm: millimetresIn(u.wallB),
    wallCMm: millimetresIn(u.wallC),
    heightMm: millimetresIn(u.height),
  });
}

/** Every field at its engine minimum or maximum, one room per boundary combination the along-wall
 *  arithmetic could plausibly diverge on — the corners' own narrowest and widest builds. */
function boundaryURooms(): readonly DesignRoom[] {
  const u = engineU();
  const arms = [u.wallA.minMm, u.wallA.maxMm];
  const depths = [u.wallB.minMm, u.wallB.maxMm];
  const wallCs = [u.wallC.minMm, u.wallC.maxMm];
  const heights = [u.height.minMm, u.height.maxMm];
  const rooms: DesignRoom[] = [];
  for (const widthMm of arms) {
    for (const depthMm of depths) {
      for (const wallCMm of wallCs) {
        for (const heightMm of heights) {
          rooms.push({ shape: "U", widthMm, depthMm, wallCMm, heightMm });
        }
      }
    }
  }
  return rooms;
}

/** The left corner's own far edge on `wall` in `band`, or 0 where the assembly stands on no piece
 *  there — a low ceiling excludes the *placement*, never this reach, exactly the corner-sizing
 *  module's own `Math.max(0, …)` over an empty piece set. */
function leftFarEdgeMm(
  room: DesignRoom,
  wall: DesignWall,
  band: BandMm,
): number {
  const widths = cornerAssemblyWidthsMm({
    cabinetDepthMm: SHELL_CABINET_DEPTH_MM,
    room,
  });
  const piece = widths.pieces.find(
    (candidate) => candidate.wall === wall && candidate.band === band.name,
  );
  if (piece === undefined) return 0;
  return cornerFarEdgeMm({
    widths,
    cabinetDepthMm: SHELL_CABINET_DEPTH_MM,
    wall,
    band: piece.band,
  }).farEdgeMm;
}

/** The right corner's own far edge on `wall` in `band`, or 0 where none stands there — wall C's own
 *  floor-run start bound, the mirror of `leftFarEdgeMm` on the U's second corner. */
function rightFarEdgeMm(
  room: DesignRoom,
  wall: DesignWall,
  band: BandMm,
): number {
  const widths = rightCornerAssemblyWidthsMm({
    cabinetDepthMm: SHELL_CABINET_DEPTH_MM,
    room,
  });
  const piece = widths.pieces.find(
    (candidate) => candidate.wall === wall && candidate.band === band.name,
  );
  if (piece === undefined) return 0;
  const centre = rightCornerAlongWallCentreMm({
    widths,
    cabinetDepthMm: SHELL_CABINET_DEPTH_MM,
    wall,
    band: piece.band,
  });
  return centre.alongMm + piece.widthMm / 2;
}

/** The right corner's own near edge on `wall` in `band`, or `wallLengthMm` where none stands there —
 *  wall A's own mirrored bound, the far end its floor run must stop short of. */
function rightNearEdgeMm(
  room: DesignRoom,
  wall: DesignWall,
  band: BandMm,
  wallLengthMmValue: number,
): number {
  const widths = rightCornerAssemblyWidthsMm({
    cabinetDepthMm: SHELL_CABINET_DEPTH_MM,
    room,
  });
  const piece = widths.pieces.find(
    (candidate) => candidate.wall === wall && candidate.band === band.name,
  );
  if (piece === undefined) return wallLengthMmValue;
  const centre = rightCornerAlongWallCentreMm({
    widths,
    cabinetDepthMm: SHELL_CABINET_DEPTH_MM,
    wall,
    band: piece.band,
  });
  return centre.alongMm - piece.widthMm / 2;
}

/** Where a wall's floor run must stop: wall A at its own end, wall B and wall C both short of the
 *  corner's slide to the deepest declared depth (F7's 100 mm reserve, `wallBReserveMm` unchanged —
 *  it reads the source's declared chain, never the wall it is asked about). */
function plannedEndMm(room: DesignRoom, wall: DesignWall): number {
  return wallLengthMm(wall, room) - (wall === "A" ? 0 : wallBReserveMm());
}

/** The last millimetre a run of whole-millimetre centres can reach from `startMm` (7D1-P P3). */
function reachableEndMm(startMm: number, endMm: number): number {
  return endMm - ((endMm - startMm) % 2);
}

function expectedRecordedRun(where: {
  readonly wall: DesignWall;
  readonly band: BandMm;
  readonly room: DesignRoom;
}): readonly IntervalMm[] {
  const wallLengthMmValue = wallLengthMm(where.wall, where.room);
  const floorStartMm =
    where.wall === "C"
      ? rightFarEdgeMm(where.room, where.wall, where.band)
      : leftFarEdgeMm(where.room, where.wall, where.band);
  const floorEndBoundMm =
    where.wall === "A"
      ? rightNearEdgeMm(where.room, where.wall, where.band, wallLengthMmValue)
      : plannedEndMm(where.room, where.wall);
  const floorEndMm = reachableEndMm(
    floorStartMm,
    Math.max(floorStartMm, floorEndBoundMm),
  );
  return floorEndMm > floorStartMm
    ? unionOf([{ startMm: floorStartMm, endMm: floorEndMm }])
    : [];
}

describe("buildUShellDesign over the engine U range (AC2)", () => {
  it("has no validation finding of either severity, over 200 samples and every corner boundary", () => {
    fc.assert(
      fc.property(engineURoom(), (room) => {
        expect(
          validateDesignForCatalog(shellIn(room), SHELL_CATALOG),
        ).toStrictEqual([]);
      }),
      { numRuns: RUNS },
    );
    for (const room of boundaryURooms()) {
      expect(
        validateDesignForCatalog(shellIn(room), SHELL_CATALOG),
        JSON.stringify(room),
      ).toStrictEqual([]);
    }
  });

  it("records no empty column wider than 800 mm", () => {
    fc.assert(
      fc.property(engineURoom(), (room) => {
        for (const entry of shellIn(room).emptyColumns ?? []) {
          expect(entry.widthMm).toBeLessThanOrEqual(MAX_EMPTY_COLUMN_WIDTH_MM);
        }
      }),
      { numRuns: RUNS },
    );
    for (const room of boundaryURooms()) {
      for (const entry of shellIn(room).emptyColumns ?? []) {
        expect(entry.widthMm, JSON.stringify(room)).toBeLessThanOrEqual(
          MAX_EMPTY_COLUMN_WIDTH_MM,
        );
      }
    }
  });

  it("covers each wall's run exactly, in every band, with no gap and no overlap, and nothing over either corner zone", () => {
    fc.assert(
      fc.property(engineURoom(), (room) => {
        const shell = shellIn(room);
        for (const wall of WALLS) {
          for (const band of bandsUnder(room.heightMm)) {
            const intervals = emptyIntervalsIn(shell, wall, band);

            expect(overlapMm(intervals), `${wall} ${band.name}`).toBe(0);
            expect(unionOf(intervals), `${wall} ${band.name}`).toStrictEqual(
              expectedRecordedRun({ wall, band, room }),
            );
          }
        }
      }),
      { numRuns: RUNS },
    );
    for (const room of boundaryURooms()) {
      const shell = shellIn(room);
      for (const wall of WALLS) {
        for (const band of bandsUnder(room.heightMm)) {
          const intervals = emptyIntervalsIn(shell, wall, band);
          const context = `${wall} ${band.name} ${JSON.stringify(room)}`;

          expect(overlapMm(intervals), context).toBe(0);
          expect(unionOf(intervals), context).toStrictEqual(
            expectedRecordedRun({ wall, band, room }),
          );
        }
      }
    }
  });
});
