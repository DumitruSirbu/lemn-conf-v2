// Catalogue ids are literals, not the domain's constants, so a wrong constant and a wrong composer cannot agree
// (ADR 0121 decision 3(b)). *D*, the plain-cabinet count of ADR 0110 Q-H5, is re-derived here from ids.
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  isComposedStorageSlot,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  wallLengthMm,
  type DesignRoom,
  type DesignWall,
  type GenerationRun,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
} from "../../src/index.js";
import { planTallEndBlock } from "../../src/generation/tall-end-rule.js";

// `DesignWall` includes "C" (ADR 0132), but this suite declares the two-wall runs `planKitchenComposition` reads.
type TwoWallDispatch = Extract<DesignWall, "A" | "B">;

const DECLARED_COLUMNS = declaredColumnSizes(
  buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN)),
);
const THRESHOLD_DRAWER_ID = "threshold-drawer";
const PAN_DRAWER_ID = "pan-drawer";
const BOTTLE_ID = "bottle";
const THREE_DRAWER_BODY = "base-3drawer";
const THRESHOLD_DRAWER_WIDTH_MM = 600;
const PAN_DRAWER_BODY = "base-panbank";
const DISHWASHER_BODY = "base-dishwasher";
const BOTTLE_BODY = "base-bottle-cargo";
const OWNERS_PLAIN_CABINET_THRESHOLD = 6;
const OWNERS_DRAWER_COUNT = 2;
const SWEEP_STEP_MM = 50;
const BOTTLE_WIDTH_MM = 300;
const DECLARED_SWEEP_STEP_MM = 50;
const DECLARED_SWEEP_MAX_MM = 8000;

function roomOf(widthMm: number, depthMm: number): DesignRoom {
  return { shape: "L", widthMm, depthMm, heightMm: 2600 };
}

function planFor(room: DesignRoom): KitchenCompositionPlan {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

/** The wider entered wall reads last, and the narrower one is read in reverse (ADR 0120 E). */
function readingWallsOf(room: DesignRoom): {
  readonly prefix: DesignWall;
  readonly suffix: DesignWall;
} {
  const isWallBWider = wallLengthMm("B", room) > wallLengthMm("A", room);
  return isWallBWider
    ? { prefix: "A", suffix: "B" }
    : { prefix: "B", suffix: "A" };
}

function alongTheWall(
  plan: KitchenCompositionPlan,
  wall: DesignWall,
): readonly PlannedGenerationBase[] {
  return plan.bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm);
}

function inReadingOrder(
  plan: KitchenCompositionPlan,
): readonly PlannedGenerationBase[] {
  const { prefix, suffix } = readingWallsOf(plan.room);
  return [
    ...[...alongTheWall(plan, prefix)].reverse(),
    ...alongTheWall(plan, suffix),
  ];
}

/** The bodies read from the sink to the last non-column module after the hob. */
function sinkToHobGroup(plan: KitchenCompositionPlan): readonly string[] {
  const reading = inReadingOrder(plan);
  const sinkAt = reading.findIndex((base) => base.role === "sink");
  return reading
    .slice(sinkAt)
    .filter(
      (base) => !base.id.startsWith("column:") && !isComposedStorageSlot(base),
    )
    .map((base) => base.buildId);
}

function tallColumnsOf(plan: KitchenCompositionPlan): readonly string[] {
  return plan.bases
    .filter((base) => base.id.startsWith("column:"))
    .map((base) => base.buildId);
}

function hasModule(plan: KitchenCompositionPlan, id: string): boolean {
  return plan.bases.some((base) => base.id === id);
}

/** *D* before the rule: composed slots plus the pan drawer, excluding the threshold drawer itself. */
function plainCabinetsBeforeTheRule(
  plan: KitchenCompositionPlan,
): readonly PlannedGenerationBase[] {
  return plan.bases.filter(
    (base) => isComposedStorageSlot(base) || base.id === PAN_DRAWER_ID,
  );
}

function drawersAmong(cabinets: readonly PlannedGenerationBase[]): number {
  return cabinets.filter(
    (base) =>
      base.buildId === THREE_DRAWER_BODY || base.buildId === PAN_DRAWER_BODY,
  ).length;
}

describe("7D5 S3 — the threshold drawer: the bottle gives way before a tall column", () => {
  // *D* still reaches six with the dishwasher standing (ADR 0110 M1/M2/M9): the bottle's place, three columns.
  it.each([
    { name: "wall B wider", room: roomOf(5200, 5800) },
    { name: "wall A wider", room: roomOf(5700, 5300) },
  ])(
    "reads hob, then the drawer where the bottle stood, and keeps three columns, $name",
    ({ room }) => {
      const plan = planFor(room);

      expect(sinkToHobGroup(plan)).toEqual([
        "base-sink",
        THREE_DRAWER_BODY,
        PAN_DRAWER_BODY,
        "base-hob-2drawer",
        THREE_DRAWER_BODY,
      ]);
      expect(hasModule(plan, BOTTLE_ID)).toBe(false);
      expect(tallColumnsOf(plan)).toEqual([
        "tall-oven-tower",
        "tall-pantry",
        "tall-pantry",
      ]);
    },
  );

  it.each([
    { name: "wall B wider", room: roomOf(5200, 5800) },
    { name: "wall A wider", room: roomOf(5700, 5300) },
  ])(
    "stands on the hob's wall under its own id, which is not a composed storage slot, $name",
    ({ room }) => {
      const plan = planFor(room);
      const drawer = plan.bases.find((base) => base.id === THRESHOLD_DRAWER_ID);
      const hob = plan.bases.find((base) => base.role === "hob");

      expect(drawer).toMatchObject({
        role: "storage",
        buildId: THREE_DRAWER_BODY,
        widthMm: 600,
      });
      expect(drawer?.wall).toBe(hob?.wall);
      expect(drawer && isComposedStorageSlot(drawer)).toBe(false);
    },
  );
});

describe("7D5 S3 — the threshold drawer: where the bottle giving way is not enough, one column goes", () => {
  // *D* reaches six even with the dishwasher out of it (ADR 0110 M1/M2/M9).
  it.each([
    { name: "wall B wider", room: roomOf(5200, 5250) },
    { name: "wall A wider", room: roomOf(5350, 5300) },
  ])(
    "reads the drawer after the hob and keeps two of three columns, $name",
    ({ room }) => {
      const plan = planFor(room);

      expect(sinkToHobGroup(plan)).toEqual([
        "base-sink",
        THREE_DRAWER_BODY,
        PAN_DRAWER_BODY,
        "base-hob-2drawer",
        THREE_DRAWER_BODY,
      ]);
      expect(tallColumnsOf(plan)).toEqual(["tall-oven-tower", "tall-pantry"]);
    },
  );

  // Five door cabinets and the pan drawer are still six with the dishwasher standing (ADR 0110 M1/M2/M9).
  it.each([
    { name: "wall A wider, 5400 x 5300", room: roomOf(5400, 5300) },
    { name: "wall B wider, 5200 x 5500", room: roomOf(5200, 5500) },
  ])(
    "keeps the bottle where the drawer costs the same column without it, reading hob, bottle, drawer, $name",
    ({ room }) => {
      const plan = planFor(room);

      expect(sinkToHobGroup(plan)).toEqual([
        "base-sink",
        THREE_DRAWER_BODY,
        PAN_DRAWER_BODY,
        "base-hob-2drawer",
        BOTTLE_BODY,
        THREE_DRAWER_BODY,
      ]);
      expect(tallColumnsOf(plan)).toEqual(["tall-oven-tower", "tall-pantry"]);
      expect(drawersAmong(plainCabinetsBeforeTheRule(plan))).toBe(1);
    },
  );
});

describe("7D5 S3 — no threshold drawer outside the owner's threshold", () => {
  // Both rooms are *D* = 5 with the dishwasher decided first; counted with the door cabinet the dishwasher took,
  // *D* would be six (ADR 0110 M1/M2/M9).
  it.each([
    { name: "wall B wider", room: roomOf(4600, 5200) },
    { name: "wall A wider", room: roomOf(5200, 4700) },
  ])("adds none at D = 5, $name", ({ room }) => {
    const plan = planFor(room);
    const plainCabinets = plainCabinetsBeforeTheRule(plan);
    const dishwasher = plan.bases.find(
      (base) => base.buildId === DISHWASHER_BODY,
    );

    expect(plainCabinets).toHaveLength(5);
    expect(dishwasher).toMatchObject({ id: "dishwasher", widthMm: 600 });
    expect(dishwasher && isComposedStorageSlot(dishwasher)).toBe(false);
    expect(plainCabinets.length + 1).toBe(OWNERS_PLAIN_CABINET_THRESHOLD);
    expect(drawersAmong(plainCabinets)).toBeLessThan(OWNERS_DRAWER_COUNT);
    expect(hasModule(plan, THRESHOLD_DRAWER_ID)).toBe(false);
  });

  // 6000 x 4700 is the first wall B at which the two-slot class reaches six with the dishwasher out of it.
  it("adds none where D = 6 already has two drawers, 6000 x 4700", () => {
    const plan = planFor(roomOf(6000, 4700));
    const plainCabinets = plainCabinetsBeforeTheRule(plan);

    expect(plainCabinets).toHaveLength(6);
    expect(drawersAmong(plainCabinets)).toBe(2);
    expect(hasModule(plan, THRESHOLD_DRAWER_ID)).toBe(false);
  });
});

/** Runs declared along each wall from its corner, decoupled from the room's entered lengths. */
function planForDeclaredRuns(
  room: DesignRoom,
  runLengthsMm: { readonly A: number; readonly B: number },
): KitchenCompositionPlan {
  const runOf = (wall: TwoWallDispatch): GenerationRun => ({
    wall,
    startMm: 0,
    endMm: runLengthsMm[wall],
  });
  return planKitchenComposition({
    room,
    runs: { A: runOf("A"), B: runOf("B") },
    columns: DECLARED_COLUMNS,
  });
}

// ADR 0110 L2/L3 on declared runs: the approved policy never reaches the third candidate (the drawer in the
// bottle's place for one column), so its witnesses are declared runs in a 6000 x 5000 x 2200 room, where wall A
// is wider and so carries the hob and the block.
//
// Wall B's run is 4900 mm, which keeps *D* at six with the dishwasher out of it (ADR 0110 M1/M2/M9).
//
// L3's one-column limit refuses no drawer on its own; its only effect is the choice between the owner's second
// and third candidates, which the 3350 pair below pins. The declared-run sweep pins the no-refusal half.
describe("7D5 S3 — the threshold drawer on declared runs: at most one tall column, and the bottle gives way for it", () => {
  const room: DesignRoom = {
    shape: "L",
    widthMm: 6000,
    depthMm: 5000,
    heightMm: 2200,
  };
  const prefixRunMm = 4900;

  /** The hob's wall's core and pan drawer — the items every candidate keeps — measured off the plan. */
  function fixedRunOnTheHobsWallMm(plan: KitchenCompositionPlan): number {
    const hob = plan.bases.find((base) => base.role === "hob");
    return plan.bases
      .filter(
        (base) =>
          base.wall === hob?.wall &&
          !base.id.startsWith("column:") &&
          !isComposedStorageSlot(base) &&
          base.id !== BOTTLE_ID &&
          base.id !== THRESHOLD_DRAWER_ID,
      )
      .reduce((sum, base) => sum + base.widthMm, 0);
  }

  /** How many columns `planTallEndBlock` stands on a free end of this length, in a whole-core kitchen. */
  function columnsOnAFreeEnd(freeMm: number): number {
    return planTallEndBlock({
      coreSurvivedWhole: true,
      hobStandsOnTheFreeEndWall: true,
      freeEndStorageCount: Math.floor(freeMm / THRESHOLD_DRAWER_WIDTH_MM),
      freeEndRemainderMm: freeMm % THRESHOLD_DRAWER_WIDTH_MM,
      roomHeightMm: room.heightMm,
      hobWithItsOwnOvenBuildId: "base-hob-oven",
      declared: DECLARED_COLUMNS,
    }).columns.length;
  }

  /** The block the decided kitchen had, and the block each of the owner's candidates would leave. */
  function candidateBlocks(hobWallRunMm: number, fixedMm: number) {
    const withTheBottleMm = hobWallRunMm - fixedMm - BOTTLE_WIDTH_MM;
    return {
      decided: columnsOnAFreeEnd(withTheBottleMm),
      afterTheBottle: columnsOnAFreeEnd(
        withTheBottleMm - THRESHOLD_DRAWER_WIDTH_MM,
      ),
      inTheBottlesPlace: columnsOnAFreeEnd(
        hobWallRunMm - fixedMm - THRESHOLD_DRAWER_WIDTH_MM,
      ),
    };
  }

  it("stands the drawer in the bottle's place for one column where keeping the bottle would cost both, runs A 3350 / B 4900", () => {
    const plan = planForDeclaredRuns(room, { A: 3350, B: prefixRunMm });
    const plainCabinets = plainCabinetsBeforeTheRule(plan);

    expect(plainCabinets).toHaveLength(OWNERS_PLAIN_CABINET_THRESHOLD);
    expect(drawersAmong(plainCabinets)).toBe(0);
    expect(sinkToHobGroup(plan)).toEqual([
      "base-sink",
      THREE_DRAWER_BODY,
      "base-hob-2drawer",
      THREE_DRAWER_BODY,
    ]);
    expect(hasModule(plan, THRESHOLD_DRAWER_ID)).toBe(true);
    expect(hasModule(plan, BOTTLE_ID)).toBe(false);
    expect(tallColumnsOf(plan)).toEqual(["tall-oven-tower"]);
  });

  // Witness of the limit: the drawer after the bottle costs both columns and the drawer in the bottle's place
  // costs one, so only a limit of two would let the former stand.
  it("is L3's choice there: after the bottle costs two columns, the bottle's place one, and neither is free", () => {
    const hobWallRunMm = 3350;
    const plan = planForDeclaredRuns(room, { A: hobWallRunMm, B: prefixRunMm });
    const fixedMm = fixedRunOnTheHobsWallMm(plan);

    expect(plan.bases.find((base) => base.role === "hob")?.wall).toBe("A");
    expect(fixedMm).toBe(1800);
    expect(candidateBlocks(hobWallRunMm, fixedMm)).toEqual({
      decided: 2,
      afterTheBottle: 0,
      inTheBottlesPlace: 1,
    });
  });

  it("keeps the bottle and stands the drawer after it where that costs a single column, runs A 3300 / B 4900", () => {
    const hobWallRunMm = 3300;
    const plan = planForDeclaredRuns(room, { A: hobWallRunMm, B: prefixRunMm });

    expect(
      candidateBlocks(hobWallRunMm, fixedRunOnTheHobsWallMm(plan)),
    ).toEqual({ decided: 2, afterTheBottle: 1, inTheBottlesPlace: 1 });
    expect(sinkToHobGroup(plan)).toEqual([
      "base-sink",
      THREE_DRAWER_BODY,
      "base-hob-2drawer",
      BOTTLE_BODY,
      THREE_DRAWER_BODY,
    ]);
    expect(hasModule(plan, THRESHOLD_DRAWER_ID)).toBe(true);
    expect(hasModule(plan, BOTTLE_ID)).toBe(true);
    expect(tallColumnsOf(plan)).toEqual(["tall-oven-tower"]);
  });

  it("refuses the drawer where it fits nowhere, even in the bottle's place, runs A 2350 / B 4900", () => {
    const hobWallRunMm = 2350;
    const plan = planForDeclaredRuns(room, { A: hobWallRunMm, B: prefixRunMm });
    const plainCabinets = plainCabinetsBeforeTheRule(plan);

    expect(
      fixedRunOnTheHobsWallMm(plan) + THRESHOLD_DRAWER_WIDTH_MM,
    ).toBeGreaterThan(hobWallRunMm);
    expect(plainCabinets).toHaveLength(OWNERS_PLAIN_CABINET_THRESHOLD);
    expect(drawersAmong(plainCabinets)).toBe(0);
    expect(hasModule(plan, THRESHOLD_DRAWER_ID)).toBe(false);
    expect(hasModule(plan, BOTTLE_ID)).toBe(true);
  });

  // Wherever the rule leaves a kitchen short of drawers without a threshold drawer, the drawer could not have
  // fitted even in the bottle's place; a refusal for column cost alone would name its run here.
  it(`refuses a drawer only where none fits, over declared runs at ${String(DECLARED_SWEEP_STEP_MM)} mm`, () => {
    const census = {
      runs: 0,
      placed: 0,
      refusedWhereNothingFits: 0,
      refusedWhereTheBottlesPlaceFits: [] as string[],
      tradedDishwasher: 0,
    };
    for (const entered of [room, { ...room, widthMm: 5000, depthMm: 6000 }]) {
      for (let a = 0; a <= DECLARED_SWEEP_MAX_MM; a += DECLARED_SWEEP_STEP_MM) {
        for (
          let b = 0;
          b <= DECLARED_SWEEP_MAX_MM;
          b += DECLARED_SWEEP_STEP_MM
        ) {
          census.runs += 1;
          const runLengthsMm = { A: a, B: b };
          const plan = planForDeclaredRuns(entered, runLengthsMm);
          if (standsATradedDishwasher(plan)) census.tradedDishwasher += 1;
          if (hasModule(plan, THRESHOLD_DRAWER_ID)) {
            census.placed += 1;
            continue;
          }
          const plainCabinets = plainCabinetsBeforeTheRule(plan);
          const isShortOfDrawers =
            plainCabinets.length >= OWNERS_PLAIN_CABINET_THRESHOLD &&
            drawersAmong(plainCabinets) < OWNERS_DRAWER_COUNT;
          if (!isShortOfDrawers) continue;
          const hobWall = plan.bases.find((base) => base.role === "hob")?.wall;
          const hobWallRunMm =
            hobWall === undefined ? 0 : runLengthsMm[hobWall];
          if (
            fixedRunOnTheHobsWallMm(plan) + THRESHOLD_DRAWER_WIDTH_MM >
            hobWallRunMm
          ) {
            census.refusedWhereNothingFits += 1;
          } else {
            census.refusedWhereTheBottlesPlaceFits.push(
              `${String(entered.widthMm)}x${String(entered.depthMm)} A${String(a)}/B${String(b)}`,
            );
          }
        }
      }
    }

    expect(census).toEqual({
      runs: 51_842,
      placed: 6_732,
      refusedWhereNothingFits: 5_160,
      refusedWhereTheBottlesPlaceFits: [],
      tradedDishwasher: 1_248,
    });
  });
});

// Every body a trade gives up (a pantry column, the bottle, the oven tower; ADR 0110 M7/M10) stands on the
// hob's wall, so a dishwasher on another wall was paid for by something else (`givesUpExactlyTheRuledBody`).
describe("7D5b S2 — a traded dishwasher gives up only the body the ruling names (declared runs)", () => {
  const room: DesignRoom = {
    shape: "L",
    widthMm: 6000,
    depthMm: 5000,
    heightMm: 2200,
  };

  it("stands every traded dishwasher on the wall of the body it was traded for, over declared runs at 50 mm", () => {
    const offTheTradedBodysWall: string[] = [];
    let traded = 0;
    for (const entered of [room, { ...room, widthMm: 5000, depthMm: 6000 }]) {
      for (let a = 0; a <= DECLARED_SWEEP_MAX_MM; a += DECLARED_SWEEP_STEP_MM) {
        for (
          let b = 0;
          b <= DECLARED_SWEEP_MAX_MM;
          b += DECLARED_SWEEP_STEP_MM
        ) {
          const plan = planForDeclaredRuns(entered, { A: a, B: b });
          if (!standsATradedDishwasher(plan)) continue;
          traded += 1;
          const hob = plan.bases.find((base) => base.role === "hob");
          const dishwasher = plan.bases.find(
            (base) => base.buildId === DISHWASHER_BODY,
          );
          if (dishwasher?.wall !== hob?.wall)
            offTheTradedBodysWall.push(
              `${String(entered.widthMm)}x${String(entered.depthMm)} A${String(a)}/B${String(b)}`,
            );
        }
      }
    }

    expect(traded).toBe(1_248);
    expect({
      runs: offTheTradedBodysWall.length,
      first: offTheTradedBodysWall.slice(0, 3),
    }).toEqual({ runs: 0, first: [] });
  });

  // Wall B, read in reverse, holds sink, preparation and one door cabinet; wall A holds the hob and the bottle.
  // No ruling lets a door cabinet pay for a trade, so it must stand.
  it("keeps wall B's door cabinet whether or not a dishwasher is traded in, runs A 900 / B 1800", () => {
    const plan = planForDeclaredRuns(room, { A: 900, B: 1800 });
    const dishwasher = plan.bases.find(
      (base) => base.buildId === DISHWASHER_BODY,
    );
    const hob = plan.bases.find((base) => base.role === "hob");

    expect(plan.bases.filter(isComposedStorageSlot)).toHaveLength(1);
    expect(dishwasher === undefined || dishwasher.wall === hob?.wall).toBe(
      true,
    );
  });
});

/** The block the withdrawn K3 refinement would have left: the pan drawer standing in the bottle's place,
 *  600 mm where the bottle took 300, on the hob's wall (the free-end wall in every approved room). Derived
 *  from the run and `planTallEndBlock`, not asked of the composer. */
function columnsWithThePanDrawerInTheBottlesPlace(
  plan: KitchenCompositionPlan,
): number {
  const hob = plan.bases.find((base) => base.role === "hob");
  if (!hob) throw new Error("the plan stands no hob");
  const run = lShellFloorRuns(plan.room)[hob.wall];
  const standingMm = plan.bases
    .filter(
      (base) =>
        base.wall === hob.wall &&
        !base.id.startsWith("column:") &&
        !isComposedStorageSlot(base),
    )
    .reduce((sum, base) => sum + base.widthMm, 0);
  const freeMm = run.endMm - run.startMm - standingMm - BOTTLE_WIDTH_MM;
  if (freeMm < 0) return -1;
  return planTallEndBlock({
    coreSurvivedWhole: plan.dropped.length === 0,
    hobStandsOnTheFreeEndWall: true,
    freeEndStorageCount: Math.floor(freeMm / THRESHOLD_DRAWER_WIDTH_MM),
    freeEndRemainderMm: freeMm % THRESHOLD_DRAWER_WIDTH_MM,
    roomHeightMm: plan.room.heightMm,
    hobWithItsOwnOvenBuildId: "base-hob-oven",
    declared: DECLARED_COLUMNS,
  }).columns.length;
}

/** A dishwasher read directly after the sink with the run's next item — not a composed slot — directly after
 *  it on the same wall: only a trade inserts one (M1 converts a slot; (e) moves the preparation role onto the
 *  pan drawer; ADR 0110 M7/M10). */
function standsATradedDishwasher(plan: KitchenCompositionPlan): boolean {
  const reading = inReadingOrder(plan);
  const at = reading.findIndex((base) => base.buildId === DISHWASHER_BODY);
  const readNext = reading[at + 1];
  const isDrawerSwap = plan.bases.some(
    (base) => base.buildId === PAN_DRAWER_BODY && base.role === "preparation",
  );
  return (
    at > 0 &&
    !isDrawerSwap &&
    reading[at - 1]?.role === "sink" &&
    readNext !== undefined &&
    readNext.wall === reading[at]?.wall &&
    !isComposedStorageSlot(readNext)
  );
}

describe("7D5 — a bottle-only kitchen stays bottle-only (the owner withdrew the K3 refinement)", () => {
  // Kitchens where the bottle costs an outer pantry column only (outside ADR 0110 M11) and a pan drawer in its
  // place would keep that column, so the withdrawn refinement would act; each row asserts its absence.
  //
  // 2200 x 4000 and 3900 x 2300: M1 converts the dishwasher, so no trade reaches them.
  it.each([
    { name: "wall B wider, two columns", room: roomOf(4600, 4610) },
    { name: "wall B wider, one column", room: roomOf(2200, 4000) },
    { name: "wall A wider, one column", room: roomOf(3900, 2300) },
  ])(
    "keeps the bottle after the hob and stands no pan drawer, $name",
    ({ room }) => {
      const plan = planFor(room);

      expect(
        columnsWithThePanDrawerInTheBottlesPlace(plan),
      ).toBeGreaterThanOrEqual(tallColumnsOf(plan).length);
      expect(hasModule(plan, BOTTLE_ID)).toBe(true);
      expect(hasModule(plan, PAN_DRAWER_ID)).toBe(false);
      expect(plan.bases.some((base) => base.buildId === PAN_DRAWER_BODY)).toBe(
        false,
      );
      expect(standsATradedDishwasher(plan)).toBe(false);
    },
  );

  it.each([
    { name: "wall B wider, one column", room: roomOf(2200, 4000) },
    { name: "wall A wider, one column", room: roomOf(3900, 2300) },
  ])(
    "is a one-column witness the refinement would have changed, $name",
    ({ room }) => {
      const plan = planFor(room);

      expect(tallColumnsOf(plan)).toEqual(["tall-oven-tower"]);
      expect(columnsWithThePanDrawerInTheBottlesPlace(plan)).toBe(1);
    },
  );
});

describe(`7D5 S3 — the threshold drawer over the approved L at ${String(SWEEP_STEP_MM)} mm`, () => {
  const policy = (() => {
    const shape = APPROVED_ROOM_POLICY.buildableShapes.L;
    if (!shape) throw new Error("the approved policy has no L");
    return shape;
  })();

  function* approvedRooms(): Generator<DesignRoom> {
    for (
      let widthMm = policy.wallA.minMm;
      widthMm <= policy.wallA.maxMm;
      widthMm += SWEEP_STEP_MM
    ) {
      for (
        let depthMm = policy.wallB.minMm;
        depthMm <= policy.wallB.maxMm;
        depthMm += SWEEP_STEP_MM
      ) {
        yield roomOf(widthMm, depthMm);
      }
    }
  }

  function isShortOfDrawersAtTheThreshold(
    plan: KitchenCompositionPlan,
  ): boolean {
    const plainCabinets = plainCabinetsBeforeTheRule(plan);
    return (
      plainCabinets.length >= OWNERS_PLAIN_CABINET_THRESHOLD &&
      drawersAmong(plainCabinets) < OWNERS_DRAWER_COUNT
    );
  }

  /** *D* on the finished plan, the threshold drawer included, by id and body. */
  function isLeftShortOfDrawers(plan: KitchenCompositionPlan): boolean {
    const plainCabinets = plan.bases.filter(
      (base) =>
        isComposedStorageSlot(base) ||
        base.id === PAN_DRAWER_ID ||
        base.id === THRESHOLD_DRAWER_ID,
    );
    return (
      plainCabinets.length >= OWNERS_PLAIN_CABINET_THRESHOLD &&
      drawersAmong(plainCabinets) < OWNERS_DRAWER_COUNT
    );
  }

  // The census is pinned, not only a non-zero count, and names every room that breaks a clause. The independent
  // derivation of which rooms stand the drawer is the 10 mm census in `pan-drawer-before-the-hob.test.ts`.
  it("stands only where D reaches six with fewer than two drawers, once, and read right after the hob or the bottle", () => {
    const census = {
      swept: 0,
      placed: 0,
      inTheBottlesPlaceOrAfterAHobWithoutOne: 0,
      afterTheBottle: 0,
      besideThePanDrawer: 0,
      byTallColumns: [0, 0, 0, 0],
      misplaced: [] as string[],
      notShortBeforeTheRule: [] as string[],
      leftShortOfDrawers: [] as string[],
      offTheHobsWall: [] as string[],
    };

    for (const room of approvedRooms()) {
      census.swept += 1;
      const where = `${String(room.widthMm)}x${String(room.depthMm)}`;
      const plan = planFor(room);
      if (plan.minimumMet && isLeftShortOfDrawers(plan))
        census.leftShortOfDrawers.push(where);
      const drawers = plan.bases.filter(
        (base) => base.id === THRESHOLD_DRAWER_ID,
      );
      const [drawer] = drawers;
      if (drawer === undefined) continue;
      census.placed += 1;

      const reading = inReadingOrder(plan);
      const hobAt = reading.findIndex((base) => base.role === "hob");
      const afterTheHob = reading
        .slice(hobAt + 1, hobAt + 3)
        .map((base) => base.id);
      const isReadRightAfterTheHob = afterTheHob[0] === THRESHOLD_DRAWER_ID;
      const isReadRightAfterTheBottle =
        afterTheHob[0] === BOTTLE_ID && afterTheHob[1] === THRESHOLD_DRAWER_ID;
      if (isReadRightAfterTheHob)
        census.inTheBottlesPlaceOrAfterAHobWithoutOne += 1;
      if (isReadRightAfterTheBottle) census.afterTheBottle += 1;
      if (hasModule(plan, PAN_DRAWER_ID)) census.besideThePanDrawer += 1;
      const columns = tallColumnsOf(plan).length;
      census.byTallColumns[columns] = (census.byTallColumns[columns] ?? 0) + 1;
      if (
        drawers.length !== 1 ||
        (!isReadRightAfterTheHob && !isReadRightAfterTheBottle)
      ) {
        census.misplaced.push(where);
      }
      if (!isShortOfDrawersAtTheThreshold(plan))
        census.notShortBeforeTheRule.push(where);
      if (drawer.wall !== reading[hobAt]?.wall)
        census.offTheHobsWall.push(where);
    }

    expect(census).toEqual({
      swept: 10_403,
      placed: 241,
      inTheBottlesPlaceOrAfterAHobWithoutOne: 157,
      afterTheBottle: 84,
      besideThePanDrawer: 241,
      byTallColumns: [0, 0, 102, 139],
      misplaced: [],
      notShortBeforeTheRule: [],
      leftShortOfDrawers: [],
      offTheHobsWall: [],
    });
  });
});
