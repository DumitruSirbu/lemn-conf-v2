// The corner's size is derived and its three readers (the room policy's bound, the shell's run origins and
// the fixture's placements) agree. One file, so that agreement has an owner.
import { fc } from "@fast-check/vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import {
  APPROVED_ROOM_POLICY,
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

/** The shipped depth, typed on purpose: a change to it must show as a failing figure, not be followed silently. */
const SHIPPED_CABINET_DEPTH_MM = 600;

/** The other declared depth. No product path builds at it (generation has no depth input), so 700 mm claims are
 *  about the derivation or `setCabinetDepth`'s output. */
const DEEPER_CABINET_DEPTH_MM = 700;

const REFERENCE_ROOM = KITCHEN_L_DESIGN.room;

const SOURCE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src",
);

function approvedL(): LWallBounds {
  const bounds = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (!bounds) throw new Error("the approved policy builds no L");
  return bounds;
}

/** The smallest and largest room the owner's policy admits, read from the policy so a moved bound moves them. */
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

/** The four rooms the threshold table was measured in (criterion 8). */
const THRESHOLD_TABLE_ROOMS: readonly DesignRoom[] = [
  { shape: "L", widthMm: 3300, depthMm: 1700, heightMm: 2600 },
  { shape: "L", widthMm: 3900, depthMm: 1700, heightMm: 2600 },
  { shape: "L", widthMm: 4500, depthMm: 1700, heightMm: 2600 },
  { shape: "L", widthMm: 4000, depthMm: 3000, heightMm: 2600 },
];

const ANCHOR_ROOMS: readonly DesignRoom[] = [
  REFERENCE_ROOM,
  SMALLEST_APPROVED_ROOM,
  LARGEST_APPROVED_ROOM,
];

function millimetresIn(bounds: MillimetreBounds) {
  return fc.integer({ min: bounds.minMm, max: bounds.maxMm });
}

/** A whole-millimetre room from the approved range, both walls up to 6000: a generator that stops short of a
 *  maximum cannot see a corner that fails to fit. */
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

/** How far the base run's carcass front stands inside the cabinet-depth line (ADR 0135). Written as arithmetic,
 *  not read from the catalogue, so the test's side of criterion 2′ is independent of the derivation's. */
const RUN_CARCASS_FRONT_INSET_MM = 30;

function nearEdgeOnWallBMm(band: CornerBand, cabinetDepthMm: number): number {
  return band === "base"
    ? cabinetDepthMm - RUN_CARCASS_FRONT_INSET_MM
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

  // The derivation is not compared only against itself: APPROVED_ROOM_POLICY is the owner's literal and nothing
  // in the derivation feeds it.
  it("is the number the owner approved wall A's minimum and corner reach from", () => {
    const approved = approvedL();

    expect(assemblyReachMm(REFERENCE_ROOM, SHIPPED_CABINET_DEPTH_MM, "A")).toBe(
      approved.minimumKitchen.cornerReachMm.wallA,
    );
    expect(assemblyReachMm(REFERENCE_ROOM, SHIPPED_CABINET_DEPTH_MM, "A")).toBe(
      approved.wallA.minMm,
    );
  });

  it("sizes all four pieces from it — 900 on wall A, 330 at wall B's base and 570 in each upper row", () => {
    const widths = widthsIn(REFERENCE_ROOM, SHIPPED_CABINET_DEPTH_MM);

    expect(widthMm(widths, { wall: "A", band: "base" })).toBe(900);
    // The reference reach less the base run's carcass front: 900 − 570 (ADR 0135).
    expect(widthMm(widths, { wall: "B", band: "base" })).toBe(330);
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

describe("criterion 2′ — wall B's base and wall rows, in the derivation and not in a design", () => {
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
    // The 30 mm residue at 700 mm is a slide on frozen widths (ADR 0089); the two ways to close it are refused below.
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

  // The room term is a ceiling, not a target: reading it as a target would widen the upper returns to 600 at 700 mm,
  // and a wider corner still contains and validates.
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

describe("criterion 3 — the shell over the approved range, at both depths and back", () => {
  // Judging an unchanged 600 mm design against the 700 mm catalogue reports RECORDED_SPAN_OVERLAPS_CORNER_BODY and says
  // nothing about the product; every judgement here uses the catalogue its design is at.
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

describe("criterion 7 — the smallest room APPROVED_ROOM_POLICY admits", () => {
  it.each([
    { baseWidthMm: 330, upperWidthMm: 570, expectedReachMm: 1000 },
    { baseWidthMm: 200, upperWidthMm: 200, expectedReachMm: 870 },
    { baseWidthMm: 200, upperWidthMm: 570, expectedReachMm: 970 },
  ])(
    "takes both wall-B rows at 700 mm: base $baseWidthMm / upper $upperWidthMm reaches $expectedReachMm",
    async ({ baseWidthMm, upperWidthMm, expectedReachMm }) => {
      // Hypothetical width pairs are an algebra guard; the mixed pair catches a narrowed base return that leaves the
      // upper row at 570 mm.
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

      expect(baseFarMm).toBe(670 + baseWidthMm);
      expect(wallFarMm).toBe(400 + upperWidthMm);
      expect(topFarMm).toBe(wallFarMm);
      expect(Math.max(baseFarMm, wallFarMm, topFarMm)).toBe(expectedReachMm);

      // The engine bound resolves the two catalogue floors at module load, so the mock varies them and re-imports;
      // a bound that silently drops the upper row fails on 200/570.
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

  // The engine floor is the narrowest corner's reach at the deepest declared depth: 670 plus the 200 mm one-door
  // floor (ADR 0135). The approved minima do not move.
  it("keeps the actual engine floor at 870 mm while the approved wall-B minimum stays 1000 mm", () => {
    expect(narrowestCornerReachMm("B").wallMinimumMm).toBe(870);
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

    // Four, not six: the top-row return's and unit's tops are above a 2200 mm ceiling, and an excluded piece still
    // reserves its footprint (ADR 0110 B2). `p27` is the corner wall unit.
    expect(corners.map(({ id }) => id).sort()).toStrictEqual([
      "p25",
      "p26",
      "p27",
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

describe("criterion 11 — the wall-only runs", () => {
  // Criteria 1 and 8 read the floor run and cannot see this wall-only run. The corner wall unit stands over wall A's
  // corner base, so no wall-only tile exists there; a derivation moving `wallRowStartMm("A")` back to 0 would tile
  // the span the unit stands in.
  const UNIT_BUILD_IDS = ["wall-corner-x-900", "wall-corner-x-900-top"];

  it("records no wall-only tile over wall A's corner base in the reference room, the unit standing there", () => {
    const shell = shellIn(REFERENCE_ROOM);

    expect(wallOnlyTilesOn(shell, "A")).toStrictEqual([]);
    expect(
      shell.placements
        .filter((placement) => UNIT_BUILD_IDS.includes(placement.body.buildId))
        .map((placement) => [
          placement.wall,
          placement.alongMm - placement.body.widthMm / 2,
          placement.alongMm + placement.body.widthMm / 2,
          placement.y0Mm,
        ]),
    ).toStrictEqual([
      ["A", 0, 900, 1500],
      ["A", 0, 900, 2200],
    ]);
  });

  it("leaves the smallest approved room with no recorded empty space at all", () => {
    const shell = shellIn(SMALLEST_APPROVED_ROOM);

    expect(shell.emptyColumns ?? []).toStrictEqual([]);
    expect(wallOnlyTilesOn(shell, "A")).toStrictEqual([]);
  });

  it("stands the unit exactly over wall A's corner span, where the wall-only tiles used to be, over the approved range", () => {
    fc.assert(
      fc.property(approvedRoom(), (room) => {
        const shell = shellIn(room);
        const where = JSON.stringify(room);
        const unit = shell.placements.find(
          (placement) => placement.body.buildId === "wall-corner-x-900",
        );

        expect(wallOnlyTilesOn(shell, "A"), where).toStrictEqual([]);
        expect(unit?.alongMm, where).toBeDefined();
        const [from, to] = [
          (unit?.alongMm ?? 0) - (unit?.body.widthMm ?? 0) / 2,
          (unit?.alongMm ?? 0) + (unit?.body.widthMm ?? 0) / 2,
        ];
        expect(from, where).toBe(0);
        expect(to, where).toBe(
          Math.min(lShellFloorRuns(room).A.startMm, wallLengthMm("A", room)),
        );
        // Wall B's wall row starts where its floor run does, so its wall-only run is empty.
        expect(wallOnlyTilesOn(shell, "B"), where).toStrictEqual([]);
      }),
      { numRuns: 120 },
    );
  });
});

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

  // Tightness is asserted on the bound itself: the smallest room the bound admits attains it exactly. The owner's
  // minima (900 / 1000) sit above the derived 870, so equality at the approved minimum is unsatisfiable.
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

      expect(narrowestCornerReachMm(wall).wallMinimumMm).toBe(870);
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

describe("criterion 13 — the bound's question and the shell's are different questions", () => {
  it("answers wall B differently, so a caller that took the other's number cannot do so silently", () => {
    const bound = narrowestCornerReachMm("B").wallMinimumMm;
    const shellOrigin = lShellFloorRuns(REFERENCE_ROOM).B.startMm;

    expect(bound).toBe(870);
    expect(shellOrigin).toBe(900);
    expect(bound).not.toBe(shellOrigin);
  });

  it("holds the bound constant over every room, because it takes none", () => {
    for (const room of [...ANCHOR_ROOMS, ...THRESHOLD_TABLE_ROOMS]) {
      for (const wall of WALLS) {
        expect(
          narrowestCornerReachMm(wall).wallMinimumMm,
          JSON.stringify(room),
        ).toBe(870);
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
