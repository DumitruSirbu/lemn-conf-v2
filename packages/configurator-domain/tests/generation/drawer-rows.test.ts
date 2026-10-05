// The preparation cabinet and the first storage slot after the hob in the reading order take the drawer body (ADR 0110
// Amendment H1); every other storage slot takes the door body, and no width, count, remainder or cut moves.
// "After the hob" is the reading order, not "the same wall, further along": the two disagree where the hob stands on
// the wall the layout reads in reverse, and nothing else goes red when the wrong one is built. That population
// emptied; the half it separated is witnessed in `qa-7d8-the-run-follows-the-wider-wall.adversarial.test.ts`.
// The reading order is re-derived from the entered wall lengths and the plan's own positions, never from production's
// helper (ADR 0120 Amendment E). A storage slot is reached through `isComposedStorageSlot`, never `role === "storage"`:
// the block's full-height columns carry that role deliberately (E5.2).
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  DISHWASHER_BUILD_ID,
  DOOR_BASE_BUILD_ID,
  isComposedStorageSlot,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  PAN_DRAWER_BASE_BUILD_ID,
  planKitchenComposition,
  THREE_DRAWER_BASE_BUILD_ID,
  type DesignRoom,
  type DesignWall,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
} from "../../src/index.js";
import { narrowerEnteredWall } from "../support/entered-walls.js";
import { ruledSlotWidthMm } from "../support/fridge-end-leftover.js";

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
 * The wall the kitchen is laid out against the reading order on: the run's first half, read from that wall's free end
 * toward the corner (ADR 0110 A1 and D2). It is the narrower entered wall, wall B where equal, because the run follows
 * the wider one (ADR 0120 Amendment E). Derived in `entered-walls.ts`, never imported from `generation-priorities.ts`:
 * production's `isLaidOutInReverse` is the expression this file exists to disagree with.
 */
function wallReadInReverse(room: DesignRoom): DesignWall {
  return narrowerEnteredWall(room);
}

/** The kitchen in the order it is read: the reversed wall from its free end toward the corner, then the other wall
 *  from the corner outward. */
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

/** The one module the dishwasher leaf re-identified, read by its body. */
function dishwasherOf(plan: KitchenCompositionPlan): PlannedGenerationBase {
  const dishwashers = plan.bases.filter(
    (base) => base.buildId === DISHWASHER_BUILD_ID,
  );
  if (dishwashers.length !== 1 || !dishwashers[0])
    throw new Error(
      `expected one dishwasher, found ${String(dishwashers.length)}`,
    );
  return dishwashers[0];
}

function isTheSink(base: PlannedGenerationBase | undefined): boolean {
  return base?.role === "sink";
}

describe("D15.7 — the slot after the hob is found in the reading order and not along one wall", () => {
  // Separates "after the hob in the reading order" from "the first slot on a named wall": the run starts at the
  // narrower wall's free end, crosses the corner and reaches the hob among the wider wall's core, so every slot on the
  // narrower wall was passed before the hob and keeps its door.
  //
  // The pan drawer takes the hob's wall's last module where there is room for only one more, which emptied this
  // population; the rule's branch and its witnesses are kept on both mirrors (ADR 0123 decision 1):
  // - hob on wall A: 6000 x 4100, admitted by the approved policy;
  // - hob on wall B: 4100 x 6100, the mirror. The policy cannot admit it (wall B's run starts 100 mm further from the
  //   corner, leaving 5000 mm where the core, pan drawer, bottle, one slot and block need 5100), so a test below
  //   asserts it lies outside the policy and the witness is re-examined when the policy widens (ADR 0093 decision 3b).
  const D15_7_WITNESSES = [
    {
      name: "hob on wall A, 6000 x 4100",
      room: { shape: "L", widthMm: 6000, depthMm: 4100, heightMm: 2600 },
      hobWall: "A",
      // Wall B's first slot, at 900, faces the sink across the corner, so M1 made it the dishwasher (ADR 0110); it is
      // asserted below as `dishwasherAt`.
      slots: [
        ["A", 3600, THREE_DRAWER_BASE_BUILD_ID],
        ["B", 1500, DOOR_BASE_BUILD_ID],
        ["B", 2100, DOOR_BASE_BUILD_ID],
        ["B", 2700, DOOR_BASE_BUILD_ID],
      ],
      dishwasherAt: ["B", 900, 1500],
      hobStartMm: 2700,
    },
    {
      name: "hob on wall B, 4100 x 6100",
      room: { shape: "L", widthMm: 4100, depthMm: 6100, heightMm: 2600 },
      hobWall: "B",
      slots: [
        ["A", 1500, DOOR_BASE_BUILD_ID],
        ["A", 2100, DOOR_BASE_BUILD_ID],
        ["A", 2700, DOOR_BASE_BUILD_ID],
        ["B", 3600, THREE_DRAWER_BASE_BUILD_ID],
      ],
      dishwasherAt: ["A", 900, 1500],
      hobStartMm: 2700,
    },
  ] as const satisfies readonly {
    readonly name: string;
    readonly room: DesignRoom;
    readonly hobWall: DesignWall;
    readonly slots: readonly (readonly [DesignWall, number, string])[];
    readonly dishwasherAt: readonly [DesignWall, number, number];
    readonly hobStartMm: number;
  }[];

  it.each(D15_7_WITNESSES)(
    "stands the hob on the wider entered wall, with a composed slot on each wall, $name",
    ({ room, hobWall }) => {
      const plan = planFor(room);

      expect(plan.minimumMet).toBe(true);
      expect(plan.bases.find((base) => base.role === "hob")?.wall).toBe(
        hobWall,
      );
      expect(
        new Set(plan.bases.filter(isComposedStorageSlot).map((s) => s.wall)),
      ).toEqual(new Set(["A", "B"]));
    },
  );

  it.each(D15_7_WITNESSES)(
    "gives the drawer to the slot the run reaches first after the hob, $name",
    ({ room, hobWall }) => {
      const plan = planFor(room);
      const [first, ...rest] = slotsAfterTheHob(plan);

      expect(first?.wall).toBe(hobWall);
      expect(first?.buildId).toBe(THREE_DRAWER_BASE_BUILD_ID);
      expect(bodiesOf(rest)).toEqual([]);
    },
  );

  it.each(D15_7_WITNESSES)(
    "leaves every slot the run read before the hob a door, though one is a wall's first slot, $name",
    ({ room, slots, dishwasherAt, hobStartMm }) => {
      // The same disagreement seen spatially: an implementation that sought the slot on the narrower wall, or on a
      // fixed letter, gives a slot read before the hob the drawer while widths, count, remainder and provenance stay
      // as below. In every admitted room the first slot after the hob is also the first on the hob's own wall, so the
      // descending-index half is witnessed in `qa-7d8-the-run-follows-the-wider-wall.adversarial.test.ts`.
      const plan = planFor(room);
      const composed = plan.bases.filter(isComposedStorageSlot);

      expect(
        [...composed]
          .sort(
            (left, right) =>
              left.wall.localeCompare(right.wall) ||
              left.startMm - right.startMm,
          )
          .map((slot) => [slot.wall, slot.startMm, slot.buildId]),
      ).toEqual(slots);
      // The narrower wall's first slot, which a wall-scoped rule would have drawered, is the dishwasher (ADR 0110 M1):
      // read directly before the sink and given neither drawer body.
      const dishwasher = dishwasherOf(plan);
      const read = inReadingOrder(plan);
      expect([dishwasher.wall, dishwasher.startMm, dishwasher.endMm]).toEqual(
        dishwasherAt,
      );
      expect(isTheSink(read[read.indexOf(dishwasher) + 1])).toBe(true);
      expect(plan.bases.find((base) => base.role === "hob")?.startMm).toBe(
        hobStartMm,
      );
    },
  );

  it.each(D15_7_WITNESSES)(
    "stands the pan drawer immediately before the hob and after the preparation cabinet, $name",
    ({ room }) => {
      const read = inReadingOrder(planFor(room));
      const hobAt = read.findIndex((base) => base.role === "hob");

      expect(bodiesOf(read.slice(hobAt - 2, hobAt + 1))).toEqual([
        THREE_DRAWER_BASE_BUILD_ID,
        "base-panbank",
        read[hobAt]?.buildId,
      ]);
      expect(read[hobAt - 2]?.role).toBe("preparation");
      expect(read[hobAt - 1]?.endMm).toBe(read[hobAt]?.startMm);
    },
  );

  it("declares its wall-B witness outside the approved policy, because no admitted room reaches it", () => {
    // The unreachable arm is stated as a test (ADR 0123 decision 3): a later wave that widens wall B enough to admit
    // this room goes red here and re-measures the sweep below.
    const l = APPROVED_ROOM_POLICY.buildableShapes.L;
    if (!l) throw new Error("the approved policy declares no L");
    const wallBWitness = D15_7_WITNESSES[1].room;

    expect(wallBWitness.depthMm).toBeGreaterThan(l.wallB.maxMm);
    expect(D15_7_WITNESSES[0].room.widthMm).toBeLessThanOrEqual(l.wallA.maxMm);
  });
});

// These rooms sit past the policy's 6000 mm wall A; kept on purpose, because the composer is judged here, not the
// policy.
describe("criterion 1 — the two drawer rows at the wave's two headline rooms", () => {
  const BLOCK_AT_THE_FREE_END = [
    ["tall-oven-tower", 600, 4200, 4800],
    ["tall-pantry", 600, 4800, 5400],
    ["tall-pantry", 600, 5400, 6000],
  ];

  it.each([4700, 5100])(
    "makes the preparation cabinet and the post-hob slot drawers at 6300 × %i",
    (depthMm) => {
      // The pan drawer stands immediately before the hob, so one slot remains after it, still the drawer, and no door
      // follows it.
      const plan = planFor({
        shape: "L",
        widthMm: 6300,
        depthMm,
        heightMm: 2600,
      });
      const read = inReadingOrder(plan);
      const hobAt = read.findIndex((base) => base.role === "hob");

      expect(
        plan.bases.find((base) => base.role === "preparation")?.buildId,
      ).toBe(THREE_DRAWER_BASE_BUILD_ID);
      const [first, ...rest] = slotsAfterTheHob(plan);
      expect(first?.buildId).toBe(THREE_DRAWER_BASE_BUILD_ID);
      expect(bodiesOf(rest)).toEqual([]);
      expect(read[hobAt - 1]?.buildId).toBe("base-panbank");
      expect(read[hobAt - 1]?.endMm).toBe(read[hobAt]?.startMm);
    },
  );

  it.each([4700, 5100])(
    "leaves every slot the run reads before the hob a door at 6300 × %i",
    (depthMm) => {
      // The pan drawer, the group's second drawer, is not a composed slot and is not in this list. These are wall B's
      // slots, the door cabinet between fridge and sink (H2). Wall B's first slot is the dishwasher (ADR 0110 M1), so
      // four doors remain and the dishwasher is the module read last before the sink.
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
      ).toEqual(Array.from({ length: 4 }, () => DOOR_BASE_BUILD_ID));
      const dishwasherAt = read.indexOf(dishwasherOf(plan));
      expect(dishwasherAt).toBeGreaterThanOrEqual(0);
      expect(dishwasherAt).toBeLessThan(hobAt);
      expect(isTheSink(read[dishwasherAt + 1])).toBe(true);
    },
  );

  it.each([4700, 5100])(
    "keeps a three-column block after the bottle at 6300 × %i",
    (depthMm) => {
      // Not composed slots: the bottle shifts the block inward by one half-module, keeping its three column bodies.
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

// The boundary room's one composed slot faces the sink across the corner, so M1 made it the dishwasher (ADR 0110).
// The merge subject stays on that module: it keeps the span the merge stepped back, so it stands at one module inside
// the 698 mm opening, now under a discrete-width body.
describe("criterion 10 — the free-end merge still lands on a body that can take it", () => {
  const MERGE_BOUNDARY: DesignRoom = {
    shape: "L",
    widthMm: 2700,
    depthMm: 1699,
    heightMm: 2200,
  };

  it("inserts wall B's one slot into the merged opening and steps it back to one module", () => {
    const plan = planFor(MERGE_BOUNDARY);
    const dishwasher = dishwasherOf(plan);

    expect(plan.bases.filter(isComposedStorageSlot)).toEqual([]);
    expect([
      dishwasher.wall,
      dishwasher.startMm,
      dishwasher.endMm,
      dishwasher.widthMm,
    ]).toEqual(["B", 900, 1500, STORAGE_MODULE_WIDTH_MM]);
    expect(dishwasher.role).toBe("storage");
    expect(plan.remainderMm.B).toBe(98);
  });

  it("gives that slot a body the catalogue declares buildable at the planned width", () => {
    // Read off the catalogue entry, not asserted by name: a fixed- or discrete-width row dropped into the merged 698 mm
    // opening would move a tile boundary the merge and `plannedVoid` depend on. The dishwasher is a discrete-width row,
    // so buildable means its declared widths include the planned 600, not the merged 698.
    const plan = planFor(MERGE_BOUNDARY);
    const dishwasher = dishwasherOf(plan);
    const widthFlex = CATALOG.get(dishwasher.buildId)?.widthFlex;

    expect(Array.isArray(widthFlex)).toBe(true);
    expect(widthFlex).toContain(dishwasher.widthMm);
    expect(widthFlex).not.toContain(dishwasher.widthMm + plan.remainderMm.B);
  });

  it("leaves it undrawered — now the dishwasher — because the run reads it before the hob", () => {
    // Wall B's slot stands between the fridge's end of the run and the corner; the hob is on wall A, past it. Under
    // "the same wall, further along" there is no candidate here, so this pins which definition produced the answer.
    const plan = planFor(MERGE_BOUNDARY);
    const read = inReadingOrder(plan);
    const hobAt = read.findIndex((base) => base.role === "hob");

    expect(dishwasherOf(plan).buildId).toBe(DISHWASHER_BUILD_ID);
    expect(read.indexOf(dishwasherOf(plan))).toBeLessThan(hobAt);
    expect(slotsAfterTheHob(plan)).toEqual([]);
  });
});

// The composer's half of criteria 6, 7, 9 and 11, swept over the approved policy on a coarse grid. Arms are counted and
// floored so a sweep that never reached the other arms cannot pass vacuously. The post-hob slot survives only where the
// hob's wall holds the core, pan drawer, bottle, one slot and the whole block, which empties wall B and thins wall A
// (ADR 0123): wall A is floored at the population it still has on this grid, and wall B is witnessed by the declared
// 4100 x 6100 room above, which also asserts it lies outside the policy.

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
  it("reaches the no-slot and wall-A arms, the wall-B arm living in a declared witness", () => {
    const arms = { none: 0, wallA: 0, wallB: 0 };
    for (const plan of SWEPT_PLANS) {
      const first = slotsAfterTheHob(plan)[0];
      if (!first) arms.none += 1;
      else if (first.wall === "A") arms.wallA += 1;
      else arms.wallB += 1;
    }

    expect(SWEPT_PLANS.length).toBeGreaterThanOrEqual(1500);
    expect(arms.none).toBeGreaterThanOrEqual(500);
    expect(arms.wallA).toBeGreaterThanOrEqual(40);
    // The wall-B arm carries no floor, because a floor of 0 would make "we stopped testing this" the contract; the
    // declared 4100 x 6100 witness covers it (ADR 0123).
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

  // One module, plus what the cabinet beside an end fridge absorbs; the figure is worked out from the run and the
  // fridge's span, so a slot widened by any other amount fails.
  it("stands every composed slot at one module, drawer or door, but for the one beside an end fridge", () => {
    for (const plan of SWEPT_PLANS) {
      const runs = lShellFloorRuns(plan.room);
      for (const slot of plan.bases.filter(isComposedStorageSlot)) {
        const widthMm = ruledSlotWidthMm(plan, slot, runs[slot.wall].endMm);

        expect(slot.widthMm, slot.id).toBe(widthMm);
        expect(slot.endMm - slot.startMm, slot.id).toBe(widthMm);
      }
    }
  });

  // Under M7(e) the dishwasher takes the preparation 3-drawer beside the sink and the preparation id and role move onto
  // the pan drawer directly beyond it (ADR 0110 M8/M9): a pan-drawer preparation only with the dishwasher abutting it,
  // and no second pan drawer.
  it("makes the preparation cabinet a drawer body wherever it is placed, at one module", () => {
    let placed = 0;
    let swapped = 0;
    for (const plan of SWEPT_PLANS) {
      const preparation = plan.bases.find(
        (base) => base.role === "preparation",
      );
      if (!preparation) continue;
      placed += 1;
      const label = `${String(plan.room.widthMm)}x${String(plan.room.depthMm)}`;

      expect(
        [THREE_DRAWER_BASE_BUILD_ID, PAN_DRAWER_BASE_BUILD_ID],
        label,
      ).toContain(preparation.buildId);
      expect(preparation.widthMm).toBe(STORAGE_MODULE_WIDTH_MM);
      if (preparation.buildId === PAN_DRAWER_BASE_BUILD_ID) {
        swapped += 1;
        const dishwasher = dishwasherOf(plan);
        expect(dishwasher.wall, label).toBe(preparation.wall);
        expect(
          dishwasher.endMm === preparation.startMm ||
            dishwasher.startMm === preparation.endMm,
          label,
        ).toBe(true);
        expect(
          plan.bases.filter(
            (base) => base.buildId === PAN_DRAWER_BASE_BUILD_ID,
          ),
          label,
        ).toEqual([preparation]);
      }
    }

    expect(placed).toBeGreaterThanOrEqual(1000);
    expect(swapped, "no (e) room reached on this grid").toBeGreaterThan(0);
  });
});
