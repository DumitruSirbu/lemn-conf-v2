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
// **2. The engine's window (880 mm when recorded, 870 since ADR 0135), which slice S2 recorded for review.** `ENGINE_ROOM_LIMITS` now
// admits walls from 880 mm because the *narrowest* corner reaches 880, while `buildLShellDesign`
// originally placed the **reference-sized** corner from the fixture. Wave 7D7 S3a now writes the
// room-sized width and centre and the expected-failure marker below is a passing assertion.
//
// **3. Two values nothing in the suite can see, added on the wave's review.** A band filter whose
// `>=` no reach can distinguish from `>` — the wall and top rows share a catalogue row and a near
// edge, so their far edges are equal in every room at every depth — and a corner centre that lands
// on a half millimetre when an invalid odd width is supplied to the centre reader.
// Both are asserted where the value is, because neither can be observed through anything built from
// it.
import { fc } from "@fast-check/vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
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
import { cornerAlongWallCentreMm } from "../src/corner-assembly-size.js";
import { BANDS_ABOVE_THE_WALL_ROW_FLOOR } from "../src/generation/shell-design.js";
import { LEVELS } from "../src/module-grid.js";
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
/** The base run's carcass front, inside the cabinet-depth line (ADR 0135): 30 mm. It was the run's
 *  seat, 20 mm, until the joint moved. Arithmetic, not a catalogue read, so this side stays independent. */
const RUN_CARCASS_FRONT_INSET_MM = 30;

function nearEdgeMm(
  piece: CornerAssemblyPiece,
  cabinetDepthMm: number,
): number {
  if (piece.wall === "A") return 0;
  return piece.band === "base"
    ? cabinetDepthMm - RUN_CARCASS_FRONT_INSET_MM
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
  const blindSpanMm =
    piece.wall === "A" ? cabinetDepthMm - RUN_CARCASS_FRONT_INSET_MM : 0;
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

describe("the shell places a sized corner throughout the engine's window (7D7 S3a)", () => {
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

  // 7D6's verified self-clearing `it.fails` is flipped, not deleted, in wave 7D7 S3a.
  it("places its whole corner inside both walls of every room the engine admits (7D7)", () => {
    for (const room of ENGINE_ONLY_ROOMS) {
      expect(
        findOverflowingPlacementIds(
          buildLShellDesign({ room, occurredAt: OCCURRED_AT }),
        ),
        JSON.stringify(room),
      ).toStrictEqual([]);
    }
  });

  // The approved wall bounds remain the deliberate ADR 0125 margin above the 880 mm engine floor.
  it("floors both approved walls at or above the reference corner", () => {
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
// The engine window remains outside the customer-approved entry policy
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

// =================================================================================================
// The band filter's `>=`, which no origin the shell computes can tell from `>`
// =================================================================================================

describe("the rows a wall-only run has to start past (7D6 QA's band-filter mutant)", () => {
  /** The grid's own row floors, in the order `CORNER_BANDS` lists the bands. */
  const rowFloorsM = LEVELS.map(([floorM]) => floorM);
  const baseRowFloorM = Number(rowFloorsM[0]);
  const wallRowFloorM = Number(rowFloorsM[1]);
  const topRowFloorM = Number(rowFloorsM[2]);

  it("is exactly the wall and top rows", () => {
    expect(BANDS_ABOVE_THE_WALL_ROW_FLOOR).toStrictEqual(["wall", "top"]);
  });

  // Why the membership is asserted directly instead of through a run origin: the bound the filter
  // compares against is the wall row's own floor, so the wall row is the only band that can ride the
  // equality — the base row is excluded strictly and the top row admitted strictly, and neither of
  // those two can witness the operator.
  it("stands the base row strictly below that bound and the top row strictly above it", () => {
    expect(baseRowFloorM).toBeLessThan(wallRowFloorM);
    expect(topRowFloorM).toBeGreaterThan(wallRowFloorM);
  });

  // And why dropping it changes nothing measurable: the wall and top pieces read the same catalogue
  // row for their one-door floor and take the same near-edge branch, so their far edges are equal in
  // every room at every declared depth — `Math.max` over the two cannot see one of them leave. The
  // day wave 7D7 sizes the two rows differently this goes red, and the mutant becomes observable
  // through an origin for the first time.
  it("leaves the wall and top pieces sharing one far edge, in every room and at every depth", () => {
    const rooms = [
      { shape: "L" as const, widthMm: 900, depthMm: 1000, heightMm: 2200 },
      { shape: "L" as const, widthMm: 3560, depthMm: 2920, heightMm: 2600 },
      { shape: "L" as const, widthMm: 6000, depthMm: 6000, heightMm: 2600 },
    ];

    for (const room of rooms) {
      for (const cabinetDepthMm of declaredCabinetDepthsMm()) {
        const widths = cornerAssemblyWidthsMm({ cabinetDepthMm, room });
        const farEdgeOf = (band: "wall" | "top") =>
          cornerFarEdgeMm({ widths, cabinetDepthMm, wall: "B", band })
            .farEdgeMm;

        expect(
          farEdgeOf("wall"),
          `${JSON.stringify(room)} at ${String(cabinetDepthMm)} mm`,
        ).toBe(farEdgeOf("top"));
      }
    }
  });
});

// =================================================================================================
// A corner centre is a whole millimetre or a refusal (the wave's review, N1)
// =================================================================================================

describe("a corner centre stays on the whole-millimetre grid", () => {
  /** The odd engine-admitted wall gives up its final millimetre at the far end. */
  const ODD_WALL_ROOM: DesignRoom = {
    shape: "L",
    widthMm: 881,
    depthMm: 881,
    heightMm: 2200,
  };

  it("derives the largest even width in an odd-wall room", () => {
    expect(ODD_WALL_ROOM.widthMm).toBeGreaterThanOrEqual(ENGINE_L.wallA.minMm);
    expect(
      widthOf(
        { wall: "A", band: "base" },
        ODD_WALL_ROOM,
        SHIPPED_CABINET_DEPTH_MM,
      ),
    ).toBe(880);
  });

  it("still refuses an injected odd width, naming the piece and the room", () => {
    const widths = cornerAssemblyWidthsMm({
      cabinetDepthMm: SHIPPED_CABINET_DEPTH_MM,
      room: ODD_WALL_ROOM,
    });
    const withOddWidth = {
      ...widths,
      pieces: widths.pieces.map((piece) =>
        piece.wall === "A" && piece.band === "base"
          ? { ...piece, widthMm: 881 }
          : piece,
      ),
    };

    expect(() =>
      cornerAlongWallCentreMm({
        widths: withOddWidth,
        cabinetDepthMm: SHIPPED_CABINET_DEPTH_MM,
        wall: "A",
        band: "base",
      }),
    ).toThrow(
      /wall A base corner is 881 mm wide in the 881 × 881 mm room, so its centre falls on 440\.5 mm/,
    );
  });

  it("answers a whole millimetre for every piece of every approved room, at both depths", () => {
    fc.assert(
      fc.property(
        roomFrom(APPROVED_L, fc.constant(2600)),
        fc.constantFrom(...declaredCabinetDepthsMm()),
        (room, cabinetDepthMm) => {
          const widths = cornerAssemblyWidthsMm({ cabinetDepthMm, room });
          for (const piece of CORNER_ASSEMBLY_PIECES) {
            const { alongMm } = cornerAlongWallCentreMm({
              widths,
              cabinetDepthMm,
              wall: piece.wall,
              band: piece.band,
            });

            expect(
              Number.isInteger(alongMm),
              `${piece.wall}/${piece.band} of ${JSON.stringify(room)} at ${String(cabinetDepthMm)} mm sits on ${String(alongMm)}`,
            ).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
