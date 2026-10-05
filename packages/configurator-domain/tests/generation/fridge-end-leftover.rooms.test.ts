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
  deriveColumns,
  derivePlacementRecords,
  findOverflowingPlacementIds,
  generateKitchen,
  KITCHEN_L_DESIGN,
  linearShellFloorRuns,
  lShellFloorRuns,
  planKitchenComposition,
  validateDesignForCatalog,
  wallLengthMm,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type DesignWall,
  type GenerationRun,
  type KitchenCompositionPlan,
} from "../../src/index.js";
import { beforeC5 } from "../support/before-c5-fridge-end-leftover.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import { unrecordedFloorStripsMm } from "../support/floor-coverage.js";
import {
  absorbedByTheOwnersRuleMm,
  bodyInboardOfTheEndFridge,
  DOOR_CABINET,
  OWNERS_CABINET_CEILING_MM,
} from "../support/fridge-end-leftover.js";
import { CAPPED_SEAT_AT_600_MM } from "../support/span-overlap-fixtures.js";
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

const OCCURRED_AT = "2026-10-05T12:00:00.000Z";
const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const COLUMNS = declaredColumnSizes(CATALOG);
const CEILINGS_MM = [2200, 2600, 3900] as const;
const GRID_STEP_MM = 10;
const SWEEP_TIMEOUT_MS = 300_000;
const SIDE_WALL_RESERVE_MM = 100;
const ROOMS_KEPT_PER_LEFTOVER = 2;
const STRIDE_THROUGH_CHANGED_ROOMS = 300;
type TwoWallDispatch = Extract<DesignWall, "A" | "B">;

const WALLS: readonly TwoWallDispatch[] = ["A", "B"];

type Runs = Readonly<Record<TwoWallDispatch, GenerationRun>>;

function planOf(room: DesignRoom, runs: Runs): KitchenCompositionPlan {
  return planKitchenComposition({ room, runs, columns: COLUMNS });
}

/** The plan the owner's Q6 makes of a plan the planner made without it: the cabinet inboard of an end
 *  fridge takes the owner's share of the leftover and the fridge moves out by the same amount. Written from
 *  the owner's words and the run's own end, and never from the leaf under test. */
function planAfterTheOwnersRule(
  before: KitchenCompositionPlan,
  runs: Runs,
): KitchenCompositionPlan {
  for (const wall of WALLS) {
    const cabinet = bodyInboardOfTheEndFridge(before, wall);
    const fridge = before.bases.find(
      (base) => base.wall === wall && base.role === "fridge",
    );
    if (cabinet?.buildId !== DOOR_CABINET || fridge === undefined) continue;
    const takenMm = absorbedByTheOwnersRuleMm({
      leftoverMm: runs[wall].endMm - fridge.endMm,
      cabinetWidthMm: cabinet.widthMm,
    });
    if (takenMm === 0) continue;
    const bases = before.bases.map((base) => {
      if (base === cabinet) {
        return {
          ...base,
          widthMm: base.widthMm + takenMm,
          endMm: base.endMm + takenMm,
        };
      }
      return base === fridge
        ? {
            ...base,
            startMm: base.startMm + takenMm,
            endMm: base.endMm + takenMm,
          }
        : base;
    });
    return {
      ...before,
      bases,
      floorWidthsMm: {
        ...before.floorWidthsMm,
        [wall]: bases
          .filter((base) => base.wall === wall)
          .map((base) => base.widthMm),
      },
      remainderMm: {
        ...before.remainderMm,
        [wall]: before.remainderMm[wall] - takenMm,
      },
    };
  }
  return before;
}

interface CensusAt {
  swept: number;
  placed: number;
  /** Rooms the rule changed, by the wall the fridge ends. */
  changed: Record<TwoWallDispatch, number>;
  /** Rooms with 50-299 mm beyond an end fridge whose inboard body is not a door cabinet, by that body. */
  leftBareByInboardBody: Record<string, number>;
  mismatches: string[];
  rulesBroken: string[];
  /** Two rooms per (wall, leftover) the rule changed, and a stride through the rest, for the built design. */
  changedRooms: ChangedRoom[];
  keptPerLeftover: Map<string, number>;
}

interface ChangedRoom {
  readonly room: DesignRoom;
  readonly wall: TwoWallDispatch;
  readonly leftoverMm: number;
}

function emptyCensus(): CensusAt {
  return {
    swept: 0,
    placed: 0,
    changed: { A: 0, B: 0 },
    leftBareByInboardBody: {},
    mismatches: [],
    rulesBroken: [],
    changedRooms: [],
    keptPerLeftover: new Map(),
  };
}

async function censusAt(heightMm: number): Promise<CensusAt> {
  const census = emptyCensus();
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
      countTheRoom(census, { shape: "L", widthMm, depthMm, heightMm });
    }
    await yieldToTheEventLoop();
  }
  return census;
}

function countTheRoom(census: CensusAt, room: DesignRoom): void {
  const runs = lShellFloorRuns(room);
  const live = planOf(room, runs);
  if (!live.minimumMet) return;
  census.placed += 1;
  const where = `${String(room.widthMm)}x${String(room.depthMm)}x${String(room.heightMm)}`;
  // The leaf takes the first fridge as the only one (`fridge-end-leftover.ts`): one core role, on one wall.
  if (live.bases.filter((base) => base.role === "fridge").length > 1) {
    census.rulesBroken.push(`${where}: more than one fridge`);
  }
  const before = beforeC5(() => planOf(room, runs));
  const expected = planAfterTheOwnersRule(before, runs);

  if (JSON.stringify(live) !== JSON.stringify(expected)) {
    census.mismatches.push(where);
  }
  for (const wall of WALLS) {
    countTheWall(census, { room, runs, live, before, wall, where });
  }
}

interface WallInRoom {
  readonly room: DesignRoom;
  readonly runs: Runs;
  readonly live: KitchenCompositionPlan;
  readonly before: KitchenCompositionPlan;
  readonly wall: TwoWallDispatch;
  readonly where: string;
}

function countTheWall(census: CensusAt, at: WallInRoom): void {
  const { room, runs, live, before, wall, where } = at;
  const inboard = bodyInboardOfTheEndFridge(before, wall);
  const fridgeBefore = before.bases.find(
    (base) => base.wall === wall && base.role === "fridge",
  );
  if (inboard === undefined || fridgeBefore === undefined) return;
  const leftoverMm = runs[wall].endMm - fridgeBefore.endMm;
  const isInTheWindow = leftoverMm >= 50 && leftoverMm < 300;

  if (inboard.buildId !== DOOR_CABINET) {
    if (isInTheWindow) {
      census.leftBareByInboardBody[inboard.buildId] =
        (census.leftBareByInboardBody[inboard.buildId] ?? 0) + 1;
    }
    return;
  }
  const liveInboard = bodyInboardOfTheEndFridge(live, wall);
  const liveFridge = live.bases.find(
    (base) => base.wall === wall && base.role === "fridge",
  );
  if (liveInboard === undefined || liveFridge === undefined) {
    census.rulesBroken.push(`${where}: the end fridge or its cabinet is gone`);
    return;
  }
  if (liveInboard.widthMm > OWNERS_CABINET_CEILING_MM) {
    census.rulesBroken.push(`${where}: a cabinet over 800`);
  }
  if (liveFridge.endMm > runs[wall].endMm) {
    census.rulesBroken.push(`${where}: the fridge passes the free run`);
  }
  if (liveInboard.widthMm === inboard.widthMm) return;
  census.changed[wall] += 1;
  keepForTheBuiltDesign(census, { room, wall, leftoverMm });
}

function keepForTheBuiltDesign(census: CensusAt, changed: ChangedRoom): void {
  const key = `${changed.wall}:${String(changed.leftoverMm)}`;
  const heldMm = census.keptPerLeftover.get(key) ?? 0;
  const isTheStride =
    (census.changed.A + census.changed.B) % STRIDE_THROUGH_CHANGED_ROOMS === 0;
  if (heldMm >= ROOMS_KEPT_PER_LEFTOVER && !isTheStride) return;
  census.keptPerLeftover.set(key, heldMm + 1);
  census.changedRooms.push(changed);
}

describe("every planned L room on the approved 10 mm grid, at three ceilings", () => {
  const censuses = new Map<number, CensusAt>();

  beforeAll(async () => {
    for (const heightMm of CEILINGS_MM) {
      censuses.set(heightMm, await censusAt(heightMm));
    }
  }, SWEEP_TIMEOUT_MS);

  function census(heightMm: number): CensusAt {
    const found = censuses.get(heightMm);
    if (!found) throw new Error(`no census at ${String(heightMm)} mm`);
    return found;
  }

  it.each(CEILINGS_MM)(
    "at %i mm, a room outside the rule is byte-identical to the plan before C5, and a room inside it differs by the cabinet, the fridge, the remainder and the floor widths alone",
    (heightMm) => {
      expect(census(heightMm).mismatches).toEqual([]);
    },
  );

  it.each(CEILINGS_MM)(
    "at %i mm, the rule changes 44 766 of 245 211 planned rooms: 22 995 on wall A and 21 771 on wall B",
    (heightMm) => {
      const { swept, placed, changed } = census(heightMm);

      expect({ swept, placed, changed }).toEqual({
        swept: 256_011,
        placed: 245_211,
        changed: { A: 22_995, B: 21_771 },
      });
    },
  );

  it.each(CEILINGS_MM)(
    "at %i mm, no cabinet passes 800, no fridge passes its wall's free run and none goes missing",
    (heightMm) => {
      expect(census(heightMm).rulesBroken).toEqual([]);
    },
  );

  // The dishwasher is decided first (ADR 0110 M2): a cabinet it takes is a fixed-width body, and the
  // fridge beside it does not move. Fixed-width neighbours are counted so a rule that started
  // widening them (the dishwasher, the sink) would change a figure here as well as fail the oracle.
  it.each(CEILINGS_MM)(
    "at %i mm, the leftover stays bare beside an end fridge where the inboard body is the dishwasher or the sink: 16 300 and 1 625 rooms",
    (heightMm) => {
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

function labelOf(room: DesignRoom): string {
  return `${String(room.widthMm)}x${String(room.depthMm)}x${String(room.heightMm)}`;
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

function composed(room: DesignRoom): Design {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  if (!result.ok) throw new Error(`${labelOf(room)} did not compose`);
  return result.design;
}

function fridgeOf(design: Design, wall: TwoWallDispatch): DesignPlacement {
  const found = design.placements.find(
    (placement) =>
      placement.wall === wall && placement.body.buildId === "fridge-free",
  );
  if (!found) throw new Error(`no fridge on wall ${wall}`);
  return found;
}

function spanOf(placement: DesignPlacement): readonly [number, number] {
  const halfMm = placement.body.widthMm / 2;
  return [placement.alongMm - halfMm, placement.alongMm + halfMm];
}

function isInTheWallRow(placement: DesignPlacement): boolean {
  return placement.y0Mm >= 1500 && placement.body.buildId === "wall-cabinet";
}

/** What the built kitchen must be, wherever the rule changed it: criteria 2 and 3 read off the design. */
function expectABuiltKitchenThatKeepsEveryRule(
  changed: ChangedRoom,
  design: Design,
): void {
  const { room, wall } = changed;
  const where = `${labelOf(room)} wall ${wall}`;
  const onTheWall = design.placements.filter(
    (placement) => placement.wall === wall,
  );
  const fridge = fridgeOf(design, wall);
  const [fridgeStart, fridgeEnd] = spanOf(fridge);
  const cabinet = onTheWall.find(
    (placement) =>
      placement.y0Mm === 0 &&
      placement.body.buildId === DOOR_CABINET &&
      spanOf(placement)[1] === fridgeStart,
  );
  expect(
    cabinet,
    `${where}: a base cabinet stands flush to the fridge`,
  ).toBeDefined();
  if (!cabinet) return;
  const [cabinetStart, cabinetEnd] = spanOf(cabinet);

  // Criterion 3: the upper, and the top cabinet over it, have the base's own width and centre.
  const over = onTheWall.filter(
    (placement) =>
      isInTheWallRow(placement) && placement.alongMm === cabinet.alongMm,
  );
  expect(over.map((placement) => placement.y0Mm).sort(), where).toEqual(
    room.heightMm >= 2600 ? [1500, 2200] : [1500],
  );
  for (const upper of over) {
    expect(upper.body.widthMm, `${where} y0 ${String(upper.y0Mm)}`).toBe(
      cabinet.body.widthMm,
    );
  }

  // Criterion 2: a cabinet over 800; wall bodies deeper than the wall depth beside the moved fridge.
  expect(cabinet.body.widthMm, where).toBeLessThanOrEqual(
    OWNERS_CABINET_CEILING_MM,
  );
  for (const wallBody of onTheWall.filter(isInTheWallRow)) {
    const [start, end] = spanOf(wallBody);
    const standsBesideTheFridge = end === fridgeStart || start === fridgeEnd;
    if (standsBesideTheFridge) {
      expect(
        wallBody.body.seatDepthMm,
        `${where}: a wall cabinet beside the fridge takes the wall depth`,
      ).toBe(CAPPED_SEAT_AT_600_MM);
    }
  }
  expect(
    onTheWall.filter((placement) => spanOf(placement)[0] >= fridgeEnd),
    `${where}: nothing stands past the fridge`,
  ).toEqual([]);
  expect(cabinetEnd, where).toBe(fridgeStart);
  expect(cabinetStart, where).toBeLessThan(cabinetEnd);

  // Nothing overflows, nothing is invalid, and the floor holds no strip of its own.
  expect(findOverflowingPlacementIds(design), where).toEqual([]);
  expect(validateDesignForCatalog(design, CATALOG), where).toEqual([]);
  const columns = deriveColumns(
    derivePlacementRecords(design, CATALOG),
    design,
    design.room,
  );
  expect(unrecordedFloorStripsMm(columns, "A"), where).toEqual([]);
  expect(unrecordedFloorStripsMm(columns, "B"), where).toEqual([]);
}

describe("the kitchen built from a changed room", () => {
  it.each(WITNESSES.filter((witness) => witness.cabinetMm > 600))(
    "builds $room.widthMm x $room.depthMm's widened cabinet with its upper, its top cabinet and the wall depth beside the fridge",
    ({ room, wall, leftoverMm }) => {
      expectABuiltKitchenThatKeepsEveryRule(
        { room, wall, leftoverMm },
        composed(room),
      );
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
