// Independent adversarial QA for M7 wave 7D3 slice S2 — ADR 0110 Amendment E's block of full-height
// columns at wall A's free end, and the hob that follows it.
//
// **Two of these close a hole that was opened rather than found.** Wave 7D2's assertions had to move
// for S2's ruling, and some came back weaker than they went in or stopped covering what their own
// comment claims: criterion 6's dropped-core arm is counted over a uniform room generator that draws
// the discriminating case about once in three hundred; and a body silently planned over its module,
// with the wall's reported remainder reduced to match, was left uncovered when the remainder
// assertion was relaxed to `run − composed` — the one quantity such a pair leaves unchanged.
//
// Two sibling repairs live where their subjects do rather than here, because a second copy would be
// the duplication this wave spent its criterion 23 avoiding: the **remainder identity** is narrowed
// in place in `generation-priorities.test.ts`, and the **plannable build id** guard is derived from
// real plans in `qa-7d3-upper-suppression.adversarial.test.ts`.
//
// The rest read the block off the **built design** wherever the wave's own tests read it off the
// plan, so a plan that says one thing and a kitchen that is another is a disagreement between two
// derivations rather than two readings of one number.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  BOTTLE_CARGO_BUILD_ID,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  DOOR_BASE_BUILD_ID,
  findOverflowingPlacementIds,
  generateKitchen,
  GENERATION_PRIORITIES,
  isComposedStorageSlot,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  PAN_DRAWER_BASE_BUILD_ID,
  planKitchenComposition,
  planLeftover,
  THREE_DRAWER_BASE_BUILD_ID,
  validateDesignForCatalog,
  type DesignRoom,
  type KitchenCompositionPlan,
} from "../../src/index.js";
import { widerEnteredWall } from "../support/entered-walls.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";
const OVEN_TOWER = "tall-oven-tower";
const HOB_WITH_DRAWERS = "base-hob-2drawer";
const HOB_WITH_OVEN = "base-hob-oven";
const STORAGE_MODULE_WIDTH_MM = 600;

/** Wall B is too short to seat the fridge below this, so the drop order gives it up and `dropped`
 *  is non-empty — which is the only region of the policy where E3 clause 1 decides anything. */
const WALL_B_THAT_CANNOT_SEAT_THE_FRIDGE_MM = { minMm: 1000, maxMm: 1699 };

const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);

const APPROVED_L = (() => {
  const shape = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (!shape) throw new Error("the approved policy has no L");
  return shape;
})();

function roomOf(widthMm: number, depthMm: number, heightMm = 2600): DesignRoom {
  return { shape: "L", widthMm, depthMm, heightMm };
}

function planFor(room: DesignRoom): KitchenCompositionPlan {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

function generate(room: DesignRoom) {
  return generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

/** The full-height bodies composition stood that the reading order did not, read off the
 *  catalogue's own `column` band. `fridge-free` is declared in that band too and is Amendment A1's,
 *  so its role excludes it. */
function blockOf(plan: KitchenCompositionPlan) {
  return plan.bases.filter(
    (base) =>
      base.role !== "fridge" && CATALOG.get(base.buildId)?.band === "column",
  );
}

/**
 * The wall the run ends on, and so the wall the block stands at the free end of: the **wider entered
 * wall**, wall A where the two are equal (ADR 0120 Amendment E; ADR 0110 Amendment I, which
 * overturns Amendment E's *"wall A and nowhere else"* on the owner's ruling that the block follows
 * the run). Derived in `entered-walls.ts` from the two entered numbers rather than read back off the
 * plan, so a block that moved to the other wall fails these assertions instead of redefining them.
 */
function freeEndWallOf(room: DesignRoom): "A" | "B" {
  return widerEnteredWall(room);
}

/** What the leftover rule alone makes of the free-end wall — E3 clause 3's own input, recomputed
 *  here from the run and the composed core rather than read back off the plan. */
function freeEndOf(plan: KitchenCompositionPlan, room: DesignRoom) {
  const wall = freeEndWallOf(room);
  const run = lShellFloorRuns(room)[wall];
  const fixedRunWidthMm = plan.bases
    .filter(
      (base) =>
        base.wall === wall &&
        (base.role !== "storage" ||
          base.buildId === BOTTLE_CARGO_BUILD_ID ||
          base.buildId === PAN_DRAWER_BASE_BUILD_ID ||
          // 7D5 S3 / Q-H5: a fixed run item too. Only the storage count moved without it — one
          // 600 mm module leaves the remainder this file asserts unchanged — but the input is E3's.
          base.id === THRESHOLD_DRAWER_PLANNED_ID),
    )
    .reduce((sum, base) => sum + base.widthMm, 0);
  return planLeftover(run.endMm - run.startMm - fixedRunWidthMm);
}

/** 7D5 S3 / Q-H5: the threshold drawer's planned id, spelled as a literal so a wrong constant and a
 *  wrong composer cannot agree. */
const THRESHOLD_DRAWER_PLANNED_ID = "threshold-drawer";

/** Q-H5's price is one tall column at most (owner, 2026-09-21), and in the approved policy the only
 *  block it is paid from is the full one: 3 -> 2. */
const FULL_BLOCK_COLUMNS = 3;
const COLUMNS_A_THRESHOLD_DRAWER_MAY_COST = 1;

function thresholdDrawersOf(plan: KitchenCompositionPlan) {
  return plan.bases.filter((base) => base.id === THRESHOLD_DRAWER_PLANNED_ID);
}

/** One step down the block between neighbouring rooms, and the threshold drawers either side of it. */
interface BlockStepDown {
  readonly fromColumns: number;
  readonly toColumns: number;
  readonly thresholdDrawersBefore: number;
  readonly thresholdDrawersAfter: number;
}

/** 7D5 S3 / Q-H5: the one step down the block may take besides `1 -> 0` — the full block losing
 *  exactly one column, in the room where a threshold drawer first stands. A room that already held
 *  the drawer has no new drawer to pay for a column it loses. */
function isAColumnPaidForByANewThresholdDrawer(step: BlockStepDown): boolean {
  return (
    step.fromColumns === FULL_BLOCK_COLUMNS &&
    step.toColumns ===
      FULL_BLOCK_COLUMNS - COLUMNS_A_THRESHOLD_DRAWER_MAY_COST &&
    step.thresholdDrawersBefore === 0 &&
    step.thresholdDrawersAfter === 1
  );
}

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

describe("E3 clause 1 decides something, and it is asserted where it decides it", () => {
  // Criterion 6's "**must not:** a block in a room whose `dropped` list is non-empty". The clause is
  // R5 stated as a precondition: a kitchen that gave up its fridge for want of space has no business
  // gaining a second oven.
  //
  // **Swept rather than sampled, and that is the point.** Removing `coreSurvivedWhole` from
  // `isABlockAffordable` changes the plan in 0.06 % of the approved policy — two wall A values per
  // wall B — so a uniform property over 4 000 rooms draws the deciding room about once and passes
  // whether the clause is there or not. The dropped-core counter fails when the sweep stops reaching
  // the invariant. After 7D5 S1 the optional bottle consumes the formerly discriminating leftover,
  // so the counter that claimed clause 1 alone decided those rooms no longer has a live population.
  it("stands no block in a room that dropped a core role, wherever that is decidable", () => {
    let droppedCoreRooms = 0;
    for (
      let depthMm = WALL_B_THAT_CANNOT_SEAT_THE_FRIDGE_MM.minMm;
      depthMm <= WALL_B_THAT_CANNOT_SEAT_THE_FRIDGE_MM.maxMm;
      depthMm += 100
    ) {
      for (
        let widthMm = APPROVED_L.wallA.minMm;
        widthMm <= APPROVED_L.wallA.maxMm;
        widthMm += 1
      ) {
        const room = roomOf(widthMm, depthMm);
        const plan = planFor(room);
        if (!plan.minimumMet || plan.dropped.length === 0) continue;
        droppedCoreRooms += 1;

        expect(
          blockOf(plan),
          `${String(widthMm)}x${String(depthMm)} dropped ${plan.dropped.join()}`,
        ).toEqual([]);
        expect(plan.bases.find((base) => base.role === "hob")?.buildId).toBe(
          HOB_WITH_OVEN,
        );
      }
    }

    expect(
      droppedCoreRooms,
      "the dropped-core arm never fired",
    ).toBeGreaterThan(1000);
  });
});

describe("no body is silently planned over its own module", () => {
  // The half of the compensating defect that `generation-priorities.test.ts`'s remainder assertion
  // does **not** claim, and the one that makes the pair impossible to *build* rather than merely
  // visible: every composed body stands at a width its own declaration accounts for, **per body**,
  // including the columns' bound. A storage cabinet silently planned at 700 mm is a cabinet the
  // customer is charged 600 for, and it survives a later wave that changes how remainders are
  // reported.
  //
  // The modulo identity itself is asserted once, where its subject lives — `planKitchenComposition`'s
  // own suite, narrowed in place to subtract only E6.2's absorb. A second copy here would be the
  // duplication this wave spent its criterion 23 avoiding.
  it("plans every composed body at a width its declaration accounts for", () => {
    const declaredCoreWidthMm = new Map(
      GENERATION_PRIORITIES.map((priority) => [
        priority.role,
        priority.widthMm,
      ]),
    );
    fc.assert(
      fc.property(approvedRoom, (room) => {
        const plan = planFor(room);
        if (!plan.minimumMet) return;
        const block = blockOf(plan);
        const outermost = block.at(-1);
        const where = `${String(room.widthMm)}x${String(room.depthMm)}`;

        for (const base of plan.bases) {
          const declared = CATALOG.get(base.buildId);
          const label = `${where} ${base.id} (${base.buildId})`;
          expect(base.endMm - base.startMm, label).toBe(base.widthMm);

          if (base.role !== "storage") {
            expect(base.widthMm, label).toBe(
              declaredCoreWidthMm.get(base.role),
            );
            continue;
          }
          if (base.buildId === BOTTLE_CARGO_BUILD_ID) {
            expect(declared, label).toBeDefined();
            expect(base.widthMm, label).toBe(300);
            continue;
          }
          if (base.buildId === PAN_DRAWER_BASE_BUILD_ID) {
            // **Added by 7D5 S2 as a branch of its own, not by widening the slot pair below.** The
            // pan drawer is a run item the composer reads before the hob (ADR 0110 Amendment J1),
            // not a body a composed slot takes, so putting `base-panbank` into the pair would let a
            // slot silently take it and stay green — and so would this branch, were it not to refuse
            // a composed slot's id. This file's subject is the width, and the width is one storage
            // module. Where it stands, in which rooms and at what cost is asserted per
            // room in `tests/generation/pan-drawer-before-the-hob.test.ts` (the census), per ADR 0091
            // Amendment A.2 — this branch is not authority for any of that.
            expect(declared, label).toBeDefined();
            expect(isComposedStorageSlot(base), label).toBe(false);
            expect(base.widthMm, label).toBe(STORAGE_MODULE_WIDTH_MM);
            continue;
          }
          if (declared?.band !== "column") {
            // **Widened by 7D4 S2, and reported as a deviation rather than made quietly.** This
            // file's subject is the **width**, and the width clause below is byte-unchanged. The
            // identity clause said *the door body and nothing else*, which 7D4 makes false on
            // purpose: the slot standing first after the hob in the reading order takes the drawer
            // body (ADR 0110 Amendment H1, 7D4 D15.7). Widened to the pair a slot may take rather
            // than deleted, so a third body planned into a composed slot still fails here.
            //
            // **The identity invariant moved rather than weakened, and this is where it went:**
            // `tests/generation/drawer-rows.test.ts`, *"gives a kitchen at most one drawer slot, and
            // it is always the first after the hob"* — set equality against
            // `slotsAfterTheHob(plan).slice(0, 1)`, so too many drawers and too few both fail.
            // **The clause below cannot make that distinction and must not be read as authority for
            // it**: it stays green whether one composed slot holds a drawer or every one does, which
            // was measured in both directions. ADR 0091 Amendment A.2 admits a widening **only**
            // with this pointer; without it the clause reads as proving a property it cannot see.
            expect(
              [DOOR_BASE_BUILD_ID, THREE_DRAWER_BASE_BUILD_ID],
              label,
            ).toContain(base.buildId);
            expect(base.widthMm, label).toBe(STORAGE_MODULE_WIDTH_MM);
            continue;
          }
          // A column is its declared width, except the outermost one, which is the `'fit'` door
          // column taking a merged opening inside its own bound (E6.2 / E12.2).
          if (base !== outermost) {
            expect(base.widthMm, label).toBe(DECLARED_COLUMNS.columnWidthMm);
            continue;
          }
          expect(base.widthMm, label).toBeGreaterThanOrEqual(
            DECLARED_COLUMNS.columnWidthMm,
          );
          expect(base.widthMm, label).toBeLessThanOrEqual(
            DECLARED_COLUMNS.doorColumnWidthMm.maxMm,
          );
          if (base.widthMm !== DECLARED_COLUMNS.columnWidthMm) {
            expect(base.buildId, label).not.toBe(OVEN_TOWER);
          }
        }
      }),
      { numRuns: 400 },
    );
  });
});

// The plannable-build-id guard that slice S2 outgrew lives where its subject does — it is E7's
// input, so it is repaired in `qa-7d3-upper-suppression.adversarial.test.ts` rather than copied
// here. A second copy would be the second authority this wave spent its criterion 23 avoiding.

describe("exactly one oven, read off the built kitchen", () => {
  // Criterion 2 in both directions, and deliberately **not** through `assertExactlyOneOven`: that
  // post-condition is production's own, so a test that only observes it passing observes production
  // agreeing with itself. This counts the bodies in the design.
  it(
    "carries one oven-bearing body in every generated kitchen, in both arms",
    { timeout: 10_000 },
    () => {
      const arms = { withATower: 0, withoutOne: 0 };
      let generated = 0;
      // Generation is swept, not the policy (M7 7A3): wall A keeps the pre-7A3 6300, and wall B adds
      // the band the policy admits since, from its first value to its maximum.
      for (let widthMm = 900; widthMm <= 6300; widthMm += 9) {
        for (const depthMm of [
          1000,
          1450,
          1700,
          2600,
          5100,
          5101,
          5600,
          APPROVED_L.wallB.maxMm,
        ]) {
          const result = generate(roomOf(widthMm, depthMm));
          if (!result.ok) continue;
          generated += 1;
          const towers = result.design.placements.filter(
            (placement) => placement.body.buildId === OVEN_TOWER,
          );
          const hobsWithAnOven = result.design.placements.filter(
            (placement) => placement.body.buildId === HOB_WITH_OVEN,
          );
          const hobsWithDrawers = result.design.placements.filter(
            (placement) => placement.body.buildId === HOB_WITH_DRAWERS,
          );
          const where = `${String(widthMm)}x${String(depthMm)}`;

          expect(towers.length + hobsWithAnOven.length, where).toBe(1);
          expect(hobsWithAnOven.length + hobsWithDrawers.length, where).toBe(1);
          expect(hobsWithDrawers.length === 1, where).toBe(towers.length === 1);
          if (towers.length === 1) arms.withATower += 1;
          else arms.withoutOne += 1;
        }
      }

      expect(generated).toBeGreaterThan(500);
      expect(arms.withATower, "the tower arm never fired").toBeGreaterThan(150);
      expect(arms.withoutOne, "the no-tower arm never fired").toBeGreaterThan(
        150,
      );
    },
  );
});

describe("the block shrinks in exactly one shape, swept in two dimensions", () => {
  // Criterion 22. The wave's own sweep holds wall B at 1700; the `1 → 0` claim is about the whole
  // policy, and a `2 → 1` step reachable only at some other wall B would be invisible to it.
  it("never steps down except from one column to none, over every sampled wall B", () => {
    // **7D5 S3 / Q-H5, restated narrowly** (owner ruling 2026-09-21): the threshold drawer may cost
    // the block one tall column — 9 600 rooms of the approved 10 mm grid step 3 → 2 for it. That step
    // is sanctioned only as 3 -> 2, only into the room where exactly one `threshold-drawer` first
    // stands (its neighbour had none); every other step down that is not `1 -> 0` still fails. Was: `steps.filter(step => !step.startsWith("1->0"))` equal to `[]`.
    const steps = new Map<string, number>();
    const unsanctioned: string[] = [];
    let paidForByAThresholdDrawer = 0;
    // Wall B reaches the policy's maximum, through the band M7 7A3 admitted from 5101.
    for (const depthMm of [
      1000,
      1200,
      1600,
      1700,
      2300,
      3100,
      4200,
      5100,
      5101,
      5300,
      5600,
      APPROVED_L.wallB.maxMm,
    ]) {
      const firstPlan = planFor(roomOf(900, depthMm));
      let previous = blockOf(firstPlan).length;
      let previousDrawers = thresholdDrawersOf(firstPlan).length;
      for (let widthMm = 901; widthMm <= 6300; widthMm += 1) {
        const plan = planFor(roomOf(widthMm, depthMm));
        const size = blockOf(plan).length;
        const drawers = thresholdDrawersOf(plan).length;
        if (size < previous) {
          const step = `${String(previous)}->${String(size)} at wallB ${String(depthMm)}`;
          steps.set(step, (steps.get(step) ?? 0) + 1);
          const stepDown = {
            fromColumns: previous,
            toColumns: size,
            thresholdDrawersBefore: previousDrawers,
            thresholdDrawersAfter: drawers,
          };
          if (isAColumnPaidForByANewThresholdDrawer(stepDown)) {
            paidForByAThresholdDrawer += 1;
          } else if (!(previous === 1 && size === 0)) {
            unsanctioned.push(
              `${step} at wallA ${String(widthMm)}, threshold drawers ${String(previousDrawers)} -> ${String(drawers)}`,
            );
          }
        }
        previous = size;
        previousDrawers = drawers;
      }
    }

    expect(unsanctioned).toEqual([]);
    expect(
      paidForByAThresholdDrawer,
      "the sweep never reached a threshold drawer paying for a column, so Q-H5's arm is unasserted",
    ).toBeGreaterThan(0);
    expect(
      [...steps.values()].reduce((sum, count) => sum + count, 0),
      "the sweep found no step down at all, so it proves nothing about their shape",
    ).toBeGreaterThan(5);
  });
});

describe("the centring hazard across the whole absorb window", () => {
  // Criterion 8 / risk 1. The wave pins 4000 x 3000 as its witness; the window is `0 < r <= 200` and
  // covers about a third of eligible rooms. A merge that fired at one remainder and not another, or
  // that left the run short of the wall's reachable end, is invisible to a single witness.
  it("leaves the tower's opening at 600, the run flush, and no column resized, at every remainder in the window", () => {
    const remaindersSeen = new Set<number>();
    let roomsInTheWindow = 0;
    // The pre-7A3 approved rectangle, kept on purpose: the planner is swept, not the policy (M7 7A3).
    for (const depthMm of [1700, 2400, 3000, 4100, 5100]) {
      for (let widthMm = 900; widthMm <= 6300; widthMm += 1) {
        const room = roomOf(widthMm, depthMm);
        const plan = planFor(room);
        if (!plan.minimumMet) continue;
        const leftover = freeEndOf(plan, room);
        if (!(leftover.remainderMm > 0 && leftover.remainderMm <= 200))
          continue;
        const block = blockOf(plan);
        if (block.length === 0) continue;
        roomsInTheWindow += 1;
        remaindersSeen.add(leftover.remainderMm);

        const freeEndWall = freeEndWallOf(room);
        const freeEndRun = lShellFloorRuns(room)[freeEndWall];
        const where = `${String(widthMm)}x${String(depthMm)} r=${String(leftover.remainderMm)}`;
        const tower = block[0];

        expect(tower?.buildId, where).toBe(OVEN_TOWER);
        expect(tower && tower.endMm - tower.startMm, where).toBe(
          DECLARED_COLUMNS.columnWidthMm,
        );
        expect(block.at(-1)?.endMm, where).toBe(freeEndRun.endMm);
        expect(plan.remainderMm[freeEndWall], where).toBe(0);

        const result = generate(room);
        expect(result.ok, where).toBe(true);
        if (!result.ok) continue;
        const columnPlacementIds = new Set(
          result.design.placements
            .filter(
              (placement) =>
                CATALOG.get(placement.body.buildId)?.band === "column" &&
                placement.body.buildId !== "fridge-free",
            )
            .map((placement) => placement.id),
        );
        for (const command of result.log.commands) {
          if (command.type !== "set_width") continue;
          expect(columnPlacementIds.has(command.placementId), where).toBe(
            false,
          );
        }
        const placedTower = result.design.placements.find(
          (placement) => placement.body.buildId === OVEN_TOWER,
        );
        expect(placedTower?.body.widthMm, where).toBe(
          DECLARED_COLUMNS.columnWidthMm,
        );
        expect(placedTower?.alongMm, where).toBe(
          (tower?.startMm ?? 0) + DECLARED_COLUMNS.columnWidthMm / 2,
        );
        expect(validateDesignForCatalog(result.design, CATALOG), where).toEqual(
          [],
        );
        expect(findOverflowingPlacementIds(result.design), where).toEqual([]);
      }
    }

    expect(roomsInTheWindow, "the absorb window never fired").toBeGreaterThan(
      500,
    );
    expect(
      remaindersSeen.size,
      "one remainder proves nothing about a 200 mm window",
    ).toBeGreaterThan(20);
    // **Given a budget, not left on the 5 s default, and the coverage is not the thing to cut.**
    // Measured 2026-09-16: 3 710 ms run alone, 4 912 ms inside the full suite — 98 % of the default,
    // so it passes in isolation and fails under parallel load. It plans ~27 000 rooms because the
    // window is `0 < r <= 200` across five depths, and this sweep is the *only* thing in the tree
    // that catches a tower centred in a merged void: `insertPlannedBase`'s width check compares the
    // body's width against the planned width, which a fixed-width body dropped into a wider opening
    // passes (7D3 close-out, finding 1). Sampling the window would return exactly the hole the
    // sweep exists to close.
  }, 30_000);
});
