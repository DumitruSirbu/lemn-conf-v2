// M7B U2 slice S1: the right corner (ADR 0132 decision 2, D4/D5), `cornerOf` (ADR 0121, D3), and
// the odd-millimetre finding (ADR 0132 decision 4, D4). AC1 is owned here for its geometric half —
// sizing, mirroring, no overlap, the exact far edge — and for `twoCornersWallAMinimumMm`'s 1800
// derivation. The build-id half of AC1 (a placement a generator actually writes) is not testable
// yet: no U shell builder exists before U2 slice S2/S3.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  cornerAlongWallCentreMm,
  cornerAssemblyWidthsMm,
  cornerOf,
  rightCornerAlongWallCentreMm,
  rightCornerAssemblyWidthsMm,
  twoCornersWallAMinimumMm,
} from "../src/corner-assembly-size.js";
import type { DesignPlacement, DesignRoom } from "../src/design.js";
import { buildKitchenLBodyCatalog } from "../src/fixtures/kitchen-l-design.js";
import { declaredCabinetDepthsMm } from "../src/worktop-depth.js";

const CATALOG = buildKitchenLBodyCatalog(600);
const CABINET_DEPTHS_MM = declaredCabinetDepthsMm();

function uRoom(overrides: Partial<DesignRoom> = {}): DesignRoom {
  return {
    shape: "U",
    widthMm: 3600,
    depthMm: 2400,
    wallCMm: 2200,
    heightMm: 2600,
    ...overrides,
  };
}

/** The room `roomForTheRightCorner` builds internally, restated here so a test can compare the
 *  right corner directly against the left corner's own rule run in it — the same room ADR 0132
 *  decision 2 names, "the L room (W, C)". */
function mirroredLRoom(room: DesignRoom): DesignRoom {
  return {
    shape: "L",
    widthMm: room.widthMm,
    depthMm: room.wallCMm ?? 0,
    heightMm: room.heightMm,
  };
}

describe("rightCornerAssemblyWidthsMm — sizing (D5)", () => {
  it("sizes the four pieces on walls A and C, none on B", () => {
    const widths = rightCornerAssemblyWidthsMm({
      cabinetDepthMm: 600,
      room: uRoom(),
    });

    expect(widths.pieces).toHaveLength(4);
    expect(new Set(widths.pieces.map((piece) => piece.wall))).toStrictEqual(
      new Set(["A", "C"]),
    );
  });

  it("sizes the X-leg identically to the left corner's own (D5)", () => {
    for (const cabinetDepthMm of CABINET_DEPTHS_MM) {
      const room = uRoom({ widthMm: 4000, wallCMm: 1800 });
      const left = cornerAssemblyWidthsMm({ cabinetDepthMm, room });
      const right = rightCornerAssemblyWidthsMm({ cabinetDepthMm, room });

      const leftXLeg = left.pieces.find(
        (piece) => piece.wall === "A" && piece.band === "base",
      );
      const rightXLeg = right.pieces.find(
        (piece) => piece.wall === "A" && piece.band === "base",
      );
      expect(rightXLeg?.widthMm).toBe(leftXLeg?.widthMm);
    }
  });

  propertyTest.prop([
    fc.integer({ min: 1800, max: 6300 }),
    fc.integer({ min: 1000, max: 6300 }),
    fc.constantFrom(...CABINET_DEPTHS_MM),
  ])(
    "sizes the three returns exactly as the left corner's rule sizes wall B in the room (W, C)",
    (widthMm, wallCMm, cabinetDepthMm) => {
      const room = uRoom({ widthMm, wallCMm });
      const right = rightCornerAssemblyWidthsMm({ cabinetDepthMm, room });
      const left = cornerAssemblyWidthsMm({
        cabinetDepthMm,
        room: mirroredLRoom(room),
      });

      for (const band of ["base", "wall", "top"] as const) {
        const rightPiece = right.pieces.find(
          (piece) => piece.wall === "C" && piece.band === band,
        );
        const leftPiece = left.pieces.find(
          (piece) => piece.wall === "B" && piece.band === band,
        );
        expect(rightPiece?.widthMm).toBe(leftPiece?.widthMm);
      }
    },
  );

  it("throws for a room with no wallCMm — there is no right corner to size", () => {
    const linearLikeRoom: DesignRoom = {
      shape: "L",
      widthMm: 3600,
      depthMm: 2400,
      heightMm: 2600,
    };
    expect(() =>
      rightCornerAssemblyWidthsMm({
        cabinetDepthMm: 600,
        room: linearLikeRoom,
      }),
    ).toThrow(/wallCMm/);
  });
});

describe("rightCornerAlongWallCentreMm — placement (D4)", () => {
  propertyTest.prop([
    fc.integer({ min: 1800, max: 6300 }),
    fc.integer({ min: 1000, max: 6300 }),
    fc.constantFrom(...CABINET_DEPTHS_MM),
  ])(
    "mirrors the left X-leg's centre about the room's width, never throwing on a half millimetre (D4, odd-mm finding)",
    (widthMm, wallCMm, cabinetDepthMm) => {
      const room = uRoom({ widthMm, wallCMm });
      const widths = rightCornerAssemblyWidthsMm({ cabinetDepthMm, room });
      const leftWidths = cornerAssemblyWidthsMm({ cabinetDepthMm, room });

      const leftCentre = cornerAlongWallCentreMm({
        widths: leftWidths,
        cabinetDepthMm,
        wall: "A",
        band: "base",
      });
      const rightCentre = rightCornerAlongWallCentreMm({
        widths,
        cabinetDepthMm,
        wall: "A",
        band: "base",
      });

      expect(rightCentre.wall).toBe("A");
      expect(Number.isInteger(rightCentre.alongMm)).toBe(true);
      expect(rightCentre.alongMm).toBe(widthMm - leftCentre.alongMm);
    },
  );

  propertyTest.prop([
    fc.integer({ min: 1800, max: 6300 }),
    fc.integer({ min: 1000, max: 6300 }),
    fc.constantFrom(...CABINET_DEPTHS_MM),
  ])(
    "puts the right X-leg's far edge exactly at the room's width, every time (D4)",
    (widthMm, wallCMm, cabinetDepthMm) => {
      const room = uRoom({ widthMm, wallCMm });
      const widths = rightCornerAssemblyWidthsMm({ cabinetDepthMm, room });
      const xLeg = widths.pieces.find(
        (piece) => piece.wall === "A" && piece.band === "base",
      );
      if (!xLeg) throw new Error("the right corner built no X-leg");

      const centre = rightCornerAlongWallCentreMm({
        widths,
        cabinetDepthMm,
        wall: "A",
        band: "base",
      });

      expect(centre.alongMm + xLeg.widthMm / 2).toBe(widthMm);
    },
  );

  it("never overlaps the left X-leg — the two reach at most halfway across the room at its own minimum (D5)", () => {
    const widthMm = twoCornersWallAMinimumMm();
    const room = uRoom({ widthMm, wallCMm: 2200 });
    const cabinetDepthMm = 600;
    const widths = rightCornerAssemblyWidthsMm({ cabinetDepthMm, room });
    const leftWidths = cornerAssemblyWidthsMm({ cabinetDepthMm, room });

    const leftXLeg = leftWidths.pieces.find(
      (piece) => piece.wall === "A" && piece.band === "base",
    );
    const rightXLeg = widths.pieces.find(
      (piece) => piece.wall === "A" && piece.band === "base",
    );
    if (!leftXLeg || !rightXLeg) throw new Error("a corner built no X-leg");

    const leftCentre = cornerAlongWallCentreMm({
      widths: leftWidths,
      cabinetDepthMm,
      wall: "A",
      band: "base",
    });
    const rightCentre = rightCornerAlongWallCentreMm({
      widths,
      cabinetDepthMm,
      wall: "A",
      band: "base",
    });
    const leftFarEdgeMm = leftCentre.alongMm + leftXLeg.widthMm / 2;
    const rightNearEdgeMm = rightCentre.alongMm - rightXLeg.widthMm / 2;

    expect(leftFarEdgeMm).toBeLessThanOrEqual(rightNearEdgeMm);
  });

  it("stands each return at the same along value the left corner's own rule gives wall B in the room (W, C)", () => {
    const room = uRoom();
    const cabinetDepthMm = 600;
    const widths = rightCornerAssemblyWidthsMm({ cabinetDepthMm, room });
    const leftWidths = cornerAssemblyWidthsMm({
      cabinetDepthMm,
      room: mirroredLRoom(room),
    });

    for (const band of ["base", "wall", "top"] as const) {
      const rightCentre = rightCornerAlongWallCentreMm({
        widths,
        cabinetDepthMm,
        wall: "C",
        band,
      });
      const leftCentre = cornerAlongWallCentreMm({
        widths: leftWidths,
        cabinetDepthMm,
        wall: "B",
        band,
      });
      expect(rightCentre.wall).toBe("C");
      expect(rightCentre.alongMm).toBe(leftCentre.alongMm);
    }
  });
});

describe("twoCornersWallAMinimumMm — ENGINE_ROOM_LIMITS.U.wallA.minMm's derivation source", () => {
  it("is 1800: the sum of each X-leg's own reference width, not twice the narrowest reach", () => {
    expect(twoCornersWallAMinimumMm()).toBe(1800);
  });
});

describe("cornerOf (ADR 0121, D3)", () => {
  function placementAt(
    wall: DesignPlacement["wall"],
    alongMm: number,
    buildId: string,
  ): DesignPlacement {
    return {
      id: "p0",
      wall,
      alongMm,
      y0Mm: 0,
      body: { buildId, widthMm: 300, heightMm: 700 },
    };
  }

  const room = uRoom();

  it("reads a wall-B piece as the left corner", () => {
    expect(
      cornerOf(placementAt("B", 160, "base-corner-return-320"), room, CATALOG),
    ).toBe("left");
  });

  it("reads a wall-C piece as the right corner", () => {
    expect(
      cornerOf(placementAt("C", 160, "base-corner-return-320"), room, CATALOG),
    ).toBe("right");
  });

  it("reads a wall-A piece before the room's midpoint as the left corner", () => {
    expect(
      cornerOf(
        placementAt("A", room.widthMm / 2 - 1, "base-corner-x-900"),
        room,
        CATALOG,
      ),
    ).toBe("left");
  });

  it("reads a wall-A piece at or past the room's midpoint as the right corner", () => {
    expect(
      cornerOf(
        placementAt("A", room.widthMm / 2, "base-corner-x-900"),
        room,
        CATALOG,
      ),
    ).toBe("right");
    expect(
      cornerOf(
        placementAt("A", room.widthMm / 2 + 1, "base-corner-x-900"),
        room,
        CATALOG,
      ),
    ).toBe("right");
  });

  it("answers undefined for a body that is not a corner at all", () => {
    expect(
      cornerOf(placementAt("A", 1300, "base-cabinet"), room, CATALOG),
    ).toBeUndefined();
  });

  it("never compares against another placement — it takes none", () => {
    // The signature itself is the proof: `cornerOf` cannot read a second placement's position
    // because it is never handed one.
    expect(cornerOf.length).toBe(3);
  });
});
