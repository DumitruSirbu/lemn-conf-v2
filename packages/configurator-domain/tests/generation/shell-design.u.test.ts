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

describe("buildUShellDesign — the right corner's four placements (AC1's build-id half)", () => {
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

    expect(right.map((placement) => placement.wall).sort()).toStrictEqual(
      ["A", "C", "C", "C"].sort(),
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
