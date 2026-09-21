// M7 wave 7D5b slice S2 — the dishwasher's trades (ADR 0110 Amendment M7 (b), (d), (c), M10, M12).
//
// Where S1 placed no dishwasher (no free door cabinet beside the sink, and no (e) swap), the owner lets
// it push out, in M10's order, a pantry column (b), the bottle (d), and — last, and only where the hob
// then carries the oven — the oven tower (c): *"dishwasher should replace a oven tower if there is no
// place to keep both and only if hub is with oven"*. Every trade stands the dishwasher directly after
// the sink, so the bodies between the sink and the freed module shift 600 mm along the wall.
//
// One witness per trade, and one room that stays without, each read whole, corner outward, at 2600 mm.
// Every body, id and span is a literal (ADR 0121 decision 3(b)), so a renamed constant cannot make a
// wrong kitchen agree with itself.
//
// **QA's census (7D5b S2)** sweeps the approved L rectangle at 10 mm and at 2200, 2600 and 3900 mm, and
// compares every live plan with **S1's plan** — the planner with S1's leaf on and S2's trades switched
// off (`withS1Alone`, `composition-context-capture`). Each room's difference is named by
// `dishwasherTradeBetween`, which admits a trade only where the live plan is S1's with exactly that
// trade done: one dishwasher directly after the sink, every module between the sink and the body given
// up 600 mm further along, everything else S1's. Independently of it, the census spells each room's
// traded bodies as the multiset S1's plan has and the live plan does not, reads the reading direction
// off the spans, and checks each trade's own ruling — (b) keeps a column and the tower, (d) keeps the
// columns, (c) takes a lone tower and gives the hob its oven. Every invariant is a per-room list
// asserted empty.
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
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
} from "../../src/index.js";
import { canonicalPlan } from "../support/composed-run-baseline.js";
import { withS1Alone } from "../support/composition-context-capture.js";
import {
  dishwasherTradeBetween,
  type DishwasherTrade,
} from "../support/pre-tower-run-recording.js";

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
const WITNESS_CEILING_MM = 2600;

function planFor(wallAMm: number, wallBMm: number): KitchenCompositionPlan {
  const room = {
    shape: "L" as const,
    widthMm: wallAMm,
    depthMm: wallBMm,
    heightMm: WITNESS_CEILING_MM,
  };
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

/** A wall's modules corner outward as `id/role/body [start, end]`; a module the storage run composed
 *  reads `slot`, reached through the predicate so this file spells no composed id. */
function wallAsBuilt(
  plan: KitchenCompositionPlan,
  wall: DesignWall,
): readonly string[] {
  return plan.bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm)
    .map((base) => {
      const name = isComposedStorageSlot(base) ? "slot" : base.id;
      const span = `[${String(base.startMm)}, ${String(base.endMm)}]`;
      return `${name}/${base.role}/${base.buildId} ${span}`;
    });
}

describe("7D5b S2 — the dishwasher is traded in beside the sink, in M10's order", () => {
  it("takes (c) in 4650 x 1000: the tower goes, the hob carries the oven, the 3-drawer and bottle stay", () => {
    const plan = planFor(4650, 1000);

    expect(wallAsBuilt(plan, "A")).toEqual([
      "fridge/fridge/fridge-free [900, 1600]",
      "sink/sink/base-sink [1600, 2200]",
      "dishwasher/storage/base-dishwasher [2200, 2800]",
      "preparation/preparation/base-3drawer [2800, 3400]",
      "hob/hob/base-hob-oven [3400, 4000]",
      "bottle/storage/base-bottle-cargo [4000, 4300]",
    ]);
    expect(wallAsBuilt(plan, "B")).toEqual([]);
    expect(plan.dropped).toEqual([]);
  });

  it("takes (b) in 900 x 5000: one pantry column goes, the oven tower and the hob's body stay", () => {
    const plan = planFor(900, 5000);

    expect(wallAsBuilt(plan, "B")).toEqual([
      "fridge/fridge/fridge-free [900, 1600]",
      "sink/sink/base-sink [1600, 2200]",
      "dishwasher/storage/base-dishwasher [2200, 2800]",
      "preparation/preparation/base-3drawer [2800, 3400]",
      "hob/hob/base-hob-2drawer [3400, 4000]",
      "bottle/storage/base-bottle-cargo [4000, 4300]",
      "column:B:0/storage/tall-oven-tower [4300, 4900]",
    ]);
    expect(plan.remainderMm).toEqual({ A: 0, B: 0 });
  });

  it("takes (d) in 900 x 4700: the bottle goes, the oven tower and the hob's body stay", () => {
    const plan = planFor(900, 4700);

    expect(wallAsBuilt(plan, "B")).toEqual([
      "fridge/fridge/fridge-free [900, 1600]",
      "sink/sink/base-sink [1600, 2200]",
      "dishwasher/storage/base-dishwasher [2200, 2800]",
      "preparation/preparation/base-3drawer [2800, 3400]",
      "hob/hob/base-hob-2drawer [3400, 4000]",
      "column:B:0/storage/tall-oven-tower [4000, 4600]",
    ]);
  });

  it("leaves 900 x 5010 without: its tower and the pantry outboard would both go, which no trade allows", () => {
    const plan = planFor(900, 5010);

    expect(wallAsBuilt(plan, "B")).toEqual([
      "fridge/fridge/fridge-free [900, 1600]",
      "sink/sink/base-sink [1600, 2200]",
      "preparation/preparation/base-3drawer [2200, 2800]",
      "hob/hob/base-hob-2drawer [2800, 3400]",
      "bottle/storage/base-bottle-cargo [3400, 3700]",
      "column:B:0/storage/tall-oven-tower [3700, 4300]",
      "column:B:1/storage/tall-pantry [4300, 4910]",
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// The trade classifier is only worth what it refuses.
// ---------------------------------------------------------------------------------------------

// S1's plans for the three trade witnesses, whole, in `canonicalPlan` form: S1 leaves each as S0b built
// it (`qa-7d5b-post-tower-recorded`), and each trade is spelled from it by hand. Each mutant is the
// admitted trade with one thing more wrong than M7 allows, and must read "changed otherwise".
const S1_4650X1000 =
  "minimumMet=true|cut=0|dropped=|remainder=350/0|floorWidths=700,600,600,600,300,600/" +
  "|fridge~fridge~fridge-free~A~900~1600~700|sink~sink~base-sink~A~1600~2200~600" +
  "|preparation~preparation~base-3drawer~A~2200~2800~600|hob~hob~base-hob-2drawer~A~2800~3400~600" +
  "|bottle~storage~base-bottle-cargo~A~3400~3700~300|column:A:0~storage~tall-oven-tower~A~3700~4300~600";
const TRADED_4650X1000 =
  "minimumMet=true|cut=0|dropped=|remainder=350/0|floorWidths=700,600,600,600,600,300/" +
  "|fridge~fridge~fridge-free~A~900~1600~700|sink~sink~base-sink~A~1600~2200~600" +
  "|dishwasher~storage~base-dishwasher~A~2200~2800~600|preparation~preparation~base-3drawer~A~2800~3400~600" +
  "|hob~hob~base-hob-oven~A~3400~4000~600|bottle~storage~base-bottle-cargo~A~4000~4300~300";
const S1_900X5000 =
  "minimumMet=true|cut=4|dropped=|remainder=0/0|floorWidths=/700,600,600,600,300,600,600" +
  "|fridge~fridge~fridge-free~B~900~1600~700|sink~sink~base-sink~B~1600~2200~600" +
  "|preparation~preparation~base-3drawer~B~2200~2800~600|hob~hob~base-hob-2drawer~B~2800~3400~600" +
  "|bottle~storage~base-bottle-cargo~B~3400~3700~300|column:B:0~storage~tall-oven-tower~B~3700~4300~600" +
  "|column:B:1~storage~tall-pantry~B~4300~4900~600";
const TRADED_900X5000 =
  "minimumMet=true|cut=4|dropped=|remainder=0/0|floorWidths=/700,600,600,600,600,300,600" +
  "|fridge~fridge~fridge-free~B~900~1600~700|sink~sink~base-sink~B~1600~2200~600" +
  "|dishwasher~storage~base-dishwasher~B~2200~2800~600|preparation~preparation~base-3drawer~B~2800~3400~600" +
  "|hob~hob~base-hob-2drawer~B~3400~4000~600|bottle~storage~base-bottle-cargo~B~4000~4300~300" +
  "|column:B:0~storage~tall-oven-tower~B~4300~4900~600";
const S1_900X4700 =
  "minimumMet=true|cut=4|dropped=|remainder=0/300|floorWidths=/700,600,600,600,300,600" +
  "|fridge~fridge~fridge-free~B~900~1600~700|sink~sink~base-sink~B~1600~2200~600" +
  "|preparation~preparation~base-3drawer~B~2200~2800~600|hob~hob~base-hob-2drawer~B~2800~3400~600" +
  "|bottle~storage~base-bottle-cargo~B~3400~3700~300|column:B:0~storage~tall-oven-tower~B~3700~4300~600";
const TRADED_900X4700 =
  "minimumMet=true|cut=4|dropped=|remainder=0/0|floorWidths=/700,600,600,600,600,600" +
  "|fridge~fridge~fridge-free~B~900~1600~700|sink~sink~base-sink~B~1600~2200~600" +
  "|dishwasher~storage~base-dishwasher~B~2200~2800~600|preparation~preparation~base-3drawer~B~2800~3400~600" +
  "|hob~hob~base-hob-2drawer~B~3400~4000~600|column:B:0~storage~tall-oven-tower~B~4000~4600~600";

/** A composed storage slot's id, read through the predicate so this file spells no composed id (7D4
 *  criterion 22): the reference room stands one on wall B. */
function aComposedSlotId(): string {
  const slot = planFor(3560, 2920).bases.find(isComposedStorageSlot);
  if (slot === undefined)
    throw new Error("3560 x 2920 stands no composed slot");
  return slot.id;
}

function edited(plan: string, from: string, to: string): string {
  if (!plan.includes(from)) throw new Error(`the plan holds no ${from}`);
  return plan.replace(from, to);
}

describe("the trade classifier refuses every change beyond M7's", () => {
  it.each([
    [
      "4650 x 1000",
      S1_4650X1000,
      TRADED_4650X1000,
      "(c): the oven tower traded, the hob given its oven",
    ],
    [
      "900 x 5000",
      S1_900X5000,
      TRADED_900X5000,
      "(b): one pantry column traded",
    ],
    ["900 x 4700", S1_900X4700, TRADED_900X4700, "(d): the bottle traded"],
  ] as const)(
    "admits %s's hand-spelled trade, and it is the live planner's plan",
    (room, afterS1, traded, trade) => {
      const [widthMm, depthMm] = room.split(" x ").map(Number);

      expect(dishwasherTradeBetween({ afterS1, live: traded })).toBe(trade);
      expect(canonicalPlan(planFor(widthMm ?? 0, depthMm ?? 0))).toBe(traded);
    },
  );

  it.each([
    [
      "(c) with the hob keeping its drawers, so the kitchen has no oven",
      S1_4650X1000,
      edited(
        TRADED_4650X1000,
        "hob~hob~base-hob-oven",
        "hob~hob~base-hob-2drawer",
      ),
    ],
    [
      "(c) with the dishwasher inserted before the hob rather than after the sink",
      S1_4650X1000,
      edited(
        edited(
          TRADED_4650X1000,
          "dishwasher~storage~base-dishwasher~A~2200~2800~600|preparation~preparation~base-3drawer~A~2800~3400~600",
          "preparation~preparation~base-3drawer~A~2200~2800~600|dishwasher~storage~base-dishwasher~A~2800~3400~600",
        ),
        "floorWidths=700,600,600,600,600,300/",
        "floorWidths=700,600,600,600,600,300/",
      ),
    ],
    [
      "(c) with the bottle given up as well",
      S1_4650X1000,
      edited(
        edited(
          TRADED_4650X1000,
          "|bottle~storage~base-bottle-cargo~A~4000~4300~300",
          "",
        ),
        "remainder=350/0|floorWidths=700,600,600,600,600,300/",
        "remainder=650/0|floorWidths=700,600,600,600,600/",
      ),
    ],
    [
      "(b) that gives up the oven tower and keeps the pantry",
      S1_900X5000,
      edited(
        TRADED_900X5000,
        "column:B:0~storage~tall-oven-tower~B~4300~4900~600",
        "column:B:0~storage~tall-pantry~B~4300~4900~600",
      ),
    ],
    [
      "(b) with the tower left where it stood, overlapping the bottle",
      S1_900X5000,
      edited(
        TRADED_900X5000,
        "column:B:0~storage~tall-oven-tower~B~4300~4900~600",
        "column:B:0~storage~tall-oven-tower~B~3700~4300~600",
      ),
    ],
    [
      "(d) with the dishwasher 10 mm off the sink",
      S1_900X4700,
      edited(
        TRADED_900X4700,
        "dishwasher~storage~base-dishwasher~B~2200~2800~600",
        "dishwasher~storage~base-dishwasher~B~2210~2810~600",
      ),
    ],
    [
      "(d) with the dishwasher given a composed slot's id, so D would count it",
      S1_900X4700,
      edited(
        TRADED_900X4700,
        "dishwasher~storage~base-dishwasher",
        `${aComposedSlotId()}~storage~base-dishwasher`,
      ),
    ],
    [
      "(d) with the dishwasher before the sink, the fridge moved off its span",
      S1_900X4700,
      edited(
        edited(
          TRADED_900X4700,
          "fridge~fridge~fridge-free~B~900~1600~700|sink~sink~base-sink~B~1600~2200~600|dishwasher~storage~base-dishwasher~B~2200~2800~600",
          "fridge~fridge~fridge-free~B~900~1600~700|dishwasher~storage~base-dishwasher~B~1600~2200~600|sink~sink~base-sink~B~2200~2800~600",
        ),
        "floorWidths=/700,600,600,600,600,600",
        "floorWidths=/700,600,600,600,600,600",
      ),
    ],
    [
      "a dishwasher added where S1 already stood one",
      TRADED_900X4700,
      edited(
        TRADED_900X4700,
        "preparation~preparation~base-3drawer",
        "dishwasher~storage~base-dishwasher",
      ),
    ],
  ])("refuses %s", (_, afterS1, live) => {
    expect(dishwasherTradeBetween({ afterS1, live })).toBe("changed otherwise");
  });
});

// ---------------------------------------------------------------------------------------------
// QA's census: every placed room, live against S1's plan.
// ---------------------------------------------------------------------------------------------

const CEILINGS_MM = [2200, 2600, 3900] as const;
const GRID_STEP_MM = 10;
const SWEEP_TIMEOUT_MS = 180_000;
const DISHWASHER_BODY = "base-dishwasher";
const OVEN_TOWER_BODY = "tall-oven-tower";
const HOB_WITH_OVEN_BODY = "base-hob-oven";
const BOTTLE_BODY = "base-bottle-cargo";
const PAN_DRAWER_BODY = "base-panbank";
const TALL_BODY_PREFIX = "tall-";
const THRESHOLD_DRAWER_ID = "threshold-drawer";
const CORE_ROLES = ["fridge", "sink", "preparation", "hob"] as const;
const DRAWER_CABINET_BODIES: ReadonlySet<string> = new Set([
  "base-3drawer",
  PAN_DRAWER_BODY,
]);
const OVEN_BODIES: ReadonlySet<string> = new Set([
  HOB_WITH_OVEN_BODY,
  OVEN_TOWER_BODY,
]);
/** *D*, as Q-H5 counts it: the composed slots and the two drawer modules astride the hob. */
const DRAWER_MODULE_IDS: ReadonlySet<string> = new Set([
  "pan-drawer",
  THRESHOLD_DRAWER_ID,
]);
const OWNERS_PLAIN_CABINET_COUNT = 6;
const OWNERS_DRAWER_COUNT = 2;
const ONE_MODULE_MM = 600;
const TRADE_B: DishwasherTrade = "(b): one pantry column traded";
const TRADE_D: DishwasherTrade = "(d): the bottle traded";
const TRADE_C: DishwasherTrade =
  "(c): the oven tower traded, the hob given its oven";

interface TradeCensus {
  swept: number;
  placed: number;
  totals: {
    dishwashers: number;
    withoutADishwasher: number;
    ovenTowerRooms: number;
    tallColumns: number;
    bottles: number;
    panDrawerBodies: number;
    thresholdDrawers: number;
  };
  /** Where each live dishwasher came from: S1's leaf (already in S1's plan) or one of S2's trades. */
  byTrade: Partial<Record<DishwasherTrade | "S1's leaf" | "without", number>>;
  /** Each traded room's bodies, spelled from the two plans: `given up -> added`. */
  bodiesByTrade: Record<string, Record<string, number>>;
  /** Each traded room's reading direction: the dishwasher beyond the sink away from, or toward, the
   *  sink wall's corner end. */
  directionByTrade: Record<string, Record<string, number>>;
  invariants: Record<TradeInvariant, string[]>;
}

type TradeInvariant =
  | "changedOtherwise"
  | "minimumMetChanged"
  | "droppedChanged"
  | "aCoreRoleChangedWall"
  | "tradedWhereS1PlacedOne"
  | "changedWithoutADishwasher"
  | "moreThanOneDishwasher"
  | "dishwasherNotItsOwnIdentity"
  | "dishwasherCountedInD"
  | "aDrawerCabinetLost"
  | "thresholdDrawerChanged"
  | "ovensOtherThanOne"
  | "remainderOfAModuleOrMore"
  | "dOfSixShortOfDrawers"
  | "bLeftNoColumn"
  | "bCostMoreThanOneColumn"
  | "bLostTheOvenTower"
  | "bChangedTheHob"
  | "dChangedTheColumns"
  | "dChangedTheHob"
  | "cTookMoreThanALoneTower"
  | "cLeftTheHobWithoutItsOven";

describe("7D5b S2 — QA's census over the approved L rectangle, 10 mm, at 2200, 2600 and 3900 mm", () => {
  const censusByCeiling = new Map<number, TradeCensus>();

  beforeAll(() => {
    for (const ceilingMm of CEILINGS_MM) {
      censusByCeiling.set(ceilingMm, tradeCensusAt(ceilingMm));
    }
  }, SWEEP_TIMEOUT_MS);

  function censusAt(ceilingMm: number): TradeCensus {
    const census = censusByCeiling.get(ceilingMm);
    if (!census) throw new Error(`no census at ${String(ceilingMm)} mm`);
    return census;
  }

  it.each(CEILINGS_MM)(
    "at %i mm, 196 621 dishwashers and 48 590 without, 156 886 oven-tower rooms, 367 428 columns, 173 691 bottles",
    (ceilingMm) => {
      const { swept, placed, totals } = censusAt(ceilingMm);

      expect({ swept, placed, totals }).toEqual({
        swept: 256_011,
        placed: 245_211,
        totals: {
          dishwashers: 196_621,
          withoutADishwasher: 48_590,
          ovenTowerRooms: 156_886,
          tallColumns: 367_428,
          bottles: 173_691,
          panDrawerBodies: 92_446,
          thresholdDrawers: 5_725,
        },
      });
    },
  );

  it.each(CEILINGS_MM)(
    "at %i mm, S1's leaf places 165 421 and S2 trades in 31 200: 18 200 by (b), 2 600 by (d), 10 400 by (c)",
    (ceilingMm) => {
      expect(censusAt(ceilingMm).byTrade).toEqual({
        "S1's leaf": 165_421,
        [TRADE_B]: 18_200,
        [TRADE_D]: 2_600,
        [TRADE_C]: 10_400,
        without: 48_590,
      });
    },
  );

  it.each(CEILINGS_MM)(
    "at %i mm, each trade gives up exactly its own bodies: a pantry, the bottle, or the tower and the hob's drawers",
    (ceilingMm) => {
      expect(censusAt(ceilingMm).bodiesByTrade).toEqual({
        [TRADE_B]: { "tall-pantry -> base-dishwasher": 18_200 },
        [TRADE_D]: { "base-bottle-cargo -> base-dishwasher": 2_600 },
        [TRADE_C]: {
          "base-hob-2drawer + tall-oven-tower -> base-dishwasher + base-hob-oven": 10_400,
        },
      });
    },
  );

  // The plan asks for a witness per trade in the other reading direction. None is reachable here: in
  // every traded room the sink's wall reads corner outward, so the dishwasher after it stands further
  // from the corner. Declared runs reach the other direction — see the last describe.
  it.each(CEILINGS_MM)(
    "at %i mm, every trade stands the dishwasher after the sink away from the corner, and none toward it",
    (ceilingMm) => {
      expect(censusAt(ceilingMm).directionByTrade).toEqual({
        [TRADE_B]: { "away from the corner": 18_200 },
        [TRADE_D]: { "away from the corner": 2_600 },
        [TRADE_C]: { "away from the corner": 10_400 },
      });
    },
  );

  it.each(CEILINGS_MM)(
    "at %i mm, no room breaks any of S2's invariants",
    (ceilingMm) => {
      expect(censusAt(ceilingMm).invariants).toEqual(noInvariantBroken());
    },
  );
});

function tradeCensusAt(ceilingMm: number): TradeCensus {
  const census = emptyTradeCensus();
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
      countTheRoom(census, {
        shape: "L",
        widthMm,
        depthMm,
        heightMm: ceilingMm,
      });
    }
  }
  return census;
}

interface ComparedRoom {
  readonly where: string;
  readonly afterS1: KitchenCompositionPlan;
  readonly live: KitchenCompositionPlan;
}

function countTheRoom(census: TradeCensus, room: DesignRoom): void {
  const compose = () =>
    planKitchenComposition({
      room,
      runs: lShellFloorRuns(room),
      columns: DECLARED_COLUMNS,
    });
  const compared: ComparedRoom = {
    where: `${String(room.widthMm)}x${String(room.depthMm)}`,
    afterS1: withS1Alone(compose),
    live: compose(),
  };
  const flag = (name: TradeInvariant, isBroken: boolean) => {
    if (isBroken) census.invariants[name].push(compared.where);
  };
  flag(
    "minimumMetChanged",
    compared.live.minimumMet !== compared.afterS1.minimumMet,
  );
  if (!compared.live.minimumMet) return;
  census.placed += 1;
  addTotals(census, compared.live);
  const trade = dishwasherTradeBetween({
    afterS1: canonicalPlan(compared.afterS1),
    live: canonicalPlan(compared.live),
  });
  countTheSource(census, { compared, trade });
  if (isATrade(trade)) countTheTrade(census, { compared, trade });
  checkTheInvariants(flag, { compared, trade });
}

function isATrade(trade: DishwasherTrade): boolean {
  return trade === TRADE_B || trade === TRADE_D || trade === TRADE_C;
}

function countTheSource(
  census: TradeCensus,
  {
    compared,
    trade,
  }: { readonly compared: ComparedRoom; readonly trade: DishwasherTrade },
): void {
  const source =
    dishwashersIn(compared.afterS1).length > 0
      ? "S1's leaf"
      : isATrade(trade)
        ? trade
        : dishwashersIn(compared.live).length === 0
          ? "without"
          : trade;
  census.byTrade[source] = (census.byTrade[source] ?? 0) + 1;
}

function countTheTrade(
  census: TradeCensus,
  {
    compared,
    trade,
  }: { readonly compared: ComparedRoom; readonly trade: DishwasherTrade },
): void {
  const bodies = `${bodiesOnlyIn(compared.afterS1, compared.live).join(" + ")} -> ${bodiesOnlyIn(compared.live, compared.afterS1).join(" + ")}`;
  const bodiesOf = (census.bodiesByTrade[trade] ??= {});
  bodiesOf[bodies] = (bodiesOf[bodies] ?? 0) + 1;
  const direction = readingDirectionOf(compared.live);
  const directions = (census.directionByTrade[trade] ??= {});
  directions[direction] = (directions[direction] ?? 0) + 1;
}

/** From the spans alone: the dishwasher abuts the sink on its wall, further from the corner end than the
 *  sink (the wall's modules stand corner outward), or nearer it. */
function readingDirectionOf(plan: KitchenCompositionPlan): string {
  const [dishwasher] = dishwashersIn(plan);
  const sink = plan.bases.find((base) => base.role === "sink");
  if (dishwasher === undefined || sink === undefined)
    return "no sink or dishwasher";
  if (dishwasher.wall !== sink.wall) return "across the corner";
  if (dishwasher.startMm === sink.endMm) return "away from the corner";
  if (dishwasher.endMm === sink.startMm) return "toward the corner";
  return "not beside the sink";
}

function checkTheInvariants(
  flag: (name: TradeInvariant, isBroken: boolean) => void,
  {
    compared,
    trade,
  }: { readonly compared: ComparedRoom; readonly trade: DishwasherTrade },
): void {
  const { afterS1, live } = compared;
  const dishwashers = dishwashersIn(live);
  const isChanged = canonicalPlan(live) !== canonicalPlan(afterS1);
  flag("changedOtherwise", trade === "changed otherwise");
  flag("droppedChanged", live.dropped.join() !== afterS1.dropped.join());
  flag(
    "aCoreRoleChangedWall",
    CORE_ROLES.some(
      (role) => wallOfRole(live, role) !== wallOfRole(afterS1, role),
    ),
  );
  flag(
    "tradedWhereS1PlacedOne",
    dishwashersIn(afterS1).length > 0 && isChanged,
  );
  flag("changedWithoutADishwasher", dishwashers.length === 0 && isChanged);
  flag("moreThanOneDishwasher", dishwashers.length > 1);
  flag(
    "dishwasherNotItsOwnIdentity",
    dishwashers.some(isNotTheOwnersDishwasher),
  );
  flag("dishwasherCountedInD", dishwashers.some(isInD));
  flag(
    "aDrawerCabinetLost",
    drawerCabinetsIn(live) < drawerCabinetsIn(afterS1),
  );
  flag(
    "thresholdDrawerChanged",
    hasThresholdDrawer(live) !== hasThresholdDrawer(afterS1),
  );
  flag(
    "ovensOtherThanOne",
    live.bases.filter((base) => OVEN_BODIES.has(base.buildId)).length !== 1,
  );
  flag(
    "remainderOfAModuleOrMore",
    live.remainderMm.A >= ONE_MODULE_MM || live.remainderMm.B >= ONE_MODULE_MM,
  );
  flag("dOfSixShortOfDrawers", isShortOfTheOwnersDrawers(live));
  checkTheTradesOwnRuling(flag, { compared, trade });
}

/** M7/M10/M12, each trade's own ruling, read off the two plans. */
function checkTheTradesOwnRuling(
  flag: (name: TradeInvariant, isBroken: boolean) => void,
  {
    compared,
    trade,
  }: { readonly compared: ComparedRoom; readonly trade: DishwasherTrade },
): void {
  const { afterS1, live } = compared;
  const columnsBefore = tallColumnsIn(afterS1);
  const columnsAfter = tallColumnsIn(live);
  const isHobKept = hobBodyOf(live) === hobBodyOf(afterS1);
  if (trade === TRADE_B) {
    flag("bLeftNoColumn", columnsAfter === 0);
    flag("bCostMoreThanOneColumn", columnsBefore - columnsAfter !== 1);
    flag("bLostTheOvenTower", !hasBody(live, OVEN_TOWER_BODY));
    flag("bChangedTheHob", !isHobKept);
  }
  if (trade === TRADE_D) {
    flag(
      "dChangedTheColumns",
      columnsAfter !== columnsBefore || !hasBody(live, OVEN_TOWER_BODY),
    );
    flag("dChangedTheHob", !isHobKept);
  }
  if (trade === TRADE_C) {
    flag("cTookMoreThanALoneTower", columnsBefore !== 1 || columnsAfter !== 0);
    flag("cLeftTheHobWithoutItsOven", hobBodyOf(live) !== HOB_WITH_OVEN_BODY);
  }
}

function dishwashersIn(
  plan: KitchenCompositionPlan,
): readonly PlannedGenerationBase[] {
  return plan.bases.filter((base) => base.buildId === DISHWASHER_BODY);
}

function wallOfRole(plan: KitchenCompositionPlan, role: string): string {
  return plan.bases.find((base) => base.role === role)?.wall ?? "none";
}

function hobBodyOf(plan: KitchenCompositionPlan): string {
  return plan.bases.find((base) => base.role === "hob")?.buildId ?? "none";
}

function hasBody(plan: KitchenCompositionPlan, buildId: string): boolean {
  return plan.bases.some((base) => base.buildId === buildId);
}

function tallColumnsIn(plan: KitchenCompositionPlan): number {
  return plan.bases.filter((base) => base.buildId.startsWith(TALL_BODY_PREFIX))
    .length;
}

function drawerCabinetsIn(plan: KitchenCompositionPlan): number {
  return plan.bases.filter((base) => DRAWER_CABINET_BODIES.has(base.buildId))
    .length;
}

function hasThresholdDrawer(plan: KitchenCompositionPlan): boolean {
  return plan.bases.some((base) => base.id === THRESHOLD_DRAWER_ID);
}

function isNotTheOwnersDishwasher(base: PlannedGenerationBase): boolean {
  return (
    base.id !== "dishwasher" ||
    base.role !== "storage" ||
    base.widthMm !== ONE_MODULE_MM
  );
}

function isInD(base: PlannedGenerationBase): boolean {
  return isComposedStorageSlot(base) || DRAWER_MODULE_IDS.has(base.id);
}

function isShortOfTheOwnersDrawers(plan: KitchenCompositionPlan): boolean {
  const plainCabinets = plan.bases.filter(isInD);
  const drawers = plainCabinets.filter((base) =>
    DRAWER_CABINET_BODIES.has(base.buildId),
  );
  return (
    plainCabinets.length >= OWNERS_PLAIN_CABINET_COUNT &&
    drawers.length < OWNERS_DRAWER_COUNT
  );
}

/** The multiset of `plan`'s bodies less `other`'s, sorted — spelled here rather than borrowed from the
 *  classifier, so the two readings of a trade are independent. */
function bodiesOnlyIn(
  plan: KitchenCompositionPlan,
  other: KitchenCompositionPlan,
): readonly string[] {
  const remaining = other.bases.map((base) => base.buildId);
  const only: string[] = [];
  for (const base of plan.bases) {
    const at = remaining.indexOf(base.buildId);
    if (at < 0) only.push(base.buildId);
    else remaining.splice(at, 1);
  }
  return only.sort();
}

function addTotals(census: TradeCensus, plan: KitchenCompositionPlan): void {
  const { totals } = census;
  const countOf = (isCounted: (base: PlannedGenerationBase) => boolean) =>
    plan.bases.filter(isCounted).length;
  const hasADishwasher = dishwashersIn(plan).length > 0;
  totals.dishwashers += hasADishwasher ? 1 : 0;
  totals.withoutADishwasher += hasADishwasher ? 0 : 1;
  totals.ovenTowerRooms += hasBody(plan, OVEN_TOWER_BODY) ? 1 : 0;
  totals.tallColumns += tallColumnsIn(plan);
  totals.bottles += hasBody(plan, BOTTLE_BODY) ? 1 : 0;
  totals.panDrawerBodies += countOf((base) => base.buildId === PAN_DRAWER_BODY);
  totals.thresholdDrawers += countOf((base) => base.id === THRESHOLD_DRAWER_ID);
}

function noInvariantBroken(): Record<TradeInvariant, string[]> {
  return {
    changedOtherwise: [],
    minimumMetChanged: [],
    droppedChanged: [],
    aCoreRoleChangedWall: [],
    tradedWhereS1PlacedOne: [],
    changedWithoutADishwasher: [],
    moreThanOneDishwasher: [],
    dishwasherNotItsOwnIdentity: [],
    dishwasherCountedInD: [],
    aDrawerCabinetLost: [],
    thresholdDrawerChanged: [],
    ovensOtherThanOne: [],
    remainderOfAModuleOrMore: [],
    dOfSixShortOfDrawers: [],
    bLeftNoColumn: [],
    bCostMoreThanOneColumn: [],
    bLostTheOvenTower: [],
    bChangedTheHob: [],
    dChangedTheColumns: [],
    dChangedTheHob: [],
    cTookMoreThanALoneTower: [],
    cLeftTheHobWithoutItsOven: [],
  };
}

function emptyTradeCensus(): TradeCensus {
  return {
    swept: 0,
    placed: 0,
    totals: {
      dishwashers: 0,
      withoutADishwasher: 0,
      ovenTowerRooms: 0,
      tallColumns: 0,
      bottles: 0,
      panDrawerBodies: 0,
      thresholdDrawers: 0,
    },
    byTrade: {},
    bodiesByTrade: {},
    directionByTrade: {},
    invariants: noInvariantBroken(),
  };
}

// ---------------------------------------------------------------------------------------------
// Declared runs (ADR 0093 decision 1, ADR 0123): the other reading direction.
// ---------------------------------------------------------------------------------------------

/** Runs declared along each wall from its corner, decoupled from the room's entered lengths. */
function planForDeclaredRuns(
  room: DesignRoom,
  runLengthsMm: { readonly A: number; readonly B: number },
): KitchenCompositionPlan {
  return planKitchenComposition({
    room,
    runs: {
      A: { wall: "A", startMm: 0, endMm: runLengthsMm.A },
      B: { wall: "B", startMm: 0, endMm: runLengthsMm.B },
    },
    columns: DECLARED_COLUMNS,
  });
}

const DECLARED_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 6000,
  depthMm: 6000,
  heightMm: 2200,
};
const DECLARED_RUN_MIN_MM = 900;
const DECLARED_RUN_MAX_MM = 6000;
const DECLARED_RUN_STEP_MM = 100;

// **The defect this suite pins the fix of (QA 7D5b S2).** Where the sink's wall reads toward the
// corner, S1 found no module beside the sink, and a plain door cabinet stands between the preparation
// cabinet and the corner, (d) used to be taken: the bottle on the other wall was removed, and the
// dishwasher, inserted after the sink on the sink's wall, pushed the door cabinet off the run — two
// bodies given up, `base-bottle-cargo + base-cabinet`, where M7(d) allows one, and the bottle's removal
// freed nothing on the sink's wall. The trades now hold every candidate to
// `givesUpExactlyTheRuledBody` in `dishwasher-trades.ts`: wall by wall, exactly one of the ruled body
// lost and nothing else, so that kitchen keeps S1's plan. Unreachable in the approved rectangle (the
// census above: every trade reads away from the corner). The defect's population on declared runs, by
// grid:
// - 111 runs: this file's sweep below — 6000 x 6000 at 2200 mm, runs 900-6000 at 100 mm (QA);
// - 2,148 runs: QA's scratch probe (not a test here) — 6000 x 6000, 6000 x 5000 and 5000 x 6000 at
//   2200 and 2600 mm, runs at 50 mm;
// - 1,356 runs: the implementer's measurement — 6000 x 5000 and 5000 x 6000 at 2200 mm, runs 0-8000
//   at 50 mm.
describe("7D5b S2 on declared runs — a trade gives up exactly its own body in either reading direction", () => {
  it("6000 x 6000 x 2200, runs A 900 / B 1800: no trade frees the sink's wall, so the kitchen stays S1's", () => {
    const runs = { A: 900, B: 1800 };
    const compose = () => planForDeclaredRuns(DECLARED_ROOM, runs);

    const afterS1 = withS1Alone(compose);
    expect(wallAsBuilt(afterS1, "B")).toEqual([
      "slot/storage/base-cabinet [0, 600]",
      "preparation/preparation/base-3drawer [600, 1200]",
      "sink/sink/base-sink [1200, 1800]",
    ]);
    expect(wallAsBuilt(afterS1, "A")).toEqual([
      "hob/hob/base-hob-oven [0, 600]",
      "bottle/storage/base-bottle-cargo [600, 900]",
    ]);
    expect(canonicalPlan(compose())).toBe(canonicalPlan(afterS1));
  });

  it("over 6000 x 6000 x 2200 with each run 900-6000 mm at 100 mm, no trade is anything but (b), (d) or (c) exactly", () => {
    const changedOtherwise: string[] = [];
    for (
      let runA = DECLARED_RUN_MIN_MM;
      runA <= DECLARED_RUN_MAX_MM;
      runA += DECLARED_RUN_STEP_MM
    ) {
      for (
        let runB = DECLARED_RUN_MIN_MM;
        runB <= DECLARED_RUN_MAX_MM;
        runB += DECLARED_RUN_STEP_MM
      ) {
        const compose = () =>
          planForDeclaredRuns(DECLARED_ROOM, { A: runA, B: runB });
        const trade = dishwasherTradeBetween({
          afterS1: canonicalPlan(withS1Alone(compose)),
          live: canonicalPlan(compose()),
        });
        if (trade === "changed otherwise")
          changedOtherwise.push(`A ${String(runA)} / B ${String(runB)}`);
      }
    }

    expect(changedOtherwise).toEqual([]);
  });
});
