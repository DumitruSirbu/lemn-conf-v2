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
// disagree in 6 660 placed rooms — 3.1 % — and **nothing else in the wave goes red when the wrong
// one is built**: the count, the widths, the remainder and the provenance all stay correct while the
// drawer stands in the wrong module or in none (ruling D15.7).
//
// **The reading order below is re-derived from the plan's own spatial positions**, never from a
// planned id and never from production's own helper, so this file and `generation-priorities.ts`
// agree only if both read wall B's reversal (Amendment G12) the same way. A storage slot is reached
// through `isCycleStorageSlot` and never through `role === "storage"`: the block's full-height
// columns carry that role deliberately (E5.2), and a rule scoped by it is wrong on a third of all
// placed rooms against output that is correct (D12).
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  DOOR_BASE_BUILD_ID,
  isCycleStorageSlot,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  THREE_DRAWER_BASE_BUILD_ID,
  type DesignRoom,
  type DesignWall,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
} from "../../src/index.js";

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

/** The kitchen in the order it is read: wall B from its free end toward the corner, then wall A from
 *  the corner outward (ADR 0110 Amendment A1). Wall B's modules are laid out corner-first, so
 *  reading that wall means reversing it — and that single reversal is the whole of D15.7. */
function inReadingOrder(
  plan: KitchenCompositionPlan,
): readonly PlannedGenerationBase[] {
  return [
    ...[...alongTheWall(plan, "B")].reverse(),
    ...alongTheWall(plan, "A"),
  ];
}

/** Every storage slot the run reaches after the hob, the nearest first. */
function slotsAfterTheHob(
  plan: KitchenCompositionPlan,
): readonly PlannedGenerationBase[] {
  const read = inReadingOrder(plan);
  const hobAt = read.findIndex((base) => base.role === "hob");
  if (hobAt < 0) throw new Error("the plan composed no hob to read past");
  return read.slice(hobAt + 1).filter(isCycleStorageSlot);
}

function bodiesOf(bases: readonly PlannedGenerationBase[]): readonly string[] {
  return bases.map((base) => base.buildId);
}

describe("D15.7 — the slot after the hob is found in the reading order and not along one wall", () => {
  // The one witness that separates the two definitions: the hob stands among wall B's core, so the
  // slot the run reaches next is wall B's, at the end of that wall the spatial array reaches **last**.
  const HOB_ON_WALL_B: DesignRoom = {
    shape: "L",
    widthMm: 900,
    depthMm: 4700,
    heightMm: 2600,
  };

  it("stands the whole composed run on wall B, leaving wall A without a single module", () => {
    const plan = planFor(HOB_ON_WALL_B);

    expect(plan.minimumMet).toBe(true);
    expect(alongTheWall(plan, "A")).toEqual([]);
    expect(plan.bases.find((base) => base.role === "hob")?.wall).toBe("B");
  });

  it("gives the drawer to the slot the run reaches first after the hob", () => {
    const plan = planFor(HOB_ON_WALL_B);
    const [first, ...rest] = slotsAfterTheHob(plan);

    expect(first?.buildId).toBe(THREE_DRAWER_BASE_BUILD_ID);
    expect(bodiesOf(rest)).toEqual([DOOR_BASE_BUILD_ID]);
  });

  it("is the slot nearest the hob along the wall, not the one nearest the corner", () => {
    // The same disagreement seen spatially, and the form that fails loudest under the wrong rule.
    // Wall A holds no slot at all here, so an implementation that reaches for wall A's first slot
    // composes **no drawer anywhere** in this room — while the widths, the count, the remainder and
    // every module's provenance stay exactly as they are below.
    const plan = planFor(HOB_ON_WALL_B);
    const slots = alongTheWall(plan, "B").filter(isCycleStorageSlot);

    expect(slots.map((slot) => [slot.startMm, slot.buildId])).toEqual([
      [900, DOOR_BASE_BUILD_ID],
      [1500, THREE_DRAWER_BASE_BUILD_ID],
    ]);
    expect(plan.bases.find((base) => base.role === "hob")?.startMm).toBe(2100);
  });
});

describe("criterion 1 — the two drawer rows at the wave's two headline rooms", () => {
  const BLOCK_AT_THE_FREE_END = [
    ["tall-oven-tower", 600, 4500, 5100],
    ["tall-pantry", 600, 5100, 5700],
    ["tall-pantry", 600, 5700, 6300],
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
      expect(bodiesOf(rest)).toEqual([DOOR_BASE_BUILD_ID, DOOR_BASE_BUILD_ID]);
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

      expect(bodiesOf(read.slice(0, hobAt).filter(isCycleStorageSlot))).toEqual(
        Array.from({ length: 5 }, () => DOOR_BASE_BUILD_ID),
      );
    },
  );

  it.each([4700, 5100])(
    "leaves the block's three columns exactly where 7D3 put them at 6300 × %i",
    (depthMm) => {
      // Not cycle slots, and asserted unchanged rather than exempted silently (D12). Their identity
      // is 7D3's and this wave never reads it.
      const plan = planFor({
        shape: "L",
        widthMm: 6300,
        depthMm,
        heightMm: 2600,
      });
      const columns = plan.bases.filter(
        (base) => base.role === "storage" && !isCycleStorageSlot(base),
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
    "changes a body's identity and never a cycle slot's width at 6300 × %i",
    (depthMm) => {
      const plan = planFor({
        shape: "L",
        widthMm: 6300,
        depthMm,
        heightMm: 2600,
      });
      const slots = plan.bases.filter(isCycleStorageSlot);

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
    const slots = plan.bases.filter(isCycleStorageSlot);

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
    const slot = plan.bases.find(isCycleStorageSlot);
    if (!slot)
      throw new Error("the merge boundary room composed no storage slot");

    expect(CATALOG.get(slot.buildId)?.widthFlex).toBe("fit");
  });

  it("leaves it a door, because the run reads it before the hob", () => {
    // Wall B's slot stands between the fridge's end of the run and the corner; the hob is on wall A,
    // past the corner. Under *the same wall, further along* there is no candidate at all here — the
    // two definitions agree only by accident, and this pins which one produced the answer.
    const plan = planFor(MERGE_BOUNDARY);

    expect(bodiesOf(plan.bases.filter(isCycleStorageSlot))).toEqual([
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
        .filter(isCycleStorageSlot)
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
      const distinct = new Set(bodiesOf(plan.bases.filter(isCycleStorageSlot)));

      for (const buildId of distinct) {
        expect(
          [DOOR_BASE_BUILD_ID, THREE_DRAWER_BASE_BUILD_ID],
          `${String(plan.room.widthMm)}x${String(plan.room.depthMm)}`,
        ).toContain(buildId);
      }
    }
  });

  it("stands every cycle slot at one module, drawer or door", () => {
    for (const plan of SWEPT_PLANS) {
      for (const slot of plan.bases.filter(isCycleStorageSlot)) {
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
