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
//
// **A third test joins them at wave 7D6's criterion 4′ — the margin pin.** The guard's direction
// reversed on 2026-09-17: the approved wall minima now sit *above* what the engine needs, by a gap
// the owner chose on purpose (ADR 0125). An inequality is silent inside that gap, so the gap itself
// is asserted as an exact size — see *the ruled margin* below.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  DesignRoomSchema,
  KITCHEN_L_DESIGN,
  narrowestCornerReachMm,
  NARROWED_ROOM_OVERFLOWING_DESIGN,
  type DesignRoom,
  type LRoomInput,
  type MillimetreBounds,
  type RoomPolicy,
} from "../../src/index.js";
import { ENGINE_ROOM_LIMITS } from "../../src/room/room-policy.js";
import {
  lInputFromRoom,
  linearWallBoundsOf,
  lWallBoundsOf,
  validateRoom,
} from "../support/room-input.js";

/** Rooms drawn from the approved rectangle for the storage property. At a 1 mm grid wall B's band
 *  above the old 5100 mm wire bound is 900 / 5001 of the draw, so this reaches it about seventy
 *  times a run on top of the corners the property always visits. */
const ACCEPTED_ROOM_RUNS = 400;

/** The wire bound on `depthMm` before ADR 0124 — criterion 3's counterexample was a room one
 *  millimetre past it. The property must reach past it, or it passes without visiting the band. */
const OLD_DEPTH_WIRE_BOUND_MM = 5100;

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
  // 7J S5, ADR 0130 D2: the straight kitchen's one wall, joining the L's two above.
  {
    name: "linear wall A",
    boundsOf: (policy) => linearWallBoundsOf(policy).wallA,
    withMaximum: (policy, maxMm) => {
      const walls = linearWallBoundsOf(policy);
      return {
        ...policy,
        buildableShapes: {
          linear: { ...walls, wallA: { ...walls.wallA, maxMm } },
        },
      };
    },
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

  // **`>=`, and the gap under it is no longer zero.** ADR 0108 B1 wrote this to redden when an
  // engineering change pushes the engine's floor *past* an approved bound — still the loud
  // direction, and still what this line is for. Since ADR 0125 the approved wall minima sit above
  // the engine's floor by a margin the owner chose, and movement *inside* that margin passes here
  // by design: *the ruled margin above the engine's floor* asserts the gap's exact size instead.
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

  // 7J S5, ADR 0108 Amendment G / Q-7J-1: the straight wall's own bounds, pinned the same way the
  // L's six values are, so an edit to either is a deliberate, visible diff.
  it("pins the straight kitchen's wall A at 1200-6000 mm", () => {
    expect(linearWallBoundsOf(APPROVED_ROOM_POLICY).wallA).toStrictEqual({
      minMm: 1200,
      maxMm: 6000,
    });
  });
});

describe("APPROVED_ROOM_POLICY — held inside the engine's limits", () => {
  // 7J S5: the straight kitchen joins the L (ADR 0108 Amendment G); a U stays engine-only until its
  // own wave, so the guard's "every approved shape is one the engine can build" still has content.
  it("builds the L and the straight kitchen — only shapes the engine can build", () => {
    const approvedShapes = Object.keys(APPROVED_ROOM_POLICY.buildableShapes);
    const engineShapes = Object.keys(ENGINE_ROOM_LIMITS.buildableShapes);

    expect(approvedShapes).toEqual(["L", "linear"]);
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

// =================================================================================================
// Wave 7D6 criterion 4′ — the ruled margin above the engine's floor
// =================================================================================================

/** One figure per wall, which is how every number in the margin pin is stated. */
interface WallFiguresMm {
  readonly wallA: number;
  readonly wallB: number;
}

/** The derived floor reach: `narrowestCornerReachMm`, the narrowest corner this product builds — a
 *  cabinet with one door at each of the three levels — over every declared cabinet depth and taking
 *  no room at all (`corner-assembly-size.ts`, entry point 3). Spelled as literals so a derivation
 *  that moves is read here as a failing number instead of following the code it is guarding. That
 *  these are also `ENGINE_ROOM_LIMITS`' wall minima is `room-policy.test.ts`'s pin, not this one's. */
const DERIVED_WALL_FLOOR_REACH_MM: WallFiguresMm = { wallA: 880, wallB: 880 };

/** The owner's approved wall minima (ADR 0108 Amendment B), spelled again for the same reason. */
const APPROVED_WALL_MINIMUM_MM: WallFiguresMm = { wallA: 900, wallB: 1000 };

/** The gap between the two, and it is **ruled rather than owed**: the owner kept 900 and 1000
 *  although the kitchen can be built against 880 on each wall, so the product refuses rooms it
 *  could furnish, on purpose (ADR 0125, owner ruling 2026-09-17, answering M7's Q-K1 with option 3;
 *  ADR 0125 proposes `WALL_MINIMUM_APPROVED_MARGIN_MM` for the same constant). It was
 *  `WALL_MINIMUM_MARGIN_OWED_ON_Q_K1_MM` while Q-K1 was open, and that name is false now the
 *  question is answered.
 *
 *  **Asserted as an exact size, never as an inequality.** A derivation that shrinks grows this gap
 *  and fails; a derivation that grows toward the approved bound shrinks it and fails. The approved
 *  bound can therefore move only in a commit that edits the owner's literal and this margin
 *  together, which is the whole of J4: no approved bound moves silently, in either direction. */
const RULED_WALL_MINIMUM_MARGIN_MM: WallFiguresMm = { wallA: 20, wallB: 120 };

function derivedFloorReachMm(): WallFiguresMm {
  return {
    wallA: narrowestCornerReachMm("A").wallMinimumMm,
    wallB: narrowestCornerReachMm("B").wallMinimumMm,
  };
}

function approvedWallMinimaOf(policy: RoomPolicy): WallFiguresMm {
  const walls = lWallBoundsOf(policy);
  return { wallA: walls.wallA.minMm, wallB: walls.wallB.minMm };
}

/** Criterion 4′'s three figures in one object, so a failure prints all three and names which of them
 *  moved rather than reporting a difference alone. */
function marginPinOf(derivedMm: WallFiguresMm, approvedMm: WallFiguresMm) {
  return {
    derivedFloorReachMm: derivedMm,
    approvedMinimumMm: approvedMm,
    marginMm: {
      wallA: approvedMm.wallA - derivedMm.wallA,
      wallB: approvedMm.wallB - derivedMm.wallB,
    },
  };
}

/** The pin as an assertion, so a caller can prove it reddens for a pair that has drifted either way. */
function expectMarginIsRuled(
  derivedMm: WallFiguresMm,
  approvedMm: WallFiguresMm,
): void {
  expect(marginPinOf(derivedMm, approvedMm)).toStrictEqual({
    derivedFloorReachMm: DERIVED_WALL_FLOOR_REACH_MM,
    approvedMinimumMm: APPROVED_WALL_MINIMUM_MM,
    marginMm: RULED_WALL_MINIMUM_MARGIN_MM,
  });
}

function policyFieldNamed(name: string): PolicyField {
  const field = POLICY_FIELDS.find((candidate) => candidate.name === name);
  if (field === undefined) {
    throw new Error(`approved-room-policy.test: no policy field named ${name}`);
  }
  return field;
}

/** `APPROVED_ROOM_POLICY` with one wall minimum raised, staying inside the ruled margin. */
function withWallAMinimum(minMm: number): RoomPolicy {
  const walls = lWallBoundsOf(APPROVED_ROOM_POLICY);
  return {
    ...APPROVED_ROOM_POLICY,
    buildableShapes: { L: { ...walls, wallA: { ...walls.wallA, minMm } } },
  };
}

describe("APPROVED_ROOM_POLICY — the ruled margin above the engine's floor (7D6 criterion 4′)", () => {
  it("states the derived floor reach, the approved minimum and the exact gap between them", () => {
    expectMarginIsRuled(
      derivedFloorReachMm(),
      approvedWallMinimaOf(APPROVED_ROOM_POLICY),
    );
  });

  // The silent direction, and the only thing standing in front of it (7D6 risk 1): a derivation that
  // becomes more conservative widens the gap, and the product then refuses rooms it could build.
  it.each(["wallA", "wallB"] as const)(
    "reddens when %s's derivation shrinks, which widens the ruled margin",
    (wall) => {
      const derived = derivedFloorReachMm();

      expect(() => {
        expectMarginIsRuled(
          { ...derived, [wall]: derived[wall] - 1 },
          approvedWallMinimaOf(APPROVED_ROOM_POLICY),
        );
      }).toThrow();
    },
  );

  // The loud direction, which the `>=` guard above also catches — but only once the derivation has
  // passed the approved bound. Every millimetre of approach before that is invisible to it and
  // visible here.
  it.each(["wallA", "wallB"] as const)(
    "reddens when %s's derivation grows toward the approved bound, which narrows the ruled margin",
    (wall) => {
      const derived = derivedFloorReachMm();

      expect(() => {
        expectMarginIsRuled(
          { ...derived, [wall]: derived[wall] + 1 },
          approvedWallMinimaOf(APPROVED_ROOM_POLICY),
        );
      }).toThrow();
    },
  );

  // Why criterion 4′ exists at all, shown against the shipped guard rather than argued: a bound
  // moved ten millimetres up sits well inside the margin, so ADR 0108 B1's `>=` stays green.
  it("catches a bound moved inside the margin, where the shipped >= guard stays green", () => {
    const insideTheMargin = withWallAMinimum(
      APPROVED_WALL_MINIMUM_MM.wallA + 10,
    );

    expect(() => {
      expectHeldInsideEngine(policyFieldNamed("wall A"), insideTheMargin);
    }).not.toThrow();
    expect(() => {
      expectMarginIsRuled(
        derivedFloorReachMm(),
        approvedWallMinimaOf(insideTheMargin),
      );
    }).toThrow();
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
    let acceptedPastTheOldBoundOnWallB = 0;
    let acceptedPastTheOldBoundOnWallA = 0;
    fc.assert(
      fc.property(approvedRoomInput(), (input) => {
        const result = validateRoom(input, APPROVED_ROOM_POLICY);
        if (!result.ok) return;
        acceptedCount += 1;
        if (result.room.depthMm > OLD_DEPTH_WIRE_BOUND_MM) {
          acceptedPastTheOldBoundOnWallB += 1;
        }
        if (result.room.widthMm > OLD_DEPTH_WIRE_BOUND_MM) {
          acceptedPastTheOldBoundOnWallA += 1;
        }

        expect(storageRefusalsOf(result.room)).toEqual([]);
      }),
      {
        numRuns: ACCEPTED_ROOM_RUNS,
        examples: approvedCornerInputs().map((input) => [input]),
      },
    );

    expect(acceptedCount).toBeGreaterThan(0);
    expect(acceptedPastTheOldBoundOnWallB).toBeGreaterThanOrEqual(1);
    expect(acceptedPastTheOldBoundOnWallA).toBeGreaterThanOrEqual(1);
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
