// ADR 0130 D5 (wave 7J S2, criterion A5): the straight kitchen's shell has no structural placement
// and one wall's own free run, tiled by the same shared helpers the L's shell uses.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  buildLinearShellDesign,
  buildLShellDesign,
  cabinetDepthMmOf,
  LinearShellInputError,
  LShellInputError,
  validateDesignForCatalog,
  wallLengthMm,
  type Design,
  type DesignRoom,
} from "../../src/index.js";
import { MAX_EMPTY_COLUMN_WIDTH_MM } from "../../src/module-grid.js";
import { ENGINE_ROOM_LIMITS } from "../../src/room/room-policy.js";

const OCCURRED_AT = "2026-09-24T10:00:00.000Z";

function linearWallABounds() {
  const bounds = ENGINE_ROOM_LIMITS.buildableShapes.linear;
  if (!bounds) throw new Error("the engine builds no linear shape");
  return bounds.wallA;
}

function linearRoom(overrides: Partial<DesignRoom> = {}): DesignRoom {
  return {
    shape: "linear",
    widthMm: linearWallABounds().minMm,
    depthMm: 3400,
    heightMm: ENGINE_ROOM_LIMITS.heightBounds.minMm,
    ...overrides,
  };
}

function shellOf(room: DesignRoom): Design {
  return buildLinearShellDesign({ room, occurredAt: OCCURRED_AT });
}

describe("buildLinearShellDesign — no structural placement", () => {
  it("carries zero placements, whatever the room", () => {
    fc.assert(
      fc.property(
        fc.integer({
          min: linearWallABounds().minMm,
          max: linearWallABounds().maxMm,
        }),
        (widthMm) => {
          expect(shellOf(linearRoom({ widthMm })).placements).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("buildLinearShellDesign — wall A's empty columns", () => {
  it("records every tile on wall A only, none on B", () => {
    const columns = shellOf(linearRoom()).emptyColumns ?? [];

    expect(columns.length).toBeGreaterThan(0);
    expect(columns.every((column) => column.wall === "A")).toBe(true);
  });

  it("caps every tile at MAX_EMPTY_COLUMN_WIDTH_MM (ADR 0052)", () => {
    fc.assert(
      fc.property(
        fc.integer({
          min: linearWallABounds().minMm,
          max: linearWallABounds().maxMm,
        }),
        (widthMm) => {
          const columns = shellOf(linearRoom({ widthMm })).emptyColumns ?? [];

          for (const column of columns) {
            expect(column.widthMm).toBeLessThanOrEqual(
              MAX_EMPTY_COLUMN_WIDTH_MM,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("covers [0, W - W mod 2] without gap or overlap", () => {
    fc.assert(
      fc.property(
        fc.integer({
          min: linearWallABounds().minMm,
          max: linearWallABounds().maxMm,
        }),
        (widthMm) => {
          const room = linearRoom({ widthMm });
          const columns = (shellOf(room).emptyColumns ?? [])
            .filter((column) => column.y0Mm === 0)
            .slice()
            .sort((a, b) => a.alongMm - b.alongMm);
          const reachableEndMm = widthMm - (widthMm % 2);

          expect(columns.length).toBeGreaterThan(0);
          let cursorMm = 0;
          for (const column of columns) {
            expect(column.alongMm - column.widthMm / 2).toBe(cursorMm);
            cursorMm = column.alongMm + column.widthMm / 2;
          }
          expect(cursorMm).toBe(reachableEndMm);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("finds zero findings over the sampled range", () => {
    fc.assert(
      fc.property(
        fc.integer({
          min: linearWallABounds().minMm,
          max: linearWallABounds().maxMm,
        }),
        (widthMm) => {
          const room = linearRoom({ widthMm });
          const shell = shellOf(room);
          const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(shell));

          expect(validateDesignForCatalog(shell, catalog)).toEqual([]);
          expect(wallLengthMm("B", room)).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/** The code a builder refused with, so a refusal is told from every other refusal of the same class. */
function refusalOf(build: () => Design): string {
  try {
    build();
  } catch (error) {
    if (
      error instanceof LinearShellInputError ||
      error instanceof LShellInputError
    ) {
      return `${error.name}: ${error.refusal}`;
    }
    throw error;
  }
  throw new Error("the builder refused nothing");
}

describe("buildLinearShellDesign — refuses what it must", () => {
  it("refuses an L room with ROOM_NOT_LINEAR", () => {
    expect(
      refusalOf(() =>
        buildLinearShellDesign({
          room: { shape: "L", widthMm: 3000, depthMm: 2500, heightMm: 2600 },
          occurredAt: OCCURRED_AT,
        }),
      ),
    ).toBe("LinearShellInputError: ROOM_NOT_LINEAR");
  });

  it("refuses a straight room outside the engine's linear bounds", () => {
    expect(
      refusalOf(() =>
        shellOf(linearRoom({ widthMm: linearWallABounds().minMm - 1 })),
      ),
    ).toBe("LinearShellInputError: ROOM_OUTSIDE_ENGINE_LIMITS");
  });
});

describe("buildLShellDesign — still refuses a straight room with ROOM_NOT_L", () => {
  it("throws LShellInputError, unaffected by the straight kitchen's arrival", () => {
    expect(
      refusalOf(() =>
        buildLShellDesign({ room: linearRoom(), occurredAt: OCCURRED_AT }),
      ),
    ).toBe("LShellInputError: ROOM_NOT_L");
  });
});
