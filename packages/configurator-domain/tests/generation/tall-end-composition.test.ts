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
  type KitchenCompositionPlan,
} from "../../src/index.js";
import { MAX_EMPTY_COLUMN_WIDTH_MM } from "../../src/module-grid.js";
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

function freeEndOf(plan: KitchenCompositionPlan, room: DesignRoom) {
  const run = lShellFloorRuns(room).A;
  const coreWidthMm = plan.bases
    .filter((base) => base.wall === "A" && base.role !== "storage")
    .reduce((sum, base) => sum + base.widthMm, 0);
  return planLeftover(run.endMm - run.startMm - coreWidthMm);
}

/** E3's four clauses and E6.2's one refusal, restated from the ADR's own inputs — the declared
 *  column sizes and ADR 0052's ceiling on an empty column — rather than from the rule's code. */
function expectedBlockSize(
  plan: KitchenCompositionPlan,
  room: DesignRoom,
): number {
  const hob = plan.bases.find((base) => base.role === "hob");
  const leftover = freeEndOf(plan, room);
  const qualifies =
    plan.dropped.length === 0 &&
    hob?.wall === "A" &&
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
    const arms = {
      none: 0,
      dropped: 0,
      hobOnB: 0,
      noModule: 0,
      one: 0,
      two: 0,
      three: 0,
    };
    fc.assert(
      fc.property(approvedRoom, (room) => {
        const plan = planFor(room);
        if (!plan.minimumMet) return;
        const size = blockOf(plan).length;
        expect(size, `${String(room.widthMm)}x${String(room.depthMm)}`).toBe(
          expectedBlockSize(plan, room),
        );

        if (plan.dropped.length > 0) arms.dropped += size === 0 ? 1 : 0;
        if (plan.bases.find((base) => base.role === "hob")?.wall === "B") {
          arms.hobOnB += size === 0 ? 1 : 0;
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
    for (const [arm, count] of Object.entries(arms)) {
      expect(count, `the ${arm} arm never fired`).toBeGreaterThanOrEqual(100);
    }
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
      { numRuns: 300 },
    );

    // An *if and only if* needs both sides sampled: a run that never stood a tower would agree with
    // a planner that never substitutes, and one that always did would agree with a planner that
    // always substitutes.
    expect(arms.withATower, "the tower arm never fired").toBeGreaterThanOrEqual(
      100,
    );
    expect(
      arms.withoutOne,
      "the no-tower arm never fired",
    ).toBeGreaterThanOrEqual(100);
  });

  it("stands no column on wall B and none against a run's corner end, in any approved room", () => {
    let columnsChecked = 0;
    fc.assert(
      fc.property(approvedRoom, (room) => {
        const runs = lShellFloorRuns(room);
        for (const column of blockOf(planFor(room))) {
          columnsChecked += 1;
          expect(column.wall).toBe("A");
          expect(column.startMm).toBeGreaterThan(runs.A.startMm);
        }
      }),
      { numRuns: 300 },
    );

    // The loop body is the whole assertion, so a sample that stood no block asserts nothing at all.
    expect(
      columnsChecked,
      "no sample stood a column, so this asserted nothing about where columns stand",
    ).toBeGreaterThanOrEqual(150);
  });

  it("keeps the block contiguous and outermost on wall A wherever one stands", () => {
    let withABlock = 0;
    fc.assert(
      fc.property(approvedRoom, (room) => {
        const plan = planFor(room);
        const block = blockOf(plan);
        if (block.length === 0) return;
        withABlock += 1;
        const onWallA = plan.bases.filter((base) => base.wall === "A");

        expect(onWallA.slice(-block.length)).toEqual(block);
        expect(block.at(-1)?.endMm).toBe(
          Math.max(...onWallA.map((base) => base.endMm)),
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
  it("leaves the surviving core, the dropped list and the wall cut exactly where 7D2 put them", () => {
    let withABlock = 0;
    fc.assert(
      fc.property(approvedRoom, (room) => {
        const withTheRule = planFor(room);
        const withoutIt = planFor(room, NO_ROOM_IS_TALL_ENOUGH);
        if (blockOf(withTheRule).length > 0) withABlock += 1;

        expect(withTheRule.minimumMet).toBe(withoutIt.minimumMet);
        expect(withTheRule.dropped).toEqual(withoutIt.dropped);
        expect(coreShapeOf(withTheRule)).toEqual(coreShapeOf(withoutIt));
      }),
      { numRuns: 300 },
    );
    expect(withABlock).toBeGreaterThanOrEqual(100);
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
        // what wall A receives, whichever bodies fill it.
        expect(
          plan.bases.filter(
            (base) => base.wall === "A" && base.role === "storage",
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
    expect(APPROVED_ROOM_POLICY).toEqual({
      approval: "owner-approved",
      buildableShapes: {
        L: {
          wallA: { minMm: 900, maxMm: 6300 },
          wallB: { minMm: 1000, maxMm: 5100 },
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
