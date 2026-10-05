// M7 wave 7D4 slice S4 — criteria 6, 7, 9, 12 and 13, asserted on the **built design** rather than
// on the plan.
//
// Slice S2's `drawer-rows.test.ts` proves the rule where it is decided, in
// `planKitchenComposition`. This file asks the other half of every one of those criteria: that what
// the composer planned is what the command path actually built, at the width it planned, with no
// second drawer arriving from anywhere else in generation. Criterion 7's words are *"the only drawer
// bodies **generation places**"*, and only a design can answer that.
//
// **Three things this file is careful about, each a ruling rather than a preference.**
//
// 1. A slot is reached through `isComposedStorageSlot` — never `role === "storage"`, which the block's
//    full-height columns also carry (ADR 0110 E5.2), and never a width, which E6.2 lets the block's
//    outermost column take up to 800. Measured, those two scopings are wrong on 32.8 % and 14.9 % of
//    placed rooms **against output that is right** (D12), so meeting one looks like a defect in a
//    closed wave and is not.
// 2. A placed body is matched to the module that planned it **through the log's own step**, because a
//    design placement carries no planned id. Provenance again, and for the same reason.
// 3. **Nothing here asserts that no drawer stands after the hob.** The owner's run order puts one
//    there deliberately (R6, D6, D14.5); a criterion of that shape was drafted, deleted, and
//    re-adding it is a finding rather than a fix.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  DOOR_BASE_BUILD_ID,
  findOverflowingPlacementIds,
  GENERATION_PRIORITIES,
  generateKitchen,
  isComposedStorageSlot,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  replayGenerationLog,
  THREE_DRAWER_BASE_BUILD_ID,
  validateDesignForCatalog,
  type BodyProbeFactory,
  type Design,
  type DesignRoom,
  type DesignWall,
  type GenerationBaseRole,
  type GenerationLog,
} from "../../src/index.js";
import { approvedLRoom } from "../support/composed-run-baseline.js";
import { narrowerEnteredWall } from "../support/entered-walls.js";
import { ruledSlotWidthMm } from "../support/fridge-end-leftover.js";
import { twoWallPlanOf } from "../support/two-wall-plan-of.js";
import {
  createFakeProbeFactory,
  createLeaseLedger,
} from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";

/** The seed the 7D3 recording was taken at, reused here so a room that fails one suite can be looked
 *  up in the other. Nothing below depends on the recording itself. */
const SWEEP_SEED = 20260916;

/** Risk 14's table is written in samples per arm, so every floor below is its hundred. The run count
 *  is what the table's second column asks for the **scarcest arm this slice needs**: the block
 *  absorbing a remainder is 10.9 % of placed rooms, 918 runs for 100 samples. Measured under the
 *  pre-7A3 policy at this seed over 1 000 runs: 876 placed, 407 with two or more composed slots, 312
 *  with none, 326 composing a post-hob drawer, 550 composing none, 107 absorbing a remainder into the
 *  block. */
const SWEEP_RUNS = 1000;
const ARM_FLOOR = 100;

/** The wall-B arm is scarce in the sweep above and not enough on its own. Risk 14 allows the other
 *  answer, *an arbitrary that constructs the arm*: a wall B wider than wall A carries the run, hob
 *  included, and a depth band that leaves a storage module past the hob puts the drawer there.
 *
 *  **Re-constructed for M7 wave 7D8, and the arm it draws is the physical one.** The band was
 *  900–1500 × 2800–5100 while wall B was the wall the layout reversed; after the re-key that band
 *  composed a post-hob slot on wall B in 13.0 % of its rooms. S1 spends another 300 mm after the
 *  hob, so the constructed depth band moved to 4 400-4 700.
 *
 *  **Re-constructed for M7 wave 7D5 S2, and now outside the approved policy (Q-H6a = A; ADR 0123).**
 *  The pan drawer before the hob spends one more 600 mm module of the hob's wall, and where that wall
 *  had room for only one more the pan drawer takes it. A post-hob slot on physical wall B now needs
 *  5 100 mm of wall-B run — the core, the pan drawer, the bottle, one slot and the three-column
 *  block — and wall B's run starts 100 mm from the corner further than wall A's, so it needs a wall B
 *  of 6 100 mm where the policy stops at 6 000. The architect's census: 26 975 admitted rooms → 0.
 *  The band below is therefore **declared**: wall A 1 600-4 000 × wall B 6 100-6 300 (6 300 is the
 *  room schema's own limit), every room asserted to lie past the policy, and both hundreds kept at
 *  full strength rather than lowered. Measured on a 50 × 25 mm grid of this band: 441 placed, 441
 *  with the post-hob slot on wall B, 333 of those with a slot on wall A as well. */
const CONSTRUCTED_WALL_B_RUNS = 900;

/** The wall-A arm of the post-hob drawer, constructed for the same reason (M7 wave 7D5 S2, Q-H6a = A;
 *  ADR 0123). Inside the approved policy that drawer now survives only at **wall A exactly 6 000 mm**
 *  — D15.7's population fell from 56 866 rooms to 431 — so the 1 mm draw above reaches it in 6 of
 *  1 000 runs and cannot carry the hundred on its own. The arm is still a real, admitted room: every
 *  draw below is wall A 6 000 and any wall B the policy admits. Measured on a 50 mm grid of wall B:
 *  101 placed, 87 composing the post-hob drawer. */
const CONSTRUCTED_WALL_A_RUNS = 300;
const POST_HOB_DRAWER_WALL_A_MM = 6000;

/** Criterion 13 asks for 200 samples and each run composes the same room three times — twice for the
 *  determinism clause and once more through the replay. Measured: 263 of 300 placed. */
const DETERMINISM_RUNS = 300;
const DETERMINISM_FLOOR = 200;

const STORAGE_MODULE_WIDTH_MM = 600;

/** The two bodies generation may stand in a slot the storage run composed. */
const COMPOSED_STORAGE_BODIES = [
  DOOR_BASE_BUILD_ID,
  THREE_DRAWER_BASE_BUILD_ID,
];

/** The planned id 7D5 S2 gives the pan drawer, asserted as a literal so a wrong constant and a wrong
 *  composer cannot agree (ADR 0121 decision 3(b)). */
const PAN_DRAWER_PLANNED_ID = "pan-drawer";
const PAN_DRAWER_BODY = "base-panbank";

/** 7D5b S1 / ADR 0110 M1/M8/M9: the dishwasher's planned id and body, literals for the same reason. */
const DISHWASHER_PLANNED_ID = "dishwasher";
const DISHWASHER_BODY = "base-dishwasher";
const PREPARATION_PLANNED_ID = "preparation";

/** 7D5 S3 / Q-H5: the threshold drawer's planned id, a literal for the same reason. */
const THRESHOLD_DRAWER_PLANNED_ID = "threshold-drawer";

/** E1's threshold as the owner stated it (ADR 0110 wave 7D5, Q-H5): *D*, the plain cabinets —
 *  composed slots, the pan drawer and the threshold drawer; never the preparation cabinet, the bottle
 *  or a column — reaches six, and fewer than two of them are drawers. */
const LARGE_RUN_PLAIN_CABINET_COUNT = 6;
const LARGE_RUN_DRAWER_COUNT = 2;

/** The bodies that count as drawers among *D*. */
const DRAWER_CABINET_BODIES: ReadonlySet<string> = new Set([
  THREE_DRAWER_BASE_BUILD_ID,
  PAN_DRAWER_BODY,
]);

/** The threshold drawer is sampled in 6.4 % of the approved grid's placed rooms (15 795 of 245 211);
 *  measured at `SWEEP_SEED` over the criteria 6/7 sweep's two draws: 74 rooms. */
const THRESHOLD_DRAWER_FLOOR = 30;

/** 7D5b S1 / ADR 0110 M9: (e) rooms are 24 160 of 245 211 placed (9.9 %). */
const E_SWAP_FLOOR = 10;

interface GeneratedKitchen {
  readonly design: Design;
  readonly log: GenerationLog;
}

/** A module the composer planned, paired with the placement the command path built for it. */
interface ComposedModule {
  readonly plannedId: string;
  readonly role: GenerationBaseRole;
  readonly buildId: string;
  readonly wall: DesignWall;
  readonly alongMm: number;
  readonly builtWidthMm: number;
  readonly plannedWidthMm: number;
}

function generated(room: DesignRoom): GeneratedKitchen | undefined {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  return result.ok ? result : undefined;
}

/** Every planned base that reached the design, reached through the log's step — the only thing that
 *  carries a placement's provenance, since a placement's own id is the shell's. */
function composedModules(kitchen: GeneratedKitchen): readonly ComposedModule[] {
  return kitchen.log.plan.bases.flatMap((base) => {
    const step = kitchen.log.steps.find(
      (candidate) => candidate.id === base.id,
    );
    if (!step || step.status !== "placed") return [];
    const placement = kitchen.design.placements.find(
      (candidate) => candidate.id === step.placementId,
    );
    if (!placement) throw new Error(`step ${step.id} names no placement`);
    return [
      {
        plannedId: base.id,
        role: base.role,
        buildId: placement.body.buildId,
        wall: placement.wall,
        alongMm: placement.alongMm,
        builtWidthMm: placement.body.widthMm,
        plannedWidthMm: base.widthMm,
      },
    ];
  });
}

function alongTheWall(
  modules: readonly ComposedModule[],
  wall: DesignWall,
): readonly ComposedModule[] {
  return [...modules.filter((module) => module.wall === wall)].sort(
    (left, right) => left.alongMm - right.alongMm,
  );
}

/**
 * The wall the kitchen is laid out **against** the order it is read in — the narrower entered wall,
 * and wall B where the two are equal, because M7 wave 7D8 keyed the run onto the wider one (ADR 0120
 * Amendment E; ADR 0110 Amendment I re-points D2's reversal at it).
 *
 * Derived in `entered-walls.ts` from the room the customer entered, never from
 * `generation-priorities.ts`: this file's whole value is being a second derivation, and one that
 * asked the composer which wall it reversed would agree with it whatever it reversed.
 */
function wallReadInReverse(room: DesignRoom): DesignWall {
  return narrowerEnteredWall(room);
}

/** The kitchen as it is read: the reversed wall from its free end toward the corner, then the other
 *  wall from the corner outward (ADR 0110 A1 and D2) — the whole of D15.7. */
function inReadingOrder(
  modules: readonly ComposedModule[],
  room: DesignRoom,
): readonly ComposedModule[] {
  const reversed = wallReadInReverse(room);
  return [
    ...[...alongTheWall(modules, reversed)].reverse(),
    ...alongTheWall(modules, reversed === "A" ? "B" : "A"),
  ];
}

function composedSlotsAfterTheHob(
  modules: readonly ComposedModule[],
  room: DesignRoom,
): readonly ComposedModule[] {
  const read = inReadingOrder(modules, room);
  const hobAt = read.findIndex((module) => module.role === "hob");
  if (hobAt < 0) throw new Error("the design holds no hob to read past");
  return read.slice(hobAt + 1).filter(isComposedSlot);
}

function isComposedSlot(module: ComposedModule): boolean {
  return isComposedStorageSlot({ id: module.plannedId });
}

/**
 * 7D5 S3 / Q-H5: the one threshold drawer the owner ruled, where the ruling stands — exactly one
 * module with that planned id, a 600 mm storage module, in a kitchen whose *other* plain cabinets
 * already reach E1's six with fewer than two drawers among them. Any other third drawer body, a
 * second threshold drawer, or one standing where *D* was five, is not ruled and is not returned.
 */
function ruledThresholdDrawer(
  modules: readonly ComposedModule[],
): ComposedModule | undefined {
  const thresholdDrawers = modules.filter(
    (module) => module.plannedId === THRESHOLD_DRAWER_PLANNED_ID,
  );
  const [thresholdDrawer] = thresholdDrawers;
  if (thresholdDrawers.length !== 1 || thresholdDrawer === undefined) {
    return undefined;
  }
  const otherPlainCabinets = modules.filter(
    (module) =>
      isComposedSlot(module) || module.plannedId === PAN_DRAWER_PLANNED_ID,
  );
  const drawersAmongThem = otherPlainCabinets.filter((module) =>
    DRAWER_CABINET_BODIES.has(module.buildId),
  );
  const isRuled =
    thresholdDrawer.role === "storage" &&
    thresholdDrawer.plannedWidthMm === STORAGE_MODULE_WIDTH_MM &&
    otherPlainCabinets.length >= LARGE_RUN_PLAIN_CABINET_COUNT &&
    drawersAmongThem.length < LARGE_RUN_DRAWER_COUNT;
  return isRuled ? thresholdDrawer : undefined;
}

/**
 * 7D5b S1 / ADR 0110 M1/M8/M9: the preparation module's body, asserted as M8 narrows F5. It is the
 * 3-drawer, except in an M7(e) room, where the dishwasher took the 3-drawer's module and the
 * preparation id and role moved onto the pan drawer beyond it — so the body is `base-panbank`, the
 * dishwasher is read immediately before it, and it is the kitchen's only pan drawer. Answers whether
 * the room was an (e) room.
 */
function preparationBodyIsRuled(
  modules: readonly ComposedModule[],
  room: DesignRoom,
): boolean {
  const key = `${String(room.widthMm)}x${String(room.depthMm)}`;
  const preparation = modules.find((module) => module.role === "preparation");
  if (!preparation) return false;
  expect([THREE_DRAWER_BASE_BUILD_ID, PAN_DRAWER_BODY], key).toContain(
    preparation.buildId,
  );
  if (preparation.buildId !== PAN_DRAWER_BODY) return false;

  const read = inReadingOrder(modules, room);
  const preparationAt = read.indexOf(preparation);
  expect(read[preparationAt - 1]?.plannedId, key).toBe(DISHWASHER_PLANNED_ID);
  expect(read[preparationAt - 1]?.buildId, key).toBe(DISHWASHER_BODY);
  expect(read[preparationAt - 1]?.wall, key).toBe(preparation.wall);
  expect(
    modules.filter((module) => module.buildId === PAN_DRAWER_BODY),
    key,
  ).toEqual([preparation]);
  return true;
}

/** Criteria 6 and 7 at one room: the drawer body stands in the preparation module and the first
 *  post-hob slot and nowhere else — and, since 7D5 S3 / Q-H5, in the ruled threshold drawer. Answers
 *  which arm the room exercised and whether it stood that drawer, or nothing if refused. */
function drawerBodiesStandWhereRuled(room: DesignRoom):
  | {
      readonly arm: "withDrawerSlot" | "withoutDrawerSlot";
      readonly standsARuledThresholdDrawer: boolean;
      readonly isAnESwapRoom: boolean;
    }
  | undefined {
  const kitchen = generated(room);
  if (!kitchen) return undefined;
  const modules = composedModules(kitchen);
  const postHob = composedSlotsAfterTheHob(modules, room)[0];
  const thresholdDrawer = ruledThresholdDrawer(modules);
  const isAnESwapRoom = preparationBodyIsRuled(modules, room);
  // 7D5 S3 / Q-H5. Was: the preparation module and the first post-hob slot, and nothing else.
  // 7D5b S1 / ADR 0110 M1/M8/M9: the preparation module holds the 3-drawer except in an (e) room,
  // where it is the pan drawer (checked above) and the 3-drawer it had is now the dishwasher.
  const expected = modules
    .filter(
      (module) =>
        (module.role === "preparation" && !isAnESwapRoom) ||
        module.plannedId === postHob?.plannedId ||
        module === thresholdDrawer,
    )
    .map((module) => module.plannedId);

  expect(
    modules
      .filter((module) => module.buildId === THREE_DRAWER_BASE_BUILD_ID)
      .map((module) => module.plannedId),
    `${String(room.widthMm)}x${String(room.depthMm)}`,
  ).toEqual(expected);
  return {
    arm: postHob ? "withDrawerSlot" : "withoutDrawerSlot",
    standsARuledThresholdDrawer: thresholdDrawer !== undefined,
    isAnESwapRoom,
  };
}

function approvedWallBMaxMm(): number {
  const l = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (!l) throw new Error("the approved policy declares no L");
  return l.wallB.maxMm;
}

/** An admitted room at wall A 6 000 mm — the only wall A that still composes a post-hob drawer. */
function postHobDrawerOnWallARoom(): fc.Arbitrary<DesignRoom> {
  return approvedLRoom().map((room) => ({
    ...room,
    widthMm: POST_HOB_DRAWER_WALL_A_MM,
  }));
}

describe("criteria 6 and 7 — the two drawer bodies a kitchen gets, and no third", () => {
  it("builds a drawer body in the preparation module and the first post-hob slot, and nowhere else", () => {
    // **The with-drawer arm is floored over a constructed draw since M7 wave 7D5 S2 (Q-H6a = A; ADR
    // 0123)**: the policy-wide draw reaches it in 6 of 1 000 runs now, and the floor stays at the
    // hundred rather than falling to what that draw happens to find. See `CONSTRUCTED_WALL_A_RUNS`.
    const arms = { withDrawerSlot: 0, withoutDrawerSlot: 0 };
    let thresholdDrawersRuled = 0;
    let eSwapRooms = 0;
    const countArm = (room: DesignRoom) => {
      const outcome = drawerBodiesStandWhereRuled(room);
      if (!outcome) return;
      arms[outcome.arm] += 1;
      if (outcome.standsARuledThresholdDrawer) thresholdDrawersRuled += 1;
      if (outcome.isAnESwapRoom) eSwapRooms += 1;
    };
    fc.assert(fc.property(approvedLRoom(), countArm), {
      numRuns: SWEEP_RUNS,
      seed: SWEEP_SEED,
    });
    fc.assert(fc.property(postHobDrawerOnWallARoom(), countArm), {
      numRuns: CONSTRUCTED_WALL_A_RUNS,
      seed: SWEEP_SEED,
    });

    expect(arms.withDrawerSlot).toBeGreaterThanOrEqual(ARM_FLOOR);
    expect(arms.withoutDrawerSlot).toBeGreaterThanOrEqual(ARM_FLOOR);
    // 7D5 S3 / Q-H5: the third drawer body's one ruled arm, reached rather than assumed.
    expect(thresholdDrawersRuled).toBeGreaterThanOrEqual(
      THRESHOLD_DRAWER_FLOOR,
    );
    // 7D5b S1 / ADR 0110 M8/M9: the (e) arm is reached, so the preparation-body branch is exercised.
    // 24 160 of 245 211 placed rooms (9.9 %) per M9; floored at a tenth of this draw's expectation.
    expect(eSwapRooms).toBeGreaterThanOrEqual(E_SWAP_FLOOR);
  });

  it("gives every other composed slot the door body, asserted along each wall", () => {
    // The expectation is decided in the **reading** order and asserted in the **spatial** one, so
    // wall B's reversal has to be right in both places for this to pass (criterion 7, ADR 0110 D2).
    const arms = { twoOrMoreSlots: 0, noSlots: 0 };
    fc.assert(
      fc.property(approvedLRoom(), (room) => {
        const kitchen = generated(room);
        if (!kitchen) return;
        const modules = composedModules(kitchen);
        const slots = modules.filter(isComposedSlot);
        if (slots.length >= 2) arms.twoOrMoreSlots += 1;
        if (slots.length === 0) arms.noSlots += 1;
        const drawerSlot = composedSlotsAfterTheHob(modules, room)[0];

        for (const wall of ["A", "B"] as const) {
          const spatial = alongTheWall(modules, wall).filter(isComposedSlot);
          expect(
            spatial.map((slot) => slot.buildId),
            `${String(room.widthMm)}x${String(room.depthMm)} wall ${wall}`,
          ).toEqual(
            spatial.map((slot) =>
              slot.plannedId === drawerSlot?.plannedId
                ? THREE_DRAWER_BASE_BUILD_ID
                : DOOR_BASE_BUILD_ID,
            ),
          );
        }
      }),
      { numRuns: SWEEP_RUNS, seed: SWEEP_SEED },
    );

    expect(arms.twoOrMoreSlots).toBeGreaterThanOrEqual(ARM_FLOOR);
    expect(arms.noSlots).toBeGreaterThanOrEqual(ARM_FLOOR);
  });

  it("fills a kitchen's composed slots from at most two bodies, the drawer appearing at most once", () => {
    // **Criterion 6's enumeration is asserted as a membership, not as its three listed sets, and the
    // reason is measured rather than preferred.** The criterion says a kitchen's distinct composed-slot
    // bodies are `{}`, `{base-cabinet}` or `{base-cabinet, base-3drawer}`. A kitchen whose **only**
    // composed slot stands after the hob composes `{base-3drawer}`, which that list does not hold — and
    // the composer is right: D15.3 gives the first post-hob slot the drawer and there is no other
    // slot to keep a door. **Measured under the pre-7A3 policy** (wall A to 6300, which M7 7A3 no
    // longer accepts), over a 4 000-run sweep: 394 of 3 547 placed rooms, 11.1 %, witness
    // **6229 x 1489 x 2641** with one composed slot. The enumeration is
    // the stale half of a criterion restated under D15, and **widening it is not this slice's to
    // do** — the finding is reported, and what is asserted here is the clause the criterion exists
    // for.
    fc.assert(
      fc.property(approvedLRoom(), (room) => {
        const kitchen = generated(room);
        if (!kitchen) return;
        const slots = composedModules(kitchen).filter(isComposedSlot);
        const unexpected = slots
          .map((slot) => slot.buildId)
          .filter((buildId) => !COMPOSED_STORAGE_BODIES.includes(buildId));

        expect(
          unexpected,
          `${String(room.widthMm)}x${String(room.depthMm)}`,
        ).toEqual([]);
        expect(
          slots.filter((slot) => slot.buildId === THREE_DRAWER_BASE_BUILD_ID)
            .length,
        ).toBeLessThanOrEqual(1);
      }),
      { numRuns: SWEEP_RUNS, seed: SWEEP_SEED },
    );
  });

  it("finds the post-hob slot on wall B where the hob stands there, over a constructed arm", () => {
    // D15.7 on physical wall B — M7 wave 7D8's P6a, 5 910 placed rooms then, 0 admitted rooms since
    // 7D5 S2 (see `CONSTRUCTED_WALL_B_RUNS` for the declared band that replaces them). Wall B is the wider wall in
    // every room this band draws, so the run ends on it, the hob stands among its core and the slot
    // the run reaches next is wall B's **first**, with wall A's own slot read before the hob and
    // keeping its door. A lookup left on the letter `"A"` takes wall A's slot instead, and every
    // width, count, remainder and provenance in the design stays correct while it does.
    //
    // **What this arm asserted before 7D8, and where that went.** It read the drawer off wall B's
    // **highest** index, because wall B was then the wall laid out against the reading order. That
    // population is empty now — the hob is the run's last core role and the run ends on the wider
    // wall — so the descending-index half of D15.7 is witnessed at the composer's unit boundary
    // against a declared pair of runs, in
    // `qa-7d8-the-run-follows-the-wider-wall.adversarial.test.ts` (ADR 0091 Amendment A: moved, and
    // asserted there at least as strongly, rather than relaxed here).
    let onWallB = 0;
    let withASlotOnWallAToo = 0;
    fc.assert(
      fc.property(
        fc.record({
          shape: fc.constant("L" as const),
          widthMm: fc.integer({ min: 1600, max: 4000 }),
          depthMm: fc.integer({ min: 6100, max: 6300 }),
          heightMm: fc.integer({ min: 2200, max: 3900 }),
        }),
        (room) => {
          // Declared past the policy (M7 wave 7D5 S2, ADR 0123): the day the policy admits this band
          // the arm is back in the approved draw, and this construction should be re-examined.
          expect(room.depthMm).toBeGreaterThan(approvedWallBMaxMm());
          const kitchen = generated(room);
          if (!kitchen) return;
          const modules = composedModules(kitchen);
          const drawerSlot = composedSlotsAfterTheHob(modules, room)[0];
          if (!drawerSlot) return;
          onWallB += 1;
          const alongB = alongTheWall(modules, "B").filter(isComposedSlot);
          const alongA = alongTheWall(modules, "A").filter(isComposedSlot);
          if (alongA.length > 0) withASlotOnWallAToo += 1;

          expect(drawerSlot.wall).toBe("B");
          expect(drawerSlot.plannedId).toBe(alongB[0]?.plannedId);
          expect(drawerSlot.buildId).toBe(THREE_DRAWER_BASE_BUILD_ID);
          expect(alongA.map((slot) => slot.buildId)).toEqual(
            alongA.map(() => DOOR_BASE_BUILD_ID),
          );
        },
      ),
      { numRuns: CONSTRUCTED_WALL_B_RUNS, seed: SWEEP_SEED },
    );

    expect(onWallB).toBeGreaterThanOrEqual(ARM_FLOOR);
    // The wrong letter needs somewhere to land before the assertion above can catch it: a room whose
    // narrower wall also holds a composed slot.
    expect(
      withASlotOnWallAToo,
      "no drawn room held a composed slot on wall A as well as on wall B",
    ).toBeGreaterThanOrEqual(ARM_FLOOR);
  });
});

describe("criterion 9 — every generated module is built on the grid", () => {
  it("builds every base at the width the composer planned for it", () => {
    // The centred-sliver case, G5: a discrete-width body dropped into a wider opening is built at
    // the widest size its set holds and centred, leaving slivers. It presents as a built width below
    // the planned one, which is what this reads. **Not** *narrower than the opening it stands in* —
    // criterion 10's own merge witness legitimately puts a 600 mm module in a 698 mm opening.
    let composedSlots = 0;
    fc.assert(
      fc.property(approvedLRoom(), (room) => {
        const kitchen = generated(room);
        if (!kitchen) return;

        const plan = twoWallPlanOf(kitchen.log);
        const runs = lShellFloorRuns(room);
        for (const module of composedModules(kitchen)) {
          expect(module.builtWidthMm, module.plannedId).toBe(
            module.plannedWidthMm,
          );
          if (!isComposedSlot(module)) continue;
          composedSlots += 1;
          // One module, plus what the owner's Q6 gives the cabinet beside an end fridge (M7C wave C5 S1).
          const slot = plan.bases.find((base) => base.id === module.plannedId);
          if (!slot) throw new Error(`${module.plannedId} is not in the plan`);
          expect(module.builtWidthMm, module.plannedId).toBe(
            ruledSlotWidthMm(plan, slot, runs[slot.wall].endMm),
          );
        }
      }),
      { numRuns: SWEEP_RUNS, seed: SWEEP_SEED },
    );

    expect(composedSlots).toBeGreaterThanOrEqual(ARM_FLOOR);
  });

  // **Retired in M7 wave 7D5 S2: "generates no pan drawer before 7D5 S2, at any room in the policy".**
  // It guarded the promise that no `base-panbank` would be generated until the wave that owns it, and
  // the owner's Q-H6 = A (ADR 0110 Amendment J1) is that wave. Its ruled replacement — the pan drawer
  // immediately before the hob, and omitted where it would cost a core role, the bottle or a column —
  // is asserted at the composer in `pan-drawer-before-the-hob.test.ts`. What this file owes is the
  // built half, below: nothing weaker than the guard it replaces (ADR 0091 Amendment A).
  it("builds the pan drawer only as the planned module immediately before the hob, at one module", () => {
    let withPanDrawer = 0;
    fc.assert(
      fc.property(approvedLRoom(), (room) => {
        const kitchen = generated(room);
        if (!kitchen) return;
        const modules = composedModules(kitchen);
        const panDrawers = modules.filter(
          (module) => module.buildId === PAN_DRAWER_BODY,
        );
        if (panDrawers.length === 0) return;
        withPanDrawer += 1;
        const read = inReadingOrder(modules, room);
        const hobAt = read.findIndex((module) => module.role === "hob");
        const key = `${String(room.widthMm)}x${String(room.depthMm)}`;

        // 7D5b S1 / ADR 0110 M1/M8/M9: was *its planned id is `pan-drawer`*. The pan drawer is found
        // by its body; in an (e) room it carries the preparation id and role (M9) and the dishwasher
        // is read immediately before it, where the 3-drawer stood.
        expect(panDrawers, key).toHaveLength(1);
        const [panDrawer] = panDrawers;
        expect([PAN_DRAWER_PLANNED_ID, PREPARATION_PLANNED_ID], key).toContain(
          panDrawer?.plannedId,
        );
        expect(read[hobAt - 1], key).toBe(panDrawer);
        expect(read[hobAt - 1]?.wall, key).toBe(read[hobAt]?.wall);
        if (panDrawer?.plannedId === PREPARATION_PLANNED_ID) {
          expect(panDrawer.role, key).toBe("preparation");
          expect(read[hobAt - 2]?.plannedId, key).toBe(DISHWASHER_PLANNED_ID);
        }
        expect(panDrawers[0]?.builtWidthMm, key).toBe(STORAGE_MODULE_WIDTH_MM);
      }),
      { numRuns: SWEEP_RUNS, seed: SWEEP_SEED },
    );

    expect(withPanDrawer).toBeGreaterThanOrEqual(ARM_FLOOR);
  });
});

describe("criterion 13 — 7D2's and 7D3's guarantees still hold", () => {
  it("returns a valid, non-overflowing, replayable kitchen for the same room twice", () => {
    let placed = 0;
    fc.assert(
      fc.property(approvedLRoom(), (room) => {
        const first = generateKitchen({
          room,
          occurredAt: OCCURRED_AT,
          probeAt: createFakeProbeFactory(),
        });
        const second = generateKitchen({
          room,
          occurredAt: OCCURRED_AT,
          probeAt: createFakeProbeFactory(),
        });

        expect(second).toStrictEqual(first);
        if (!first.ok) return;
        placed += 1;
        const catalog = buildKitchenLBodyCatalog(
          cabinetDepthMmOf(first.design),
        );
        expect(validateDesignForCatalog(first.design, catalog)).toEqual([]);
        expect(findOverflowingPlacementIds(first.design)).toEqual([]);
        expect(
          replayGenerationLog({
            log: first.log,
            probeAt: createFakeProbeFactory(),
          }),
        ).toStrictEqual(first.design);
        // ADR 0110 E4, 7D3's criterion 2: one oven, never two and never zero, whichever body carries
        // it. A wave that changes which body fills a slot is exactly the wave that could double it.
        expect(
          first.design.placements.filter((placement) =>
            ["base-hob-oven", "tall-oven-tower"].includes(
              placement.body.buildId,
            ),
          ),
        ).toHaveLength(1);
      }),
      { numRuns: DETERMINISM_RUNS, seed: SWEEP_SEED },
    );

    expect(placed).toBeGreaterThanOrEqual(DETERMINISM_FLOOR);
  });

  it("releases the probe lease on a throw as well as on a refusal", () => {
    const thrownLedger = createLeaseLedger();
    const factory = createFakeProbeFactory({}, thrownLedger);
    const throwingFactory: BodyProbeFactory = (cabinetDepthMm) => {
      const lease = factory(cabinetDepthMm);
      return {
        use: <T>(borrow: Parameters<typeof lease.use<T>>[0]): T =>
          lease.use(() =>
            borrow({
              measure: () => {
                throw new Error("probe boom");
              },
            }),
          ),
      };
    };
    const refusedLedger = createLeaseLedger();

    expect(() =>
      generateKitchen({
        room: KITCHEN_L_DESIGN.room,
        occurredAt: OCCURRED_AT,
        probeAt: throwingFactory,
      }),
    ).toThrow("probe boom");
    expect(thrownLedger).toMatchObject({ taken: 1, released: 1 });
    expect(
      generateKitchen({
        room: { shape: "L", widthMm: 900, depthMm: 2000, heightMm: 2200 },
        occurredAt: OCCURRED_AT,
        probeAt: createFakeProbeFactory({}, refusedLedger),
      }).ok,
    ).toBe(false);
    expect(refusedLedger).toMatchObject({ taken: 1, released: 1 });
  });
});

describe("criterion 12 — the room rule is unmoved", () => {
  it("declares exactly two required roles, and they are the sink and the hob", () => {
    // G11: `generatedRequiredWidthMm` reads only these two rows and throws unless each is required.
    // A row this wave adds or re-bodies cannot become a room prerequisite while this holds — which
    // is the must-not, stated over the whole list rather than over the two rows it names.
    expect(
      GENERATION_PRIORITIES.filter((priority) => priority.required).map(
        (priority) => priority.role,
      ),
    ).toEqual(["sink", "hob"]);
  });

  it("leaves the preparation cabinet optional now that it carries a drawer body", () => {
    const preparation = GENERATION_PRIORITIES.find(
      (priority) => priority.role === "preparation",
    );

    expect(preparation).toMatchObject({
      buildId: THREE_DRAWER_BASE_BUILD_ID,
      required: false,
      widthMm: STORAGE_MODULE_WIDTH_MM,
    });
  });

  it.each([
    { shape: "L", widthMm: 900, depthMm: 2200, heightMm: 2200 },
    { shape: "L", widthMm: 2100, depthMm: 1000, heightMm: 2200 },
  ] as const)("composes a sink and a hob and nothing else in %o", (room) => {
    // The minimum kitchen, and the one room shape where a drawer body arriving uninvited would be
    // most visible. Whether these rooms are accepted at all is 7A2's coupled rule, which this wave
    // leaves untouched: `minimumMet` is part of the recorded plan every room in
    // `qa-7d4-nothing-but-the-body-moved` is compared against.
    const kitchen = generated(room);
    if (!kitchen) throw new Error("the minimum room composed no kitchen");

    expect(
      inReadingOrder(composedModules(kitchen), room).map(
        (module) => module.role,
      ),
    ).toEqual(["sink", "hob"]);
    expect(kitchen.log.plan.dropped).toEqual(["fridge", "preparation"]);
  });
});
