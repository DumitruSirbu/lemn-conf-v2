// What the block must never disturb: the surviving core, the wall cut, the leftover rule's arithmetic and one attempt
// per planned body (ADR 0110 Amendment E5). The oracle for "what 7D2 produced" is the rule refused: a declared column
// height no approved room reaches makes E3's fourth clause false everywhere, so the planner composes as before.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  BOTTLE_CARGO_BUILD_ID,
  buildKitchenLBodyCatalog,
  DISHWASHER_BUILD_ID,
  cabinetDepthMmOf,
  declaredColumnSizes,
  generateKitchen,
  GENERATION_PRIORITIES,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  MAX_GENERATED_LEFTOVER_MM,
  planKitchenComposition,
  planLeftover,
  type DesignRoom,
  type DesignWall,
  type KitchenCompositionPlan,
} from "../../src/index.js";
import { MAX_EMPTY_COLUMN_WIDTH_MM } from "../../src/module-grid.js";
import { widerEnteredWall } from "../support/entered-walls.js";
import { twoWallPlanOf } from "../support/two-wall-plan-of.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";
const OVEN_TOWER = "tall-oven-tower";
const DOOR_COLUMN = "tall-pantry";
const HOB_WITH_DRAWERS = "base-hob-2drawer";
const HOB_WITH_OVEN = "base-hob-oven";
const MAX_BLOCK_COLUMNS = 3;

// `DesignWall` also has "C"; this suite reads `lShellFloorRuns`' two-wall composer.
type TwoWallDispatch = Extract<DesignWall, "A" | "B">;

const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);

/** The catalogue with a column too tall for any admitted room, so E3 clause 4 is false everywhere and the planner
 *  is 7D2's. */
const NO_ROOM_IS_TALL_ENOUGH = {
  ...DECLARED_COLUMNS,
  columnHeightMm: Number.MAX_SAFE_INTEGER,
};

const APPROVED_L = (() => {
  const l = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (!l) throw new Error("the approved policy has no L");
  return l;
})();

const approvedRoom = fc.record({
  shape: fc.constant("L" as const),
  widthMm: fc.integer({
    min: APPROVED_L.wallA.minMm,
    max: APPROVED_L.wallA.maxMm,
  }),
  depthMm: fc.integer({
    min: APPROVED_L.wallB.minMm,
    max: APPROVED_L.wallB.maxMm,
  }),
  heightMm: fc.integer({
    min: APPROVED_ROOM_POLICY.heightBounds.minMm,
    max: APPROVED_ROOM_POLICY.heightBounds.maxMm,
  }),
});

function planFor(
  room: DesignRoom,
  columns = DECLARED_COLUMNS,
): KitchenCompositionPlan {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns,
  });
}

/** The full-height bodies composition stood that the reading order did not, read off the catalogue's `column` band
 *  rather than a build-id list (ADR 0102), so a fourth body reaching the free end is caught. `fridge-free` shares the
 *  band and is excluded by its role. */
function blockOf(plan: KitchenCompositionPlan) {
  return plan.bases.filter(
    (base) =>
      base.role !== "fridge" && CATALOG.get(base.buildId)?.band === "column",
  );
}

/** Where (e) swapped the drawer cabinets, the preparation role is read where the preparation cabinet stood, because
 *  M9 moves the role onto the pan drawer by identity alone: this is the core as composed before the swap. */
function coreShapeOf(plan: KitchenCompositionPlan, room: DesignRoom) {
  const dishwasher = plan.bases.find(
    (base) => base.buildId === DISHWASHER_BUILD_ID,
  );
  const swappedInto = isDrawerSwapped(plan) ? dishwasher : undefined;
  const traded = tradedDishwasherOf(plan, room);
  return plan.bases
    .filter((base) => base.role !== "storage")
    .map((base) => {
      const stood =
        base.role === "preparation" && swappedInto ? swappedInto : base;
      const core = {
        role: base.role,
        wall: stood.wall,
        startMm: stood.startMm,
        endMm: stood.endMm,
      };
      return traded && isBeyond(core, traded)
        ? shiftedBy(core, -DISHWASHER_WIDTH_MM)
        : core;
    });
}

/** Whether a core module stands beyond the traded dishwasher on its wall, among the bodies the trade shifted. */
function isBeyond(
  core: { readonly wall: TwoWallDispatch; readonly startMm: number },
  traded: PlannedBase,
): boolean {
  return core.wall === traded.wall && core.startMm >= traded.endMm;
}

/** The dishwasher's planned width as a literal (ADR 0121 decision 4), the one distance a trade may shift the wall. */
const DISHWASHER_WIDTH_MM = 600;

/** The traded dishwasher, told from S1's by where it stands: a run item read directly after the sink, so on the
 *  free-end wall it starts where the sink ends. M1 conversions never stand there; (e)'s is marked by the pan drawer
 *  carrying the preparation role. */
function tradedDishwasherOf(
  plan: KitchenCompositionPlan,
  room: DesignRoom,
): PlannedBase | undefined {
  const wall = freeEndWallOf(room);
  const sink = plan.bases.find((base) => base.role === "sink");
  if (!sink || sink.wall !== wall || isDrawerSwapped(plan)) return undefined;
  return plan.bases.find(
    (base) =>
      base.buildId === DISHWASHER_BUILD_ID &&
      base.wall === wall &&
      base.startMm === sink.endMm,
  );
}

/** (e)'s mark on a plan: the pan drawer carrying the preparation role (ADR 0110 M7(e), M9). */
function isDrawerSwapped(plan: KitchenCompositionPlan): boolean {
  return plan.bases.some(
    (base) => base.buildId === "base-panbank" && base.role === "preparation",
  );
}

/** 12 % of the rule-planned approved L at 50 mm carries a traded dishwasher; 300 draws delivered 31-39 over 8
 *  unseeded runs, floored well below. */
const TRADED_SHIFT_ARM_FLOOR = 10;

/** The pan drawer's own width (7D5 S2), and so the only distance the block may move the hob. */
const PAN_DRAWER_WIDTH_MM = 600;

function panDrawerCountOf(plan: KitchenCompositionPlan): number {
  return plan.bases.filter((base) => base.buildId === "base-panbank").length;
}

function shiftedBy<
  Span extends { readonly startMm: number; readonly endMm: number },
>(span: Span, shiftMm: number): Span {
  return {
    ...span,
    startMm: span.startMm + shiftMm,
    endMm: span.endMm + shiftMm,
  };
}

/** The wall the run ends on and the block stands at the free end of: the wider entered wall, wall A where equal (ADR
 *  0110 Amendment I). Derived in `entered-walls.ts` from the entered numbers, not read back off the plan, so a block
 *  on the other wall fails these assertions instead of redefining them. */
function freeEndWallOf(room: DesignRoom): TwoWallDispatch {
  return widerEnteredWall(room);
}

function freeEndOf(plan: KitchenCompositionPlan, room: DesignRoom) {
  return freeEndBeside(plan, { room, isStanding: isCoreOrBottle });
}

type PlannedBase = KitchenCompositionPlan["bases"][number];

function isCoreOrBottle(base: PlannedBase): boolean {
  return base.role !== "storage" || base.buildId === BOTTLE_CARGO_BUILD_ID;
}

/** The leftover the free-end wall's run leaves beside the modules `isStanding` names. */
function freeEndBeside(
  plan: KitchenCompositionPlan,
  args: {
    readonly room: DesignRoom;
    readonly isStanding: (base: PlannedBase) => boolean;
  },
) {
  const wall = freeEndWallOf(args.room);
  const run = lShellFloorRuns(args.room)[wall];
  const standingWidthMm = plan.bases
    .filter((base) => base.wall === wall && args.isStanding(base))
    .reduce((sum, base) => sum + base.widthMm, 0);
  return planLeftover(run.endMm - run.startMm - standingWidthMm);
}

/** The threshold drawer is a module of the run, read after the hob, never a leftover module the block may take; it
 *  may cost one column (see ADR 0110 L1). */
const THRESHOLD_DRAWER_ID = "threshold-drawer";
const PAN_DRAWER_ID = "pan-drawer";
const THRESHOLD_DRAWER_MOST_COLUMNS = 1;
/** Measured 82-120 of `THRESHOLD_ARM_DRAWS` over 20 unseeded runs, floored well below so a seed cannot trip it; the
 *  sample is raised rather than the floor cut to fit a thinner one (ADR 0091 Amendment A). */
const THRESHOLD_ARM_FLOOR = 30;
const THRESHOLD_ARM_DRAWS = 16_000;

/** Against the free end with its module handed back, a traded dishwasher costs one column wherever it stands. */
const COLUMNS_A_TRADED_DISHWASHER_COSTS = 1;
/** 12.7 % of placed rooms carry a traded dishwasher, 4.2 % a (c) one (2 022-2 079 and 652-704 over 8 unseeded runs
 *  of 16 000 draws); floored far below both. */
const TRADED_DISHWASHER_ARM_FLOOR = 300;
const TOWER_TRADED_ARM_FLOOR = 200;

function thresholdDrawerWidthOf(plan: KitchenCompositionPlan): number {
  return plan.bases
    .filter((base) => base.id === THRESHOLD_DRAWER_ID)
    .reduce((sum, base) => sum + base.widthMm, 0);
}

/** The free end E3 reads: what the run leaves beside every module it stood, the pan drawer and threshold drawer
 *  included. `freeEndOf` counts the pan drawer's module as leftover, which is wrong beside a threshold drawer that
 *  cost a column. */
function freeEndBesideTheThresholdDrawerOf(
  plan: KitchenCompositionPlan,
  room: DesignRoom,
) {
  const traded = tradedDishwasherOf(plan, room);
  return freeEndBeside(plan, {
    room,
    isStanding: (base) =>
      isRunModuleBesideTheThresholdDrawer(base) ||
      base.id === THRESHOLD_DRAWER_ID ||
      base === traded,
  });
}

/** The free end the threshold drawer's module is handed back to: the block the kitchen would have had without it. */
function freeEndWithoutTheThresholdDrawerOf(
  plan: KitchenCompositionPlan,
  room: DesignRoom,
) {
  const traded = tradedDishwasherOf(plan, room);
  return freeEndBeside(plan, {
    room,
    isStanding: (base) =>
      isRunModuleBesideTheThresholdDrawer(base) || base === traded,
  });
}

/** The free end with the traded dishwasher's module handed back: the block the kitchen would have had without the
 *  trade, the threshold drawer still standing. */
function freeEndWithoutTheTradedDishwasherOf(
  plan: KitchenCompositionPlan,
  room: DesignRoom,
) {
  return freeEndBeside(plan, {
    room,
    isStanding: (base) =>
      isRunModuleBesideTheThresholdDrawer(base) ||
      base.id === THRESHOLD_DRAWER_ID,
  });
}

function isRunModuleBesideTheThresholdDrawer(base: PlannedBase): boolean {
  return isCoreOrBottle(base) || base.id === PAN_DRAWER_ID;
}

/** E3's four clauses and E6.2's one refusal, restated from the ADR's inputs (declared column sizes and ADR 0052's
 *  ceiling on an empty column) rather than from the rule's code. `leftover` is the free end the block is decided on:
 *  read beside the threshold drawer, with `freeEndWithoutTheThresholdDrawerOf` giving the block it would have had. */
function expectedBlockSize(
  plan: KitchenCompositionPlan,
  room: DesignRoom,
  leftover = freeEndBesideTheThresholdDrawerOf(plan, room),
): number {
  const hob = plan.bases.find((base) => base.role === "hob");
  const qualifies =
    plan.dropped.length === 0 &&
    hob?.wall === freeEndWallOf(room) &&
    leftover.storageCount >= 1 &&
    room.heightMm >= DECLARED_COLUMNS.columnHeightMm;
  if (!qualifies) return 0;

  const size = Math.min(MAX_BLOCK_COLUMNS, leftover.storageCount);
  const wouldMerge =
    leftover.remainderMm > 0 &&
    DECLARED_COLUMNS.columnWidthMm + leftover.remainderMm <=
      MAX_EMPTY_COLUMN_WIDTH_MM;
  // A block of one ends in the fixed-width oven tower, which cannot take a merged opening.
  return size === 1 && wouldMerge ? 0 : size;
}

describe("the threshold and the block's size (criterion 6)", () => {
  it("stands a block exactly when the four clauses hold, at the largest size that fits", () => {
    // E3 clause 2 (the hob off the free-end wall) is no longer sampled: the run follows the wider wall, so the hob
    // always stands there. The clause is asserted at the rule's unit boundary in `tall-end-rule.test.ts` (ADR 0091
    // Amendment A); the `qualifies` expression still reads it.
    //
    // Restated for the threshold drawer (at most one column, ADR 0110 L1) and the traded dishwasher, a run module
    // read after the sink and never a leftover module: against the block its module would give back it costs exactly
    // one column wherever it stands, and none where no traded dishwasher stands. Where that column was the block's
    // last, the hob carries the oven (M12).
    const arms = {
      none: 0,
      dropped: 0,
      hobOffTheFreeEndWall: 0,
      noModule: 0,
      one: 0,
      two: 0,
      three: 0,
    };
    let thresholdDrawerCostAColumn = 0;
    const tradedDishwasher = { costAColumn: 0, tookTheLastColumn: 0 };
    fc.assert(
      fc.property(approvedRoom, (room) => {
        const plan = planFor(room);
        if (!plan.minimumMet) return;
        const size = blockOf(plan).length;
        const where = `${String(room.widthMm)}x${String(room.depthMm)}x${String(room.heightMm)}`;
        expect(size, where).toBe(expectedBlockSize(plan, room));
        const withTheDrawersModule = expectedBlockSize(
          plan,
          room,
          freeEndWithoutTheThresholdDrawerOf(plan, room),
        );
        expect(withTheDrawersModule - size, where).toBeLessThanOrEqual(
          thresholdDrawerWidthOf(plan) > 0 ? THRESHOLD_DRAWER_MOST_COLUMNS : 0,
        );
        if (withTheDrawersModule > size) thresholdDrawerCostAColumn += 1;

        const withTheDishwashersModule = expectedBlockSize(
          plan,
          room,
          freeEndWithoutTheTradedDishwasherOf(plan, room),
        );
        const isTraded = tradedDishwasherOf(plan, room) !== undefined;
        expect(withTheDishwashersModule - size, where).toBe(
          isTraded ? COLUMNS_A_TRADED_DISHWASHER_COSTS : 0,
        );
        if (isTraded) tradedDishwasher.costAColumn += 1;
        if (isTraded && size === 0) {
          tradedDishwasher.tookTheLastColumn += 1;
          expect(
            plan.bases.find((base) => base.role === "hob")?.buildId,
            where,
          ).toBe(HOB_WITH_OVEN);
        }

        if (plan.dropped.length > 0) arms.dropped += size === 0 ? 1 : 0;
        if (
          plan.bases.find((base) => base.role === "hob")?.wall !==
          freeEndWallOf(room)
        ) {
          arms.hobOffTheFreeEndWall += 1;
        }
        if (freeEndOf(plan, room).storageCount === 0) {
          arms.noModule += size === 0 ? 1 : 0;
        }
        if (size === 0) arms.none += 1;
        if (size === 1) arms.one += 1;
        if (size === 2) arms.two += 1;
        if (size === 3) arms.three += 1;
      }),
      { numRuns: THRESHOLD_ARM_DRAWS },
    );

    // A property that never samples an arm proves nothing about it.
    const { hobOffTheFreeEndWall, ...sampledArms } = arms;
    for (const [arm, count] of Object.entries(sampledArms)) {
      expect(count, `the ${arm} arm never fired`).toBeGreaterThanOrEqual(100);
    }
    // Asserted as a must-not: a sample finding the hob off the free-end wall means the re-sited clause above became
    // reachable from a room again.
    expect(hobOffTheFreeEndWall).toBe(0);
    // The sanctioned cost must be sampled, or the restatement above is idle.
    expect(
      thresholdDrawerCostAColumn,
      "no sample saw the threshold drawer cost a column",
    ).toBeGreaterThanOrEqual(THRESHOLD_ARM_FLOOR);
    // Both arms of the trade's restatement, or it is idle.
    expect(
      tradedDishwasher.costAColumn,
      "no sample stood a traded dishwasher",
    ).toBeGreaterThanOrEqual(TRADED_DISHWASHER_ARM_FLOOR);
    expect(
      tradedDishwasher.tookTheLastColumn,
      "no sample saw (c) take the lone tower",
    ).toBeGreaterThanOrEqual(TOWER_TRADED_ARM_FLOOR);
  });
});

describe("the hob follows the block, and only the block (criteria 3, 5)", () => {
  it("carries drawers if and only if a tower stands, and exactly one hob body either way", () => {
    const arms = { withATower: 0, withoutOne: 0 };
    fc.assert(
      fc.property(approvedRoom, (room) => {
        const plan = planFor(room);
        if (!plan.minimumMet) return;
        const hobs = plan.bases.filter((base) =>
          [HOB_WITH_DRAWERS, HOB_WITH_OVEN].includes(base.buildId),
        );
        const towers = plan.bases.filter((base) => base.buildId === OVEN_TOWER);

        expect(hobs).toHaveLength(1);
        expect(towers.length).toBeLessThanOrEqual(1);
        expect(hobs[0]?.buildId === HOB_WITH_DRAWERS).toBe(towers.length === 1);
        if (towers.length === 1) arms.withATower += 1;
        else arms.withoutOne += 1;
      }),
      { numRuns: 900 },
    );

    // An if-and-only-if needs both sides sampled. The sample was raised from 300 rather than a floor cut: the
    // no-tower arm thinned once the block followed the run onto wall B (ADR 0091 Amendment A).
    expect(arms.withATower, "the tower arm never fired").toBeGreaterThanOrEqual(
      100,
    );
    expect(
      arms.withoutOne,
      "the no-tower arm never fired",
    ).toBeGreaterThanOrEqual(100);
  });

  it("stands every column on the wider entered wall and none against a run's corner end", () => {
    // A column stands at the run's free end and never against its corner; the block follows the run, which follows
    // the wider entered wall (ADR 0110 Amendment I).
    const arms = { onWallA: 0, onWallB: 0 };
    fc.assert(
      fc.property(approvedRoom, (room) => {
        const runs = lShellFloorRuns(room);
        for (const column of blockOf(planFor(room))) {
          if (column.wall === "A") arms.onWallA += 1;
          else arms.onWallB += 1;

          expect(
            column.wall,
            `${String(room.widthMm)}x${String(room.depthMm)}`,
          ).toBe(freeEndWallOf(room));
          expect(column.startMm).toBeGreaterThan(runs[column.wall].startMm);
        }
      }),
      { numRuns: 900 },
    );

    // The loop body is the whole assertion, so a sample that stood no block asserts nothing, and a rule stated as
    // "the wider wall" needs both arms. Each arm carries a floor of 100; the sample was raised from 300 to reach it
    // rather than the floor lowered. Wall B is the scarce arm: over 60 unseeded draws of 900 it never fell below 338
    // columns and wall A never below 856.
    expect(arms.onWallA, "the wall-A arm never fired").toBeGreaterThanOrEqual(
      100,
    );
    expect(arms.onWallB, "the wall-B arm never fired").toBeGreaterThanOrEqual(
      100,
    );
  });

  it("keeps the block contiguous and outermost on its own wall wherever one stands", () => {
    let withABlock = 0;
    fc.assert(
      fc.property(approvedRoom, (room) => {
        const plan = planFor(room);
        const block = blockOf(plan);
        if (block.length === 0) return;
        withABlock += 1;
        const onTheBlocksWall = plan.bases.filter(
          (base) => base.wall === freeEndWallOf(room),
        );

        expect(onTheBlocksWall.slice(-block.length)).toEqual(block);
        expect(block.at(-1)?.endMm).toBe(
          Math.max(...onTheBlocksWall.map((base) => base.endMm)),
        );
        expect(
          block.every(
            (column, index) =>
              index === 0 || column.startMm === block[index - 1]?.endMm,
          ),
        ).toBe(true);
      }),
      { numRuns: 400 },
    );
    expect(withABlock).toBeGreaterThanOrEqual(150);
  });
});

describe("what the block must not disturb (criteria 12, 13)", () => {
  // The rule-refused plan differs from the planned one only by: the pan drawer taking the module the block would have
  // stood in, so the hob may stand one pan drawer later (ADR 0110 K1); the (e) swap moving the preparation role onto
  // the pan drawer by identity alone (M9), which `coreShapeOf` reads at the preparation cabinet's module; and a
  // traded dishwasher shifting the preparation cabinet and hob one 600 mm module along its wall (M7). Every other
  // core position is asserted.
  it("leaves the surviving core, the dropped list and the wall cut where 7D2 put them, but for the pan drawer's shift of the hob", () => {
    let withABlock = 0;
    let panDrawerOnlyWithoutTheBlock = 0;
    let drawerSwapOnOneSideOnly = 0;
    let shiftedByATradedDishwasher = 0;
    fc.assert(
      fc.property(approvedRoom, (room) => {
        const withTheRule = planFor(room);
        const withoutIt = planFor(room, NO_ROOM_IS_TALL_ENOUGH);
        if (blockOf(withTheRule).length > 0) withABlock += 1;
        const hobShiftMm =
          PAN_DRAWER_WIDTH_MM *
          (panDrawerCountOf(withTheRule) - panDrawerCountOf(withoutIt));
        if (hobShiftMm !== 0) panDrawerOnlyWithoutTheBlock += 1;
        if (isDrawerSwapped(withTheRule) !== isDrawerSwapped(withoutIt))
          drawerSwapOnOneSideOnly += 1;
        const traded = tradedDishwasherOf(withTheRule, room);
        if (traded) {
          shiftedByATradedDishwasher += 1;
          expect(traded.endMm - traded.startMm).toBe(DISHWASHER_WIDTH_MM);
        }

        expect(withTheRule.minimumMet).toBe(withoutIt.minimumMet);
        expect(withTheRule.dropped).toEqual(withoutIt.dropped);
        expect(coreShapeOf(withTheRule, room)).toEqual(
          coreShapeOf(withoutIt, room).map((core) =>
            core.role === "hob" ? shiftedBy(core, hobShiftMm) : core,
          ),
        );
      }),
      { numRuns: 300 },
    );
    expect(withABlock).toBeGreaterThanOrEqual(100);
    expect(
      panDrawerOnlyWithoutTheBlock,
      "the pan-drawer arm never fired",
    ).toBeGreaterThanOrEqual(50);
    // The counterexample's own arm, or the restated `coreShapeOf` is idle; measured 35-49 of 300 draws, floored below.
    expect(
      drawerSwapOnOneSideOnly,
      "no sample swapped the drawer cabinets on one side only",
    ).toBeGreaterThanOrEqual(20);
    // The ruled shift's own arm, or the restated `coreShapeOf` is idle.
    expect(
      shiftedByATradedDishwasher,
      "no sample stood a traded dishwasher",
    ).toBeGreaterThanOrEqual(TRADED_SHIFT_ARM_FLOOR);
  });

  it("takes whole leftover modules and reports the bare wall the run actually leaves", () => {
    let withABlock = 0;
    let withAnAbsorb = 0;
    fc.assert(
      fc.property(approvedRoom, (room) => {
        const plan = planFor(room);
        if (!plan.minimumMet) return;
        const runs = lShellFloorRuns(room);
        const leftover = freeEndOf(plan, room);
        const block = blockOf(plan);
        if (block.length > 0) withABlock += 1;
        if ((block.at(-1)?.widthMm ?? 0) > DECLARED_COLUMNS.columnWidthMm) {
          withAnAbsorb += 1;
        }

        // A column stands where a storage module would have: the count the leftover rule returns is
        // what the free-end wall receives, whichever bodies fill it.
        expect(
          plan.bases.filter(
            (base) =>
              base.wall === freeEndWallOf(room) &&
              base.role === "storage" &&
              base.buildId !== BOTTLE_CARGO_BUILD_ID,
          ),
        ).toHaveLength(leftover.storageCount);

        for (const wall of ["A", "B"] as const) {
          const composedMm = plan.bases
            .filter((base) => base.wall === wall)
            .reduce((sum, base) => sum + base.widthMm, 0);
          expect(plan.remainderMm[wall]).toBe(
            runs[wall].endMm - runs[wall].startMm - composedMm,
          );
          expect(plan.remainderMm[wall]).toBeLessThanOrEqual(
            MAX_GENERATED_LEFTOVER_MM,
          );
          expect(plan.remainderMm[wall]).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 1000 },
    );

    // The clause this is about is "including 0" in the absorb case, which only a sample whose outermost
    // column took a merged width exercises. The floors come from observed runs, not the uniform rate (`fc.integer` is
    // boundary-biased: 17 delivered where 42 was predicted), so a seed cannot trip them.
    expect(withABlock, "the block arm never fired").toBeGreaterThanOrEqual(100);
    expect(
      withAnAbsorb,
      "no sample absorbed a remainder, so the 0 case this exists for was never reached",
    ).toBeGreaterThanOrEqual(20);
  });
});

describe("every planned body is attempted exactly once (criterion 15)", () => {
  it("logs one base step per planned base, with no duplicate and no omission", () => {
    let withABlock = 0;
    fc.assert(
      fc.property(approvedRoom, (room) => {
        const result = generateKitchen({
          room,
          occurredAt: OCCURRED_AT,
          probeAt: createFakeProbeFactory(),
        });
        if (!result.ok) return;
        if (blockOf(twoWallPlanOf(result.log)).length > 0) withABlock += 1;
        const baseStepIds = result.log.steps
          .filter((step) => !["upper", "hood", "top"].includes(step.role))
          .map((step) => step.id);

        // Every planned base plus the core roles the plan had no wall for, and nothing else: a body falling through
        // `compose`'s passes would otherwise go missing unnoticed.
        expect([...baseStepIds].sort()).toEqual(
          [
            ...result.log.plan.bases.map((base) => base.id),
            ...result.log.plan.dropped,
          ].sort(),
        );
        expect(new Set(baseStepIds).size).toBe(baseStepIds.length);
      }),
      { numRuns: 150 },
    );
    expect(withABlock).toBeGreaterThan(0);
  });
});

describe("the room rule is unmoved (criterion 17)", () => {
  it("keeps the minimum kitchen a sink and a hob, and names no column in the priorities", () => {
    expect(
      GENERATION_PRIORITIES.filter((priority) => priority.required).map(
        (priority) => priority.role,
      ),
    ).toEqual(["sink", "hob"]);
    expect(GENERATION_PRIORITIES.map((priority) => priority.role)).toEqual([
      "fridge",
      "sink",
      "preparation",
      "hob",
    ]);
    expect(
      GENERATION_PRIORITIES.every((priority) => priority.widthMm > 0),
    ).toBe(true);
    expect(
      GENERATION_PRIORITIES.some((priority) =>
        [OVEN_TOWER, DOOR_COLUMN].includes(priority.buildId),
      ),
    ).toBe(false);
  });

  it("keeps the approved policy's own numbers where the wave found them", () => {
    // A fixed snapshot of the approved policy (ADR 0108 Amendment G, H1-H4); `approved-room-policy.test.ts` pins the
    // same numbers.
    expect(APPROVED_ROOM_POLICY).toEqual({
      approval: "owner-approved",
      buildableShapes: {
        L: {
          wallA: { minMm: 900, maxMm: 6000 },
          wallB: { minMm: 1000, maxMm: 6000 },
          minimumKitchen: {
            isRequired: true,
            sinkWidthMm: 600,
            hobWidthMm: 600,
            cornerReachMm: { wallA: 900, wallB: 1000 },
          },
        },
        U: {
          wallA: { minMm: 2700, maxMm: 6000 },
          wallB: { minMm: 1000, maxMm: 6000 },
          wallC: { minMm: 1000, maxMm: 6000 },
          minimumKitchen: {
            isRequired: true,
            sinkWidthMm: 600,
            hobWidthMm: 600,
            cornerReachMm: { wallA: 1800, sideWall: 1000 },
          },
        },
        linear: {
          wallA: { minMm: 1200, maxMm: 6000 },
          depthMm: 3400,
        },
      },
      heightBounds: { minMm: 2200, maxMm: 3900 },
    });
  });
});
