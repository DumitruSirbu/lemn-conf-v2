// M7B U5 S0 (ADR 0132 A8.4): `derivePlacementRecords` carries `cornerOf`'s answer on every record,
// asked of the *original* placement, so no reader has to stand a placement back up from a record.
//
// Each property compares a record's `corner` with `cornerOf` called on the placement it was derived
// from — over the approved U, the engine's U, and the L and straight rooms, whose only corner is the
// left. The comparison is not circular: `cornerOf` reads the placement's own `alongMm`, where the
// record has only a frame in metres, so the two sides are fed by different data.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  buildLinearShellDesign,
  buildLShellDesign,
  buildUShellDesign,
  cornerOf,
  derivePlacementRecords,
  type Design,
  type DesignPlacement,
  type DesignRoom,
} from "../src/index.js";
import { ENGINE_ROOM_LIMITS } from "../src/room/room-policy.js";
import {
  engineLinearWallBounds,
  engineLWallBounds,
  engineUWallBounds,
} from "./support/room-input.js";

const OCCURRED_AT = "2026-09-29T12:00:00.000Z";
const SHELL_CABINET_DEPTH_MM = 600;
const CATALOGUE = buildKitchenLBodyCatalog(SHELL_CABINET_DEPTH_MM);
const RUNS = 200;

/** ADR 0108 H4: wall A 2700–6000, walls B and C 1000–6000, height 2200–3900. The approved policy
 *  carries no U until U6 (`isShapeBuildable("U", APPROVED_ROOM_POLICY)` stays false), so the box is
 *  written here from the record rather than read from a policy that does not state it. */
const APPROVED_U = {
  wallA: { minMm: 2700, maxMm: 6000 },
  side: { minMm: 1000, maxMm: 6000 },
  height: { minMm: 2200, maxMm: 3900 },
} as const;

interface Bounds {
  readonly minMm: number;
  readonly maxMm: number;
}

function within(bounds: Bounds) {
  return fc.integer({ min: bounds.minMm, max: bounds.maxMm });
}

function uRoomsWithin(walls: {
  readonly wallA: Bounds;
  readonly side: Bounds;
  readonly height: Bounds;
}) {
  return fc.record({
    shape: fc.constant("U" as const),
    widthMm: within(walls.wallA),
    depthMm: within(walls.side),
    wallCMm: within(walls.side),
    heightMm: within(walls.height),
  });
}

function engineURooms() {
  const walls = engineUWallBounds();
  return uRoomsWithin({
    wallA: walls.wallA,
    side: { minMm: walls.wallB.minMm, maxMm: walls.wallB.maxMm },
    height: ENGINE_ROOM_LIMITS.heightBounds,
  });
}

function lRoomsWithin(walls: {
  readonly wallA: Bounds;
  readonly wallB: Bounds;
  readonly height: Bounds;
}) {
  return fc.record({
    shape: fc.constant("L" as const),
    widthMm: within(walls.wallA),
    depthMm: within(walls.wallB),
    heightMm: within(walls.height),
    cornerDirection: fc.constantFrom("left" as const, "right" as const),
  });
}

function recordsCornersAndCornerOfAgree(design: Design): {
  readonly corners: readonly (string | undefined)[];
} {
  const records = derivePlacementRecords(design, CATALOGUE);
  expect(records.map((record) => record.id)).toEqual(
    design.placements.map((placement) => placement.id),
  );
  for (const [index, placement] of design.placements.entries()) {
    expect(records[index]?.corner, placement.id).toBe(
      cornerOf(placement, design.room, CATALOGUE),
    );
  }
  return { corners: records.map((record) => record.corner) };
}

describe("a record's corner is cornerOf's answer on the original placement", () => {
  it("over the approved U, and it has both a left and a right corner piece every time", () => {
    fc.assert(
      fc.property(uRoomsWithin(APPROVED_U), (room) => {
        const { corners } = recordsCornersAndCornerOfAgree(
          buildUShellDesign({ room, occurredAt: OCCURRED_AT }),
        );

        expect(corners).toContain("left");
        expect(corners).toContain("right");
      }),
      { numRuns: RUNS },
    );
  });

  it("over the engine's U, and it has both a left and a right corner piece every time", () => {
    fc.assert(
      fc.property(engineURooms(), (room) => {
        const { corners } = recordsCornersAndCornerOfAgree(
          buildUShellDesign({ room, occurredAt: OCCURRED_AT }),
        );

        expect(corners).toContain("left");
        expect(corners).toContain("right");
      }),
      { numRuns: RUNS },
    );
  });

  it("over an L in either direction, and no piece of an L is ever the right corner", () => {
    const l = engineLWallBounds();
    fc.assert(
      fc.property(
        lRoomsWithin({
          wallA: l.wallA,
          wallB: l.wallB,
          height: ENGINE_ROOM_LIMITS.heightBounds,
        }),
        (room) => {
          const { corners } = recordsCornersAndCornerOfAgree(
            buildLShellDesign({ room, occurredAt: OCCURRED_AT }),
          );

          expect(corners).toContain("left");
          expect(corners).not.toContain("right");
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("over the approved L", () => {
    const approved = APPROVED_ROOM_POLICY.buildableShapes.L;
    if (!approved) throw new Error("the approved policy builds no L");
    fc.assert(
      fc.property(
        lRoomsWithin({
          wallA: approved.wallA,
          wallB: approved.wallB,
          height: APPROVED_ROOM_POLICY.heightBounds,
        }),
        (room) => {
          const { corners } = recordsCornersAndCornerOfAgree(
            buildLShellDesign({ room, occurredAt: OCCURRED_AT }),
          );

          expect(corners).not.toContain("right");
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("over a straight room, which has no corner piece at all", () => {
    const linear = engineLinearWallBounds();
    fc.assert(
      fc.property(
        within(linear.wallA),
        within(ENGINE_ROOM_LIMITS.heightBounds),
        (widthMm, heightMm) => {
          const room: DesignRoom = {
            shape: "linear",
            widthMm,
            depthMm: linear.depthMm,
            heightMm,
          };

          const { corners } = recordsCornersAndCornerOfAgree(
            buildLinearShellDesign({ room, occurredAt: OCCURRED_AT }),
          );

          expect(corners.every((corner) => corner === undefined)).toBe(true);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe("the one place a corner reads a position: a U's wall-A X-leg against W / 2", () => {
  function xLegAt(id: string, alongMm: number): DesignPlacement {
    return {
      id,
      wall: "A",
      alongMm,
      y0Mm: 0,
      body: { buildId: "base-corner-x-900", widthMm: 900, heightMm: 820 },
    };
  }

  it.each([2700, 2701, 4500, 4501, 6000])(
    "W = %i: X-legs at, and a millimetre either side of, W / 2 carry the side cornerOf gives them",
    (widthMm) => {
      const shell = buildUShellDesign({
        room: {
          shape: "U",
          widthMm,
          depthMm: 3000,
          wallCMm: 3000,
          heightMm: 2600,
        },
        occurredAt: OCCURRED_AT,
      });
      const middle = widthMm / 2;
      const probes = [
        Math.floor(middle) - 1,
        Math.floor(middle),
        Math.ceil(middle),
        Math.ceil(middle) + 1,
      ].map((alongMm, index) => xLegAt(`probe-${String(index)}`, alongMm));
      const design: Design = {
        ...shell,
        placements: [...shell.placements, ...probes],
      };

      const records = derivePlacementRecords(design, CATALOGUE);

      for (const probe of probes) {
        const record = records.find((candidate) => candidate.id === probe.id);
        expect(record?.corner, `along ${String(probe.alongMm)}`).toBe(
          cornerOf(probe, design.room, CATALOGUE),
        );
      }
      // floor(W/2) and ceil(W/2) are one millimetre for an even W and straddle the midpoint for an
      // odd one, so this pair is the one that tells "<" from "<=".
      const cornerOfProbe = (id: string) =>
        records.find((candidate) => candidate.id === id)?.corner;
      expect(cornerOfProbe("probe-1")).toBe(
        widthMm % 2 === 0 ? "right" : "left",
      );
      expect(cornerOfProbe("probe-2")).toBe("right");
    },
  );

  it("carries no corner for a body that is not a structural corner, wherever it stands", () => {
    const shell = buildUShellDesign({
      room: {
        shape: "U",
        widthMm: 4500,
        depthMm: 3000,
        wallCMm: 3600,
        heightMm: 2600,
      },
      occurredAt: OCCURRED_AT,
    });
    const ordinary = (
      id: string,
      wall: "A" | "B" | "C",
      alongMm: number,
    ): DesignPlacement => ({
      id,
      wall,
      alongMm,
      y0Mm: 0,
      body: { buildId: "base-drawer3-600", widthMm: 600, heightMm: 820 },
    });
    const ordinaries = [
      ordinary("a-far", "A", 3300),
      ordinary("b-near", "B", 1200),
      ordinary("c-near", "C", 1200),
    ];

    const records = derivePlacementRecords(
      { ...shell, placements: [...shell.placements, ...ordinaries] },
      CATALOGUE,
    );

    for (const placement of ordinaries) {
      const record = records.find((candidate) => candidate.id === placement.id);
      expect(record, placement.id).toBeDefined();
      expect("corner" in (record ?? {}), placement.id).toBe(false);
    }
  });
});
