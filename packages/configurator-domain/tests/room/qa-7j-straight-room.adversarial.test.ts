// **Adversarial QA for M7 wave 7J — the straight room, the domain half.** What the slices' own suites
// assert by example is attacked here at its edges:
//
// - **A2, the approved bounds.** 1199 / 1200 / 6000 / 6001 on the *approved* policy (the slices pin
//   the engine's 1200 / 6300 and the approved literals, never the approved transitions), and one
//   maximum across every wall of every approved shape — the owner's Q-7J-1 ruling.
// - **A3, a hostile entry.** A straight entry carrying an L's wall B, a U's wall C and
//   `cornerDirection: "right"` still maps to four keys and names no second wall.
// - **A4, validator ⇔ generator** for one wall — absent from the slices' suites.
// - **D7, a hostile stored direction** through `generateKitchen`: never a mirror.

import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildLinearShellDesign,
  cornerDirectionOf,
  findOverflowingPlacementIds,
  generateKitchen,
  LinearShellInputError,
  validateRoomInput,
  type Design,
  type DesignRoom,
  type RoomInput,
  type RoomPolicy,
} from "../../src/index.js";
import { ENGINE_ROOM_LIMITS } from "../../src/room/room-policy.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import { lWallBoundsOf } from "../support/room-input.js";

const OCCURRED_AT = "2026-09-28T09:00:00.000Z";
const VALID_HEIGHT_MM = 2600;
const APPROVED_LINEAR_MIN_MM = 1200;
const APPROVED_LINEAR_MAX_MM = 6000;
const SINK_BUILD_ID = "base-sink";
const HOB_BUILD_IDS = new Set(["base-hob-oven", "base-hob-2drawer"]);

function straight(wallAMm: unknown, heightMm: unknown = VALID_HEIGHT_MM) {
  return { shape: "linear", wallAMm, heightMm } as RoomInput;
}

function approvedVerdict(wallAMm: unknown, heightMm?: unknown) {
  return validateRoomInput(straight(wallAMm, heightMm), APPROVED_ROOM_POLICY);
}

function linearRoom(widthMm: number, heightMm = VALID_HEIGHT_MM): DesignRoom {
  return { shape: "linear", widthMm, depthMm: 3400, heightMm };
}

// =================================================================================================
// A2 — the approved bounds, at their transitions.
// =================================================================================================

describe("7J-A2 — the approved straight wall is 1200–6000 mm, at both transitions", () => {
  it.each([
    [1199, { ok: false, issues: [{ field: "wallA", code: "WALL_TOO_SHORT" }] }],
    [6001, { ok: false, issues: [{ field: "wallA", code: "WALL_TOO_LONG" }] }],
  ] as const)("refuses %i mm on wall A alone", (wallAMm, expected) => {
    expect(approvedVerdict(wallAMm)).toStrictEqual(expected);
  });

  it.each([1200, 6000])("accepts %i mm", (wallAMm) => {
    expect(approvedVerdict(wallAMm).ok).toBe(true);
  });

  it.each([
    [2199, "HEIGHT_TOO_LOW"],
    [3901, "HEIGHT_TOO_HIGH"],
  ] as const)(
    "refuses a %i mm ceiling as the height's own %s",
    (heightMm, code) => {
      expect(approvedVerdict(3700, heightMm)).toStrictEqual({
        ok: false,
        issues: [{ field: "height", code }],
      });
    },
  );

  it.each([2200, 3900])("accepts a %i mm ceiling", (heightMm) => {
    expect(approvedVerdict(3700, heightMm).ok).toBe(true);
  });

  it("accepts every whole wall A exactly inside 1200–6000, swept across 0–10 000 mm", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), (wallAMm) => {
        const isInside =
          wallAMm >= APPROVED_LINEAR_MIN_MM &&
          wallAMm <= APPROVED_LINEAR_MAX_MM;

        expect(approvedVerdict(wallAMm).ok, String(wallAMm)).toBe(isInside);
      }),
      { numRuns: 1000 },
    );
  });

  it("puts no number in any issue — only a field and a code", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10, max: 12_000 }),
        fc.integer({ min: -10, max: 6000 }),
        (a, h) => {
          const verdict = approvedVerdict(a, h);
          if (verdict.ok) return;
          for (const issue of verdict.issues) {
            expect(Object.keys(issue).sort()).toEqual(["code", "field"]);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

// =================================================================================================
// A3 — a hostile straight entry.
// =================================================================================================

describe("7J-A3 — a straight entry carrying another shape's keys", () => {
  const hostileExtras = {
    wallBMm: 2400,
    wallCMm: 2400,
    cornerDirection: "right",
  };

  it("maps to exactly four keys, dropping wall B, wall C and the direction", () => {
    const input = { ...straight(3700), ...hostileExtras } as RoomInput;

    expect(validateRoomInput(input, APPROVED_ROOM_POLICY)).toStrictEqual({
      ok: true,
      room: { shape: "linear", widthMm: 3700, depthMm: 3400, heightMm: 2600 },
    });
  });

  it("names neither wall B nor wall C when the hostile extras are themselves out of range", () => {
    const input = {
      ...straight(1199, 2600),
      wallBMm: -5,
      wallCMm: Number.NaN,
      cornerDirection: "right",
    } as RoomInput;

    expect(validateRoomInput(input, APPROVED_ROOM_POLICY)).toStrictEqual({
      ok: false,
      issues: [{ field: "wallA", code: "WALL_TOO_SHORT" }],
    });
  });

  it.each([
    ["missing", undefined, "VALUE_MISSING"],
    ["a fraction", 3700.5, "VALUE_NOT_WHOLE_MILLIMETRES"],
    ["NaN", Number.NaN, "VALUE_NOT_WHOLE_MILLIMETRES"],
    ["infinite", Number.POSITIVE_INFINITY, "VALUE_NOT_WHOLE_MILLIMETRES"],
    ["zero", 0, "WALL_TOO_SHORT"],
    ["negative", -1200, "WALL_TOO_SHORT"],
  ] as const)("reports a %s wall A on wall A", (_, wallAMm, code) => {
    const verdict = approvedVerdict(wallAMm);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.issues).toEqual([{ field: "wallA", code }]);
  });
});

// =================================================================================================
// A4 — validator ⇔ generator, one wall.
// =================================================================================================

function placesSinkAndHob(room: DesignRoom): boolean {
  try {
    const result = generateKitchen({
      room,
      occurredAt: OCCURRED_AT,
      probeAt: createFakeProbeFactory(),
    });
    if (!result.ok) return false;
    const buildIds = result.design.placements.map((p) => p.body.buildId);
    return (
      buildIds.includes(SINK_BUILD_ID) &&
      buildIds.some((buildId) => HOB_BUILD_IDS.has(buildId))
    );
  } catch (error) {
    if (error instanceof LinearShellInputError) return false;
    throw error;
  }
}

function engineAccepts(widthMm: number, heightMm: number): boolean {
  return validateRoomInput(straight(widthMm, heightMm), ENGINE_ROOM_LIMITS).ok;
}

describe("7J-A4 — validation passes iff generateKitchen places a sink and a hob", () => {
  const BOUNDARY_WIDTHS_MM = [
    1199, 1200, 1201, 5999, 6000, 6001, 6299, 6300, 6301,
  ];
  const BOUNDARY_HEIGHTS_MM = [2200, 2600, 3900];

  it.each(
    BOUNDARY_WIDTHS_MM.flatMap((widthMm) =>
      BOUNDARY_HEIGHTS_MM.map((heightMm) => [widthMm, heightMm] as const),
    ),
  )("agrees at %i × %i mm", (widthMm, heightMm) => {
    expect(placesSinkAndHob(linearRoom(widthMm, heightMm))).toBe(
      engineAccepts(widthMm, heightMm),
    );
  });

  it("agrees over ≥ 200 samples of 1200–6000 × 2200–3900, and the approved policy implies both", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1200, max: 6000 }),
        fc.integer({ min: 2200, max: 3900 }),
        (widthMm, heightMm) => {
          const isApproved = validateRoomInput(
            straight(widthMm, heightMm),
            APPROVED_ROOM_POLICY,
          ).ok;
          const isPlaced = placesSinkAndHob(linearRoom(widthMm, heightMm));

          expect(isPlaced).toBe(engineAccepts(widthMm, heightMm));
          expect(isApproved).toBe(true);
          expect(isPlaced).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  // Widths across and past the engine's straight wall. Heights stay on the approved 2200–3900: below
  // 2200 the engine's own height bound (860) admits ceilings `generateKitchen` throws on for the L
  // too (measured at 8cd084b's L path: 860–1600 and 2199 all throw) — pre-7J, not this wave's.
  it("agrees across and past the engine's straight wall, at every approved ceiling", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1100, max: 6400 }),
        fc.integer({ min: 2200, max: 3900 }),
        (widthMm, heightMm) => {
          expect(
            placesSinkAndHob(linearRoom(widthMm, heightMm)),
            `${String(widthMm)} × ${String(heightMm)}`,
          ).toBe(engineAccepts(widthMm, heightMm));
        },
      ),
      { numRuns: 200 },
    );
  });
});

// =================================================================================================
// D7 / A10 — a hostile stored direction on a straight room.
// =================================================================================================

describe("7J-A10 — a straight room carrying cornerDirection: right is never mirrored", () => {
  const hostileRoom = {
    ...linearRoom(3700),
    cornerDirection: "right",
  } as DesignRoom;

  function generated(room: DesignRoom): Design {
    const result = generateKitchen({
      room,
      occurredAt: OCCURRED_AT,
      probeAt: createFakeProbeFactory(),
    });
    if (!result.ok) throw new Error("refused a valid straight room");
    return result.design;
  }

  it("composes the same kitchen as the key-less room, differing only in the room it carries", () => {
    const plain = generated(linearRoom(3700));
    const hostile = generated(hostileRoom);

    expect(hostile).toStrictEqual({ ...plain, room: hostile.room });
    expect(cornerDirectionOf(hostile.room)).toBe("left");
  });

  it("builds the same shell with or without the stored key", () => {
    const plain = buildLinearShellDesign({
      room: linearRoom(3700),
      occurredAt: OCCURRED_AT,
    });
    const hostile = buildLinearShellDesign({
      room: hostileRoom,
      occurredAt: OCCURRED_AT,
    });

    expect(hostile).toStrictEqual({ ...plain, room: hostile.room });
  });
});

// =================================================================================================
// D4 — wall B of a straight room is 0 for every consumer, not only the overflow query.
// =================================================================================================

describe("7J-A9 — a straight document's wall-B placement, through generation's own output", () => {
  it("marks every generated body that is moved onto wall B as overflowing, whatever depthMm says", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1200, max: 6000 }),
        fc.integer({ min: 1200, max: 6300 }),
        (widthMm, depthMm) => {
          const result = generateKitchen({
            room: { ...linearRoom(widthMm), depthMm },
            occurredAt: OCCURRED_AT,
            probeAt: createFakeProbeFactory(),
          });
          if (!result.ok) throw new Error("refused");
          const moved: Design = {
            ...result.design,
            placements: result.design.placements.map((placement) => ({
              ...placement,
              wall: "B" as const,
            })),
          };

          expect(new Set(findOverflowingPlacementIds(moved))).toEqual(
            new Set(moved.placements.map((placement) => placement.id)),
          );
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe("7J-A15 — a policy without the linear key still refuses a straight room as its shape alone", () => {
  it("answers SHAPE_NOT_BUILDABLE for an approved-range straight room under an L-only policy", () => {
    const lOnly: RoomPolicy = {
      ...APPROVED_ROOM_POLICY,
      buildableShapes: { L: lWallBoundsOf(APPROVED_ROOM_POLICY) },
    };

    expect(validateRoomInput(straight(3700), lOnly)).toStrictEqual({
      ok: false,
      issues: [{ field: "shape", code: "SHAPE_NOT_BUILDABLE" }],
    });
  });
});
