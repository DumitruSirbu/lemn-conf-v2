// M7 wave 7A2 — ADR 0108 Amendments C–E. The generated minimum is the 600 mm sink and 600 mm
// hob in the owner's B-to-A order; the catalogue's 560 mm manual sink width remains independent.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  generateKitchen,
  resolveWidthRangesMm,
  toInsertableBody,
  validateRoomInput,
  type DesignRoom,
  type LRoomInput,
} from "../../src/index.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import { lWallBoundsOf } from "../support/room-input.js";

const OCCURRED_AT = "2026-09-12T20:00:00.000Z";
const RUNS_PER_ARM = 100;
const HOB_BUILD_IDS = new Set(["base-hob-oven", "base-hob-2drawer"]);

function inputFor(
  wallAMm: number,
  wallBMm: number,
  heightMm = 2200,
): LRoomInput {
  return {
    shape: "L",
    wallAMm,
    wallBMm,
    heightMm,
    cornerDirection: "left",
  };
}

describe("validateRoomInput — the generated minimum kitchen", () => {
  it.each([
    [900, 2199],
    [2099, 1000],
    [1500, 1599],
    [900, 2160],
  ])("refuses %i × %i with the exact room-level issue", (wallAMm, wallBMm) => {
    expect(
      validateRoomInput(inputFor(wallAMm, wallBMm), APPROVED_ROOM_POLICY),
    ).toStrictEqual({
      ok: false,
      issues: [{ field: "shape", code: "ROOM_TOO_SMALL_FOR_KITCHEN" }],
    });
  });

  it.each([
    [900, 2200],
    [2100, 1000],
    [1500, 1600],
  ])(
    "accepts %i × %i at the matching one-millimetre boundary",
    (wallAMm, wallBMm) => {
      expect(
        validateRoomInput(inputFor(wallAMm, wallBMm), APPROVED_ROOM_POLICY),
      ).toStrictEqual({
        ok: true,
        room: {
          shape: "L",
          widthMm: wallAMm,
          depthMm: wallBMm,
          heightMm: 2200,
        },
      });
    },
  );

  it.each([
    [inputFor(899, 1000), [{ field: "wallA", code: "WALL_TOO_SHORT" }]],
    [
      inputFor(900.5, 1000),
      [{ field: "wallA", code: "VALUE_NOT_WHOLE_MILLIMETRES" }],
    ],
    [
      { ...inputFor(900, 1000, 2199), wallBMm: undefined },
      [
        { field: "wallB", code: "VALUE_MISSING" },
        { field: "height", code: "HEIGHT_TOO_LOW" },
      ],
    ],
  ] as const)(
    "reports field issues before testing the coupled rule %#",
    (input, issues) => {
      expect(validateRoomInput(input, APPROVED_ROOM_POLICY)).toStrictEqual({
        ok: false,
        issues,
      });
    },
  );

  it("leaves the catalogue's manually buildable 560 mm sink legal", () => {
    const definition = buildKitchenLBodyCatalog(600).get("base-sink");
    const sink = definition && toInsertableBody("base-sink", definition);
    if (sink === undefined) throw new Error("base-sink is not insertable");

    expect(
      resolveWidthRangesMm(sink).some(
        ({ minMm, maxMm }) => minMm <= 560 && maxMm >= 560,
      ),
    ).toBe(true);
    expect(lWallBoundsOf(APPROVED_ROOM_POLICY).minimumKitchen.sinkWidthMm).toBe(
      600,
    );
  });
});

interface LogicalArm {
  readonly name: string;
  readonly rooms: fc.Arbitrary<DesignRoom>;
}

function roomsIn(args: {
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

/** Each arm's open side stops at the approved maximum, 6000 mm per wall (ADR 0120 Amendment B2): the
 *  agreement is asserted against `APPROVED_ROOM_POLICY`, so a room past it is a refusal by design. */
const LOGICAL_ARMS: readonly LogicalArm[] = [
  {
    name: "both required bodies on wall A",
    rooms: roomsIn({
      wallAMin: 2100,
      wallAMax: 6000,
      wallBMin: 1000,
      wallBMax: 1599,
    }),
  },
  {
    name: "both required bodies on wall B",
    rooms: roomsIn({
      wallAMin: 900,
      wallAMax: 1499,
      wallBMin: 2200,
      wallBMax: 6000,
    }),
  },
  {
    name: "sink on wall B and hob on wall A",
    rooms: roomsIn({
      wallAMin: 1500,
      wallAMax: 2099,
      wallBMin: 1600,
      wallBMax: 2199,
    }),
  },
];

function expectValidatorAndGeneratorAgree(room: DesignRoom): void {
  const validation = validateRoomInput(
    inputFor(room.widthMm, room.depthMm, room.heightMm),
    APPROVED_ROOM_POLICY,
  );
  const generated = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  const generatedMinimum =
    generated.ok &&
    generated.design.placements.some(
      ({ body }) => body.buildId === "base-sink",
    ) &&
    generated.design.placements.some(({ body }) =>
      HOB_BUILD_IDS.has(body.buildId),
    );

  expect(validation.ok).toBe(generatedMinimum);
  expect(generated.ok).toBe(generatedMinimum);
}

describe("validateRoomInput — agreement with generateKitchen", () => {
  it.each(LOGICAL_ARMS)(
    "exercises at least 100 rooms with $name",
    ({ rooms }) => {
      let exercised = 0;
      fc.assert(
        fc.property(rooms, (room) => {
          exercised += 1;
          expectValidatorAndGeneratorAgree(room);
        }),
        { numRuns: RUNS_PER_ARM },
      );
      expect(exercised).toBeGreaterThanOrEqual(RUNS_PER_ARM);
    },
  );

  it("agrees over the entire approved L rectangle, including refusals between the arms", () => {
    const walls = lWallBoundsOf(APPROVED_ROOM_POLICY);
    fc.assert(
      fc.property(
        roomsIn({
          wallAMin: walls.wallA.minMm,
          wallAMax: walls.wallA.maxMm,
          wallBMin: walls.wallB.minMm,
          wallBMax: walls.wallB.maxMm,
        }),
        expectValidatorAndGeneratorAgree,
      ),
      { numRuns: RUNS_PER_ARM * LOGICAL_ARMS.length * 2 },
    );
  });
});
