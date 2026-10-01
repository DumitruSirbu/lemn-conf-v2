import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  buildLShellDesign,
  cornerAssemblyWidthsMm,
  findOverflowingPlacementIds,
  generateKitchen,
  INSERTABLE_BODY_DEFINITIONS,
  KITCHEN_L_DESIGN,
  LShellInputError,
  lShellFloorRuns,
  type DesignRoom,
  type DesignWall,
} from "../../src/index.js";
import {
  cornerAlongWallCentreMm,
  cornerFarEdgeMm,
} from "../../src/corner-assembly-size.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const occurredAt = "2026-09-18T10:00:00.000Z";
const hingedFloorMm = (() => {
  const base = INSERTABLE_BODY_DEFINITIONS.find(
    ([id]) => id === "base-cabinet",
  )?.[1];
  const wall = INSERTABLE_BODY_DEFINITIONS.find(
    ([id]) => id === "wall-cabinet",
  )?.[1];
  if (!base?.minWidthMm || base.minWidthMm !== wall?.minWidthMm) {
    throw new Error("hinged base and wall rows must have the same floor");
  }
  return base.minWidthMm;
})();

const declaredDepthsMm = [600, 700] as const;
const boundaryWallsMm = [
  870, 871, 880, 881, 882, 899, 900, 1000, 1200, 2200, 6300,
] as const;

describe("7D7 S3a room-sized corner widths", () => {
  for (const cabinetDepthMm of declaredDepthsMm) {
    propertyTest.prop([
      fc.integer({ min: 870, max: 6300 }),
      fc.integer({ min: 870, max: 6300 }),
    ])(
      `chooses the largest even buildable width on both walls at ${String(cabinetDepthMm)} mm depth`,
      (wallAMm, wallBMm) => {
        const inRoom = room(wallAMm, wallBMm);
        const widths = cornerAssemblyWidthsMm({ cabinetDepthMm, room: inRoom });
        expect(widths.pieces).toHaveLength(6); // 4 → 6 (M7C wave C2)

        for (const piece of widths.pieces) {
          const wallMm = piece.wall === "A" ? wallAMm : wallBMm;
          const nearMm = nearEdgeMm(cabinetDepthMm, piece.wall, piece.band);
          const referenceMm =
            piece.wall === "A" ? 900 : piece.band === "base" ? 330 : 570;
          // Wall A's piece in each row is blind for what stands in front of it on wall B in that row: the
          // run's carcass front in the base row, the wall depth in the wall and top rows (M7C wave C2).
          const minimumMm =
            piece.wall === "A"
              ? nearEdgeMm(cabinetDepthMm, "B", piece.band) + hingedFloorMm
              : hingedFloorMm;
          const ceilingMm = Math.min(referenceMm, wallMm - nearMm);
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

          expect(piece.widthMm).toBeGreaterThanOrEqual(minimumMm);
          expect(piece.widthMm).toBeLessThanOrEqual(ceilingMm);
          expect(piece.widthMm % 2).toBe(0);
          expect(piece.widthMm + 2).toBeGreaterThan(ceilingMm);
          expect(centre.alongMm).toBe(nearMm + piece.widthMm / 2);
          expect(Number.isInteger(centre.alongMm)).toBe(true);
          expect(farEdge.farEdgeMm).toBe(nearMm + piece.widthMm);
          expect(farEdge.farEdgeMm).toBeLessThanOrEqual(wallMm);
        }
      },
    );
  }

  it.each([
    room(870, 870),
    room(871, 871),
    room(900, 1000),
    room(900, 2200),
    room(2100, 1000),
    KITCHEN_L_DESIGN.room,
    room(6300, 6300),
  ])(
    "writes six in-wall structural records and no inverted empty spans for %o",
    (inRoom) => {
      const shell = buildLShellDesign({ room: inRoom, occurredAt });
      expect(shell.placements.map(({ id }) => id)).toEqual([
        "p25",
        "p26",
        "p9",
        "p21",
        // The corner wall unit's two (M7C wave C2).
        "p27",
        "p28",
      ]);
      expect(findOverflowingPlacementIds(shell)).toEqual([]);

      const floorRuns = lShellFloorRuns(inRoom);
      for (const wall of ["A", "B"] as const) {
        const wallMm = wall === "A" ? inRoom.widthMm : inRoom.depthMm;
        expect(floorRuns[wall].startMm).toBeLessThanOrEqual(
          floorRuns[wall].endMm,
        );
        expect(floorRuns[wall].endMm).toBeLessThanOrEqual(wallMm);
      }
      for (const placement of shell.placements) {
        const wallMm = placement.wall === "A" ? inRoom.widthMm : inRoom.depthMm;
        expect(Number.isInteger(placement.alongMm)).toBe(true);
        expect(
          placement.alongMm + placement.body.widthMm / 2,
        ).toBeLessThanOrEqual(wallMm);
      }
      for (const tile of shell.emptyColumns ?? []) {
        const wallMm = tile.wall === "A" ? inRoom.widthMm : inRoom.depthMm;
        expect(tile.widthMm).toBeGreaterThan(0);
        expect(tile.widthMm % 2).toBe(0);
        expect(tile.alongMm - tile.widthMm / 2).toBeGreaterThanOrEqual(0);
        expect(tile.alongMm + tile.widthMm / 2).toBeLessThanOrEqual(wallMm);
        expect(tile.topMm).toBeGreaterThan(tile.y0Mm);
      }
    },
  );

  it("leaves only the last millimetre unused at the 871 mm wall ends", () => {
    const shell = buildLShellDesign({ room: room(871, 871), occurredAt });
    expect(
      shell.placements.map(({ alongMm, body }) => alongMm + body.widthMm / 2),
    ).toEqual([870, 870, 870, 870, 870, 870]); // the unit's two (M7C wave C2) end at 870 too
    expect(lShellFloorRuns(room(871, 871))).toEqual({
      A: { wall: "A", startMm: 870, endMm: 870 },
      B: { wall: "B", startMm: 870, endMm: 870 },
    });
    expect(
      (shell.emptyColumns ?? []).filter(({ wall }) => wall === "B"),
    ).toEqual([]);
  });

  it.each([room(870, 870), room(871, 871), room(900, 1000)])(
    "records zero floor capacity and no wall-B tiles when the reserve spends the run in %o",
    (inRoom) => {
      const runs = lShellFloorRuns(inRoom);
      const shell = buildLShellDesign({ room: inRoom, occurredAt });
      expect(runs.A.endMm).toBe(runs.A.startMm);
      expect(runs.B.endMm).toBe(runs.B.startMm);
      expect(
        (shell.emptyColumns ?? []).filter(({ y0Mm }) => y0Mm === 0),
      ).toEqual([]);
      expect(
        (shell.emptyColumns ?? []).filter(({ wall }) => wall === "B"),
      ).toEqual([]);
    },
  );

  propertyTest.prop([
    fc.integer({ min: 870, max: 6300 }),
    fc.integer({ min: 870, max: 6300 }),
  ])(
    "keeps the sized shell and recorded runs inside mixed wall lengths",
    (wallAMm, wallBMm) => {
      const inRoom = room(wallAMm, wallBMm);
      const shell = buildLShellDesign({ room: inRoom, occurredAt });
      expect(findOverflowingPlacementIds(shell)).toEqual([]);
      const runs = lShellFloorRuns(inRoom);
      for (const wall of ["A", "B"] as const) {
        const wallMm = wall === "A" ? wallAMm : wallBMm;
        expect(runs[wall].startMm).toBeLessThanOrEqual(runs[wall].endMm);
        expect(runs[wall].endMm).toBeLessThanOrEqual(wallMm);
      }
      for (const tile of shell.emptyColumns ?? []) {
        const wallMm = tile.wall === "A" ? wallAMm : wallBMm;
        expect(tile.alongMm - tile.widthMm / 2).toBeGreaterThanOrEqual(0);
        expect(tile.alongMm + tile.widthMm / 2).toBeLessThanOrEqual(wallMm);
        expect(tile.widthMm).toBeGreaterThan(0);
      }
    },
  );

  it.each(boundaryWallsMm.filter((wallMm) => wallMm <= 1200))(
    "returns MINIMUM_NOT_MET without throwing when both walls are %i mm",
    (wallMm) => {
      const result = generateKitchen({
        room: room(wallMm, wallMm),
        occurredAt,
        probeAt: createFakeProbeFactory(),
      });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("this room unexpectedly generated");
      expect(result.reason.code).toBe("MINIMUM_NOT_MET");
    },
  );

  propertyTest.prop([
    fc.integer({ min: 870, max: 2200 }),
    fc.integer({ min: 870, max: 2200 }),
  ])(
    "never throws an internal error for an engine-admitted small room",
    (wallAMm, wallBMm) => {
      expect(() =>
        generateKitchen({
          room: room(wallAMm, wallBMm),
          occurredAt,
          probeAt: createFakeProbeFactory(),
        }),
      ).not.toThrow();
    },
  );

  it.each([room(869, 870), room(870, 869)])(
    "refuses %o outside the engine at the shell boundary with a typed error",
    (inRoom) => {
      try {
        buildLShellDesign({ room: inRoom, occurredAt });
        throw new Error("outside-engine room unexpectedly built");
      } catch (error) {
        expect(error).toBeInstanceOf(LShellInputError);
        expect((error as LShellInputError).refusal).toBe(
          "ROOM_OUTSIDE_ENGINE_LIMITS",
        );
      }
    },
  );

  it.each([room(6301, 880), room(880, 6301)])(
    "refuses %o beyond the document schema before checking engine bounds",
    (inRoom) => {
      try {
        buildLShellDesign({ room: inRoom, occurredAt });
        throw new Error("out-of-schema room unexpectedly built");
      } catch (error) {
        expect(error).toBeInstanceOf(LShellInputError);
        expect((error as LShellInputError).refusal).toBe(
          "ROOM_NOT_A_DESIGN_ROOM",
        );
      }
    },
  );
});

function room(widthMm: number, depthMm: number): DesignRoom {
  return { shape: "L", widthMm, depthMm, heightMm: 2600 };
}

// M7B U1 slice S1's minimal type-level fix: `CornerAssemblyPiece.wall` (`DesignWall`) is widened to
// include `"C"` (ADR 0132) — this sweep only ever produces `"A"`/`"B"` pieces today, and the `else`
// branch below already answers wall B's rule for anything that is not wall A, which ADR 0132
// decision 2 keeps true for wall C's returns too.
function nearEdgeMm(
  cabinetDepthMm: number,
  wall: DesignWall,
  band: "base" | "wall" | "top",
) {
  if (wall === "A") return 0;
  // The run's carcass front (ADR 0135), which was the run's seat, `cabinetDepthMm - 20`.
  if (band === "base") return cabinetDepthMm - 30;
  return cabinetDepthMm === 600 ? 330 : 400;
}
