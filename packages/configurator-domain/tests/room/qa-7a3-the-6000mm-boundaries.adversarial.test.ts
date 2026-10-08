// Adversarial QA for M7 wave 7A3 slice S2 — the owner's 6000 mm per wall (ADR 0120 Amendment B2) at
// every edge it touches, and at every edge it must not.
//
// **What moved is two maxima, and nothing else may.** The approved-policy pin proves the six numbers;
// it cannot prove that the *verdicts* around the untouched edges are the ones the product gave before
// the wave. So the pre-7A3 policy is spelled here in full — every literal as it stood at `8b73439`,
// not derived from the current policy, so the two can disagree — and the two are compared as
// validators: identical wherever both rectangles reach, and different in exactly the two bands the
// ruling names, in exactly the way it names them.
//
// **The wire bound is asserted as numbers, on purpose, and only here.** ADR 0124 sets it at 6300 on
// both horizontal axes and 3900 high, independent of the policy (that independence is asserted
// behaviourally in `qa-7a3-the-storage-ceiling-ignores-the-policy.adversarial.test.ts`). What this
// file adds is the room a design may declare, at and one millimetre past each ceiling.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  DesignRoomSchema,
  type DesignRoom,
  type LRoomInput,
  type RoomField,
  type RoomIssueCode,
  type RoomPolicy,
  type RoomValidation,
} from "../../src/index.js";
import { validateRoom } from "../support/room-input.js";

/** `approved-room-policy.ts` at `8b73439`, the tree 7A3 was planned on, spelled in full. */
const PRE_7A3_POLICY: RoomPolicy = {
  approval: "owner-approved",
  buildableShapes: {
    L: {
      wallA: { minMm: 900, maxMm: 6300 },
      wallB: { minMm: 1000, maxMm: 5100 },
      minimumKitchen: {
        isRequired: true,
        sinkWidthMm: 600,
        hobWidthMm: 600,
        cornerReachMm: { wallA: 900, wallB: 1000 },
      },
    },
  },
  heightBounds: { minMm: 2200, maxMm: 3900 },
};

const RULED_WALL_MAX_MM = 6000;
const PRE_7A3_WALL_A_MAX_MM = 6300;
const PRE_7A3_WALL_B_MAX_MM = 5100;
const WIRE_RUN_MAX_MM = 6300;
const WIRE_HEIGHT_MAX_MM = 3900;
const ORDINARY_HEIGHT_MM = 2600;

/** How far outside each approved minimum and maximum the unchanged-region sweep reaches, so the
 *  field refusals at the untouched edges are compared as well as the acceptances. */
const OUTSIDE_THE_EDGE_MM = 50;
const COMPARISON_RUNS = 3000;
const BAND_RUNS = 500;
/** Each arm of the unchanged-region comparison must be reached this often, or it certifies nothing. */
const ARM_FLOOR = 50;

/** One measured room, typed in the order a customer types it. */
function lInput(
  wallAMm: number,
  wallBMm: number,
  heightMm = ORDINARY_HEIGHT_MM,
): LRoomInput {
  return { shape: "L", wallAMm, wallBMm, heightMm, cornerDirection: "left" };
}

function accepted(input: LRoomInput): RoomValidation {
  return {
    ok: true,
    room: {
      shape: "L",
      widthMm: input.wallAMm ?? Number.NaN,
      depthMm: input.wallBMm ?? Number.NaN,
      heightMm: input.heightMm ?? Number.NaN,
    },
  };
}

function refused(field: RoomField, code: RoomIssueCode): RoomValidation {
  return { ok: false, issues: [{ field, code }] };
}

type VerdictArm = "accepted" | "too small for the kitchen" | "a field refused";

function armOf(result: RoomValidation): VerdictArm {
  if (result.ok) return "accepted";
  return result.issues.some(
    (issue) => issue.code === "ROOM_TOO_SMALL_FOR_KITCHEN",
  )
    ? "too small for the kitchen"
    : "a field refused";
}

describe("the approved policy at every edge of the L (M7 7A3)", () => {
  it.each([
    [
      "wall A one under its minimum",
      lInput(899, 6000),
      refused("wallA", "WALL_TOO_SHORT"),
    ],
    ["wall A at its minimum", lInput(900, 6000), undefined],
    ["wall A at 6000", lInput(6000, 1000), undefined],
    ["wall A at 6001", lInput(6001, 1000), refused("wallA", "WALL_TOO_LONG")],
    [
      "wall A at the old 6300",
      lInput(6300, 1000),
      refused("wallA", "WALL_TOO_LONG"),
    ],
    [
      "wall B one under its minimum",
      lInput(6000, 999),
      refused("wallB", "WALL_TOO_SHORT"),
    ],
    ["wall B at its minimum", lInput(6000, 1000), undefined],
    ["wall B at the old 5100", lInput(6000, 5100), undefined],
    ["wall B at 5101, past the old maximum", lInput(900, 5101), undefined],
    ["wall B at 5999", lInput(6000, 5999), undefined],
    ["both walls at 6000", lInput(6000, 6000), undefined],
    ["wall B at 6001", lInput(900, 6001), refused("wallB", "WALL_TOO_LONG")],
    [
      "the height one under its minimum",
      lInput(3000, 3000, 2199),
      refused("height", "HEIGHT_TOO_LOW"),
    ],
    ["the height at its minimum", lInput(3000, 3000, 2200), undefined],
    ["the height at its maximum", lInput(3000, 3000, 3900), undefined],
    [
      "the height one over its maximum",
      lInput(3000, 3000, 3901),
      refused("height", "HEIGHT_TOO_HIGH"),
    ],
    [
      "both walls at their minima",
      lInput(900, 1000),
      refused("shape", "ROOM_TOO_SMALL_FOR_KITCHEN"),
    ],
    [
      "wall A one short of both bodies",
      lInput(2099, 1000),
      refused("shape", "ROOM_TOO_SMALL_FOR_KITCHEN"),
    ],
    ["wall A holding both bodies", lInput(2100, 1000), undefined],
    [
      "wall B one short of both bodies",
      lInput(900, 2199),
      refused("shape", "ROOM_TOO_SMALL_FOR_KITCHEN"),
    ],
    ["wall B holding both bodies", lInput(900, 2200), undefined],
    [
      "the 900 × 2160 room 7D2 could not compose",
      lInput(900, 2160),
      refused("shape", "ROOM_TOO_SMALL_FOR_KITCHEN"),
    ],
    [
      "the split one short on wall B",
      lInput(1500, 1599),
      refused("shape", "ROOM_TOO_SMALL_FOR_KITCHEN"),
    ],
    [
      "the split one short on wall A",
      lInput(1499, 1600),
      refused("shape", "ROOM_TOO_SMALL_FOR_KITCHEN"),
    ],
    ["the split exactly held", lInput(1500, 1600), undefined],
  ] as const)("judges %s", (_name, input, refusal) => {
    expect(validateRoom(input, APPROVED_ROOM_POLICY)).toStrictEqual(
      refusal ?? accepted(input),
    );
  });
});

describe("the verdicts 7A3 did not move are the verdicts the pre-7A3 policy gave", () => {
  it("agrees with the pre-7A3 policy on every room inside both rectangles, and around their untouched edges", () => {
    const arms = new Map<VerdictArm, number>();
    const walls = PRE_7A3_POLICY.buildableShapes.L;
    if (!walls) throw new Error("the pre-7A3 policy states no L");
    const nearTheMinima = fc.record({
      wallAMm: fc.integer({
        min: walls.wallA.minMm - OUTSIDE_THE_EDGE_MM,
        max: 2200,
      }),
      wallBMm: fc.integer({
        min: walls.wallB.minMm - OUTSIDE_THE_EDGE_MM,
        max: 2300,
      }),
    });
    const anywhereInBoth = fc.record({
      wallAMm: fc.integer({
        min: walls.wallA.minMm - OUTSIDE_THE_EDGE_MM,
        max: RULED_WALL_MAX_MM,
      }),
      wallBMm: fc.integer({
        min: walls.wallB.minMm - OUTSIDE_THE_EDGE_MM,
        max: PRE_7A3_WALL_B_MAX_MM,
      }),
    });
    const heights = fc.integer({
      min: PRE_7A3_POLICY.heightBounds.minMm - OUTSIDE_THE_EDGE_MM,
      max: PRE_7A3_POLICY.heightBounds.maxMm + OUTSIDE_THE_EDGE_MM,
    });

    fc.assert(
      fc.property(
        fc.oneof(nearTheMinima, anywhereInBoth),
        heights,
        ({ wallAMm, wallBMm }, heightMm) => {
          const input = lInput(wallAMm, wallBMm, heightMm);
          const before = validateRoom(input, PRE_7A3_POLICY);
          arms.set(armOf(before), (arms.get(armOf(before)) ?? 0) + 1);

          expect(validateRoom(input, APPROVED_ROOM_POLICY)).toStrictEqual(
            before,
          );
        },
      ),
      { numRuns: COMPARISON_RUNS },
    );

    expect(arms.get("accepted") ?? 0).toBeGreaterThanOrEqual(ARM_FLOOR);
    expect(arms.get("too small for the kitchen") ?? 0).toBeGreaterThanOrEqual(
      ARM_FLOOR,
    );
    expect(arms.get("a field refused") ?? 0).toBeGreaterThanOrEqual(ARM_FLOOR);
  });

  it("refuses ROOM_TOO_SMALL_FOR_KITCHEN at exactly the rooms it refused before, swept 1 mm across every transition", () => {
    const disagreements: string[] = [];
    let tooSmall = 0;
    let acceptedRooms = 0;
    const judge = (wallAMm: number, wallBMm: number): void => {
      const input = lInput(wallAMm, wallBMm);
      const before = validateRoom(input, PRE_7A3_POLICY);
      const after = validateRoom(input, APPROVED_ROOM_POLICY);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        disagreements.push(`${String(wallAMm)}x${String(wallBMm)}`);
      }
      if (armOf(after) === "too small for the kitchen") tooSmall += 1;
      if (after.ok) acceptedRooms += 1;
    };

    for (const wallBMm of [999, 1000, 1599, 1600, 2199, 2200]) {
      for (let wallAMm = 880; wallAMm <= 2150; wallAMm += 1)
        judge(wallAMm, wallBMm);
    }
    for (const wallAMm of [899, 900, 1499, 1500, 2099, 2100]) {
      for (let wallBMm = 980; wallBMm <= 2250; wallBMm += 1)
        judge(wallAMm, wallBMm);
    }

    expect(disagreements.slice(0, 5)).toEqual([]);
    expect(tooSmall).toBeGreaterThanOrEqual(ARM_FLOOR);
    expect(acceptedRooms).toBeGreaterThanOrEqual(ARM_FLOOR);
  });
});

describe("the two bands 7A3 moved, and only in the way it moved them", () => {
  const heights = fc.integer({ min: 2200, max: 3900 });

  it("accepts every room in the admitted band, which the pre-7A3 policy refused on wall B alone", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 900, max: RULED_WALL_MAX_MM }),
        fc.integer({ min: PRE_7A3_WALL_B_MAX_MM + 1, max: RULED_WALL_MAX_MM }),
        heights,
        (wallAMm, wallBMm, heightMm) => {
          const input = lInput(wallAMm, wallBMm, heightMm);

          expect(validateRoom(input, PRE_7A3_POLICY)).toStrictEqual(
            refused("wallB", "WALL_TOO_LONG"),
          );
          expect(validateRoom(input, APPROVED_ROOM_POLICY)).toStrictEqual(
            accepted(input),
          );
        },
      ),
      {
        numRuns: BAND_RUNS,
        examples: [
          [900, 5101, 2200],
          [RULED_WALL_MAX_MM, RULED_WALL_MAX_MM, 3900],
        ],
      },
    );
  });

  it("refuses every room in the withdrawn band on wall A alone, which the pre-7A3 policy accepted", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: RULED_WALL_MAX_MM + 1, max: PRE_7A3_WALL_A_MAX_MM }),
        fc.integer({ min: 1000, max: PRE_7A3_WALL_B_MAX_MM }),
        heights,
        (wallAMm, wallBMm, heightMm) => {
          const input = lInput(wallAMm, wallBMm, heightMm);

          expect(validateRoom(input, PRE_7A3_POLICY)).toStrictEqual(
            accepted(input),
          );
          expect(validateRoom(input, APPROVED_ROOM_POLICY)).toStrictEqual(
            refused("wallA", "WALL_TOO_LONG"),
          );
        },
      ),
      {
        numRuns: BAND_RUNS,
        examples: [
          [6001, 1000, 2200],
          [PRE_7A3_WALL_A_MAX_MM, PRE_7A3_WALL_B_MAX_MM, 3900],
        ],
      },
    );
  });
});

describe("DesignRoomSchema — the room a design may declare, 6300 on both runs (ADR 0124)", () => {
  /** Every axis well inside its ceiling, so one axis at a time can be taken to its edge. */
  const ORDINARY_ROOM: DesignRoom = {
    shape: "L",
    widthMm: 3000,
    depthMm: 3000,
    heightMm: ORDINARY_HEIGHT_MM,
  };
  const AXIS_CEILINGS = [
    ["widthMm", WIRE_RUN_MAX_MM],
    ["depthMm", WIRE_RUN_MAX_MM],
    ["heightMm", WIRE_HEIGHT_MAX_MM],
  ] as const;

  it("accepts the storage corner, 6300 x 6300 x 3900, which no approved room reaches", () => {
    const corner: DesignRoom = {
      shape: "L",
      widthMm: WIRE_RUN_MAX_MM,
      depthMm: WIRE_RUN_MAX_MM,
      heightMm: WIRE_HEIGHT_MAX_MM,
    };

    expect(DesignRoomSchema.safeParse(corner).success).toBe(true);
  });

  it.each([2200, 3900])(
    "accepts the approved corner, 6000 x 6000 x %d",
    (heightMm) => {
      const corner: DesignRoom = {
        shape: "L",
        widthMm: RULED_WALL_MAX_MM,
        depthMm: RULED_WALL_MAX_MM,
        heightMm,
      };

      expect(DesignRoomSchema.safeParse(corner).success).toBe(true);
    },
  );

  it.each(AXIS_CEILINGS)(
    "accepts %s at its ceiling of %d with every other axis ordinary",
    (field, ceilingMm) => {
      const room = { ...ORDINARY_ROOM, [field]: ceilingMm };

      expect(DesignRoomSchema.safeParse(room).success).toBe(true);
    },
  );

  it.each(AXIS_CEILINGS)(
    "refuses %s one millimetre past its ceiling of %d, and names only that field",
    (field, ceilingMm) => {
      const parsed = DesignRoomSchema.safeParse({
        ...ORDINARY_ROOM,
        [field]: ceilingMm + 1,
      });

      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues.map((issue) => issue.path)).toStrictEqual([
        [field],
      ]);
    },
  );
});
