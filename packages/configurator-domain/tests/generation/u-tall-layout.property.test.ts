// M7B U3a slice S2, AC1's own share: one oven per plan; the tower at its count from the corner; no
// pantry on a large U's far wall; a pantry or a bare gap between the fridge and the free end at
// every size; every bare run end under 600 mm, RQ17's remainder included. Swept over the same range
// S1's own property suite uses (A 2700-6000, B and C 1000-6000, h 2200/2600/3900), plus the same
// fixed boundary sweep.
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
  if (!fridge) return; // the fridge was dropped (RQ9's own empty-population branch)

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

/** ADR 0110 A4: at most 599 mm of any run is left empty, on all three walls — the correction
 *  reported 2026-09-29, S3's own must-fix item 5. Wall A's own remainder is bare only where the
 *  fixed core already overflowed past it (`packBackWallAndOverflow`'s own comment: that remainder
 *  is under 600 mm by construction there too). A dropped fridge (RQ9's own empty-population branch)
 *  leaves its wall's own gap unattempted — there is no fridge to gap-fill from — so that wall's raw,
 *  unconsumed capacity is not a "run end" this property covers. */
function checkEveryBareRunEndUnder600(room: DesignRoom): void {
  const plan = planFor(room);
  if (!plan.minimumMet) return;
  const fridgeWall = fridgeWallOf(room);
  const farWall: DesignWall = fridgeWall === "B" ? "C" : "B";
  const walls: readonly DesignWall[] = plan.dropped.includes("fridge")
    ? ["A", farWall]
    : ["A", fridgeWall, farWall];
  for (const wall of walls) {
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
    "every bare run end is under 600 mm, RQ17's remainder included",
    checkEveryBareRunEndUnder600,
  );

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
