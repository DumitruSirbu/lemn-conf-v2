// M7 wave 7D3 slice S2 — what the block must never disturb: the surviving core, the wall cut, the
// leftover rule's arithmetic, and the one-attempt-per-planned-body guarantee (ADR 0110 Amendment E5).
//
// **The oracle for "what 7D2 produced" is the rule refused, not a recorded fixture.** Planning the
// same room with a declared column height no approved room can reach makes E3's fourth clause false
// everywhere, so the planner composes exactly what it composed before this wave — and the comparison
// stays true when a width changes rather than going stale.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  BOTTLE_CARGO_BUILD_ID,
  buildKitchenLBodyCatalog,
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
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";
const OVEN_TOWER = "tall-oven-tower";
const DOOR_COLUMN = "tall-pantry";
const HOB_WITH_DRAWERS = "base-hob-2drawer";
const HOB_WITH_OVEN = "base-hob-oven";
const MAX_BLOCK_COLUMNS = 3;

const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);

/** The same catalogue with a column too tall for any room the engine admits, so E3 clause 4 is false
 *  everywhere and the planner is 7D2's. */
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

/** The full-height bodies composition stood that the reading order did not — read off the
 *  catalogue's own `column` band rather than a list of build ids this file would keep in step by
 *  hand (ADR 0102), so a fourth body reaching the free end is caught rather than ignored.
 *  `fridge-free` is declared in the same band and is Amendment A1's, so its role excludes it. */
function blockOf(plan: KitchenCompositionPlan) {
  return plan.bases.filter(
    (base) =>
      base.role !== "fridge" && CATALOG.get(base.buildId)?.band === "column",
  );
}

function coreShapeOf(plan: KitchenCompositionPlan) {
  return plan.bases
    .filter((base) => base.role !== "storage")
    .map((base) => ({
      role: base.role,
      wall: base.wall,
      startMm: base.startMm,
      endMm: base.endMm,
    }));
}

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

/**
 * The wall the run ends on, and the wall the block therefore stands at the free end of: the **wider
 * entered wall**, and wall A where the two are equal (ADR 0120 Amendment E; ADR 0110 Amendment I,
 * which overturns Amendment E's *"wall A and nowhere else"*).
 *
 * **Derived in `entered-walls.ts` from the room's two entered numbers rather than read back off the
 * plan**, so a block that moved to the other wall fails these assertions instead of redefining them.
 */
function freeEndWallOf(room: DesignRoom): DesignWall {
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

/** 7D5 S3 / Q-H5 (owner ruling 2026-09-21): the threshold drawer is a module of the run, read after the
 *  hob, and never a leftover module the block may take — the owner sanctions it costing one column. */
const THRESHOLD_DRAWER_ID = "threshold-drawer";
const PAN_DRAWER_ID = "pan-drawer";
const THRESHOLD_DRAWER_MOST_COLUMNS = 1;
/** 7D5 S3: measured at 80-96 of 4000 unseeded draws over 8 runs; set well below so a seed cannot trip
 *  it, while a composer that stopped standing the drawer still fails. */
const THRESHOLD_ARM_FLOOR = 30;

function thresholdDrawerWidthOf(plan: KitchenCompositionPlan): number {
  return plan.bases
    .filter((base) => base.id === THRESHOLD_DRAWER_ID)
    .reduce((sum, base) => sum + base.widthMm, 0);
}

/** The free end E3 reads: what the run leaves beside every module it stood, the pan drawer and the
 *  threshold drawer included. 7D5 S3 / Q-H5: `freeEndOf` counts the pan drawer's module as leftover,
 *  which was the same answer while the pan drawer never cost a column (J1); beside a threshold drawer
 *  that cost one, it is not, so both drawers are read here as the run modules they are. */
function freeEndBesideTheThresholdDrawerOf(
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

/** 7D5 S3 / Q-H5: the free end the threshold drawer's module is handed back to — the block the
 *  kitchen would have had without it. */
function freeEndWithoutTheThresholdDrawerOf(
  plan: KitchenCompositionPlan,
  room: DesignRoom,
) {
  return freeEndBeside(plan, {
    room,
    isStanding: isRunModuleBesideTheThresholdDrawer,
  });
}

function isRunModuleBesideTheThresholdDrawer(base: PlannedBase): boolean {
  return isCoreOrBottle(base) || base.id === PAN_DRAWER_ID;
}

/** E3's four clauses and E6.2's one refusal, restated from the ADR's own inputs — the declared
 *  column sizes and ADR 0052's ceiling on an empty column — rather than from the rule's code.
 *  `leftover` is the free end the block is decided on: 7D5 S3 / Q-H5 reads it beside the threshold
 *  drawer, and `freeEndWithoutTheThresholdDrawerOf` gives the block it would have had. */
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
    // **E3 clause 2 — the hob standing anywhere but the free-end wall — is no longer sampled here,
    // and the clause is not weakened: it moved.** The run now follows the wider entered wall and the
    // hob is the run's last core role, so the hob stands on the free-end wall in every room the
    // approved policy admits (M7 wave 7D8 criterion 1, 0 exceptions on both arms). The clause is
    // asserted at the rule's own unit boundary instead, against a declared input rather than a room:
    // `tall-end-rule.test.ts`, `hobStandsOnTheFreeEndWall: false` — ADR 0091 Amendment A, coverage
    // moved rather than dropped. The `qualifies` expression above still reads it, so a composer that
    // stopped honouring it fails on the size rather than on an arm count.
    //
    // 7D5 S3 / Q-H5 (owner ruling 2026-09-21): restated for the threshold drawer. The block is E3 on the
    // free end the run leaves beside that drawer, and against the block the drawer's module would
    // have given it, the drawer costs at most the one column the owner sanctions.
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
      { numRuns: 4000 },
    );

    // A property that never samples an arm proves nothing about it.
    const { hobOffTheFreeEndWall, ...sampledArms } = arms;
    for (const [arm, count] of Object.entries(sampledArms)) {
      expect(count, `the ${arm} arm never fired`).toBeGreaterThanOrEqual(100);
    }
    // Reported rather than floored, and asserted as the must-not it now is: a sample that found the
    // hob off the free-end wall would mean criterion 1 had stopped holding and the re-sited clause
    // above had become reachable from a room again.
    expect(hobOffTheFreeEndWall).toBe(0);
    // 7D5 S3 / Q-H5: the sanctioned cost must be sampled, or the restatement above is idle.
    expect(
      thresholdDrawerCostAColumn,
      "no sample saw the threshold drawer cost a column",
    ).toBeGreaterThanOrEqual(THRESHOLD_ARM_FLOOR);
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

    // An *if and only if* needs both sides sampled: a run that never stood a tower would agree with
    // a planner that never substitutes, and one that always did would agree with a planner that
    // always substitutes.
    //
    // **The sample was raised from 300 and neither floor was lowered.** M7 wave 7D8 lets the block
    // follow the run onto wall B, so a tower stands in 34 275 more rooms than it did (criterion 10)
    // and the no-tower arm thinned to 77 of 300 draws. The arm did not empty; the instrument stopped
    // reaching its hundred, and a floor cut to fit a shrunken sample is the failure ADR 0091
    // Amendment A forbids.
    expect(arms.withATower, "the tower arm never fired").toBeGreaterThanOrEqual(
      100,
    );
    expect(
      arms.withoutOne,
      "the no-tower arm never fired",
    ).toBeGreaterThanOrEqual(100);
  });

  it("stands every column on the wider entered wall and none against a run's corner end", () => {
    // **The letter moved and the rule did not.** ADR 0110 Amendment I overturns Amendment E's *"wall
    // A … and nowhere else"*: the block follows the run, and the run follows the wider entered wall,
    // so a column stands on wall B in 47 175 placed rooms (7D8 criterion 10). What never moved is
    // that a column stands at the run's **free** end and never against its corner.
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

    // The loop body is the whole assertion, so a sample that stood no block asserts nothing at all —
    // and a rule stated as *the wider wall* needs both arms, or it agrees with the letter it replaced.
    //
    // **Each arm carries risk 14's hundred, and the sample was raised from 300 to reach it rather
    // than the floor lowered to fit** — the same trade this file's tower arm made three tests above.
    // The wall-B arm is the scarce one: measured over 60 unseeded draws of 900, it never fell below
    // 338 columns and the wall-A arm never below 856, where 300 draws put wall B as low as 92. Two
    // floors of a hundred also state the old combined floor of 150 and more, so it is gone rather
    // than restated.
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
  // Second restatement of 7D3 criterion 12 (the first was 7D5 S1, ADR 0110 Amendment J4). 7D5 S2 (owner
  // ruling 2026-09-21, Q-H6a = A): with no block the 600 mm pan drawer before the hob takes the
  // module the block would have stood in, and the block never gives a column up for it, so the hob
  // may stand exactly one pan drawer later in the rule-refused plan. Every core role still keeps its
  // wall — so the cut is unchanged — and `dropped` is unchanged; no other core position may move.
  it("leaves the surviving core, the dropped list and the wall cut where 7D2 put them, but for the pan drawer's shift of the hob", () => {
    let withABlock = 0;
    let panDrawerOnlyWithoutTheBlock = 0;
    fc.assert(
      fc.property(approvedRoom, (room) => {
        const withTheRule = planFor(room);
        const withoutIt = planFor(room, NO_ROOM_IS_TALL_ENOUGH);
        if (blockOf(withTheRule).length > 0) withABlock += 1;
        const hobShiftMm =
          PAN_DRAWER_WIDTH_MM *
          (panDrawerCountOf(withTheRule) - panDrawerCountOf(withoutIt));
        if (hobShiftMm !== 0) panDrawerOnlyWithoutTheBlock += 1;

        expect(withTheRule.minimumMet).toBe(withoutIt.minimumMet);
        expect(withTheRule.dropped).toEqual(withoutIt.dropped);
        expect(coreShapeOf(withTheRule)).toEqual(
          coreShapeOf(withoutIt).map((core) =>
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

    // The clause this is really about is "**including 0** in the absorb case" (criterion 13), which
    // only a sample whose outermost column took a merged width exercises at all.
    //
    // **The floors are set from observed runs, not from the uniform rate.** Over uniform draws the
    // absorb arm is 14 % of rooms, which at 300 runs predicts 42; `fc.integer` is boundary-biased and
    // actually delivered 17, so a floor picked from the uniform model is a flaky gate. The sample is
    // raised instead and both floors left far enough below what the generator delivers that a seed
    // cannot trip them, while still failing a run that genuinely stopped reaching the arm.
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
        if (blockOf(result.log.plan).length > 0) withABlock += 1;
        const baseStepIds = result.log.steps
          .filter((step) => !["upper", "hood"].includes(step.role))
          .map((step) => step.id);

        // Every planned base, plus the core roles the plan had no wall for — and nothing else. A
        // body that fell through `compose`'s passes would go missing from this list while its tile
        // stayed empty and the hob had already given up its oven.
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
    // The wall maxima were 6300 / 5100 when 7D3 left them; M7 7A3 moved both to the owner's 6000 mm
    // (ADR 0120 Amendment B2). Everything else here is still what 7D3 found.
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
      },
      heightBounds: { minMm: 2200, maxMm: 3900 },
    });
  });
});
