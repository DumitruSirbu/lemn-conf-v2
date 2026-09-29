// M7B U3a adversarial QA (docs/WORKFLOW.md step 3) — `planUKitchenComposition` held to ADR 0110
// *N3 revised*, N9 and N10.3 by rules re-derived in `tests/support/u-plan-invariants.ts`, not read back
// from the planner. Rooms are drawn at 1 mm resolution with a bias toward the boundaries the rules
// branch on (side walls 3000/3001 and 4000/4001, the fridge-drop band under 1700, T = 9999/10 000,
// B = C, heights 2200/2600/3900), plus fixed witnesses at the 599/600/899/900 mm spaces after the hob
// on either wall, a hand-built room where the bottle alone would make a tower reachable, and AC4's
// byte-identity of the L (both corner directions) and the straight kitchen against the pre-wave tree.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  generateKitchen,
  KITCHEN_L_DESIGN,
  uShellFloorRuns,
  type DesignRoom,
  type DesignWall,
} from "../../src/index.js";
import { planUKitchenComposition } from "../../src/generation/u-composition.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import {
  DIGEST_OCCURRED_AT,
  digestGeneratedKitchens,
} from "../support/l-and-linear-generation-digest.js";
import {
  farWallOf,
  towerIsOwed,
  uPlanFindings,
  type URuns,
} from "../support/u-plan-invariants.js";

const SAMPLES = 1500;
const DECLARED = declaredColumnSizes(
  buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN)),
);

/** AC4's recording: `digestGeneratedKitchens` run through `generateKitchen` at `d3db323^`, the tree
 *  before U3a's first commit (source extracted with `git archive`, run through this same support
 *  module). 933 rooms: 900 L rooms (no corner direction, left, right) and 33 straight rooms. */
const PRE_WAVE_L_AND_LINEAR_DIGEST =
  "3ed0b98c05af4526f8ee6a7dda466d68e3b79fcfd4f605185663b0b453713fd1";

function uRoom(
  widthMm: number,
  depthMm: number,
  wallCMm: number,
  heightMm = 2600,
): DesignRoom {
  return { shape: "U", widthMm, depthMm, wallCMm, heightMm };
}

function planFor(room: DesignRoom, runs: URuns = uShellFloorRuns(room)) {
  return planUKitchenComposition({ room, runs, columns: DECLARED });
}

function findingsFor(room: DesignRoom): readonly string[] {
  const runs = uShellFloorRuns(room);
  return uPlanFindings({ room, runs, plan: planFor(room, runs) });
}

function bodiesOn(
  plan: ReturnType<typeof planFor>,
  wall: DesignWall,
): readonly string[] {
  return plan.bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm)
    .map((base) => base.buildId);
}

const BOUNDARY_SIDE_MM = [
  1000, 1699, 1700, 2999, 3000, 3001, 3999, 4000, 4001, 6000,
];

const sideWallArb = fc.oneof(
  fc.integer({ min: 1000, max: 6000 }),
  fc.constantFrom(...BOUNDARY_SIDE_MM),
  fc.integer({ min: 1000, max: 1699 }),
);

const heightArb = fc.constantFrom(2200, 2600, 3900);

const sweptRoomArb = fc
  .tuple(
    fc.integer({ min: 2700, max: 6000 }),
    sideWallArb,
    sideWallArb,
    heightArb,
  )
  .map(([widthMm, depthMm, wallCMm, heightMm]) =>
    uRoom(widthMm, depthMm, wallCMm, heightMm),
  );

/** A + B + C within 2 mm of the 10 m large-U threshold, both sides of it. */
const largeUThresholdRoomArb = fc
  .tuple(
    fc.integer({ min: 2700, max: 6000 }),
    fc.integer({ min: 1000, max: 6000 }),
    fc.integer({ min: -2, max: 1 }),
    heightArb,
  )
  .map(([widthMm, depthMm, offsetMm, heightMm]) =>
    uRoom(widthMm, depthMm, 10_000 + offsetMm - widthMm - depthMm, heightMm),
  )
  .filter((room) => (room.wallCMm ?? 0) >= 1000 && (room.wallCMm ?? 0) <= 6000);

const equalSidesRoomArb = fc
  .tuple(
    fc.integer({ min: 2700, max: 6000 }),
    fc.integer({ min: 1000, max: 6000 }),
    heightArb,
  )
  .map(([widthMm, sideMm, heightMm]) =>
    uRoom(widthMm, sideMm, sideMm, heightMm),
  );

describe("the U plan keeps every rule, at 1 mm resolution (U3a AC1)", () => {
  propertyTest.prop([sweptRoomArb], { numRuns: SAMPLES })(
    "over A 2700-6000, B and C 1000-6000 biased to the boundaries",
    (room) => {
      expect(findingsFor(room)).toStrictEqual([]);
    },
  );

  propertyTest.prop([largeUThresholdRoomArb], { numRuns: 400 })(
    "on both sides of the 10 m large-U threshold",
    (room) => {
      expect(findingsFor(room)).toStrictEqual([]);
    },
  );

  propertyTest.prop([equalSidesRoomArb], { numRuns: 300 })(
    "when B = C",
    (room) => {
      expect(findingsFor(room)).toStrictEqual([]);
    },
  );

  it("over N4′'s step-100 grid at 2600 mm, every composed room", () => {
    const failing: string[] = [];
    for (let widthMm = 2700; widthMm <= 6000; widthMm += 300) {
      for (let depthMm = 1000; depthMm <= 6000; depthMm += 100) {
        for (let wallCMm = 1000; wallCMm <= 6000; wallCMm += 100) {
          const findings = findingsFor(uRoom(widthMm, depthMm, wallCMm));
          if (findings.length > 0)
            failing.push(
              `${String(widthMm)}/${String(depthMm)}/${String(wallCMm)}`,
            );
        }
      }
    }

    expect(failing).toStrictEqual([]);
  });
});

describe("the plan is deterministic and pure (U3a AC1)", () => {
  propertyTest.prop([sweptRoomArb], { numRuns: 300 })(
    "gives byte-identical plans for the same room and leaves its frozen inputs untouched",
    (room) => {
      const runs = uShellFloorRuns(room);
      const frozenRoom = Object.freeze({ ...room });
      const frozenRuns = Object.freeze({
        A: Object.freeze({ ...runs.A }),
        B: Object.freeze({ ...runs.B }),
        C: Object.freeze({ ...runs.C }),
      });

      const first = JSON.stringify(planFor(frozenRoom, frozenRuns));
      const second = JSON.stringify(planFor(frozenRoom, frozenRuns));

      expect(second).toBe(first);
      expect(frozenRuns).toStrictEqual(runs);
    },
  );
});

describe("the tall oven is always kept and never gained (owner, 2026-09-29; N10.3 step 2)", () => {
  propertyTest.prop([sweptRoomArb], { numRuns: SAMPLES })(
    "a tower stands exactly when it would with only the overflowed core before it",
    (room) => {
      const runs = uShellFloorRuns(room);
      const plan = planFor(room, runs);
      fc.pre(plan.minimumMet);

      const hasTower = plan.bases.some(
        (base) => base.buildId === "tall-oven-tower",
      );

      expect(hasTower).toBe(towerIsOwed({ room, runs, plan }));
    },
  );

  it("does not let the bottle reach a tower the far wall could not hold without it", () => {
    // Hand-built runs: A's 1900 mm holds sink, dishwasher and preparation, so the hob alone overflows
    // onto C (entered 3500, n = 2), whose run is 1700 mm. With nothing
    // added, hob + one counted door + tower needs 1800, so no tower is owed; hob + bottle + tower
    // needs only 1500. The tower must not appear, and the bottle still stands after the hob.
    const room = uRoom(3700, 4000, 3500);
    const runs: URuns = {
      A: { wall: "A", startMm: 900, endMm: 2800 },
      B: { wall: "B", startMm: 900, endMm: 3000 },
      C: { wall: "C", startMm: 900, endMm: 2600 },
    };

    const plan = planFor(room, runs);

    expect(plan.towerPosition).toBeUndefined();
    expect(bodiesOn(plan, "C")).toStrictEqual([
      "base-hob-oven",
      "base-bottle-cargo",
      "base-panbank",
    ]);
    expect(uPlanFindings({ room, runs, plan })).toStrictEqual([]);
  });
});

describe("the space after a wall-A hob decides the bottle against the drawers (RQ20, RQ21)", () => {
  // 2000 / 2000 side walls: the fridge stands at B's free end and C holds only its free-end tower,
  // so no drawer extra can go round the corner and wall A alone decides. N(T) is 4 or 5.
  const wallAHobCases: readonly (readonly [
    number,
    number,
    readonly string[],
  ])[] = [
    [4499, 298, []],
    [4500, 300, ["base-bottle-cargo"]],
    [4799, 598, ["base-bottle-cargo"]],
    [4800, 600, ["base-panbank"]],
    [5099, 898, ["base-panbank"]],
    [5100, 900, ["base-bottle-cargo", "base-panbank"]],
    [5399, 1198, ["base-bottle-cargo", "base-panbank"]],
    [5400, 1200, ["base-panbank", "base-3drawer"]],
  ];

  it.each(wallAHobCases)(
    "wall A %i mm (%i mm after the hob) reads hob, then %j",
    (widthMm, _spaceMm, afterTheHob) => {
      const plan = planFor(uRoom(widthMm, 2000, 2000));

      expect(bodiesOn(plan, "A")).toStrictEqual([
        "base-sink",
        "base-dishwasher",
        "base-3drawer",
        "base-hob-2drawer",
        ...afterTheHob,
      ]);
      expect(bodiesOn(plan, "C")).toStrictEqual(["tall-oven-tower"]);
    },
  );
});

describe("the space after a far-wall hob decides the bottle against the tower and drawers", () => {
  // 2700 / 4000 / C: wall A holds only the sink, so the dishwasher, preparation and hob overflow
  // onto C, a large U (N(T) = 5) from C = 3300 up.
  const farWallHobCases: readonly (readonly [number, readonly string[]])[] = [
    [3099, ["base-hob-oven"]],
    [3100, ["base-hob-oven", "base-bottle-cargo"]],
    [3399, ["base-hob-oven", "base-bottle-cargo"]],
    [3400, ["base-hob-2drawer", "tall-oven-tower"]],
    [3699, ["base-hob-2drawer", "tall-oven-tower"]],
    [3700, ["base-hob-2drawer", "base-bottle-cargo", "tall-oven-tower"]],
    [3999, ["base-hob-2drawer", "base-bottle-cargo", "tall-oven-tower"]],
    [4000, ["base-hob-2drawer", "base-panbank", "tall-oven-tower"]],
  ];

  it.each(farWallHobCases)(
    "C %i mm reads dishwasher, preparation, then %j",
    (wallCMm, fromTheHob) => {
      const plan = planFor(uRoom(2700, 4000, wallCMm));

      expect(bodiesOn(plan, "C")).toStrictEqual([
        "base-dishwasher",
        "base-3drawer",
        ...fromTheHob,
      ]);
    },
  );
});

describe("heights at the column's 2200 mm and above (U3a AC1)", () => {
  it.each([2200, 2600, 3900])(
    "6000 / 6000 / 6000 at %i mm stands its one tower on C",
    (heightMm) => {
      const plan = planFor(uRoom(6000, 6000, 6000, heightMm));

      expect(bodiesOn(plan, "C")).toStrictEqual([
        "base-3drawer",
        "base-3drawer",
        "base-cabinet",
        "tall-oven-tower",
        "base-cabinet",
        "base-cabinet",
        "base-cabinet",
        "base-cabinet",
      ]);
      expect(bodiesOn(plan, "A").slice(3)).toStrictEqual([
        "base-hob-2drawer",
        "base-bottle-cargo",
        "base-panbank",
        "base-panbank",
      ]);
    },
  );
});

describe("the fridge wall never carries a drawer unit (owner, 2026-09-29)", () => {
  propertyTest.prop([sweptRoomArb], { numRuns: 500 })(
    "not the fridge's own wall, whether it stands or is dropped",
    (room) => {
      const plan = planFor(room);
      fc.pre(plan.minimumMet);
      const fridgeWall: DesignWall = farWallOf(room) === "B" ? "C" : "B";

      expect(
        bodiesOn(plan, fridgeWall).filter(
          (buildId) => buildId === "base-3drawer" || buildId === "base-panbank",
        ),
      ).toStrictEqual([]);
    },
  );
});

describe("the L, the mirrored L and the straight kitchen are byte-identical to the pre-wave tree (U3a AC4)", () => {
  it("reproduces the pre-wave digest over 933 generated kitchens", () => {
    const digest = digestGeneratedKitchens((room) =>
      generateKitchen({
        room: room as DesignRoom,
        occurredAt: DIGEST_OCCURRED_AT,
        probeAt: createFakeProbeFactory(),
      }),
    );

    expect(digest).toBe(PRE_WAVE_L_AND_LINEAR_DIGEST);
  });
});
