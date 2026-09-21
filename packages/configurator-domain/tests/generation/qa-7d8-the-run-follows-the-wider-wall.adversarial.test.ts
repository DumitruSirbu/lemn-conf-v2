// M7 wave 7D8 slice S3 — criterion 7's dedicated guard, and it is the only control in this
// repository on the wave's worst failure.
//
// **Risk 1, in the plan's own words: re-key `firstStorageSlotAfterTheHob` and miss
// `isLaidOutInReverse`, or the converse, and the drawer stands at the wrong end of the kitchen while
// nothing goes red** — no count, width, remainder, cut, provenance or digest moves, and
// `7d3-composition-baseline.json` masks the one field that does. That was measured, not feared: with
// the slot lookup left on the literals `"B"` / `"A"`, the suite's failing set was identical, 25 → 25.
// A defect in 82 395 rooms that nothing counts is what this file exists to count.
//
// **Three obligations, and each is stated as the criterion names it (criterion 7, amended
// 2026-09-17).**
//
// - **7a — the live arm, by sweep.** `isLaidOutInReverse` decides the spatial order of the core on
//   both walls, and that use is live in every placed room. Inverting the expression must turn this
//   file red.
// - **7b — the empty arm, by a declared witness.** The descending index path (`count − 1 − step`) is
//   reached only through the prefix branch, and no room the approved policy admits reaches it. ADR
//   0093 decisions 2 and 3b decide the form: the design is **declared by the test** at the composer's
//   boundary, the test says in its own words that the path is unreachable and why, and the arm is
//   never sought by widening a sweep.
// - **7c — the wall the slot lookup names.** Spelling the two `slotsInReadingOrder` calls `"B"` then
//   `"A"` changes which wall the drawer is sought on in every room where wall B is the wider one.
//   This file goes red under that sabotage specifically.
//
// **Nothing here imports production's own key.** The wall read in reverse is re-derived from the two
// numbers the customer typed, and the run order is re-derived from `GENERATION_PRIORITIES`, which is
// the owner's ruled order (ADR 0110 Amendment A1) rather than a layout decision. A guard that asked
// `generation-priorities.ts` which wall it chose would agree with it whatever it chose.
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  DOOR_BASE_BUILD_ID,
  GENERATION_PRIORITIES,
  isComposedStorageSlot,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  THREE_DRAWER_BASE_BUILD_ID,
  wallLengthMm,
  type DesignRoom,
  type DesignWall,
  type GenerationCoreRole,
  type GenerationRun,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
} from "../../src/index.js";
import { narrowerEnteredWall } from "../support/entered-walls.js";

const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);

/** 50 mm rather than the 100 mm this wave's sibling files sweep at: the arm where the reversed wall
 *  carries two core bodies to reverse is 1.2 % of placed rooms, and a coarser grid draws 25 of them.
 *  Measured on this grid under the current policy: 9 971 placed plans, 5 018 with wall B wider, 4 864
 *  with wall A wider, 89 equal, 103 in the two-body arm and 9 826 with a two-body forward wall.
 *  **Pre-7A3 figures, kept for the record:** 8 615 placed, 3 335 B wider, 5 209 A wider, 71 equal,
 *  103 two-body. The floors were re-calibrated because M7 7A3 (ADR 0124) moved the population: the
 *  wall-A-wider arm shrank by the withdrawn wall A 6001–6300 band, and wall B 5101–6000 was added. */
const GRID_STEP_MM = 50;

/** The run order, read off the owner's ruled priority list rather than spelled again here — a kitchen
 *  is read fridge, sink, preparation, hob whichever wall each stands on (ADR 0110 Amendment A1). */
const RUN_ORDER: readonly GenerationCoreRole[] = GENERATION_PRIORITIES.map(
  (priority) => priority.role,
);

function planFor(
  room: DesignRoom,
  runs: Readonly<Record<DesignWall, GenerationRun>> = lShellFloorRuns(room),
): KitchenCompositionPlan {
  return planKitchenComposition({ room, runs, columns: DECLARED_COLUMNS });
}

/**
 * The wall the layout runs **against** the reading order on: the narrower entered wall, and wall B
 * where the two are equal (ADR 0120 Amendment E).
 *
 * **Derived in `entered-walls.ts` from the room and never from `generation-priorities.ts`.** This is
 * the test-side twin of production's `isLaidOutInReverse`, and the independence is the whole asset:
 * the two agree only if both read the owner's wider-wall rule the same way (7D8 adjudication,
 * finding C2).
 */
function wallReadInReverse(room: DesignRoom): DesignWall {
  return narrowerEnteredWall(room);
}

function theOtherWall(wall: DesignWall): DesignWall {
  return wall === "A" ? "B" : "A";
}

/** One wall's composed bodies, corner to free end. */
function alongTheWall(
  plan: KitchenCompositionPlan,
  wall: DesignWall,
): readonly PlannedGenerationBase[] {
  return [...plan.bases.filter((base) => base.wall === wall)].sort(
    (left, right) => left.startMm - right.startMm,
  );
}

/** The whole kitchen in the order it is read: the reversed wall from its free end toward the corner,
 *  then the other wall from the corner outward. */
function inReadingOrder(
  plan: KitchenCompositionPlan,
): readonly PlannedGenerationBase[] {
  const reversed = wallReadInReverse(plan.room);
  return [
    ...[...alongTheWall(plan, reversed)].reverse(),
    ...alongTheWall(plan, theOtherWall(reversed)),
  ];
}

function coreRolesOf(
  bases: readonly PlannedGenerationBase[],
): readonly GenerationCoreRole[] {
  return bases.flatMap((base) => (base.role === "storage" ? [] : [base.role]));
}

function sweptPlans(): readonly KitchenCompositionPlan[] {
  const l = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (!l) throw new Error("the approved policy declares no L");
  const plans: KitchenCompositionPlan[] = [];
  for (
    let widthMm = l.wallA.minMm;
    widthMm <= l.wallA.maxMm;
    widthMm += GRID_STEP_MM
  ) {
    for (
      let depthMm = l.wallB.minMm;
      depthMm <= l.wallB.maxMm;
      depthMm += GRID_STEP_MM
    ) {
      const plan = planFor({ shape: "L", widthMm, depthMm, heightMm: 2600 });
      if (plan.minimumMet) plans.push(plan);
    }
  }
  return plans;
}

const SWEPT_PLANS = sweptPlans();
const DECLARED_WALL_B_WIDER_PLANS = declaredWallBWiderPlans();

function roomKeyOf(plan: KitchenCompositionPlan): string {
  return `${String(plan.room.widthMm)}x${String(plan.room.depthMm)}`;
}

describe("7a — the reversed wall is the narrower entered wall, and the sweep can see the reversal", () => {
  it("reads every composed kitchen back in the owner's run order, on both arms of the split", () => {
    // Inverting `isLaidOutInReverse` reverses the wrong wall's core, and this is where that shows:
    // the roles come back out of the run order. The arms below are counted because the reversal is
    // only **observable** on a wall carrying two core bodies to reverse — a wall holding one is
    // reversed into itself — so a sweep that never reached a two-body reversed wall would agree with
    // a module that had lost the reversal entirely.
    const arms = { wallBWider: 0, wallAWider: 0, equal: 0 };
    const reversals = { onTheReversedWall: 0, onTheForwardWall: 0 };
    for (const plan of SWEPT_PLANS) {
      const reversed = wallReadInReverse(plan.room);
      const bMm = wallLengthMm("B", plan.room);
      const aMm = wallLengthMm("A", plan.room);
      if (bMm > aMm) arms.wallBWider += 1;
      else if (bMm === aMm) arms.equal += 1;
      else arms.wallAWider += 1;
      if (coreRolesOf(alongTheWall(plan, reversed)).length >= 2) {
        reversals.onTheReversedWall += 1;
      }
      if (coreRolesOf(alongTheWall(plan, theOtherWall(reversed))).length >= 2) {
        reversals.onTheForwardWall += 1;
      }

      expect(coreRolesOf(inReadingOrder(plan)), roomKeyOf(plan)).toEqual(
        RUN_ORDER.filter((role) => !plan.dropped.includes(role)),
      );
    }

    expect(SWEPT_PLANS.length).toBeGreaterThanOrEqual(9000);
    expect(arms.wallBWider).toBeGreaterThanOrEqual(4500);
    expect(arms.wallAWider).toBeGreaterThanOrEqual(4500);
    expect(arms.equal).toBeGreaterThanOrEqual(50);
    expect(
      reversals.onTheReversedWall,
      "no swept room gave the reversed wall two bodies to reverse",
    ).toBeGreaterThanOrEqual(100);
    expect(reversals.onTheForwardWall).toBeGreaterThanOrEqual(9000);
  });

  it("stands the reversed wall's core against the run and the other wall's core with it", () => {
    // The same expression read spatially rather than through the whole run: along the narrower wall
    // the run's rank **descends** from the corner outward, and along the wider wall it ascends. Two
    // assertions rather than one, because an inversion that flipped both walls at once would leave
    // the concatenated reading order in this file's first test looking merely rotated in a kitchen
    // whose core all stands on one wall.
    const rankedPairs = { descending: 0, ascending: 0 };
    for (const plan of SWEPT_PLANS) {
      const reversed = wallReadInReverse(plan.room);
      const descending = coreRolesOf(alongTheWall(plan, reversed)).map((role) =>
        RUN_ORDER.indexOf(role),
      );
      const ascending = coreRolesOf(
        alongTheWall(plan, theOtherWall(reversed)),
      ).map((role) => RUN_ORDER.indexOf(role));
      if (descending.length >= 2) rankedPairs.descending += 1;
      if (ascending.length >= 2) rankedPairs.ascending += 1;

      expect(descending, `${roomKeyOf(plan)} wall ${reversed}`).toEqual(
        [...descending].sort((left, right) => right - left),
      );
      expect(
        ascending,
        `${roomKeyOf(plan)} wall ${theOtherWall(reversed)}`,
      ).toEqual([...ascending].sort((left, right) => left - right));
    }

    // **Both arms are floored, and the descending one is this test's whole subject.** A single
    // counter satisfied by either arm is satisfied by the forward wall alone — 8 470 of the 8 615
    // swept plans — and the wall that is actually read backwards is 103 of them, thin enough that a
    // change emptying it would leave a combined floor untouched. The descending floor is risk 14's
    // hundred and the population is 103, so it is asserted at full strength rather than fitted to
    // the sample (ADR 0091 Amendment A).
    expect(
      rankedPairs.descending,
      "no swept room gave the reversed wall two ranked core bodies",
    ).toBeGreaterThanOrEqual(100);
    expect(rankedPairs.ascending).toBeGreaterThanOrEqual(8000);
  });
});

describe("7b — the descending slot path, declared at the composer's boundary", () => {
  // **This arm is unreachable from `APPROVED_ROOM_POLICY`, the test says so rather than a comment
  // beside it, and here is why — ADR 0093 decision 3b's own construction, so a later reader files
  // this as a declared design and not as a live customer defect.**
  //
  // `firstStorageSlotAfterTheHob` counts the reversed wall's slots **downward**, from `count − 1`,
  // and reaches that branch only when the hob does **not** stand on the wall the run reads last. The
  // hob is the run's last core role, so it leaves that wall only when the wall cut keeps every kept
  // role on the reversed one — which needs the reversed wall to hold the whole core and the other
  // wall to hold less than the hob's 600 mm. **The runs the L shell derives cannot do both**: the
  // reversed wall is the narrower entered wall, its run is `entered − 900` or `entered − 1000`, and a
  // room whose wider wall leaves under 600 mm of run leaves the narrower one under 700 mm — far
  // short of the 1 800 mm the core needs. That is an empirical fact about the admitted range, not a
  // fact about the rule (7D8 Finding B2), and the branch is ruled **kept** (Finding B3).
  //
  // So the pair of runs below is **declared by this test**. Every other input is a real admitted
  // room, and `lShellFloorRuns`'s own answer for each room is asserted to differ, so the day the
  // policy widens far enough to derive these runs itself this witness does not quietly become a
  // duplicate of the sweep.
  //
  // **Restated in M7 7D5 S1.** The runs were 900–4600 / 900–1400 and mirror. Once the 300 mm bottle
  // cargo stands on the hob's wall immediately after the hob in reading order (ADR 0110 Amendment
  // H1, coordinator ruling option B), it takes one reversed-wall storage slot there — an accepted E3
  // outcome — and those runs return a single slot, which cannot tell a descending index from an
  // ascending one. The reversed wall's run is widened by 400 mm so two slots return alongside the
  // bottle and the subject, the drawer at the highest slot index, stays discriminating.
  //
  // **Restated again in M7 wave 7D5 S2 (owner ruling Q-H6a = A; ADR 0123).** The 600 mm pan drawer
  // now stands immediately before the hob in reading order — spatially just past the hob on this
  // reversed wall — and took one of the two slots, leaving a single slot that again cannot tell the
  // two index directions apart. The reversed wall's run is widened by a further 600 mm (900–5600 and
  // 1000–5700), so two slots return beside the bottle and the pan drawer, and every assertion 7D8 and
  // S1 made here is kept; the pan drawer's own position is added.
  const DECLARED_ARMS = [
    {
      name: "wall B wider, so wall A is read in reverse",
      room: { shape: "L", widthMm: 1500, depthMm: 4000, heightMm: 2600 },
      runs: {
        A: { wall: "A", startMm: 900, endMm: 5600 },
        B: { wall: "B", startMm: 900, endMm: 1400 },
      },
      reversedWall: "A",
    },
    {
      name: "wall A wider, so wall B is read in reverse",
      room: { shape: "L", widthMm: 4000, depthMm: 1500, heightMm: 2600 },
      runs: {
        A: { wall: "A", startMm: 900, endMm: 1400 },
        B: { wall: "B", startMm: 1000, endMm: 5700 },
      },
      reversedWall: "B",
    },
  ] as const satisfies readonly {
    readonly name: string;
    readonly room: DesignRoom;
    readonly runs: Readonly<Record<DesignWall, GenerationRun>>;
    readonly reversedWall: DesignWall;
  }[];

  it.each(DECLARED_ARMS)(
    "gives the drawer to the reversed wall's highest slot index, $name",
    ({ room, runs, reversedWall }) => {
      const plan = planFor(room, runs);
      const slots = alongTheWall(plan, reversedWall).filter(
        isComposedStorageSlot,
      );
      const hob = plan.bases.find((base) => base.role === "hob");
      const bottle = plan.bases.find((base) => base.id === "bottle");

      // The declared design: the hob stands on the wall the run reads **first**, which is the state
      // no admitted room produces.
      expect(hob?.wall).toBe(reversedWall);
      expect(bottle?.wall).toBe(reversedWall);
      expect(slots).toHaveLength(2);
      // The slots stand corner-outward and the run reads this wall the other way, so the drawer is
      // the **outermost** of them — the one nearest the hob — and the slot against the corner keeps
      // its door. Under a count that ascended with the wall instead, the two bodies would swap and
      // every width, position, remainder and provenance in this plan would be unchanged. Since 7D5
      // S1 the bottle stands between that slot and the hob, so the slot touches the bottle and the
      // bottle touches the hob.
      expect(slots.map((slot) => slot.buildId)).toEqual([
        DOOR_BASE_BUILD_ID,
        THREE_DRAWER_BASE_BUILD_ID,
      ]);
      expect(slots.at(-1)?.endMm).toBe(bottle?.startMm);
      expect(bottle?.endMm).toBe(hob?.startMm);
    },
  );

  it.each(DECLARED_ARMS)(
    "stands the pan drawer immediately before the hob in reading order, on the reversed wall, $name",
    ({ room, runs, reversedWall }) => {
      // M7 wave 7D5 S2 (Q-H6a = A). Read backwards, *before the hob* is spatially **past** it, away
      // from the corner: a composer that inserted the pan drawer by spatial position rather than by
      // reading order would stand it between the bottle and the hob instead.
      const plan = planFor(room, runs);
      const read = inReadingOrder(plan);
      const hobAt = read.findIndex((base) => base.role === "hob");
      const hob = read[hobAt];
      const panDrawer = read[hobAt - 1];

      expect(panDrawer?.id).toBe("pan-drawer");
      expect(panDrawer?.buildId).toBe("base-panbank");
      expect(panDrawer?.wall).toBe(reversedWall);
      expect(panDrawer?.startMm).toBe(hob?.endMm);
      expect(read[hobAt - 2]?.role).toBe("preparation");
    },
  );

  it.each(DECLARED_ARMS)(
    "declares runs the L shell does not derive for that room, $name",
    ({ room, runs }) => {
      expect(lShellFloorRuns(room)).not.toEqual(runs);
    },
  );

  it("finds no room in the approved policy that composes the hob onto the reversed wall", () => {
    // The other half of the declaration, and the half that keeps it honest: the witness above is a
    // declared design **because** this measures 0. A later wave that widens the policy until this
    // arm refills goes red here, and its author is sent to the witness rather than to a surprise.
    const hobOnTheReversedWall = SWEPT_PLANS.filter(
      (plan) =>
        plan.bases.find((base) => base.role === "hob")?.wall ===
        wallReadInReverse(plan.room),
    );

    expect(hobOnTheReversedWall.map(roomKeyOf)).toEqual([]);
  });
});

describe("7c — the slot lookup names its wall by layout role and never by letter", () => {
  // The witness room for the sabotage this wave measured and could not explain: wall B is wider, so
  // the drawer belongs to wall B's first slot, while **wall A holds composed slots of its own** that
  // the run reads before the hob. A lookup left on the literal `"A"` finds one of those and gives it
  // the drawer; a lookup on `"A"` in a room where wall A holds no slot composes no drawer at all.
  //
  // **Restated for M7 wave 7D5 S2 (owner ruling Q-H6a = A; ADR 0123) — the approved policy no longer
  // holds a single room of this shape.** The pan drawer before the hob takes the hob's wall's last
  // module wherever that wall had room for only one more, and a post-hob slot on physical wall B now
  // needs 5 100 mm of wall-B run, which only a wall B of 6 100 mm or more gives (its run starts 100 mm
  // further from the corner than wall A's). The policy stops at 6 000, so **every** admitted room with
  // a drawer has wall A the wider wall and wall B read first — and there a lookup spelled `"B"` then
  // `"A"` is right by coincidence. The old witness, 1500 x 4410, lost its wall-B slot to the pan
  // drawer. The witness and the band below are therefore **declared past the policy** (up to the
  // room schema's 6 300 limit), each asserted to lie outside it, and the sabotage is caught there.
  const DRAWER_ON_THE_WIDER_WALL: DesignRoom = {
    shape: "L",
    widthMm: 4100,
    depthMm: 6100,
    heightMm: 2600,
  };

  it("gives the drawer to the wider wall's slot while the narrower wall's slots keep their doors", () => {
    const plan = planFor(DRAWER_ON_THE_WIDER_WALL);
    const slots = plan.bases.filter(isComposedStorageSlot);

    expect(DRAWER_ON_THE_WIDER_WALL.depthMm).toBeGreaterThan(
      approvedWallBMaxMm(),
    );
    expect(
      slots.map((slot) => [slot.wall, slot.startMm, slot.buildId]),
    ).toEqual([
      ["A", 900, DOOR_BASE_BUILD_ID],
      ["A", 1500, DOOR_BASE_BUILD_ID],
      ["A", 2100, DOOR_BASE_BUILD_ID],
      ["A", 2700, DOOR_BASE_BUILD_ID],
      ["B", 3600, THREE_DRAWER_BASE_BUILD_ID],
    ]);
  });

  it("declares its wall-B band wholly past the approved policy, and every room in it placed", () => {
    // ADR 0123 decision 3: the unreachable arm is stated as a test. A policy widened to admit any of
    // these rooms turns this red, and its author restores the in-policy floors below.
    expect(DECLARED_WALL_B_WIDER_PLANS.length).toBeGreaterThanOrEqual(200);
    for (const plan of DECLARED_WALL_B_WIDER_PLANS) {
      expect(plan.room.depthMm, roomKeyOf(plan)).toBeGreaterThan(
        approvedWallBMaxMm(),
      );
    }
  });

  it("stands every composed drawer on the wider entered wall, over the whole sweep and the declared band", () => {
    // The sabotage's two shapes are both caught here: a drawer that moved to the narrower wall, and a
    // drawer that vanished because the narrower wall had no slot to move it to. The arm floored below
    // is the one where a wrong letter has somewhere to land — a drawer composed in a room whose
    // narrower wall also holds a slot, with wall B the wider of the two.
    //
    // **M7 wave 7D5 S2 (Q-H6a = A; ADR 0123).** In the approved sweep that arm is now empty and the
    // drawer arm is 87 plans, all at wall A 6 000 mm (was 2 000+). The in-policy floor is set at the
    // population the grid still has, and the wall-B hundred is kept at full strength over
    // `DECLARED_WALL_B_WIDER_PLANS`, the band past the policy where it still lives.
    const arms = { withADrawer: 0, wallBWiderAndBothWallsHoldSlots: 0 };
    const declaredArms = { withADrawer: 0, wallBWiderAndBothWallsHoldSlots: 0 };
    const countInto = (
      tally: typeof arms,
      plans: readonly KitchenCompositionPlan[],
    ) => {
      for (const plan of plans) standsEveryDrawerOnTheWiderWall(plan, tally);
    };
    countInto(arms, SWEPT_PLANS);
    countInto(declaredArms, DECLARED_WALL_B_WIDER_PLANS);

    expect(arms.withADrawer).toBeGreaterThanOrEqual(80);
    expect(declaredArms.withADrawer).toBeGreaterThanOrEqual(100);
    expect(
      declaredArms.wallBWiderAndBothWallsHoldSlots,
      "no declared room put a drawer on wall B while wall A also held a slot",
    ).toBeGreaterThanOrEqual(100);
  });

  it("composes a drawer in every kitchen whose run reaches a storage slot after the hob", () => {
    // Stated as a count rather than a shape, because the quietest form of the wrong letter is a
    // kitchen with **no** drawer: `slotsInReadingOrder` on a wall with no slots returns nothing, and
    // `firstStorageSlotAfterTheHob` then answers `undefined` while every other field stays right.
    //
    // **M7 wave 7D5 S2 (Q-H6a = A; ADR 0123):** 87 approved plans reach a post-hob slot now, all at
    // wall A 6 000 mm; the in-policy floor follows that population and the declared band past the
    // policy carries the hundred on the wall-B side, where a wrong letter would answer `undefined`.
    const inPolicy = countPostHobDrawers(SWEPT_PLANS);
    const declared = countPostHobDrawers(DECLARED_WALL_B_WIDER_PLANS);

    expect(inPolicy).toBeGreaterThanOrEqual(80);
    expect(declared).toBeGreaterThanOrEqual(100);
  });
});

/** Every plan in the band past the approved policy where wall B is wider **and** carries a post-hob
 *  slot — 50 mm steps over wall A 1 600-4 000 and wall B 6 100-6 300, 6 300 being the room schema's
 *  own limit (M7 wave 7D5 S2, ADR 0123). Each room is asserted to lie outside the policy where the
 *  band is used, so the day the policy admits it this declaration is re-examined. */
function declaredWallBWiderPlans(): readonly KitchenCompositionPlan[] {
  const plans: KitchenCompositionPlan[] = [];
  for (let widthMm = 1600; widthMm <= 4000; widthMm += GRID_STEP_MM) {
    for (let depthMm = 6100; depthMm <= 6300; depthMm += GRID_STEP_MM) {
      const plan = planFor({ shape: "L", widthMm, depthMm, heightMm: 2600 });
      if (plan.minimumMet) plans.push(plan);
    }
  }
  return plans;
}

function approvedWallBMaxMm(): number {
  const l = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (!l) throw new Error("the approved policy declares no L");
  return l.wallB.maxMm;
}

function standsEveryDrawerOnTheWiderWall(
  plan: KitchenCompositionPlan,
  tally: { withADrawer: number; wallBWiderAndBothWallsHoldSlots: number },
): void {
  const reversed = wallReadInReverse(plan.room);
  const slots = plan.bases.filter(isComposedStorageSlot);
  const drawers = slots.filter(
    (slot) => slot.buildId === THREE_DRAWER_BASE_BUILD_ID,
  );
  if (drawers.length === 0) return;
  tally.withADrawer += 1;
  if (reversed === "A" && slots.some((slot) => slot.wall === reversed)) {
    tally.wallBWiderAndBothWallsHoldSlots += 1;
  }

  expect(
    drawers.map((drawer) => drawer.wall),
    roomKeyOf(plan),
  ).toEqual([theOtherWall(reversed)]);
}

function countPostHobDrawers(plans: readonly KitchenCompositionPlan[]): number {
  let withAPostHobSlot = 0;
  for (const plan of plans) {
    const read = inReadingOrder(plan);
    const hobAt = read.findIndex((base) => base.role === "hob");
    if (hobAt < 0) throw new Error(`${roomKeyOf(plan)} composed no hob`);
    const afterTheHob = read.slice(hobAt + 1).filter(isComposedStorageSlot);
    if (afterTheHob.length === 0) continue;
    withAPostHobSlot += 1;

    expect(afterTheHob[0]?.buildId, roomKeyOf(plan)).toBe(
      THREE_DRAWER_BASE_BUILD_ID,
    );
  }
  return withAPostHobSlot;
}
