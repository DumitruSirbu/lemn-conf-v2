// M7B U2 S3 (D9, ADR 0132 decision 7): a cabinet-depth change on a U shell. AC3 — wall C's run
// slides exactly what wall B's slides in the room with B and C swapped, wall A never moves, the
// four corner pieces' own widths are frozen, and the 30 mm top-row residue between the two along-
// wall chains lands on both side walls alike.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  buildUShellDesign,
  setCabinetDepth,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type DesignWall,
} from "../../src/index.js";
import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import { engineUWallBounds } from "../support/room-input.js";

const OCCURRED_AT = "2026-09-29T12:00:00.000Z";
const DEEP_MM = 700;
const STRUCTURAL_CATALOG = buildKitchenLBodyCatalog(600);

function engineU(overrides: Partial<DesignRoom> = {}): DesignRoom {
  const walls = engineUWallBounds();
  return {
    shape: "U",
    widthMm: walls.wallA.minMm + 900,
    depthMm: walls.wallB.minMm + 900,
    wallCMm: walls.wallC.minMm + 500,
    heightMm: 2600,
    ...overrides,
  };
}

function shellAt(room: DesignRoom): Design {
  return buildUShellDesign({ room, occurredAt: OCCURRED_AT });
}

function movedTo(design: Design, cabinetDepthMm: number): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: createFakeProbeFactory(),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok)
    throw new Error(`setCabinetDepth refused: ${result.reason.code}`);
  return result.design;
}

function placementsOn(
  design: Design,
  wall: DesignWall,
): readonly DesignPlacement[] {
  return design.placements.filter((placement) => placement.wall === wall);
}

/** The room with wall B and wall C swapped — AC3's own witness room, the twin `mirrorUDesign`'s
 *  sibling tests already lean on for the U's B↔C symmetry. */
function withBAndCSwapped(room: DesignRoom): DesignRoom {
  if (room.wallCMm === undefined) {
    throw new Error("withBAndCSwapped: the room carries no wallCMm to swap in");
  }
  return { ...room, depthMm: room.wallCMm, wallCMm: room.depthMm };
}

describe("a depth change on a U — wall A never moves", () => {
  it("leaves every wall-A placement's alongMm exactly where it stood", () => {
    const before = shellAt(engineU());
    const after = movedTo(before, DEEP_MM);

    const beforeA = placementsOn(before, "A");
    const afterA = placementsOn(after, "A");
    expect(afterA).toHaveLength(beforeA.length);
    for (const placement of beforeA) {
      const moved = afterA.find((candidate) => candidate.id === placement.id);
      expect(moved?.alongMm, placement.id).toBe(placement.alongMm);
    }
  });
});

describe("a depth change on a U — corner widths are frozen", () => {
  it("keeps every structural placement's own body.widthMm unchanged by the slide", () => {
    const before = shellAt(engineU());
    const after = movedTo(before, DEEP_MM);
    const structural = before.placements.filter(
      (placement) =>
        STRUCTURAL_CATALOG.get(placement.body.buildId)?.structuralReason !==
        undefined,
    );

    for (const placement of structural) {
      const moved = after.placements.find(
        (candidate) => candidate.id === placement.id,
      );
      expect(moved?.body.widthMm, placement.id).toBe(placement.body.widthMm);
    }
  });
});

describe("a depth change on a U — wall C slides exactly what wall B slides, room B and C swapped", () => {
  it("moves the right corner's returns by the mirrored room's left-corner shift, on every seeded U", () => {
    const room = engineU();
    const mirrored = withBAndCSwapped(room);

    const cAfter = placementsOn(movedTo(shellAt(room), DEEP_MM), "C");
    const bOfMirroredAfter = placementsOn(
      movedTo(shellAt(mirrored), DEEP_MM),
      "B",
    );

    // Wall C's four returns and wall B's four returns are the same reference bodies at the same
    // along-wall footprint once the room is mirrored (D5's own proof, U2 S1), so their ids and
    // pre-slide alongMm values line up one for one.
    expect(cAfter).toHaveLength(bOfMirroredAfter.length);
    const cShifts = shiftsOf(shellAt(room), cAfter, "C");
    const bShifts = shiftsOf(shellAt(mirrored), bOfMirroredAfter, "B");
    expect(cShifts).toStrictEqual(bShifts);
    expect(cShifts.length).toBeGreaterThan(0);
  });

  propertyTest.prop([
    fc.integer({ min: 0, max: 2000 }),
    fc.integer({ min: 0, max: 2000 }),
    fc.integer({ min: 0, max: 1500 }),
  ])(
    "agrees over a swept range of U rooms",
    (widthOffsetMm, depthOffsetMm, wallCOffsetMm) => {
      const walls = engineUWallBounds();
      const room: DesignRoom = {
        shape: "U",
        widthMm: walls.wallA.minMm + widthOffsetMm,
        depthMm: walls.wallB.minMm + depthOffsetMm,
        wallCMm: walls.wallC.minMm + wallCOffsetMm,
        heightMm: 2600,
      };
      const mirrored = withBAndCSwapped(room);

      const cAfter = placementsOn(movedTo(shellAt(room), DEEP_MM), "C");
      const bOfMirroredAfter = placementsOn(
        movedTo(shellAt(mirrored), DEEP_MM),
        "B",
      );
      const cShifts = shiftsOf(shellAt(room), cAfter, "C");
      const bShifts = shiftsOf(shellAt(mirrored), bOfMirroredAfter, "B");

      expect(cShifts).toStrictEqual(bShifts);
    },
  );
});

describe("a depth change on a U — the 30 mm top-row residue lands on both side walls", () => {
  it("shifts a base-row member 100 mm and a wall-row/top-row member 70 mm, on wall B and wall C alike", () => {
    const before = shellAt(engineU());
    const after = movedTo(before, DEEP_MM);

    for (const wall of ["B", "C"] as const) {
      const shifts = shiftsOf(before, placementsOn(after, wall), wall);
      const distinctShifts = new Set(shifts.map(({ shiftMm }) => shiftMm));
      expect(distinctShifts.has(100), `wall ${wall}`).toBe(true);
      expect(distinctShifts.has(70), `wall ${wall}`).toBe(true);
    }
  });
});

interface Shift {
  readonly id: string;
  readonly shiftMm: number;
}

/** Every placement's own move on `wall`, keyed by its id with the right corner's own `right-`
 *  prefix stripped — wall C's returns and the mirrored room's wall-B returns are the same reference
 *  bodies (D5's own proof, U2 S1) under that one relabelling, so the two sweeps below compare the
 *  fact rather than restating the arithmetic. */
function shiftsOf(
  before: Design,
  after: readonly DesignPlacement[],
  wall: DesignWall,
): readonly Shift[] {
  const beforeByWall = new Map(
    placementsOn(before, wall).map((placement) => [
      unprefixed(placement.id),
      placement.alongMm,
    ]),
  );
  return after
    .map((placement) => {
      const id = unprefixed(placement.id);
      const startedAt = beforeByWall.get(id);
      if (startedAt === undefined) return undefined;
      return { id, shiftMm: placement.alongMm - startedAt };
    })
    .filter((shift): shift is Shift => shift !== undefined)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function unprefixed(id: string): string {
  return id.startsWith("right-") ? id.slice("right-".length) : id;
}
