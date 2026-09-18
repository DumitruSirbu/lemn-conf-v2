import { describe, expect, it } from "vitest";

import {
  buildLShellDesign,
  cornerAssemblyWidthsMm,
  cornerFarEdgeMm,
  findOverflowingPlacementIds,
  generateKitchen,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  LShellInputError,
  lShellFloorRuns,
  type DesignRoom,
} from "../../src/index.js";
import { cornerAlongWallCentreMm } from "../../src/corner-assembly-size.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-18T10:00:00.000Z";

function room(widthMm: number, depthMm: number): DesignRoom {
  return { shape: "L", widthMm, depthMm, heightMm: 2600 };
}

const BOUNDARY_ROOMS = [room(880, 880), room(881, 881)] as const;

describe("wave 7D7 S3a — sized shell corners", () => {
  it.each(BOUNDARY_ROOMS)(
    "writes four exact widths and centres, keeps identity, and leaves the unused millimetre at the far end in %o",
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
        ["p25", "A", 0, "base-corner-x-900", 880, 440, 880],
        ["p26", "B", 0, "base-corner-return-320", 300, 730, 880],
        ["p9", "B", 1500, "wall-corner-return-570", 550, 605, 880],
        ["p21", "B", 2200, "wall-corner-return-570-top", 550, 605, 880],
      ]);
      for (const placement of shell.placements) {
        expect(
          KITCHEN_L_BODY_CATALOG.get(placement.body.buildId)?.fixedWidth,
          placement.id,
        ).toBe(true);
      }
      expect(findOverflowingPlacementIds(shell)).toStrictEqual([]);
      expect(lShellFloorRuns(inRoom)).toStrictEqual({
        A: { wall: "A", startMm: 880, endMm: 880 },
        B: { wall: "B", startMm: 880, endMm: 880 },
      });
      // Wall A's upper row covers the corner; wall B has no upper-only run.
      expect(
        (shell.emptyColumns ?? [])
          .filter((tile) => tile.y0Mm > 0)
          .map((tile) => tile.wall),
      ).toStrictEqual(["A", "A"]);
      expect(
        (shell.emptyColumns ?? []).filter((tile) => tile.y0Mm === 0),
      ).toStrictEqual([]);
    },
  );

  it("keeps the reference shell's four structural records byte-identical", () => {
    const shell = buildLShellDesign({
      room: KITCHEN_L_DESIGN.room,
      occurredAt: OCCURRED_AT,
    });
    const referenceCorners = KITCHEN_L_DESIGN.placements.filter((placement) =>
      ["p25", "p26", "p9", "p21"].includes(placement.id),
    );
    expect(shell.placements).toStrictEqual(referenceCorners);
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

  it.each(BOUNDARY_ROOMS)(
    "returns a typed minimum failure, rather than throwing, for %o",
    (inRoom) => {
      const result = generateKitchen({
        room: inRoom,
        occurredAt: OCCURRED_AT,
        probeAt: createFakeProbeFactory(),
      });
      expect(result.ok).toBe(false);
      if (result.ok)
        throw new Error("the boundary room unexpectedly generated");
      expect(result.reason.code).toBe("MINIMUM_NOT_MET");
    },
  );

  it("still refuses an outside-engine wall at the shell boundary by its typed input error", () => {
    try {
      buildLShellDesign({ room: room(879, 880), occurredAt: OCCURRED_AT });
      throw new Error("the outside-engine room unexpectedly built");
    } catch (error) {
      expect(error).toBeInstanceOf(LShellInputError);
      expect((error as LShellInputError).refusal).toBe(
        "ROOM_OUTSIDE_ENGINE_LIMITS",
      );
    }
  });
});

describe("wave 7D7 S3a — largest even widths across rooms and depths", () => {
  const wallLengthsMm = [
    880, 881, 882, 899, 900, 970, 1000, 1300, 6300,
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
        const baseReturnMm = Math.floor(Math.min(320, wallBMm - 580) / 2) * 2;
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
          ["p26", baseReturnMm, 580 + baseReturnMm / 2],
          ["p9", upperReturnMm, 330 + upperReturnMm / 2],
          ["p21", upperReturnMm, 330 + upperReturnMm / 2],
        ]);
        expect(findOverflowingPlacementIds(shell), where).toStrictEqual([]);
        const runs = lShellFloorRuns(inRoom);
        expect(runs.A, where).toStrictEqual({
          wall: "A",
          startMm: xMm,
          endMm: xMm + Math.floor((wallAMm - xMm) / 2) * 2,
        });
        const wallBStartMm = Math.max(580 + baseReturnMm, 330 + upperReturnMm);
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
            // These are independent reference measurements: 900/320/570 mm at the 600 mm
            // fixture, and the catalogue's base/upper near planes at each declared depth.
            const nearMm =
              piece.wall === "A"
                ? 0
                : piece.band === "base"
                  ? cabinetDepthMm - 20
                  : cabinetDepthMm === 600
                    ? 330
                    : 400;
            const referenceWidthMm =
              piece.wall === "A" ? 900 : piece.band === "base" ? 320 : 570;
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
