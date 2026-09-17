// ADR 0108 Amendment B: the owner approved the L's room bounds as numbers, and they are product data
// held inside the engine's own limits. Two tests carry the decision (B1):
//
// - **The guard** — every approved bound sits inside `ENGINE_ROOM_LIMITS`, which stay derived. An
//   engineering change that moves a limit past an approved bound (a deeper declared depth sliding
//   wall B's corner further, a smaller wire bound) turns red here and goes back to the owner, instead
//   of the product accepting a room the engine cannot build or a design cannot store.
// - **The pin** — the six values against the amendment's table, with both wall maxima at the owner's
//   6000 mm since ADR 0120 Amendment B2, so an edit to the approved data is a deliberate, visible diff:
//   the copy lock's role (ADR 0095 decision 2), for numbers.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  DesignRoomSchema,
  KITCHEN_L_DESIGN,
  NARROWED_ROOM_OVERFLOWING_DESIGN,
  type DesignRoom,
  type LRoomInput,
  type MillimetreBounds,
  type RoomPolicy,
} from "../../src/index.js";
import { ENGINE_ROOM_LIMITS } from "../../src/room/room-policy.js";
import {
  lInputFromRoom,
  lWallBoundsOf,
  validateRoom,
} from "../support/room-input.js";

/** Rooms drawn from the approved rectangle for the storage property. At a 1 mm grid wall B's band
 *  above the old 5100 mm wire bound is 900 / 5001 of the draw, so this reaches it about seventy
 *  times a run on top of the corners the property always visits. */
const ACCEPTED_ROOM_RUNS = 400;

/** The owner's 6000 mm per wall (ADR 0120 Amendment B2), spelled here so the pin cannot follow an
 *  edit to the policy it pins. */
const RULED_WALL_MAX_MM = 6000;

/** One bounded field of a policy: how to read its bounds, and how to build the same policy with only
 *  its maximum moved — which is what lets the guard be shown to fail. */
interface PolicyField {
  readonly name: string;
  readonly boundsOf: (policy: RoomPolicy) => MillimetreBounds;
  readonly withMaximum: (policy: RoomPolicy, maxMm: number) => RoomPolicy;
}

const POLICY_FIELDS: readonly PolicyField[] = [
  {
    name: "wall A",
    boundsOf: (policy) => lWallBoundsOf(policy).wallA,
    withMaximum: (policy, maxMm) => {
      const walls = lWallBoundsOf(policy);
      return {
        ...policy,
        buildableShapes: { L: { ...walls, wallA: { ...walls.wallA, maxMm } } },
      };
    },
  },
  {
    name: "wall B",
    boundsOf: (policy) => lWallBoundsOf(policy).wallB,
    withMaximum: (policy, maxMm) => {
      const walls = lWallBoundsOf(policy);
      return {
        ...policy,
        buildableShapes: { L: { ...walls, wallB: { ...walls.wallB, maxMm } } },
      };
    },
  },
  {
    name: "height",
    boundsOf: (policy) => policy.heightBounds,
    withMaximum: (policy, maxMm) => ({
      ...policy,
      heightBounds: { ...policy.heightBounds, maxMm },
    }),
  },
];

const NAMED_POLICY_FIELDS = POLICY_FIELDS.map(
  (field) => [field.name, field] as const,
);

/** The guard's predicate for one field: `policy`'s bounds sit inside the engine's floor and ceiling,
 *  minimum below maximum. Throws the failing assertion, so a caller can prove it reddens. */
function expectHeldInsideEngine(
  { boundsOf }: PolicyField,
  policy: RoomPolicy,
): void {
  const approved = boundsOf(policy);
  const engine = boundsOf(ENGINE_ROOM_LIMITS);

  expect(approved.minMm).toBeGreaterThanOrEqual(engine.minMm);
  expect(approved.maxMm).toBeLessThanOrEqual(engine.maxMm);
  expect(approved.minMm).toBeLessThan(approved.maxMm);
}

function lInputOf(wallAMm: number, wallBMm: number): LRoomInput {
  return {
    shape: "L",
    wallAMm,
    wallBMm,
    heightMm: 2600,
    cornerDirection: "left",
  };
}

describe("APPROVED_ROOM_POLICY — the owner's ruling", () => {
  it("is marked owner-approved", () => {
    expect(APPROVED_ROOM_POLICY.approval).toBe("owner-approved");
  });

  it("holds exactly the six room bounds ADR 0108 Amendment B records, walls as ADR 0120 B2 moved them", () => {
    const walls = lWallBoundsOf(APPROVED_ROOM_POLICY);

    expect({
      wallA: walls.wallA,
      wallB: walls.wallB,
      height: APPROVED_ROOM_POLICY.heightBounds,
    }).toStrictEqual({
      wallA: { minMm: 900, maxMm: 6000 },
      wallB: { minMm: 1000, maxMm: 6000 },
      height: { minMm: 2200, maxMm: 3900 },
    });
  });

  it("accepts a room at 6000 mm on both walls", () => {
    const input = lInputOf(RULED_WALL_MAX_MM, RULED_WALL_MAX_MM);

    expect(validateRoom(input, APPROVED_ROOM_POLICY)).toStrictEqual({
      ok: true,
      room: { shape: "L", widthMm: 6000, depthMm: 6000, heightMm: 2600 },
    });
  });

  it.each([
    ["wallA", lInputOf(RULED_WALL_MAX_MM + 1, RULED_WALL_MAX_MM)],
    ["wallB", lInputOf(RULED_WALL_MAX_MM, RULED_WALL_MAX_MM + 1)],
  ] as const)(
    "refuses %s one millimetre past 6000 mm with its field and code and nothing else",
    (field, input) => {
      expect(validateRoom(input, APPROVED_ROOM_POLICY)).toStrictEqual({
        ok: false,
        issues: [{ field, code: "WALL_TOO_LONG" }],
      });
    },
  );

  it("pins Amendment E's generated sink, hob, and two corner reaches", () => {
    expect(lWallBoundsOf(APPROVED_ROOM_POLICY).minimumKitchen).toStrictEqual({
      isRequired: true,
      sinkWidthMm: 600,
      hobWidthMm: 600,
      cornerReachMm: { wallA: 900, wallB: 1000 },
    });
  });
});

describe("APPROVED_ROOM_POLICY — held inside the engine's limits", () => {
  it("builds the L and only shapes the engine can build", () => {
    const approvedShapes = Object.keys(APPROVED_ROOM_POLICY.buildableShapes);
    const engineShapes = Object.keys(ENGINE_ROOM_LIMITS.buildableShapes);

    expect(approvedShapes).toEqual(["L"]);
    expect(approvedShapes.every((shape) => engineShapes.includes(shape))).toBe(
      true,
    );
  });

  it.each(NAMED_POLICY_FIELDS)(
    "keeps %s inside the engine's floor and ceiling, with its minimum below its maximum",
    (_name, field) => {
      expectHeldInsideEngine(field, APPROVED_ROOM_POLICY);
    },
  );

  // M7 7A3 criterion 6: the guard above is only worth its name if it can fail. It cannot once the
  // engine ceiling is computed from the approved maximum, so it is shown failing here, per field.
  it.each(NAMED_POLICY_FIELDS)(
    "reddens for a policy whose %s maximum is one millimetre past the engine's ceiling",
    (_name, field) => {
      const ceilingMm = field.boundsOf(ENGINE_ROOM_LIMITS).maxMm;
      const atCeiling = field.withMaximum(APPROVED_ROOM_POLICY, ceilingMm);
      const pastCeiling = field.withMaximum(
        APPROVED_ROOM_POLICY,
        ceilingMm + 1,
      );

      expect(() => {
        expectHeldInsideEngine(field, atCeiling);
      }).not.toThrow();
      expect(() => {
        expectHeldInsideEngine(field, pastCeiling);
      }).toThrow(`to be less than or equal to ${String(ceilingMm)}`);
    },
  );

  it("keeps every approved generated-minimum figure at or above the engine's derivation", () => {
    const approved = lWallBoundsOf(APPROVED_ROOM_POLICY).minimumKitchen;
    const engine = lWallBoundsOf(ENGINE_ROOM_LIMITS).minimumKitchen;

    expect(approved.sinkWidthMm).toBeGreaterThanOrEqual(engine.sinkWidthMm);
    expect(approved.hobWidthMm).toBeGreaterThanOrEqual(engine.hobWidthMm);
    expect(approved.cornerReachMm.wallA).toBeGreaterThanOrEqual(
      engine.cornerReachMm.wallA,
    );
    expect(approved.cornerReachMm.wallB).toBeGreaterThanOrEqual(
      engine.cornerReachMm.wallB,
    );
  });
});

/** The approved rectangle's eight corners, each drawn as a room input, so the property below always
 *  reaches the extremes the policy states rather than hoping a random draw lands on them. */
function approvedCornerInputs(): LRoomInput[] {
  const walls = lWallBoundsOf(APPROVED_ROOM_POLICY);
  const height = APPROVED_ROOM_POLICY.heightBounds;
  return [walls.wallA.minMm, walls.wallA.maxMm].flatMap((wallAMm) =>
    [walls.wallB.minMm, walls.wallB.maxMm].flatMap((wallBMm) =>
      [height.minMm, height.maxMm].map((heightMm) => ({
        shape: "L" as const,
        wallAMm,
        wallBMm,
        heightMm,
        cornerDirection: "left" as const,
      })),
    ),
  );
}

function approvedRoomInput(): fc.Arbitrary<LRoomInput> {
  const walls = lWallBoundsOf(APPROVED_ROOM_POLICY);
  const height = APPROVED_ROOM_POLICY.heightBounds;
  return fc.record({
    shape: fc.constant("L" as const),
    wallAMm: fc.integer({ min: walls.wallA.minMm, max: walls.wallA.maxMm }),
    wallBMm: fc.integer({ min: walls.wallB.minMm, max: walls.wallB.maxMm }),
    heightMm: fc.integer({ min: height.minMm, max: height.maxMm }),
    cornerDirection: fc.constant("left" as const),
  });
}

/** Every refusal `DesignRoomSchema` reports, as `field: message`, so a failure names the axis. */
function storageRefusalsOf(room: DesignRoom): string[] {
  const parsed = DesignRoomSchema.safeParse(room);
  return parsed.success
    ? []
    : parsed.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      );
}

describe("APPROVED_ROOM_POLICY — a room it accepts is a room a design can store (M7 7A3 criterion 3)", () => {
  // The two validators are not chained: Step 1 judges a room against this policy and the mint parses
  // it against `DesignRoomSchema`. A room that clears the first and fails the second is a customer who
  // finishes Step 1 onto a design that cannot be saved. Asserted over the rooms, not as a comparison
  // of the two maxima, so it holds whatever makes it true.
  it("parses every accepted room clean through DesignRoomSchema, corners included", () => {
    let acceptedCount = 0;
    fc.assert(
      fc.property(approvedRoomInput(), (input) => {
        const result = validateRoom(input, APPROVED_ROOM_POLICY);
        if (!result.ok) return;
        acceptedCount += 1;

        expect(storageRefusalsOf(result.room)).toEqual([]);
      }),
      {
        numRuns: ACCEPTED_ROOM_RUNS,
        examples: approvedCornerInputs().map((input) => [input]),
      },
    );

    expect(acceptedCount).toBeGreaterThan(0);
  });
});

describe("APPROVED_ROOM_POLICY — the fixture rooms are rooms it accepts", () => {
  it.each([
    ["the seeded kitchen", KITCHEN_L_DESIGN.room],
    ["the narrowed overflowing kitchen", NARROWED_ROOM_OVERFLOWING_DESIGN.room],
  ])("accepts %s's room and hands it back unchanged", (_name, room) => {
    expect(validateRoom(lInputFromRoom(room), APPROVED_ROOM_POLICY)).toEqual({
      ok: true,
      room,
    });
  });
});
