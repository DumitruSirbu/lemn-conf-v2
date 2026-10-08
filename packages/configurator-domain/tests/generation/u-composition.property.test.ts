// M7B U3a slice S1, AC1's own share: the rules hold as properties over the owner's U range — A
// 2700-6000, B and C 1000-6000 (ADR 0108 H2 / ADR 0110 N3r 1's own T_min) — plus the boundaries
// *N3 revised* 3 names (3000/3001, 4000/4001) and B = C. The RQ9 declared witness lives in
// `u-composition.test.ts` (ADR 0123): it cannot be swept, because it is provably unreachable on any
// orderable room (`u-composition.ts`'s own head comment on `placedFridge`).
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { type DesignRoom, type DesignWall } from "../../src/index.js";
import { basesOn, planFor, uRoom } from "../support/u-plan-fixtures.js";
import { isWallAFill } from "../support/u-plan-invariants.js";

const RUNS = 200;

const wallAArb = fc.integer({ min: 2700, max: 6000 });
const sideWallArb = fc.integer({ min: 1000, max: 6000 });
const heightArb = fc.constantFrom(2200, 2600, 3900);

const sweptRoomArb = fc
  .tuple(wallAArb, sideWallArb, sideWallArb, heightArb)
  .map(([widthMm, depthMm, wallCMm, heightMm]) =>
    uRoom(widthMm, depthMm, wallCMm, heightMm),
  );

/** The boundaries *N3 revised* 3 names, each held on both side walls in turn, plus B = C — swept
 *  over a fixed set of wall-A samples rather than one, so a boundary's own interaction with the
 *  fridge-wall choice is exercised too. */
function boundaryRooms(): readonly DesignRoom[] {
  const wallAValuesMm = [2700, 3600, 6000];
  const boundarySideValuesMm = [3000, 3001, 4000, 4001];
  const rooms: DesignRoom[] = [];
  for (const widthMm of wallAValuesMm) {
    for (const boundaryMm of boundarySideValuesMm) {
      rooms.push(uRoom(widthMm, boundaryMm, 1200, 2600));
      rooms.push(uRoom(widthMm, 1200, boundaryMm, 2600));
    }
    rooms.push(uRoom(widthMm, 3000, 3000, 2600)); // B = C
  }
  return rooms;
}

function expectedFridgeWall(room: DesignRoom): DesignWall {
  return room.depthMm >= (room.wallCMm ?? 0) ? "B" : "C";
}

function everyRoom(): readonly DesignRoom[] {
  return [...boundaryRooms()];
}

describe("planUKitchenComposition holds N3r 2, 3 and 5 (AC1's own share)", () => {
  propertyTest.prop([sweptRoomArb], { numRuns: RUNS })(
    "the fridge stands on the wider side wall (or B on a tie), or is dropped, never both walls at once",
    (room) => {
      const plan = planFor(room);
      const onExpected = basesOn(plan, expectedFridgeWall(room)).some(
        (base) => base.role === "fridge",
      );
      const onOther = basesOn(
        plan,
        expectedFridgeWall(room) === "B" ? "C" : "B",
      ).some((base) => base.role === "fridge");
      const dropped = plan.dropped.includes("fridge");

      expect(onOther, JSON.stringify(room)).toBe(false);
      expect(onExpected || dropped, JSON.stringify(room)).toBe(true);
      expect(onExpected && dropped, JSON.stringify(room)).toBe(false);
    },
  );

  propertyTest.prop([sweptRoomArb], { numRuns: RUNS })(
    "the sink is the first body in reading order on wall A, whenever the plan composes",
    (room) => {
      const plan = planFor(room);
      if (!plan.minimumMet) return;
      const fridgeWall = expectedFridgeWall(room);
      const onA = basesOn(plan, "A").filter((base) => !isWallAFill(base));
      const first =
        fridgeWall === "B"
          ? onA.reduce<(typeof onA)[number] | undefined>(
              (nearest, base) =>
                nearest === undefined || base.startMm < nearest.startMm
                  ? base
                  : nearest,
              undefined,
            )
          : onA.reduce<(typeof onA)[number] | undefined>(
              (nearest, base) =>
                nearest === undefined || base.endMm > nearest.endMm
                  ? base
                  : nearest,
              undefined,
            );

      expect(first?.role, JSON.stringify(room)).toBe("sink");
    },
  );

  propertyTest.prop([sweptRoomArb], { numRuns: RUNS })(
    "the back wall and overflow order is sink, [dishwasher], [preparation], hob — never re-ordered",
    (room) => {
      const plan = planFor(room);
      if (!plan.minimumMet) return;
      const readingOrderRoles = coreReadingOrderRolesOf(plan);

      expect(readingOrderRoles, JSON.stringify(room)).toStrictEqual(
        expectedCoreOrder(plan),
      );
    },
  );

  propertyTest.prop([sweptRoomArb], { numRuns: RUNS })(
    "the plan is deterministic",
    (room) => {
      const first = JSON.stringify(planFor(room));
      const second = JSON.stringify(planFor(room));

      expect(second, JSON.stringify(room)).toBe(first);
    },
  );

  propertyTest.prop([sweptRoomArb], { numRuns: RUNS })(
    "every base before the fridge is a storage base, and above 3000 mm entered there are at most N3r 3's count",
    (room) => {
      const plan = planFor(room);
      const fridgeWall = expectedFridgeWall(room);
      const onFridgeWall = basesOn(plan, fridgeWall).sort(
        (left, right) => left.startMm - right.startMm,
      );
      const fridgeIndex = onFridgeWall.findIndex(
        (base) => base.role === "fridge",
      );
      if (fridgeIndex === -1) return; // the fridge was dropped (ADR 0110 N9.2): its wall holds door bases only

      expect(
        onFridgeWall
          .slice(0, fridgeIndex)
          .every((base) => base.role === "storage"),
        JSON.stringify(room),
      ).toBe(true);

      // *N3 revised* 3's fixed count applies only past 3000 mm entered — at or under, the fridge
      // sits at the free end and the corner-to-fridge gap is leftover-filled at whatever count the
      // capacity allows, which N3r 3 does not bound.
      const enteredMm = fridgeWall === "B" ? room.depthMm : (room.wallCMm ?? 0);
      if (enteredMm <= 3000) return;
      const upperBoundCount = enteredMm <= 4000 ? 2 : 3;

      expect(fridgeIndex, JSON.stringify(room)).toBeLessThanOrEqual(
        upperBoundCount,
      );
    },
  );

  it("holds over the boundaries N3r 3 names, plus B = C", () => {
    const fridgeWallsOnATie: (DesignWall | "dropped")[] = [];
    let countsChecked = 0;

    for (const room of everyRoom()) {
      const plan = planFor(room);
      const fridgeWall = fridgeWallOf(plan);

      expect([JSON.stringify(room), fridgeWall]).toStrictEqual([
        JSON.stringify(room),
        fridgeWall === "dropped" ? "dropped" : expectedFridgeWall(room),
      ]);
      if (room.depthMm === room.wallCMm) fridgeWallsOnATie.push(fridgeWall);
      if (fridgeWall === "dropped") continue;
      const enteredMm = fridgeWall === "B" ? room.depthMm : (room.wallCMm ?? 0);
      if (enteredMm <= N3R_COUNT_APPLIES_PAST_MM) continue;
      expect([
        JSON.stringify(room),
        storageBasesBeforeTheFridge(plan, fridgeWall),
      ]).toStrictEqual([JSON.stringify(room), n3rCountPast3000(enteredMm)]);
      countsChecked += 1;
    }

    // Both sides of the 4000 mm step, on both side walls, at the two wall-A samples wide enough to stand a fridge.
    expect(countsChecked).toBe(12);
    // The tie is decided, not dodged: every B = C room stands its fridge, and on wall B.
    expect(fridgeWallsOnATie).toStrictEqual(["B", "B", "B"]);
  });
});

/** The wall the plan stands its fridge on. A fridge on both side walls is reported as neither. */
function fridgeWallOf(
  plan: ReturnType<typeof planFor>,
): DesignWall | "dropped" {
  const walls = (["A", "B", "C"] as const).filter((wall) =>
    basesOn(plan, wall).some((base) => base.role === "fridge"),
  );
  const [only] = walls;
  if (walls.length > 1 || only === "A")
    throw new Error(`the fridge stands on ${walls.join(" and ")}`);
  return only ?? "dropped";
}

function storageBasesBeforeTheFridge(
  plan: ReturnType<typeof planFor>,
  fridgeWall: DesignWall,
): number {
  const onFridgeWall = basesOn(plan, fridgeWall).sort(
    (left, right) => left.startMm - right.startMm,
  );
  return onFridgeWall.findIndex((base) => base.role === "fridge");
}

/** *N3 revised* 3's fixed count starts past this entered length; at or under it the gap is leftover-filled. */
const N3R_COUNT_APPLIES_PAST_MM = 3000;

/** *N3 revised* 3, restated: two bases before the fridge up to 4000 mm entered, three past it. */
function n3rCountPast3000(enteredMm: number): number {
  return enteredMm <= 4000 ? 2 : 3;
}

function coreReadingOrderRolesOf(
  plan: ReturnType<typeof planFor>,
): readonly string[] {
  const fridgeWall = expectedFridgeWall(plan.room);
  const onA = orderedInReadingDirection(basesOn(plan, "A"), fridgeWall);
  const farWall: DesignWall = fridgeWall === "B" ? "C" : "B";
  const onFar = basesOn(plan, farWall).sort(
    (left, right) => left.startMm - right.startMm,
  );
  return [...onA, ...onFar]
    .filter(
      (base) => base.role !== "storage" || base.buildId === "base-dishwasher",
    )
    .map((base) =>
      base.buildId === "base-dishwasher" ? "dishwasher" : base.role,
    );
}

function orderedInReadingDirection<T extends { readonly startMm: number }>(
  bases: readonly T[],
  fridgeWall: DesignWall,
): readonly T[] {
  const sorted = [...bases].sort((left, right) => left.startMm - right.startMm);
  return fridgeWall === "B" ? sorted : [...sorted].reverse();
}

function expectedCoreOrder(
  plan: ReturnType<typeof planFor>,
): readonly string[] {
  const hasDishwasher = plan.bases.some(
    (base) => base.buildId === "base-dishwasher",
  );
  const hasPreparation = plan.bases.some((base) => base.role === "preparation");
  return [
    "sink",
    ...(hasDishwasher ? ["dishwasher"] : []),
    ...(hasPreparation ? ["preparation"] : []),
    "hob",
  ];
}
