// M7 wave 7D5b slice S0b — the oven tower kept over S1's bottle (ADR 0110 Amendment M11, narrowed).
//
// Owner, 2026-09-21: *"keep the tower and drop the bottle"*, narrowed the same session to rooms where no
// pan drawer depends on the bottle. Each witness below is first shown to be on the path the rule reads —
// the pan drawer refused against the core alone, and S1's bottle costing the block its oven tower — so
// a green layout is the rule's answer and not a room the rule never reached. The two tower witnesses
// then keep the tower; the K3-fallback witness, where the pan drawer stands beside that bottle, is
// unchanged. Every body, id and span is a literal (ADR 0121 decision 3(b)).
//
// **"M11 fired" is a statement about the decision, not about the finished plan.** The census's
// `keptByTheDecision` counts rooms where the pan-drawer and bottle decision kept the tower; a later rule
// may still take it. On declared runs outside the approved grid (6000 x 6000, runs of 1000-5000 mm) L3's
// threshold drawer later takes the kept tower in 710 of 4 010 runs (the logic reviewer's measurement),
// and the finished plan there is byte-identical to pre-S0b. On the approved grid no room loses a tower
// that way: `keptByTheDecision` and `changed` below are both 5 260.
//
// **QA's census (7D5b S0b, part A)** sweeps the approved L rectangle at 10 mm and at 2200, 2600 and
// 3900 mm, and compares each live plan with HEAD `acb7b6f`'s — reconstructed by `planBeforeS0b`. It
// pins the 5 260 rooms per ceiling and the one shape every one of them changes by.
//
// **What this census can and cannot see.** `planBeforeS0b` returns the live plan itself wherever the
// test-side restatement of M11 is false, so `changed`, `byShape`, `anythingElseChanged: []` and
// `offTheRulesPath: []` are blind to any change **outside** that restatement: a production edit that
// moved some other room would leave all four green. They prove only that where the restatement fires,
// the change is M11's. "Nothing else changed" is carried by other checks:
//
// - `liveDecisionMismatches: []` here — every live plan without a threshold drawer is the composer's
//   `planOf` of the run the restated decision names, so the live decision is the restated one;
// - the pinned `totals` here, and in the independent censuses that never read the reconstruction
//   (`qa-7d5-bottle-cargo`'s `bottleIncluded`, `pan-drawer-before-the-hob`'s totals): an extra change
//   that moves a bottle, a column, a pan drawer or a threshold drawer moves a total;
// - the recordings — `qa-7d5b-pre-tower-recorded` and `qa-7d5b-post-tower-recorded` compare 480 drawn
//   rooms and 16 witnesses, byte for byte, against plans captured at `acb7b6f` and at S0b.
//
// A full-grid diff of HEAD's and S0b's plans on two scratch builds, which found the same 5 260 rooms
// per ceiling and 0 other changed rooms, is a **scratch measurement** by the implementer and QA, not a
// test in this repository; nothing here re-runs it.
//
// **Restated for S1 (ADR 0110 Amendment M1, M2, M7(e)).** S1's leaf re-identifies a module beside the
// sink in 165 421 rooms and re-plans the threshold drawer in 10 070, so the live planner is no longer
// S0b's. Everything here that is S0b's — the census, and each witness's *"on M11's path"* layout — is
// read from **S0b's plan**: the planner with S1's leaf switched off (`beforeS1`), proved byte for byte
// against the post-tower recording by `qa-7d5b-post-tower-recorded`. Where S1 moves a witness, its live
// layout is asserted beside it: 900 x 4410 is an (e) room.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
} from "../../src/index.js";
import { canonicalPlan } from "../support/composed-run-baseline.js";
import {
  beforeS1,
  decidedBeforeTheThresholdDrawer,
  forgetTheLastComposition,
  lastComposition,
  planBeforeS0b,
  whatS1sBottleCost,
  withS1Alone,
  type RecordedComposition,
} from "../support/composition-context-capture.js";
import { towerOverBottleChangeBetween } from "../support/pre-tower-run-recording.js";

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
const WITNESS_CEILING_MM = 2600;

function planFor(widthMm: number, depthMm: number): KitchenCompositionPlan {
  const room = {
    shape: "L" as const,
    widthMm,
    depthMm,
    heightMm: WITNESS_CEILING_MM,
  };
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

/** A wall's modules corner outward as `id/body [start, end]`. */
function wallAsBuilt(
  plan: KitchenCompositionPlan,
  wall: DesignWall,
): readonly string[] {
  return plan.bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm)
    .map(
      (base) =>
        `${base.id}/${base.buildId} [${String(base.startMm)}, ${String(base.endMm)}]`,
    );
}

/** The witness is on M11's path: the pan drawer was refused against the core alone, and S1's bottle
 *  on the core would take the block's oven tower. */
function expectS1sBottleToCostTheOvenTower(): void {
  const composition = lastComposition();
  expect(
    decidedBeforeTheThresholdDrawer(composition).isPanDrawerDecidedFirst,
  ).toBe(false);
  expect(whatS1sBottleCost(composition)).toBe("the oven tower");
}

beforeEach(() => {
  forgetTheLastComposition();
});

describe("7D5b S0b — the oven tower is kept over S1's bottle where no pan drawer depends on it", () => {
  it("3560 x 2920, the reference room: wall A ends hob-2drawer, oven tower [2700, 3300] and 260 mm bare", () => {
    const plan = beforeS1(() => planFor(3560, 2920));

    expectS1sBottleToCostTheOvenTower();
    expect(wallAsBuilt(plan, "A")).toEqual([
      "sink/base-sink [900, 1500]",
      "preparation/base-3drawer [1500, 2100]",
      "hob/base-hob-2drawer [2100, 2700]",
      "column:A:0/tall-oven-tower [2700, 3300]",
    ]);
    expect(plan.remainderMm.A).toBe(260);
  });

  it("900 x 4100: wall B ends hob-2drawer and the oven tower, with nothing bare", () => {
    const plan = beforeS1(() => planFor(900, 4100));

    expectS1sBottleToCostTheOvenTower();
    expect(wallAsBuilt(plan, "B")).toEqual([
      "fridge/fridge-free [900, 1600]",
      "sink/base-sink [1600, 2200]",
      "preparation/base-3drawer [2200, 2800]",
      "hob/base-hob-2drawer [2800, 3400]",
      "column:B:0/tall-oven-tower [3400, 4000]",
    ]);
    expect(plan.remainderMm.B).toBe(0);
  });

  it("900 x 4410, the K3 fallback: the pan drawer stands beside the bottle, so the bottle keeps the tower's place", () => {
    const plan = beforeS1(() => planFor(900, 4410));

    expectS1sBottleToCostTheOvenTower();
    expect(wallAsBuilt(plan, "B")).toEqual([
      "fridge/fridge-free [900, 1600]",
      "sink/base-sink [1600, 2200]",
      "preparation/base-3drawer [2200, 2800]",
      "pan-drawer/base-panbank [2800, 3400]",
      "hob/base-hob-oven [3400, 4000]",
      "bottle/base-bottle-cargo [4000, 4300]",
    ]);
    expect(plan.remainderMm.B).toBe(10);
  });

  // S1 leaves every body and span M11 decided here; (e) re-identifies the two drawer cabinets only.
  it("900 x 4410 with S1, live: the same bodies and spans, the dishwasher beside the sink and the preparation on the pan drawer", () => {
    const plan = planFor(900, 4410);

    expect(wallAsBuilt(plan, "B")).toEqual([
      "fridge/fridge-free [900, 1600]",
      "sink/base-sink [1600, 2200]",
      "dishwasher/base-dishwasher [2200, 2800]",
      "preparation/base-panbank [2800, 3400]",
      "hob/base-hob-oven [3400, 4000]",
      "bottle/base-bottle-cargo [4000, 4300]",
    ]);
    expect(plan.remainderMm.B).toBe(10);
  });

  it.each([
    [3560, 2920],
    [900, 4100],
  ])(
    "%i x %i with S1 alone: the wall M11 decided is the one S0b built",
    (widthMm, depthMm) => {
      const afterS0b = beforeS1(() => planFor(widthMm, depthMm));
      const hobWall = afterS0b.bases.find((base) => base.role === "hob")?.wall;
      if (hobWall === undefined) throw new Error("no hob");

      expect(
        wallAsBuilt(
          withS1Alone(() => planFor(widthMm, depthMm)),
          hobWall,
        ),
      ).toEqual(wallAsBuilt(afterS0b, hobWall));
    },
  );

  it("3560 x 2920 with S2, live: still the wall M11 decided — its dishwasher is M1's, across the corner", () => {
    const afterS0b = beforeS1(() => planFor(3560, 2920));

    expect(wallAsBuilt(planFor(3560, 2920), "A")).toEqual(
      wallAsBuilt(afterS0b, "A"),
    );
  });

  // S1 finds no module to convert beside the sink here, so S2 trades: no pantry column and no bottle
  // stand, and the lone tower goes (c), the hob taking the oven. M11 had already dropped the bottle.
  it("900 x 4100 with S2, live: (c) takes the tower M11 kept, the hob carries the oven, nothing bare", () => {
    const plan = planFor(900, 4100);

    expect(wallAsBuilt(plan, "B")).toEqual([
      "fridge/fridge-free [900, 1600]",
      "sink/base-sink [1600, 2200]",
      "dishwasher/base-dishwasher [2200, 2800]",
      "preparation/base-3drawer [2800, 3400]",
      "hob/base-hob-oven [3400, 4000]",
    ]);
    expect(plan.remainderMm.B).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// QA's census: the 5 260, their one shape, and nothing else.
// ---------------------------------------------------------------------------------------------

const CEILINGS_MM = [2200, 2600, 3900] as const;
const GRID_STEP_MM = 10;
const SWEEP_TIMEOUT_MS = 120_000;
const THRESHOLD_DRAWER_ID = "threshold-drawer";
const PAN_DRAWER_BODY = "base-panbank";
const OVEN_TOWER_BODY = "tall-oven-tower";
const BOTTLE_BODY = "base-bottle-cargo";
const TALL_BODY_PREFIX = "tall-";

interface TowerOverBottleCensus {
  /** Rooms where the restated decision says the tower was kept over the bottle. */
  keptByTheDecision: number;
  /** Rooms whose S0b plan differs from HEAD's reconstruction — which is S0b's plan itself wherever the
   *  restated decision did not keep the tower, so this cannot count a change outside M11's rooms. */
  changed: number;
  /** Each changed room's difference, spelled from the two plans rather than from the rule. */
  byShape: Record<string, number>;
  /** A changed room whose difference is anything but M11's exact change. */
  anythingElseChanged: string[];
  /** A changed room that was not on M11's path: the K3 fallback, S1's bottle taking the oven tower,
   *  and no pan drawer. */
  offTheRulesPath: string[];
  /** An S0b plan with no threshold drawer that is not the composer's plan (before S1) of the decided run. */
  liveDecisionMismatches: string[];
  /** A changed room where HEAD's threshold rule would have read the bottle kitchen short of drawers,
   *  so the reconstruction would not be HEAD's whole plan. */
  headWouldHaveAddedAThresholdDrawer: string[];
  totals: {
    bottles: number;
    ovenTowerRooms: number;
    tallColumns: number;
    panDrawers: number;
    thresholdDrawers: number;
  };
}

describe("7D5b S0b — QA's census over the approved L rectangle, 10 mm, at 2200, 2600 and 3900 mm", () => {
  const censusByCeiling = new Map<number, TowerOverBottleCensus>();

  beforeAll(() => {
    for (const ceilingMm of CEILINGS_MM) {
      censusByCeiling.set(ceilingMm, towerOverBottleCensusAt(ceilingMm));
    }
  }, SWEEP_TIMEOUT_MS);

  it.each(CEILINGS_MM)(
    "at %i mm, exactly 5 260 rooms change, every one by the bottle becoming the oven tower and the hob losing its oven, and no room changes in any other way",
    (ceilingMm) => {
      expect(censusByCeiling.get(ceilingMm)).toEqual({
        keptByTheDecision: 5_260,
        changed: 5_260,
        byShape: {
          "removed hob/base-hob-oven, storage/base-bottle-cargo; added hob/base-hob-2drawer, storage/tall-oven-tower; remainder -300 mm": 5_260,
        },
        anythingElseChanged: [],
        offTheRulesPath: [],
        liveDecisionMismatches: [],
        headWouldHaveAddedAThresholdDrawer: [],
        totals: {
          bottles: 173_231,
          ovenTowerRooms: 167_286,
          tallColumns: 389_018,
          panDrawers: 92_446,
          thresholdDrawers: 15_795,
        },
      });
    },
  );
});

function towerOverBottleCensusAt(ceilingMm: number): TowerOverBottleCensus {
  const census = emptyTowerOverBottleCensus();
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

/** One room, read before S1: S0b's plan, and HEAD's reconstructed on it. */
function countTheRoom(census: TowerOverBottleCensus, room: DesignRoom): void {
  forgetTheLastComposition();
  const planAfterS0b = beforeS1(() =>
    planKitchenComposition({
      room,
      runs: lShellFloorRuns(room),
      columns: DECLARED_COLUMNS,
    }),
  );
  if (!planAfterS0b.minimumMet) return;
  const where = `${String(room.widthMm)}x${String(room.depthMm)}`;
  const composition = lastComposition();
  const decided = decidedBeforeTheThresholdDrawer(composition);
  addTotals(census, planAfterS0b);
  if (decided.isTheOvenTowerKeptOverTheBottle) census.keptByTheDecision += 1;
  if (
    !hasThresholdDrawer(planAfterS0b) &&
    canonicalPlan(beforeS1(() => composition.context.planOf(decided.run))) !==
      canonicalPlan(planAfterS0b)
  ) {
    census.liveDecisionMismatches.push(where);
  }
  countTheChange(census, {
    where,
    composition,
    planAfterS0b,
    headPlan: planBeforeS0b(composition, planAfterS0b),
  });
}

function countTheChange(
  census: TowerOverBottleCensus,
  room: {
    readonly where: string;
    readonly composition: RecordedComposition;
    readonly planAfterS0b: KitchenCompositionPlan;
    readonly headPlan: KitchenCompositionPlan;
  },
): void {
  const { where, composition, planAfterS0b, headPlan } = room;
  const before = canonicalPlan(headPlan);
  const after = canonicalPlan(planAfterS0b);
  if (before === after) return;
  census.changed += 1;
  const shape = shapeOfTheChange(headPlan, planAfterS0b);
  census.byShape[shape] = (census.byShape[shape] ?? 0) + 1;
  if (
    towerOverBottleChangeBetween({ before, after }) !==
    "the oven tower kept over the bottle"
  ) {
    census.anythingElseChanged.push(where);
  }
  const isOnTheRulesPath =
    !decidedBeforeTheThresholdDrawer(composition).isPanDrawerDecidedFirst &&
    whatS1sBottleCost(composition) === "the oven tower" &&
    !hasBody(headPlan, PAN_DRAWER_BODY);
  if (!isOnTheRulesPath) census.offTheRulesPath.push(where);
  if (isShortOfDrawersForTheThresholdRule(headPlan)) {
    census.headWouldHaveAddedAThresholdDrawer.push(where);
  }
}

/** The modules removed and added between two plans, as `role/body`, and the remainders' net change. */
function shapeOfTheChange(
  before: KitchenCompositionPlan,
  after: KitchenCompositionPlan,
): string {
  const spelled = (plan: KitchenCompositionPlan) =>
    plan.bases.map(
      (base) =>
        `${base.role}/${base.buildId}~${base.wall}~${String(base.startMm)}~${String(base.endMm)}`,
    );
  const beforeModules = spelled(before);
  const afterModules = spelled(after);
  const bodyOf = (module: string) => module.split("~")[0] ?? module;
  const removed = beforeModules
    .filter((module) => !afterModules.includes(module))
    .map(bodyOf)
    .sort();
  const added = afterModules
    .filter((module) => !beforeModules.includes(module))
    .map(bodyOf)
    .sort();
  const remainderMm =
    after.remainderMm.A +
    after.remainderMm.B -
    before.remainderMm.A -
    before.remainderMm.B;
  return `removed ${removed.join(", ")}; added ${added.join(", ")}; remainder ${String(remainderMm)} mm`;
}

/** ADR 0110 Q-H5 as the owner stated it: six plain cabinets (*D*) or more, fewer than two of them
 *  drawers. *D* is the composed storage slots and the drawer modules astride the hob. */
function isShortOfDrawersForTheThresholdRule(
  plan: KitchenCompositionPlan,
): boolean {
  const plainCabinets = plan.bases.filter(
    (base) =>
      isComposedStorageSlot(base) ||
      base.id === "pan-drawer" ||
      base.id === THRESHOLD_DRAWER_ID,
  );
  const drawers = plainCabinets.filter(
    (base) =>
      base.buildId === "base-3drawer" || base.buildId === PAN_DRAWER_BODY,
  );
  return plainCabinets.length >= 6 && drawers.length < 2;
}

function addTotals(
  census: TowerOverBottleCensus,
  plan: KitchenCompositionPlan,
): void {
  const { totals } = census;
  totals.bottles += hasBody(plan, BOTTLE_BODY) ? 1 : 0;
  totals.ovenTowerRooms += hasBody(plan, OVEN_TOWER_BODY) ? 1 : 0;
  totals.tallColumns += plan.bases.filter((base) =>
    base.buildId.startsWith(TALL_BODY_PREFIX),
  ).length;
  totals.panDrawers += plan.bases.filter(
    (base) => base.buildId === PAN_DRAWER_BODY,
  ).length;
  totals.thresholdDrawers += plan.bases.filter(
    (base) => base.id === THRESHOLD_DRAWER_ID,
  ).length;
}

function hasBody(plan: KitchenCompositionPlan, buildId: string): boolean {
  return plan.bases.some((base) => base.buildId === buildId);
}

function hasThresholdDrawer(plan: KitchenCompositionPlan): boolean {
  return plan.bases.some((base) => base.id === THRESHOLD_DRAWER_ID);
}

function emptyTowerOverBottleCensus(): TowerOverBottleCensus {
  return {
    keptByTheDecision: 0,
    changed: 0,
    byShape: {},
    anythingElseChanged: [],
    offTheRulesPath: [],
    liveDecisionMismatches: [],
    headWouldHaveAddedAThresholdDrawer: [],
    totals: {
      bottles: 0,
      ovenTowerRooms: 0,
      tallColumns: 0,
      panDrawers: 0,
      thresholdDrawers: 0,
    },
  };
}
