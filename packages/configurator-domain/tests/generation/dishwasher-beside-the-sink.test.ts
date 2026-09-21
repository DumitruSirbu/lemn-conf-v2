// M7 wave 7D5b slice S1 — the dishwasher beside the sink (ADR 0110 Amendment M1, M7(e), M8, M9).
//
// Owner, Q-DW3: *"Converted, with 1F row"* — a plain door cabinet already standing beside the sink
// becomes the 600 mm niche, on the sink's own wall or across the corner, and nothing moves. Where no
// such cabinet exists, M7(e): *"when you have 3 even 2 drawert cabinets dishawasher can take place of
// one"*, *"the one beside the sink"* — the preview *sink · DISHWASHER · pan-drawer · hob*, modelled by
// moving the preparation role onto the pan drawer's module (M8/M9). Every body, id and span below is a
// literal (ADR 0121 decision 3(b)), read corner outward, so a renamed constant cannot make a wrong
// kitchen agree with itself.
//
// **QA's census (7D5b S1)** sweeps the approved L rectangle at 10 mm and at 2200, 2600 and 3900 mm, and
// compares every live plan with **S0b's plan** — the planner with the leaf switched off (`beforeS1`),
// proved byte for byte against the post-tower recording by `qa-7d5b-post-tower-recorded`. Each room's
// difference is named by that file's classifier (`dishwasherChangeBetween`), which generates S1's
// allowed plan from S0b's and compares it whole, so "nothing else moved" is a room-by-room statement
// and not an aggregate. The arms are read off the live plan independently of the classifier: which
// wall the dishwasher shares with the sink, and whether a pan drawer carries the preparation role.
// Every invariant is a per-room list asserted empty.
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  generateKitchen,
  isComposedStorageSlot,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  type DesignRoom,
  type DesignWall,
  type GenerationRun,
  type GenerationStep,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
} from "../../src/index.js";
import { withTheDishwasherBesideTheSink } from "../../src/generation/dishwasher-beside-the-sink.js";
import { canonicalPlan } from "../support/composed-run-baseline.js";
import { beforeS1 } from "../support/composition-context-capture.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import {
  dishwasherChangeBetween,
  type DishwasherChange,
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
const OCCURRED_AT = "2026-09-21T12:00:00.000Z";
const DISHWASHER_BODY = "base-dishwasher";

function roomOf(widthMm: number, depthMm: number): DesignRoom {
  return { shape: "L", widthMm, depthMm, heightMm: WITNESS_CEILING_MM };
}

function planFor(widthMm: number, depthMm: number): KitchenCompositionPlan {
  const room = roomOf(widthMm, depthMm);
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

/** A wall's modules corner outward as `id/role/body [start, end]`. A module the storage run composed
 *  reads `slot` — reached through the predicate, so this file spells no composed id (7D4 criterion
 *  22) — and every other module its own id. */
function wallAsBuilt(
  plan: KitchenCompositionPlan,
  wall: DesignWall,
): readonly string[] {
  return plan.bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm)
    .map(
      (base) =>
        `${isComposedStorageSlot(base) ? "slot" : base.id}/${base.role}/${base.buildId} [${String(base.startMm)}, ${String(base.endMm)}]`,
    );
}

function dishwashersIn(plan: KitchenCompositionPlan) {
  return plan.bases.filter((base) => base.buildId === DISHWASHER_BODY);
}

function generatedSteps(widthMm: number, depthMm: number) {
  const result = generateKitchen({
    room: roomOf(widthMm, depthMm),
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  if (!result.ok)
    throw new Error(`${String(widthMm)} x ${String(depthMm)} was refused`);
  return result.log.steps;
}

function stepFor(steps: readonly GenerationStep[], id: string): GenerationStep {
  const step = steps.find((candidate) => candidate.id === id);
  if (step === undefined) throw new Error(`no step ${id}`);
  return step;
}

describe("M1 — a plain door cabinet beside the sink becomes the dishwasher, and nothing moves", () => {
  it("converts the door cabinet on the sink's own wall (2100 x 2200)", () => {
    const plan = planFor(2100, 2200);

    expect(wallAsBuilt(plan, "A")).toEqual([
      "dishwasher/storage/base-dishwasher [900, 1500]",
      "sink/sink/base-sink [1500, 2100]",
    ]);
    expect(wallAsBuilt(plan, "B")).toEqual([
      "preparation/preparation/base-3drawer [900, 1500]",
      "hob/hob/base-hob-oven [1500, 2100]",
    ]);
  });

  it("converts the door cabinet facing the sink across the corner (1500 x 2800)", () => {
    const plan = planFor(1500, 2800);

    expect(wallAsBuilt(plan, "A")).toEqual([
      "dishwasher/storage/base-dishwasher [900, 1500]",
    ]);
    expect(wallAsBuilt(plan, "B")).toEqual([
      "sink/sink/base-sink [900, 1500]",
      "preparation/preparation/base-3drawer [1500, 2100]",
      "hob/hob/base-hob-oven [2100, 2700]",
    ]);
    expect(plan.dropped).toEqual(["fridge"]);
  });

  it("converts across the corner in the reference room and leaves the other door cabinet a composed slot (3560 x 2920)", () => {
    const plan = planFor(3560, 2920);

    expect(wallAsBuilt(plan, "A")).toEqual([
      "sink/sink/base-sink [900, 1500]",
      "preparation/preparation/base-3drawer [1500, 2100]",
      "hob/hob/base-hob-2drawer [2100, 2700]",
      "column:A:0/storage/tall-oven-tower [2700, 3300]",
    ]);
    expect(wallAsBuilt(plan, "B")).toEqual([
      "dishwasher/storage/base-dishwasher [900, 1500]",
      "slot/storage/base-cabinet [1500, 2100]",
      "fridge/fridge/fridge-free [2100, 2800]",
    ]);
    expect(plan.remainderMm).toEqual({ A: 260, B: 20 });
  });

  it("builds the merge room's dishwasher at 600 mm with no set_width (1510 x 2800)", () => {
    const steps = generatedSteps(1510, 2800);
    const dishwasher = stepFor(steps, "dishwasher");

    expect(dishwasher.status).toBe("placed");
    expect(dishwasher.buildId).toBe("base-dishwasher");
    expect(dishwasher.commands.map((command) => command.type)).toEqual([
      "insert_body",
    ]);
  });
});

describe("M7(e) — with no door cabinet free, the preparation 3-drawer beside the sink gives way", () => {
  it("reads sink · dishwasher · pan-drawer cabinet · hob, the preparation role on the pan drawer (900 x 3400)", () => {
    const plan = planFor(900, 3400);

    expect(wallAsBuilt(plan, "A")).toEqual([]);
    expect(wallAsBuilt(plan, "B")).toEqual([
      "sink/sink/base-sink [900, 1500]",
      "dishwasher/storage/base-dishwasher [1500, 2100]",
      "preparation/preparation/base-panbank [2100, 2700]",
      "hob/hob/base-hob-oven [2700, 3300]",
    ]);
    expect(plan.dropped).toEqual(["fridge"]);
  });

  it("places the preparation step, on the pan-drawer body, through generateKitchen (900 x 3400)", () => {
    const steps = generatedSteps(900, 3400);

    expect(stepFor(steps, "preparation")).toMatchObject({
      role: "preparation",
      buildId: "base-panbank",
      status: "placed",
    });
    expect(stepFor(steps, "dishwasher")).toMatchObject({
      role: "storage",
      buildId: "base-dishwasher",
      status: "placed",
    });
  });
});

describe("omission, not displacement", () => {
  it("leaves a door cabinet that is not beside the sink alone (1500 x 3500)", () => {
    const plan = planFor(1500, 3500);

    expect(dishwashersIn(plan)).toEqual([]);
    expect(wallAsBuilt(plan, "A")).toEqual([
      "slot/storage/base-cabinet [900, 1500]",
    ]);
    expect(wallAsBuilt(plan, "B")).toEqual([
      "fridge/fridge/fridge-free [900, 1600]",
      "sink/sink/base-sink [1600, 2200]",
      "preparation/preparation/base-3drawer [2200, 2800]",
      "hob/hob/base-hob-oven [2800, 3400]",
    ]);
  });

  it("never takes a lone drawer cabinet: the owner's nearest room keeps its 3-drawer and gets no dishwasher (4650 x 1000)", () => {
    const plan = planFor(4650, 1000);

    expect(dishwashersIn(plan)).toEqual([]);
    expect(wallAsBuilt(plan, "A")).toEqual([
      "fridge/fridge/fridge-free [900, 1600]",
      "sink/sink/base-sink [1600, 2200]",
      "preparation/preparation/base-3drawer [2200, 2800]",
      "hob/hob/base-hob-2drawer [2800, 3400]",
      "bottle/storage/base-bottle-cargo [3400, 3700]",
      "column:A:0/storage/tall-oven-tower [3700, 4300]",
    ]);
  });
});

describe("M2 — the dishwasher is decided before the threshold drawer, and D does not count it", () => {
  it("regains the outer pantry column where the converted door cabinet was the sixth plain cabinet (4600 x 5200)", () => {
    const plan = planFor(4600, 5200);

    expect(plan.bases.some((base) => base.id === "threshold-drawer")).toBe(
      false,
    );
    expect(wallAsBuilt(plan, "A")).toEqual([
      "dishwasher/storage/base-dishwasher [900, 1500]",
      "slot/storage/base-cabinet [1500, 2100]",
      "slot/storage/base-cabinet [2100, 2700]",
      "slot/storage/base-cabinet [2700, 3300]",
      "slot/storage/base-cabinet [3300, 3900]",
      "fridge/fridge/fridge-free [3900, 4600]",
    ]);
    expect(wallAsBuilt(plan, "B")).toEqual([
      "sink/sink/base-sink [900, 1500]",
      "preparation/preparation/base-3drawer [1500, 2100]",
      "pan-drawer/storage/base-panbank [2100, 2700]",
      "hob/hob/base-hob-2drawer [2700, 3300]",
      "column:B:0/storage/tall-oven-tower [3300, 3900]",
      "column:B:1/storage/tall-pantry [3900, 4500]",
      "column:B:2/storage/tall-pantry [4500, 5100]",
    ]);
  });
});

describe("the dishwasher's identity", () => {
  it("is not a composed storage slot, so D never counts it", () => {
    const [dishwasher] = dishwashersIn(planFor(1500, 2800));

    expect(dishwasher?.id).toBe("dishwasher");
    expect(isComposedStorageSlot({ id: "dishwasher" })).toBe(false);
  });

  it("is decided once: a plan that already holds a dishwasher is returned as it is", () => {
    const plan = planFor(3560, 2920);

    expect(withTheDishwasherBesideTheSink(plan)).toBe(plan);
  });
});

describe("the witnesses the plan names that the rules above do not reach", () => {
  it("swaps the preparation 3-drawer where three drawer cabinets stand, and two stay (6000 x 1700)", () => {
    const plan = planFor(6000, 1700);

    expect(wallAsBuilt(plan, "A").slice(0, 3)).toEqual([
      "sink/sink/base-sink [900, 1500]",
      "dishwasher/storage/base-dishwasher [1500, 2100]",
      "preparation/preparation/base-panbank [2100, 2700]",
    ]);
    expect(
      plan.bases
        .filter((base) =>
          ["base-3drawer", "base-panbank"].includes(base.buildId),
        )
        .map((base) => base.buildId),
    ).toEqual(["base-panbank", "base-3drawer"]);
  });

  it("brings the bottle back where the threshold drawer had taken its place (4600 x 5800)", () => {
    const plan = planFor(4600, 5800);

    expect(wallAsBuilt(plan, "B").slice(3)).toEqual([
      "hob/hob/base-hob-2drawer [2700, 3300]",
      "bottle/storage/base-bottle-cargo [3300, 3600]",
      "column:B:0/storage/tall-oven-tower [3600, 4200]",
      "column:B:1/storage/tall-pantry [4200, 4800]",
      "column:B:2/storage/tall-pantry [4800, 5400]",
    ]);
    expect(plan.remainderMm.B).toBe(300);
  });
});

// ---------------------------------------------------------------------------------------------
// QA's census: every placed room, S1 against S0b.
// ---------------------------------------------------------------------------------------------

const CEILINGS_MM = [2200, 2600, 3900] as const;
const GRID_STEP_MM = 10;
const SWEEP_TIMEOUT_MS = 180_000;
const PAN_DRAWER_BODY = "base-panbank";
const DRAWER_CABINET_BODIES: ReadonlySet<string> = new Set([
  "base-3drawer",
  PAN_DRAWER_BODY,
]);
const OVEN_BODIES: ReadonlySet<string> = new Set([
  "base-hob-oven",
  "tall-oven-tower",
]);
/** *D*, as Q-H5 counts it: the composed slots and the two drawer modules astride the hob. */
const DRAWER_MODULE_IDS: ReadonlySet<string> = new Set([
  "pan-drawer",
  "threshold-drawer",
]);
const OWNERS_PLAIN_CABINET_COUNT = 6;
const OWNERS_DRAWER_COUNT = 2;
const ONE_MODULE_MM = 600;
const MERGE_REMAINDER_MAX_MM = 200;

interface DishwasherCensus {
  swept: number;
  placed: number;
  totals: {
    dishwashers: number;
    thresholdDrawers: number;
    bottles: number;
    tallColumns: number;
    ovenTowerRooms: number;
    panDrawerBodies: number;
    panDrawerBodiesInThePreparationRole: number;
  };
  /** Each room's change against S0b's plan, named by the classifier. */
  byChange: Partial<Record<DishwasherChange, number>>;
  /** Read off the live plan alone: M1's two arms, and (e) by the drawer cabinets S0b's plan stood. */
  byArm: Record<string, number>;
  /** E4: an M1 dishwasher last on its wall, by the bare wall after it. */
  m1AtTheFreeEnd: { mergeRemainder: number; noRemainder: number };
  /** M2's bottle-back rooms, by how much the bottle's wall's remainder grew. */
  bottleBackRemainderGainMm: Record<number, number>;
  invariants: Record<InvariantName, string[]>;
}

type InvariantName =
  | "refusedDifferentlyThanS0b"
  | "changedOtherwise"
  | "changedWithoutADishwasher"
  | "moreThanOneDishwasher"
  | "dishwasherNotBesideTheSink"
  | "dishwasherNotItsOwnIdentity"
  | "dishwasherCountedInD"
  | "preparationOnADishwasher"
  | "preparationAbsentButNotDropped"
  | "droppedChanged"
  | "swapWithoutThePreparationDirectlyBeyond"
  | "aDrawerCabinetStoodAndNoneIsLeft"
  | "thresholdDrawerGained"
  | "ovensOtherThanOne"
  | "remainderOfAModuleOrMore"
  | "dOfSixShortOfDrawers";

describe("7D5b S1 — QA's census over the approved L rectangle, 10 mm, at 2200, 2600 and 3900 mm", () => {
  const censusByCeiling = new Map<number, DishwasherCensus>();

  beforeAll(() => {
    for (const ceilingMm of CEILINGS_MM) {
      censusByCeiling.set(ceilingMm, dishwasherCensusAt(ceilingMm));
    }
  }, SWEEP_TIMEOUT_MS);

  function censusAt(ceilingMm: number): DishwasherCensus {
    const census = censusByCeiling.get(ceilingMm);
    if (!census) throw new Error(`no census at ${String(ceilingMm)} mm`);
    return census;
  }

  it.each(CEILINGS_MM)(
    "at %i mm, 165 421 dishwashers, 5 725 threshold drawers, 176 291 bottles, 396 028 columns and 167 286 oven-tower rooms",
    (ceilingMm) => {
      const { swept, placed, totals } = censusAt(ceilingMm);

      expect({ swept, placed, totals }).toEqual({
        swept: 256_011,
        placed: 245_211,
        totals: {
          dishwashers: 165_421,
          thresholdDrawers: 5_725,
          bottles: 176_291,
          tallColumns: 396_028,
          ovenTowerRooms: 167_286,
          panDrawerBodies: 92_446,
          panDrawerBodiesInThePreparationRole: 24_160,
        },
      });
    },
  );

  // The M2 rooms carry their own class, so M1's across-the-corner class is its 140 206 less the 10 070
  // re-planned rooms; every re-planned room is an across-the-corner M1 room (see the arms below).
  it.each(CEILINGS_MM)(
    "at %i mm, every room differs from S0b's by one of S1's changes or not at all: 79 790 unchanged, 10 070 re-planned — 7 010 with a column back and 3 060 with the bottle back",
    (ceilingMm) => {
      expect(censusAt(ceilingMm).byChange).toEqual({
        unchanged: 79_790,
        "M1: a door cabinet on the sink's wall converted": 1_055,
        "M1: a door cabinet across the corner converted": 130_136,
        "(e): the preparation 3-drawer converted, its role onto the pan drawer": 24_160,
        "M2: the threshold drawer gone, one more column": 7_010,
        "M2: the threshold drawer gone, the bottle back": 3_060,
      });
    },
  );

  it.each(CEILINGS_MM)(
    "at %i mm, M1 converts 1 055 on the sink's wall and 140 206 across the corner; (e) swaps in 24 100 rooms with two drawer cabinets and 60 with three",
    (ceilingMm) => {
      expect(censusAt(ceilingMm).byArm).toEqual({
        "M1, on the sink's wall": 1_055,
        "M1, across the corner": 140_206,
        "(e), of 2 drawer cabinets": 24_100,
        "(e), of 3 drawer cabinets": 60,
      });
    },
  );

  it.each(CEILINGS_MM)(
    "at %i mm, an M1 dishwasher is last on its wall in 1 400 rooms: 1 260 beside 1-200 mm bare, 140 flush",
    (ceilingMm) => {
      expect(censusAt(ceilingMm).m1AtTheFreeEnd).toEqual({
        mergeRemainder: 1_260,
        noRemainder: 140,
      });
    },
  );

  // Criterion 3 Part B reads *"the bottle is back with the suffix remainder +300 mm"*. That holds in 660
  // of the 3 060. In the other 2 400, S0b's outer pantry had merged 10-200 mm of bare wall; with the
  // block 300 mm further in, 300 mm plus that no longer fits the 800 mm door-column ceiling, so the block
  // stands at declared widths and the whole 310-500 mm is bare (ADR 0110 E6.2) — under A4's 600 mm.
  it.each(CEILINGS_MM)(
    "at %i mm, the bottle-back re-plan grows its wall's remainder by 300 mm in 660 rooms, and by 310-500 mm in 2 400 where the outer pantry had merged the bare wall",
    (ceilingMm) => {
      expect(censusAt(ceilingMm).bottleBackRemainderGainMm).toEqual(
        BOTTLE_BACK_REMAINDER_GAIN_MM,
      );
    },
  );

  it.each(CEILINGS_MM)(
    "at %i mm, no room breaks any of S1's invariants",
    (ceilingMm) => {
      expect(censusAt(ceilingMm).invariants).toEqual(noInvariantBroken());
    },
  );
});

/** 660 rooms at +300 mm; then 120 rooms at each 10 mm step from +310 to +500 mm (the 10-200 mm the
 *  outer pantry had merged, plus the bottle's 300). */
const BOTTLE_BACK_REMAINDER_GAIN_MM: Record<number, number> = {
  300: 660,
  ...Object.fromEntries(
    Array.from({ length: 20 }, (_, step) => [310 + step * 10, 120]),
  ),
};

function dishwasherCensusAt(ceilingMm: number): DishwasherCensus {
  const census = emptyDishwasherCensus();
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
  readonly runs: Readonly<Record<DesignWall, GenerationRun>>;
  readonly afterS0b: KitchenCompositionPlan;
  readonly live: KitchenCompositionPlan;
}

function countTheRoom(census: DishwasherCensus, room: DesignRoom): void {
  const runs = lShellFloorRuns(room);
  const compose = () =>
    planKitchenComposition({ room, runs, columns: DECLARED_COLUMNS });
  const compared: ComparedRoom = {
    where: `${String(room.widthMm)}x${String(room.depthMm)}`,
    runs,
    afterS0b: beforeS1(compose),
    live: compose(),
  };
  if (compared.live.minimumMet !== compared.afterS0b.minimumMet) {
    census.invariants.refusedDifferentlyThanS0b.push(compared.where);
  }
  if (!compared.live.minimumMet) return;
  census.placed += 1;
  addTotals(census, compared.live);
  const change = countTheChange(census, compared);
  countTheArm(census, compared);
  if (change === "M2: the threshold drawer gone, the bottle back") {
    countTheBottleBack(census, compared);
  }
  checkTheInvariants(census, compared);
}

function countTheChange(
  census: DishwasherCensus,
  compared: ComparedRoom,
): DishwasherChange {
  const change = dishwasherChangeBetween({
    before: canonicalPlan(compared.afterS0b),
    after: canonicalPlan(compared.live),
    cornerEndMm: { A: compared.runs.A.startMm, B: compared.runs.B.startMm },
  });
  census.byChange[change] = (census.byChange[change] ?? 0) + 1;
  if (change === "changed otherwise") {
    census.invariants.changedOtherwise.push(compared.where);
  }
  return change;
}

/** Read off the live plan, not the classifier: (e) where a pan drawer carries the preparation role,
 *  M1 otherwise, split by where the dishwasher stands against the sink. */
function countTheArm(census: DishwasherCensus, compared: ComparedRoom): void {
  const { live, afterS0b, runs } = compared;
  const [dishwasher] = dishwashersIn(live);
  if (dishwasher === undefined) return;
  const isSwap = live.bases.some(
    (base) => base.buildId === PAN_DRAWER_BODY && base.role === "preparation",
  );
  const arm = isSwap
    ? `(e), of ${String(drawerCabinetsOf(afterS0b).length)} drawer cabinets`
    : isOnTheSinksWall(live, dishwasher)
      ? "M1, on the sink's wall"
      : "M1, across the corner";
  census.byArm[arm] = (census.byArm[arm] ?? 0) + 1;
  if (!isSwap && isLastOnItsWall(live, dishwasher)) {
    const remainderMm = live.remainderMm[dishwasher.wall];
    if (remainderMm === 0) census.m1AtTheFreeEnd.noRemainder += 1;
    else if (remainderMm <= MERGE_REMAINDER_MAX_MM) {
      census.m1AtTheFreeEnd.mergeRemainder += 1;
    }
  }
  if (
    !isOnTheSinksWall(live, dishwasher) &&
    !facesTheSinkAcrossTheCorner(live, { dishwasher, runs })
  ) {
    census.invariants.dishwasherNotBesideTheSink.push(compared.where);
  }
}

function countTheBottleBack(
  census: DishwasherCensus,
  compared: ComparedRoom,
): void {
  const bottle = compared.live.bases.find(
    (base) => base.buildId === "base-bottle-cargo",
  );
  if (bottle === undefined) return;
  const gainMm =
    compared.live.remainderMm[bottle.wall] -
    compared.afterS0b.remainderMm[bottle.wall];
  census.bottleBackRemainderGainMm[gainMm] =
    (census.bottleBackRemainderGainMm[gainMm] ?? 0) + 1;
}

function checkTheInvariants(
  census: DishwasherCensus,
  compared: ComparedRoom,
): void {
  const { where, live, afterS0b } = compared;
  const broken = census.invariants;
  const dishwashers = dishwashersIn(live);
  const flag = (name: InvariantName, isBroken: boolean) => {
    if (isBroken) broken[name].push(where);
  };
  flag(
    "changedWithoutADishwasher",
    dishwashers.length === 0 && canonicalPlan(live) !== canonicalPlan(afterS0b),
  );
  flag("moreThanOneDishwasher", dishwashers.length > 1);
  flag(
    "dishwasherNotItsOwnIdentity",
    dishwashers.some(isNotTheOwnersDishwasher),
  );
  flag("dishwasherCountedInD", dishwashers.some(isInD));
  flag(
    "preparationOnADishwasher",
    live.bases.some(
      (base) => base.role === "preparation" && base.buildId === DISHWASHER_BODY,
    ),
  );
  flag(
    "preparationAbsentButNotDropped",
    !live.bases.some((base) => base.role === "preparation") &&
      !live.dropped.includes("preparation"),
  );
  flag("droppedChanged", live.dropped.join() !== afterS0b.dropped.join());
  flag(
    "swapWithoutThePreparationDirectlyBeyond",
    isASwapWithoutItsPreparation(live),
  );
  flag(
    "aDrawerCabinetStoodAndNoneIsLeft",
    drawerCabinetsOf(afterS0b).length > 0 &&
      drawerCabinetsOf(live).length === 0,
  );
  flag(
    "thresholdDrawerGained",
    hasThresholdDrawer(live) && !hasThresholdDrawer(afterS0b),
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
}

/** (e)'s model: a `preparation` on `base-panbank` abutting the dishwasher on its wall, on the side away
 *  from the sink. Checked wherever the preparation role stands on a pan drawer. */
function isASwapWithoutItsPreparation(plan: KitchenCompositionPlan): boolean {
  const preparation = plan.bases.find((base) => base.role === "preparation");
  if (preparation?.buildId !== PAN_DRAWER_BODY) return false;
  const [dishwasher] = dishwashersIn(plan);
  const sink = plan.bases.find((base) => base.role === "sink");
  if (dishwasher === undefined || sink === undefined) return true;
  const isBeyond =
    preparation.wall === dishwasher.wall &&
    (sink.wall !== dishwasher.wall || sink.endMm === dishwasher.startMm
      ? preparation.startMm === dishwasher.endMm
      : preparation.endMm === dishwasher.startMm);
  return !isBeyond;
}

function isNotTheOwnersDishwasher(base: PlannedGenerationBase): boolean {
  return (
    base.id !== "dishwasher" || base.role !== "storage" || base.widthMm !== 600
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

function isOnTheSinksWall(
  plan: KitchenCompositionPlan,
  dishwasher: PlannedGenerationBase,
): boolean {
  const sink = plan.bases.find((base) => base.role === "sink");
  return (
    sink !== undefined &&
    sink.wall === dishwasher.wall &&
    (sink.endMm === dishwasher.startMm || sink.startMm === dishwasher.endMm)
  );
}

/** Both at their own wall's corner end, read from the room's floor runs, never from the modules. */
function facesTheSinkAcrossTheCorner(
  plan: KitchenCompositionPlan,
  where: {
    readonly dishwasher: PlannedGenerationBase;
    readonly runs: Readonly<Record<DesignWall, GenerationRun>>;
  },
): boolean {
  const { dishwasher, runs } = where;
  const sink = plan.bases.find((base) => base.role === "sink");
  return (
    sink !== undefined &&
    sink.wall !== dishwasher.wall &&
    sink.startMm === runs[sink.wall].startMm &&
    dishwasher.startMm === runs[dishwasher.wall].startMm
  );
}

function isLastOnItsWall(
  plan: KitchenCompositionPlan,
  module: PlannedGenerationBase,
): boolean {
  return !plan.bases.some(
    (base) => base.wall === module.wall && base.startMm >= module.endMm,
  );
}

function drawerCabinetsOf(
  plan: KitchenCompositionPlan,
): readonly PlannedGenerationBase[] {
  return plan.bases.filter((base) => DRAWER_CABINET_BODIES.has(base.buildId));
}

function hasThresholdDrawer(plan: KitchenCompositionPlan): boolean {
  return plan.bases.some((base) => base.id === "threshold-drawer");
}

function addTotals(
  census: DishwasherCensus,
  plan: KitchenCompositionPlan,
): void {
  const { totals } = census;
  const countOf = (isCounted: (base: PlannedGenerationBase) => boolean) =>
    plan.bases.filter(isCounted).length;
  totals.dishwashers += dishwashersIn(plan).length > 0 ? 1 : 0;
  totals.thresholdDrawers += countOf((base) => base.id === "threshold-drawer");
  totals.bottles +=
    countOf((base) => base.buildId === "base-bottle-cargo") > 0 ? 1 : 0;
  totals.tallColumns += countOf((base) => base.buildId.startsWith("tall-"));
  totals.ovenTowerRooms +=
    countOf((base) => base.buildId === "tall-oven-tower") > 0 ? 1 : 0;
  totals.panDrawerBodies += countOf((base) => base.buildId === PAN_DRAWER_BODY);
  totals.panDrawerBodiesInThePreparationRole += countOf(
    (base) => base.buildId === PAN_DRAWER_BODY && base.role === "preparation",
  );
}

function noInvariantBroken(): Record<InvariantName, string[]> {
  return {
    refusedDifferentlyThanS0b: [],
    changedOtherwise: [],
    changedWithoutADishwasher: [],
    moreThanOneDishwasher: [],
    dishwasherNotBesideTheSink: [],
    dishwasherNotItsOwnIdentity: [],
    dishwasherCountedInD: [],
    preparationOnADishwasher: [],
    preparationAbsentButNotDropped: [],
    droppedChanged: [],
    swapWithoutThePreparationDirectlyBeyond: [],
    aDrawerCabinetStoodAndNoneIsLeft: [],
    thresholdDrawerGained: [],
    ovensOtherThanOne: [],
    remainderOfAModuleOrMore: [],
    dOfSixShortOfDrawers: [],
  };
}

function emptyDishwasherCensus(): DishwasherCensus {
  return {
    swept: 0,
    placed: 0,
    totals: {
      dishwashers: 0,
      thresholdDrawers: 0,
      bottles: 0,
      tallColumns: 0,
      ovenTowerRooms: 0,
      panDrawerBodies: 0,
      panDrawerBodiesInThePreparationRole: 0,
    },
    byChange: {},
    byArm: {},
    m1AtTheFreeEnd: { mergeRemainder: 0, noRemainder: 0 },
    bottleBackRemainderGainMm: {},
    invariants: noInvariantBroken(),
  };
}
