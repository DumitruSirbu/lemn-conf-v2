// Criteria 6, 7, 9, 12 and 13 asserted on the built design rather than the plan: what the composer planned is what the
// command path built, at the planned width, with no second drawer arriving from anywhere else in generation.
// A slot is reached through `isComposedStorageSlot`, never `role === "storage"` (the block's full-height columns carry
// it too, ADR 0110 E5.2) or a width (E6.2 lets the block's outermost column take up to 800). A placed body is matched
// to its module through the log's own step, because a design placement carries no planned id. Nothing here asserts
// that no drawer stands after the hob: the owner's run order puts one there deliberately.
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

/** The seed the pre-7D4 recording was taken at, reused so a room that fails one suite can be looked up in the other. */
const SWEEP_SEED = 20260916;

/** Each floor below is a hundred samples per arm; the run count is sized for the scarcest arm this suite needs, the
 *  block absorbing a remainder. */
const SWEEP_RUNS = 1000;
const ARM_FLOOR = 100;

/** The wall-B arm is too scarce in the sweep above, so it is constructed: a wall B wider than wall A carries the run,
 *  hob included, and a depth band that leaves a storage module past the hob puts the drawer there. A post-hob slot on
 *  physical wall B needs 5 100 mm of wall-B run (core, pan drawer, bottle, one slot, three-column block) starting
 *  100 mm further from the corner than wall A's, so the band is declared past the approved policy (ADR 0123): wall A
 *  1 600-4 000 x wall B 6 100-6 300 (6 300 is the room schema's own limit). */
const CONSTRUCTED_WALL_B_RUNS = 900;

/** The wall-A arm of the post-hob drawer, constructed likewise (ADR 0123): inside the approved policy that drawer
 *  survives only at wall A exactly 6 000 mm, so the draw above cannot carry the hundred. Every draw below is wall A
 *  6 000 and any wall B the policy admits. */
const CONSTRUCTED_WALL_A_RUNS = 300;
const POST_HOB_DRAWER_WALL_A_MM = 6000;

/** Criterion 13 asks for 200 samples, and each run composes the same room three times: twice for the determinism
 *  clause and once more through the replay. */
const DETERMINISM_RUNS = 300;
const DETERMINISM_FLOOR = 200;

const STORAGE_MODULE_WIDTH_MM = 600;

/** The two bodies generation may stand in a slot the storage run composed. */
const COMPOSED_STORAGE_BODIES = [
  DOOR_BASE_BUILD_ID,
  THREE_DRAWER_BASE_BUILD_ID,
];

/** Planned ids and bodies are literals, so a wrong constant and a wrong composer cannot agree (ADR 0121). */
const PAN_DRAWER_PLANNED_ID = "pan-drawer";
const PAN_DRAWER_BODY = "base-panbank";

const DISHWASHER_PLANNED_ID = "dishwasher";
const DISHWASHER_BODY = "base-dishwasher";
const PREPARATION_PLANNED_ID = "preparation";

const THRESHOLD_DRAWER_PLANNED_ID = "threshold-drawer";

/** E1's threshold (ADR 0110 Q-H5): *D*, the plain cabinets (composed slots, the pan drawer and the threshold drawer;
 *  never the preparation cabinet, the bottle or a column), reaches six, and fewer than two of them are drawers. */
const LARGE_RUN_PLAIN_CABINET_COUNT = 6;
const LARGE_RUN_DRAWER_COUNT = 2;

/** The bodies that count as drawers among *D*. */
const DRAWER_CABINET_BODIES: ReadonlySet<string> = new Set([
  THREE_DRAWER_BASE_BUILD_ID,
  PAN_DRAWER_BODY,
]);

const THRESHOLD_DRAWER_FLOOR = 30;

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
 * The wall the kitchen is laid out against the order it is read in: the narrower entered wall, wall B where the two
 * are equal (ADR 0120 Amendment E; ADR 0110 Amendment I). Derived in `entered-walls.ts` from the room the customer
 * entered, never from `generation-priorities.ts`: a second derivation that asked the composer which wall it reversed
 * would agree with it whatever it reversed.
 */
function wallReadInReverse(room: DesignRoom): DesignWall {
  return narrowerEnteredWall(room);
}

/** The kitchen as it is read: the reversed wall from its free end toward the corner, then the other
 *  wall from the corner outward (ADR 0110 A1 and D2). */
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
 * The one threshold drawer the owner ruled, where the ruling stands (ADR 0110 Q-H5): exactly one 600 mm storage module
 * with that planned id, in a kitchen whose other plain cabinets already reach E1's six with fewer than two drawers
 * among them. Any other third drawer body is not ruled and is not returned.
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
 * The preparation module's body (ADR 0110 M8): the 3-drawer, except in an M7(e) room, where the dishwasher took the
 * 3-drawer's module and the preparation id and role moved onto the pan drawer beyond it, read directly after the
 * dishwasher and the kitchen's only pan drawer. Answers whether the room was an (e) room.
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

/** Criteria 6 and 7 at one room: the drawer body stands in the preparation module, the first post-hob slot and the
 *  ruled threshold drawer, and nowhere else. Answers the arm the room exercised, or nothing if refused. */
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
  // The preparation module holds the 3-drawer except in an (e) room, where it is the pan drawer (checked above) and
  // the 3-drawer it had is now the dishwasher.
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
    // Floored over a constructed draw: the policy-wide draw reaches the with-drawer arm in too few runs (ADR 0123).
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
    expect(thresholdDrawersRuled).toBeGreaterThanOrEqual(
      THRESHOLD_DRAWER_FLOOR,
    );
    expect(eSwapRooms).toBeGreaterThanOrEqual(E_SWAP_FLOOR);
  });

  it("gives every other composed slot the door body, asserted along each wall", () => {
    // The expectation is decided in the reading order and asserted in the spatial one, so wall B's reversal has to be
    // right in both places for this to pass (ADR 0110 D2).
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
    // Asserted as a membership, not as the criterion's three listed sets: a kitchen whose only composed slot stands
    // after the hob composes `{base-3drawer}`, which that list does not hold, and the composer is right to give the
    // first post-hob slot the drawer. Widening the enumeration is not this file's to do.
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
    // Wall B is the wider wall in every room this band draws, so the run ends on it and the slot read after the hob is
    // wall B's first, with wall A's own slot keeping its door. A lookup left on the letter "A" takes wall A's slot
    // while every width, count, remainder and provenance stays correct. The descending-index half is
    // witnessed in `qa-7d8-the-run-follows-the-wider-wall.adversarial.test.ts`.
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
          // Declared past the policy (ADR 0123): when the policy admits this band, re-examine the construction.
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
    // The wrong letter needs somewhere to land: a room whose narrower wall also holds a composed slot.
    expect(
      withASlotOnWallAToo,
      "no drawn room held a composed slot on wall A as well as on wall B",
    ).toBeGreaterThanOrEqual(ARM_FLOOR);
  });
});

describe("criterion 9 — every generated module is built on the grid", () => {
  it("builds every base at the width the composer planned for it", () => {
    // The centred-sliver case: a discrete-width body dropped into a wider opening is built at the widest size its set
    // holds and centred, which shows as a built width below the planned one. Not "narrower than the opening": a 600 mm
    // module may legitimately stand in a 698 mm opening (criterion 10's merge witness).
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
          // One module, plus what the cabinet beside an end fridge absorbs (`fridge-end-leftover.ts`).
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

        // In an (e) room the pan drawer carries the preparation id and role and the dishwasher is read directly
        // before it, where the 3-drawer stood.
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
        // ADR 0110 E4: one oven, never two and never zero, whichever body carries it.
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
    // `generatedRequiredWidthMm` reads only these two rows and throws unless each is required, so no other row can
    // become a room prerequisite while this holds.
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
    // The minimum kitchen, where a drawer body arriving uninvited would be most visible. `minimumMet` is part of the
    // plan recorded in `qa-7d4-nothing-but-the-body-moved`.
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
