import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  BOTTLE_CARGO_BUILD_ID,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  DISHWASHER_BUILD_ID,
  DISHWASHER_PLANNED_WIDTH_MM,
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
import { ruledSlotWidthMm } from "../support/fridge-end-leftover.js";

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
 * The wall the run ends on, so the wall the block stands at the free end of: the wider entered wall, wall A
 * where the two are equal (ADR 0110 Amendment I). Derived from the entered numbers, not read back off the plan,
 * so a block that moved to the other wall fails these assertions instead of redefining them.
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
          // A fixed run item too (ADR 0110 Q-H5): the leftover rule's input counts it.
          base.id === THRESHOLD_DRAWER_PLANNED_ID),
    )
    .reduce((sum, base) => sum + base.widthMm, 0);
  return planLeftover(run.endMm - run.startMm - fixedRunWidthMm);
}

/** The threshold drawer's planned id, a literal so a wrong constant and a wrong composer cannot agree. */
const THRESHOLD_DRAWER_PLANNED_ID = "threshold-drawer";

/** E3's input with every run module the composer stood read as standing: `freeEndOf` omits the traded
 *  dishwasher, whose module the leftover rule never gives. */
function freeEndBesideEveryRunModuleOf(
  plan: KitchenCompositionPlan,
  room: DesignRoom,
) {
  const wall = freeEndWallOf(room);
  const run = lShellFloorRuns(room)[wall];
  const traded = tradedDishwasherOf(plan, room);
  const standingWidthMm = plan.bases
    .filter(
      (base) =>
        base.wall === wall &&
        (base.role !== "storage" ||
          base.buildId === BOTTLE_CARGO_BUILD_ID ||
          base.buildId === PAN_DRAWER_BASE_BUILD_ID ||
          base.id === THRESHOLD_DRAWER_PLANNED_ID ||
          base === traded),
    )
    .reduce((sum, base) => sum + base.widthMm, 0);
  return planLeftover(run.endMm - run.startMm - standingWidthMm);
}

/** Q-H5's price is one tall column at most, and in the approved policy the only block it is paid from is the
 *  full one: 3 -> 2. */
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

/** The one step down the block may take besides `1 -> 0`: the full block losing exactly one column, in the
 *  room where a threshold drawer first stands. A room that already held the drawer has no new drawer to pay
 *  for a column it loses. */
function isAColumnPaidForByANewThresholdDrawer(step: BlockStepDown): boolean {
  return (
    step.fromColumns === FULL_BLOCK_COLUMNS &&
    step.toColumns ===
      FULL_BLOCK_COLUMNS - COLUMNS_A_THRESHOLD_DRAWER_MAY_COST &&
    step.thresholdDrawersBefore === 0 &&
    step.thresholdDrawersAfter === 1
  );
}

/**
 * The dishwasher a trade stood in, told from M1's conversions by where it stands (ADR 0110 M7/M10). It is read
 * directly after the sink, so on the free-end wall it starts where the sink ends; M1's conversions never stand
 * on the free-end wall, and (e)'s is marked by the pan drawer carrying the preparation role.
 */
function tradedDishwasherOf(plan: KitchenCompositionPlan, room: DesignRoom) {
  const wall = freeEndWallOf(room);
  const sink = plan.bases.find((base) => base.role === "sink");
  const isDrawerSwapped = plan.bases.some(
    (base) =>
      base.buildId === PAN_DRAWER_BASE_BUILD_ID && base.role === "preparation",
  );
  if (!sink || sink.wall !== wall || isDrawerSwapped) return undefined;
  return plan.bases.find(
    (base) =>
      base.buildId === DISHWASHER_BUILD_ID &&
      base.wall === wall &&
      base.startMm === sink.endMm,
  );
}

function hasBottle(plan: KitchenCompositionPlan): boolean {
  return plan.bases.some((base) => base.buildId === BOTTLE_CARGO_BUILD_ID);
}

function hobBodyOf(plan: KitchenCompositionPlan): string | undefined {
  return plan.bases.find((base) => base.role === "hob")?.buildId;
}

/** Two neighbouring rooms either side of one step down the block, and the rooms they are. */
interface RoomsAcrossAStep {
  readonly before: {
    readonly plan: KitchenCompositionPlan;
    readonly room: DesignRoom;
  };
  readonly after: {
    readonly plan: KitchenCompositionPlan;
    readonly room: DesignRoom;
  };
}

/** A pantry column paid for by a dishwasher that stands in the room where one first stands (the room before
 *  had none), keeping at least the oven tower innermost and the hob its drawers (ADR 0110 M7(b)). */
function isAPantryColumnTakenByANewDishwasher(
  rooms: RoomsAcrossAStep,
): boolean {
  const { before, after } = rooms;
  const columnsAfter = blockOf(after.plan);
  return (
    blockOf(before.plan).length - columnsAfter.length === 1 &&
    columnsAfter[0]?.buildId === OVEN_TOWER &&
    hobBodyOf(after.plan) === HOB_WITH_DRAWERS &&
    !before.plan.bases.some((base) => base.buildId === DISHWASHER_BUILD_ID) &&
    tradedDishwasherOf(after.plan, after.room) !== undefined
  );
}

/** The lone oven tower taken by the dishwasher where (d) no longer fits (ADR 0110 M7(c)): the room before
 *  stood its traded dishwasher in the bottle's place beside the tower; this one gives the bottle back, gives
 *  up the tower, and the hob carries the oven. */
function isTheTowerTakenWhereTheBottleTradeStops(
  rooms: RoomsAcrossAStep,
): boolean {
  const { before, after } = rooms;
  return (
    blockOf(before.plan).length === 1 &&
    blockOf(after.plan).length === 0 &&
    tradedDishwasherOf(before.plan, before.room) !== undefined &&
    !hasBottle(before.plan) &&
    tradedDishwasherOf(after.plan, after.room) !== undefined &&
    hasBottle(after.plan) &&
    hobBodyOf(after.plan) === HOB_WITH_OVEN
  );
}

/** E6.2's own refusal: a lone tower cannot take a merged opening, so the block falls from one column to
 *  none and the wall keeps a bare remainder inside the window — with no traded dishwasher either side. */
function isALoneTowerRefusedInTheWindow(rooms: RoomsAcrossAStep): boolean {
  const { before, after } = rooms;
  const remainderMm = after.plan.remainderMm[freeEndWallOf(after.room)];
  return (
    blockOf(before.plan).length === 1 &&
    blockOf(after.plan).length === 0 &&
    remainderMm > 0 &&
    remainderMm <= 200 &&
    tradedDishwasherOf(before.plan, before.room) === undefined &&
    tradedDishwasherOf(after.plan, after.room) === undefined
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
  // A kitchen that dropped a core role for want of space must not gain a block.
  //
  // Swept, not sampled: removing `coreSurvivedWhole` from `isABlockAffordable` changes only a fraction of a
  // percent of the approved policy, so a uniform property over 4 000 rooms draws the deciding room about once
  // and passes either way. The counter fails when the sweep stops reaching the invariant.
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
  // Every composed body stands at a width its own declaration accounts for, per body, including the columns'
  // bound: a storage cabinet silently planned at 700 mm is charged as 600. The modulo identity itself is
  // asserted once, in `planKitchenComposition`'s own suite.
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
            // A branch of its own, not a widening of the slot pair below: `base-panbank` in the pair would let a
            // composed slot silently take it. Where it stands is asserted in `pan-drawer-before-the-hob.test.ts`.
            expect(declared, label).toBeDefined();
            expect(isComposedStorageSlot(base), label).toBe(false);
            expect(base.widthMm, label).toBe(STORAGE_MODULE_WIDTH_MM);
            continue;
          }
          if (base.buildId === DISHWASHER_BUILD_ID) {
            // Same reason as the pan drawer: it re-identifies a module already planned beside the sink and never
            // changes its width, so it must refuse a composed slot's id and stand at the catalogue's one discrete
            // width (ADR 0110 M1/M8/M9).
            expect(declared, label).toBeDefined();
            expect(isComposedStorageSlot(base), label).toBe(false);
            expect(base.id, label).toBe("dishwasher");
            expect(base.widthMm, label).toBe(DISHWASHER_PLANNED_WIDTH_MM);
            expect(base.widthMm, label).toBe(STORAGE_MODULE_WIDTH_MM);
            expect(declared?.widthFlex, label).toContain(base.widthMm);
            continue;
          }
          if (declared?.band !== "column") {
            // The pair a composed slot may take: the door body, or the drawer body for the slot first after the hob
            // (ADR 0110 Amendment H1). Widened rather than deleted, so a third body still fails here. This clause
            // cannot tell one drawer slot from every slot a drawer: `drawer-rows.test.ts` asserts that
            // (ADR 0091 Amendment A.2).
            expect(
              [DOOR_BASE_BUILD_ID, THREE_DRAWER_BASE_BUILD_ID],
              label,
            ).toContain(base.buildId);
            // One module plus what the owner's Q6 gives the cabinet beside an end fridge, worked out from the run and
            // the fridge's span, so a slot widened by any other amount still fails on its width.
            expect(base.widthMm, label).toBe(
              ruledSlotWidthMm(
                plan,
                base,
                lShellFloorRuns(room)[base.wall].endMm,
              ),
            );
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

describe("exactly one oven, read off the built kitchen", () => {
  // Not through `assertExactlyOneOven`: that post-condition is production's own, so observing it pass observes
  // production agreeing with itself. This counts the bodies in the design.
  it(
    "carries one oven-bearing body in every generated kitchen, in both arms",
    { timeout: 60_000 },
    () => {
      const arms = { withATower: 0, withoutOne: 0 };
      let generated = 0;
      // Generation is swept, not the policy: wall A to 6300, wall B from its first value to its maximum.
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
  // Swept across wall B because a `2 -> 1` step reachable only at some other wall B would be invisible at 1700.
  it("never steps down except from one column to none, over every sampled wall B", () => {
    // Sanctioned steps down: `1 -> 0` only as E6.2's refusal (remainder inside the window, no traded dishwasher
    // either side) or (c)'s tower trade; 3 -> 2 only into the room where exactly one `threshold-drawer` first
    // stands (ADR 0110 Q-H5); (b)'s one pantry column only into the room where a traded dishwasher first stands
    // with the oven tower innermost.
    const steps = new Map<string, number>();
    const unsanctioned: string[] = [];
    let paidForByAThresholdDrawer = 0;
    const tradeSteps = { pantryColumn: 0, ovenTower: 0, loneTowerRefused: 0 };
    // Wall B reaches the policy's maximum, including the band from 5101.
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
      const firstRoom = roomOf(900, depthMm);
      const firstPlan = planFor(firstRoom);
      let previous = blockOf(firstPlan).length;
      let previousDrawers = thresholdDrawersOf(firstPlan).length;
      let previousRoom = { plan: firstPlan, room: firstRoom };
      for (let widthMm = 901; widthMm <= 6300; widthMm += 1) {
        const room = roomOf(widthMm, depthMm);
        const plan = planFor(room);
        const size = blockOf(plan).length;
        const rooms = { before: previousRoom, after: { plan, room } };
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
          } else if (isAPantryColumnTakenByANewDishwasher(rooms)) {
            tradeSteps.pantryColumn += 1;
          } else if (isTheTowerTakenWhereTheBottleTradeStops(rooms)) {
            tradeSteps.ovenTower += 1;
          } else if (isALoneTowerRefusedInTheWindow(rooms)) {
            tradeSteps.loneTowerRefused += 1;
          } else {
            unsanctioned.push(
              `${step} at wallA ${String(widthMm)}, threshold drawers ${String(previousDrawers)} -> ${String(drawers)}`,
            );
          }
        }
        previous = size;
        previousDrawers = drawers;
        previousRoom = { plan, room };
      }
    }

    expect(unsanctioned).toEqual([]);
    // Each sanctioned shape is reached, so a trade that stops or starts stepping the block fails on the count.
    expect(tradeSteps).toEqual({
      pantryColumn: 4,
      ovenTower: 4,
      loneTowerRefused: 4,
    });
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
  // The window is the rooms where E3 would stand a block (no core role dropped, a leftover module at the free
  // end) with the free end's remainder `0 < r <= 200`, so E6 / E6.2 decides: the outermost door column takes the
  // merged opening, or a lone fixed-width tower cannot and the block falls to none. The free end is read beside
  // every run module the composer stood, a traded dishwasher included; that module is a whole 600 mm.
  it("pins the window at the approved L's 10 mm grid: 74 700 rooms, 64 300 absorbed, 10 400 lone towers refused", () => {
    const census = {
      placed: 0,
      inTheWindow: 0,
      absorbedByTheOutermostColumn: 0,
      loneTowerRefused: 0,
      blockStandingWithoutAnAbsorb: 0,
      withATradedDishwasher: 0,
    };
    for (
      let widthMm = APPROVED_L.wallA.minMm;
      widthMm <= APPROVED_L.wallA.maxMm;
      widthMm += 10
    ) {
      for (
        let depthMm = APPROVED_L.wallB.minMm;
        depthMm <= APPROVED_L.wallB.maxMm;
        depthMm += 10
      ) {
        const room = roomOf(widthMm, depthMm);
        const plan = planFor(room);
        if (!plan.minimumMet) continue;
        census.placed += 1;
        const leftover = freeEndBesideEveryRunModuleOf(plan, room);
        const isInTheWindow =
          plan.dropped.length === 0 &&
          leftover.storageCount >= 1 &&
          leftover.remainderMm > 0 &&
          leftover.remainderMm <= 200;
        if (!isInTheWindow) continue;
        census.inTheWindow += 1;
        if (tradedDishwasherOf(plan, room)) census.withATradedDishwasher += 1;
        const block = blockOf(plan);
        const outermost = block.at(-1);
        if (!outermost) {
          if (leftover.storageCount === 1) census.loneTowerRefused += 1;
        } else if (outermost.widthMm > DECLARED_COLUMNS.columnWidthMm) {
          census.absorbedByTheOutermostColumn += 1;
        } else {
          census.blockStandingWithoutAnAbsorb += 1;
        }
      }
    }

    expect(census).toEqual({
      placed: 245_211,
      inTheWindow: 74_700,
      absorbedByTheOutermostColumn: 64_300,
      loneTowerRefused: 10_400,
      blockStandingWithoutAnAbsorb: 0,
      withATradedDishwasher: 5_200,
    });
  }, 120_000);

  // A merge that fired at one remainder and not another, or left the run short of the wall's reachable end, is
  // invisible to a single witness; the window is `0 < r <= 200`.
  it("leaves the tower's opening at 600, the run flush, and no column resized, at every remainder in the window", () => {
    const remaindersSeen = new Set<number>();
    let roomsInTheWindow = 0;
    // Fixed depths and widths 900-6300, not the approved policy: the planner is what is swept.
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
    // Budgeted explicitly, as it is slower than the 5 s default under parallel load. It plans ~27 000 rooms and is
    // the only thing that catches a tower centred in a merged void (`insertPlannedBase`'s width check passes a
    // fixed-width body in a wider opening); sampling the window would reopen that hole.
  }, 120_000);
});
