// M7B U3a — ADR 0110 RQ19 (a), owner, 2026-09-29: *"yes when 3 drawer cabinets need to be placed 1 is
// pan and 2 are 3 drawers cabinet"*. The pan-drawer / 3-drawer split follows the number of drawer
// cabinets the room ACTUALLY gets (the preparation cabinet plus the extras that found a door slot),
// not the size-derived target. Swept over N4′'s grid: A 2700-6000, B and C 1000-6000, step 100,
// height 2600.
import { describe, expect, it } from "vitest";

import { type DesignRoom, type DesignWall } from "../../src/index.js";
import { planUKitchenComposition } from "../../src/generation/u-composition.js";
import { planFor, uRoom } from "../support/u-plan-fixtures.js";

const PAN_DRAWER = "base-panbank";
const THREE_DRAWER = "base-3drawer";

type CompositionPlan = ReturnType<typeof planUKitchenComposition>;

interface SweptRoom {
  readonly room: DesignRoom;
  readonly plan: CompositionPlan;
  readonly drawerCabinetCount: number;
  readonly panDrawerCount: number;
}

function countBuild(plan: CompositionPlan, buildId: string): number {
  return plan.bases.filter((base) => base.buildId === buildId).length;
}

/** The drawer cabinets that are extras: every drawer cabinet but the preparation cabinet, which is
 *  itself a `base-3drawer`. */
function countExtras(plan: CompositionPlan, buildId: string): number {
  return plan.bases.filter(
    (base) => base.role === "storage" && base.buildId === buildId,
  ).length;
}

function hasPreparationCabinet(plan: CompositionPlan): boolean {
  return plan.bases.some(
    (base) => base.role === "preparation" && base.buildId === THREE_DRAWER,
  );
}

function sweptRooms(): readonly SweptRoom[] {
  const rooms: SweptRoom[] = [];
  for (let widthMm = 2700; widthMm <= 6000; widthMm += 100) {
    for (let depthMm = 1000; depthMm <= 6000; depthMm += 100) {
      for (let wallCMm = 1000; wallCMm <= 6000; wallCMm += 100) {
        const room = uRoom(widthMm, depthMm, wallCMm);
        const plan = planFor(room);
        if (!plan.minimumMet) continue;
        const panDrawerCount = countBuild(plan, PAN_DRAWER);
        rooms.push({
          room,
          plan,
          panDrawerCount,
          drawerCabinetCount: panDrawerCount + countBuild(plan, THREE_DRAWER),
        });
      }
    }
  }
  return rooms;
}

const SWEPT = sweptRooms();

/** A failure prints a handful of rooms, not the whole sweep. */
function firstFewRooms(offenders: readonly SweptRoom[]): readonly DesignRoom[] {
  return offenders.slice(0, 5).map((swept) => swept.room);
}

function roomsWithCabinetCount(
  predicate: (count: number) => boolean,
): readonly SweptRoom[] {
  return SWEPT.filter((swept) => predicate(swept.drawerCabinetCount));
}

/** The plan's own bases in the run's reading order (*N3 revised* 5): wall A from the corner it shares
 *  with the fridge wall, then the far wall from its own corner. Restated here from the wall lengths,
 *  not read from the plan's own ordering helper, so the two cannot agree by construction. */
function runOrderOf(swept: SweptRoom): CompositionPlan["bases"] {
  const { room, plan } = swept;
  const fridgeWall: DesignWall =
    room.depthMm >= (room.wallCMm ?? 0) ? "B" : "C";
  const farWall: DesignWall = fridgeWall === "B" ? "C" : "B";
  const onWall = (wall: DesignWall) =>
    plan.bases
      .filter((base) => base.wall === wall)
      .sort((left, right) => left.startMm - right.startMm);
  const wallA = onWall("A");
  return [
    ...(fridgeWall === "B" ? wallA : wallA.reverse()),
    ...onWall(farWall),
  ];
}

describe("the pan-drawer split follows the drawer cabinets the room gets (RQ19 a)", () => {
  it("sweeps a room with exactly 3 drawer cabinets in enough numbers to mean something", () => {
    expect(
      roomsWithCabinetCount((count) => count === 3).length,
    ).toBeGreaterThan(10_000);
  });

  it("gives a room with exactly 3 drawer cabinets exactly 1 pan drawer", () => {
    const threeCabinetRooms = roomsWithCabinetCount((count) => count === 3);

    const wrongSplit = threeCabinetRooms.filter(
      (swept) => swept.panDrawerCount !== 1,
    );

    expect(firstFewRooms(wrongSplit)).toStrictEqual([]);
  });

  it("sweeps rooms with 4 and with 5 drawer cabinets, each arm in enough numbers", () => {
    expect(
      roomsWithCabinetCount((count) => count === 4).length,
    ).toBeGreaterThan(1000);
    expect(
      roomsWithCabinetCount((count) => count === 5).length,
    ).toBeGreaterThan(1000);
  });

  it("gives a room with 4 or more drawer cabinets exactly 2 pan drawers", () => {
    const manyCabinetRooms = roomsWithCabinetCount((count) => count >= 4);

    const wrongSplit = manyCabinetRooms.filter(
      (swept) => swept.panDrawerCount !== 2,
    );

    expect(firstFewRooms(wrongSplit)).toStrictEqual([]);
  });

  it("never gives a room more than 2 pan drawers", () => {
    const roomsWithAnExtra = SWEPT.filter((swept) => swept.panDrawerCount > 0);

    expect(roomsWithAnExtra.length).toBeGreaterThan(0);
    expect(
      roomsWithAnExtra.filter((swept) => swept.panDrawerCount > 2),
    ).toStrictEqual([]);
  });

  it("places every pan drawer before every extra 3-drawer in run order", () => {
    const outOfOrder = SWEPT.filter((swept) => {
      const extras = runOrderOf(swept).filter(
        (base) =>
          base.role === "storage" &&
          (base.buildId === PAN_DRAWER || base.buildId === THREE_DRAWER),
      );
      const firstThreeDrawer = extras.findIndex(
        (base) => base.buildId === THREE_DRAWER,
      );
      return (
        firstThreeDrawer !== -1 &&
        extras
          .slice(firstThreeDrawer)
          .some((base) => base.buildId === PAN_DRAWER)
      );
    });

    expect(firstFewRooms(outOfOrder)).toStrictEqual([]);
  });

  it("sweeps rooms with an extra 3-drawer, so the run-order check has something to order", () => {
    const mixedRooms = SWEPT.filter((swept) =>
      runOrderOf(swept).some(
        (base) => base.role === "storage" && base.buildId === THREE_DRAWER,
      ),
    );

    expect(mixedRooms.length).toBeGreaterThan(10_000);
  });

  it("3000 / 4500 / 4500, which gets 3 drawer cabinets, is the preparation, 1 panbank and 1 3-drawer", () => {
    const plan = planFor(uRoom(3000, 4500, 4500));

    expect(hasPreparationCabinet(plan)).toBe(true);
    expect(countExtras(plan, PAN_DRAWER)).toBe(1);
    expect(countExtras(plan, THREE_DRAWER)).toBe(1);
  });

  it("5000 / 4000 / 3000, which gets 4 drawer cabinets (ADR 0110 N10.6), is the preparation, 2 panbanks and 1 3-drawer", () => {
    const plan = planFor(uRoom(5000, 4000, 3000));

    expect(hasPreparationCabinet(plan)).toBe(true);
    expect(countExtras(plan, PAN_DRAWER)).toBe(2);
    expect(countExtras(plan, THREE_DRAWER)).toBe(1);
  });

  it("6000 / 6000 / 6000, which gets 5 drawer cabinets, has 2 panbanks and 3 3-drawers", () => {
    const plan = planFor(uRoom(6000, 6000, 6000));

    expect(countBuild(plan, PAN_DRAWER)).toBe(2);
    expect(countBuild(plan, THREE_DRAWER)).toBe(3);
  });
});
