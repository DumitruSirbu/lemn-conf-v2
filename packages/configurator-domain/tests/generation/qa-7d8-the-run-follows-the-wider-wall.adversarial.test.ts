// The drawer stands at the wrong end of the kitchen, with no count, width, remainder, cut or digest moving, if
// `firstStorageSlotAfterTheHob` and `isLaidOutInReverse` disagree about the reversed wall. Nothing here imports
// production's key: the reversed wall is re-derived from the entered numbers and the run order from
// `GENERATION_PRIORITIES` (ADR 0110 Amendment A1), so a guard cannot agree with production by construction.
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  DISHWASHER_BUILD_ID,
  DOOR_BASE_BUILD_ID,
  GENERATION_PRIORITIES,
  isComposedStorageSlot,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  THREE_DRAWER_BASE_BUILD_ID,
  wallLengthMm,
  type DesignRoom,
  type DesignWall,
  type GenerationCoreRole,
  type GenerationRun,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
} from "../../src/index.js";
import { narrowerEnteredWall } from "../support/entered-walls.js";

// `DesignWall` includes "C" (ADR 0132), but this suite reads `planKitchenComposition`'s two-wall composer.
type TwoWallDispatch = Extract<DesignWall, "A" | "B">;

const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);

/** 50 mm, not the 100 mm sibling files sweep at: the arm where the reversed wall carries two core bodies to
 *  reverse is a small share of placed rooms, and a coarser grid draws too few of them. */
const GRID_STEP_MM = 50;

/** The run order, read off the owner's ruled priority list rather than spelled again here: a kitchen is read
 *  fridge, sink, preparation, hob whichever wall each stands on (ADR 0110 Amendment A1). */
const RUN_ORDER: readonly GenerationCoreRole[] = GENERATION_PRIORITIES.map(
  (priority) => priority.role,
);

function planFor(
  room: DesignRoom,
  runs: Readonly<Record<TwoWallDispatch, GenerationRun>> = lShellFloorRuns(
    room,
  ),
): KitchenCompositionPlan {
  return planKitchenComposition({ room, runs, columns: DECLARED_COLUMNS });
}

/**
 * The wall the layout runs against the reading order on: the narrower entered wall, wall B where the two are
 * equal (ADR 0120 Amendment E). Derived in `entered-walls.ts` from the room, never from
 * `generation-priorities.ts`: this is the test-side twin of `isLaidOutInReverse`, and the two agree only if
 * both read the owner's wider-wall rule the same way.
 */
function wallReadInReverse(room: DesignRoom): TwoWallDispatch {
  return narrowerEnteredWall(room);
}

function theOtherWall(wall: TwoWallDispatch): TwoWallDispatch {
  return wall === "A" ? "B" : "A";
}

/** One wall's composed bodies, corner to free end. */
function alongTheWall(
  plan: KitchenCompositionPlan,
  wall: DesignWall,
): readonly PlannedGenerationBase[] {
  return [...plan.bases.filter((base) => base.wall === wall)].sort(
    (left, right) => left.startMm - right.startMm,
  );
}

/** The whole kitchen in the order it is read: the reversed wall from its free end toward the corner,
 *  then the other wall from the corner outward. */
function inReadingOrder(
  plan: KitchenCompositionPlan,
): readonly PlannedGenerationBase[] {
  const reversed = wallReadInReverse(plan.room);
  return [
    ...[...alongTheWall(plan, reversed)].reverse(),
    ...alongTheWall(plan, theOtherWall(reversed)),
  ];
}

function coreRolesOf(
  bases: readonly PlannedGenerationBase[],
): readonly GenerationCoreRole[] {
  return bases.flatMap((base) => (base.role === "storage" ? [] : [base.role]));
}

function sweptPlans(): readonly KitchenCompositionPlan[] {
  const l = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (!l) throw new Error("the approved policy declares no L");
  const plans: KitchenCompositionPlan[] = [];
  for (
    let widthMm = l.wallA.minMm;
    widthMm <= l.wallA.maxMm;
    widthMm += GRID_STEP_MM
  ) {
    for (
      let depthMm = l.wallB.minMm;
      depthMm <= l.wallB.maxMm;
      depthMm += GRID_STEP_MM
    ) {
      const plan = planFor({ shape: "L", widthMm, depthMm, heightMm: 2600 });
      if (plan.minimumMet) plans.push(plan);
    }
  }
  return plans;
}

const SWEPT_PLANS = sweptPlans();
const DECLARED_WALL_B_WIDER_PLANS = declaredWallBWiderPlans();

function roomKeyOf(plan: KitchenCompositionPlan): string {
  return `${String(plan.room.widthMm)}x${String(plan.room.depthMm)}`;
}

describe("7a — the reversed wall is the narrower entered wall, and the sweep can see the reversal", () => {
  it("reads every composed kitchen back in the owner's run order, on both arms of the split", () => {
    // Inverting `isLaidOutInReverse` reverses the wrong wall's core, and the roles come back out of run order.
    // The arms are counted because the reversal is observable only on a wall carrying two core bodies, so a
    // sweep that never reached one would agree with a module that had lost the reversal.
    const arms = { wallBWider: 0, wallAWider: 0, equal: 0 };
    const reversals = { onTheReversedWall: 0, onTheForwardWall: 0 };
    for (const plan of SWEPT_PLANS) {
      const reversed = wallReadInReverse(plan.room);
      const bMm = wallLengthMm("B", plan.room);
      const aMm = wallLengthMm("A", plan.room);
      if (bMm > aMm) arms.wallBWider += 1;
      else if (bMm === aMm) arms.equal += 1;
      else arms.wallAWider += 1;
      if (coreRolesOf(alongTheWall(plan, reversed)).length >= 2) {
        reversals.onTheReversedWall += 1;
      }
      if (coreRolesOf(alongTheWall(plan, theOtherWall(reversed))).length >= 2) {
        reversals.onTheForwardWall += 1;
      }

      expect(coreRolesOf(inReadingOrder(plan)), roomKeyOf(plan)).toEqual(
        RUN_ORDER.filter((role) => !plan.dropped.includes(role)),
      );
    }

    expect(SWEPT_PLANS.length).toBeGreaterThanOrEqual(9000);
    expect(arms.wallBWider).toBeGreaterThanOrEqual(4500);
    expect(arms.wallAWider).toBeGreaterThanOrEqual(4500);
    expect(arms.equal).toBeGreaterThanOrEqual(50);
    expect(
      reversals.onTheReversedWall,
      "no swept room gave the reversed wall two bodies to reverse",
    ).toBeGreaterThanOrEqual(100);
    expect(reversals.onTheForwardWall).toBeGreaterThanOrEqual(9000);
  });

  it("stands the reversed wall's core against the run and the other wall's core with it", () => {
    // Spatially: along the narrower wall the run's rank descends from the corner outward, along the wider wall it
    // ascends. Two assertions, because an inversion flipping both walls at once would look merely rotated in the
    // concatenated reading order.
    const rankedPairs = { descending: 0, ascending: 0 };
    for (const plan of SWEPT_PLANS) {
      const reversed = wallReadInReverse(plan.room);
      const descending = coreRolesOf(alongTheWall(plan, reversed)).map((role) =>
        RUN_ORDER.indexOf(role),
      );
      const ascending = coreRolesOf(
        alongTheWall(plan, theOtherWall(reversed)),
      ).map((role) => RUN_ORDER.indexOf(role));
      if (descending.length >= 2) rankedPairs.descending += 1;
      if (ascending.length >= 2) rankedPairs.ascending += 1;

      expect(descending, `${roomKeyOf(plan)} wall ${reversed}`).toEqual(
        [...descending].sort((left, right) => right - left),
      );
      expect(
        ascending,
        `${roomKeyOf(plan)} wall ${theOtherWall(reversed)}`,
      ).toEqual([...ascending].sort((left, right) => left - right));
    }

    // Both arms are floored and the descending one is the subject: a single counter satisfied by the forward wall
    // alone would stay green if a change emptied the thin reversed-wall population (ADR 0091 Amendment A).
    expect(
      rankedPairs.descending,
      "no swept room gave the reversed wall two ranked core bodies",
    ).toBeGreaterThanOrEqual(100);
    expect(rankedPairs.ascending).toBeGreaterThanOrEqual(8000);
  });
});

describe("7b — the descending slot path, declared at the composer's boundary", () => {
  // Unreachable from `APPROVED_ROOM_POLICY` (ADR 0093 decision 3b), so the runs are declared here. The descending
  // slot count applies only when the hob is not on the wall the run reads last, which needs the reversed wall to
  // hold the whole core and the other wall less than the hob's 600 mm; the L shell's runs cannot do both, an
  // empirical fact about the admitted range that keeps the branch alive.
  //
  // Each reversed wall's run holds two slots beside the bottle and the pan drawer, so the drawer at the highest
  // slot index can be told from an ascending count. `lShellFloorRuns`'s own answer is asserted to differ from
  // these runs, so the witness cannot quietly become a duplicate of the sweep.
  const DECLARED_ARMS = [
    {
      name: "wall B wider, so wall A is read in reverse",
      room: { shape: "L", widthMm: 1500, depthMm: 4000, heightMm: 2600 },
      runs: {
        A: { wall: "A", startMm: 900, endMm: 5600 },
        B: { wall: "B", startMm: 900, endMm: 1400 },
      },
      reversedWall: "A",
    },
    {
      name: "wall A wider, so wall B is read in reverse",
      room: { shape: "L", widthMm: 4000, depthMm: 1500, heightMm: 2600 },
      runs: {
        A: { wall: "A", startMm: 900, endMm: 1400 },
        B: { wall: "B", startMm: 1000, endMm: 5700 },
      },
      reversedWall: "B",
    },
  ] as const satisfies readonly {
    readonly name: string;
    readonly room: DesignRoom;
    readonly runs: Readonly<Record<TwoWallDispatch, GenerationRun>>;
    readonly reversedWall: TwoWallDispatch;
  }[];

  it.each(DECLARED_ARMS)(
    "gives the drawer to the reversed wall's highest slot index, $name",
    ({ room, runs, reversedWall }) => {
      const plan = planFor(room, runs);
      const slots = alongTheWall(plan, reversedWall).filter(
        isComposedStorageSlot,
      );
      const hob = plan.bases.find((base) => base.role === "hob");
      const bottle = plan.bases.find((base) => base.id === "bottle");

      // The declared design: the hob stands on the wall the run reads first, which no admitted room produces.
      expect(hob?.wall).toBe(reversedWall);
      expect(bottle?.wall).toBe(reversedWall);
      expect(slots).toHaveLength(2);
      // Slots stand corner-outward and the run reads this wall the other way, so the drawer is the outermost, nearest
      // the hob, and the slot against the corner keeps its door; under an ascending count the two bodies would swap
      // with every width, position and remainder unchanged. The bottle stands between that slot and the hob.
      expect(slots.map((slot) => slot.buildId)).toEqual([
        DOOR_BASE_BUILD_ID,
        THREE_DRAWER_BASE_BUILD_ID,
      ]);
      expect(slots.at(-1)?.endMm).toBe(bottle?.startMm);
      expect(bottle?.endMm).toBe(hob?.startMm);
    },
  );

  it.each(DECLARED_ARMS)(
    "stands the pan drawer immediately before the hob in reading order, on the reversed wall, $name",
    ({ room, runs, reversedWall }) => {
      // Read backwards, *before the hob* is spatially past it, away from the corner: a composer inserting the pan
      // drawer by spatial position would stand it between the bottle and the hob. These runs hold three drawer
      // cabinets and no door slot beside the sink, so (e) swaps: the dishwasher takes the preparation 3-drawer's
      // module and the pan drawer carries the preparation id and role (ADR 0110 M7(e)).
      const plan = planFor(room, runs);
      const read = inReadingOrder(plan);
      const hobAt = read.findIndex((base) => base.role === "hob");
      const hob = read[hobAt];
      const panDrawer = read[hobAt - 1];

      expect(panDrawer?.buildId).toBe("base-panbank");
      expect(panDrawer?.id).toBe("preparation");
      expect(panDrawer?.role).toBe("preparation");
      expect(panDrawer?.wall).toBe(reversedWall);
      expect(panDrawer?.startMm).toBe(hob?.endMm);
      expect(read[hobAt - 2]?.id).toBe("dishwasher");
      expect(read[hobAt - 2]?.buildId).toBe(DISHWASHER_BUILD_ID);
      expect(read[hobAt - 2]?.startMm).toBe(panDrawer?.endMm);
      expect(read[hobAt - 3]?.role).toBe("sink");
    },
  );

  it.each(DECLARED_ARMS)(
    "declares runs the L shell does not derive for that room, $name",
    ({ room, runs }) => {
      expect(lShellFloorRuns(room)).not.toEqual(runs);
    },
  );

  it("finds no room in the approved policy that composes the hob onto the reversed wall", () => {
    // The witness is declared because this measures 0: a policy widened until the arm refills goes red here.
    const hobOnTheReversedWall = SWEPT_PLANS.filter(
      (plan) =>
        plan.bases.find((base) => base.role === "hob")?.wall ===
        wallReadInReverse(plan.room),
    );

    expect(hobOnTheReversedWall.map(roomKeyOf)).toEqual([]);
  });
});

describe("7c — the slot lookup names its wall by layout role and never by letter", () => {
  // Witness for the slot lookup naming its wall by layout role: wall B is wider, so the drawer belongs to wall
  // B's first slot, while wall A holds composed slots of its own that the run reads before the hob. A lookup left
  // on the literal `"A"` finds one of those and gives it the drawer. The approved policy holds no room of this
  // shape (a post-hob slot on wall B needs a wall B of 6 100 mm or more; the policy stops at 6 000), so the
  // witness and the band below are declared past it, up to the room schema's 6 300 limit (ADR 0123).
  const DRAWER_ON_THE_WIDER_WALL: DesignRoom = {
    shape: "L",
    widthMm: 4100,
    depthMm: 6100,
    heightMm: 2600,
  };

  it("gives the drawer to the wider wall's slot while the narrower wall's slots keep their doors", () => {
    // Wall A's first module from the corner faces the sink across it, so M1 re-identifies it as the dishwasher
    // (ADR 0110 M1); the three door slots left on wall A keep their doors, which a letter-keyed lookup would break.
    const plan = planFor(DRAWER_ON_THE_WIDER_WALL);
    const slots = plan.bases.filter(isComposedStorageSlot);
    const dishwasher = plan.bases.find(
      (base) => base.buildId === DISHWASHER_BUILD_ID,
    );
    const sink = plan.bases.find((base) => base.role === "sink");

    expect(DRAWER_ON_THE_WIDER_WALL.depthMm).toBeGreaterThan(
      approvedWallBMaxMm(),
    );
    expect(
      slots.map((slot) => [slot.wall, slot.startMm, slot.buildId]),
    ).toEqual([
      ["A", 1500, DOOR_BASE_BUILD_ID],
      ["A", 2100, DOOR_BASE_BUILD_ID],
      ["A", 2700, DOOR_BASE_BUILD_ID],
      ["B", 3600, THREE_DRAWER_BASE_BUILD_ID],
    ]);
    expect([dishwasher?.id, dishwasher?.wall, dishwasher?.startMm]).toEqual([
      "dishwasher",
      "A",
      900,
    ]);
    // Across the corner: each is the first module from the corner on its own wall.
    expect([sink?.wall, sink?.startMm]).toEqual(["B", 900]);
  });

  it("declares its wall-B band wholly past the approved policy, and every room in it placed", () => {
    // The unreachable arm is stated as a test (ADR 0123 decision 3): a policy widened to admit any of these rooms
    // turns this red, and its author restores the in-policy floors.
    expect(DECLARED_WALL_B_WIDER_PLANS.length).toBeGreaterThanOrEqual(200);
    for (const plan of DECLARED_WALL_B_WIDER_PLANS) {
      expect(plan.room.depthMm, roomKeyOf(plan)).toBeGreaterThan(
        approvedWallBMaxMm(),
      );
    }
  });

  it("stands every composed drawer on the wider entered wall, over the whole sweep and the declared band", () => {
    // Both shapes of the sabotage are caught: a drawer moved to the narrower wall, and a drawer that vanished
    // because the narrower wall had no slot to move it to. The floored arm is where a wrong letter has somewhere to
    // land: a drawer in a room whose narrower wall also holds a slot, with wall B the wider. The approved sweep
    // holds none, so its floor follows the population the grid has and the full-strength floor sits on
    // `DECLARED_WALL_B_WIDER_PLANS` (ADR 0123).
    const arms = { withADrawer: 0, wallBWiderAndBothWallsHoldSlots: 0 };
    const declaredArms = { withADrawer: 0, wallBWiderAndBothWallsHoldSlots: 0 };
    const countInto = (
      tally: typeof arms,
      plans: readonly KitchenCompositionPlan[],
    ) => {
      for (const plan of plans) standsEveryDrawerOnTheWiderWall(plan, tally);
    };
    countInto(arms, SWEPT_PLANS);
    countInto(declaredArms, DECLARED_WALL_B_WIDER_PLANS);

    expect(arms.withADrawer).toBeGreaterThanOrEqual(80);
    expect(declaredArms.withADrawer).toBeGreaterThanOrEqual(100);
    expect(
      declaredArms.wallBWiderAndBothWallsHoldSlots,
      "no declared room put a drawer on wall B while wall A also held a slot",
    ).toBeGreaterThanOrEqual(100);
  });

  it("composes a drawer in every kitchen whose run reaches a storage slot after the hob", () => {
    // Stated as a count because the quietest form of the wrong letter is a kitchen with no drawer:
    // `slotsInReadingOrder` on a wall with no slots returns nothing and `firstStorageSlotAfterTheHob` answers
    // `undefined` with every other field right. The in-policy floor follows the population the approved sweep has;
    // the declared band carries the hundred on the wall-B side (ADR 0123).
    const inPolicy = countPostHobDrawers(SWEPT_PLANS);
    const declared = countPostHobDrawers(DECLARED_WALL_B_WIDER_PLANS);

    expect(inPolicy).toBeGreaterThanOrEqual(80);
    expect(declared).toBeGreaterThanOrEqual(100);
  });
});

/** Every plan in the band past the approved policy where wall B is wider and carries a post-hob slot: 50 mm
 *  steps over wall A 1 600-4 000 and wall B 6 100-6 300, 6 300 being the room schema's limit. Each room is
 *  asserted to lie outside the policy where the band is used. */
function declaredWallBWiderPlans(): readonly KitchenCompositionPlan[] {
  const plans: KitchenCompositionPlan[] = [];
  for (let widthMm = 1600; widthMm <= 4000; widthMm += GRID_STEP_MM) {
    for (let depthMm = 6100; depthMm <= 6300; depthMm += GRID_STEP_MM) {
      const plan = planFor({ shape: "L", widthMm, depthMm, heightMm: 2600 });
      if (plan.minimumMet) plans.push(plan);
    }
  }
  return plans;
}

function approvedWallBMaxMm(): number {
  const l = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (!l) throw new Error("the approved policy declares no L");
  return l.wallB.maxMm;
}

function standsEveryDrawerOnTheWiderWall(
  plan: KitchenCompositionPlan,
  tally: { withADrawer: number; wallBWiderAndBothWallsHoldSlots: number },
): void {
  const reversed = wallReadInReverse(plan.room);
  const slots = plan.bases.filter(isComposedStorageSlot);
  const drawers = slots.filter(
    (slot) => slot.buildId === THREE_DRAWER_BASE_BUILD_ID,
  );
  if (drawers.length === 0) return;
  tally.withADrawer += 1;
  if (reversed === "A" && slots.some((slot) => slot.wall === reversed)) {
    tally.wallBWiderAndBothWallsHoldSlots += 1;
  }

  expect(
    drawers.map((drawer) => drawer.wall),
    roomKeyOf(plan),
  ).toEqual([theOtherWall(reversed)]);
}

function countPostHobDrawers(plans: readonly KitchenCompositionPlan[]): number {
  let withAPostHobSlot = 0;
  for (const plan of plans) {
    const read = inReadingOrder(plan);
    const hobAt = read.findIndex((base) => base.role === "hob");
    if (hobAt < 0) throw new Error(`${roomKeyOf(plan)} composed no hob`);
    const afterTheHob = read.slice(hobAt + 1).filter(isComposedStorageSlot);
    if (afterTheHob.length === 0) continue;
    withAPostHobSlot += 1;

    expect(afterTheHob[0]?.buildId, roomKeyOf(plan)).toBe(
      THREE_DRAWER_BASE_BUILD_ID,
    );
  }
  return withAPostHobSlot;
}
