// M7 wave 7A2 adversarial QA — independently exercises every coupled-rule arm and anti-arm.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  DesignRoomSchema,
  buildLShellDesign,
  generateKitchen,
  validateRoomInput,
  type CornerDirection,
  type DesignRoom,
  type LRoomInput,
  type LWallBounds,
  type RoomInput,
  type RoomPolicy,
} from "../../src/index.js";
import { ENGINE_ROOM_LIMITS } from "../../src/room/room-policy.js";
import {
  narrowerEnteredWall,
  widerEnteredWall,
} from "../support/entered-walls.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-13T00:00:00.000Z";
const REQUIRED_RUNS_PER_ARM = 100;

function inputFor(
  room: DesignRoom,
  cornerDirection: CornerDirection = "left",
): LRoomInput {
  return {
    shape: "L",
    wallAMm: room.widthMm,
    wallBMm: room.depthMm,
    heightMm: room.heightMm,
    cornerDirection,
  };
}

function policyWith(minimumKitchen: LWallBounds["minimumKitchen"]): RoomPolicy {
  return {
    approval: "owner-approved",
    buildableShapes: {
      L: {
        wallA: { minMm: 1, maxMm: 10_000 },
        wallB: { minMm: 1, maxMm: 10_000 },
        minimumKitchen,
      },
    },
    heightBounds: { minMm: 1, maxMm: 10_000 },
  };
}

const ASYMMETRIC_MINIMUM: LWallBounds["minimumKitchen"] = {
  isRequired: true,
  sinkWidthMm: 701,
  hobWidthMm: 503,
  cornerReachMm: { wallA: 137, wallB: 263 },
};
const ASYMMETRIC_POLICY = policyWith(ASYMMETRIC_MINIMUM);

function validateAsymmetric(wallAMm: number, wallBMm: number) {
  return validateRoomInput(
    inputFor({ shape: "L", widthMm: wallAMm, depthMm: wallBMm, heightMm: 1 }),
    ASYMMETRIC_POLICY,
  );
}

describe("validateRoomInput — 7A2 coupled predicate", () => {
  it.each([
    ["both on A", 137 + 701 + 503, 263],
    ["both on B", 137, 263 + 701 + 503],
    ["sink on B and hob on A", 137 + 503, 263 + 701],
  ] as const)(
    "accepts the exact %s arm from policy data",
    (_name, wallA, wallB) => {
      expect(validateAsymmetric(wallA, wallB).ok).toBe(true);
    },
  );

  it.each([
    ["both-on-A is one millimetre short", 137 + 701 + 503 - 1, 263],
    ["both-on-B is one millimetre short", 137, 263 + 701 + 503 - 1],
    ["split sink is one millimetre short", 137 + 503, 263 + 701 - 1],
    ["split hob is one millimetre short", 137 + 503 - 1, 263 + 701],
    [
      "the forbidden reverse split has only A holding the sink and B the hob",
      137 + 701,
      263 + 503,
    ],
  ] as const)("refuses when %s", (_name, wallA, wallB) => {
    expect(validateAsymmetric(wallA, wallB)).toStrictEqual({
      ok: false,
      issues: [{ field: "shape", code: "ROOM_TOO_SMALL_FOR_KITCHEN" }],
    });
  });

  it("reads all four dimensions from the handed policy rather than approved literals", () => {
    const atCustomSplit = validateAsymmetric(137 + 503, 263 + 701);
    const sameRoomUnderApproved = validateRoomInput(
      inputFor({ shape: "L", widthMm: 640, depthMm: 964, heightMm: 2200 }),
      APPROVED_ROOM_POLICY,
    );

    expect(atCustomSplit.ok).toBe(true);
    expect(sameRoomUnderApproved).toStrictEqual({
      ok: false,
      issues: [
        { field: "wallA", code: "WALL_TOO_SHORT" },
        { field: "wallB", code: "WALL_TOO_SHORT" },
      ],
    });
  });

  it("isRequired=false disables only the coupled gate", () => {
    const optional = policyWith({ ...ASYMMETRIC_MINIMUM, isRequired: false });
    const belowMinimum = inputFor({
      shape: "L",
      widthMm: 137,
      depthMm: 263,
      heightMm: 1,
    });

    expect(validateRoomInput(belowMinimum, optional)).toStrictEqual({
      ok: true,
      room: { shape: "L", widthMm: 137, depthMm: 263, heightMm: 1 },
    });
    expect(
      validateRoomInput({ ...belowMinimum, wallAMm: 0 }, optional),
    ).toStrictEqual({
      ok: false,
      issues: [{ field: "wallA", code: "WALL_TOO_SHORT" }],
    });
  });

  it.each([
    ["wallA missing", { wallAMm: undefined }],
    ["wallA fractional", { wallAMm: 900.5 }],
    ["wallB missing", { wallBMm: undefined }],
    ["wallB fractional", { wallBMm: 1000.5 }],
    ["height missing", { heightMm: undefined }],
    ["height fractional", { heightMm: 2200.5 }],
  ] as const)("suppresses the coupled issue when %s", (_name, override) => {
    const result = validateRoomInput(
      {
        shape: "L",
        wallAMm: 900,
        wallBMm: 1000,
        heightMm: 2200,
        cornerDirection: "left",
        ...override,
      },
      APPROVED_ROOM_POLICY,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).not.toContainEqual({
      field: "shape",
      code: "ROOM_TOO_SMALL_FOR_KITCHEN",
    });
    expect(result.issues).toHaveLength(1);
  });

  it("returns the room issue with exactly field and code and no number", () => {
    const result = validateRoomInput(
      inputFor({ shape: "L", widthMm: 900, depthMm: 1000, heightMm: 2200 }),
      APPROVED_ROOM_POLICY,
    );

    expect(result).toStrictEqual({
      ok: false,
      issues: [{ field: "shape", code: "ROOM_TOO_SMALL_FOR_KITCHEN" }],
    });
    if (result.ok) return;
    expect(Object.keys(result.issues[0] ?? {}).sort()).toEqual([
      "code",
      "field",
    ]);
  });

  it.each([
    {
      shape: "U",
      wallAMm: undefined,
      wallBMm: -1,
      wallCMm: Number.POSITIVE_INFINITY,
      heightMm: 0,
      cornerDirection: "right",
    },
  ] satisfies readonly RoomInput[])("refuses another shape alone", (input) => {
    expect(validateRoomInput(input, APPROVED_ROOM_POLICY)).toStrictEqual({
      ok: false,
      issues: [{ field: "shape", code: "SHAPE_NOT_BUILDABLE" }],
    });
  });

  // 7J S5, ADR 0108 Amendment G: `APPROVED_ROOM_POLICY` now states linear bounds, so this input is
  // judged field by field like an L rather than refused as its shape alone — restated from "refuses
  // another shape alone", which held for linear before this wave.
  it("judges a straight kitchen field by field rather than refusing its shape alone", () => {
    const input = {
      shape: "linear",
      wallAMm: undefined,
      heightMm: Number.NaN,
    } satisfies RoomInput;

    expect(validateRoomInput(input, APPROVED_ROOM_POLICY)).toStrictEqual({
      ok: false,
      issues: [
        { field: "wallA", code: "VALUE_MISSING" },
        { field: "height", code: "VALUE_NOT_WHOLE_MILLIMETRES" },
      ],
    });
  });
});

describe("APPROVED_ROOM_POLICY — exact 7A2 boundaries", () => {
  it.each([
    [900, 2199, false],
    [900, 2200, true],
    [2099, 1000, false],
    [2100, 1000, true],
    [1500, 1599, false],
    [1500, 1600, true],
    [900, 2160, false],
  ] as const)(
    "judges %i × %i as accepted=%s at both directions and ceiling edges",
    (wallAMm, wallBMm, accepted) => {
      for (const cornerDirection of ["left", "right"] as const) {
        for (const heightMm of [2200, 3900] as const) {
          expect(
            validateRoomInput(
              {
                shape: "L",
                wallAMm,
                wallBMm,
                heightMm,
                cornerDirection,
              },
              APPROVED_ROOM_POLICY,
            ).ok,
          ).toBe(accepted);
        }
      }
    },
  );
});

/**
 * **The wall each arm expects is derived from the room, never spelled as a letter.** M7 wave 7D8
 * keyed the run onto the **wider entered wall** (ADR 0120 Amendment E), so a pair of letters names
 * the right walls only in the arms whose bounds happen to fix which wall is wider — and the
 * `ordered split only` arm's bounds overlap, so it draws rooms on both sides of the key.
 */
interface AgreementArm {
  readonly name: string;
  readonly rooms: fc.Arbitrary<DesignRoom>;
  readonly expectedWalls: (room: DesignRoom) => readonly ["A" | "B", "A" | "B"];
}

function approvedRooms(args: {
  readonly wallAMin: number;
  readonly wallAMax: number;
  readonly wallBMin: number;
  readonly wallBMax: number;
}): fc.Arbitrary<DesignRoom> {
  return fc.record({
    shape: fc.constant("L" as const),
    widthMm: fc.integer({ min: args.wallAMin, max: args.wallAMax }),
    depthMm: fc.integer({ min: args.wallBMin, max: args.wallBMax }),
    heightMm: fc.integer({ min: 2200, max: 3900 }),
  });
}

/** Each arm's open side stops at the approved maximum, 6000 mm per wall (ADR 0120 Amendment B2): every
 *  room drawn here must also be one `APPROVED_ROOM_POLICY` accepts. */
const AGREEMENT_ARMS: readonly AgreementArm[] = [
  {
    name: "both-on-A only",
    rooms: approvedRooms({
      wallAMin: 2100,
      wallAMax: 6000,
      wallBMin: 1000,
      wallBMax: 1599,
    }),
    // Wall A is the wider one everywhere in these bounds, so the run and both bodies stand on it.
    expectedWalls: (room) => [widerEnteredWall(room), widerEnteredWall(room)],
  },
  {
    name: "both-on-B only",
    rooms: approvedRooms({
      wallAMin: 900,
      wallAMax: 1499,
      wallBMin: 2200,
      wallBMax: 6000,
    }),
    // And wall B is the wider one everywhere in these — the same rule, sampled from the other side.
    expectedWalls: (room) => [widerEnteredWall(room), widerEnteredWall(room)],
  },
  {
    name: "ordered split only",
    rooms: approvedRooms({
      wallAMin: 1500,
      wallAMax: 2099,
      wallBMin: 1600,
      wallBMax: 2199,
    }),
    // **These bounds overlap, so this arm draws rooms with either wall wider** — which is exactly
    // what makes it the arm that catches a key spelled as a letter. The split is the same either
    // way: the hob ends the run on the wider wall and the sink is read before the corner, on the
    // narrower one.
    expectedWalls: (room) => [
      narrowerEnteredWall(room),
      widerEnteredWall(room),
    ],
  },
];

function placedWall(
  result: Extract<ReturnType<typeof generateKitchen>, { readonly ok: true }>,
  role: "sink" | "hob",
): "A" | "B" {
  const step = result.log.steps.find(
    (candidate) => candidate.id === role && candidate.status === "placed",
  );
  if (step?.status !== "placed") {
    throw new Error(`generated ${role} has no placed step`);
  }
  const placement = result.design.placements.find(
    (candidate) => candidate.id === step.placementId,
  );
  if (!placement) throw new Error(`generated ${role} has no placement`);
  // M7B U1 slice S1's minimal type-level fix: `DesignPlacement["wall"]` is widened to include `"C"`
  // (ADR 0132), but `generateKitchen` composes an L or a straight room in this wave — wall C's own
  // generator is U3's — so a generated sink or hob is asserted onto the two walls it can reach.
  if (placement.wall !== "A" && placement.wall !== "B") {
    throw new Error(
      `generated ${role} stands on an unexpected wall ${placement.wall}`,
    );
  }
  return placement.wall;
}

describe("7A2 — validator and generator share the minimum", () => {
  it.each([
    [900, 2199],
    [2099, 1000],
    [1500, 1599],
  ] as const)(
    "keeps both sides refusing at exact boundary %i × %i",
    (widthMm, depthMm) => {
      const room: DesignRoom = {
        shape: "L",
        widthMm,
        depthMm,
        heightMm: 2200,
      };
      const generated = generateKitchen({
        room,
        occurredAt: OCCURRED_AT,
        probeAt: createFakeProbeFactory(),
      });

      expect(validateRoomInput(inputFor(room), APPROVED_ROOM_POLICY).ok).toBe(
        false,
      );
      expect(generated.ok).toBe(false);
      expect(generated).not.toHaveProperty("design");
    },
  );

  it.each(AGREEMENT_ARMS)(
    "runs at least 100 non-vacuous samples through the $name arm",
    ({ rooms, expectedWalls }) => {
      let exercised = 0;
      let generatedWithBoth = 0;
      fc.assert(
        fc.property(rooms, (room) => {
          exercised += 1;
          const generated = generateKitchen({
            room,
            occurredAt: OCCURRED_AT,
            probeAt: createFakeProbeFactory(),
          });
          expect(generated.ok).toBe(true);
          if (!generated.ok) return;
          generatedWithBoth += 1;
          expect([
            placedWall(generated, "sink"),
            placedWall(generated, "hob"),
          ]).toEqual(expectedWalls(room));
          for (const cornerDirection of ["left", "right"] as const) {
            expect(
              validateRoomInput(
                inputFor(room, cornerDirection),
                APPROVED_ROOM_POLICY,
              ).ok,
            ).toBe(true);
          }
        }),
        { numRuns: REQUIRED_RUNS_PER_ARM },
      );
      expect(exercised).toBeGreaterThanOrEqual(REQUIRED_RUNS_PER_ARM);
      expect(generatedWithBoth).toBe(exercised);
    },
  );
});

describe("7A2 — engine envelope and wire schema remain independent", () => {
  it("keeps the shell usable for a field-valid room the approved coupled rule refuses", () => {
    const room: DesignRoom = {
      shape: "L",
      widthMm: 900,
      depthMm: 1000,
      heightMm: 2200,
    };

    expect(validateRoomInput(inputFor(room), APPROVED_ROOM_POLICY).ok).toBe(
      false,
    );
    expect(validateRoomInput(inputFor(room), ENGINE_ROOM_LIMITS).ok).toBe(true);
    expect(
      buildLShellDesign({ room, occurredAt: OCCURRED_AT }).room,
    ).toStrictEqual(room);
  });

  it("does not add policy data to DesignRoomSchema", () => {
    const room = {
      shape: "L",
      widthMm: 2100,
      depthMm: 1000,
      heightMm: 2200,
      minimumKitchen: ASYMMETRIC_MINIMUM,
    };

    expect(DesignRoomSchema.safeParse(room).success).toBe(false);
    // ADR 0129 D2 added `cornerDirection`, and ADR 0132 decision 6 added `wallCMm`; the assertion
    // is still that this suite's *policy* key (`minimumKitchen`) is not among them, not that the
    // schema never grows.
    expect(DesignRoomSchema.keyof().options.sort()).toEqual([
      "cornerDirection",
      "depthMm",
      "heightMm",
      "shape",
      "wallCMm",
      "widthMm",
    ]);
  });
});
