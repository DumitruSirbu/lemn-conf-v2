// Wave 7D6 slice S2's own gate: **the corner's size is derived, and its three readers agree** —
// the acceptance criteria of `docs/milestones/M7-room-and-presets.md`'s 7D6 punch list as its
// 2026-09-17 adjudication amends them (criteria 1, 2′, 3, 5–9 and 11–13). Criterion 4′ (the pinned
// wall-minimum margin) and criterion 10 (the literal sweep) are slice S3's and are deliberately
// absent.
//
// **Why one file for three modules.** S2's subject is one derivation and the three sites that read
// it — the room policy's bound, the shell's two run origins and the fixture's own placements — and
// the defect it exists to prevent is those sites disagreeing. Split across three files, the
// agreement is what nobody owns.
//
// **What each criterion must not be satisfied by** is recorded on the criterion, because several of
// them are one wrong assertion away from passing vacuously: criterion 1 compared against the
// derivation itself, criterion 3 built against a catalogue its design is not at, criterion 11
// looking at the floor run (which cannot see wall A's zero at all), and criterion 12's containment
// swept over rooms that stop short of the 6000 mm maxima.
import { fc } from "@fast-check/vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  baseSeatDepthMm,
  buildKitchenLBodyCatalog,
  buildLShellDesign,
  CORNER_ASSEMBLY_PIECES,
  cornerAssemblyWidthsMm,
  cornerFarEdgeMm,
  declaredCabinetDepthsMm,
  findOverflowingPlacementIds,
  generateKitchen,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  listInsertableBodies,
  lShellFloorRuns,
  narrowestCornerReachMm,
  validateDesignForCatalog,
  wallCarcassDepthMm,
  wallLengthMm,
  WIDTH_STEP_MM,
  type CornerAssemblyWidthsMm,
  type CornerBand,
  type Design,
  type DesignRoom,
  type DesignWall,
  type LWallBounds,
  type MillimetreBounds,
} from "../src/index.js";
import { TWO_DOOR_MIN_WIDTH_MM } from "../src/door-count.js";
import { ENGINE_ROOM_LIMITS } from "../src/room/room-policy.js";
import { createFakeProbeFactory } from "./support/fake-probe.js";
import {
  atCabinetDepth,
  shellIn,
  SHELL_CABINET_DEPTH_MM,
  WALLS,
} from "./support/shell-design.js";

const OCCURRED_AT = "2026-09-17T09:00:00.000Z";

/** The depth the product ships at, **typed on purpose**: criterion 1 pins a number, so a change to
 *  the shipped depth has to be read here as a failing figure rather than followed silently. */
const SHIPPED_CABINET_DEPTH_MM = 600;

/** The other declared depth. No product path builds at it — generation has no depth input — so
 *  every 700 mm claim below is a claim about the derivation or about `setCabinetDepth`'s output. */
const DEEPER_CABINET_DEPTH_MM = 700;

/** The reference kitchen's own room, 3560 × 2920 × 2600, and the corner criterion 1 pins. */
const REFERENCE_ROOM = KITCHEN_L_DESIGN.room;

/** This package's own `src/`, for the two structural checks below. */
const SOURCE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src",
);

function approvedL(): LWallBounds {
  const bounds = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (!bounds) throw new Error("the approved policy builds no L");
  return bounds;
}

/** The smallest and the largest room the **owner's** policy admits, read from the policy so slice
 *  S5 moving a bound moves these with it (criterion 7's *"reads the bound rather than typing it"*). */
function roomAtApprovedWalls(
  pick: (bounds: MillimetreBounds) => number,
): DesignRoom {
  return {
    shape: "L",
    widthMm: pick(approvedL().wallA),
    depthMm: pick(approvedL().wallB),
    heightMm: APPROVED_ROOM_POLICY.heightBounds.minMm,
  };
}

const SMALLEST_APPROVED_ROOM = roomAtApprovedWalls((bounds) => bounds.minMm);
const LARGEST_APPROVED_ROOM = roomAtApprovedWalls((bounds) => bounds.maxMm);

/** The four rooms wave 7D3's threshold table was measured in (criterion 8). */
const THRESHOLD_TABLE_ROOMS: readonly DesignRoom[] = [
  { shape: "L", widthMm: 3300, depthMm: 1700, heightMm: 2600 },
  { shape: "L", widthMm: 3900, depthMm: 1700, heightMm: 2600 },
  { shape: "L", widthMm: 4500, depthMm: 1700, heightMm: 2600 },
  { shape: "L", widthMm: 4000, depthMm: 3000, heightMm: 2600 },
];

/** Every room the anchored arms assert over: the reference room and both ends of the approved
 *  range, so the property's fixed cases include the two rooms the bounds are set by. */
const ANCHOR_ROOMS: readonly DesignRoom[] = [
  REFERENCE_ROOM,
  SMALLEST_APPROVED_ROOM,
  LARGEST_APPROVED_ROOM,
];

function millimetresIn(bounds: MillimetreBounds) {
  return fc.integer({ min: bounds.minMm, max: bounds.maxMm });
}

/** A whole-millimetre room from the owner-approved range — **both walls to 6000**, which is
 *  criterion 12's own must-not: a generator that stops short of a maximum cannot see a corner that
 *  fails to fit in a room nobody sampled. */
function approvedRoom(): fc.Arbitrary<DesignRoom> {
  return fc.record({
    shape: fc.constant("L" as const),
    widthMm: millimetresIn(approvedL().wallA),
    depthMm: millimetresIn(approvedL().wallB),
    heightMm: millimetresIn(APPROVED_ROOM_POLICY.heightBounds),
  });
}

function declaredDepthMm(): fc.Arbitrary<number> {
  return fc.constantFrom(...declaredCabinetDepthsMm());
}

function widthsIn(room: DesignRoom, cabinetDepthMm: number) {
  return cornerAssemblyWidthsMm({ cabinetDepthMm, room });
}

function farEdgeMm(
  widths: CornerAssemblyWidthsMm,
  piece: { readonly wall: DesignWall; readonly band: CornerBand },
): number {
  return cornerFarEdgeMm({
    widths,
    cabinetDepthMm: widths.cabinetDepthMm,
    wall: piece.wall,
    band: piece.band,
  }).farEdgeMm;
}

function widthMm(
  widths: CornerAssemblyWidthsMm,
  piece: { readonly wall: DesignWall; readonly band: CornerBand },
): number {
  const sized = widths.pieces.find(
    (candidate) =>
      candidate.wall === piece.wall && candidate.band === piece.band,
  );
  if (!sized) throw new Error(`no ${piece.wall}/${piece.band} corner piece`);
  return sized.widthMm;
}

/** How far the whole assembly reaches along `wall` in any row — what a floor run starts past. */
function assemblyReachMm(
  room: DesignRoom,
  cabinetDepthMm: number,
  wall: DesignWall,
): number {
  const widths = widthsIn(room, cabinetDepthMm);
  return Math.max(
    ...CORNER_ASSEMBLY_PIECES.filter((piece) => piece.wall === wall).map(
      (piece) => farEdgeMm(widths, piece),
    ),
  );
}

/** Wall B's two rows' **near** edges, restated here from the catalogue's own depth formulas rather
 *  than read back off the derivation: the base row starts at the X-leg's front plane (`d − 20`) and
 *  the upper rows at §7's head-clearance depth. This is the independent side of criterion 2′ — the
 *  derivation supplies the far edges, the catalogue supplies where each row begins. */
function nearEdgeOnWallBMm(band: CornerBand, cabinetDepthMm: number): number {
  return band === "base"
    ? baseSeatDepthMm(cabinetDepthMm)
    : wallCarcassDepthMm(cabinetDepthMm);
}

function findingCodesOf(design: Design, cabinetDepthMm: number): string[] {
  return validateDesignForCatalog(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMm),
  ).map((finding) => finding.code);
}

/** Every tile a shell records above the floor: the wall-only runs (criterion 11). */
function wallOnlyTilesOn(design: Design, wall: DesignWall) {
  return (design.emptyColumns ?? []).filter(
    (tile) => tile.wall === wall && tile.y0Mm > 0,
  );
}

// =================================================================================================
// Criterion 1 — the pre-flight, pinned as a literal
// =================================================================================================

describe("criterion 1 — the derived reach at 600 mm in the reference room", () => {
  it("agrees with the depth the shell is built at, so the literal below is the shipped one", () => {
    expect(SHELL_CABINET_DEPTH_MM).toBe(SHIPPED_CABINET_DEPTH_MM);
  });

  it.each([
    ["A", 900],
    ["B", 900],
  ] as const)(
    "is %s mm on wall %s, the reference kitchen's own corner",
    (wall, reachMm) => {
      expect(
        assemblyReachMm(REFERENCE_ROOM, SHIPPED_CABINET_DEPTH_MM, wall),
      ).toBe(reachMm);
    },
  );

  // The must-not: a test that compares the derivation only against itself. `APPROVED_ROOM_POLICY`
  // is the owner's own literal, this wave may not edit it, and nothing in the derivation feeds it —
  // so wall A's 900 has a second, independent source.
  it("is the number the owner approved wall A's minimum and corner reach from", () => {
    const approved = approvedL();

    expect(assemblyReachMm(REFERENCE_ROOM, SHIPPED_CABINET_DEPTH_MM, "A")).toBe(
      approved.minimumKitchen.cornerReachMm.wallA,
    );
    expect(assemblyReachMm(REFERENCE_ROOM, SHIPPED_CABINET_DEPTH_MM, "A")).toBe(
      approved.wallA.minMm,
    );
  });

  it("sizes all four pieces from it — 900 on wall A, 320 at wall B's base and 570 in each upper row", () => {
    const widths = widthsIn(REFERENCE_ROOM, SHIPPED_CABINET_DEPTH_MM);

    expect(widthMm(widths, { wall: "A", band: "base" })).toBe(900);
    expect(widthMm(widths, { wall: "B", band: "base" })).toBe(320);
    expect(widthMm(widths, { wall: "B", band: "wall" })).toBe(570);
    expect(widthMm(widths, { wall: "B", band: "top" })).toBe(570);
  });

  it("is what the reference kitchen's own corner placements stand at, because they read it", () => {
    const corners = KITCHEN_L_DESIGN.placements.filter(
      (placement) =>
        KITCHEN_L_BODY_CATALOG.get(placement.body.buildId)?.structuralReason ===
        "corner",
    );

    expect(corners.map(({ id }) => id).sort()).toStrictEqual([
      "p21",
      "p25",
      "p26",
      "p9",
    ]);
    for (const corner of corners) {
      expect(
        corner.alongMm + corner.body.widthMm / 2,
        `${corner.id} on wall ${corner.wall}`,
      ).toBe(900);
    }
  });
});

// =================================================================================================
// Criterion 2′ — wall B's two rows, as a property of the derivation and of no design
// =================================================================================================

describe("criterion 2′ — wall B's base and wall rows, in the derivation and not in a design", () => {
  /** Both rows, named, at one (depth, room): the assertion criterion 2′ words. */
  function expectTheRowsToAccountForTheirResidue(
    room: DesignRoom,
    cabinetDepthMm: number,
  ): void {
    const widths = widthsIn(room, cabinetDepthMm);
    const where = `${String(room.widthMm)}×${String(room.depthMm)} at ${String(cabinetDepthMm)} mm`;
    const baseRow = {
      nearMm: nearEdgeOnWallBMm("base", cabinetDepthMm),
      widthMm: widthMm(widths, { wall: "B", band: "base" }),
      farMm: farEdgeMm(widths, { wall: "B", band: "base" }),
    };
    const wallRow = {
      nearMm: nearEdgeOnWallBMm("wall", cabinetDepthMm),
      widthMm: widthMm(widths, { wall: "B", band: "wall" }),
      farMm: farEdgeMm(widths, { wall: "B", band: "wall" }),
    };

    expect(baseRow.farMm, `base row, ${where}`).toBe(
      baseRow.nearMm + baseRow.widthMm,
    );
    expect(wallRow.farMm, `wall row, ${where}`).toBe(
      wallRow.nearMm + wallRow.widthMm,
    );
    expect(
      wallRow.farMm,
      `the wall row passed the base row, ${where}`,
    ).toBeLessThanOrEqual(baseRow.farMm);
    expect(baseRow.farMm - wallRow.farMm, `the residue, ${where}`).toBe(
      baseRow.nearMm - wallRow.nearMm - (wallRow.widthMm - baseRow.widthMm),
    );
  }

  it("holds over the approved room range at both declared depths", () => {
    fc.assert(
      fc.property(approvedRoom(), declaredDepthMm(), (room, cabinetDepthMm) => {
        expectTheRowsToAccountForTheirResidue(room, cabinetDepthMm);
      }),
      { numRuns: 300 },
    );
  });

  it.each(
    ANCHOR_ROOMS.flatMap((room) =>
      declaredCabinetDepthsMm().map(
        (cabinetDepthMm) => [room, cabinetDepthMm] as const,
      ),
    ),
  )("holds at the anchor rooms (%o at %i mm)", (room, cabinetDepthMm) => {
    expectTheRowsToAccountForTheirResidue(room, cabinetDepthMm);
  });

  it("closes the residue in the reference room at 600 mm and leaves ADR 0089's 30 mm at 700", () => {
    const at600 = widthsIn(REFERENCE_ROOM, SHIPPED_CABINET_DEPTH_MM);
    const at700 = widthsIn(REFERENCE_ROOM, DEEPER_CABINET_DEPTH_MM);

    expect(
      farEdgeMm(at600, { wall: "B", band: "base" }) -
        farEdgeMm(at600, { wall: "B", band: "wall" }),
    ).toBe(0);
    // Not S2's to remove: it is the residue of a *slide* on frozen widths (ADR 0089, J3′.4), and the
    // only two ways to close it are refused below.
    expect(
      farEdgeMm(at700, { wall: "B", band: "base" }) -
        farEdgeMm(at700, { wall: "B", band: "wall" }),
    ).toBe(30);
    expect(farEdgeMm(at700, { wall: "B", band: "base" })).toBe(1000);
    expect(farEdgeMm(at700, { wall: "B", band: "wall" })).toBe(970);
  });

  it("keeps the two upper rows one piece, so neither row's width is tuned without the other", () => {
    fc.assert(
      fc.property(approvedRoom(), declaredDepthMm(), (room, cabinetDepthMm) => {
        const widths = widthsIn(room, cabinetDepthMm);

        expect(widthMm(widths, { wall: "B", band: "top" })).toBe(
          widthMm(widths, { wall: "B", band: "wall" }),
        );
      }),
      { numRuns: 100 },
    );
  });

  it("never closes the residue by crossing the one-door threshold or by narrowing the filler to 290", () => {
    fc.assert(
      fc.property(approvedRoom(), declaredDepthMm(), (room, cabinetDepthMm) => {
        const widths = widthsIn(room, cabinetDepthMm);
        const where = `${String(room.widthMm)}×${String(room.depthMm)} at ${String(cabinetDepthMm)} mm`;

        for (const band of ["wall", "top"] as const) {
          expect(
            widthMm(widths, { wall: "B", band }),
            `${band} return, ${where}`,
          ).toBeLessThanOrEqual(570);
        }
        expect(
          widthMm(widths, { wall: "B", band: "base" }),
          `base return, ${where}`,
        ).not.toBe(290);
        expect(
          widthMm(widths, { wall: "B", band: "base" }),
          `base return, ${where}`,
        ).toBeLessThan(TWO_DOOR_MIN_WIDTH_MM);
      }),
      { numRuns: 200 },
    );
  });

  // ADR 0120 Amendment A's room term is a **ceiling**. A derivation that read it as a target would
  // widen the upper returns to 600 at 700 mm — exactly the move D5 refuses — and nothing else in
  // this file would notice, because a wider corner still contains and still validates.
  it("never widens a piece past the reference corner's own width, in any room", () => {
    const reference = widthsIn(REFERENCE_ROOM, SHIPPED_CABINET_DEPTH_MM);
    fc.assert(
      fc.property(approvedRoom(), declaredDepthMm(), (room, cabinetDepthMm) => {
        const widths = widthsIn(room, cabinetDepthMm);

        for (const piece of CORNER_ASSEMBLY_PIECES) {
          expect(
            widthMm(widths, piece),
            `${piece.wall}/${piece.band} in ${String(room.widthMm)}×${String(room.depthMm)}`,
          ).toBeLessThanOrEqual(widthMm(reference, piece));
        }
      }),
      { numRuns: 200 },
    );
  });
});

// =================================================================================================
// Criterion 3 — the shell still validates clean, at each depth and through the depth command
// =================================================================================================

describe("criterion 3 — the shell over the approved range, at both depths and back", () => {
  // The must-not, and it is a test-fidelity trap rather than a defect: judging an **unchanged**
  // 600 mm design against `buildKitchenLBodyCatalog(700)` reports 3 ×
  // `RECORDED_SPAN_OVERLAPS_CORNER_BODY` in every room and says nothing about the product. The
  // depth change goes through `setCabinetDepth`, whose `catalogAt` factory exists to make the other
  // call site unwritable — so every judgement below is against the catalogue its design is at.
  function expectACleanShell(room: DesignRoom): void {
    const shell = shellIn(room);
    const where = JSON.stringify(room);

    expect(findingCodesOf(shell, SHELL_CABINET_DEPTH_MM), where).toStrictEqual(
      [],
    );
    expect(findOverflowingPlacementIds(shell), where).toStrictEqual([]);

    const deepened = atCabinetDepth(shell, DEEPER_CABINET_DEPTH_MM);
    expect(
      findingCodesOf(deepened, DEEPER_CABINET_DEPTH_MM),
      `${where} at ${String(DEEPER_CABINET_DEPTH_MM)} mm`,
    ).toStrictEqual([]);
    expect(findOverflowingPlacementIds(deepened), where).toStrictEqual([]);

    const back = atCabinetDepth(deepened, SHELL_CABINET_DEPTH_MM);
    expect(
      findingCodesOf(back, SHELL_CABINET_DEPTH_MM),
      `${where} and back`,
    ).toStrictEqual([]);
    expect(findOverflowingPlacementIds(back), where).toStrictEqual([]);
  }

  it.each(ANCHOR_ROOMS)("holds in the anchor room %o", (room) => {
    expectACleanShell(room);
  });

  it("holds over the approved room range", () => {
    fc.assert(
      fc.property(approvedRoom(), (room) => {
        expectACleanShell(room);
      }),
      { numRuns: 40 },
    );
  });
});

// =================================================================================================
// Criterion 5 — no insertability changes
// =================================================================================================

describe("criterion 5 — the catalogue's two populations are where they were", () => {
  it("offers sixteen insertable rows, and no structural corner among them", () => {
    const insertable = listInsertableBodies(KITCHEN_L_BODY_CATALOG);

    expect(insertable).toHaveLength(16);
    for (const body of insertable) {
      expect(
        KITCHEN_L_BODY_CATALOG.get(body.buildId)?.structuralReason,
        body.buildId,
      ).not.toBe("corner");
    }
  });
});

// =================================================================================================
// Criterion 6 — run origins stay on the grid at the shipped depth
// =================================================================================================

describe("criterion 6 — the run origins at the shipped depth", () => {
  it.each([REFERENCE_ROOM, SMALLEST_APPROVED_ROOM, ...THRESHOLD_TABLE_ROOMS])(
    "start at 900 on both walls, on the 50 mm grid, in %o",
    (room) => {
      const runs = lShellFloorRuns(room);

      for (const wall of WALLS) {
        expect(runs[wall].startMm, `wall ${wall}`).toBe(900);
        expect(runs[wall].startMm % WIDTH_STEP_MM, `wall ${wall}`).toBe(0);
        expect(runs[wall].startMm % 50, `wall ${wall}`).toBe(0);
      }
    },
  );
});

// =================================================================================================
// Criterion 7 — the smallest room the owner's policy admits
// =================================================================================================

describe("criterion 7 — the smallest room APPROVED_ROOM_POLICY admits", () => {
  it.each([
    { baseWidthMm: 320, upperWidthMm: 570, expectedReachMm: 1000 },
    { baseWidthMm: 200, upperWidthMm: 200, expectedReachMm: 880 },
    { baseWidthMm: 200, upperWidthMm: 570, expectedReachMm: 970 },
  ])(
    "takes both wall-B rows at 700 mm: base $baseWidthMm / upper $upperWidthMm reaches $expectedReachMm",
    async ({ baseWidthMm, upperWidthMm, expectedReachMm }) => {
      // Hypothetical width pairs are an algebra guard, not rooms or alternative policies.
      // The mixed pair catches a narrowed base return that leaves the upper row at 570 mm.
      const actualWidths = widthsIn(REFERENCE_ROOM, DEEPER_CABINET_DEPTH_MM);
      const widths: CornerAssemblyWidthsMm = {
        ...actualWidths,
        pieces: actualWidths.pieces.map((piece) => ({
          ...piece,
          widthMm:
            piece.wall === "B"
              ? piece.band === "base"
                ? baseWidthMm
                : upperWidthMm
              : piece.widthMm,
        })),
      };
      const baseFarMm = farEdgeMm(widths, { wall: "B", band: "base" });
      const wallFarMm = farEdgeMm(widths, { wall: "B", band: "wall" });
      const topFarMm = farEdgeMm(widths, { wall: "B", band: "top" });

      expect(baseFarMm).toBe(680 + baseWidthMm);
      expect(wallFarMm).toBe(400 + upperWidthMm);
      expect(topFarMm).toBe(wallFarMm);
      expect(Math.max(baseFarMm, wallFarMm, topFarMm)).toBe(expectedReachMm);

      // The engine bound resolves the two catalogue floors at module load. Vary those floors
      // here so a bound implementation that silently drops the upper row fails on 200/570.
      vi.doMock("../src/catalog.js", async (importOriginal) => {
        const actual =
          await importOriginal<typeof import("../src/catalog.js")>();
        return {
          ...actual,
          INSERTABLE_BODY_DEFINITIONS: actual.INSERTABLE_BODY_DEFINITIONS.map(
            ([id, entry]) => [
              id,
              id === "base-cabinet"
                ? { ...entry, minWidthMm: baseWidthMm }
                : id === "wall-cabinet"
                  ? { ...entry, minWidthMm: upperWidthMm }
                  : entry,
            ],
          ),
        };
      });
      try {
        vi.resetModules();
        const sizedModule = await import("../src/corner-assembly-size.js");
        expect(sizedModule.narrowestCornerReachMm("B").wallMinimumMm).toBe(
          expectedReachMm,
        );
      } finally {
        vi.doUnmock("../src/catalog.js");
        vi.resetModules();
      }
    },
  );

  it("keeps the actual engine floor at 880 mm while the approved wall-B minimum stays 1000 mm", () => {
    expect(narrowestCornerReachMm("B").wallMinimumMm).toBe(880);
    expect(approvedL().wallB.minMm).toBe(1000);
  });

  it("is read from the bound rather than typed, and is 900 × 1000 × 2200 while the bound is unmoved", () => {
    expect(SMALLEST_APPROVED_ROOM).toStrictEqual({
      shape: "L",
      widthMm: 900,
      depthMm: 1000,
      heightMm: 2200,
    });
  });

  it("still holds its whole corner assembly, inside both walls", () => {
    const shell = shellIn(SMALLEST_APPROVED_ROOM);
    const corners = shell.placements.filter(
      (placement) =>
        KITCHEN_L_BODY_CATALOG.get(placement.body.buildId)?.structuralReason ===
        "corner",
    );

    // Three, not four: the top-row return's own top is above a 2200 mm ceiling, and an excluded
    // piece still reserves its footprint (ADR 0110 decision 1).
    expect(corners.map(({ id }) => id).sort()).toStrictEqual([
      "p25",
      "p26",
      "p9",
    ]);
    expect(findOverflowingPlacementIds(shell)).toStrictEqual([]);
    for (const wall of WALLS) {
      expect(
        assemblyReachMm(SMALLEST_APPROVED_ROOM, SHELL_CABINET_DEPTH_MM, wall),
        `wall ${wall}`,
      ).toBeLessThanOrEqual(wallLengthMm(wall, SMALLEST_APPROVED_ROOM));
    }
  });

  it("still returns minimum not met from generateKitchen", () => {
    const result = generateKitchen({
      room: SMALLEST_APPROVED_ROOM,
      occurredAt: OCCURRED_AT,
      probeAt: createFakeProbeFactory(),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("the smallest approved room generated");
    expect(result.reason.code).toBe("MINIMUM_NOT_MET");
  });
});

// =================================================================================================
// Criterion 8 — 7D3's origin is unmoved
// =================================================================================================

describe("criterion 8 — the origins wave 7D3 measured its threshold table from", () => {
  it.each(THRESHOLD_TABLE_ROOMS)(
    "still starts both floor runs at 900 mm in %o",
    (room) => {
      const runs = lShellFloorRuns(room);

      expect(runs.A.startMm).toBe(900);
      expect(runs.B.startMm).toBe(900);
    },
  );
});

// =================================================================================================
// Criterion 9 — determinism
// =================================================================================================

describe("criterion 9 — the same room and depth give a byte-identical shell", () => {
  it.each([REFERENCE_ROOM, SMALLEST_APPROVED_ROOM, ...THRESHOLD_TABLE_ROOMS])(
    "builds %o identically twice",
    (room) => {
      const first = buildLShellDesign({ room, occurredAt: OCCURRED_AT });
      const second = buildLShellDesign({ room, occurredAt: OCCURRED_AT });

      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    },
  );
});

// =================================================================================================
// Criterion 11 — the residue is recorded, and wall A's wall-only run survives
// =================================================================================================

describe("criterion 11 — the wall-only runs", () => {
  // Criteria 1 and 8 are structurally blind to this: both read the **floor** run, and the run this
  // criterion is about is the wall-only one standing over wall A's corner base. A derivation that
  // moved `wallRowStartMm("A")` off 0 would delete it — and, in the smallest admitted room, the
  // entire frozen map — while every other criterion in this file stayed green (adjudication D3).
  it("keeps wall A's at two tiles totalling 900 mm from 0, in the reference room", () => {
    const tiles = wallOnlyTilesOn(shellIn(REFERENCE_ROOM), "A");

    expect(
      tiles.map((tile) => [
        tile.alongMm,
        tile.widthMm,
        tile.y0Mm,
        tile.topMm,
        tile.depthFromBuildId,
      ]),
    ).toStrictEqual([
      [400, 800, 1500, 2600, "wall-cabinet"],
      [850, 100, 1500, 2600, "wall-cabinet"],
    ]);
    expect(
      Math.min(...tiles.map((tile) => tile.alongMm - tile.widthMm / 2)),
    ).toBe(0);
    expect(
      Math.max(...tiles.map((tile) => tile.alongMm + tile.widthMm / 2)),
    ).toBe(900);
    expect(tiles.reduce((sum, tile) => sum + tile.widthMm, 0)).toBe(900);
  });

  it("makes those two tiles the whole of the smallest approved room's recorded space", () => {
    const shell = shellIn(SMALLEST_APPROVED_ROOM);

    expect(shell.emptyColumns).toStrictEqual(
      wallOnlyTilesOn(shell, "A") as typeof shell.emptyColumns,
    );
    expect(wallOnlyTilesOn(shell, "A")).toHaveLength(2);
    expect(
      wallOnlyTilesOn(shell, "A").reduce((sum, tile) => sum + tile.widthMm, 0),
    ).toBe(900);
  });

  it("spans exactly from wall A's zero to its floor run's origin, over the approved range", () => {
    fc.assert(
      fc.property(approvedRoom(), (room) => {
        const shell = shellIn(room);
        const tiles = wallOnlyTilesOn(shell, "A");
        const where = JSON.stringify(room);

        expect(tiles.length, where).toBeGreaterThan(0);
        expect(
          Math.min(...tiles.map((tile) => tile.alongMm - tile.widthMm / 2)),
          `wall A's wall row no longer starts at the corner, ${where}`,
        ).toBe(0);
        expect(
          Math.max(...tiles.map((tile) => tile.alongMm + tile.widthMm / 2)),
          where,
        ).toBe(
          Math.min(lShellFloorRuns(room).A.startMm, wallLengthMm("A", room)),
        );
        // Wall B's own wall row starts where its floor run does, so its wall-only run is empty and
        // no residue goes unrecorded there.
        expect(wallOnlyTilesOn(shell, "B"), where).toStrictEqual([]);
      }),
      { numRuns: 120 },
    );
  });
});

// =================================================================================================
// Criterion 12 — containment, attainment, acyclicity
// =================================================================================================

describe("criterion 12 — what makes the policy's reader well-defined", () => {
  it("contains the assembly inside both walls, over the approved range at both depths", () => {
    fc.assert(
      fc.property(approvedRoom(), declaredDepthMm(), (room, cabinetDepthMm) => {
        for (const wall of WALLS) {
          expect(
            assemblyReachMm(room, cabinetDepthMm, wall),
            `wall ${wall} of ${JSON.stringify(room)} at ${String(cabinetDepthMm)} mm`,
          ).toBeLessThanOrEqual(wallLengthMm(wall, room));
        }
      }),
      { numRuns: 300 },
    );
  });

  it("sweeps rooms up to the approved maxima, both walls at 6000", () => {
    expect(approvedL().wallA.maxMm).toBe(6000);
    expect(approvedL().wallB.maxMm).toBe(6000);
    for (const wall of WALLS) {
      for (const cabinetDepthMm of declaredCabinetDepthsMm()) {
        expect(
          assemblyReachMm(LARGEST_APPROVED_ROOM, cabinetDepthMm, wall),
        ).toBeLessThanOrEqual(wallLengthMm(wall, LARGEST_APPROVED_ROOM));
      }
    }
  });

  // **Attainment, as the bound can state it.** The adjudication words this as *"the reach at the
  // approved minimum room equals `narrowestCornerReachMm`"*; that is unsatisfiable while the owner's
  // minima stay 900 / 1000 above a derived 880 (owner ruling, 2026-09-17), and no slice but the
  // joint bound slice may move them. So tightness is asserted where it is a property of the bound
  // itself: **the smallest room the bound admits attains it exactly**, which is what "tight, not
  // merely safe" means, and the margin above the owner's minima is S3's criterion 4′.
  it.each(WALLS)(
    "is attained exactly by the smallest room wall %s's own bound admits",
    (wall) => {
      const boundMm = narrowestCornerReachMm(wall).wallMinimumMm;
      const roomAtTheBound: DesignRoom = {
        shape: "L",
        widthMm: narrowestCornerReachMm("A").wallMinimumMm,
        depthMm: narrowestCornerReachMm("B").wallMinimumMm,
        heightMm: APPROVED_ROOM_POLICY.heightBounds.minMm,
      };

      expect(
        Math.max(
          ...declaredCabinetDepthsMm().map((cabinetDepthMm) =>
            assemblyReachMm(roomAtTheBound, cabinetDepthMm, wall),
          ),
        ),
      ).toBe(boundMm);
    },
  );

  it.each(WALLS)(
    "sits below the owner's own minimum on wall %s, which is the margin S3 pins",
    (wall) => {
      const approved =
        wall === "A" ? approvedL().wallA.minMm : approvedL().wallB.minMm;

      expect(narrowestCornerReachMm(wall).wallMinimumMm).toBe(880);
      expect(narrowestCornerReachMm(wall).wallMinimumMm).toBeLessThan(approved);
    },
  );

  it("imports nothing from room/, so no bound can bind to undefined at module load", () => {
    const source = readFileSync(
      path.join(SOURCE, "corner-assembly-size.ts"),
      "utf8",
    );
    const imports = source.match(/^import\b[^;]*;/gm) ?? [];

    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((statement) => statement.includes("room/"))).toEqual(
      [],
    );
    expect(source).not.toMatch(/\bimport\s*\(/);
  });

  it("gives every engine bound a finite positive whole millimetre, whichever module loads first", async () => {
    vi.resetModules();
    const firstLoaded = await import("../src/room/room-policy.js");
    const walls = firstLoaded.ENGINE_ROOM_LIMITS.buildableShapes.L;
    if (!walls) throw new Error("the engine limits state no L");
    const bounds = [
      walls.wallA,
      walls.wallB,
      firstLoaded.ENGINE_ROOM_LIMITS.heightBounds,
    ].flatMap(({ minMm, maxMm }) => [minMm, maxMm]);

    for (const valueMm of bounds) {
      expect(Number.isSafeInteger(valueMm)).toBe(true);
      expect(valueMm).toBeGreaterThan(0);
    }
    expect(firstLoaded.ENGINE_ROOM_LIMITS).toStrictEqual(ENGINE_ROOM_LIMITS);
  });
});

// =================================================================================================
// Criterion 13 — the two quantifiers cannot be swapped
// =================================================================================================

describe("criterion 13 — the bound's question and the shell's are different questions", () => {
  it("answers wall B differently, so a caller that took the other's number cannot do so silently", () => {
    const bound = narrowestCornerReachMm("B").wallMinimumMm;
    const shellOrigin = lShellFloorRuns(REFERENCE_ROOM).B.startMm;

    expect(bound).toBe(880);
    expect(shellOrigin).toBe(900);
    expect(bound).not.toBe(shellOrigin);
  });

  it("holds the bound constant over every room, because it takes none", () => {
    for (const room of [...ANCHOR_ROOMS, ...THRESHOLD_TABLE_ROOMS]) {
      for (const wall of WALLS) {
        expect(
          narrowestCornerReachMm(wall).wallMinimumMm,
          JSON.stringify(room),
        ).toBe(880);
      }
    }
  });

  it("returns types that are not each other's, so the swap is a compile error", () => {
    const reach = narrowestCornerReachMm("B");
    const farEdge = cornerFarEdgeMm({
      widths: widthsIn(REFERENCE_ROOM, SHIPPED_CABINET_DEPTH_MM),
      cabinetDepthMm: SHIPPED_CABINET_DEPTH_MM,
      wall: "B",
      band: "base",
    });

    // @ts-expect-error a wall minimum is not a far edge (adjudication D2)
    const notAFarEdge: typeof farEdge = reach;
    // @ts-expect-error and a far edge is not a wall minimum
    const notAReach: typeof reach = farEdge;

    expect([notAFarEdge, notAReach]).toHaveLength(2);
  });

  it("refuses widths derived at another depth rather than mixing the two", () => {
    expect(() =>
      cornerFarEdgeMm({
        widths: widthsIn(REFERENCE_ROOM, SHIPPED_CABINET_DEPTH_MM),
        cabinetDepthMm: DEEPER_CABINET_DEPTH_MM,
        wall: "B",
        band: "base",
      }),
    ).toThrow(/cannot answer/);
  });

  it("exports no reach function with an optional or defaulted depth or room", () => {
    const source = readFileSync(
      path.join(SOURCE, "corner-assembly-size.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/cabinetDepthMm\?:/);
    expect(source).not.toMatch(/room\?:/);
    expect(source).not.toMatch(/cabinetDepthMm\s*=\s/);
    expect(source).not.toMatch(/room\s*=\s/);
  });
});
