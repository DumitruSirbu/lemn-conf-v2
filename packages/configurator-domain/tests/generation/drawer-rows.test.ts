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

/** 7D5b S1 / ADR 0110 M1/M8/M9: the one module the dishwasher leaf re-identified, read by its body. */
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
  // The witness that separates *after the hob in the reading order* from *the first slot on a named
  // wall*. The run starts at the narrower wall's free end, reads that wall's slots, crosses the corner
  // and reaches the hob among the wider wall's core. The slot the run reaches next is the wider wall's;
  // **every slot on the narrower wall is a module the run passed before the hob** and must keep its
  // door.
  //
  // **Restated for M7 wave 7D5 S2 (owner ruling Q-H6a = A, 2026-09-21; ADR 0123).** The pan drawer
  // now stands immediately before the hob wherever the hob's wall has room for it, and where that wall
  // has room for only one more module the pan drawer takes it and this rule's post-hob slot is gone.
  // The population this describe needs — a post-hob slot on the wider wall **and** a composed slot on
  // the narrower one — fell from 56 866 rooms to 431 (architect's census, 10 mm grid), every one at
  // wall A exactly 6000 mm, and its physical-wall-B arm fell from 26 975 to 0. The old subject,
  // 1500 x 4410, is one of the rooms that emptied: the pan drawer took wall B's only post-hob module.
  //
  // The rule's branch is kept, so its witness is kept too (ADR 0123 decision 1), on both mirrors:
  // - **hob on wall A** — 6000 x 4100, a real room of the 431 the approved policy still admits;
  // - **hob on wall B** — 4100 x 6100, the same kitchen mirrored. **The approved policy cannot admit
  //   it**: wall B's run starts 100 mm further from the corner than wall A's, so a wall B of 6000 mm
  //   leaves 5000 mm of run where the core, the pan drawer, the bottle, one slot and the three-column
  //   block need 5100. It is declared here as a room the composer is judged on (as criterion 1's
  //   headline rooms are), and the test below asserts it lies outside the policy so the day the policy
  //   widens this witness is re-examined rather than quietly duplicated (ADR 0093 decision 3b).
  const D15_7_WITNESSES = [
    {
      name: "hob on wall A, 6000 x 4100",
      room: { shape: "L", widthMm: 6000, depthMm: 4100, heightMm: 2600 },
      hobWall: "A",
      // 7D5b S1 / ADR 0110 M1/M8/M9: wall B's first slot, at 900, faces the sink across the corner,
      // so M1 made it the dishwasher; it leaves this list and is asserted below as `dishwasherAt`.
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
      // The same disagreement seen spatially, and the form that fails loudest under the wrong rule: an
      // implementation that sought the slot on the **narrower** wall — or on a fixed letter — finds a
      // slot the run read before the hob and gives it the drawer, while the widths, the count, the
      // remainder and every module's provenance stay exactly as they are below.
      //
      // **What these rooms can no longer separate, and where that went instead.** *The first slot
      // after the hob* and *the first slot on the hob's own wall* name the same module in every room
      // the approved policy admits, because the hob always stands on the wall the run reads last. That
      // half of D15.7 is witnessed at the composer's unit boundary in
      // `qa-7d8-the-run-follows-the-wider-wall.adversarial.test.ts` — *the drawer stands at the prefix
      // wall's highest slot index* — under ADR 0091 Amendment A.
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
      // 7D5b S1 / ADR 0110 M1/M8/M9: the narrower wall's **first** slot — the one a wall-scoped rule
      // would have drawered — is now the dishwasher, a module read before the hob that took neither
      // drawer body. The run reads it immediately before crossing to the sink.
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
      // M7 wave 7D5 S2 (Q-H6a = A): the module that emptied D15.7's population is itself pinned
      // here, so the witness says what took the post-hob slot's place rather than only that it moved.
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
    // ADR 0123 decision 3: the unreachable arm is stated as a test, not a comment. A later wave that
    // widens wall B far enough to admit this room goes red here and is sent to re-measure the
    // three-arm sweep below rather than keep a declared witness the sweep now duplicates.
    const l = APPROVED_ROOM_POLICY.buildableShapes.L;
    if (!l) throw new Error("the approved policy declares no L");
    const wallBWitness = D15_7_WITNESSES[1].room;

    expect(wallBWitness.depthMm).toBeGreaterThan(l.wallB.maxMm);
    expect(D15_7_WITNESSES[0].room.widthMm).toBeLessThanOrEqual(l.wallA.maxMm);
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
      // **Re-pinned for M7 wave 7D5 S2 (Q-H6a = A; ADR 0123).** 7D4 read two slots after the hob here,
      // a drawer then a door. The pan drawer now stands immediately before the hob, which spends one
      // 600 mm module of the hob's wall, so one slot remains after the hob — still the drawer — and no
      // door follows it. D15.7's subject is untouched: the first slot after the hob takes the drawer.
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
      // The second drawer of the owner's group stands left of the hob — 7D5 S2's pan drawer, a width
      // change (D15.2) that is not a composed slot, so it does not appear in this list. These are
      // wall B's, which the order names as *the door cabinet between fridge and sink* (H2).
      //
      // 7D5b S1 / ADR 0110 M1/M8/M9: 7D4 read five doors here. Wall B's first slot faces the sink
      // across the corner and M1 made it the dishwasher, so four doors remain, and the fifth module is
      // asserted as the dishwasher the run reads last before the sink — never a drawer.
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

// 7D5b S1 / ADR 0110 M1/M8/M9: the boundary room's one composed slot faces the sink across the corner,
// so M1 made it the dishwasher. The merge subject is kept **in the same room, on the dishwasher's
// module**: the re-identification keeps the span the merge stepped back, so the module still stands
// at one module inside the 698 mm opening, now under a discrete-width body — the harder case the
// buildability test below was written against.
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
    // Read off the catalogue entry rather than asserted by name: a `fixedWidth` or discrete-width
    // row dropped into the merged 698 mm opening would move a tile boundary the merge and
    // `plannedVoid` both depend on, whichever body the rule assigned.
    //
    // 7D5b S1 / ADR 0110 M1/M8/M9: was `widthFlex === "fit"` on the door slot. The dishwasher is a
    // discrete-width row, so buildable means its declared widths include the planned 600 — not the
    // merged 698 the opening would otherwise offer it.
    const plan = planFor(MERGE_BOUNDARY);
    const dishwasher = dishwasherOf(plan);
    const widthFlex = CATALOG.get(dishwasher.buildId)?.widthFlex;

    expect(Array.isArray(widthFlex)).toBe(true);
    expect(widthFlex).toContain(dishwasher.widthMm);
    expect(widthFlex).not.toContain(dishwasher.widthMm + plan.remainderMm.B);
  });

  it("leaves it undrawered — now the dishwasher — because the run reads it before the hob", () => {
    // Wall B's slot stands between the fridge's end of the run and the corner; the hob is on wall A,
    // past the corner. Under *the same wall, further along* there is no candidate at all here — the
    // two definitions agree only by accident, and this pins which one produced the answer.
    //
    // 7D5b S1 / ADR 0110 M1/M8/M9: was `[DOOR_BASE_BUILD_ID]` over composed slots; the module is now
    // the dishwasher, read before the hob, and no drawer body reached it.
    const plan = planFor(MERGE_BOUNDARY);
    const read = inReadingOrder(plan);
    const hobAt = read.findIndex((base) => base.role === "hob");

    expect(dishwasherOf(plan).buildId).toBe(DISHWASHER_BUILD_ID);
    expect(read.indexOf(dishwasherOf(plan))).toBeLessThan(hobAt);
    expect(slotsAfterTheHob(plan)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// The composer's half of criteria 6, 7, 9 and 11, swept over the approved policy on a coarse grid.
// The arms are counted and floored: 71.4 % of placed rooms have no post-hob slot at all (D15.3's
// ceiling, and 7D5's justification), so a sweep that never reached the other two arms would pass
// while proving nothing about the rule this slice exists for.
//
// **M7 wave 7D5 S2 emptied the wall-B arm and thinned the wall-A arm, and neither floor was lowered
// to 0 (ADR 0123).** Under the owner's Q-H6a = A the pan drawer takes the hob's wall's last module
// wherever that wall has room for only one more, so the post-hob slot survives only where the hob's
// wall holds the core, the pan drawer, the bottle, one slot and the whole block. Measured on this
// grid at 7D5 S2: 2 544 plans, 2 500 with no post-hob slot, **44 on wall A — every one at wall A
// exactly 6000 mm — and 0 on wall B.** This is an emptied population, not a stale instrument: the
// architect's 10 mm census agrees (D15.7's population 56 866 → 431, physical wall B 26 975 → 0).
// - **wall A** is floored at the population it still has on this grid, 40;
// - **wall B** is no longer sought here. Its arm is witnessed by the declared 4100 x 6100 room in
//   the D15.7 block above, which also asserts that room lies outside the policy — so a policy that
//   refills this arm turns that test red and sends its author back to restore the floor here.
//   (7D8's history of this floor: 30, on 60 measured, physical wall B, P6a.)
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
    // M7 wave 7D5 S2 / Q-H6a, ADR 0123: the wall-B arm is covered by the declared 4100 x 6100 witness
    // above and deliberately carries no floor here — a floor of 0 would make "we stopped testing
    // this" the contract.
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

  // One module, plus what the owner's Q6 gives the door cabinet beside an end fridge (M7C wave C5 S1): the
  // figure is worked out from the run and the fridge's span, so a slot widened by any other amount fails.
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

  // 7D5b S1 / ADR 0110 M1/M8/M9: was *the preparation body is always `base-3drawer`*. Under M7(e) the
  // dishwasher takes the preparation 3-drawer beside the sink and the preparation id and role move
  // onto the pan drawer directly beyond it (M9), whose body stays `base-panbank` (M8 narrows F5/D7).
  // The drawer body is kept; which of the two is the rule's, not the room's: a pan-drawer prep only
  // with the dishwasher abutting it where the 3-drawer stood, and no second pan drawer.
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
