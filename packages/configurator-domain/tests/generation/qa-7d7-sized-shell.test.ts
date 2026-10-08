import { describe, expect, it } from "vitest";

import {
  buildLShellDesign,
  cornerAssemblyWidthsMm,
  cornerFarEdgeMm,
  findOverflowingPlacementIds,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  type DesignRoom,
} from "../../src/index.js";
import { cornerAlongWallCentreMm } from "../../src/corner-assembly-size.js";
import { CORNER_WALL_UNIT_TEMPLATES } from "../../src/fixtures/kitchen-l-design.js";

const OCCURRED_AT = "2026-09-18T10:00:00.000Z";

function room(widthMm: number, depthMm: number): DesignRoom {
  return { shape: "L", widthMm, depthMm, heightMm: 2600 };
}

// 880 → 870 (ADR 0135): the engine's floor is the narrowest corner's reach, now 870 on both walls.
const BOUNDARY_ROOMS = [room(870, 870), room(871, 871)] as const;

describe("wave 7D7 S3a — sized shell corners", () => {
  it.each(BOUNDARY_ROOMS)(
    "writes six exact widths and centres, keeps identity, and leaves the unused millimetre at the far end in %o",
    (inRoom) => {
      const shell = buildLShellDesign({
        room: inRoom,
        occurredAt: OCCURRED_AT,
      });
      const corners = shell.placements.map((placement) => [
        placement.id,
        placement.wall,
        placement.y0Mm,
        placement.body.buildId,
        placement.body.widthMm,
        placement.alongMm,
        placement.alongMm + placement.body.widthMm / 2,
      ]);

      expect(corners).toStrictEqual([
        // Each row is the room's 870 less the near edge (570 for the base return, 330 for the upper
        // two), and the X-leg takes the whole wall: 880 / 300 / 550 / 550 before ADR 0135.
        ["p25", "A", 0, "base-corner-x-900", 870, 435, 870],
        ["p26", "B", 0, "base-corner-return-320", 300, 720, 870],
        ["p9", "B", 1500, "wall-corner-return-570", 540, 600, 870],
        ["p21", "B", 2200, "wall-corner-return-570-top", 540, 600, 870],
        // The corner wall unit (M7C wave C2) is the X-leg's width and span, one and two rows up.
        ["p27", "A", 1500, "wall-corner-x-900", 870, 435, 870],
        ["p28", "A", 2200, "wall-corner-x-900-top", 870, 435, 870],
      ]);
      for (const placement of shell.placements) {
        expect(
          KITCHEN_L_BODY_CATALOG.get(placement.body.buildId)?.fixedWidth,
          placement.id,
        ).toBe(true);
      }
      expect(findOverflowingPlacementIds(shell)).toStrictEqual([]);
      expect(lShellFloorRuns(inRoom)).toStrictEqual({
        A: { wall: "A", startMm: 870, endMm: 870 },
        B: { wall: "B", startMm: 870, endMm: 870 },
      });
      // Wall A's upper rows are covered by the corner wall unit (it was two wall-only tiles before M7C
      // wave C2); wall B has no upper-only run.
      expect(
        (shell.emptyColumns ?? [])
          .filter((tile) => tile.y0Mm > 0)
          .map((tile) => tile.wall),
      ).toStrictEqual([]);
      expect(
        (shell.emptyColumns ?? []).filter((tile) => tile.y0Mm === 0),
      ).toStrictEqual([]);
    },
  );

  it("keeps the reference shell's four seeded structural records byte-identical, and adds the unit's two", () => {
    const shell = buildLShellDesign({
      room: KITCHEN_L_DESIGN.room,
      occurredAt: OCCURRED_AT,
    });
    const referenceCorners = KITCHEN_L_DESIGN.placements.filter((placement) =>
      ["p25", "p26", "p9", "p21"].includes(placement.id),
    );
    // The corner wall unit (M7C wave C2) follows the seeded four, at the reference corner's own width.
    expect(shell.placements).toStrictEqual([
      ...referenceCorners,
      ...CORNER_WALL_UNIT_TEMPLATES,
    ]);
    expect(lShellFloorRuns(KITCHEN_L_DESIGN.room)).toStrictEqual({
      A: { wall: "A", startMm: 900, endMm: 3560 },
      B: { wall: "B", startMm: 900, endMm: 2820 },
    });
  });

  it("keeps an exhausted wall-B run at its start without inventing floor capacity", () => {
    const inRoom = room(900, 1000);
    expect(lShellFloorRuns(inRoom)).toStrictEqual({
      A: { wall: "A", startMm: 900, endMm: 900 },
      B: { wall: "B", startMm: 900, endMm: 900 },
    });
    expect(
      (
        buildLShellDesign({ room: inRoom, occurredAt: OCCURRED_AT })
          .emptyColumns ?? []
      ).filter((tile) => tile.wall === "B"),
    ).toStrictEqual([]);
  });
});

describe("wave 7D7 S3a — largest even widths across rooms and depths", () => {
  const wallLengthsMm = [
    870, 871, 880, 881, 882, 899, 900, 970, 1000, 1300, 6300,
  ] as const;
  const depthsMm = [600, 700] as const;

  it("stores exact 600 mm widths and centres with non-inverted runs over representative wall pairs", () => {
    for (const wallAMm of wallLengthsMm) {
      for (const wallBMm of wallLengthsMm) {
        const inRoom = room(wallAMm, wallBMm);
        const shell = buildLShellDesign({
          room: inRoom,
          occurredAt: OCCURRED_AT,
        });
        const xMm = Math.floor(Math.min(900, wallAMm) / 2) * 2;
        const baseReturnMm = Math.floor(Math.min(330, wallBMm - 570) / 2) * 2;
        const upperReturnMm = Math.floor(Math.min(570, wallBMm - 330) / 2) * 2;
        const where = `${String(wallAMm)} × ${String(wallBMm)}`;

        expect(
          shell.placements.map(({ id, alongMm, body }) => [
            id,
            body.widthMm,
            alongMm,
          ]),
          where,
        ).toStrictEqual([
          ["p25", xMm, xMm / 2],
          ["p26", baseReturnMm, 570 + baseReturnMm / 2],
          ["p9", upperReturnMm, 330 + upperReturnMm / 2],
          ["p21", upperReturnMm, 330 + upperReturnMm / 2],
          // The corner wall unit stands at the X-leg's own width and centre (M7C wave C2).
          ["p27", xMm, xMm / 2],
          ["p28", xMm, xMm / 2],
        ]);
        expect(findOverflowingPlacementIds(shell), where).toStrictEqual([]);
        const runs = lShellFloorRuns(inRoom);
        expect(runs.A, where).toStrictEqual({
          wall: "A",
          startMm: xMm,
          endMm: xMm + Math.floor((wallAMm - xMm) / 2) * 2,
        });
        const wallBStartMm = Math.max(570 + baseReturnMm, 330 + upperReturnMm);
        expect(runs.B, where).toStrictEqual({
          wall: "B",
          startMm: wallBStartMm,
          endMm: Math.max(
            wallBStartMm,
            wallBStartMm + Math.floor((wallBMm - 100 - wallBStartMm) / 2) * 2,
          ),
        });
        for (const wall of ["A", "B"] as const) {
          expect(runs[wall].startMm, where).toBeLessThanOrEqual(
            runs[wall].endMm,
          );
        }
      }
    }
  });

  it.each(depthsMm)(
    "chooses each piece's exact even ceiling at %i mm depth",
    (cabinetDepthMm) => {
      for (const wallAMm of wallLengthsMm) {
        for (const wallBMm of wallLengthsMm) {
          const inRoom = room(wallAMm, wallBMm);
          const widths = cornerAssemblyWidthsMm({
            cabinetDepthMm,
            room: inRoom,
          });
          for (const piece of widths.pieces) {
            // These are independent reference measurements: 900/330/570 mm at the 600 mm
            // fixture, and the catalogue's base/upper near planes at each declared depth.
            const nearMm =
              piece.wall === "A"
                ? 0
                : piece.band === "base"
                  ? cabinetDepthMm - 30
                  : cabinetDepthMm === 600
                    ? 330
                    : 400;
            const referenceWidthMm =
              piece.wall === "A" ? 900 : piece.band === "base" ? 330 : 570;
            const wallMm = piece.wall === "A" ? wallAMm : wallBMm;
            const expectedWidthMm =
              Math.floor(Math.min(referenceWidthMm, wallMm - nearMm) / 2) * 2;
            const farEdge = cornerFarEdgeMm({
              widths,
              cabinetDepthMm,
              wall: piece.wall,
              band: piece.band,
            });
            const centre = cornerAlongWallCentreMm({
              widths,
              cabinetDepthMm,
              wall: piece.wall,
              band: piece.band,
            });
            const where = `${String(wallAMm)} × ${String(wallBMm)}, depth ${String(cabinetDepthMm)}, ${piece.wall}/${piece.band}`;

            expect(piece.widthMm, where).toBe(expectedWidthMm);
            expect(piece.widthMm % 2, where).toBe(0);
            expect(centre.alongMm, where).toBe(nearMm + expectedWidthMm / 2);
            expect(farEdge.farEdgeMm, where).toBe(nearMm + expectedWidthMm);
            expect(farEdge.farEdgeMm, where).toBeLessThanOrEqual(wallMm);
            expect(wallMm - farEdge.farEdgeMm, where).toBeGreaterThanOrEqual(0);
          }
        }
      }
    },
  );
});
