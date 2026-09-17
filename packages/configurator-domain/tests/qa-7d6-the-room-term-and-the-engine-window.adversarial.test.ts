// Wave 7D6 adversarial pass — **the two things slices S2 and S3 assert that the suite cannot see**.
//
// **1. The room term is never exercised where the wave's own properties sweep.** J1′ is what
// re-scoped this wave: *"correct shape and size" is a function of the cabinet depth, the two wall
// directions **and the room**.* `cornerAssemblyWidthsMm` expresses it as a ceiling —
// `min(the reference width, what the wall can still hold)`. Measured here: that `min` picks the room
// term only when a wall is shorter than **900 mm** (and 1000 / 970 on wall B at 700 mm), and
// `APPROVED_ROOM_POLICY` admits no such wall. So every `approvedRoom()` property in
// `corner-assembly-size.test.ts` — criteria 2′, 3, 11 and 12's containment — runs entirely inside the
// region where the derivation **ignores its room argument**, and deleting the ceiling outright
// reddens two of that file's 60-odd cases. This file gives the room term a witness: the transition is
// swept at whole millimetres and located, rather than sampled where it cannot occur.
//
// **2. The engine's 880 mm window, which slice S2 recorded for review.** `ENGINE_ROOM_LIMITS` now
// admits walls from 880 mm because the *narrowest* corner reaches 880, while `buildLShellDesign`
// still places the **reference-sized** corner from the fixture. A room the engine admits and the
// owner's policy does not — 880 × 880 — therefore builds a shell with three placements past their
// wall ends. **No product path reaches it** (see *the window is out of every caller's reach* below),
// and **wave 7D7 is where the shell places a room-sized corner**, so the invariant is asserted as an
// `it.fails`: it runs, it names the correct behaviour, and it turns red the moment 7D7 makes it true
// (`docs/best-practices/engineering-conventions.md`, *A deferred test has two shapes*).
import { fc } from "@fast-check/vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  baseSeatDepthMm,
  buildLShellDesign,
  CORNER_ASSEMBLY_PIECES,
  cornerAssemblyWidthsMm,
  cornerFarEdgeMm,
  declaredCabinetDepthsMm,
  findOverflowingPlacementIds,
  KITCHEN_L_BODY_CATALOG,
  narrowestCornerReachMm,
  wallCarcassDepthMm,
  wallLengthMm,
  type CornerAssemblyPiece,
  type DesignRoom,
  type DesignWall,
  type LWallBounds,
  type MillimetreBounds,
} from "../src/index.js";
import { ENGINE_ROOM_LIMITS } from "../src/room/room-policy.js";

const OCCURRED_AT = "2026-09-17T09:00:00.000Z";

/** The reference kitchen's own corner reach, the one figure `corner-assembly-size.ts` holds and
 *  criterion 1 pins. Typed here so this file states the number it reasons from instead of reading it
 *  back off the module it is attacking. */
const REFERENCE_CORNER_REACH_MM = 900;

/** The shipped depth, and the deeper declared one no product path builds at. */
const SHIPPED_CABINET_DEPTH_MM = 600;
const DEEPER_CABINET_DEPTH_MM = 700;

function boundsOf(policy: {
  buildableShapes: { L?: LWallBounds };
}): LWallBounds {
  const bounds = policy.buildableShapes.L;
  if (!bounds) throw new Error("the policy builds no L");
  return bounds;
}

const ENGINE_L = boundsOf(ENGINE_ROOM_LIMITS);
const APPROVED_L = boundsOf(APPROVED_ROOM_POLICY);

function wallBoundsOf(bounds: LWallBounds, wall: DesignWall): MillimetreBounds {
  return wall === "A" ? bounds.wallA : bounds.wallB;
}

/** A whole-millimetre room drawn from a policy's own wall bounds, at a fixed ceiling where the
 *  measurement is about the walls alone. */
function roomFrom(
  bounds: LWallBounds,
  heightMm: fc.Arbitrary<number>,
): fc.Arbitrary<DesignRoom> {
  return fc.record({
    shape: fc.constant("L" as const),
    widthMm: fc.integer({ min: bounds.wallA.minMm, max: bounds.wallA.maxMm }),
    depthMm: fc.integer({ min: bounds.wallB.minMm, max: bounds.wallB.maxMm }),
    heightMm,
  });
}

/** A room with one wall set and the other held far past every threshold, so a measurement on `wall`
 *  is a measurement of that wall alone. */
function roomWith(wall: DesignWall, wallLengthMm: number): DesignRoom {
  return {
    shape: "L",
    widthMm: wall === "A" ? wallLengthMm : ENGINE_L.wallA.maxMm,
    depthMm: wall === "B" ? wallLengthMm : ENGINE_L.wallB.maxMm,
    heightMm: 2600,
  };
}

function widthOf(
  piece: CornerAssemblyPiece,
  room: DesignRoom,
  cabinetDepthMm: number,
): number {
  const sized = cornerAssemblyWidthsMm({ cabinetDepthMm, room }).pieces.find(
    (candidate) =>
      candidate.wall === piece.wall && candidate.band === piece.band,
  );
  if (!sized) throw new Error(`no ${piece.wall}/${piece.band} corner piece`);
  return sized.widthMm;
}

/** How far the whole assembly reaches along `wall` in `room` — what a floor run starts past. */
function assemblyReachMm(
  room: DesignRoom,
  cabinetDepthMm: number,
  wall: DesignWall,
): number {
  const widths = cornerAssemblyWidthsMm({ cabinetDepthMm, room });
  return Math.max(
    ...CORNER_ASSEMBLY_PIECES.filter((piece) => piece.wall === wall).map(
      (piece) =>
        cornerFarEdgeMm({
          widths,
          cabinetDepthMm,
          wall: piece.wall,
          band: piece.band,
        }).farEdgeMm,
    ),
  );
}

/** Where a piece starts along its own wall, restated from the catalogue's own depth formulas rather
 *  than read back off the derivation (`corner-assembly-size.test.ts` takes the same independent
 *  route): wall A owns the corner, and wall B starts past wall A's body in the same row. */
function nearEdgeMm(
  piece: CornerAssemblyPiece,
  cabinetDepthMm: number,
): number {
  if (piece.wall === "A") return 0;
  return piece.band === "base"
    ? baseSeatDepthMm(cabinetDepthMm)
    : wallCarcassDepthMm(cabinetDepthMm);
}

/** The width a piece is built at where no wall constrains it: the reference reach less whatever
 *  stands in front of it **at the reference kitchen's own depth**, which is what makes the widths
 *  depth-independent. */
function unconstrainedWidthMm(piece: CornerAssemblyPiece): number {
  return (
    REFERENCE_CORNER_REACH_MM - nearEdgeMm(piece, SHIPPED_CABINET_DEPTH_MM)
  );
}

/** The narrowest a piece is ever built: the blind span the other wall's body puts in front of it,
 *  plus a cabinet with one door — read off the catalogue row the owner's rule names, never typed. */
function oneDoorFloorMm(
  piece: CornerAssemblyPiece,
  cabinetDepthMm: number,
): number {
  const rowId = piece.band === "base" ? "base-cabinet" : "wall-cabinet";
  const oneDoorMm = KITCHEN_L_BODY_CATALOG.get(rowId)?.minWidthMm;
  if (oneDoorMm === undefined) {
    throw new Error(`${rowId} declares no width floor`);
  }
  const blindSpanMm = piece.wall === "A" ? baseSeatDepthMm(cabinetDepthMm) : 0;
  return blindSpanMm + oneDoorMm;
}

// =================================================================================================
// The room term — where it binds, and why no shipped sweep can see it
// =================================================================================================

describe("the room enters as a ceiling, and the approved range is entirely above it", () => {
  // The blind spot, stated as a measurement rather than as prose. Every `approvedRoom()` property in
  // `corner-assembly-size.test.ts` draws from this range, so each of them exercises a derivation that
  // is constant in its room argument — which is why dropping the `min(reference, wallCanHold)` term
  // outright reddens only criterion 12's two attainment cases.
  it("answers every approved room with the unconstrained widths, at both declared depths", () => {
    fc.assert(
      fc.property(
        roomFrom(
          APPROVED_L,
          fc.integer({
            min: APPROVED_ROOM_POLICY.heightBounds.minMm,
            max: APPROVED_ROOM_POLICY.heightBounds.maxMm,
          }),
        ),
        fc.constantFrom(...declaredCabinetDepthsMm()),
        (room, cabinetDepthMm) => {
          for (const piece of CORNER_ASSEMBLY_PIECES) {
            expect(
              widthOf(piece, room, cabinetDepthMm),
              `${piece.wall}/${piece.band} in ${JSON.stringify(room)} at ${String(cabinetDepthMm)} mm`,
            ).toBe(unconstrainedWidthMm(piece));
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  /** The shortest wall at which each piece reaches its unconstrained width — the transition the
   *  ceiling makes, one per (depth, piece). Below it the room takes width away; at and above it the
   *  room term is inert. Both figures on wall B at 700 mm are ADR 0089's two chains: the base row's
   *  1000 and the wall row's 970, the 30 mm residue the adjudication reserved for Q-K2. */
  const CEILING_RELEASES_AT_MM: readonly (readonly [
    number,
    DesignWall,
    "base" | "wall" | "top",
    number,
  ])[] = [
    [SHIPPED_CABINET_DEPTH_MM, "A", "base", 900],
    [SHIPPED_CABINET_DEPTH_MM, "B", "base", 900],
    [SHIPPED_CABINET_DEPTH_MM, "B", "wall", 900],
    [SHIPPED_CABINET_DEPTH_MM, "B", "top", 900],
    [DEEPER_CABINET_DEPTH_MM, "A", "base", 900],
    [DEEPER_CABINET_DEPTH_MM, "B", "base", 1000],
    [DEEPER_CABINET_DEPTH_MM, "B", "wall", 970],
    [DEEPER_CABINET_DEPTH_MM, "B", "top", 970],
  ];

  it.each(CEILING_RELEASES_AT_MM)(
    "at %i mm, %s/%s stops narrowing at exactly %i mm of wall, swept millimetre by millimetre",
    (cabinetDepthMm, wall, band, releasesAtMm) => {
      const piece: CornerAssemblyPiece = { wall, band };
      const sweptFromMm = wallBoundsOf(ENGINE_L, wall).minMm;
      const widthsMm = new Map<number, number>();
      for (let lengthMm = sweptFromMm; lengthMm <= 1100; lengthMm += 1) {
        widthsMm.set(
          lengthMm,
          widthOf(piece, roomWith(wall, lengthMm), cabinetDepthMm),
        );
      }

      expect(widthsMm.get(releasesAtMm)).toBe(unconstrainedWidthMm(piece));
      expect(widthsMm.get(releasesAtMm - 1)).toBeLessThan(
        unconstrainedWidthMm(piece),
      );
      for (const [lengthMm, widthMm] of widthsMm) {
        const where = `wall ${wall} at ${String(lengthMm)} mm`;
        expect(widthMm, where).toBeLessThanOrEqual(unconstrainedWidthMm(piece));
        expect(widthMm, where).toBeGreaterThanOrEqual(
          oneDoorFloorMm(piece, cabinetDepthMm),
        );
        if (lengthMm >= releasesAtMm) {
          expect(widthMm, where).toBe(unconstrainedWidthMm(piece));
        } else {
          expect(widthMm, where).toBeLessThan(unconstrainedWidthMm(piece));
        }
      }
    },
  );

  // The transition above is below every approved minimum, which is the whole point: a room the owner
  // admits can never narrow a corner piece, so the shipped sweeps could not have found it.
  it.each(CEILING_RELEASES_AT_MM)(
    "releases below the approved minimum for its wall (%i mm, %s/%s at %i mm)",
    (_cabinetDepthMm, wall, _band, releasesAtMm) => {
      expect(releasesAtMm).toBeLessThanOrEqual(
        wallBoundsOf(APPROVED_L, wall).minMm,
      );
    },
  );

  it("never widens a piece as a wall grows, over the whole engine-admitted range", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<DesignWall>("A", "B"),
        fc.constantFrom(...declaredCabinetDepthsMm()),
        fc.integer({ min: ENGINE_L.wallA.minMm, max: ENGINE_L.wallA.maxMm }),
        fc.integer({ min: ENGINE_L.wallA.minMm, max: ENGINE_L.wallA.maxMm }),
        (wall, cabinetDepthMm, oneMm, otherMm) => {
          const shorterMm = Math.min(oneMm, otherMm);
          const longerMm = Math.max(oneMm, otherMm);

          for (const piece of CORNER_ASSEMBLY_PIECES.filter(
            (candidate) => candidate.wall === wall,
          )) {
            const narrow = widthOf(
              piece,
              roomWith(wall, shorterMm),
              cabinetDepthMm,
            );
            const wide = widthOf(
              piece,
              roomWith(wall, longerMm),
              cabinetDepthMm,
            );

            expect(
              narrow,
              `${piece.wall}/${piece.band} at ${String(shorterMm)} vs ${String(longerMm)} mm`,
            ).toBeLessThanOrEqual(wide);
            expect(wide).toBeLessThanOrEqual(unconstrainedWidthMm(piece));
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  // Criterion 12's containment, over the room set the criterion names — **every admitted room** — and
  // that is the engine's, from 880 to 6300. `corner-assembly-size.test.ts` sweeps the *approved*
  // range, which stops at 900 / 1000 and 6000 and so never reaches the rooms the bound itself is set
  // by.
  it("contains the assembly inside both walls over the engine-admitted range, corners included", () => {
    // The four extremes, given as fixed examples so the sweep always reaches the rooms the bound is
    // set by rather than hoping a random draw lands on 880 or 6300.
    const extremes: [DesignRoom, number][] = [
      ENGINE_L.wallA.minMm,
      ENGINE_L.wallA.maxMm,
    ].flatMap((widthMm) =>
      [ENGINE_L.wallB.minMm, ENGINE_L.wallB.maxMm].flatMap((depthMm) =>
        declaredCabinetDepthsMm().map(
          (cabinetDepthMm): [DesignRoom, number] => [
            { shape: "L", widthMm, depthMm, heightMm: 2600 },
            cabinetDepthMm,
          ],
        ),
      ),
    );
    fc.assert(
      fc.property(
        roomFrom(ENGINE_L, fc.constant(2600)),
        fc.constantFrom(...declaredCabinetDepthsMm()),
        (room, cabinetDepthMm) => {
          for (const wall of ["A", "B"] as const) {
            expect(
              assemblyReachMm(room, cabinetDepthMm, wall),
              `wall ${wall} of ${JSON.stringify(room)} at ${String(cabinetDepthMm)} mm`,
            ).toBeLessThanOrEqual(wallLengthMm(wall, room));
          }
        },
      ),
      { numRuns: 300, examples: extremes },
    );
  });
});

// =================================================================================================
// The 880 mm window between the engine's limits and the shell's own corner
// =================================================================================================

describe("the engine admits a room the shell cannot yet furnish (7D6 S2's recorded interim)", () => {
  /** The rooms the engine admits and the owner's policy does not, at the corners of that window. */
  const ENGINE_ONLY_ROOMS: readonly DesignRoom[] = [
    { shape: "L", widthMm: 880, depthMm: 880, heightMm: 2200 },
    { shape: "L", widthMm: 899, depthMm: 999, heightMm: 2200 },
    { shape: "L", widthMm: 880, depthMm: 6300, heightMm: 2200 },
    { shape: "L", widthMm: 6300, depthMm: 880, heightMm: 2200 },
  ];

  it("admits every one of them, so the window is real and not a validation artefact", () => {
    for (const room of ENGINE_ONLY_ROOMS) {
      expect(() =>
        buildLShellDesign({ room, occurredAt: OCCURRED_AT }),
      ).not.toThrow();
      expect(
        Math.min(room.widthMm, room.depthMm),
        JSON.stringify(room),
      ).toBeLessThan(Math.max(APPROVED_L.wallA.minMm, APPROVED_L.wallB.minMm));
    }
  });

  // **Expected to fail until wave 7D7**, which is where the shell places a room-sized corner. It
  // asserts the correct behaviour, so it turns red the moment 7D7 makes it true and the debt clears
  // itself instead of depending on someone remembering this file.
  it.fails(
    "places its whole corner inside both walls of every room the engine admits (7D7)",
    () => {
      for (const room of ENGINE_ONLY_ROOMS) {
        expect(
          findOverflowingPlacementIds(
            buildLShellDesign({ room, occurredAt: OCCURRED_AT }),
          ),
          JSON.stringify(room),
        ).toStrictEqual([]);
      }
    },
  );

  // The safety half, and the one a customer stands behind: the owner's policy floors both walls at or
  // above the **reference** corner's reach, so no room it admits reaches the window. Asserted against
  // the reach rather than against 900 / 1000, so slice S5 moving a bound moves this with it.
  it("floors both approved walls at or above the reference corner the shell still places", () => {
    for (const wall of ["A", "B"] as const) {
      expect(
        wallBoundsOf(APPROVED_L, wall).minMm,
        `wall ${wall}`,
      ).toBeGreaterThanOrEqual(REFERENCE_CORNER_REACH_MM);
      expect(wallBoundsOf(ENGINE_L, wall).minMm, `wall ${wall}`).toBe(
        narrowestCornerReachMm(wall).wallMinimumMm,
      );
    }
  });

  it("builds a clean shell at every corner of the approved rectangle and one millimetre inside it", () => {
    const wallAMm = [
      APPROVED_L.wallA.minMm,
      APPROVED_L.wallA.minMm + 1,
      APPROVED_L.wallA.maxMm,
    ];
    const wallBMm = [
      APPROVED_L.wallB.minMm,
      APPROVED_L.wallB.minMm + 1,
      APPROVED_L.wallB.maxMm,
    ];
    for (const widthMm of wallAMm) {
      for (const depthMm of wallBMm) {
        const room: DesignRoom = {
          shape: "L",
          widthMm,
          depthMm,
          heightMm: APPROVED_ROOM_POLICY.heightBounds.minMm,
        };

        expect(
          findOverflowingPlacementIds(
            buildLShellDesign({ room, occurredAt: OCCURRED_AT }),
          ),
          JSON.stringify(room),
        ).toStrictEqual([]);
      }
    }
  });
});

// =================================================================================================
// The window is out of every caller's reach, and that is what keeps it an interim
// =================================================================================================

describe("ENGINE_ROOM_LIMITS stays off the package's public surface", () => {
  const INDEX_SOURCE = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src/index.ts",
  );

  it("publishes the owner's policy and not the engine's limits", async () => {
    const publicSurface = await import("../src/index.js");

    // The premise: this check can see a policy that *is* published, so a green result is a fact about
    // the engine's limits rather than about the import.
    expect(Object.keys(publicSurface)).toContain("APPROVED_ROOM_POLICY");
    expect(Object.keys(publicSurface)).not.toContain("ENGINE_ROOM_LIMITS");
  });

  // Comments stripped, because the entry point's own prose says the limits stay unexported and that
  // sentence is documentation — the point of the check is the code under it.
  it("names it in no export statement, so no wildcard re-export can reach it either", () => {
    const code = readFileSync(INDEX_SOURCE, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(code).toMatch(/export\s*\{[^}]*\bAPPROVED_ROOM_POLICY\b/);
    expect(code).not.toMatch(/\bENGINE_ROOM_LIMITS\b/);
    expect(code).not.toMatch(
      /export\s+\*\s+from\s+["']\.\/room\/room-policy\.js["']/,
    );
  });
});
