// Re-takes the milestone plan's figures (E1-E8) from the real planner over the approved L rectangle, on a 10 mm grid
// at 2200, 2600 and 3900 mm ceilings. Every HEAD figure is read off HEAD's plan reconstructed on S0b's plan
// (`planBeforeS0b`); that reconstruction is proved byte for byte only on the 496 rooms the pre-tower recording holds.
// The S0b and S1 models restate the plan's arithmetic over the real composer's context; they do not prove S0b or S1.
//
// Every body, id and width is a literal and a composed storage slot is reached through `isComposedStorageSlot`,
// never through its id (ADR 0121 decision 3(b)).
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  isComposedStorageSlot,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  type DesignRoom,
  type DesignWall,
  type GenerationRun,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
} from "../../src/index.js";
import { canonicalPlan } from "../support/composed-run-baseline.js";

// `DesignWall` includes "C"; this census reads `lShellFloorRuns`' two-wall composer only.
type TwoWallDispatch = Extract<DesignWall, "A" | "B">;
import {
  beforeS1,
  decidedBeforeTheThresholdDrawer,
  forgetTheLastComposition,
  lastComposition,
  planBeforeS0b,
  plansTheLeafRead,
  whatS1sBottleCost,
  withS1Alone,
  type BottleCost,
  type DecidedBeforeTheThresholdDrawer,
  type RecordedComposition,
} from "../support/composition-context-capture.js";
import {
  readPreTowerRunRecording,
  roomFromRecordedKey,
  towerOverBottleChangeBetween,
} from "../support/pre-tower-run-recording.js";
import { yieldToTheEventLoop } from "../support/yield-to-the-event-loop.js";
import { thePlannerBeforeC5 } from "../support/before-c5-fridge-end-leftover.js";

// Tests that compare with a recording of an earlier planner ask `thePlannerBeforeC5()`; the rest run the shipped
// planner.
vi.mock(
  "../../src/generation/fridge-end-leftover.js",
  async (importOriginal) => {
    const { withTheFridgeEndLeafSwitchable } = await import(
      "../support/before-c5-fridge-end-leftover.js"
    );
    return withTheFridgeEndLeafSwitchable(await importOriginal());
  },
);

vi.mock(
  "../../src/generation/optional-run-items.js",
  async (importOriginal) => {
    const { withTheCompositionRecorded } = await import(
      "../support/composition-context-capture.js"
    );
    return withTheCompositionRecorded(await importOriginal());
  },
);
vi.mock(
  "../../src/generation/dishwasher-beside-the-sink.js",
  async (importOriginal) => {
    const { withTheDishwasherLeafSwitchable } = await import(
      "../support/composition-context-capture.js"
    );
    return withTheDishwasherLeafSwitchable(await importOriginal());
  },
);

const DECLARED_COLUMNS = declaredColumnSizes(
  buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN)),
);
const CEILINGS_MM = [2200, 2600, 3900] as const;
const GRID_STEP_MM = 10;
const SWEEP_TIMEOUT_MS = 120_000;

const DOOR_BODY = "base-cabinet";
const THREE_DRAWER_BODY = "base-3drawer";
const PAN_DRAWER_BODY = "base-panbank";
const BOTTLE_BODY = "base-bottle-cargo";
const OVEN_TOWER_BODY = "tall-oven-tower";
const PANTRY_BODY = "tall-pantry";
const DISHWASHER_BODY = "base-dishwasher";
const HOB_WITH_OVEN_BODY = "base-hob-oven";
const DRAWER_CABINET_BODIES: ReadonlySet<string> = new Set([
  THREE_DRAWER_BODY,
  PAN_DRAWER_BODY,
]);
const TALL_BODIES: ReadonlySet<string> = new Set([
  OVEN_TOWER_BODY,
  PANTRY_BODY,
]);
const PAN_DRAWER_ID = "pan-drawer";
const THRESHOLD_DRAWER_ID = "threshold-drawer";
const PREPARATION_ROLE = "preparation";
/** E1 / Q-H5 as the owner stated it: *D* of six plain cabinets, two of them drawers. */
const OWNERS_PLAIN_CABINET_COUNT = 6;
const OWNERS_DRAWER_COUNT = 2;
/** E4: a free-end remainder the dishwasher's 600 mm opening may merge with. */
const MERGE_REMAINDER_MAX_MM = 200;
/** A4: no remainder of one module or more. */
const ONE_MODULE_MM = 600;

const APPROVED_L = (() => {
  const shape = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (!shape) throw new Error("the approved policy has no L");
  return shape;
})();

interface KitchenTotals {
  ovenTowerRooms: number;
  tallColumns: number;
  bottles: number;
  panDrawerBodies: number;
  thresholdDrawers: number;
}

interface Census {
  /** Read off S0b's plan: the planner with S1's leaf switched off. */
  afterS0b: KitchenTotals & { dishwashers: number };
  /** The pan-drawer/bottle decision restated through the context; must equal the finished plan wherever
   *  no threshold drawer was added — on S0b's plan and on S1's; and on the live plan wherever S2 traded
   *  nothing in, `liveTraded` counting the rooms where it did. */
  reconstructionMismatches: {
    afterS0b: string[];
    afterS1: string[];
    liveOutsideATrade: string[];
    liveTraded: number;
  };
  besideTheSink: {
    sameWall: number;
    acrossTheCorner: number;
    /** Live: rooms where a plan the S1 leaf was handed had a free door slot on both arms at once. */
    both: string[];
    /** Live, the guard's reach: rooms where a plan the leaf was handed had a free door slot on the
     *  sink's own wall, and across the corner. */
    leafReadASameWallSlot: number;
    leafReadAnAcrossTheCornerSlot: number;
    converted: number;
    onWallA: number;
    onWallB: number;
    offTheNarrowerWall: string[];
    doorCabinetElsewhere: number;
    notTheSameRoomsBeforeTheThresholdDrawer: string[];
    notTheSameRoomsOnTheCoreAlone: string[];
  };
  metreTable: Record<MetreBand, { converted: number; rooms: number }>;
  convertedAtTheFreeEnd: {
    mergeRemainder: number;
    noRemainder: number;
    widerRemainder: string[];
  };
  drawerSwap: {
    byDrawerCabinets: Record<number, number>;
    notThePreparationBesideTheSink: string[];
    noPanDrawerDirectlyBeyond: string[];
    withAThresholdDrawer: string[];
  };
  bottleCost: {
    anyColumn: number;
    anOuterColumnOnly: number;
    theOvenTower: number;
    theOvenTowerWithNoPanDrawer: number;
    theOvenTowerBesideAPanDrawer: number;
    theOvenTowerButTheHobIsNotOven: string[];
    /** The same rooms, live after S0b: `tower kept|tower gone, <hob body>, pan drawer|no pan drawer`. */
    afterS0b: Record<string, number>;
    /** The outer-column rooms, live after S0b, against the composer's plan of the core alone:
     *  `bottle stands|no bottle, <n> pantry lost, <n> oven tower lost`. */
    anOuterColumnAfterS0b: Record<string, number>;
  };
  towerOverBottle: {
    rooms: number;
    hobBodies: Record<string, number>;
    columnsRegained: Record<number, number>;
    anythingElseChanged: string[];
    headWouldHaveAddedAThresholdDrawer: string[];
    shortOfDrawersWithoutTheBottle: string[];
    remainderOfAModuleOrMore: string[];
    roomsWithoutAnOvenTower: string[];
  };
  dishwasherFirstModel: {
    converted: number;
    drawerSwap: number;
    thresholdDrawersLost: number;
    lostWithAColumnBackAndNoBottle: number;
    lostWithAColumnBackAndTheBottleKept: number;
    lostWithTheBottleBack: number;
    lostOtherwise: string[];
    thresholdDrawersGained: string[];
    totals: KitchenTotals & { dishwashers: number };
  };
}

type MetreBand =
  | "shorter >= 2.3 m, longer >= 2.8 m"
  | "shorter 2.2-2.3 m, longer >= 2.8 m"
  | "shorter >= 2.3 m, longer < 2.8 m"
  | "shorter < 2.2 m"
  | "shorter 2.2-2.3 m, longer < 2.8 m";

const CENSUS_BY_CEILING = new Map<number, Census>();

beforeAll(async () => {
  for (const ceilingMm of CEILINGS_MM) {
    CENSUS_BY_CEILING.set(ceilingMm, await censusAt(ceilingMm));
  }
}, SWEEP_TIMEOUT_MS);

function eachCeiling(): readonly (readonly [number, Census])[] {
  return CEILINGS_MM.map((ceilingMm) => {
    const census = CENSUS_BY_CEILING.get(ceilingMm);
    if (!census) throw new Error(`no census at ${String(ceilingMm)} mm`);
    return [ceilingMm, census] as const;
  });
}

describe("7D5b S0 — the pre-state, re-taken from the real planner at HEAD", () => {
  // Refused rooms are included: S0b must not move them, and the reconstruction reads them as the live planner's.
  it("reconstructs HEAD's plan exactly in every room and witness the pre-tower recording holds", () => {
    thePlannerBeforeC5();
    const recording = readPreTowerRunRecording();
    const recorded = [...recording.rooms, ...recording.witnesses];

    const differing = recorded
      .filter(
        ([key, plan]) =>
          canonicalPlan(headPlanFor(roomFromRecordedKey(key))) !== plan,
      )
      .map(([key]) => key);

    expect(recorded).toHaveLength(496);
    expect(differing).toEqual([]);
  });

  it("re-states the pan-drawer and bottle decision exactly, S0b's M11 included, on S0b's plan, on S1's, and live wherever S2 traded nothing in, so the models below ask the right run", () => {
    for (const [ceilingMm, census] of eachCeiling()) {
      expect(
        census.reconstructionMismatches,
        `${String(ceilingMm)} mm`,
      ).toEqual({
        afterS0b: [],
        afterS1: [],
        liveOutsideATrade: [],
        liveTraded: 31_200,
      });
    }
  });

  it("E1 — the post-S0b column, S1's leaf switched off: 5 260 oven-tower rooms and columns more, 5 260 bottles fewer, nothing else", () => {
    for (const [ceilingMm, census] of eachCeiling()) {
      expect(census.afterS0b, `${String(ceilingMm)} mm`).toEqual({
        dishwashers: 0,
        ovenTowerRooms: 167_286,
        tallColumns: 389_018,
        bottles: 173_231,
        panDrawerBodies: 92_446,
        thresholdDrawers: 15_795,
      });
    }
  });

  it("E2 — a door cabinet already beside the sink in 141 261 rooms: 1 055 on its wall, 140 206 across the corner", () => {
    for (const [ceilingMm, census] of eachCeiling()) {
      const { sameWall, acrossTheCorner, converted, doorCabinetElsewhere } =
        census.besideTheSink;

      expect(
        { sameWall, acrossTheCorner, converted, doorCabinetElsewhere },
        `${String(ceilingMm)} mm`,
      ).toEqual({
        sameWall: 1_055,
        acrossTheCorner: 140_206,
        converted: 141_261,
        doorCabinetElsewhere: 5_120,
      });
    }
  });

  // A free door cabinet on both sides of the sink would need a ranking the owner never gave; the leaf has none.
  // Read off every plan the leaf was handed: a finished plan has its door slot converted, so a tie would read as none.
  it("E2 — the tie population is empty, live: no plan the S1 leaf reads has a free door cabinet on both sides of the sink", () => {
    for (const [ceilingMm, census] of eachCeiling()) {
      const { both, leafReadASameWallSlot, leafReadAnAcrossTheCornerSlot } =
        census.besideTheSink;

      expect(
        { both, leafReadASameWallSlot, leafReadAnAcrossTheCornerSlot },
        `${String(ceilingMm)} mm`,
      ).toEqual({
        both: [],
        leafReadASameWallSlot: 1_055,
        leafReadAnAcrossTheCornerSlot: 140_206,
      });
    }
  });

  it("E2 — every such door cabinet stands on the narrower (prefix) wall: 71 920 on wall A, 69 341 on wall B", () => {
    for (const [ceilingMm, census] of eachCeiling()) {
      const { onWallA, onWallB, offTheNarrowerWall } = census.besideTheSink;

      expect(
        { onWallA, onWallB, offTheNarrowerWall },
        `${String(ceilingMm)} mm`,
      ).toEqual({ onWallA: 71_920, onWallB: 69_341, offTheNarrowerWall: [] });
    }
  });

  it("E2 — the same rooms are found before the threshold drawer and on the core alone", () => {
    for (const [ceilingMm, census] of eachCeiling()) {
      const {
        notTheSameRoomsBeforeTheThresholdDrawer,
        notTheSameRoomsOnTheCoreAlone,
      } = census.besideTheSink;

      expect(
        {
          notTheSameRoomsBeforeTheThresholdDrawer,
          notTheSameRoomsOnTheCoreAlone,
        },
        `${String(ceilingMm)} mm`,
      ).toEqual({
        notTheSameRoomsBeforeTheThresholdDrawer: [],
        notTheSameRoomsOnTheCoreAlone: [],
      });
    }
  });

  // The plan's four rows leave one band out (shorter wall 2.2-2.3 m, longer under 2.8 m); pinned so the
  // denominators cover every placed room.
  it("E2 — the rule of thumb in metres, with the band the plan's table omits", () => {
    for (const [ceilingMm, census] of eachCeiling()) {
      expect(census.metreTable, `${String(ceilingMm)} mm`).toEqual({
        "shorter >= 2.3 m, longer >= 2.8 m": {
          converted: 135_141,
          rooms: 135_141,
        },
        "shorter 2.2-2.3 m, longer >= 2.8 m": {
          converted: 3_210,
          rooms: 6_420,
        },
        "shorter >= 2.3 m, longer < 2.8 m": { converted: 455, rooms: 2_500 },
        "shorter < 2.2 m": { converted: 2_000, rooms: 100_050 },
        "shorter 2.2-2.3 m, longer < 2.8 m": { converted: 455, rooms: 1_100 },
      });
    }
  });

  it("E4 — the door cabinet beside the sink is last on its wall in 1 400 rooms: 1 260 with 1-200 mm bare, 140 with none", () => {
    for (const [ceilingMm, census] of eachCeiling()) {
      expect(census.convertedAtTheFreeEnd, `${String(ceilingMm)} mm`).toEqual({
        mergeRemainder: 1_260,
        noRemainder: 140,
        widerRemainder: [],
      });
    }
  });

  it("E6 — (e) is eligible in 24 160 rooms: 24 100 with two drawer cabinets, 60 with three, none with four", () => {
    for (const [ceilingMm, census] of eachCeiling()) {
      expect(
        census.drawerSwap.byDrawerCabinets,
        `${String(ceilingMm)} mm`,
      ).toEqual({ 2: 24_100, 3: 60 });
    }
  });

  it("E6 — in every (e) room the preparation cabinet is beside the sink, the pan drawer directly beyond it, and no threshold drawer", () => {
    for (const [ceilingMm, census] of eachCeiling()) {
      const {
        notThePreparationBesideTheSink,
        noPanDrawerDirectlyBeyond,
        withAThresholdDrawer,
      } = census.drawerSwap;

      expect(
        {
          notThePreparationBesideTheSink,
          noPanDrawerDirectlyBeyond,
          withAThresholdDrawer,
        },
        `${String(ceilingMm)} mm`,
      ).toEqual({
        notThePreparationBesideTheSink: [],
        noPanDrawerDirectlyBeyond: [],
        withAThresholdDrawer: [],
      });
    }
  });

  it("E7 — S1's bottle costs a column in 57 900 rooms: the oven tower in 16 500 (5 260 with no pan drawer, 11 240 beside one), an outer column only in 41 400; at HEAD the hob carried the oven in all 16 500", () => {
    for (const [ceilingMm, census] of eachCeiling()) {
      const {
        anyColumn,
        anOuterColumnOnly,
        theOvenTower,
        theOvenTowerWithNoPanDrawer,
        theOvenTowerBesideAPanDrawer,
        theOvenTowerButTheHobIsNotOven,
      } = census.bottleCost;

      expect(
        {
          anyColumn,
          anOuterColumnOnly,
          theOvenTower,
          theOvenTowerWithNoPanDrawer,
          theOvenTowerBesideAPanDrawer,
          theOvenTowerButTheHobIsNotOven,
        },
        `${String(ceilingMm)} mm`,
      ).toEqual({
        anyColumn: 57_900,
        anOuterColumnOnly: 41_400,
        theOvenTower: 16_500,
        theOvenTowerWithNoPanDrawer: 5_260,
        theOvenTowerBesideAPanDrawer: 11_240,
        theOvenTowerButTheHobIsNotOven: [],
      });
    }
  });

  it("E7 after S0b, live — of the 16 500, the 5 260 without a pan drawer keep the tower with hob-2drawer; the 11 240 beside one still lose it, the hob carrying the oven", () => {
    for (const [ceilingMm, census] of eachCeiling()) {
      expect(census.bottleCost.afterS0b, `${String(ceilingMm)} mm`).toEqual({
        "tower kept, base-hob-2drawer, no pan drawer": 5_260,
        "tower gone, base-hob-oven, pan drawer": 11_240,
      });
    }
  });

  it("E7 after S0b, live — T3: the 41 400 rooms where S1's bottle costs an outer column still stand the bottle, one pantry short of the core alone, the oven tower kept", () => {
    for (const [ceilingMm, census] of eachCeiling()) {
      expect(
        census.bottleCost.anOuterColumnAfterS0b,
        `${String(ceilingMm)} mm`,
      ).toEqual({
        "bottle stands, 1 pantry lost, 0 oven tower lost": 41_400,
      });
    }
  });

  it("E7 / S0b T1 and T4, live — 5 260 rooms change against HEAD: the bottle goes, one column (the tower) returns, the hob loses its oven, nothing else moves", () => {
    for (const [ceilingMm, census] of eachCeiling()) {
      expect(census.towerOverBottle, `${String(ceilingMm)} mm`).toEqual({
        rooms: 5_260,
        hobBodies: { "base-hob-2drawer": 5_260 },
        columnsRegained: { 1: 5_260 },
        anythingElseChanged: [],
        headWouldHaveAddedAThresholdDrawer: [],
        shortOfDrawersWithoutTheBottle: [],
        remainderOfAModuleOrMore: [],
        roomsWithoutAnOvenTower: [],
      });
    }
  });

  it("E3 / S1, modelled on S0b's plan (the leaf switched off) — dishwasher first costs 10 070 threshold drawers and gains none", () => {
    for (const [ceilingMm, census] of eachCeiling()) {
      expect(census.dishwasherFirstModel, `${String(ceilingMm)} mm`).toEqual({
        converted: 141_261,
        drawerSwap: 24_160,
        thresholdDrawersLost: 10_070,
        lostWithAColumnBackAndNoBottle: 3_410,
        lostWithAColumnBackAndTheBottleKept: 3_600,
        lostWithTheBottleBack: 3_060,
        lostOtherwise: [],
        thresholdDrawersGained: [],
        totals: {
          dishwashers: 165_421,
          ovenTowerRooms: 167_286,
          tallColumns: 396_028,
          bottles: 176_291,
          panDrawerBodies: 92_446,
          thresholdDrawers: 5_725,
        },
      });
    }
  });
});

async function censusAt(ceilingMm: number): Promise<Census> {
  const census = emptyCensus();
  for (
    let widthMm = APPROVED_L.wallA.minMm;
    widthMm <= APPROVED_L.wallA.maxMm;
    widthMm += GRID_STEP_MM
  ) {
    for (
      let depthMm = APPROVED_L.wallB.minMm;
      depthMm <= APPROVED_L.wallB.maxMm;
      depthMm += GRID_STEP_MM
    ) {
      countRoom(census, { shape: "L", widthMm, depthMm, heightMm: ceilingMm });
    }
    await yieldToTheEventLoop();
  }
  return census;
}

/** Everything one room contributes: HEAD's plan, S0b's plan, the live plan, and its composer's context. */
interface RoomReading {
  readonly where: string;
  readonly room: DesignRoom;
  readonly runs: Readonly<Record<TwoWallDispatch, GenerationRun>>;
  /** HEAD `acb7b6f`'s plan, reconstructed (`planBeforeS0b`) and proved against the pre-tower recording;
   *  exact because `countTowerOverBottle` shows HEAD's threshold rule added nothing where it differs. */
  readonly plan: KitchenCompositionPlan;
  /** S0b's plan: the planner with S1's leaf switched off, proved against the post-tower recording. */
  readonly planAfterS0b: KitchenCompositionPlan;
  /** S1's plan: the leaf on, S2's trades off. */
  readonly planAfterS1: KitchenCompositionPlan;
  /** The live planner's plan, with S1 and S2. */
  readonly livePlan: KitchenCompositionPlan;
  /** Every plan the live S1 leaf was handed while composing `livePlan`. */
  readonly leafRead: readonly KitchenCompositionPlan[];
  readonly composition: RecordedComposition;
  readonly decided: DecidedBeforeTheThresholdDrawer;
}

function countRoom(census: Census, room: DesignRoom): void {
  const reading = readingOf(room);
  if (!reading) return;
  const { composition, decided, planAfterS0b } = reading;
  addKitchenTotals(census.afterS0b, planAfterS0b);
  census.afterS0b.dishwashers += countOf(
    planAfterS0b,
    (base) => base.buildId === DISHWASHER_BODY,
  );
  const beforeTheThresholdDrawer = beforeS1(() =>
    composition.context.planOf(decided.run),
  );
  recordTheReconstructionFaults(census, reading, beforeTheThresholdDrawer);
  countBesideTheSink(
    census,
    reading,
    beforeS1(() => composition.context.planOf(decided.runBeforeS0b)),
  );
  countTheTie(census, reading);
  countDrawerSwapEligibility(census, reading);
  countBottleCost(census, reading, whatS1sBottleCost(composition));
  countTowerOverBottle(census, reading);
  countDishwasherFirstModel(census, reading, {
    beforeTheThresholdDrawer,
    finished: planAfterS0b,
  });
}

/** The room's reading, or `undefined` where the planner refuses it. The live plan is composed last, so
 *  the recorded composition and the leaf's inputs are the live planner's. */
function readingOf(room: DesignRoom): RoomReading | undefined {
  const runs = lShellFloorRuns(room);
  const compose = () =>
    planKitchenComposition({ room, runs, columns: DECLARED_COLUMNS });
  const planAfterS0b = beforeS1(compose);
  const planAfterS1 = withS1Alone(compose);
  forgetTheLastComposition();
  const livePlan = compose();
  if (!livePlan.minimumMet) return undefined;
  const composition = lastComposition();
  const decided = decidedBeforeTheThresholdDrawer(composition);
  return {
    where: `${String(room.widthMm)}x${String(room.depthMm)}`,
    room,
    runs,
    plan: planBeforeS0b(composition, planAfterS0b),
    planAfterS0b,
    planAfterS1,
    livePlan,
    leafRead: plansTheLeafRead(),
    composition,
    decided,
  };
}

/** HEAD's plan for any room, refused ones included — what the recording is compared against. */
function headPlanFor(room: DesignRoom): KitchenCompositionPlan {
  const reading = readingOf(room);
  if (reading) return reading.plan;
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

function addKitchenTotals(
  totals: KitchenTotals,
  plan: KitchenCompositionPlan,
): void {
  totals.ovenTowerRooms += hasBody(plan, OVEN_TOWER_BODY) ? 1 : 0;
  totals.tallColumns += countOf(plan, (base) => TALL_BODIES.has(base.buildId));
  totals.bottles += hasBody(plan, BOTTLE_BODY) ? 1 : 0;
  totals.panDrawerBodies += countOf(
    plan,
    (base) => base.buildId === PAN_DRAWER_BODY,
  );
  totals.thresholdDrawers += countOf(
    plan,
    (base) => base.id === THRESHOLD_DRAWER_ID,
  );
}

/** The plan before Q-H5 decided the threshold drawer, asked of the composer — before S1 and live.
 *  Where the planner added no threshold drawer it **is** the finished plan, and any difference is
 *  recorded as a reconstruction fault. */
function recordTheReconstructionFaults(
  census: Census,
  reading: RoomReading,
  beforeTheThresholdDrawerAfterS0b: KitchenCompositionPlan,
): void {
  const { composition, decided, livePlan, planAfterS0b, planAfterS1, where } =
    reading;
  const faults = census.reconstructionMismatches;
  if (isAReconstructionFault(beforeTheThresholdDrawerAfterS0b, planAfterS0b)) {
    faults.afterS0b.push(where);
  }
  const planOfTheDecidedRun = () => composition.context.planOf(decided.run);
  if (isAReconstructionFault(withS1Alone(planOfTheDecidedRun), planAfterS1)) {
    faults.afterS1.push(where);
  }
  const isTraded = JSON.stringify(livePlan) !== JSON.stringify(planAfterS1);
  if (isTraded) faults.liveTraded += 1;
  if (isAReconstructionFault(planOfTheDecidedRun(), livePlan) && !isTraded) {
    faults.liveOutsideATrade.push(where);
  }
}

function isAReconstructionFault(
  beforeTheThresholdDrawer: KitchenCompositionPlan,
  finished: KitchenCompositionPlan,
): boolean {
  const hasThresholdDrawer = finished.bases.some(
    (base) => base.id === THRESHOLD_DRAWER_ID,
  );
  return (
    !hasThresholdDrawer &&
    JSON.stringify(beforeTheThresholdDrawer) !== JSON.stringify(finished)
  );
}

function countBesideTheSink(
  census: Census,
  reading: RoomReading,
  beforeTheThresholdDrawer: KitchenCompositionPlan,
): void {
  const { plan, runs, room, where, composition } = reading;
  const sameWall = doorCabinetBesideTheSinkOnItsWall(plan);
  const acrossTheCorner = doorCabinetAcrossTheCornerFromTheSink(plan, runs);
  const converted = sameWall ?? acrossTheCorner;
  const beside = census.besideTheSink;
  if (sameWall) beside.sameWall += 1;
  if (acrossTheCorner) beside.acrossTheCorner += 1;
  countMetreBand(census, room, converted !== undefined);
  compareTheConvertedRoom(census, reading, {
    beforeTheThresholdDrawer,
    onTheCoreAlone: beforeS1(() =>
      composition.context.planOf(composition.core),
    ),
  });
  if (converted === undefined) {
    if (plan.bases.some(isDoorCabinet)) beside.doorCabinetElsewhere += 1;
    return;
  }
  beside.converted += 1;
  if (converted.wall === "A") beside.onWallA += 1;
  else beside.onWallB += 1;
  if (converted.wall !== narrowerWallOf(room))
    beside.offTheNarrowerWall.push(where);
  countConvertedAtTheFreeEnd(census, plan, converted, where);
}

function countTheTie(census: Census, reading: RoomReading): void {
  const { leafRead, runs, where } = reading;
  const beside = census.besideTheSink;
  const sameWall = leafRead.some(
    (plan) => doorCabinetBesideTheSinkOnItsWall(plan) !== undefined,
  );
  const acrossTheCorner = leafRead.some(
    (plan) => doorCabinetAcrossTheCornerFromTheSink(plan, runs) !== undefined,
  );
  if (sameWall) beside.leafReadASameWallSlot += 1;
  if (acrossTheCorner) beside.leafReadAnAcrossTheCornerSlot += 1;
  const isATie = leafRead.some(
    (plan) =>
      doorCabinetBesideTheSinkOnItsWall(plan) !== undefined &&
      doorCabinetAcrossTheCornerFromTheSink(plan, runs) !== undefined,
  );
  if (isATie) beside.both.push(where);
}

function compareTheConvertedRoom(
  census: Census,
  reading: RoomReading,
  others: {
    readonly beforeTheThresholdDrawer: KitchenCompositionPlan;
    readonly onTheCoreAlone: KitchenCompositionPlan;
  },
): void {
  const isConvertedAtHead = hasDoorCabinetBesideTheSink(
    reading.plan,
    reading.runs,
  );
  if (
    isConvertedAtHead !==
    hasDoorCabinetBesideTheSink(others.beforeTheThresholdDrawer, reading.runs)
  ) {
    census.besideTheSink.notTheSameRoomsBeforeTheThresholdDrawer.push(
      reading.where,
    );
  }
  if (
    isConvertedAtHead !==
    hasDoorCabinetBesideTheSink(others.onTheCoreAlone, reading.runs)
  ) {
    census.besideTheSink.notTheSameRoomsOnTheCoreAlone.push(reading.where);
  }
}

function hasDoorCabinetBesideTheSink(
  plan: KitchenCompositionPlan,
  runs: Readonly<Record<TwoWallDispatch, GenerationRun>>,
): boolean {
  return (
    doorCabinetBesideTheSinkOnItsWall(plan) !== undefined ||
    doorCabinetAcrossTheCornerFromTheSink(plan, runs) !== undefined
  );
}

/** A composed door slot touching the sink on the sink's own wall, on either side. */
function doorCabinetBesideTheSinkOnItsWall(
  plan: KitchenCompositionPlan,
): PlannedGenerationBase | undefined {
  const sink = sinkOf(plan);
  return plan.bases.find(
    (base) =>
      isDoorCabinet(base) &&
      base.wall === sink.wall &&
      (base.endMm === sink.startMm || base.startMm === sink.endMm),
  );
}

/** Where the sink is the first module at its wall's corner end, the composed door slot that is the
 *  first module at the other wall's corner end. Both runs start at the corner (`lShellFloorRuns`). */
function doorCabinetAcrossTheCornerFromTheSink(
  plan: KitchenCompositionPlan,
  runs: Readonly<Record<TwoWallDispatch, GenerationRun>>,
): PlannedGenerationBase | undefined {
  const sink = sinkOf(plan);
  if (sink.startMm !== runs[sink.wall].startMm) return undefined;
  const otherWall = sink.wall === "A" ? "B" : "A";
  return plan.bases.find(
    (base) =>
      isDoorCabinet(base) &&
      base.wall === otherWall &&
      base.startMm === runs[otherWall].startMm,
  );
}

function countConvertedAtTheFreeEnd(
  census: Census,
  plan: KitchenCompositionPlan,
  converted: PlannedGenerationBase,
  where: string,
): void {
  const isLastOnItsWall = !plan.bases.some(
    (base) => base.wall === converted.wall && base.startMm >= converted.endMm,
  );
  if (!isLastOnItsWall) return;
  const remainderMm = plan.remainderMm[converted.wall];
  const atTheEnd = census.convertedAtTheFreeEnd;
  if (remainderMm === 0) atTheEnd.noRemainder += 1;
  else if (remainderMm <= MERGE_REMAINDER_MAX_MM) atTheEnd.mergeRemainder += 1;
  else atTheEnd.widerRemainder.push(`${where}: ${String(remainderMm)} mm`);
}

function countMetreBand(
  census: Census,
  room: DesignRoom,
  isConverted: boolean,
): void {
  const band = census.metreTable[metreBandOf(room)];
  band.rooms += 1;
  if (isConverted) band.converted += 1;
}

function metreBandOf(room: DesignRoom): MetreBand {
  const shorterMm = Math.min(room.widthMm, room.depthMm);
  const longerMm = Math.max(room.widthMm, room.depthMm);
  if (shorterMm < 2200) return "shorter < 2.2 m";
  const isShorterBelow23 = shorterMm < 2300;
  if (longerMm >= 2800) {
    return isShorterBelow23
      ? "shorter 2.2-2.3 m, longer >= 2.8 m"
      : "shorter >= 2.3 m, longer >= 2.8 m";
  }
  return isShorterBelow23
    ? "shorter 2.2-2.3 m, longer < 2.8 m"
    : "shorter >= 2.3 m, longer < 2.8 m";
}

/** ADR 0120 E: the narrower entered wall carries the reading order's prefix; equal walls keep B. */
function narrowerWallOf(room: DesignRoom): DesignWall {
  return room.depthMm > room.widthMm ? "A" : "B";
}

function countDrawerSwapEligibility(
  census: Census,
  reading: RoomReading,
): void {
  const { plan, runs, where } = reading;
  const drawerCabinets = plan.bases.filter((base) =>
    DRAWER_CABINET_BODIES.has(base.buildId),
  );
  if (hasDoorCabinetBesideTheSink(plan, runs) || drawerCabinets.length < 2)
    return;
  const swap = census.drawerSwap;
  swap.byDrawerCabinets[drawerCabinets.length] =
    (swap.byDrawerCabinets[drawerCabinets.length] ?? 0) + 1;
  const besideTheSink = drawerCabinets.find((base) =>
    isBesideTheSink(plan, runs, base),
  );
  if (besideTheSink?.role !== PREPARATION_ROLE) {
    swap.notThePreparationBesideTheSink.push(where);
  } else if (!hasPanDrawerDirectlyBeyond(plan, besideTheSink)) {
    swap.noPanDrawerDirectlyBeyond.push(where);
  }
  if (plan.bases.some((base) => base.id === THRESHOLD_DRAWER_ID)) {
    swap.withAThresholdDrawer.push(where);
  }
}

function isBesideTheSink(
  plan: KitchenCompositionPlan,
  runs: Readonly<Record<TwoWallDispatch, GenerationRun>>,
  base: PlannedGenerationBase,
): boolean {
  const sink = sinkOf(plan);
  if (base.wall === sink.wall) {
    return base.endMm === sink.startMm || base.startMm === sink.endMm;
  }
  return (
    sink.startMm === runs[sink.wall].startMm &&
    base.startMm === runs[base.wall].startMm
  );
}

/** The pan drawer touches the preparation cabinet on its wall, on the side away from the sink. */
function hasPanDrawerDirectlyBeyond(
  plan: KitchenCompositionPlan,
  preparation: PlannedGenerationBase,
): boolean {
  const sink = sinkOf(plan);
  const isSinkBelow =
    sink.wall === preparation.wall && sink.endMm === preparation.startMm;
  const beyondMm = isSinkBelow ? preparation.endMm : preparation.startMm;
  return plan.bases.some(
    (base) =>
      base.id === PAN_DRAWER_ID &&
      base.buildId === PAN_DRAWER_BODY &&
      base.wall === preparation.wall &&
      (isSinkBelow ? base.startMm === beyondMm : base.endMm === beyondMm),
  );
}

function countBottleCost(
  census: Census,
  reading: RoomReading,
  cost: BottleCost,
): void {
  const { plan, where } = reading;
  if (cost === "nothing") return;
  const bottleCost = census.bottleCost;
  bottleCost.anyColumn += 1;
  if (cost === "an outer column") {
    bottleCost.anOuterColumnOnly += 1;
    const outcome = outerColumnOutcomeAfterS0b(reading);
    bottleCost.anOuterColumnAfterS0b[outcome] =
      (bottleCost.anOuterColumnAfterS0b[outcome] ?? 0) + 1;
    return;
  }
  bottleCost.theOvenTower += 1;
  if (hasBody(plan, PAN_DRAWER_BODY))
    bottleCost.theOvenTowerBesideAPanDrawer += 1;
  else bottleCost.theOvenTowerWithNoPanDrawer += 1;
  if (hobOf(plan).buildId !== HOB_WITH_OVEN_BODY) {
    bottleCost.theOvenTowerButTheHobIsNotOven.push(where);
  }
  const outcome = outcomeAfterS0b(reading.planAfterS0b);
  bottleCost.afterS0b[outcome] = (bottleCost.afterS0b[outcome] ?? 0) + 1;
}

/** M11 must leave the outer-column arm alone: the bottle still stands, and against the composer's plan of
 *  the core alone the block has lost one pantry and no oven tower. */
function outerColumnOutcomeAfterS0b(reading: RoomReading): string {
  const { planAfterS0b, composition } = reading;
  const onTheCoreAlone = beforeS1(() =>
    composition.context.planOf(composition.core),
  );
  const bottle = hasBody(planAfterS0b, BOTTLE_BODY)
    ? "bottle stands"
    : "no bottle";
  const lostOf = (buildId: string) =>
    countOf(onTheCoreAlone, (base) => base.buildId === buildId) -
    countOf(planAfterS0b, (base) => base.buildId === buildId);
  return `${bottle}, ${String(lostOf(PANTRY_BODY))} pantry lost, ${String(lostOf(OVEN_TOWER_BODY))} oven tower lost`;
}

function outcomeAfterS0b(planAfterS0b: KitchenCompositionPlan): string {
  const tower = hasBody(planAfterS0b, OVEN_TOWER_BODY)
    ? "tower kept"
    : "tower gone";
  const panDrawer = hasBody(planAfterS0b, PAN_DRAWER_BODY)
    ? "pan drawer"
    : "no pan drawer";
  return `${tower}, ${hobOf(planAfterS0b).buildId}, ${panDrawer}`;
}

// Where the bottle took the oven tower and no pan drawer stands beside it, S0b's plan is the composer's plan of
// the core alone, and it differs from HEAD's by M11's change only.

function countTowerOverBottle(census: Census, reading: RoomReading): void {
  const { plan, planAfterS0b, where } = reading;
  const before = canonicalPlan(plan);
  const after = canonicalPlan(planAfterS0b);
  if (before === after) return;
  const towerCensus = census.towerOverBottle;
  towerCensus.rooms += 1;
  const hobBody = hobOf(planAfterS0b).buildId;
  towerCensus.hobBodies[hobBody] = (towerCensus.hobBodies[hobBody] ?? 0) + 1;
  const regained = countOf(planAfterS0b, isTall) - countOf(plan, isTall);
  towerCensus.columnsRegained[regained] =
    (towerCensus.columnsRegained[regained] ?? 0) + 1;
  const change = towerOverBottleChangeBetween({ before, after });
  if (
    change !== "the oven tower kept over the bottle" ||
    bodiesBesidesBottleTowerAndHob(planAfterS0b) !==
      bodiesBesidesBottleTowerAndHob(plan)
  ) {
    towerCensus.anythingElseChanged.push(where);
  }
  if (isShortOfTheOwnersDrawers(plan))
    towerCensus.headWouldHaveAddedAThresholdDrawer.push(where);
  if (isShortOfTheOwnersDrawers(planAfterS0b))
    towerCensus.shortOfDrawersWithoutTheBottle.push(where);
  if (
    planAfterS0b.remainderMm.A >= ONE_MODULE_MM ||
    planAfterS0b.remainderMm.B >= ONE_MODULE_MM
  ) {
    towerCensus.remainderOfAModuleOrMore.push(where);
  }
  if (!hasBody(planAfterS0b, OVEN_TOWER_BODY))
    towerCensus.roomsWithoutAnOvenTower.push(where);
}

/** Every module but the bottle, the columns and the hob, with its position: what S0b may not move. */
function bodiesBesidesBottleTowerAndHob(plan: KitchenCompositionPlan): string {
  return plan.bases
    .filter(
      (base) =>
        base.buildId !== BOTTLE_BODY && !isTall(base) && base.role !== "hob",
    )
    .map(
      (base) =>
        `${base.id}~${base.buildId}~${base.wall}~${String(base.startMm)}~${String(base.endMm)}`,
    )
    .join("|");
}

// The S1 model (dishwasher first): the leaf re-identifies one module on the plan the threshold rule reads, taking it
// out of D. The threshold drawer then stands only where that plan is still short of drawers.

function countDishwasherFirstModel(
  census: Census,
  reading: RoomReading,
  plans: {
    readonly beforeTheThresholdDrawer: KitchenCompositionPlan;
    readonly finished: KitchenCompositionPlan;
  },
): void {
  const model = census.dishwasherFirstModel;
  const { beforeTheThresholdDrawer, finished } = plans;
  const isConverted = hasDoorCabinetBesideTheSink(
    beforeTheThresholdDrawer,
    reading.runs,
  );
  const isSwapped =
    !isConverted &&
    countOf(beforeTheThresholdDrawer, (base) =>
      DRAWER_CABINET_BODIES.has(base.buildId),
    ) >= 2;
  if (isConverted) model.converted += 1;
  if (isSwapped) model.drawerSwap += 1;
  if (isConverted || isSwapped) model.totals.dishwashers += 1;

  const isShortAfterTheLeaf = isShortOfTheOwnersDrawersAfterTheLeaf(
    beforeTheThresholdDrawer,
    {
      isConverted,
      isSwapped,
    },
  );
  const hadThresholdDrawer = finished.bases.some(
    (base) => base.id === THRESHOLD_DRAWER_ID,
  );
  if (!hadThresholdDrawer && isShortAfterTheLeaf) {
    model.thresholdDrawersGained.push(reading.where);
  }
  const isLost = hadThresholdDrawer && !isShortAfterTheLeaf;
  addKitchenTotals(model.totals, isLost ? beforeTheThresholdDrawer : finished);
  if (isLost)
    countWhatALostThresholdDrawerGaveBack(model, reading.where, plans);
}

function countWhatALostThresholdDrawerGaveBack(
  model: Census["dishwasherFirstModel"],
  where: string,
  plans: {
    readonly beforeTheThresholdDrawer: KitchenCompositionPlan;
    readonly finished: KitchenCompositionPlan;
  },
): void {
  const { beforeTheThresholdDrawer, finished } = plans;
  model.thresholdDrawersLost += 1;
  const columnsBack =
    countOf(beforeTheThresholdDrawer, isTall) - countOf(finished, isTall);
  const hadBottle = hasBody(finished, BOTTLE_BODY);
  const hasBottleBack = hasBody(beforeTheThresholdDrawer, BOTTLE_BODY);
  if (columnsBack === 1 && !hadBottle && !hasBottleBack)
    model.lostWithAColumnBackAndNoBottle += 1;
  else if (columnsBack === 1 && hadBottle && hasBottleBack)
    model.lostWithAColumnBackAndTheBottleKept += 1;
  else if (columnsBack === 0 && !hadBottle && hasBottleBack)
    model.lostWithTheBottleBack += 1;
  else model.lostOtherwise.push(where);
}

function isShortOfTheOwnersDrawersAfterTheLeaf(
  plan: KitchenCompositionPlan,
  leaf: { readonly isConverted: boolean; readonly isSwapped: boolean },
): boolean {
  const plainCabinets = plan.bases.filter(isPlainCabinet);
  const leavesD = leaf.isConverted || leaf.isSwapped ? 1 : 0;
  const leavesTheDrawers = leaf.isSwapped ? 1 : 0;
  const drawers = plainCabinets.filter((base) =>
    DRAWER_CABINET_BODIES.has(base.buildId),
  );
  return (
    plainCabinets.length - leavesD >= OWNERS_PLAIN_CABINET_COUNT &&
    drawers.length - leavesTheDrawers < OWNERS_DRAWER_COUNT
  );
}

function isShortOfTheOwnersDrawers(plan: KitchenCompositionPlan): boolean {
  return isShortOfTheOwnersDrawersAfterTheLeaf(plan, {
    isConverted: false,
    isSwapped: false,
  });
}

/** *D*: the storage run's composed slots and the drawer modules astride the hob — never the core, the
 *  bottle or a column. */
function isPlainCabinet(base: PlannedGenerationBase): boolean {
  return (
    isComposedStorageSlot(base) ||
    base.id === PAN_DRAWER_ID ||
    base.id === THRESHOLD_DRAWER_ID
  );
}

function isDoorCabinet(base: PlannedGenerationBase): boolean {
  return isComposedStorageSlot(base) && base.buildId === DOOR_BODY;
}

function isTall(base: PlannedGenerationBase): boolean {
  return TALL_BODIES.has(base.buildId);
}

function hasBody(plan: KitchenCompositionPlan, buildId: string): boolean {
  return plan.bases.some((base) => base.buildId === buildId);
}

function countOf(
  plan: KitchenCompositionPlan,
  isCounted: (base: PlannedGenerationBase) => boolean,
): number {
  return plan.bases.filter(isCounted).length;
}

function sinkOf(plan: KitchenCompositionPlan): PlannedGenerationBase {
  const sink = plan.bases.find((base) => base.role === "sink");
  if (!sink) throw new Error("a placed plan composes no sink");
  return sink;
}

function hobOf(plan: KitchenCompositionPlan): PlannedGenerationBase {
  const hob = plan.bases.find((base) => base.role === "hob");
  if (!hob) throw new Error("a placed plan composes no hob");
  return hob;
}

function emptyKitchenTotals(): KitchenTotals {
  return {
    ovenTowerRooms: 0,
    tallColumns: 0,
    bottles: 0,
    panDrawerBodies: 0,
    thresholdDrawers: 0,
  };
}

function emptyCensus(): Census {
  const band = () => ({ converted: 0, rooms: 0 });
  return {
    afterS0b: { dishwashers: 0, ...emptyKitchenTotals() },
    reconstructionMismatches: {
      afterS0b: [],
      afterS1: [],
      liveOutsideATrade: [],
      liveTraded: 0,
    },
    besideTheSink: {
      sameWall: 0,
      acrossTheCorner: 0,
      both: [],
      leafReadASameWallSlot: 0,
      leafReadAnAcrossTheCornerSlot: 0,
      converted: 0,
      onWallA: 0,
      onWallB: 0,
      offTheNarrowerWall: [],
      doorCabinetElsewhere: 0,
      notTheSameRoomsBeforeTheThresholdDrawer: [],
      notTheSameRoomsOnTheCoreAlone: [],
    },
    metreTable: {
      "shorter >= 2.3 m, longer >= 2.8 m": band(),
      "shorter 2.2-2.3 m, longer >= 2.8 m": band(),
      "shorter >= 2.3 m, longer < 2.8 m": band(),
      "shorter < 2.2 m": band(),
      "shorter 2.2-2.3 m, longer < 2.8 m": band(),
    },
    convertedAtTheFreeEnd: {
      mergeRemainder: 0,
      noRemainder: 0,
      widerRemainder: [],
    },
    drawerSwap: {
      byDrawerCabinets: {},
      notThePreparationBesideTheSink: [],
      noPanDrawerDirectlyBeyond: [],
      withAThresholdDrawer: [],
    },
    bottleCost: {
      anyColumn: 0,
      anOuterColumnOnly: 0,
      theOvenTower: 0,
      theOvenTowerWithNoPanDrawer: 0,
      theOvenTowerBesideAPanDrawer: 0,
      theOvenTowerButTheHobIsNotOven: [],
      afterS0b: {},
      anOuterColumnAfterS0b: {},
    },
    towerOverBottle: {
      rooms: 0,
      hobBodies: {},
      columnsRegained: {},
      anythingElseChanged: [],
      headWouldHaveAddedAThresholdDrawer: [],
      shortOfDrawersWithoutTheBottle: [],
      remainderOfAModuleOrMore: [],
      roomsWithoutAnOvenTower: [],
    },
    dishwasherFirstModel: {
      converted: 0,
      drawerSwap: 0,
      thresholdDrawersLost: 0,
      lostWithAColumnBackAndNoBottle: 0,
      lostWithAColumnBackAndTheBottleKept: 0,
      lostWithTheBottleBack: 0,
      lostOtherwise: [],
      thresholdDrawersGained: [],
      totals: { dishwashers: 0, ...emptyKitchenTotals() },
    },
  };
}
