// M7 wave 7D5 S3 — ADR 0110 Q-H5 (owner ruling 2026-09-21) and the K3 refinement.
//
// Q-H5: where the plain cabinets *D* (E1 as written: the storage run's composed slots plus the drawer
// modules astride the hob; never the preparation cabinet, the bottle or a tall column) reach six and
// fewer than two of them are drawers, a 600 mm `base-3drawer` is added after the hob in the owner's
// order — *"hub => bottle cabinets (if space for a large number of cabinets, the drawer cabinet)"*.
// The bottle gives way only where removing it is what lets the drawer fit without a tall column;
// otherwise the drawer stands after the bottle at the cost of one column, and never two — and where
// keeping the bottle would cost two, the bottle gives way again for one (owner, 2026-09-21, L2/L3). A bottle-only kitchen stays bottle-only: the bottle is never replaced by the pan drawer
// merely to save a column (the owner withdrew that refinement the same day).
//
// Catalogue ids are literals rather than the domain's constants, so a wrong constant and a wrong
// composer cannot agree (ADR 0121 decision 3(b)). *D* is re-derived here from ids, not asked of the
// composer.
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

const DECLARED_COLUMNS = declaredColumnSizes(
  buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN)),
);
const THRESHOLD_DRAWER_ID = "threshold-drawer";
const PAN_DRAWER_ID = "pan-drawer";
const BOTTLE_ID = "bottle";
const THREE_DRAWER_BODY = "base-3drawer";
const THRESHOLD_DRAWER_WIDTH_MM = 600;
const PAN_DRAWER_BODY = "base-panbank";
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

/** E1's *D*, excluding the threshold drawer itself, so it states the plan the rule was decided on. */
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
  it.each([
    { name: "wall B wider", room: roomOf(4600, 5800) },
    { name: "wall A wider", room: roomOf(5700, 4700) },
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
    { name: "wall B wider", room: roomOf(4600, 5800) },
    { name: "wall A wider", room: roomOf(5700, 4700) },
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
  it.each([
    { name: "wall B wider", room: roomOf(4600, 5200) },
    { name: "wall A wider", room: roomOf(5200, 4700) },
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

  // 5200 x 5500 is the wall-B-wider mirror (QA, 7D5 S3); it was S2's block-arm witness until this rule
  // gave it a drawer after the bottle.
  it.each([
    { name: "wall A wider, 5400 x 4700", room: roomOf(5400, 4700) },
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
  it.each([
    { name: "wall B wider", room: roomOf(4000, 5200) },
    { name: "wall A wider", room: roomOf(5100, 4100) },
  ])("adds none at D = 5, $name", ({ room }) => {
    const plan = planFor(room);

    expect(plainCabinetsBeforeTheRule(plan)).toHaveLength(5);
    expect(hasModule(plan, THRESHOLD_DRAWER_ID)).toBe(false);
  });

  it("adds none where D = 6 already has two drawers, 6000 x 4100", () => {
    const plan = planFor(roomOf(6000, 4100));
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
  const runOf = (wall: DesignWall): GenerationRun => ({
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

// ADR 0110 L2/L3 on declared runs (ADR 0093 decision 1, ADR 0123): the approved policy never reaches
// the third candidate — the drawer in the bottle's place for one column — so its witnesses are declared
// runs in a 6000 x 5000 x 2200 room, where wall A is wider and so carries the hob and the block.
//
// **What L3's one-column limit decides (QA, 7D5 S3, measured in a scratch copy).** It refuses no
// drawer on its own: over 3 849 606 declared runs (both walls 0-8000 mm at 10 mm, both reading
// orientations, ceilings 2199 / 2200 / 3900) a candidate that fit never cost more than one column in
// the bottle's place, and all 456 560 refusals were runs where no candidate fit. Its one effect is
// the choice between the owner's second and third candidates: with the limit raised to two, 29 680
// of those runs change — exactly the ones the third candidate decides — to the drawer after the kept
// bottle and a block two columns shorter. The approved L at 10 mm (2200 / 2600 / 3900) changes in
// none. The 3350 pair below is that choice; the declared-run sweep pins the no-refusal half.
describe("7D5 S3 — the threshold drawer on declared runs: at most one tall column, and the bottle gives way for it", () => {
  const room: DesignRoom = {
    shape: "L",
    widthMm: 6000,
    depthMm: 5000,
    heightMm: 2200,
  };
  const prefixRunMm = 4300;

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

  /** How many columns 7D3's own rule stands on a free end of this length, in a whole-core kitchen. */
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

  it("stands the drawer in the bottle's place for one column where keeping the bottle would cost both, runs A 3350 / B 4300", () => {
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

  // The precondition, as arithmetic on the room's own run, is what makes the pair a witness of the
  // limit: at no cost the bottle's place is refused (step 1), after the bottle costs both columns
  // (step 2 over the limit), and the bottle's place costs one (step 3 within it). With a limit of two
  // step 2 would stand — the bottle kept and the block gone — so this is the limit's decision.
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

  it("keeps the bottle and stands the drawer after it where that costs a single column, runs A 3300 / B 4300", () => {
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

  it("refuses the drawer where it fits nowhere, even in the bottle's place, runs A 2350 / B 4300", () => {
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

  // The no-refusal half of the measurement, pinned on public output: wherever the rule leaves a
  // kitchen short of drawers without a threshold drawer, the drawer could not have fitted even in
  // the bottle's place. A refusal for column cost alone would name its run here.
  it(`refuses a drawer only where none fits, over declared runs at ${String(DECLARED_SWEEP_STEP_MM)} mm`, () => {
    const census = {
      runs: 0,
      placed: 0,
      refusedWhereNothingFits: 0,
      refusedWhereTheBottlesPlaceFits: [] as string[],
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

    // Measured at 7D5 S3 (QA, 2026-09-21), and matched by the scratch copy's own candidate log.
    expect(census).toEqual({
      runs: 51_842,
      placed: 7_332,
      refusedWhereNothingFits: 5_928,
      refusedWhereTheBottlesPlaceFits: [],
    });
  });
});

describe("7D5 — a bottle-only kitchen stays bottle-only (the owner withdrew the K3 refinement)", () => {
  it.each([
    { name: "wall B wider, two columns", room: roomOf(4600, 4610) },
    { name: "wall B wider, no block", room: roomOf(900, 4100) },
    { name: "wall A wider, no block", room: roomOf(3300, 1700) },
  ])(
    "keeps the bottle after the hob and stands no pan drawer, $name",
    ({ room }) => {
      const plan = planFor(room);

      expect(hasModule(plan, BOTTLE_ID)).toBe(true);
      expect(hasModule(plan, PAN_DRAWER_ID)).toBe(false);
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

  /** E1's *D* on the finished plan, the threshold drawer included, by id and body. */
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

  // QA, 7D5 S3: the sweep pins its census rather than only a non-zero count, and names every room
  // that breaks a clause. The independent derivation of *which* rooms stand the drawer, and at what
  // column cost, is the 10 mm census in `pan-drawer-before-the-hob.test.ts`.
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

    // Measured at 7D5 S3 (QA, 2026-09-21). Every threshold drawer stands beside a pan drawer and a
    // block of two or three columns; none is left short and none stands outside the owner's rule.
    expect(census).toEqual({
      swept: 10_403,
      placed: 655,
      inTheBottlesPlaceOrAfterAHobWithoutOne: 427,
      afterTheBottle: 228,
      besideThePanDrawer: 655,
      byTallColumns: [0, 0, 384, 271],
      misplaced: [],
      notShortBeforeTheRule: [],
      leftShortOfDrawers: [],
      offTheHobsWall: [],
    });
  });
});
