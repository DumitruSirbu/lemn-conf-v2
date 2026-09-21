// M7 wave 7D4 slice S2 — the two rows that take a drawer body, and the reading order that locates
// the second of them.
//
// The owner's run order puts a drawer group astride the hob (ADR 0110 Amendment H1). 7D4 builds only
// the width-neutral half of it: the **preparation** cabinet and **the first storage slot after the
// hob in the reading order** take the drawer body, every other storage slot takes the door body, and
// no width, count, remainder or cut moves.
//
// **The wall-B case is written first, and it is the reason this file exists.** *The first slot after
// the hob* is the **reading** order, not *the same wall, further along*. The two definitions
// disagree wherever the hob stands on the wall the layout runs in reverse, and **nothing else in the
// wave goes red when the wrong one is built**: the count, the widths, the remainder and the
// provenance all stay correct while the drawer stands in the wrong module or in none (ruling D15.7).
//
// **Re-keyed for M7 wave 7D8 slice S3.** The wall read in reverse is no longer wall B: it is the
// **narrower entered wall**, because the run now follows the wider one (ADR 0120 Amendment E, ADR
// 0110 Amendment I). Every assertion below that named a letter has been re-derived from the rule.
// **The population that separates the two definitions of *after the hob* emptied with that re-key**
// — the hob is the reading order's last core role and it now always stands on the wider wall — so
// that half of D15.7 is witnessed at the composer's unit boundary instead, in
// `qa-7d8-the-run-follows-the-wider-wall.adversarial.test.ts` (ADR 0091 Amendment A: the invariant
// moved, and it is asserted there at least as strongly).
//
// **The reading order below is re-derived from the entered wall lengths and the plan's own spatial
// positions**, never from a planned id and never from production's own helper, so this file and
// `generation-priorities.ts` agree only if both read the owner's wider-wall rule the same way. A
// storage slot is reached through `isComposedStorageSlot` and never through `role === "storage"`:
// the block's full-height columns carry that role deliberately (E5.2), and a rule scoped by it is
// wrong on a third of all placed rooms against output that is correct (D12).
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  DOOR_BASE_BUILD_ID,
  isComposedStorageSlot,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  THREE_DRAWER_BASE_BUILD_ID,
  type DesignRoom,
  type DesignWall,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
} from "../../src/index.js";
import { narrowerEnteredWall } from "../support/entered-walls.js";

const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);
const STORAGE_MODULE_WIDTH_MM = 600;

function planFor(room: DesignRoom): KitchenCompositionPlan {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

function alongTheWall(
  plan: KitchenCompositionPlan,
  wall: DesignWall,
): readonly PlannedGenerationBase[] {
  return [...plan.bases.filter((base) => base.wall === wall)].sort(
    (left, right) => left.startMm - right.startMm,
  );
}

/**
 * The wall the kitchen is laid out against the reading order on — the run's **first** half, read
 * from that wall's free end toward the corner (ADR 0110 Amendment A1 and D2).
 *
 * **It is the narrower entered wall, and wall B where the two are equal**, because the run follows
 * the wider one (ADR 0120 Amendment E). **Derived in `entered-walls.ts` from the room's own two
 * numbers and never imported from `generation-priorities.ts`**: production's `isLaidOutInReverse` is
 * the expression this file exists to disagree with, and importing it would turn an independent
 * oracle into a tautology (7D8 adjudication, finding C2).
 */
function wallReadInReverse(room: DesignRoom): DesignWall {
  return narrowerEnteredWall(room);
}

/** The kitchen in the order it is read: the reversed wall from its free end toward the corner, then
 *  the other wall from the corner outward. That single reversal is the whole of D15.7. */
function inReadingOrder(
  plan: KitchenCompositionPlan,
): readonly PlannedGenerationBase[] {
  const reversed = wallReadInReverse(plan.room);
  const forwards: DesignWall = reversed === "A" ? "B" : "A";
  return [
    ...[...alongTheWall(plan, reversed)].reverse(),
    ...alongTheWall(plan, forwards),
  ];
}

/** Every storage slot the run reaches after the hob, the nearest first. */
function slotsAfterTheHob(
  plan: KitchenCompositionPlan,
): readonly PlannedGenerationBase[] {
  const read = inReadingOrder(plan);
  const hobAt = read.findIndex((base) => base.role === "hob");
  if (hobAt < 0) throw new Error("the plan composed no hob to read past");
  return read.slice(hobAt + 1).filter(isComposedStorageSlot);
}

function bodiesOf(bases: readonly PlannedGenerationBase[]): readonly string[] {
  return bases.map((base) => base.buildId);
}

describe("D15.7 — the slot after the hob is found in the reading order and not along one wall", () => {
  // The witness that separates *after the hob in the reading order* from *the first slot on a named
  // wall*. Wall B is the wider entered wall here, so the run starts at wall A's free end, reads that
  // wall's one slot, crosses the corner and reaches the hob among wall B's core. The slot the run
  // reaches next is wall B's; **wall A's slot is a module the run passed before the hob** and must
  // keep its door.
  const HOB_ON_WALL_B: DesignRoom = {
    shape: "L",
    widthMm: 1500,
    depthMm: 4410,
    heightMm: 2600,
  };

  it("stands the hob on the wider entered wall, with a composed slot on each wall", () => {
    const plan = planFor(HOB_ON_WALL_B);

    expect(plan.minimumMet).toBe(true);
    expect(plan.bases.find((base) => base.role === "hob")?.wall).toBe("B");
    expect(
      plan.bases.filter(isComposedStorageSlot).map((slot) => slot.wall),
    ).toEqual(["A", "B"]);
  });

  it("gives the drawer to the slot the run reaches first after the hob", () => {
    const plan = planFor(HOB_ON_WALL_B);
    const [first, ...rest] = slotsAfterTheHob(plan);

    expect(first?.wall).toBe("B");
    expect(first?.buildId).toBe(THREE_DRAWER_BASE_BUILD_ID);
    expect(bodiesOf(rest)).toEqual([]);
  });

  it("leaves the slot the run read before the hob a door, though it is a wall's first slot", () => {
    // The same disagreement seen spatially, and the form that fails loudest under the wrong rule: an
    // implementation that sought the slot on **wall A** — the letter the prefix wall used to wear —
    // finds this room's only other composed slot and gives it the drawer, while the widths, the
    // count, the remainder and every module's provenance stay exactly as they are below.
    //
    // **What this room can no longer separate, and where that went instead.** *The first slot after
    // the hob* and *the first slot on the hob's own wall* name the same module in every room the
    // approved policy admits, because the hob now always stands on the wall the run reads last. That
    // half of D15.7 is witnessed at the composer's unit boundary in
    // `qa-7d8-the-run-follows-the-wider-wall.adversarial.test.ts` — *the drawer stands at the prefix
    // wall's highest slot index* — under ADR 0091 Amendment A: the invariant moved rather than
    // weakened, and it is asserted there against a declared pair of runs rather than not at all.
    const plan = planFor(HOB_ON_WALL_B);
    const slots = plan.bases.filter(isComposedStorageSlot);

    expect(
      slots.map((slot) => [slot.wall, slot.startMm, slot.buildId]),
    ).toEqual([
      ["A", 900, DOOR_BASE_BUILD_ID],
      ["B", 3700, THREE_DRAWER_BASE_BUILD_ID],
    ]);
    expect(plan.bases.find((base) => base.role === "hob")?.startMm).toBe(2800);
  });
});

// The headline rooms were approved when 7D4 named them and sit past the 6000 mm M7 7A3 ruled; they are
// kept on purpose, because the composer is judged here, not the policy.
describe("criterion 1 — the two drawer rows at the wave's two headline rooms", () => {
  const BLOCK_AT_THE_FREE_END = [
    ["tall-oven-tower", 600, 4200, 4800],
    ["tall-pantry", 600, 4800, 5400],
    ["tall-pantry", 600, 5400, 6000],
  ];

  it.each([4700, 5100])(
    "makes the preparation cabinet and the post-hob slot drawers at 6300 × %i",
    (depthMm) => {
      const plan = planFor({
        shape: "L",
        widthMm: 6300,
        depthMm,
        heightMm: 2600,
      });

      expect(
        plan.bases.find((base) => base.role === "preparation")?.buildId,
      ).toBe(THREE_DRAWER_BASE_BUILD_ID);
      const [first, ...rest] = slotsAfterTheHob(plan);
      expect(first?.buildId).toBe(THREE_DRAWER_BASE_BUILD_ID);
      expect(bodiesOf(rest)).toEqual([DOOR_BASE_BUILD_ID]);
    },
  );

  it.each([4700, 5100])(
    "leaves every slot the run reads before the hob a door at 6300 × %i",
    (depthMm) => {
      // The second drawer of the owner's group stands here, left of the hob — and it is 7D5's,
      // because it is a width change (D15.2). These five are wall B's, which the order names as
      // *the door cabinet between fridge and sink* (Amendment H2).
      const plan = planFor({
        shape: "L",
        widthMm: 6300,
        depthMm,
        heightMm: 2600,
      });
      const read = inReadingOrder(plan);
      const hobAt = read.findIndex((base) => base.role === "hob");

      expect(
        bodiesOf(read.slice(0, hobAt).filter(isComposedStorageSlot)),
      ).toEqual(Array.from({ length: 5 }, () => DOOR_BASE_BUILD_ID));
    },
  );

  it.each([4700, 5100])(
    "keeps a three-column block after the bottle at 6300 × %i",
    (depthMm) => {
      // Not composed slots: the bottle shifts the block inward by one half-module while preserving
      // its three catalogue-declared column bodies.
      const plan = planFor({
        shape: "L",
        widthMm: 6300,
        depthMm,
        heightMm: 2600,
      });
      const columns = plan.bases.filter(
        (base) =>
          base.role === "storage" &&
          CATALOG.get(base.buildId)?.band === "column",
      );

      expect(
        columns.map((column) => [
          column.buildId,
          column.widthMm,
          column.startMm,
          column.endMm,
        ]),
      ).toEqual(BLOCK_AT_THE_FREE_END);
    },
  );

  it.each([4700, 5100])(
    "changes a body's identity and never a composed slot's width at 6300 × %i",
    (depthMm) => {
      const plan = planFor({
        shape: "L",
        widthMm: 6300,
        depthMm,
        heightMm: 2600,
      });
      const slots = plan.bases.filter(isComposedStorageSlot);

      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        expect(slot.widthMm, slot.id).toBe(STORAGE_MODULE_WIDTH_MM);
        expect(slot.endMm - slot.startMm, slot.id).toBe(
          STORAGE_MODULE_WIDTH_MM,
        );
      }
    },
  );
});

describe("criterion 10 — the free-end merge still lands on a body that can take it", () => {
  const MERGE_BOUNDARY: DesignRoom = {
    shape: "L",
    widthMm: 2700,
    depthMm: 1699,
    heightMm: 2200,
  };

  it("inserts wall B's one slot into the merged opening and steps it back to one module", () => {
    const plan = planFor(MERGE_BOUNDARY);
    const slots = plan.bases.filter(isComposedStorageSlot);

    expect(
      slots.map((slot) => [slot.wall, slot.startMm, slot.endMm, slot.widthMm]),
    ).toEqual([["B", 900, 1500, STORAGE_MODULE_WIDTH_MM]]);
    expect(plan.remainderMm.B).toBe(98);
  });

  it("gives that slot a body the catalogue declares buildable at the planned width", () => {
    // Read off the catalogue entry rather than asserted by name: a `fixedWidth` or discrete-width
    // row dropped into the merged 698 mm opening would move a tile boundary the merge and
    // `plannedVoid` both depend on, whichever body the rule assigned.
    const plan = planFor(MERGE_BOUNDARY);
    const slot = plan.bases.find(isComposedStorageSlot);
    if (!slot)
      throw new Error("the merge boundary room composed no storage slot");

    expect(CATALOG.get(slot.buildId)?.widthFlex).toBe("fit");
  });

  it("leaves it a door, because the run reads it before the hob", () => {
    // Wall B's slot stands between the fridge's end of the run and the corner; the hob is on wall A,
    // past the corner. Under *the same wall, further along* there is no candidate at all here — the
    // two definitions agree only by accident, and this pins which one produced the answer.
    const plan = planFor(MERGE_BOUNDARY);

    expect(bodiesOf(plan.bases.filter(isComposedStorageSlot))).toEqual([
      DOOR_BASE_BUILD_ID,
    ]);
    expect(slotsAfterTheHob(plan)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// The composer's half of criteria 6, 7, 9 and 11, swept over the approved policy on a coarse grid.
// The arms are counted and floored: 71.4 % of placed rooms have no post-hob slot at all (D15.3's
// ceiling, and 7D5's justification), so a sweep that never reached the other two arms would pass
// while proving nothing about the rule this slice exists for.
//
// **The wall-B floor stays at 30 through 7D8, and it is a floor rather than a target.** That arm
// counts the post-hob slot standing on **physical wall B** — 7D8's P6a, 5 910 placed rooms, which
// the re-key did not empty. Measured on this grid after the re-key: 2 202 plans, 1 587 with no
// post-hob slot, 555 on wall A, **60 on wall B**. A repair that left this arm reading 0 would be
// reporting a stale instrument rather than an emptied population (7D8 adjudication).
// ---------------------------------------------------------------------------------------------

const GRID_STEP_MM = 100;

function sweptRooms(): readonly DesignRoom[] {
  const l = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (!l) throw new Error("the approved policy declares no L");
  const rooms: DesignRoom[] = [];
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
      rooms.push({ shape: "L", widthMm, depthMm, heightMm: 2600 });
    }
  }
  return rooms;
}

const SWEPT_PLANS: readonly KitchenCompositionPlan[] = sweptRooms()
  .map(planFor)
  .filter((plan) => plan.minimumMet);

describe("criteria 6, 7, 9 and 11 over the approved policy", () => {
  it("reaches all three arms — no post-hob slot, one on wall A, one on wall B", () => {
    const arms = { none: 0, wallA: 0, wallB: 0 };
    for (const plan of SWEPT_PLANS) {
      const first = slotsAfterTheHob(plan)[0];
      if (!first) arms.none += 1;
      else if (first.wall === "A") arms.wallA += 1;
      else arms.wallB += 1;
    }

    expect(SWEPT_PLANS.length).toBeGreaterThanOrEqual(1500);
    expect(arms.none).toBeGreaterThanOrEqual(500);
    expect(arms.wallA).toBeGreaterThanOrEqual(300);
    expect(arms.wallB).toBeGreaterThanOrEqual(30);
  });

  it("gives a kitchen at most one drawer slot, and it is always the first after the hob", () => {
    for (const plan of SWEPT_PLANS) {
      const drawers = plan.bases
        .filter(isComposedStorageSlot)
        .filter((slot) => slot.buildId === THREE_DRAWER_BASE_BUILD_ID);
      const expected = slotsAfterTheHob(plan).slice(0, 1);

      expect(
        drawers,
        `${String(plan.room.widthMm)}x${String(plan.room.depthMm)}`,
      ).toEqual(expected);
    }
  });

  it("gives every other storage slot the door body, and no slot a third body", () => {
    for (const plan of SWEPT_PLANS) {
      const distinct = new Set(
        bodiesOf(plan.bases.filter(isComposedStorageSlot)),
      );

      for (const buildId of distinct) {
        expect(
          [DOOR_BASE_BUILD_ID, THREE_DRAWER_BASE_BUILD_ID],
          `${String(plan.room.widthMm)}x${String(plan.room.depthMm)}`,
        ).toContain(buildId);
      }
    }
  });

  it("stands every composed slot at one module, drawer or door", () => {
    for (const plan of SWEPT_PLANS) {
      for (const slot of plan.bases.filter(isComposedStorageSlot)) {
        expect(slot.widthMm, slot.id).toBe(STORAGE_MODULE_WIDTH_MM);
        expect(slot.endMm - slot.startMm, slot.id).toBe(
          STORAGE_MODULE_WIDTH_MM,
        );
      }
    }
  });

  it("makes the preparation cabinet a drawer body wherever it is placed, at one module", () => {
    let placed = 0;
    for (const plan of SWEPT_PLANS) {
      const preparation = plan.bases.find(
        (base) => base.role === "preparation",
      );
      if (!preparation) continue;
      placed += 1;

      expect(preparation.buildId).toBe(THREE_DRAWER_BASE_BUILD_ID);
      expect(preparation.widthMm).toBe(STORAGE_MODULE_WIDTH_MM);
    }

    expect(placed).toBeGreaterThanOrEqual(1000);
  });
});
