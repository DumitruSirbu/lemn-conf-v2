// M7C wave C5 slice S1, criteria 1-5 over real rooms: the leftover beside a fixed-width end body (the fridge)
// goes to the door cabinet inboard of it, in the planner and in the kitchen it builds. The owner's Q6
// (2026-10-01): *"Absorb gaps under 300 mm"*.
//
// **Three instruments, each reading something the others do not.**
// - A differential over the whole approved L at 10 mm, three ceilings: every room's live plan is held to the
//   plan the planner made before C5 with the owner's rule applied to it by an oracle written here from the
//   owner's words (`support/fridge-end-leftover.ts`), so a room outside the rule is byte-identical and a room
//   inside it differs by exactly the cabinet, the fridge, the wall's remainder and its floor widths.
// - Declared witnesses at the boundaries of the window, on both walls, composed through `generateKitchen`
//   and read off the built design: the upper and the top cabinet over the widened base, the wall depth
//   beside the moved fridge (C7's invariant), no strip of unrecorded floor, no overflow.
// - A spread of the rooms the rule changes, at every leftover it can see, built the same way.
//
// **Odd leftovers are unreachable in a real room** (49, 199, 249 and 299 mm): a wall's free run ends on a whole
// even millimetre (ADR 0110 correction, 2026-09-13), so those boundaries are pinned in
// `fridge-end-leftover.test.ts` on hand-built plans and here at the nearest reachable value (48, 198, 248,
// 298), where the arithmetic is the same.
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  KITCHEN_L_DESIGN,
  linearShellFloorRuns,
  lShellFloorRuns,
  planKitchenComposition,
  wallLengthMm,
  type DesignRoom,
  type DesignWall,
  type GenerationRun,
  type KitchenCompositionPlan,
} from "../../src/index.js";
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
  absorbedByTheOwnersRuleMm,
  bodyInboardOfTheEndFridge,
  DOOR_CABINET,
} from "../support/fridge-end-leftover.js";
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

const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const COLUMNS = declaredColumnSizes(CATALOG);
const CEILINGS_MM = [2200, 2600, 3900] as const;
const GRID_STEP_MM = 10;
const SIDE_WALL_RESERVE_MM = 100;
type TwoWallDispatch = Extract<DesignWall, "A" | "B">;

type Runs = Readonly<Record<TwoWallDispatch, GenerationRun>>;

function planOf(room: DesignRoom, runs: Runs): KitchenCompositionPlan {
  return planKitchenComposition({ room, runs, columns: COLUMNS });
}

const STRIDE_THROUGH_CHANGED_ROOMS = 300;

async function censusAt(heightMm: number): Promise<Census> {
  const census = emptyCensus(STRIDE_THROUGH_CHANGED_ROOMS);
  const approved = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (!approved) throw new Error("the approved policy has no L");
  for (
    let widthMm = approved.wallA.minMm;
    widthMm <= approved.wallA.maxMm;
    widthMm += GRID_STEP_MM
  ) {
    for (
      let depthMm = approved.wallB.minMm;
      depthMm <= approved.wallB.maxMm;
      depthMm += GRID_STEP_MM
    ) {
      census.swept += 1;
      countTheLRoom(census, { shape: "L", widthMm, depthMm, heightMm });
    }
    await yieldToTheEventLoop();
  }
  return census;
}

function countTheLRoom(census: Census, room: DesignRoom): void {
  const runs = lShellFloorRuns(room);
  const live = planOf(room, runs);
  if (!live.minimumMet) return;
  countTheRoom(census, {
    room,
    runs,
    live,
    before: beforeC5(() => planOf(room, runs)),
  });
}

describe("every planned L room on the approved 10 mm grid, at three ceilings", () => {
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

  it.each(CEILINGS_MM)(
    "at %i mm, the rule changes the pinned number of rooms on each wall",
    (heightMm) => {
      const { swept, planned, changed } = census(heightMm);

      // C0's prediction, reproduced: 44 766 of 245 211 planned rooms.
      expect({ swept, planned, changed }).toEqual({
        swept: 256_011,
        planned: 245_211,
        changed: { A: 22_995, B: 21_771 },
      });
    },
  );

  it.each(CEILINGS_MM)(
    "at %i mm, no cabinet passes 800, no fridge passes its free run and none goes missing",
    (heightMm) => {
      expect(census(heightMm).planned).toBeGreaterThan(0);
      expect(census(heightMm).rulesBroken).toEqual([]);
    },
  );

  // The dishwasher is decided first (ADR 0110 M2): a cabinet it takes is a fixed-width body, and the
  // fridge beside it does not move. Fixed-width neighbours are counted so a rule that started
  // widening them (the dishwasher, the sink) would change a figure here as well as fail the oracle.
  it.each(CEILINGS_MM)(
    "at %i mm, the leftover stays bare beside an end fridge whose inboard body is fixed-width",
    (heightMm) => {
      expect(census(heightMm).planned).toBeGreaterThan(0);
      expect(census(heightMm).leftBareByInboardBody).toEqual({
        "base-dishwasher": 16_300,
        "base-sink": 1_625,
      });
    },
  );
});

/** A declared room: where the fridge ends a wall, by how much the free run runs past it before the rule,
 *  and what the rule builds. Figures measured on the built plan, then each checked against the owner's rule
 *  below rather than only recorded. */
interface Witness {
  readonly room: DesignRoom;
  readonly wall: TwoWallDispatch;
  readonly runEndMm: number;
  readonly leftoverMm: number;
  readonly cabinetMm: number;
  readonly bareMm: number;
}

function lRoom(widthMm: number, depthMm: number): DesignRoom {
  return { shape: "L", widthMm, depthMm, heightMm: 2600 };
}

/** Wall A is the narrower wall (so it carries the fridge) in the first column and wall B in the second. */
const WITNESSES: readonly Witness[] = [
  w(lRoom(2849, 2850), "A", 2848, 48, 600, 48),
  w(lRoom(2850, 2851), "A", 2850, 50, 650, 0),
  w(lRoom(2900, 2901), "A", 2900, 100, 700, 0),
  w(lRoom(2999, 3000), "A", 2998, 198, 750, 48),
  w(lRoom(3000, 3001), "A", 3000, 200, 800, 0),
  w(lRoom(3049, 3050), "A", 3048, 248, 800, 48),
  w(lRoom(3099, 3100), "A", 3098, 298, 800, 98),
  w(lRoom(3100, 3101), "A", 3100, 300, 600, 300),
  w(lRoom(3500, 2950), "B", 2850, 50, 650, 0),
  w(lRoom(3500, 3100), "B", 3000, 200, 800, 0),
  w(lRoom(3500, 3200), "B", 3100, 300, 600, 300),
];

function w(
  room: DesignRoom,
  wall: TwoWallDispatch,
  runEndMm: number,
  leftoverMm: number,
  cabinetMm: number,
  bareMm: number,
): Witness {
  return { room, wall, runEndMm, leftoverMm, cabinetMm, bareMm };
}

describe("declared witnesses at the window's boundaries", () => {
  it.each(WITNESSES)(
    "plans $room.widthMm x $room.depthMm with $leftoverMm mm beyond the fridge on wall $wall as the owner's rule says",
    ({ room, wall, runEndMm, leftoverMm, cabinetMm, bareMm }) => {
      const runs = lShellFloorRuns(room);
      const plan = planOf(room, runs);

      const cabinet = bodyInboardOfTheEndFridge(plan, wall);
      const fridge = plan.bases.find(
        (base) => base.wall === wall && base.role === "fridge",
      );
      expect(runs[wall].endMm).toBe(runEndMm);
      expect(cabinet?.buildId).toBe(DOOR_CABINET);
      expect(cabinet?.widthMm).toBe(cabinetMm);
      expect(plan.remainderMm[wall]).toBe(bareMm);
      expect(runEndMm - (fridge?.endMm ?? 0)).toBe(bareMm);
      expect(fridge?.endMm).toBe(runEndMm - bareMm);
      // The table is not its own authority: the cabinet is the owner's rule applied to the leftover.
      expect(
        cabinetMm -
          600 -
          absorbedByTheOwnersRuleMm({ leftoverMm, cabinetWidthMm: 600 }),
      ).toBe(0);
      expect(leftoverMm - (cabinetMm - 600)).toBe(bareMm);
    },
  );

  it("keeps the 100 mm side-wall reserve on wall B, whatever the fridge took", () => {
    for (const witness of WITNESSES.filter(({ wall }) => wall === "B")) {
      const { room } = witness;
      const design = composed(room);
      const fridge = fridgeOf(design, "B");

      expect(fridge.alongMm + fridge.body.widthMm / 2).toBeLessThanOrEqual(
        wallLengthMm("B", room) - SIDE_WALL_RESERVE_MM,
      );
    }
  });

  it("keeps wall A of an L to its free run, which has no reserve to keep or spend", () => {
    for (const witness of WITNESSES.filter(({ wall }) => wall === "A")) {
      const { room, runEndMm } = witness;
      const fridge = fridgeOf(composed(room), "A");

      expect(fridge.alongMm + fridge.body.widthMm / 2).toBeLessThanOrEqual(
        runEndMm,
      );
    }
  });
});

describe("the kitchen built from a changed room", () => {
  it.each(WITNESSES.filter((witness) => witness.cabinetMm > 600))(
    "builds $room.widthMm x $room.depthMm's widened cabinet with its upper, its top cabinet and the wall depth beside the fridge",
    ({ room, wall }) => {
      expectABuiltKitchenThatKeepsEveryRule({ room, wall }, composed(room));
    },
  );

  it("builds the fridge where the plan put it, at its own width", () => {
    const room = lRoom(2950, 3500);
    const plan = planOf(room, lShellFloorRuns(room));
    const fridge = fridgeOf(composed(room), "A");
    const planned = plan.bases.find((base) => base.role === "fridge");

    expect(planned).toBeDefined();
    expect(spanOf(fridge)).toEqual([planned?.startMm, planned?.endMm]);
    expect(fridge.body.widthMm).toBe(700);
  });

  it(
    "builds a spread of the rooms the rule changes, at every leftover it can see, on both walls",
    async () => {
      const census = await censusAt(2600);
      const kept = census.changedRooms;
      const leftovers = new Set(
        kept.map(({ wall, leftoverMm }) => `${wall}${String(leftoverMm)}`),
      );

      // 25 leftovers (50..290 mm at 10 mm) on each of two walls, all reached.
      expect(leftovers.size).toBe(50);
      for (const changed of kept) {
        expectABuiltKitchenThatKeepsEveryRule(changed, composed(changed.room));
        await yieldToTheEventLoop();
      }
    },
    SWEEP_TIMEOUT_MS,
  );
});

describe("a straight kitchen and a room outside the rule", () => {
  it("never widens a door cabinet in a straight kitchen: its fridge stands at the corner, with the run beyond it", () => {
    const policy = APPROVED_ROOM_POLICY.buildableShapes.linear;
    if (!policy) throw new Error("the approved policy has no straight kitchen");
    let planned = 0;
    for (
      let wallAMm = policy.wallA.minMm;
      wallAMm <= policy.wallA.maxMm;
      wallAMm += GRID_STEP_MM
    ) {
      const room: DesignRoom = {
        shape: "linear",
        widthMm: wallAMm,
        depthMm: policy.depthMm,
        heightMm: 2600,
      };
      const runs = {
        A: linearShellFloorRuns(room),
        B: { wall: "B" as const, startMm: 0, endMm: 0 },
      };
      const plan = planOf(room, runs);
      if (!plan.minimumMet) continue;
      planned += 1;

      expect(
        plan.bases.filter((base) => base.role === "fridge").length,
        labelOf(room),
      ).toBeLessThanOrEqual(1);
      expect(JSON.stringify(plan), labelOf(room)).toBe(
        JSON.stringify(beforeC5(() => planOf(room, runs))),
      );
    }

    expect(planned).toBe(481);
  });

  it("leaves the reference room, which holds no leftover beside its fridge, as it was", () => {
    const room = KITCHEN_L_DESIGN.room;
    const runs = lShellFloorRuns(room);

    expect(JSON.stringify(planOf(room, runs))).toBe(
      JSON.stringify(beforeC5(() => planOf(room, runs))),
    );
  });
});
