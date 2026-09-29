// M7B U3a slice S2, AC1's own share: one oven per plan; no pantry on a large U's far wall; a pantry or
// a bare gap between the fridge and the free end at every size; every bare run end under 600 mm on
// all three walls, RQ17's remainder and a dropped fridge's wall included (ADR 0110 N9.2); and the
// hob wall's fitting rule (ADR 0110 N10.3), AC1 (a)-(e): no drawer extra after the tower, the bottle
// directly after the hob, the bottle never costing a drawer unit, the tower's bound, and no tower,
// pantry or fridge-wall body lost or gained against the layout with nothing added. Swept over the same range S1's own
// property suite uses (A 2700-6000, B and C 1000-6000, h 2200/2600/3900), a drop-band sweep (both side
// walls under 1700 mm, where the fridge is dropped), plus the same fixed boundary sweep. A fixed grid
// counts each arm the rule branches on and holds it at 1 or more, so no property can pass by landing
// only on an arm nobody changed.
//
// The fridge wall, the far wall, the drawer target, the run order and whether a tower is owed come from
// `tests/support/u-plan-invariants.ts`, the independent oracle, rather than a copy of each here. What
// this file still restates on purpose, because that module keeps it private, is ADR figures read
// straight off the record: the entered-length count from the corner (`bodiesFromTheCornerFor`), the
// entered length of a wall, and the drawer and tall-column predicates. None of them reads the planner's
// own `baseCountFromTheCorner`, so a wrong boundary there disagrees with this file.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  uShellFloorRuns,
  type DesignRoom,
  type DesignWall,
} from "../../src/index.js";
import {
  basesOn,
  DECLARED_COLUMNS,
  planFor,
  uRoom,
} from "../support/u-plan-fixtures.js";
import {
  drawerTargetOf,
  farWallOf,
  fridgeWallOf,
  isLargeURoom,
  runOrderOf,
  towerIsOwed,
} from "../support/u-plan-invariants.js";

const RUNS = 200;

const sweptRoomArb = fc
  .tuple(
    fc.integer({ min: 2700, max: 6000 }),
    fc.integer({ min: 1000, max: 6000 }),
    fc.integer({ min: 1000, max: 6000 }),
    fc.constantFrom(2200, 2600, 3900),
  )
  .map(([widthMm, depthMm, wallCMm, heightMm]) =>
    uRoom(widthMm, depthMm, wallCMm, heightMm),
  );

/** Both side walls under 1700 mm entered: the free run is under the fridge's own 700 mm, so the fridge
 *  is dropped (ADR 0110 N9.2, 1 522 rooms on the approved grid). */
const dropBandRoomArb = fc
  .tuple(
    fc.integer({ min: 2700, max: 6000 }),
    fc.integer({ min: 1000, max: 1699 }),
    fc.integer({ min: 1000, max: 1699 }),
    fc.constantFrom(2200, 2600, 3900),
  )
  .map(([widthMm, depthMm, wallCMm, heightMm]) =>
    uRoom(widthMm, depthMm, wallCMm, heightMm),
  );

/** A short wall A, so the core often runs round the far corner and the hob stands on the far wall. */
const farWallHobRoomArb = fc
  .tuple(
    fc.integer({ min: 2700, max: 3900 }),
    fc.integer({ min: 1000, max: 6000 }),
    fc.integer({ min: 1000, max: 6000 }),
    fc.constantFrom(2200, 2600, 3900),
  )
  .map(([widthMm, depthMm, wallCMm, heightMm]) =>
    uRoom(widthMm, depthMm, wallCMm, heightMm),
  );

function boundaryRooms(): readonly DesignRoom[] {
  const wallAValuesMm = [2700, 3600, 6000];
  const boundarySideValuesMm = [3000, 3001, 4000, 4001];
  const rooms: DesignRoom[] = [];
  for (const widthMm of wallAValuesMm) {
    for (const boundaryMm of boundarySideValuesMm) {
      rooms.push(uRoom(widthMm, boundaryMm, 1200, 2600));
      rooms.push(uRoom(widthMm, 1200, boundaryMm, 2600));
    }
    rooms.push(uRoom(widthMm, 3000, 3000, 2600));
  }
  return rooms;
}

function ovenBearingCount(plan: ReturnType<typeof planFor>): number {
  return plan.bases.filter(
    (base) =>
      base.buildId === "tall-oven-tower" || base.buildId === "base-hob-oven",
  ).length;
}

function checkOneOven(room: DesignRoom): void {
  const plan = planFor(room);
  if (!plan.minimumMet) return;

  expect(ovenBearingCount(plan), JSON.stringify(room)).toBe(1);
  const hasTower = plan.bases.some(
    (base) => base.buildId === "tall-oven-tower",
  );
  const hob = plan.bases.find((base) => base.role === "hob");
  expect(hob?.buildId, JSON.stringify(room)).toBe(
    hasTower ? "base-hob-2drawer" : "base-hob-oven",
  );
}

function checkNoPantryOnALargeUFarWall(room: DesignRoom): void {
  const plan = planFor(room);
  if (!plan.minimumMet || !isLargeURoom(room)) return;
  const farWall: DesignWall = fridgeWallOf(room) === "B" ? "C" : "B";

  expect(
    plan.bases.some(
      (base) => base.wall === farWall && base.buildId === "tall-pantry",
    ),
    JSON.stringify(room),
  ).toBe(false);
}

function checkFridgeGapFillOrBare(room: DesignRoom): void {
  const plan = planFor(room);
  if (!plan.minimumMet) return;
  const fridgeWall = fridgeWallOf(room);
  const fridge = plan.bases.find((base) => base.role === "fridge");
  if (!fridge) return; // the fridge was dropped: no gap to fill (ADR 0110 N9.2)

  const gapMm = uShellFloorRuns(room)[fridgeWall].endMm - fridge.endMm;
  const pantriesAfterFridge = plan.bases.filter(
    (base) =>
      base.wall === fridgeWall &&
      base.buildId === "tall-pantry" &&
      base.startMm >= fridge.endMm,
  );
  if (plan.fridgePosition === "free-end") {
    // ADR 0110 N11.1: past a free-end fridge the remainder stays bare, whatever its width.
    expect(pantriesAfterFridge, JSON.stringify(room)).toHaveLength(0);
  } else if (gapMm < 400) {
    expect(pantriesAfterFridge, JSON.stringify(room)).toHaveLength(0);
  } else {
    expect(pantriesAfterFridge.length, JSON.stringify(room)).toBeGreaterThan(0);
  }
  // Every bare run end is under 600 mm, wherever the gap could not be fully absorbed.
  expect(plan.remainderMm[fridgeWall], JSON.stringify(room)).toBeLessThan(600);
}

/** ADR 0110 A4: at most 599 mm of any run is left empty, on all three walls. Wall A's own remainder
 *  is bare only where the fixed core already overflowed past it (`packBackWallAndOverflow`'s own
 *  comment: that remainder is under 600 mm by construction there too). A dropped fridge's wall takes
 *  door bases from its corner (N9.2), so it is held to the same bound as any other. */
function checkEveryBareRunEndUnder600(room: DesignRoom): void {
  const plan = planFor(room);
  if (!plan.minimumMet) return;
  for (const wall of ["A", "B", "C"] as const) {
    expect(
      plan.remainderMm[wall],
      `${wall} ${JSON.stringify(room)}`,
    ).toBeLessThan(600);
    expect(
      plan.remainderMm[wall],
      `${wall} ${JSON.stringify(room)}`,
    ).toBeGreaterThanOrEqual(0);
  }
}

const PAN_DRAWER = "base-panbank";
const THREE_DRAWER = "base-3drawer";
const BOTTLE = "base-bottle-cargo";
const DOOR_BASE = "base-cabinet";
const OVEN_TOWER = "tall-oven-tower";
const PANTRY = "tall-pantry";
const PLAIN_MODULE_MM = 600;
/** The four ids a back-wall overflow item carries onto the far wall (`u-composition.ts`'s `idOf`). */
const CORE_IDS = ["sink", "dishwasher", "preparation", "hob"];

type Plan = ReturnType<typeof planFor>;
type PlannedBase = Plan["bases"][number];

function enteredLengthMm(room: DesignRoom, wall: DesignWall): number {
  if (wall === "A") return room.widthMm;
  return wall === "B" ? room.depthMm : (room.wallCMm ?? 0);
}

/** *N3 revised* 3's count of base bodies from the corner for a wall over 3000 mm. */
function bodiesFromTheCornerFor(enteredMm: number): number {
  return enteredMm <= 4000 ? 2 : 3;
}

function isDrawerCabinet(base: PlannedBase): boolean {
  return base.buildId === PAN_DRAWER || base.buildId === THREE_DRAWER;
}

/** Every drawer cabinet but the preparation cabinet, which is itself a `base-3drawer`. */
function isDrawerExtra(base: PlannedBase): boolean {
  return isDrawerCabinet(base) && base.role !== "preparation";
}

/** AC1 (a): no drawer extra stands after the tower in run order (ADR 0110 N10.3 step 4, RQ19 (b)). */
function checkNoDrawerExtraAfterTheTower(room: DesignRoom): void {
  const plan = planFor(room);
  if (!plan.minimumMet) return;
  const order = runOrderOf({ room, plan, runs: uShellFloorRuns(room) });
  const towerIndex = order.findIndex((base) => base.buildId === OVEN_TOWER);
  if (towerIndex === -1) return;

  const extrasAfterTheTower = order.slice(towerIndex).filter(isDrawerExtra);

  expect(
    extrasAfterTheTower.map((base) => base.id),
    JSON.stringify(room),
  ).toStrictEqual([]);
}

/** AC1 (b): where a bottle stands, it is on the hob's wall and its near edge is the hob's far edge
 *  in run direction — wall A runs with increasing coordinate from a fridge on B, decreasing from a
 *  fridge on C, and the far wall always increasing. Either wall, with or without a tower. */
function checkTheBottleStandsDirectlyAfterTheHob(room: DesignRoom): void {
  const plan = planFor(room);
  if (!plan.minimumMet) return;
  const bottles = plan.bases.filter((base) => base.buildId === BOTTLE);
  const hob = plan.bases.find((base) => base.role === "hob");
  expect(bottles.length, JSON.stringify(room)).toBeLessThanOrEqual(1);
  const [bottle] = bottles;
  if (bottle === undefined || hob === undefined) return;

  expect(bottle.wall, JSON.stringify(room)).toBe(hob.wall);
  const runsForward = bottle.wall !== "A" || fridgeWallOf(room) === "B";
  expect(
    runsForward ? bottle.startMm : bottle.endMm,
    JSON.stringify(room),
  ).toBe(runsForward ? hob.endMm : hob.startMm);
}

/** AC1 (c): the bottle never costs a drawer unit (RQ21). In a plan with fewer drawer cabinets than
 *  `N(T)`: (i) no plain door base stands after the hob in run order, and (ii) on the bottle's wall the
 *  bare end, the bottle and every widened pantry's width over 600 mm do not add up to a whole module
 *  that a drawer could have taken. */
function checkTheBottleCostsNoDrawerUnit(room: DesignRoom): void {
  const plan = planFor(room);
  if (!plan.minimumMet) return;
  if (plan.bases.filter(isDrawerCabinet).length >= drawerTargetOf(room)) return;

  const order = runOrderOf({ room, plan, runs: uShellFloorRuns(room) });
  const hobIndex = order.findIndex((base) => base.role === "hob");
  const plainDoorsAfterTheHob = order
    .slice(hobIndex + 1)
    .filter((base) => base.buildId === DOOR_BASE);
  expect(
    plainDoorsAfterTheHob.map((base) => base.id),
    JSON.stringify(room),
  ).toStrictEqual([]);

  const bottle = plan.bases.find((base) => base.buildId === BOTTLE);
  if (bottle === undefined) return;
  const widenedPantryExcessMm = plan.bases
    .filter((base) => base.wall === bottle.wall && base.buildId === PANTRY)
    .reduce(
      (sum, base) => sum + Math.max(0, base.widthMm - PLAIN_MODULE_MM),
      0,
    );
  expect(
    plan.remainderMm[bottle.wall] + bottle.widthMm + widenedPantryExcessMm,
    JSON.stringify(room),
  ).toBeLessThan(PLAIN_MODULE_MM);
}

/** AC1 (d): the tower's bound. On a far wall over 3000 mm the bodies before the tower number at
 *  most `max(n, overflowed core + bottle + drawer extras on that wall)`, and every one of them is one
 *  of those or a plain door — a plain door only where the room already has `N(T)` drawer cabinets.
 *  A far wall of 3000 mm or less keeps the tower or block at its free end: after the first tall
 *  column nothing stands but tall columns. */
function checkTheTowersBound(room: DesignRoom): void {
  const plan = planFor(room);
  if (!plan.minimumMet) return;
  const farWall = farWallOf(room);
  const bodies = basesOn(plan, farWall);
  const towerIndex = bodies.findIndex((base) => base.buildId === OVEN_TOWER);
  if (towerIndex === -1) return;

  const enteredMm = enteredLengthMm(room, farWall);
  if (enteredMm <= 3000) {
    const firstColumnIndex = bodies.findIndex((base) =>
      isTallColumn(base.buildId),
    );
    const afterTheBlock = bodies
      .slice(firstColumnIndex)
      .filter((base) => !isTallColumn(base.buildId));
    expect(afterTheBlock, JSON.stringify(room)).toStrictEqual([]);
    return;
  }

  const beforeTheTower = bodies.slice(0, towerIndex);
  const overflowedCore = beforeTheTower.filter((base) =>
    CORE_IDS.includes(base.id),
  );
  const bottles = beforeTheTower.filter((base) => base.buildId === BOTTLE);
  const drawerExtras = beforeTheTower.filter(isDrawerExtra);
  const plainDoors = beforeTheTower.filter(
    (base) => base.buildId === DOOR_BASE,
  );
  const bound = Math.max(
    bodiesFromTheCornerFor(enteredMm),
    overflowedCore.length + bottles.length + drawerExtras.length,
  );

  expect(beforeTheTower.length, JSON.stringify(room)).toBeLessThanOrEqual(
    bound,
  );
  expect(
    overflowedCore.length +
      bottles.length +
      drawerExtras.length +
      plainDoors.length,
    JSON.stringify(room),
  ).toBe(beforeTheTower.length);
  if (plainDoors.length > 0) {
    expect(
      plan.bases.filter(isDrawerCabinet).length,
      JSON.stringify(room),
    ).toBe(drawerTargetOf(room));
  }
}

/** AC1 (e), the tower's half: no room loses or gains its tower against the layout with nothing added. */
function checkTheTowerIsNeitherLostNorGained(room: DesignRoom): void {
  const plan = planFor(room);
  if (!plan.minimumMet) return;
  const towerStands = plan.bases.some((base) => base.buildId === OVEN_TOWER);

  expect(towerStands, JSON.stringify(room)).toBe(
    towerIsOwed({ room, plan, runs: uShellFloorRuns(room) }),
  );
}

/** The bottle after a far-wall hob (ADR 0110 N10.3 steps 4 and 5, RQ21): with no tall column on the
 *  wall and 300 mm or more after the hob, the next body is the bottle unless a drawer unit took that
 *  place — a drawer outranks the bottle, so a 600 mm drawer extra may stand there instead. */
function checkTheBottleOrADrawerFollowsAFarWallHob(room: DesignRoom): void {
  const plan = planFor(room);
  if (!plan.minimumMet) return;
  const farWall = farWallOf(room);
  const bodies = basesOn(plan, farWall);
  const hobIndex = bodies.findIndex((base) => base.role === "hob");
  const hob = bodies[hobIndex];
  if (hob === undefined) return;
  const hasColumn = bodies.some((base) => isTallColumn(base.buildId));
  const runEndMm = uShellFloorRuns(room)[farWall].endMm;
  if (hasColumn || runEndMm - hob.endMm < DECLARED_COLUMNS.bottleWidthMm)
    return;

  const next = bodies[hobIndex + 1];
  if (next?.buildId === BOTTLE) {
    expect(next.widthMm, JSON.stringify(room)).toBe(
      DECLARED_COLUMNS.bottleWidthMm,
    );
    return;
  }
  expect(next !== undefined && isDrawerExtra(next), JSON.stringify(room)).toBe(
    true,
  );
}

function isTallColumn(buildId: string): boolean {
  return buildId === OVEN_TOWER || buildId === PANTRY;
}

type HobWallArm =
  | "far-wall-hob-tower-and-bottle"
  | "far-wall-hob-tower-no-bottle"
  | "back-wall-hob-bottle-yields-to-a-drawer"
  | "back-wall-hob-extras-past-n-before-the-tower";

/** Which arms of the hob wall's fitting rule (N10.3) a room is in, read off the plan: the arms are
 *  the four places the rule moved a body, so a property that lands only on rooms outside them would
 *  certify nothing about the change. */
function hobWallArmsOf(room: DesignRoom): readonly HobWallArm[] {
  const plan = planFor(room);
  const hob = plan.bases.find((base) => base.role === "hob");
  if (!plan.minimumMet || hob === undefined) return [];
  const farWall = farWallOf(room);
  const hasBottle = plan.bases.some((base) => base.buildId === BOTTLE);
  const towerStands = plan.bases.some(
    (base) => base.wall === farWall && base.buildId === OVEN_TOWER,
  );
  return hob.wall === farWall
    ? farWallHobArmsOf({ room, plan, hob, hasBottle, towerStands })
    : backWallHobArmsOf({ room, plan, hob, hasBottle, towerStands });
}

interface HobWallArmContext {
  readonly room: DesignRoom;
  readonly plan: Plan;
  readonly hob: PlannedBase;
  readonly hasBottle: boolean;
  readonly towerStands: boolean;
}

function farWallHobArmsOf(context: HobWallArmContext): readonly HobWallArm[] {
  const { room, hob, hasBottle, towerStands } = context;
  if (!towerStands) return [];
  if (hasBottle) return ["far-wall-hob-tower-and-bottle"];
  const runEndMm = uShellFloorRuns(room)[farWallOf(room)].endMm;
  return runEndMm - hob.endMm >= DECLARED_COLUMNS.bottleWidthMm
    ? ["far-wall-hob-tower-no-bottle"]
    : [];
}

function backWallHobArmsOf(context: HobWallArmContext): readonly HobWallArm[] {
  const { room, plan, hasBottle } = context;
  const arms: HobWallArm[] = [];
  const order = runOrderOf({ room, plan, runs: uShellFloorRuns(room) });
  const hobIndex = order.findIndex((base) => base.role === "hob");
  const coreWidthMm = order
    .slice(0, hobIndex + 1)
    .reduce((sum, base) => sum + base.widthMm, 0);
  const freeAfterTheHobMm =
    uShellFloorRuns(room).A.endMm -
    uShellFloorRuns(room).A.startMm -
    coreWidthMm;
  if (!hasBottle && freeAfterTheHobMm >= DECLARED_COLUMNS.bottleWidthMm) {
    arms.push("back-wall-hob-bottle-yields-to-a-drawer");
  }
  const farBodies = basesOn(plan, farWallOf(room));
  const towerIndex = farBodies.findIndex((base) => base.buildId === OVEN_TOWER);
  const beforeTheTower = farBodies.slice(0, Math.max(0, towerIndex));
  const n = bodiesFromTheCornerFor(enteredLengthMm(room, farWallOf(room)));
  if (
    towerIndex !== -1 &&
    enteredLengthMm(room, farWallOf(room)) > 3000 &&
    beforeTheTower.length > n &&
    beforeTheTower.some(isDrawerExtra)
  ) {
    arms.push("back-wall-hob-extras-past-n-before-the-tower");
  }
  return arms;
}

/** A fixed grid dense enough to land in every arm: A in 300 mm steps, the side walls in 200 mm. */
function hobWallGridRooms(): readonly DesignRoom[] {
  const rooms: DesignRoom[] = [];
  for (let widthMm = 2700; widthMm <= 6000; widthMm += 300) {
    for (let depthMm = 1000; depthMm <= 6000; depthMm += 200) {
      for (let wallCMm = 1000; wallCMm <= 6000; wallCMm += 200) {
        rooms.push(uRoom(widthMm, depthMm, wallCMm, 2600));
      }
    }
  }
  return rooms;
}

function hobWallArmCounts(
  rooms: readonly DesignRoom[],
): Readonly<Record<HobWallArm, number>> {
  const counts: Record<HobWallArm, number> = {
    "far-wall-hob-tower-and-bottle": 0,
    "far-wall-hob-tower-no-bottle": 0,
    "back-wall-hob-bottle-yields-to-a-drawer": 0,
    "back-wall-hob-extras-past-n-before-the-tower": 0,
  };
  for (const room of rooms) {
    for (const arm of hobWallArmsOf(room)) counts[arm] += 1;
  }
  return counts;
}

/** Every AC1 (a)-(e) property, run over one room. */
function checkTheHobWallFittingRule(room: DesignRoom): void {
  checkNoDrawerExtraAfterTheTower(room);
  checkTheBottleStandsDirectlyAfterTheHob(room);
  checkTheBottleCostsNoDrawerUnit(room);
  checkTheTowersBound(room);
  checkTheTowerIsNeitherLostNorGained(room);
}

interface GridMeasurement {
  readonly composed: number;
  readonly towersByPosition: Readonly<
    Record<"n2" | "n3" | "freeEnd" | "none", number>
  >;
  readonly farWallPantryCount: number;
  readonly farWallPantryWidthMm: number;
  readonly fridgeWallDigest: string;
}

/** What the U planner produces over N4's grid (A 2700-6000, B and C 1000-6000, step 100, h 2600), read
 *  with the same definitions this file uses: how many rooms compose, where their towers stand, the far
 *  wall's pantries, and a digest of every fridge wall. ADR 0110 N10.5 records the towers and the far
 *  wall's pantries as what N10.3 promises not to move, and N11.5 records the fridge wall as what N11.1
 *  moved: a fridge at the free end stands right after its door storage, with the bare remainder
 *  beyond it, in 10 178 rooms. The fridge-wall digest is N11.1's (`5d2962d4…fdfc2`), and the other
 *  fields are the ones N10.5 records, unchanged by N11. */
const RECORDED_U_GRID_MEASUREMENT: GridMeasurement = {
  composed: 86_706,
  towersByPosition: { n2: 16_487, n3: 13_600, freeEnd: 26_216, none: 30_403 },
  farWallPantryCount: 680,
  farWallPantryWidthMm: 449_200,
  fridgeWallDigest:
    "5d2962d48475ef6e7dde181952f0e692e109ba1ed8a827ad8e39c5b39ecfdfc2",
};

function measureTheRecordedGrid(): GridMeasurement {
  const fridgeWallDigest = createHash("sha256");
  const towersByPosition = { n2: 0, n3: 0, freeEnd: 0, none: 0 };
  let composed = 0;
  let farWallPantryCount = 0;
  let farWallPantryWidthMm = 0;
  for (let widthMm = 2700; widthMm <= 6000; widthMm += 100) {
    for (let depthMm = 1000; depthMm <= 6000; depthMm += 100) {
      for (let wallCMm = 1000; wallCMm <= 6000; wallCMm += 100) {
        const room = uRoom(widthMm, depthMm, wallCMm, 2600);
        const plan = planFor(room);
        if (!plan.minimumMet) continue;
        composed += 1;
        towersByPosition[towerBucketOf(plan.towerPosition)] += 1;
        for (const base of basesOn(plan, farWallOf(room))) {
          if (base.buildId !== PANTRY) continue;
          farWallPantryCount += 1;
          farWallPantryWidthMm += base.widthMm;
        }
        const signature = basesOn(plan, fridgeWallOf(room))
          .map(
            (base) =>
              `${base.buildId}@${String(base.startMm)}-${String(base.endMm)}`,
          )
          .join(",");
        fridgeWallDigest.update(
          `${String(widthMm)}/${String(depthMm)}/${String(wallCMm)}|${signature}\n`,
        );
      }
    }
  }
  return {
    composed,
    towersByPosition,
    farWallPantryCount,
    farWallPantryWidthMm,
    fridgeWallDigest: fridgeWallDigest.digest("hex"),
  };
}

function towerBucketOf(
  position: Plan["towerPosition"],
): "n2" | "n3" | "freeEnd" | "none" {
  if (position === undefined) return "none";
  if (position === "free-end") return "freeEnd";
  return position === 2 ? "n2" : "n3";
}

/** The drop band's own fixed grid: every room here has a dropped fridge, and the count proves the
 *  sweep exercised it. */
function dropBandRooms(): readonly DesignRoom[] {
  const rooms: DesignRoom[] = [];
  for (const widthMm of [2700, 3000, 3600, 6000]) {
    for (let depthMm = 1000; depthMm <= 1690; depthMm += 90) {
      for (let wallCMm = 1000; wallCMm <= 1690; wallCMm += 90) {
        rooms.push(uRoom(widthMm, depthMm, wallCMm, 2600));
      }
    }
  }
  return rooms;
}

describe("planUKitchenComposition holds AC1's S2 share", () => {
  propertyTest.prop([sweptRoomArb], { numRuns: RUNS })(
    "exactly one oven, and the hob agrees with whether a tower stands",
    checkOneOven,
  );

  propertyTest.prop([sweptRoomArb], { numRuns: RUNS })(
    "no pantry on a large U's far wall",
    checkNoPantryOnALargeUFarWall,
  );

  propertyTest.prop([sweptRoomArb], { numRuns: RUNS })(
    "the fridge-to-free-end gap of a counted fridge takes a pantry at 400 mm and above, and stays bare under it; a free-end fridge has no gap (N11.1)",
    checkFridgeGapFillOrBare,
  );

  propertyTest.prop([sweptRoomArb], { numRuns: RUNS })(
    "every bare run end is under 600 mm on all three walls, RQ17's remainder included",
    checkEveryBareRunEndUnder600,
  );

  propertyTest.prop([dropBandRoomArb], { numRuns: RUNS })(
    "every bare run end is under 600 mm where the fridge is dropped (N9.2)",
    checkEveryBareRunEndUnder600,
  );

  propertyTest.prop([sweptRoomArb], { numRuns: RUNS })(
    "no drawer extra stands after the tower (N10.3 step 4, AC1 a)",
    checkNoDrawerExtraAfterTheTower,
  );

  propertyTest.prop([sweptRoomArb], { numRuns: RUNS })(
    "the bottle stands directly after the hob, on either wall, with or without a tower (AC1 b)",
    checkTheBottleStandsDirectlyAfterTheHob,
  );

  propertyTest.prop([sweptRoomArb], { numRuns: RUNS })(
    "the bottle never costs a drawer unit: a plan short of N(T) has no plain door after the hob (AC1 c)",
    checkTheBottleCostsNoDrawerUnit,
  );

  propertyTest.prop([sweptRoomArb], { numRuns: RUNS })(
    "the tower's bodies before it are core, bottle, drawer extras or doors up to n, and a short far wall keeps its block at the free end (AC1 d)",
    checkTheTowersBound,
  );

  propertyTest.prop([sweptRoomArb], { numRuns: RUNS })(
    "no room loses or gains its tower against the layout with nothing added (AC1 e)",
    checkTheTowerIsNeitherLostNorGained,
  );

  propertyTest.prop([farWallHobRoomArb], { numRuns: RUNS })(
    "a bottle, or the drawer that outranks it (RQ21), follows a far-wall hob when no tall column stands there",
    checkTheBottleOrADrawerFollowsAFarWallHob,
  );

  it("exercises the drop band and every arm of the hob wall's fitting rule, not only the arms nobody changed", () => {
    const droppedFridgeRooms = dropBandRooms().filter((room) => {
      const plan = planFor(room);
      return plan.minimumMet && plan.dropped.includes("fridge");
    });
    const gridRooms = hobWallGridRooms();
    const armCounts = hobWallArmCounts(gridRooms);

    expect(droppedFridgeRooms.length).toBeGreaterThan(50);
    expect(armCounts["far-wall-hob-tower-and-bottle"]).toBeGreaterThanOrEqual(
      1,
    );
    expect(armCounts["far-wall-hob-tower-no-bottle"]).toBeGreaterThanOrEqual(1);
    expect(
      armCounts["back-wall-hob-bottle-yields-to-a-drawer"],
    ).toBeGreaterThanOrEqual(1);
    expect(
      armCounts["back-wall-hob-extras-past-n-before-the-tower"],
    ).toBeGreaterThanOrEqual(1);
    for (const room of droppedFridgeRooms) checkEveryBareRunEndUnder600(room);
    for (const room of gridRooms) checkTheHobWallFittingRule(room);
  });

  it("leaves the towers and the far wall's pantries as N10.5 records them, and moves the fridge wall exactly as N11.1 rules (AC1 e, AC3 vi)", () => {
    const measured = measureTheRecordedGrid();

    expect(measured).toStrictEqual(RECORDED_U_GRID_MEASUREMENT);
  });

  it("holds over the boundaries N3r 3 and N3r 10 name", () => {
    for (const room of boundaryRooms()) {
      checkOneOven(room);
      checkNoPantryOnALargeUFarWall(room);
      checkFridgeGapFillOrBare(room);
      checkTheHobWallFittingRule(room);
      checkEveryBareRunEndUnder600(room);
    }
  });
});
