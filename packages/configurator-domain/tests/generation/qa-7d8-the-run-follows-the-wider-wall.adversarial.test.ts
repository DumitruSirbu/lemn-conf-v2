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
  type GenerationRun,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
} from "../../src/index.js";

const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);

/** 50 mm rather than the 100 mm this wave's sibling files sweep at: the arm where the reversed wall
 *  carries two core bodies to reverse is 1.2 % of placed rooms, and a coarser grid draws 25 of them.
 *  Measured on this grid: 8 615 placed plans, 3 335 with wall B wider, 5 209 with wall A wider, 71
 *  equal, and 103 in the two-body arm. */
const GRID_STEP_MM = 50;

/** The run order, read off the owner's ruled priority list rather than spelled again here — a kitchen
 *  is read fridge, sink, preparation, hob whichever wall each stands on (ADR 0110 Amendment A1). */
const RUN_ORDER: readonly string[] = GENERATION_PRIORITIES.map(
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
 * **Derived from the room and never from `generation-priorities.ts`.** This is the test-side twin of
 * production's `isLaidOutInReverse`, and the independence is the whole asset: the two agree only if
 * both read the owner's wider-wall rule the same way (7D8 adjudication, finding C2).
 */
function wallReadInReverse(room: DesignRoom): DesignWall {
  return wallLengthMm("B", room) > wallLengthMm("A", room) ? "A" : "B";
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
): readonly string[] {
  return bases
    .filter((base) => base.role !== "storage")
    .map((base) => base.role);
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
        RUN_ORDER.filter(
          (role) =>
            !plan.dropped.includes(role as (typeof plan.dropped)[number]),
        ),
      );
    }

    expect(SWEPT_PLANS.length).toBeGreaterThanOrEqual(8000);
    expect(arms.wallBWider).toBeGreaterThanOrEqual(3000);
    expect(arms.wallAWider).toBeGreaterThanOrEqual(5000);
    expect(arms.equal).toBeGreaterThanOrEqual(50);
    expect(
      reversals.onTheReversedWall,
      "no swept room gave the reversed wall two bodies to reverse",
    ).toBeGreaterThanOrEqual(100);
    expect(reversals.onTheForwardWall).toBeGreaterThanOrEqual(8000);
  });

  it("stands the reversed wall's core against the run and the other wall's core with it", () => {
    // The same expression read spatially rather than through the whole run: along the narrower wall
    // the run's rank **descends** from the corner outward, and along the wider wall it ascends. Two
    // assertions rather than one, because an inversion that flipped both walls at once would leave
    // the concatenated reading order in this file's first test looking merely rotated in a kitchen
    // whose core all stands on one wall.
    let withARankedPair = 0;
    for (const plan of SWEPT_PLANS) {
      const reversed = wallReadInReverse(plan.room);
      const descending = coreRolesOf(alongTheWall(plan, reversed)).map((role) =>
        RUN_ORDER.indexOf(role),
      );
      const ascending = coreRolesOf(
        alongTheWall(plan, theOtherWall(reversed)),
      ).map((role) => RUN_ORDER.indexOf(role));
      if (descending.length >= 2 || ascending.length >= 2) withARankedPair += 1;

      expect(descending, `${roomKeyOf(plan)} wall ${reversed}`).toEqual(
        [...descending].sort((left, right) => right - left),
      );
      expect(
        ascending,
        `${roomKeyOf(plan)} wall ${theOtherWall(reversed)}`,
      ).toEqual([...ascending].sort((left, right) => left - right));
    }

    expect(withARankedPair).toBeGreaterThanOrEqual(8000);
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
  const DECLARED_ARMS = [
    {
      name: "wall B wider, so wall A is read in reverse",
      room: { shape: "L", widthMm: 1500, depthMm: 4000, heightMm: 2600 },
      runs: {
        A: { wall: "A", startMm: 900, endMm: 4600 },
        B: { wall: "B", startMm: 900, endMm: 1400 },
      },
      reversedWall: "A",
    },
    {
      name: "wall A wider, so wall B is read in reverse",
      room: { shape: "L", widthMm: 4000, depthMm: 1500, heightMm: 2600 },
      runs: {
        A: { wall: "A", startMm: 900, endMm: 1400 },
        B: { wall: "B", startMm: 1000, endMm: 4700 },
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

      // The declared design: the hob stands on the wall the run reads **first**, which is the state
      // no admitted room produces.
      expect(hob?.wall).toBe(reversedWall);
      expect(slots).toHaveLength(2);
      // The slots stand corner-outward and the run reads this wall the other way, so the drawer is
      // the **outermost** of them — the one against the hob — and the slot against the corner keeps
      // its door. Under a count that ascended with the wall instead, the two bodies would swap and
      // every width, position, remainder and provenance in this plan would be unchanged.
      expect(slots.map((slot) => slot.buildId)).toEqual([
        DOOR_BASE_BUILD_ID,
        THREE_DRAWER_BASE_BUILD_ID,
      ]);
      expect(slots.at(-1)?.endMm).toBe(hob?.startMm);
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
  // the drawer belongs to wall B's first slot, while **wall A holds a composed slot of its own** that
  // the run reads before the hob. A lookup left on the literal `"A"` finds that slot and gives it the
  // drawer; a lookup on `"A"` in a room where wall A holds no slot composes no drawer at all.
  const DRAWER_ON_THE_WIDER_WALL: DesignRoom = {
    shape: "L",
    widthMm: 1500,
    depthMm: 3400,
    heightMm: 2600,
  };

  it("gives the drawer to the wider wall's slot while the narrower wall's slot keeps its door", () => {
    const plan = planFor(DRAWER_ON_THE_WIDER_WALL);
    const slots = plan.bases.filter(isComposedStorageSlot);

    expect(
      slots.map((slot) => [slot.wall, slot.startMm, slot.buildId]),
    ).toEqual([
      ["A", 900, DOOR_BASE_BUILD_ID],
      ["B", 2700, THREE_DRAWER_BASE_BUILD_ID],
    ]);
  });

  it("stands every composed drawer on the wider entered wall, over the whole sweep", () => {
    // The sabotage's two shapes are both caught here: a drawer that moved to the narrower wall, and a
    // drawer that vanished because the narrower wall had no slot to move it to. The arm floored below
    // is the one where a wrong letter has somewhere to land — a drawer composed in a room whose
    // narrower wall also holds a slot, with wall B the wider of the two.
    const arms = { withADrawer: 0, wallBWiderAndBothWallsHoldSlots: 0 };
    for (const plan of SWEPT_PLANS) {
      const reversed = wallReadInReverse(plan.room);
      const slots = plan.bases.filter(isComposedStorageSlot);
      const drawers = slots.filter(
        (slot) => slot.buildId === THREE_DRAWER_BASE_BUILD_ID,
      );
      if (drawers.length === 0) continue;
      arms.withADrawer += 1;
      if (reversed === "A" && slots.some((slot) => slot.wall === reversed)) {
        arms.wallBWiderAndBothWallsHoldSlots += 1;
      }

      expect(
        drawers.map((drawer) => drawer.wall),
        roomKeyOf(plan),
      ).toEqual([theOtherWall(reversed)]);
    }

    expect(arms.withADrawer).toBeGreaterThanOrEqual(2000);
    expect(
      arms.wallBWiderAndBothWallsHoldSlots,
      "no swept room put a drawer on wall B while wall A also held a slot",
    ).toBeGreaterThanOrEqual(100);
  });

  it("composes a drawer in every kitchen whose run reaches a storage slot after the hob", () => {
    // Stated as a count rather than a shape, because the quietest form of the wrong letter is a
    // kitchen with **no** drawer: `slotsInReadingOrder` on a wall with no slots returns nothing, and
    // `firstStorageSlotAfterTheHob` then answers `undefined` while every other field stays right.
    let withAPostHobSlot = 0;
    for (const plan of SWEPT_PLANS) {
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

    expect(withAPostHobSlot).toBeGreaterThanOrEqual(2000);
  });
});
