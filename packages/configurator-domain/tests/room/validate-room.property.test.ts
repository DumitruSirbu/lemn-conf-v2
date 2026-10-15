// ADR 0108's rules as properties over a policy's whole range, not as a handful of rooms: the bounds
// are inclusive per field, under the engine's limits and the owner-approved policy alike (wave 7A
// criterion 1, Amendment B), the shape is judged first whatever the
// dimensions (3), the corner direction is never read (4), a valid room is exactly what was entered
// (5) and every valid room is one a design can store (6). Every run goes through `validateRoom`, so
// criterion 2's key check sees every issue produced here too.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  DesignRoomSchema,
  wallLengthMm,
  type CornerDirection,
  type EnteredMillimetres,
  type LinearRoomInput,
  type LRoomInput,
  type MillimetreBounds,
  type RoomField,
  type RoomIssueCode,
  type RoomPolicy,
  type RoomValidation,
  type URoomInput,
} from "../../src/index.js";
import { ENGINE_ROOM_LIMITS } from "../../src/room/room-policy.js";
import {
  acceptedRoom,
  engineLinearWallBounds,
  engineLWallBounds,
  lInputWithField,
  lWallBoundsOf,
  validateRoom,
  type LFieldValue,
} from "../support/room-input.js";

/** Each arm of a branching property runs at least this often (`docs/WORKFLOW.md`, a set-membership
 *  property needs a floor per arm, not only a total). */
const RUNS_PER_ARM = 200;

const SHAPE_ALONE: RoomValidation = {
  ok: false,
  issues: [{ field: "shape", code: "SHAPE_NOT_BUILDABLE" }],
};

interface MeasuredLField {
  readonly field: RoomField;
  readonly key: "wallAMm" | "wallBMm" | "heightMm";
  readonly bounds: MillimetreBounds;
  readonly tooSmall: RoomIssueCode;
  readonly tooLarge: RoomIssueCode;
}

/** The policies whose bounds are swept: the engine's own limits, and the product's policy the owner
 *  approved inside them — which is where 2199 / 2200 / 3901 on the ceiling and 999 / 1000 on wall B
 *  are exercised. */
const SWEPT_POLICIES: readonly (readonly [string, RoomPolicy])[] = [
  ["the engine's limits", ENGINE_ROOM_LIMITS],
  ["the approved policy", APPROVED_ROOM_POLICY],
];

function measuredLFieldsOf(policy: RoomPolicy): readonly MeasuredLField[] {
  const walls = lWallBoundsOf(policy);
  return [
    {
      field: "wallA",
      key: "wallAMm",
      bounds: walls.wallA,
      tooSmall: "WALL_TOO_SHORT",
      tooLarge: "WALL_TOO_LONG",
    },
    {
      field: "wallB",
      key: "wallBMm",
      bounds: walls.wallB,
      tooSmall: "WALL_TOO_SHORT",
      tooLarge: "WALL_TOO_LONG",
    },
    {
      field: "height",
      key: "heightMm",
      bounds: policy.heightBounds,
      tooSmall: "HEIGHT_TOO_LOW",
      tooLarge: "HEIGHT_TOO_HIGH",
    },
  ];
}

function withinBounds(bounds: MillimetreBounds): fc.Arbitrary<number> {
  return fc.integer({ min: bounds.minMm, max: bounds.maxMm });
}

/** Anything a length field could arrive as: missing, any integer (negative, zero, past storage), and
 *  any double — `fc.double()` draws `NaN`, `±Infinity` and `-0` among its values. */
const anyEnteredMillimetres: fc.Arbitrary<EnteredMillimetres> = fc.oneof(
  fc.constant(undefined),
  fc.integer(),
  fc.double(),
);

const anyCornerDirection = fc.constantFrom<CornerDirection>("left", "right");

const anyURoomInput: fc.Arbitrary<URoomInput> = fc.record({
  shape: fc.constant("U"),
  wallAMm: anyEnteredMillimetres,
  wallBMm: anyEnteredMillimetres,
  wallCMm: anyEnteredMillimetres,
  heightMm: anyEnteredMillimetres,
  cornerDirection: anyCornerDirection,
});

const anyLinearRoomInput: fc.Arbitrary<LinearRoomInput> = fc.record({
  shape: fc.constant("linear"),
  wallAMm: anyEnteredMillimetres,
  heightMm: anyEnteredMillimetres,
});

const validLRoomInput: fc.Arbitrary<LRoomInput> = fc.record({
  shape: fc.constant("L"),
  wallAMm: withinBounds(engineLWallBounds().wallA),
  wallBMm: withinBounds(engineLWallBounds().wallB),
  heightMm: withinBounds(ENGINE_ROOM_LIMITS.heightBounds),
  cornerDirection: anyCornerDirection,
});

const validLinearRoomInput: fc.Arbitrary<LinearRoomInput> = fc.record({
  shape: fc.constant("linear"),
  wallAMm: withinBounds(engineLinearWallBounds().wallA),
  heightMm: withinBounds(ENGINE_ROOM_LIMITS.heightBounds),
});

const anyLRoomInput: fc.Arbitrary<LRoomInput> = fc.record({
  shape: fc.constant("L"),
  wallAMm: anyEnteredMillimetres,
  wallBMm: anyEnteredMillimetres,
  heightMm: anyEnteredMillimetres,
  cornerDirection: anyCornerDirection,
});

function flipped(direction: CornerDirection): CornerDirection {
  return direction === "left" ? "right" : "left";
}

describe.each(SWEPT_POLICIES)("validateRoomInput under %s", (_name, policy) => {
  function judgedWith(fieldValue: LFieldValue): RoomValidation {
    return validateRoom(lInputWithField(fieldValue, policy), policy);
  }

  describe.each(measuredLFieldsOf(policy))(
    "bounds on $field are inclusive",
    ({ field, key, bounds, tooSmall, tooLarge }) => {
      it("accepts every sampled value inside the bounds, reporting nothing on the field", () => {
        fc.assert(
          fc.property(withinBounds(bounds), (valueMm) => {
            expect(judgedWith({ key, valueMm }).ok).toBe(true);
          }),
          { numRuns: RUNS_PER_ARM },
        );
      });

      it.each([
        ["minimum", bounds.minMm],
        ["maximum", bounds.maxMm],
      ])("accepts the %s itself", (_end, valueMm) => {
        expect(judgedWith({ key, valueMm }).ok).toBe(true);
      });

      it("reports exactly one issue, on this field, one millimetre under the minimum", () => {
        expect(judgedWith({ key, valueMm: bounds.minMm - 1 })).toEqual({
          ok: false,
          issues: [{ field, code: tooSmall }],
        });
      });

      it("reports exactly one issue, on this field, one millimetre over the maximum", () => {
        expect(judgedWith({ key, valueMm: bounds.maxMm + 1 })).toEqual({
          ok: false,
          issues: [{ field, code: tooLarge }],
        });
      });
    },
  );
});

describe("validateRoomInput — the shape is judged first, whatever the dimensions", () => {
  // ADR 0130 D2 (wave 7J S1): `ENGINE_ROOM_LIMITS` now states linear bounds, so shape-alone refusal
  // for a straight kitchen needs a policy that does not — the engine's own limits are no longer one.
  it("refuses any straight kitchen as its shape alone under a policy that states no linear bounds", () => {
    const buildsNoLinear: RoomPolicy = {
      ...ENGINE_ROOM_LIMITS,
      buildableShapes: { L: engineLWallBounds() },
    };

    fc.assert(
      fc.property(anyLinearRoomInput, (input) => {
        expect(validateRoom(input, buildsNoLinear)).toEqual(SHAPE_ALONE);
      }),
      { numRuns: RUNS_PER_ARM },
    );
  });

  // M7B U2 S2: `ENGINE_ROOM_LIMITS` now states U bounds too, so shape-alone refusal for a U needs a
  // policy that does not — `APPROVED_ROOM_POLICY` is one until the owner rules on the U (U6).
  it("refuses any U as its shape alone under a policy that states no U bounds", () => {
    const buildsNoU: RoomPolicy = {
      ...ENGINE_ROOM_LIMITS,
      buildableShapes: { L: engineLWallBounds() },
    };

    fc.assert(
      fc.property(anyURoomInput, (input) => {
        expect(validateRoom(input, buildsNoU)).toEqual(SHAPE_ALONE);
      }),
      { numRuns: RUNS_PER_ARM },
    );
  });
});

// ADR 0129 D2/D3: the direction is carried onto the room now, so "never read" is about *judgement*
// — `ok` and `issues` do not vary with it — not about the room being identical across a flip. The key
// itself is asserted only where written (D2's writer omits it for left, writes it for right).
describe("validateRoomInput — the corner direction is never read to judge a room", () => {
  it("accepts a valid L for either direction, and only a right one carries the key", () => {
    fc.assert(
      fc.property(validLRoomInput, (input) => {
        const result = validateRoom(input);
        const flippedResult = validateRoom({
          ...input,
          cornerDirection: flipped(input.cornerDirection),
        });

        expect(flippedResult.ok).toBe(result.ok);
        const room = acceptedRoom(input);
        expect("cornerDirection" in room).toBe(
          input.cornerDirection === "right",
        );
        if (input.cornerDirection === "right") {
          expect(room.cornerDirection).toBe("right");
        }
      }),
      { numRuns: RUNS_PER_ARM },
    );
  });

  it("answers any L with the same ok and issues for either direction, refused or not", () => {
    fc.assert(
      fc.property(anyLRoomInput, (input) => {
        const flippedInput = {
          ...input,
          cornerDirection: flipped(input.cornerDirection),
        };
        const result = validateRoom(input);
        const flippedResult = validateRoom(flippedInput);

        expect(flippedResult.ok).toBe(result.ok);
        if (!result.ok || !flippedResult.ok) {
          expect(flippedResult).toStrictEqual(result);
        }
      }),
      { numRuns: RUNS_PER_ARM },
    );
  });

  it("answers any U identically for either direction", () => {
    fc.assert(
      fc.property(anyURoomInput, (input) => {
        const flippedInput = {
          ...input,
          cornerDirection: flipped(input.cornerDirection),
        };

        expect(validateRoom(flippedInput)).toStrictEqual(validateRoom(input));
      }),
      { numRuns: RUNS_PER_ARM },
    );
  });
});

describe("validateRoomInput — a valid room is exactly what was entered", () => {
  it("carries the entered values unchanged, through the fit gate's own wall mapping", () => {
    fc.assert(
      fc.property(validLRoomInput, (input) => {
        const room = acceptedRoom(input);

        expect(wallLengthMm("A", room)).toBe(input.wallAMm);
        expect(wallLengthMm("B", room)).toBe(input.wallBMm);
        expect(room.heightMm).toBe(input.heightMm);
        expect(room.shape).toBe("L");
      }),
      { numRuns: RUNS_PER_ARM },
    );
  });

  it("over any input, accepts only rooms that equal what was entered and parse unchanged", () => {
    let acceptedCount = 0;
    fc.assert(
      fc.property(fc.oneof(validLRoomInput, anyLRoomInput), (input) => {
        const result = validateRoom(input);
        if (!result.ok) return;
        acceptedCount += 1;

        expect(result.room).toStrictEqual({
          shape: "L",
          widthMm: input.wallAMm,
          depthMm: input.wallBMm,
          heightMm: input.heightMm,
          ...(input.cornerDirection === "right"
            ? { cornerDirection: "right" as const }
            : {}),
        });
        expect(DesignRoomSchema.parse(result.room)).toStrictEqual(result.room);
      }),
      { numRuns: RUNS_PER_ARM * 2 },
    );

    // Half the draws come from the valid arm, so a sweep that accepted nothing checked nothing.
    expect(acceptedCount).toBeGreaterThan(0);
  });
});

// ADR 0130 D2/D3/D4/D7 (wave 7J S1, criterion A3): a straight kitchen's own mapping, swept.
describe("validateRoomInput — a valid straight kitchen is exactly four keys, fixed depth, no direction", () => {
  it("accepts every sampled wall A and height inside the engine's linear bounds", () => {
    fc.assert(
      fc.property(validLinearRoomInput, (input) => {
        expect(validateRoom(input).ok).toBe(true);
      }),
      { numRuns: RUNS_PER_ARM },
    );
  });

  it("maps to exactly four keys, wall A as the width and the fixed depth, over any integers", () => {
    let acceptedCount = 0;
    fc.assert(
      fc.property(
        fc.oneof(validLinearRoomInput, anyLinearRoomInput),
        (input) => {
          const result = validateRoom(input);
          if (!result.ok) return;
          acceptedCount += 1;

          expect(Object.keys(result.room).sort()).toEqual([
            "depthMm",
            "heightMm",
            "shape",
            "widthMm",
          ]);
          expect(result.room).toStrictEqual({
            shape: "linear",
            widthMm: input.wallAMm,
            depthMm: engineLinearWallBounds().depthMm,
            heightMm: input.heightMm,
          });
          expect(DesignRoomSchema.parse(result.room)).toStrictEqual(
            result.room,
          );
        },
      ),
      { numRuns: RUNS_PER_ARM * 2 },
    );

    expect(acceptedCount).toBeGreaterThan(0);
  });

  it("never names wallB, wallC or ROOM_TOO_SMALL_FOR_KITCHEN in a straight kitchen's issues", () => {
    fc.assert(
      fc.property(anyLinearRoomInput, (input) => {
        const result = validateRoom(input);
        if (result.ok) return;

        for (const issue of result.issues) {
          expect(["wallA", "height"]).toContain(issue.field);
          expect(issue.code).not.toBe("ROOM_TOO_SMALL_FOR_KITCHEN");
        }
      }),
      { numRuns: RUNS_PER_ARM },
    );
  });

  it("hands the fit gate back wall A as entered and wall B as 0 (D4), over any valid sample", () => {
    fc.assert(
      fc.property(validLinearRoomInput, (input) => {
        const room = acceptedRoom(input);

        expect(wallLengthMm("A", room)).toBe(input.wallAMm);
        expect(wallLengthMm("B", room)).toBe(0);
      }),
      { numRuns: RUNS_PER_ARM },
    );
  });
});
