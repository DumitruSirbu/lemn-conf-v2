// M7C wave C5 slice S2, criteria 1-5 over real U rooms: the leftover beyond the fridge that ends a U's fridge wall
// (a side wall) goes to the door base inboard of it, in the planner and in the kitchen it builds. The owner's Q6
// (2026-10-01): *"Absorb gaps under 300 mm"*; S1 built it for the L and the straight kitchen, and the U runs the
// same leaf as the last step of its plan.
//
// - A differential over the whole approved U grid (A 2700-6000, B and C 1000-6000, 100 mm, two ceilings): each
//   room's live plan is held to the plan the planner made before C5 with the owner's rule applied to it by an
//   oracle written from the owner's words (`support/fridge-end-leftover.ts`), so a room outside the rule is
//   byte-identical and a room inside it differs by the base, the fridge, the wall's remainder and its floor
//   widths alone. The count of changed rooms is pinned per wall.
// - A property at 1 mm resolution, over rooms the grid does not reach.
// - Declared witnesses at the window's boundaries on BOTH side walls (a U has no handedness of its own; its
//   fridge stands on the wider side wall, B on a tie, so both walls are the fridge wall in turn) and in both
//   arms the rule can reach (a fridge at the free end, and a fridge after two bases), composed through
//   `generateKitchen`.
// - A spread of the rooms the rule changes, built the same way.
//
// **Odd leftovers are unreachable in a real room** (a side wall's free run ends on a whole even millimetre, as
// an L's does), so the window's 49, 199, 249 and 299 mm boundaries are pinned on hand-built plans in
// `fridge-end-leftover.test.ts` and here at the nearest reachable value (48, 198, 248, 298).
//
// **A fridge after three bases is never the outermost body**: its gap to the free end is at least 500 mm and
// takes pantries (N3r 4), so the rule has no room there.
import fc from "fast-check";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { uShellFloorRuns, type DesignRoom } from "../../src/index.js";
import { beforeC5 } from "../support/before-c5-fridge-end-leftover.js";
import {
  countTheRoom,
  emptyCensus,
  SWEEP_TIMEOUT_MS,
  type Census,
} from "../support/fridge-end-census.js";
import {
  composed,
  expectABuiltKitchenThatKeepsEveryRule,
  fridgeOf,
  labelOf,
  spanOf,
} from "../support/fridge-end-built-kitchen.js";
import {
  bodyInboardOfTheEndFridge,
  DOOR_CABINET,
  planAfterTheOwnersRule,
} from "../support/fridge-end-leftover.js";
import { planFor, uRoom } from "../support/u-plan-fixtures.js";
import { gateVerdictFor } from "../support/u-gate-verdict.js";
import { yieldToTheEventLoop } from "../support/yield-to-the-event-loop.js";

vi.mock(
  "../../src/generation/fridge-end-leftover.js",
  async (importOriginal) => {
    const { withTheFridgeEndLeafSwitchable } = await import(
      "../support/before-c5-fridge-end-leftover.js"
    );
    return withTheFridgeEndLeafSwitchable(await importOriginal());
  },
);

const GRID_STEP_MM = 100;
const WALL_A_RANGE_MM = { minMm: 2700, maxMm: 6000 };
const SIDE_WALL_RANGE_MM = { minMm: 1000, maxMm: 6000 };
// 2200 mm is the lowest ceiling the approved policy admits; a lower one refuses every room.
const CEILINGS_MM = [2600, 2200] as const;
const STRIDE_THROUGH_CHANGED_ROOMS = 150;
const PROPERTY_RUNS = 4000;
const PROPERTY_MIN_CHANGED_ROOMS = 20;
// The owner's window on the 100 mm grid reaches leftovers of 100 and 200 mm, and both walls take both. The total,
// 4 752 rooms, is C0's prediction, reproduced.
const PINNED_CHANGED_BY_WALL: Record<string, number> = { B: 2444, C: 2308 };
const PINNED_CHANGED_BY_LEFTOVER: Record<number, number> = {
  100: 2308,
  200: 2444,
};
const PINNED_CHANGED_BY_WALL_AND_LEFTOVER: Record<string, number> = {
  "B:100": 1188,
  "B:200": 1256,
  "C:100": 1120,
  "C:200": 1188,
};
const PINNED_BARE_WITH_NO_BODY_INBOARD = 1152;

async function censusAt(heightMm: number): Promise<Census> {
  const census = emptyCensus(STRIDE_THROUGH_CHANGED_ROOMS);
  for (
    let widthMm = WALL_A_RANGE_MM.minMm;
    widthMm <= WALL_A_RANGE_MM.maxMm;
    widthMm += GRID_STEP_MM
  ) {
    for (
      let depthMm = SIDE_WALL_RANGE_MM.minMm;
      depthMm <= SIDE_WALL_RANGE_MM.maxMm;
      depthMm += GRID_STEP_MM
    ) {
      for (
        let wallCMm = SIDE_WALL_RANGE_MM.minMm;
        wallCMm <= SIDE_WALL_RANGE_MM.maxMm;
        wallCMm += GRID_STEP_MM
      ) {
        census.swept += 1;
        countTheURoom(census, uRoom(widthMm, depthMm, wallCMm, heightMm));
      }
    }
    await yieldToTheEventLoop();
  }
  return census;
}

function countTheURoom(census: Census, room: DesignRoom): void {
  if (!gateVerdictFor(room).ok) return;
  const runs = uShellFloorRuns(room);
  const live = planFor(room, runs);
  if (!live.minimumMet) return;
  countTheRoom(census, {
    room,
    runs,
    live,
    before: beforeC5(() => planFor(room, runs)),
  });
}

describe("every planned U room on the approved 100 mm grid", () => {
  const censuses = new Map<number, Census>();

  beforeAll(async () => {
    for (const heightMm of CEILINGS_MM) {
      censuses.set(heightMm, await censusAt(heightMm));
    }
  }, SWEEP_TIMEOUT_MS);

  function census(heightMm: number): Census {
    const found = censuses.get(heightMm);
    if (!found) throw new Error(`no census at ${String(heightMm)} mm`);
    return found;
  }

  it.each(CEILINGS_MM)(
    "at %i mm, a room outside the rule is unchanged and a room inside it differs by the rule's own fields alone",
    (heightMm) => {
      expect(census(heightMm).planned).toBeGreaterThan(0);
      expect(census(heightMm).mismatches).toEqual([]);
    },
  );

  it("at 2600 mm, the rule changes the pinned number of rooms, by wall and by leftover", () => {
    const {
      swept,
      planned,
      changed,
      changedByLeftoverMm,
      changedByWallAndLeftoverMm,
    } = census(2600);

    expect({
      swept,
      planned,
      changed,
      changedByLeftoverMm,
      changedByWallAndLeftoverMm,
    }).toEqual({
      swept: 88_434,
      planned: 86_706,
      changed: PINNED_CHANGED_BY_WALL,
      changedByLeftoverMm: PINNED_CHANGED_BY_LEFTOVER,
      changedByWallAndLeftoverMm: PINNED_CHANGED_BY_WALL_AND_LEFTOVER,
    });
  });

  it.each(CEILINGS_MM)(
    "at %i mm, no plan carries two fridges, a cabinet over 800 or a fridge past its free run",
    (heightMm) => {
      expect(census(heightMm).planned).toBeGreaterThan(0);
      expect(census(heightMm).rulesBroken).toEqual([]);
    },
  );

  it("at 2600 mm, a fridge at the corner with no body inboard leaves its leftover bare", () => {
    expect(census(2600).leftBareWithNoBodyInboard).toBe(
      PINNED_BARE_WITH_NO_BODY_INBOARD,
    );
  });
});

describe("a U room at 1 mm resolution", () => {
  it("plans every room as the owner's rule says, and carries one fridge", () => {
    let planned = 0;
    let changed = 0;
    fc.assert(
      fc.property(
        fc.integer({ min: WALL_A_RANGE_MM.minMm, max: WALL_A_RANGE_MM.maxMm }),
        fc.integer({
          min: SIDE_WALL_RANGE_MM.minMm,
          max: SIDE_WALL_RANGE_MM.maxMm,
        }),
        fc.integer({
          min: SIDE_WALL_RANGE_MM.minMm,
          max: SIDE_WALL_RANGE_MM.maxMm,
        }),
        fc.constantFrom(2200, 2600, 3900),
        (widthMm, depthMm, wallCMm, heightMm) => {
          const room = uRoom(widthMm, depthMm, wallCMm, heightMm);
          if (!gateVerdictFor(room).ok) return;
          const runs = uShellFloorRuns(room);
          const live = planFor(room, runs);
          if (!live.minimumMet) return;
          planned += 1;

          const before = beforeC5(() => planFor(room, runs));
          const expected = planAfterTheOwnersRule(before, runs);

          expect(JSON.stringify(live), labelOf(room)).toBe(
            JSON.stringify(expected),
          );
          if (expected !== before) changed += 1;
          expect(
            live.bases.filter((base) => base.role === "fridge").length,
            labelOf(room),
          ).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );

    // The draw must reach the rule: most rooms compose, and a few hundred sit inside the window.
    expect(planned).toBeGreaterThan(PROPERTY_RUNS / 2);
    expect(changed).toBeGreaterThan(PROPERTY_MIN_CHANGED_ROOMS);
  });
});

/** A declared witness: a side wall's entered length, the leftover beyond its fridge before the rule, and what
 *  the rule builds. The room is A 4000 with the fridge wall the wider side wall by 100 mm. */
interface Witness {
  readonly arm: "free-end" | "after two bases";
  readonly entered: number;
  readonly leftoverMm: number;
  readonly cabinetMm: number;
  readonly bareMm: number;
}

const WITNESS_ROWS: readonly Witness[] = [
  w("free-end", 2348, 48, 600, 48),
  w("free-end", 2350, 50, 650, 0),
  w("free-end", 2400, 100, 700, 0),
  w("free-end", 2498, 198, 750, 48),
  w("free-end", 2500, 200, 800, 0),
  w("free-end", 2548, 248, 800, 48),
  w("free-end", 2598, 298, 800, 98),
  w("free-end", 2600, 300, 600, 300),
  w("after two bases", 3001, 100, 700, 0),
  w("after two bases", 3098, 198, 750, 48),
  w("after two bases", 3100, 200, 800, 0),
  w("after two bases", 3148, 248, 800, 48),
  w("after two bases", 3198, 298, 800, 98),
  w("after two bases", 3200, 300, 600, 300),
];

function w(
  arm: Witness["arm"],
  entered: number,
  leftoverMm: number,
  cabinetMm: number,
  bareMm: number,
): Witness {
  return { arm, entered, leftoverMm, cabinetMm, bareMm };
}

interface WitnessRoom extends Witness {
  readonly wall: "B" | "C";
  readonly room: DesignRoom;
}

/** Each row twice: wall B the fridge wall, and wall C. The other side wall is 100 mm shorter, so the fridge
 *  stays on the wider one (B on a tie, which no row uses). */
const WITNESSES: readonly WitnessRoom[] = WITNESS_ROWS.flatMap((row) => [
  {
    ...row,
    wall: "B" as const,
    room: uRoom(4000, row.entered, row.entered - 100),
  },
  {
    ...row,
    wall: "C" as const,
    room: uRoom(4000, row.entered - 100, row.entered),
  },
]);

describe("declared witnesses at the window's boundaries, on both side walls", () => {
  it.each(WITNESSES)(
    "plans $room.depthMm / $room.wallCMm with $leftoverMm mm beyond the fridge on wall $wall ($arm) as the owner's rule says",
    ({ room, wall, entered, leftoverMm, cabinetMm, bareMm }) => {
      const runs = uShellFloorRuns(room);
      const plan = planFor(room, runs);

      const cabinet = bodyInboardOfTheEndFridge(plan, wall);
      const fridge = plan.bases.find((base) => base.role === "fridge");
      // The side wall's free run stops 100 mm short of the wall (and on a whole even millimetre): the reserve is
      // never part of the leftover.
      expect(runs[wall].endMm).toBe(entered - 100 - (entered % 2));
      expect(fridge?.wall).toBe(wall);
      expect(cabinet?.buildId).toBe(DOOR_CABINET);
      expect(cabinet?.widthMm).toBe(cabinetMm);
      expect(plan.remainderMm[wall]).toBe(bareMm);
      expect(fridge?.endMm).toBe(entered - 100 - (entered % 2) - bareMm);
      expect(leftoverMm - (cabinetMm - 600)).toBe(bareMm);
    },
  );

  it("builds each widened cabinet with its upper, its top cabinet and the wall depth beside the fridge", () => {
    for (const { room, wall, cabinetMm } of WITNESSES) {
      if (cabinetMm === 600) continue;
      expectABuiltKitchenThatKeepsEveryRule({ room, wall }, composed(room));
    }
  });

  it("builds the fridge where the plan put it, at its own width", () => {
    const room = uRoom(4000, 2400, 2300);
    const plan = planFor(room, uShellFloorRuns(room));
    const fridge = fridgeOf(composed(room), "B");
    const planned = plan.bases.find((base) => base.role === "fridge");

    expect(spanOf(fridge)).toEqual([planned?.startMm, planned?.endMm]);
    expect(fridge.body.widthMm).toBe(700);
  });

  it(
    "builds a spread of the rooms the rule changes, at every leftover it can see, on both walls",
    async () => {
      const { changedRooms } = await censusAt(2600);

      const leftovers = new Set(
        changedRooms.map(
          ({ wall, leftoverMm }) => `${wall}${String(leftoverMm)}`,
        ),
      );
      expect(leftovers).toEqual(new Set(["B100", "B200", "C100", "C200"]));
      for (const changed of changedRooms) {
        expectABuiltKitchenThatKeepsEveryRule(changed, composed(changed.room));
        await yieldToTheEventLoop();
      }
    },
    SWEEP_TIMEOUT_MS,
  );
});
