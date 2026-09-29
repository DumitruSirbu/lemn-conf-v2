// M7B U3a slice S2, AC1's own share: one oven per plan; the tower at its count from the corner; no
// pantry on a large U's far wall; a pantry or a bare gap between the fridge and the free end at
// every size; every bare run end under 600 mm on all three walls, RQ17's remainder and a dropped
// fridge's wall included (ADR 0110 N9.2); the bottle after a far-wall hob (N9.3). Swept over the same
// range S1's own property suite uses (A 2700-6000, B and C 1000-6000, h 2200/2600/3900), a drop-band
// sweep (both side walls under 1700 mm, where the fridge is dropped), plus the same fixed boundary
// sweep.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  KITCHEN_L_DESIGN,
  uShellFloorRuns,
  type DesignRoom,
  type DesignWall,
} from "../../src/index.js";
import { planUKitchenComposition } from "../../src/generation/u-composition.js";

const RUNS = 200;

const DECLARED = declaredColumnSizes(
  buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN)),
);

function uRoom(
  widthMm: number,
  depthMm: number,
  wallCMm: number,
  heightMm: number,
): DesignRoom {
  return { shape: "U", widthMm, depthMm, wallCMm, heightMm };
}

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

function planFor(room: DesignRoom) {
  return planUKitchenComposition({
    room,
    runs: uShellFloorRuns(room),
    columns: DECLARED,
  });
}

function fridgeWallOf(room: DesignRoom): DesignWall {
  return room.depthMm >= (room.wallCMm ?? 0) ? "B" : "C";
}

function isLargeU(room: DesignRoom): boolean {
  return room.widthMm + room.depthMm + (room.wallCMm ?? 0) >= 10_000;
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
  if (!plan.minimumMet || !isLargeU(room)) return;
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
  if (gapMm < 400) {
    expect(pantriesAfterFridge, JSON.stringify(room)).toHaveLength(0);
  } else {
    expect(pantriesAfterFridge.length, JSON.stringify(room)).toBeGreaterThan(0);
  }
  // Every bare run end is under 600 mm, wherever the gap could not be fully absorbed.
  expect(plan.remainderMm[fridgeWall], JSON.stringify(room)).toBeLessThan(600);
}

function checkTowerCountFromCorner(room: DesignRoom): void {
  const plan = planFor(room);
  if (!plan.minimumMet) return;
  const fridgeWall = fridgeWallOf(room);
  const farWall: DesignWall = fridgeWall === "B" ? "C" : "B";
  const enteredMm = farWall === "B" ? room.depthMm : (room.wallCMm ?? 0);
  if (enteredMm <= 3000) return; // the free-end case, checked by the bare-run-end property instead
  const tower = plan.bases.find(
    (base) => base.wall === farWall && base.buildId === "tall-oven-tower",
  );
  if (!tower) return; // no capacity for a tower at all

  // Overflowed core bodies count toward `n`, and where they already exceed it the tower follows
  // them directly (*N3 revised* 10) — so the bound is `n`, or the overflow's own count when that is
  // larger, never `n` alone. The four fixed ids are the only ones a back-wall overflow item ever
  // carries (`u-composition.ts`'s own `idOf`); everything else on the far wall is this module's own
  // counted door base, column or pantry.
  const overflowCount = plan.bases.filter(
    (base) =>
      base.wall === farWall &&
      ["sink", "dishwasher", "preparation", "hob"].includes(base.id),
  ).length;
  const upperBoundCount = Math.max(enteredMm <= 4000 ? 2 : 3, overflowCount);
  const beforeTower = plan.bases.filter(
    (base) => base.wall === farWall && base.startMm < tower.startMm,
  );
  expect(beforeTower.length, JSON.stringify(room)).toBeLessThanOrEqual(
    upperBoundCount,
  );
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

function farWallBodiesOf(room: DesignRoom, plan: ReturnType<typeof planFor>) {
  const farWall: DesignWall = fridgeWallOf(room) === "B" ? "C" : "B";
  const bodies = plan.bases
    .filter((base) => base.wall === farWall)
    .sort((left, right) => left.startMm - right.startMm);
  return { farWall, bodies };
}

function isTallColumn(buildId: string): boolean {
  return buildId === "tall-oven-tower" || buildId === "tall-pantry";
}

type FarWallBottleArm = "bottle-ruled" | "tall-column-follows" | "outside";

/** Which arm of ADR 0110 N9.3 the room is in, read off the plan's own far wall: the hob stands
 *  there, and either no tall column stands on the wall (the bottle is ruled when 300 mm follows the
 *  hob), or one stands after the hob (RQ20's default: no bottle between them). */
function farWallBottleArmOf(room: DesignRoom): FarWallBottleArm {
  const plan = planFor(room);
  if (!plan.minimumMet) return "outside";
  const { farWall, bodies } = farWallBodiesOf(room, plan);
  const hob = bodies.find((base) => base.role === "hob");
  if (!hob) return "outside";
  const runEndMm = uShellFloorRuns(room)[farWall].endMm;
  const hasColumnAfterHob = bodies.some(
    (base) => isTallColumn(base.buildId) && base.startMm >= hob.endMm,
  );
  if (hasColumnAfterHob) return "tall-column-follows";
  const hasColumn = bodies.some((base) => isTallColumn(base.buildId));
  return !hasColumn && runEndMm - hob.endMm >= DECLARED.bottleWidthMm
    ? "bottle-ruled"
    : "outside";
}

function checkTheBottleFollowsAFarWallHob(room: DesignRoom): void {
  const arm = farWallBottleArmOf(room);
  const plan = planFor(room);
  const { bodies } = farWallBodiesOf(room, plan);
  const hobIndex = bodies.findIndex((base) => base.role === "hob");

  if (arm === "bottle-ruled") {
    expect(bodies[hobIndex + 1]?.buildId, JSON.stringify(room)).toBe(
      "base-bottle-cargo",
    );
    expect(bodies[hobIndex + 1]?.widthMm, JSON.stringify(room)).toBe(
      DECLARED.bottleWidthMm,
    );
  }
  if (arm === "tall-column-follows") {
    const columnIndex = bodies.findIndex(
      (base, index) => index > hobIndex && isTallColumn(base.buildId),
    );
    const between = bodies.slice(hobIndex + 1, columnIndex);
    expect(
      between.some((base) => base.buildId === "base-bottle-cargo"),
      JSON.stringify(room),
    ).toBe(false);
  }
}

/** The far-wall arms the bottle property branches on, counted over a fixed grid, so the property
 *  cannot pass while landing entirely on the arm nobody changed. */
function farWallBottleArmCounts(): Readonly<Record<FarWallBottleArm, number>> {
  const counts: Record<FarWallBottleArm, number> = {
    "bottle-ruled": 0,
    "tall-column-follows": 0,
    outside: 0,
  };
  for (const widthMm of [2700, 3000, 3300, 3600, 3900]) {
    for (let depthMm = 1000; depthMm <= 6000; depthMm += 500) {
      for (let wallCMm = 1000; wallCMm <= 6000; wallCMm += 500) {
        for (const heightMm of [2200, 2600, 3900]) {
          const room = uRoom(widthMm, depthMm, wallCMm, heightMm);
          counts[farWallBottleArmOf(room)] += 1;
          checkTheBottleFollowsAFarWallHob(room);
        }
      }
    }
  }
  return counts;
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
    "the fridge-to-free-end gap takes a pantry at 400 mm and above, and stays bare under it",
    checkFridgeGapFillOrBare,
  );

  propertyTest.prop([sweptRoomArb], { numRuns: RUNS })(
    "the tower stands within its own count from the corner, on a far wall over 3000 mm",
    checkTowerCountFromCorner,
  );

  propertyTest.prop([sweptRoomArb], { numRuns: RUNS })(
    "every bare run end is under 600 mm on all three walls, RQ17's remainder included",
    checkEveryBareRunEndUnder600,
  );

  propertyTest.prop([dropBandRoomArb], { numRuns: RUNS })(
    "every bare run end is under 600 mm where the fridge is dropped (N9.2)",
    checkEveryBareRunEndUnder600,
  );

  propertyTest.prop([farWallHobRoomArb], { numRuns: RUNS })(
    "the bottle follows a far-wall hob when no tall column stands there, and none stands between the hob and a tall column (N9.3)",
    checkTheBottleFollowsAFarWallHob,
  );

  it("exercises the drop band and both far-wall bottle arms, not only the arm nobody changed", () => {
    const droppedFridgeRooms = dropBandRooms().filter((room) => {
      const plan = planFor(room);
      return plan.minimumMet && plan.dropped.includes("fridge");
    });
    const armCounts = farWallBottleArmCounts();

    expect(droppedFridgeRooms.length).toBeGreaterThan(50);
    expect(armCounts["bottle-ruled"]).toBeGreaterThan(50);
    expect(armCounts["tall-column-follows"]).toBeGreaterThan(50);
    for (const room of droppedFridgeRooms) checkEveryBareRunEndUnder600(room);
  });

  it("holds over the boundaries N3r 3 and N3r 10 name", () => {
    for (const room of boundaryRooms()) {
      checkOneOven(room);
      checkNoPantryOnALargeUFarWall(room);
      checkFridgeGapFillOrBare(room);
      checkTowerCountFromCorner(room);
      checkEveryBareRunEndUnder600(room);
    }
  });
});
