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
      shape: "linear",
      wallAMm: undefined,
      heightMm: Number.NaN,
    },
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

interface AgreementArm {
  readonly name: string;
  readonly rooms: fc.Arbitrary<DesignRoom>;
  readonly expectedWalls: readonly ["A" | "B", "A" | "B"];
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

const AGREEMENT_ARMS: readonly AgreementArm[] = [
  {
    name: "both-on-A only",
    rooms: approvedRooms({
      wallAMin: 2100,
      wallAMax: 6300,
      wallBMin: 1000,
      wallBMax: 1599,
    }),
    expectedWalls: ["A", "A"],
  },
  {
    name: "both-on-B only",
    rooms: approvedRooms({
      wallAMin: 900,
      wallAMax: 1499,
      wallBMin: 2200,
      wallBMax: 5100,
    }),
    expectedWalls: ["B", "B"],
  },
  {
    name: "ordered split only",
    rooms: approvedRooms({
      wallAMin: 1500,
      wallAMax: 2099,
      wallBMin: 1600,
      wallBMax: 2199,
    }),
    expectedWalls: ["B", "A"],
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
          ]).toEqual(expectedWalls);
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
    expect(DesignRoomSchema.keyof().options.sort()).toEqual([
      "depthMm",
      "heightMm",
      "shape",
      "widthMm",
    ]);
  });
});
