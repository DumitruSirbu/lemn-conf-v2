// Wave 7A adversarial QA — ADR 0108 attacked from outside the implementer's own fixtures.
//
// The implementer's suites judge the engine's limits with inputs read off the engine's limits, so a
// validator that quietly consulted `ENGINE_ROOM_LIMITS` instead of its argument would pass them all.
// Here every policy is **written out as numbers that disagree with the engine's**, or drawn at
// random, and each verdict is compared with an oracle written from the punch list's words rather than
// from the validator's code. The runtime values a form could hand over past the type — `null`, a
// string, a boxed number — are fed in as well, because the web calls this from form state.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fc } from "@fast-check/vitest";
import { describe, expect, it, vi } from "vitest";

import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import type { Design } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  APPROVED_ROOM_POLICY,
  DesignRoomSchema,
  MAX_ROOM_DEPTH_MM,
  MAX_ROOM_HEIGHT_MM,
  MAX_ROOM_WIDTH_MM,
  validateRoomInput,
  type DesignRoom,
  type DesignWall,
  type LRoomInput,
  type MillimetreBounds,
  type RoomField,
  type RoomInput,
  type RoomIssue,
  type RoomIssueCode,
  type RoomPolicy,
  type RoomValidation,
} from "../../src/index.js";
import { ENGINE_ROOM_LIMITS } from "../../src/room/room-policy.js";
import { declaredCabinetDepthsMm } from "../../src/worktop-depth.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const SOURCE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "src",
);

const RUNS = 500;

const ROOM_FIELDS: readonly RoomField[] = [
  "shape",
  "wallA",
  "wallB",
  "wallC",
  "height",
];

const ROOM_ISSUE_CODES: readonly RoomIssueCode[] = [
  "SHAPE_NOT_BUILDABLE",
  "ROOM_TOO_SMALL_FOR_KITCHEN",
  "VALUE_MISSING",
  "VALUE_NOT_WHOLE_MILLIMETRES",
  "WALL_TOO_SHORT",
  "WALL_TOO_LONG",
  "HEIGHT_TOO_LOW",
  "HEIGHT_TOO_HIGH",
];

/** Keeps wave 7A's arbitrary-policy tests focused on independent field bounds. The 7A2 suites use
 *  the engine and approved generated-kitchen policies, whose dimensions are independently guarded. */
const PERMISSIVE_MINIMUM_KITCHEN = {
  isRequired: false,
  sinkWidthMm: 1,
  hobWidthMm: 1,
  cornerReachMm: { wallA: 0, wallB: 0 },
} as const;

const SHAPE_ALONE: RoomValidation = {
  ok: false,
  issues: [{ field: "shape", code: "SHAPE_NOT_BUILDABLE" }],
};

/** A policy the owner might approve, **deliberately disagreeing with the engine's limits on every
 *  bound** — every minimum above them and every maximum below them — so a validator reading the
 *  engine's constant instead of its argument answers differently here. */
const NARROWER_OWNER_POLICY: RoomPolicy = {
  approval: "owner-approved",
  buildableShapes: {
    L: {
      wallA: { minMm: 1200, maxMm: 4000 },
      wallB: { minMm: 1100, maxMm: 3000 },
      minimumKitchen: PERMISSIVE_MINIMUM_KITCHEN,
    },
  },
  heightBounds: { minMm: 2100, maxMm: 2900 },
};

/** Every minimum below the engine's: accepts rooms the engine's limits refuse. */
const WIDER_OWNER_POLICY: RoomPolicy = {
  approval: "owner-approved",
  buildableShapes: {
    L: {
      wallA: { minMm: 300, maxMm: 6300 },
      wallB: { minMm: 300, maxMm: 5100 },
      minimumKitchen: PERMISSIVE_MINIMUM_KITCHEN,
    },
  },
  heightBounds: { minMm: 500, maxMm: 3900 },
};

const BUILDS_NOTHING: RoomPolicy = {
  approval: "owner-approved",
  buildableShapes: {},
  heightBounds: { minMm: 1, maxMm: MAX_ROOM_HEIGHT_MM },
};

/** The validator, with the whole-result shape checked on every call: a refusal is exactly
 *  `{ ok, issues }`, an acceptance exactly `{ ok, room }`, and every issue exactly `{ field, code }`
 *  with both drawn from the published enums and **no digit anywhere in what a surface is handed**. */
function judge(input: unknown, policy: RoomPolicy): RoomValidation {
  const result = validateRoomInput(input as RoomInput, policy);
  if (result.ok) {
    expect(Reflect.ownKeys(result).sort()).toEqual(["ok", "room"]);
    expect(Reflect.ownKeys(result.room).sort()).toEqual([
      "depthMm",
      "heightMm",
      "shape",
      "widthMm",
    ]);
  } else {
    expect(Reflect.ownKeys(result).sort()).toEqual(["issues", "ok"]);
    expect(result.issues.length).toBeGreaterThan(0);
    result.issues.forEach(expectBareIssue);
    expect(JSON.stringify(result.issues)).not.toMatch(/\d/);
  }
  return result;
}

function expectBareIssue(issue: RoomIssue): void {
  expect(Reflect.ownKeys(issue).sort()).toEqual(["code", "field"]);
  expect(ROOM_FIELDS).toContain(issue.field);
  expect(ROOM_ISSUE_CODES).toContain(issue.code);
}

function lWalls(
  policy: RoomPolicy,
): NonNullable<RoomPolicy["buildableShapes"]["L"]> {
  const walls = policy.buildableShapes.L;
  if (walls === undefined) throw new Error("the policy states no L walls");
  return walls;
}

function lInput(
  wallAMm: unknown,
  wallBMm: unknown,
  heightMm: unknown,
): LRoomInput {
  return {
    shape: "L",
    wallAMm,
    wallBMm,
    heightMm,
    cornerDirection: "left",
  } as LRoomInput;
}

/** `policy`'s bounds on the L's measured fields, in field order: wall A, wall B, height. */
function lFieldBoundsOf(policy: RoomPolicy): readonly MillimetreBounds[] {
  const walls = lWalls(policy);
  return [walls.wallA, walls.wallB, policy.heightBounds];
}

/** An L at `policy`'s field minima, unless its product rule also requires the generated minimum. */
function lInputAtMinimaOf(policy: RoomPolicy): LRoomInput {
  const room = roomAtMinimaOf(policy);
  return lInput(room.widthMm, room.depthMm, room.heightMm);
}

/** The room `lInputAtMinimaOf(policy)` maps onto: wall A is its width, wall B its depth (ADR 0108
 *  decision 8). Deriving it from numeric policy data keeps the expected room statically numeric. */
function roomAtMinimaOf(policy: RoomPolicy): DesignRoom {
  const walls = lWalls(policy);
  const minimum = walls.minimumKitchen;
  return {
    shape: "L",
    widthMm: minimum.isRequired
      ? Math.max(
          walls.wallA.minMm,
          minimum.cornerReachMm.wallA +
            minimum.sinkWidthMm +
            minimum.hobWidthMm,
        )
      : walls.wallA.minMm,
    depthMm: walls.wallB.minMm,
    heightMm: policy.heightBounds.minMm,
  };
}

/** An L one millimetre past `policy`'s maximum on every field. */
function lInputPastMaximaOf(policy: RoomPolicy): LRoomInput {
  const [wallA, wallB, height] = lFieldBoundsOf(policy).map(
    ({ maxMm }) => maxMm + 1,
  );
  return lInput(wallA, wallB, height);
}

// -------------------------------------------------------------------------------------------------
// The oracle: the punch list's words, not the validator's code.
// -------------------------------------------------------------------------------------------------

interface FieldOracle {
  readonly field: RoomField;
  readonly tooSmall: RoomIssueCode;
  readonly tooLarge: RoomIssueCode;
}

const WALL_A: FieldOracle = {
  field: "wallA",
  tooSmall: "WALL_TOO_SHORT",
  tooLarge: "WALL_TOO_LONG",
};
const WALL_B: FieldOracle = {
  field: "wallB",
  tooSmall: "WALL_TOO_SHORT",
  tooLarge: "WALL_TOO_LONG",
};
const HEIGHT: FieldOracle = {
  field: "height",
  tooSmall: "HEIGHT_TOO_LOW",
  tooLarge: "HEIGHT_TOO_HIGH",
};

/** An empty field is missing; a length that is not a whole number of millimetres is refused as such
 *  (never rounded); a whole one is judged against the inclusive bounds. */
function expectedIssue(
  valueMm: number | undefined,
  bounds: MillimetreBounds,
  oracle: FieldOracle,
): RoomIssue[] {
  const refused = (code: RoomIssueCode): RoomIssue[] => [
    { field: oracle.field, code },
  ];
  if (valueMm === undefined) return refused("VALUE_MISSING");
  if (!Number.isInteger(valueMm)) return refused("VALUE_NOT_WHOLE_MILLIMETRES");
  if (valueMm < bounds.minMm) return refused(oracle.tooSmall);
  if (valueMm > bounds.maxMm) return refused(oracle.tooLarge);
  return [];
}

function expectedLValidation(
  input: {
    readonly wallAMm: number | undefined;
    readonly wallBMm: number | undefined;
    readonly heightMm: number | undefined;
  },
  policy: RoomPolicy,
): RoomValidation {
  const walls = lWalls(policy);
  const { wallAMm, wallBMm, heightMm } = input;
  const issues = [
    ...expectedIssue(wallAMm, walls.wallA, WALL_A),
    ...expectedIssue(wallBMm, walls.wallB, WALL_B),
    ...expectedIssue(heightMm, policy.heightBounds, HEIGHT),
  ];
  // A missing value always carries an issue, so the second half only narrows the types.
  if (
    issues.length > 0 ||
    wallAMm === undefined ||
    wallBMm === undefined ||
    heightMm === undefined
  ) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    room: { shape: "L", widthMm: wallAMm, depthMm: wallBMm, heightMm },
  };
}

// -------------------------------------------------------------------------------------------------
// Generators.
// -------------------------------------------------------------------------------------------------

/** Legal bounds for one axis: whole, positive, ordered, and at or below that axis's wire bound
 *  (ADR 0108 decision 7). */
function legalBounds(wireMaximumMm: number): fc.Arbitrary<MillimetreBounds> {
  return fc
    .tuple(
      fc.integer({ min: 1, max: wireMaximumMm }),
      fc.integer({ min: 1, max: wireMaximumMm }),
    )
    .map(([first, second]) => ({
      minMm: Math.min(first, second),
      maxMm: Math.max(first, second),
    }));
}

const legalLPolicy: fc.Arbitrary<RoomPolicy> = fc.record({
  approval: fc.constantFrom("interim-unapproved", "owner-approved"),
  buildableShapes: fc.record({
    L: fc.record({
      wallA: legalBounds(MAX_ROOM_WIDTH_MM),
      wallB: legalBounds(MAX_ROOM_DEPTH_MM),
      minimumKitchen: fc.constant(PERMISSIVE_MINIMUM_KITCHEN),
    }),
  }),
  heightBounds: legalBounds(MAX_ROOM_HEIGHT_MM),
});

/** A value aimed at `bounds`' two transitions as often as anywhere else, plus the non-whole values. */
function valueNear(bounds: MillimetreBounds): fc.Arbitrary<number | undefined> {
  return fc.oneof(
    fc.constantFrom(
      bounds.minMm - 1,
      bounds.minMm,
      bounds.maxMm,
      bounds.maxMm + 1,
      undefined,
      0,
      -0,
      NaN,
      Infinity,
      -Infinity,
      bounds.minMm - 0.5,
      bounds.maxMm + 0.5,
    ),
    fc.integer({ min: bounds.minMm - 10, max: bounds.maxMm + 10 }),
    fc.integer(),
    fc.double(),
  );
}

const policyAndLInput = legalLPolicy.chain((policy) => {
  const walls = lWalls(policy);
  return fc.record({
    policy: fc.constant(policy),
    shape: fc.constant("L" as const),
    wallAMm: valueNear(walls.wallA),
    wallBMm: valueNear(walls.wallB),
    heightMm: valueNear(policy.heightBounds),
    cornerDirection: fc.constantFrom("left" as const, "right" as const),
  });
});

const policyAndAcceptableLInput = legalLPolicy.chain((policy) => {
  const walls = lWalls(policy);
  const within = ({ minMm, maxMm }: MillimetreBounds) =>
    fc.integer({ min: minMm, max: maxMm });
  return fc.record({
    policy: fc.constant(policy),
    shape: fc.constant("L" as const),
    wallAMm: within(walls.wallA),
    wallBMm: within(walls.wallB),
    heightMm: within(policy.heightBounds),
    cornerDirection: fc.constantFrom("left" as const, "right" as const),
  });
});

/** What form state could carry past the type: anything at all. */
const anyValue: fc.Arbitrary<unknown> = fc.oneof(
  fc.anything(),
  fc.constantFrom(null, "3600", "", true, 3600n, [3600], new Number(3600)),
);

// =================================================================================================
// The policy is the parameter.
// =================================================================================================

describe("validateRoomInput reads the policy it is handed, not the engine's constant", () => {
  // The three cases below lean on these fixtures disagreeing with the engine in a stated direction; if
  // an engine limit moves past one, this fails first and names the stale fixture.
  it("uses fixtures that disagree with the engine's limits on every bound, in the stated direction", () => {
    const engine = lFieldBoundsOf(ENGINE_ROOM_LIMITS);
    const narrower = lFieldBoundsOf(NARROWER_OWNER_POLICY);
    const wider = lFieldBoundsOf(WIDER_OWNER_POLICY);

    engine.forEach(({ minMm, maxMm }, field) => {
      expect(narrower[field]?.minMm).toBeGreaterThan(minMm);
      expect(narrower[field]?.maxMm).toBeLessThan(maxMm);
      expect(wider[field]?.minMm).toBeLessThan(minMm);
    });
  });

  it("refuses under a narrower owner policy the room the engine's limits accept, on every field", () => {
    const input = lInputAtMinimaOf(ENGINE_ROOM_LIMITS);

    expect(judge(input, ENGINE_ROOM_LIMITS).ok).toBe(true);
    expect(judge(input, NARROWER_OWNER_POLICY)).toEqual({
      ok: false,
      issues: [
        { field: "wallA", code: "WALL_TOO_SHORT" },
        { field: "wallB", code: "WALL_TOO_SHORT" },
        { field: "height", code: "HEIGHT_TOO_LOW" },
      ],
    });
  });

  it("refuses above a narrower owner policy's maxima what the engine's limits accept", () => {
    const input = lInputPastMaximaOf(NARROWER_OWNER_POLICY);

    expect(judge(input, ENGINE_ROOM_LIMITS).ok).toBe(true);
    expect(judge(input, NARROWER_OWNER_POLICY)).toEqual({
      ok: false,
      issues: [
        { field: "wallA", code: "WALL_TOO_LONG" },
        { field: "wallB", code: "WALL_TOO_LONG" },
        { field: "height", code: "HEIGHT_TOO_HIGH" },
      ],
    });
  });

  it("accepts under a wider owner policy the room the engine's limits refuse", () => {
    const input = lInputAtMinimaOf(WIDER_OWNER_POLICY);

    expect(judge(input, ENGINE_ROOM_LIMITS).ok).toBe(false);
    expect(judge(input, WIDER_OWNER_POLICY)).toEqual({
      ok: true,
      room: roomAtMinimaOf(WIDER_OWNER_POLICY),
    });
  });

  it("judges wall A against wall A's bounds and wall B against wall B's, never crosswise", () => {
    const disjoint: RoomPolicy = {
      approval: "owner-approved",
      buildableShapes: {
        L: {
          wallA: { minMm: 1000, maxMm: 2000 },
          wallB: { minMm: 3000, maxMm: 4000 },
          minimumKitchen: PERMISSIVE_MINIMUM_KITCHEN,
        },
      },
      heightBounds: { minMm: 2000, maxMm: 3000 },
    };

    expect(judge(lInput(1500, 3500, 2500), disjoint).ok).toBe(true);
    expect(judge(lInput(3500, 1500, 2500), disjoint)).toEqual({
      ok: false,
      issues: [
        { field: "wallA", code: "WALL_TOO_LONG" },
        { field: "wallB", code: "WALL_TOO_SHORT" },
      ],
    });
  });

  it("gives every verdict the policy's, over random legal policies and values at their transitions", () => {
    const verdicts = { accepted: 0, refused: 0 };
    fc.assert(
      fc.property(
        fc.oneof(policyAndAcceptableLInput, policyAndLInput),
        ({ policy, ...input }) => {
          const result = judge(input, policy);
          verdicts[result.ok ? "accepted" : "refused"] += 1;

          expect(result).toStrictEqual(expectedLValidation(input, policy));
        },
      ),
      { numRuns: RUNS * 4 },
    );

    expect(verdicts.accepted).toBeGreaterThan(RUNS);
    expect(verdicts.refused).toBeGreaterThan(RUNS);
  });

  it("gives the same verdict whether the policy is interim-unapproved or owner-approved", () => {
    fc.assert(
      fc.property(policyAndLInput, ({ policy, ...input }) => {
        const interim = judge(input, {
          ...policy,
          approval: "interim-unapproved",
        });
        const approved = judge(input, {
          ...policy,
          approval: "owner-approved",
        });

        expect(approved).toStrictEqual(interim);
      }),
      { numRuns: RUNS },
    );
  });

  it("accepts under any legal policy only rooms DesignRoomSchema parses unchanged", () => {
    let acceptedCount = 0;
    fc.assert(
      fc.property(
        fc.oneof(policyAndAcceptableLInput, policyAndLInput),
        ({ policy, ...input }) => {
          const result = judge(input, policy);
          if (!result.ok) return;
          acceptedCount += 1;

          expect(DesignRoomSchema.parse(result.room)).toStrictEqual(
            result.room,
          );
        },
      ),
      { numRuns: RUNS * 2 },
    );

    // Half the draws are acceptable by construction, so a sweep accepting few checked little.
    expect(acceptedCount).toBeGreaterThan(RUNS / 2);
  });
});

// =================================================================================================
// Shape first and alone.
// =================================================================================================

describe("validateRoomInput judges the shape first and alone", () => {
  it("refuses any L under a policy that builds no shape, whatever its dimensions", () => {
    fc.assert(
      fc.property(
        anyValue,
        anyValue,
        anyValue,
        (wallAMm, wallBMm, heightMm) => {
          expect(
            judge(lInput(wallAMm, wallBMm, heightMm), BUILDS_NOTHING),
          ).toEqual(SHAPE_ALONE);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("refuses a U or a straight kitchen alone under any legal policy, with any values at all", () => {
    fc.assert(
      fc.property(
        legalLPolicy,
        fc.constantFrom("U", "linear"),
        fc.dictionary(
          fc.constantFrom(
            "wallAMm",
            "wallBMm",
            "wallCMm",
            "heightMm",
            "cornerDirection",
          ),
          anyValue,
        ),
        (policy, shape, dimensions) => {
          expect(judge({ ...dimensions, shape }, policy)).toEqual(SHAPE_ALONE);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it.each([
    ["l"],
    [""],
    [" L"],
    ["L "],
    ["LL"],
    ["u"],
    ["Linear"],
    [undefined],
    [null],
    [0],
  ])("refuses a shape tag of %j alone even with valid L walls", (shape) => {
    const input = { ...lInputAtMinimaOf(ENGINE_ROOM_LIMITS), shape };

    expect(judge(input, ENGINE_ROOM_LIMITS)).toEqual(SHAPE_ALONE);
  });
});

// =================================================================================================
// Every field, in field order — and only the L's fields.
// =================================================================================================

describe("validateRoomInput judges every field of an L, in field order, and no other field", () => {
  it("never reports wall C for an L, whatever an extra wallCMm key holds", () => {
    fc.assert(
      fc.property(anyValue, (wallCMm) => {
        const valid = lInputAtMinimaOf(ENGINE_ROOM_LIMITS);

        expect(judge({ ...valid, wallCMm }, ENGINE_ROOM_LIMITS)).toEqual({
          ok: true,
          room: roomAtMinimaOf(ENGINE_ROOM_LIMITS),
        });
      }),
      { numRuns: RUNS },
    );
  });

  it("reports each refused field once, in wall A, wall B, height order", () => {
    fc.assert(
      fc.property(policyAndLInput, ({ policy, ...input }) => {
        const result = judge(input, policy);
        if (result.ok) return;
        const fields = result.issues.map(({ field }) => field);

        expect(fields).toEqual(
          ["wallA", "wallB", "height"].filter((field) =>
            fields.includes(field as RoomField),
          ),
        );
      }),
      { numRuns: RUNS },
    );
  });
});

// =================================================================================================
// A typed boundary the web crosses with form state.
// =================================================================================================

describe("validateRoomInput refuses a value that is not a number rather than coercing it", () => {
  it.each([
    ["null", null],
    ["a numeric string", "3600"],
    ["an empty string", ""],
    ["true", true],
    ["a bigint", 3600n],
    ["a one-element array", [3600]],
    ["a boxed number", new Number(3600)],
    ["an object with a numeric valueOf", { valueOf: () => 3600 }],
  ])("refuses %s on every measured field", (_label, value) => {
    for (const [index, oracle] of [WALL_A, WALL_B, HEIGHT].entries()) {
      const values: unknown[] = lFieldBoundsOf(ENGINE_ROOM_LIMITS).map(
        ({ minMm }) => minMm,
      );
      values[index] = value;

      const result = judge(
        lInput(values[0], values[1], values[2]),
        ENGINE_ROOM_LIMITS,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]?.field).toBe(oracle.field);
      expect(["VALUE_MISSING", "VALUE_NOT_WHOLE_MILLIMETRES"]).toContain(
        result.issues[0]?.code,
      );
    }
  });

  it("accepts only numbers, and hands them back identically, whatever arrives in the fields", () => {
    const walls = lWalls(ENGINE_ROOM_LIMITS);
    const anythingOrWithin = ({ minMm, maxMm }: MillimetreBounds) =>
      fc.oneof(anyValue, fc.integer({ min: minMm, max: maxMm }));
    fc.assert(
      fc.property(
        anythingOrWithin(walls.wallA),
        anythingOrWithin(walls.wallB),
        anythingOrWithin(ENGINE_ROOM_LIMITS.heightBounds),
        (wallAMm, wallBMm, heightMm) => {
          const result = judge(
            lInput(wallAMm, wallBMm, heightMm),
            ENGINE_ROOM_LIMITS,
          );
          if (!result.ok) return;

          for (const [entered, stored] of [
            [wallAMm, result.room.widthMm],
            [wallBMm, result.room.depthMm],
            [heightMm, result.room.heightMm],
          ] as const) {
            expect(Number.isSafeInteger(stored)).toBe(true);
            expect(Object.is(stored, entered)).toBe(true);
          }
        },
      ),
      { numRuns: RUNS },
    );
  });
});

// =================================================================================================
// Whole millimetres or refused, at the floating-point edges.
// =================================================================================================

describe("validateRoomInput never rounds, at the edges of floating point", () => {
  it.each([
    [899.9999999999999, "VALUE_NOT_WHOLE_MILLIMETRES"],
    [900.0000000000001, "VALUE_NOT_WHOLE_MILLIMETRES"],
    [3600.5, "VALUE_NOT_WHOLE_MILLIMETRES"],
    [Number.EPSILON, "VALUE_NOT_WHOLE_MILLIMETRES"],
    [Number.MIN_VALUE, "VALUE_NOT_WHOLE_MILLIMETRES"],
    [-0.5, "VALUE_NOT_WHOLE_MILLIMETRES"],
    [-0, "WALL_TOO_SHORT"],
    [-Number.MAX_SAFE_INTEGER, "WALL_TOO_SHORT"],
    [Number.MAX_SAFE_INTEGER + 1, "WALL_TOO_LONG"],
    [2 ** 53 + 2, "WALL_TOO_LONG"],
    [1e21, "WALL_TOO_LONG"],
    [Number.MAX_VALUE, "WALL_TOO_LONG"],
  ] as const)("refuses wall A = %s as %s", (valueMm, code) => {
    const valid = lInputAtMinimaOf(ENGINE_ROOM_LIMITS);

    expect(judge({ ...valid, wallAMm: valueMm }, ENGINE_ROOM_LIMITS)).toEqual({
      ok: false,
      issues: [{ field: "wallA", code }],
    });
  });

  it("never stores -0 or a fraction, even under a policy whose floor is 1 mm", () => {
    const floorOfOne: RoomPolicy = {
      approval: "owner-approved",
      buildableShapes: {
        L: {
          wallA: { minMm: 1, maxMm: 10 },
          wallB: { minMm: 1, maxMm: 10 },
          minimumKitchen: PERMISSIVE_MINIMUM_KITCHEN,
        },
      },
      heightBounds: { minMm: 1, maxMm: 10 },
    };

    for (const valueMm of [-0, 0, 0.5, 1 - Number.EPSILON]) {
      expect(judge(lInput(valueMm, 1, 1), floorOfOne).ok).toBe(false);
    }
    expect(judge(lInput(1, 1, 1), floorOfOne)).toEqual({
      ok: true,
      room: { shape: "L", widthMm: 1, depthMm: 1, heightMm: 1 },
    });
  });
});

// =================================================================================================
// The direction is carried and never read.
// =================================================================================================

describe("validateRoomInput never reads the corner direction", () => {
  it("answers identically whatever the direction holds, including nothing and nonsense", () => {
    fc.assert(
      fc.property(
        policyAndLInput,
        anyValue,
        ({ policy, ...input }, direction) => {
          const reference = judge(
            { ...input, cornerDirection: "left" },
            policy,
          );
          const withoutDirection = { ...input };
          Reflect.deleteProperty(withoutDirection, "cornerDirection");

          expect(
            judge({ ...input, cornerDirection: direction }, policy),
          ).toStrictEqual(reference);
          expect(judge(withoutDirection, policy)).toStrictEqual(reference);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("builds a room of exactly four keys however many extra keys the input carries", () => {
    const valid = lInputAtMinimaOf(ENGINE_ROOM_LIMITS);
    const input = {
      ...valid,
      cornerDirection: "right",
      direction: "right",
      mirrored: true,
      wallCMm: 1200,
      depthSetting: 700,
    };

    expect(judge(input, ENGINE_ROOM_LIMITS)).toStrictEqual({
      ok: true,
      room: roomAtMinimaOf(ENGINE_ROOM_LIMITS),
    });
  });
});

// =================================================================================================
// Pure.
// =================================================================================================

describe("validateRoomInput is pure", () => {
  function deepFrozen<T>(value: T): T {
    if (typeof value === "object" && value !== null) {
      Object.values(value).forEach(deepFrozen);
      Object.freeze(value);
    }
    return value;
  }

  it("reads a frozen input and a frozen policy without writing to either", () => {
    const policy = deepFrozen(structuredClone(NARROWER_OWNER_POLICY));
    const input = deepFrozen(lInput(undefined, 1.5, 9999));

    expect(() => validateRoomInput(input, policy)).not.toThrow();
    expect(judge(input, policy)).toStrictEqual(judge(input, policy));
  });

  it("hands out a fresh refusal each call, so a caller editing one cannot change the next", () => {
    const input = { ...lInputAtMinimaOf(ENGINE_ROOM_LIMITS), shape: "U" };
    const first = judge(input, ENGINE_ROOM_LIMITS);
    if (first.ok) throw new Error("a U must be refused");

    (first.issues as RoomIssue[]).push({
      field: "wallA",
      code: "VALUE_MISSING",
    });
    Object.assign(first.issues[0] as object, { minMm: 900 });

    expect(judge(input, ENGINE_ROOM_LIMITS)).toStrictEqual(SHAPE_ALONE);
  });
});

// =================================================================================================
// The engine's limits — honest, whole, and loadable in any order.
// =================================================================================================

/** Source text with comments and string literals blanked, so what is left is code. */
function codeOf(relativePath: string): string {
  return readFileSync(path.join(SOURCE, relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/`[^`]*`|"[^"\n]*"/g, '""');
}

describe("ENGINE_ROOM_LIMITS — no bound is written as a number", () => {
  // The implementer's drift test compares each bound with its source, so a hand-edit to a number the
  // source does *not* yield turns red. A hand-edit to the number it *does* yield today — `minMm: 900`
  // — passes that test and is exactly ADR 0108 decision 6's "never written as a literal". Only the
  // module's text can tell the two apart. `0`, `1` and `2` are `LEVELS[0]`, the level's top `[1]`,
  // an empty-list check and the half-width; anything else is a chosen number.
  it("room-policy.ts contains no numeric literal but the indices 0 and 1 and the half-width 2", () => {
    const numericLiterals =
      codeOf("room/room-policy.ts").match(/(?<![\w.])\d[\d_.eE]*/g) ?? [];

    expect(
      numericLiterals.filter((literal) => !["0", "1", "2"].includes(literal)),
    ).toEqual([]);
  });
});

describe("ENGINE_ROOM_LIMITS — every bound is a whole millimetre", () => {
  it("states each of its six bounds as a safe integer", () => {
    const walls = lWalls(ENGINE_ROOM_LIMITS);
    const bounds = [
      walls.wallA,
      walls.wallB,
      ENGINE_ROOM_LIMITS.heightBounds,
    ].flatMap(({ minMm, maxMm }) => [minMm, maxMm]);

    expect(bounds.every((valueMm) => Number.isSafeInteger(valueMm))).toBe(true);
  });

  it("derives the same bounds when room-policy.ts is the first module the process loads", async () => {
    vi.resetModules();
    const firstLoaded = await import("../../src/room/room-policy.js");

    expect(firstLoaded.ENGINE_ROOM_LIMITS).toStrictEqual(ENGINE_ROOM_LIMITS);
  });
});

describe("ENGINE_ROOM_LIMITS — a wall at its minimum holds its own corner at every offered depth", () => {
  // ADR 0108 decision 6 derives each L wall minimum from where the reference kitchen's structural
  // corner ends, "so a wall shorter than this cannot hold its own corner" — measured on
  // `KITCHEN_L_DESIGN`, which stands at one cabinet depth. The depth setting moves wall B's run
  // (`along-wall-chain-shift.ts`: the corner's reach into wall B follows the base carcass), and ADR
  // 0083 decision 1 already holds the demo room to clearing its run at **both** offered depths. A
  // minimum is only "what the engine can build at all" if it holds the corner at every depth the
  // customer can then choose.
  const OCCURRED_AT = "2026-09-11T10:00:00.000Z";

  function atCabinetDepth(cabinetDepthMm: number): Design {
    const result = setCabinetDepth({
      design: KITCHEN_L_DESIGN,
      catalogAt: buildKitchenLBodyCatalog,
      cabinetDepthMm,
      probeAt: createFakeProbeFactory(),
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) {
      throw new Error(
        `refused ${String(cabinetDepthMm)}: ${result.reason.code}`,
      );
    }
    return result.design;
  }

  function farthestStructuralCornerEdgeMm(
    design: Design,
    wall: DesignWall,
  ): number {
    return Math.max(
      ...design.placements
        .filter(
          (placement) =>
            placement.wall === wall &&
            KITCHEN_L_BODY_CATALOG.get(placement.body.buildId)
              ?.structuralReason === "corner",
        )
        .map((placement) => placement.alongMm + placement.body.widthMm / 2),
    );
  }

  it.each(
    declaredCabinetDepthsMm().flatMap((depthMm) => [
      [depthMm, "A" as const],
      [depthMm, "B" as const],
    ]),
  )(
    "at a %i mm cabinet depth, wall %s's minimum reaches its structural corner's far edge",
    (cabinetDepthMm, wall) => {
      const walls = lWalls(ENGINE_ROOM_LIMITS);
      const minimumMm = wall === "A" ? walls.wallA.minMm : walls.wallB.minMm;

      expect(minimumMm).toBeGreaterThanOrEqual(
        farthestStructuralCornerEdgeMm(atCabinetDepth(cabinetDepthMm), wall),
      );
    },
  );

  // The same measurement against the product's policy directly, rather than through the approved ⊆
  // engine guard: a guard and a derivation that moved together would pass it, this would not.
  it.each(
    declaredCabinetDepthsMm().flatMap((depthMm) => [
      [depthMm, "A" as const],
      [depthMm, "B" as const],
    ]),
  )(
    "at a %i mm cabinet depth, the approved wall %s minimum reaches its structural corner's far edge",
    (cabinetDepthMm, wall) => {
      const walls = lWalls(APPROVED_ROOM_POLICY);
      const minimumMm = wall === "A" ? walls.wallA.minMm : walls.wallB.minMm;

      expect(minimumMm).toBeGreaterThanOrEqual(
        farthestStructuralCornerEdgeMm(atCabinetDepth(cabinetDepthMm), wall),
      );
    },
  );
});

// =================================================================================================
// The depth guard, made structural.
// =================================================================================================

describe("validate-room.ts can read no depth, because it can read nothing but its arguments", () => {
  // `demo-room-envelope.test.ts` holds the exempted writer to a list of depth names. A list is only
  // as good as its spellings — it is case-sensitive, so `setCabinetDepth` and
  // `declaredCabinetDepthsMm` slip it, and `baseCarcassDepthMm` (`catalog.ts`) and `occupiedDepthM`
  // (`occupied-depth.ts`) are depth reads it never names. A module with no value imports cannot
  // reach any of them, whatever they are called.
  it("imports types only", () => {
    const source = readFileSync(
      path.join(SOURCE, "room/validate-room.ts"),
      "utf8",
    );
    const imports = source.match(/^import\b[^;]*;/gm) ?? [];

    expect(imports.length).toBeGreaterThan(0);
    expect(
      imports.filter((statement) => !/^import type\b/.test(statement)),
    ).toEqual([]);
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/\brequire\s*\(/);
  });
});
