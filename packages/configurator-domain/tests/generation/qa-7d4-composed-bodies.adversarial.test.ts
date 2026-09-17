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
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  DOOR_BASE_BUILD_ID,
  findOverflowingPlacementIds,
  GENERATION_PRIORITIES,
  generateKitchen,
  isComposedStorageSlot,
  KITCHEN_L_DESIGN,
  PAN_DRAWER_BASE_BUILD_ID,
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
 *  composes a post-hob slot on wall B in 13.0 % of its rooms — 32 of 300 draws, under the hundred
 *  risk 14's table asks for. Measured over the band below, 1 500-3 000 x 3 300-3 600 and 451 801
 *  rooms: **63.9 % put the drawer on wall B and 37.5 % hold a composed slot on wall A as well**,
 *  which is the arm a lookup left on the wrong letter would land in. */
const CONSTRUCTED_WALL_B_RUNS = 600;

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

/** ADR 0026 keeps the bottle cargo out of a generated kitchen: it is discrete {200, 300} and fits no
 *  tile this generator plans (G7). The pan drawer is S1b's, kept for 7D5 and placed nowhere here. */
const NEVER_GENERATED_BODIES = ["base-bottle-cargo", PAN_DRAWER_BASE_BUILD_ID];

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

describe("criteria 6 and 7 — the two drawer bodies a kitchen gets, and no third", () => {
  it("builds a drawer body in the preparation module and the first post-hob slot, and nowhere else", () => {
    const arms = { placed: 0, withDrawerSlot: 0, withoutDrawerSlot: 0 };
    fc.assert(
      fc.property(approvedLRoom(), (room) => {
        const kitchen = generated(room);
        if (!kitchen) return;
        arms.placed += 1;
        const modules = composedModules(kitchen);
        const postHob = composedSlotsAfterTheHob(modules, room)[0];
        if (postHob) arms.withDrawerSlot += 1;
        else arms.withoutDrawerSlot += 1;

        const expected = modules
          .filter(
            (module) =>
              module.role === "preparation" ||
              module.plannedId === postHob?.plannedId,
          )
          .map((module) => module.plannedId);
        expect(
          modules
            .filter((module) => module.buildId === THREE_DRAWER_BASE_BUILD_ID)
            .map((module) => module.plannedId),
        ).toEqual(expected);
      }),
      { numRuns: SWEEP_RUNS, seed: SWEEP_SEED },
    );

    expect(arms.withDrawerSlot).toBeGreaterThanOrEqual(ARM_FLOOR);
    expect(arms.withoutDrawerSlot).toBeGreaterThanOrEqual(ARM_FLOOR);
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
    // D15.7 on physical wall B — M7 wave 7D8's P6a, 5 910 placed rooms. Wall B is the wider wall in
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
          widthMm: fc.integer({ min: 1500, max: 3000 }),
          depthMm: fc.integer({ min: 3300, max: 3600 }),
          heightMm: fc.integer({ min: 2200, max: 3900 }),
        }),
        (room) => {
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

        for (const module of composedModules(kitchen)) {
          expect(module.builtWidthMm, module.plannedId).toBe(
            module.plannedWidthMm,
          );
          if (!isComposedSlot(module)) continue;
          composedSlots += 1;
          expect(module.builtWidthMm, module.plannedId).toBe(
            STORAGE_MODULE_WIDTH_MM,
          );
        }
      }),
      { numRuns: SWEEP_RUNS, seed: SWEEP_SEED },
    );

    expect(composedSlots).toBeGreaterThanOrEqual(ARM_FLOOR);
  });

  it("generates no bottle cargo and no pan drawer, at any room in the policy", () => {
    fc.assert(
      fc.property(approvedLRoom(), (room) => {
        const kitchen = generated(room);
        if (!kitchen) return;

        for (const buildId of NEVER_GENERATED_BODIES) {
          expect(
            kitchen.design.placements.map(
              (placement) => placement.body.buildId,
            ),
            `${String(room.widthMm)}x${String(room.depthMm)}`,
          ).not.toContain(buildId);
        }
      }),
      { numRuns: SWEEP_RUNS, seed: SWEEP_SEED },
    );
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
