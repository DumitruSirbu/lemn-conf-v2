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
//
// 7D5b S1 / ADR 0110 M1/M2/M9 — *"dishwasher first"*: the dishwasher is decided before this rule, and
// *D* excludes it. M1's dishwasher is a door cabinet that is no longer a composed slot, so wherever M1
// converts one *D* is one lower than 7D5 counted it; (e)'s pan drawer carries the preparation id and
// leaves *D*. 10 070 of the 15 795 threshold drawers go (plan E3), so every 7D5 witness below that was
// an M1 room one cabinet over the threshold was re-derived: the same subject, both mirrors, in a room
// where *D* still reaches six once the dishwasher is out of it. The rooms the witnesses left are the
// order's own witnesses (`adds none at D = 5`).
//
// 7D5b S2 / ADR 0110 M7/M10: where S1 stood no dishwasher it is traded in directly after the sink for
// (b) a pantry column, (d) the bottle or (c) the oven tower, still before this rule. A trade changes the
// run this rule reads, so the declared-run sweep is re-derived below, and the K3 rows moved to rooms no
// trade reaches.
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
  // 7D5b S1 / ADR 0110 M1/M2/M9: were 4600 x 5800 and 5700 x 4700. M1 takes a door cabinet across the
  // corner in both, *D* falls from six to five and the drawer goes (4600 x 5800 gets its bottle back,
  // plan E3). Wall B's extra 600 mm restores the sixth cabinet: 5200 x 5800 and 5700 x 5300 are the
  // same subject — the bottle's place, three columns kept — with the dishwasher standing.
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
  // 7D5b S1 / ADR 0110 M1/M2/M9: were 4600 x 5200 and 5200 x 4700, now M2's witnesses below (the
  // drawer became a column: `threshold | tower | pantry` reads `tower | pantry | pantry`). 5200 x 5250
  // and 5350 x 5300 have one more door cabinet across the corner, so *D* is six again with the
  // dishwasher out of it, and S2 left them the pan drawer, no bottle and three columns.
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

  // 5200 x 5500 is the wall-B-wider mirror (QA, 7D5 S3); it was S2's block-arm witness until this rule
  // gave it a drawer after the bottle. 7D5b S1 / ADR 0110 M1/M2/M9: 5200 x 5500 keeps its drawer with
  // the dishwasher standing (five door cabinets and the pan drawer are still six); the wall-A row was
  // 5400 x 4700, where M1 leaves *D* at five, and moved to 5400 x 5300.
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
  // 7D5b S1 / ADR 0110 M1/M2/M9: were 4000 x 5200 and 5100 x 4100, where M1 now leaves *D* at four.
  // 4600 x 5200 and 5200 x 4700 are *D* = 5 with the dishwasher decided first, and each is also the
  // owner's *"dishwasher first"* witness: counted with the door cabinet the dishwasher took, *D* would
  // be six with one drawer, and 7D5 stood a threshold drawer in both.
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

  // 7D5b S1 / ADR 0110 M1/M2/M9: was 6000 x 4100, where M1 leaves *D* at five; 6000 x 4700 is the
  // first wall B at which the two-slot class reaches six again with the dishwasher out of it.
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
// 7D5b S1 / ADR 0110 M1/M2/M9: wall B's declared run was 4300 mm. M1 now converts the door cabinet
// facing the sink across the corner, so *D* there fell from six to five and every witness below lost
// its subject. Wall B's run is 4900 mm: one more door cabinet, *D* six again with the dishwasher out of
// it, and the hob's wall — where every candidate is decided — exactly as it was.
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

  // The no-refusal half of the measurement, pinned on public output: wherever the rule leaves a
  // kitchen short of drawers without a threshold drawer, the drawer could not have fitted even in
  // the bottle's place. A refusal for column cost alone would name its run here.
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

    // Measured at 7D5 S3 (QA, 2026-09-21), and matched by the scratch copy's own candidate log.
    // 7D5b S1 / ADR 0110 M1/M2/M9: with the dishwasher out of *D*, 600 runs no longer reach the
    // threshold (placed 7 332 -> 6 732, the implementer's figure) and 768 fewer short runs are refused
    // where nothing fits (5 928 -> 5 160). The subject is unmoved: no run is refused where the bottle's
    // place would fit.
    //
    // 7D5b S2 / ADR 0110 M7/M10: 1 248 runs trade for their dishwasher, and no trade adds or removes
    // a threshold drawer (placed 6 732, as at S1) or moves a refusal (5 160, as at S1): a trade gives
    // up only the body the ruling names, never a composed door cabinet, so *D* is what S1 counted. (The
    // first S2 build also traded in 1 356 runs where the sink stands on the reversed wall and the
    // bottle on the other, paying the dishwasher with a door cabinet — 2 604 traded, 5 016 refused —
    // which `givesUpExactlyTheRuledBody` now refuses; the test after this one pins that.) The subject
    // is unmoved: no run is refused where the bottle's place would fit.
    expect(census).toEqual({
      runs: 51_842,
      placed: 6_732,
      refusedWhereNothingFits: 5_160,
      refusedWhereTheBottlesPlaceFits: [],
      tradedDishwasher: 1_248,
    });
  });
});

// 7D5b S2 / ADR 0110 M7/M10 — the trades give up exactly the body the ruling names: (b) one pantry
// column, (d) the bottle — *"the freed 300 mm fills a 300 mm remainder on the same wall"* — or (c) the
// oven tower (plan B1: *"(d) costs exactly the bottle"*). Every one of those bodies stands on the hob's
// wall, so a traded dishwasher standing on another wall was paid for by something else. Found by QA
// against the first S2 build: where the sink stands on the wall read in reverse and the bottle on the
// other, (d) took the bottle — freeing nothing where the dishwasher stands — and a door cabinet on the
// sink's wall paid the 600 mm, in 1 356 of these declared runs (0 in the approved L). Fixed in
// `optional-run-items.ts` (`givesUpExactlyTheRuledBody`); these tests keep it fixed.
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

    // 7D5b S2: 1 248 since the fix (was 2 604, of which 1 356 were the defect's).
    expect(traded).toBe(1_248);
    expect({
      runs: offTheTradedBodysWall.length,
      first: offTheTradedBodysWall.slice(0, 3),
    }).toEqual({ runs: 0, first: [] });
  });

  // The smallest run the defect reached. Wall B is read in reverse and holds sink, preparation and one door cabinet;
  // wall A holds the hob and the bottle. Without a dishwasher the door cabinet stands (S1's plan);
  // with a traded one it must still stand, because no ruling lets a door cabinet pay for it.
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

/** The block the withdrawn K3 refinement would have left: the pan drawer standing in the bottle's
 *  place, 600 mm where the bottle took 300, on the hob's wall (the free-end wall in every approved
 *  room). Derived from the run and 7D3's own rule, not asked of the composer. */
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

/** 7D5b S2 / ADR 0110 M7/M10: a dishwasher read directly after the sink with the run's next item —
 *  not a composed slot — directly after it on the same wall stands among the items, where only a trade
 *  inserts one (M1 converts a slot; (e) moves the preparation role onto the pan drawer). */
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
  // 7D5b S0b / ADR 0110 M11: the two "no block" rows (900 x 4100, 3300 x 1700) now keep their oven
  // tower and stand no bottle. No bottle-only kitchen without a block is left that the refinement
  // would change: with no column, a pan drawer in the bottle's place either does not fit or stood
  // first against the core, and where the core had a tower the bottle took, M11 keeps it. The rows
  // move to one-column kitchens, where the bottle costs an outer pantry column only (outside M11)
  // and the pan drawer in its place would keep that column — so the withdrawn refinement would act,
  // and its absence is what each row asserts.
  //
  // 7D5b S2 / ADR 0110 M7/M10: the one-column rows were 900 x 4700 and 3900 x 1700. Neither has a door
  // cabinet beside the sink, so the dishwasher is traded in for the bottle ((d); 900 x 4700 is plan
  // B5's (d) witness) and there is no bottle left to keep. 2200 x 4000 and 3900 x 2300 are the same
  // subject — one column, the bottle after the hob, and the pan drawer in its place keeping that
  // column — in rooms whose dishwasher M1 converts, so no trade reaches them; the rows assert that too.
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
    // 7D5b S1 / ADR 0110 M1/M2/M9: the dishwasher is decided first and *D* excludes it, so 655 -> 241
    // (the implementer's figure): 427 -> 157 read right after the hob, 228 -> 84 after the bottle, and
    // 384 / 271 -> 102 / 139 by two and three columns. Every clause list stays empty.
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
