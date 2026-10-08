// M7B U2 S2: `buildUShellDesign`'s document-level rules — named rooms, not the swept range
// (`shell-design.u.property.test.ts`'s job) — the build-id half of AC1, AC6's byte-identical L, and
// AC9's still-refused-U at both `buildLShellDesign` and `generateKitchen`.
import { describe, expect, it } from "vitest";

import {
  buildLShellDesign,
  buildUShellDesign,
  DesignSchema,
  generateKitchen,
  isUKitchenPlan,
  LShellInputError,
  UShellInputError,
  type DesignRoom,
  type UShellInputRefusal,
} from "../../src/index.js";
import { engineUWallBounds } from "../support/room-input.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const SHELL_OCCURRED_AT = "2026-09-29T12:00:00.000Z";

function engineUAtMinima(): DesignRoom {
  const walls = engineUWallBounds();
  return {
    shape: "U",
    widthMm: walls.wallA.minMm,
    depthMm: walls.wallB.minMm,
    wallCMm: walls.wallC.minMm,
    heightMm: 2600,
  };
}

function shellIn(room: DesignRoom) {
  return buildUShellDesign({ room, occurredAt: SHELL_OCCURRED_AT });
}

function refusalOf(build: () => unknown): UShellInputRefusal | undefined {
  try {
    build();
    return undefined;
  } catch (error) {
    if (error instanceof UShellInputError) return error.refusal;
    throw error;
  }
}

describe("buildUShellDesign — the document it writes", () => {
  it("passes the entered room through untouched", () => {
    const room = engineUAtMinima();

    expect(shellIn(room).room).toStrictEqual(room);
  });

  it("refuses a room that is not a U, by code", () => {
    const straight: DesignRoom = {
      ...engineUAtMinima(),
      shape: "linear",
      wallCMm: undefined,
    };

    const refusal = refusalOf(() => shellIn(straight));

    expect(refusal).toBe("ROOM_NOT_U");
  });

  it("refuses a moment that is not a timestamp, by code", () => {
    const refusal = refusalOf(() =>
      buildUShellDesign({ room: engineUAtMinima(), occurredAt: "yesterday" }),
    );

    expect(refusal).toBe("INVALID_OCCURRED_AT");
  });

  it("refuses a room outside the engine's own U limits, by code", () => {
    const tooNarrow: DesignRoom = {
      ...engineUAtMinima(),
      widthMm: engineUWallBounds().wallA.minMm - 1,
    };

    const refusal = refusalOf(() => shellIn(tooNarrow));

    expect(refusal).toBe("ROOM_OUTSIDE_ENGINE_LIMITS");
  });

  it("builds a document DesignSchema parses", () => {
    expect(DesignSchema.safeParse(shellIn(engineUAtMinima())).success).toBe(
      true,
    );
  });

  it("gives the same input a byte-identical shell", () => {
    const first = JSON.stringify(shellIn(engineUAtMinima()));
    const second = JSON.stringify(shellIn(engineUAtMinima()));

    expect(second).toBe(first);
  });
});

describe("buildUShellDesign — the right corner's six placements (AC1's build-id half)", () => {
  it("carries the same four build ids the left corner's own placements do, only relabelled", () => {
    const shell = shellIn(engineUAtMinima());
    const left = shell.placements.filter(
      (placement) => !placement.id.startsWith("right-"),
    );
    const right = shell.placements.filter((placement) =>
      placement.id.startsWith("right-"),
    );

    expect(right).toHaveLength(left.length);
    expect(
      right.map((placement) => placement.body.buildId).sort(),
    ).toStrictEqual(left.map((placement) => placement.body.buildId).sort());
  });

  it("places the right corner's X-leg on wall A and its two returns on wall C, never wall B", () => {
    const shell = shellIn(engineUAtMinima());
    const right = shell.placements.filter((placement) =>
      placement.id.startsWith("right-"),
    );

    // A, A, A, C, C, C (M7C wave C2): the X-leg and the corner wall unit's two pieces on wall A, the
    // returns on wall C. The engine minima are a small U, so the back wall is not base-only.
    expect(right.map((placement) => placement.wall).sort()).toStrictEqual(
      ["A", "A", "A", "C", "C", "C"].sort(),
    );
  });
});

describe("buildLShellDesign — still refuses a U (AC6)", () => {
  it("refuses a valid U room as ROOM_NOT_L, and touches no L behaviour", () => {
    const room = engineUAtMinima();

    expect(() =>
      buildLShellDesign({ room, occurredAt: SHELL_OCCURRED_AT }),
    ).toThrow(LShellInputError);
    try {
      buildLShellDesign({ room, occurredAt: SHELL_OCCURRED_AT });
    } catch (error) {
      expect(error).toBeInstanceOf(LShellInputError);
      expect((error as LShellInputError).refusal).toBe("ROOM_NOT_L");
    }
  });
});

describe("generateKitchen — dispatches a U to its own shell (U3b)", () => {
  it("composes a U at its engine minima instead of refusing it as it did until U3b", () => {
    const room = engineUAtMinima();

    const result = generateKitchen({
      room,
      occurredAt: SHELL_OCCURRED_AT,
      probeAt: createFakeProbeFactory(),
    });

    expect(isUKitchenPlan(result.log.plan)).toBe(true);
    expect(result.log.plan.room).toStrictEqual(room);
  });
});

// ADR 0110 Amendment B2: a tile's depth is read off a neutral source, and which source is the tile's
// row — `base-cabinet` on the floor, `wall-cabinet` on a wall-only strip. Only a large U records a
// wall-only strip at all (its back wall is base-only, so nothing stands over either corner's base on
// wall A), so an L sweep cannot hold the second source. What the source then does to the strip's depth
// on a depth change is `shell-design.test.ts`'s "in a 700 mm kitchen…" row; what is held here is the
// recorded source itself, which that row cannot see at the shell's own depth.
describe("buildUShellDesign — a large U's wall-only strips are recorded against the wall cabinet", () => {
  const LARGE_U: DesignRoom = {
    shape: "U",
    widthMm: 4000,
    depthMm: 3600,
    wallCMm: 3600,
    heightMm: 2600,
  };
  /** One millimetre under the 10 000 mm entered total at which a U's back wall becomes base-only. */
  const ALMOST_LARGE_U: DesignRoom = {
    shape: "U",
    widthMm: 3600,
    depthMm: 3200,
    wallCMm: 3199,
    heightMm: 2600,
  };

  function tilesOf(room: DesignRoom) {
    const tiles = shellIn(room).emptyColumns ?? [];
    return {
      floor: tiles.filter((tile) => tile.y0Mm === 0),
      wallOnly: tiles.filter((tile) => tile.y0Mm !== 0),
    };
  }

  it("records four strips over the two corners on wall A, each against wall-cabinet at its depth", () => {
    expect(
      tilesOf(LARGE_U).wallOnly.map((tile) => [
        tile.wall,
        tile.alongMm,
        tile.widthMm,
        tile.depthFromBuildId,
        tile.depthMm,
      ]),
    ).toStrictEqual([
      ["A", 400, 800, "wall-cabinet", 330],
      ["A", 850, 100, "wall-cabinet", 330],
      ["A", 3500, 800, "wall-cabinet", 330],
      ["A", 3950, 100, "wall-cabinet", 330],
    ]);
  });

  it("records its eleven floor tiles against base-cabinet at its depth", () => {
    const floor = tilesOf(LARGE_U).floor;

    expect(floor).toHaveLength(11);
    expect([
      ...new Set(
        floor.map(
          (tile) =>
            `${String(tile.depthFromBuildId)} at ${String(tile.depthMm)}`,
        ),
      ),
    ]).toStrictEqual(["base-cabinet at 620"]);
  });

  it("records no wall-only strip one millimetre under the large-U total", () => {
    const tiles = tilesOf(ALMOST_LARGE_U);

    expect(tiles.wallOnly).toStrictEqual([]);
    expect(tiles.floor.length).toBeGreaterThan(0);
  });
});
