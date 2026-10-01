// M7 wave 7D3 slice S2 — the block of full-height columns at the run's free end, the hob that
// follows it, and the boundaries both of them move on (ADR 0110 Amendment E).
//
// **The block stood at wall A's free end until M7 wave 7D8 re-keyed the run onto the wider entered
// wall** (Amendment I, criterion 10). The rooms below name wall A deliberately — every one of them
// is wall-A-wider, so the block stands where these thresholds were measured — and the one assertion
// that was about the letter rather than about the run asserts the rule instead.
//
// The millimetre thresholds this file asserts are **computed from the run and the declared widths
// first and pinned as literals second** (criterion 7): a width that changes must show up as a failing
// number here rather than as a boundary that quietly moved.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  BOTTLE_CARGO_BUILD_ID,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  findOverflowingPlacementIds,
  generateKitchen,
  GENERATION_PRIORITIES,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  planLeftover,
  validateDesignForCatalog,
  type Design,
  type DesignRoom,
  type GenerationLog,
} from "../../src/index.js";
import { widerEnteredWall } from "../support/entered-walls.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";
const OVEN_TOWER = "tall-oven-tower";
const DOOR_COLUMN = "tall-pantry";
const HOB_WITH_DRAWERS = "base-hob-2drawer";
const HOB_WITH_OVEN = "base-hob-oven";
const BOTTLE_WIDTH_MM = 300;
const DISHWASHER = "base-dishwasher";

/**
 * 7D5b S2 / ADR 0110 M7/M10: the wall B the block rule's subjects are witnessed at. From 2300 to 3300 mm
 * S1's leaf has already placed the dishwasher across the corner wherever a module affords the block, so
 * none of S2's trades is tried and the block is the tall-end rule's alone — measured over wall A 900-6300
 * at 1 mm: 0 rooms differ from the tree with S2 switched off. At 1700, where 7D3 measured the table, the
 * trades reach every step (1 200 of the 5 401 rooms), so the table moved there to be kept and its S2
 * exceptions are asserted in their own describe below.
 */
const WALL_B_WHERE_S1_SEATED_THE_DISHWASHER_MM = 2600;

const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);

function roomOf(
  widthMm: number,
  depthMm: number,
  heightMm: number,
): DesignRoom {
  return { shape: "L", widthMm, depthMm, heightMm };
}

function planFor(room: DesignRoom) {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

function generate(room: DesignRoom) {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  if (!result.ok) throw new Error(`room was refused: ${result.reason.code}`);
  return result;
}

/**
 * The block as the plan holds it, in spatial order from the corner outward.
 *
 * **Found by what the catalogue calls these rows, never by a list of build ids kept in step here by
 * hand** — that list would be a second authority over the catalogue (ADR 0102), and it would also
 * make every assertion below go quietly vacuous the day composition reached for a fourth body.
 * `fridge-free` is full height too and is declared in the `column` band like the rest; it is the one
 * the reading order places (Amendment A1), so its **role** is what excludes it, not its id.
 */
function blockOf(plan: ReturnType<typeof planFor>) {
  return plan.bases.filter(
    (base) =>
      base.role !== "fridge" && CATALOG.get(base.buildId)?.band === "column",
  );
}

/** One wall's composed bodies, corner to free end — the order `plan.bases` already holds them in. */
function alongWallA(plan: ReturnType<typeof planFor>) {
  return plan.bases.filter((base) => base.wall === "A");
}

function hobOf(plan: ReturnType<typeof planFor>) {
  const hob = plan.bases.find((base) => base.role === "hob");
  if (!hob) throw new Error("the plan stands no hob");
  return hob;
}

function placementsOf(design: Design, buildId: string) {
  return design.placements.filter(
    (placement) => placement.body.buildId === buildId,
  );
}

function setWidthTargets(log: GenerationLog): readonly string[] {
  return log.commands.flatMap((command) =>
    command.type === "set_width" ? [command.placementId] : [],
  );
}

describe("the block at wall A's free end (criteria 1, 20, 21)", () => {
  it("stands one oven tower where the run first affords a module, and none a millimetre below", () => {
    // 7D5b S0b / ADR 0110 M11: the edge is back at 3299 / 3300 (S1 had moved it to 3599 / 3600).
    // From 3300 S1's bottle would take the only oven tower with no pan drawer depending on it, so
    // the tower stands and the bottle is omitted; at 3299 the core leaves no module and the bottle
    // stands, the hob carrying its own oven.
    // 7D5b S2 / ADR 0110 M7/M10: witnessed at wall B 2600, was 1700. At 3300 x 1700 the dishwasher now
    // takes the tower by (c); the same edge stands here, where S1 seated the dishwasher on wall B on both
    // sides of it, so no trade is tried. 1700's edge is asserted as the trade it now is, below.
    const withABlock = planFor(
      roomOf(3300, WALL_B_WHERE_S1_SEATED_THE_DISHWASHER_MM, 2600),
    );
    const withoutOne = planFor(
      roomOf(3299, WALL_B_WHERE_S1_SEATED_THE_DISHWASHER_MM, 2600),
    );
    for (const plan of [withABlock, withoutOne]) {
      expect(
        plan.bases
          .filter((base) => base.buildId === DISHWASHER)
          .map((base) => base.wall),
      ).toEqual(["B"]);
    }

    expect(blockOf(withABlock).map((base) => base.buildId)).toEqual([
      OVEN_TOWER,
    ]);
    expect(blockOf(withABlock).map((base) => base.wall)).toEqual(["A"]);
    expect(alongWallA(withABlock).at(-1)?.buildId).toBe(OVEN_TOWER);
    expect(hobOf(withABlock).buildId).toBe(HOB_WITH_DRAWERS);

    expect(
      withABlock.bases.some((base) => base.buildId === BOTTLE_CARGO_BUILD_ID),
    ).toBe(false);

    expect(blockOf(withoutOne)).toEqual([]);
    expect(hobOf(withoutOne).buildId).toBe(HOB_WITH_OVEN);
    expect(
      withoutOne.bases.some((base) => base.buildId === BOTTLE_CARGO_BUILD_ID),
    ).toBe(true);
  });

  it("computes that boundary pair from the run and the declared widths, not from the number", () => {
    // 7D5b S0b / ADR 0110 M11: the bottle no longer counts against the first module. Where the core
    // alone affords one, the tower is kept over the bottle (no pan drawer depends on it there), so
    // the boundary is the core's own — `BOTTLE_WIDTH_MM` was added here from 7D5 S1 until M11.
    const declaredCoreWidthMm = GENERATION_PRIORITIES.filter(
      (priority) => priority.role !== "fridge",
    ).reduce((sum, priority) => sum + priority.widthMm, 0);
    // 7D5b S2 / ADR 0110 M7/M10: was 1700, where (c) now trades the first tower for the dishwasher.
    const wallBHoldingTheFridge = WALL_B_WHERE_S1_SEATED_THE_DISHWASHER_MM;
    const firstAffordingWallAMm = (() => {
      for (let widthMm = 900; widthMm <= 6300; widthMm += 1) {
        const room = roomOf(widthMm, wallBHoldingTheFridge, 2600);
        const run = lShellFloorRuns(room).A;
        const freeEndMm = run.endMm - run.startMm - declaredCoreWidthMm;
        if (freeEndMm < 0) continue;
        if (
          planLeftover(freeEndMm).storageCount >= 1 &&
          planFor(room).dropped.length === 0
        ) {
          return widthMm;
        }
      }
      throw new Error("no approved wall A affords a column");
    })();

    // Pinned as a literal so a declared width that moves fails on the number (criterion 7).
    expect(firstAffordingWallAMm).toBe(3300);
    expect(
      blockOf(
        planFor(roomOf(firstAffordingWallAMm, wallBHoldingTheFridge, 2600)),
      ),
    ).toHaveLength(1);
    expect(
      blockOf(
        planFor(roomOf(firstAffordingWallAMm - 1, wallBHoldingTheFridge, 2600)),
      ),
    ).toEqual([]);
  });

  it("steps to two columns and then to three where the measured table says", () => {
    const sizeAt = (wallAMm: number) =>
      blockOf(
        planFor(
          roomOf(wallAMm, WALL_B_WHERE_S1_SEATED_THE_DISHWASHER_MM, 2600),
        ),
      ).length;

    // 7D5b S0b / ADR 0110 M11: the two- and three-column steps keep S1's values — there the bottle
    // stands beside the tower and costs it nothing, so M11 does not reach them. Only the first
    // column moves, back to the core's own edge (the one-column rows above and below).
    // 7D5b S2 / ADR 0110 M7/M10: the same 4200 / 4800 steps, witnessed at wall B 2600 (was 1700, where
    // (b) now trades a pantry column at 4200-4201 and 4402-4799). The all-on-wall-A rows that stood
    // here at wall B 1600 are every one of them a trade now, and are asserted as such below.
    expect([sizeAt(4199), sizeAt(4200)]).toEqual([1, 2]);
    expect([sizeAt(4799), sizeAt(4800)]).toEqual([2, 3]);
  });

  it("never grows past three columns however long the wall is", () => {
    // A storable room past the approved 6000 mm on purpose (M7 7A3): the claim is the composer's.
    expect(blockOf(planFor(roomOf(6300, 5100, 3900)))).toHaveLength(3);
  });

  it("composes one oven tower innermost with door columns outboard, contiguous at the free end", () => {
    // 6300 is past the approved 6000 mm on purpose (M7 7A3): the composer is judged, not the policy.
    // 7D5b S2 / ADR 0110 M7/M10: at wall B 2600, was 1700 — at 3600 x 1700 (c) now takes the tower.
    for (const wallAMm of [3600, 4200, 4800, 6300]) {
      const plan = planFor(
        roomOf(wallAMm, WALL_B_WHERE_S1_SEATED_THE_DISHWASHER_MM, 2600),
      );
      const block = blockOf(plan);
      const where = `wall A ${String(wallAMm)}`;

      expect(
        block.map((base) => base.buildId),
        where,
      ).toEqual([
        OVEN_TOWER,
        ...Array.from({ length: block.length - 1 }, () => DOOR_COLUMN),
      ]);
      // Contiguous, outermost, and wall A's last bodies — nothing stands beyond or between them.
      expect(alongWallA(plan).slice(-block.length), where).toEqual(block);
      expect(
        block.every(
          (base, index) =>
            index === 0 || base.startMm === block[index - 1]?.endMm,
        ),
        where,
      ).toBe(true);
      expect(
        plan.bases.filter(
          (base) =>
            base.wall === "A" &&
            base.startMm >= (block[0]?.startMm ?? Infinity) &&
            !block.includes(base),
        ),
        where,
      ).toEqual([]);
    }
  });

  it("puts every column on the wider entered wall and none against either run's corner end", () => {
    // **The block follows the run, and the owner ruled it may follow it onto wall B** (ADR 0110
    // Amendment E as Amendment I overturns its *"wall A … and nowhere else"*, M7 wave 7D8 criterion
    // 10). What survives of the old assertion is the part that was ever about the block rather than
    // about a letter: a column stands at the run's **free** end, never against its corner end. The
    // wall is re-derived from the room's two entered numbers, so this and the composer agree only if
    // both read the wider-wall rule the same way.
    const arms = { onWallA: 0, onWallB: 0 };
    // The pre-7A3 approved corner, kept on purpose: the composer is judged here, not the policy.
    for (const wallAMm of [3600, 4200, 4800, 6300]) {
      for (const wallBMm of [1000, 1600, 1700, 3000, 5100]) {
        const room = roomOf(wallAMm, wallBMm, 2600);
        const runs = lShellFloorRuns(room);
        for (const column of blockOf(planFor(room))) {
          if (column.wall === "A") arms.onWallA += 1;
          else arms.onWallB += 1;

          expect(column.wall, `${String(wallAMm)}x${String(wallBMm)}`).toBe(
            widerEnteredWall(room),
          );
          expect(column.startMm).not.toBe(runs.A.startMm);
          expect(column.startMm).not.toBe(runs.B.startMm);
        }
      }
    }

    // Both arms, because a rule stated as *the wider wall* and sampled only where that is wall A
    // agrees with the letter it replaced.
    expect(arms.onWallA).toBeGreaterThan(0);
    expect(arms.onWallB).toBeGreaterThan(0);
  });
});

describe("the merge hazard and the absorb (criteria 8, 9, 22)", () => {
  it("gives the block a flush free end at a 100 mm remainder, with no resize command", () => {
    const room = roomOf(4300, 3000, 2600);
    const plan = planFor(room);
    const result = generate(room);
    const run = lShellFloorRuns(room).A;

    // E6.2, not E6's original absorb: the outermost body of a block of two is the `'fit'` door
    // column, and it takes the merged opening by being planned at 600 + 100.
    expect(plan.floorWidthsMm.A).toEqual([600, 600, 600, 300, 600, 700]);
    expect(plan.remainderMm.A).toBe(0);
    expect(blockOf(plan).map((base) => [base.buildId, base.widthMm])).toEqual([
      [OVEN_TOWER, 600],
      [DOOR_COLUMN, 700],
    ]);
    expect(blockOf(plan).at(-1)?.endMm).toBe(run.endMm);

    // Nothing is centred: every column is placed at exactly the width it was planned at, so there
    // is no bare stretch on either side of one.
    for (const buildId of [OVEN_TOWER, DOOR_COLUMN]) {
      for (const placement of placementsOf(result.design, buildId)) {
        expect(setWidthTargets(result.log)).not.toContain(placement.id);
      }
    }
    expect(placementsOf(result.design, OVEN_TOWER)[0]?.body.widthMm).toBe(600);
    expect(placementsOf(result.design, DOOR_COLUMN)[0]?.body.widthMm).toBe(700);
    expect(validateDesignForCatalog(result.design, CATALOG)).toEqual([]);
    expect(findOverflowingPlacementIds(result.design)).toEqual([]);
  });

  it("absorbs nothing past the merge ceiling, and never inside a column's own width bound", () => {
    const bound = DECLARED_COLUMNS.doorColumnWidthMm;
    // 7D5b S2 / ADR 0110 M7/M10: at wall B 2600, was 1700, where (b), (c) and (d) reach this range.
    for (let wallAMm = 3900; wallAMm <= 4500; wallAMm += 1) {
      const plan = planFor(
        roomOf(wallAMm, WALL_B_WHERE_S1_SEATED_THE_DISHWASHER_MM, 2600),
      );
      const block = blockOf(plan);
      if (block.length === 0) continue;
      const outermost = block.at(-1);
      if (!outermost) throw new Error("a block with no outermost column");
      const where = `wall A ${String(wallAMm)}`;

      // A column is only ever wider than its declared width when it is the `'fit'` door column, and
      // then only inside that row's own bound (criterion 9's "never on a fixedWidth body").
      if (outermost.widthMm !== DECLARED_COLUMNS.columnWidthMm) {
        expect(outermost.buildId, where).toBe(DOOR_COLUMN);
        expect(outermost.widthMm, where).toBeGreaterThanOrEqual(bound.minMm);
        expect(outermost.widthMm, where).toBeLessThanOrEqual(bound.maxMm);
        expect(plan.remainderMm.A, where).toBe(0);
      }
      for (const inner of block.slice(0, -1)) {
        expect(inner.widthMm, where).toBe(DECLARED_COLUMNS.columnWidthMm);
      }
    }
  });

  it("gives up the block rather than centre a lone tower, and only ever from one column to none", () => {
    // The single leftover module at a remainder inside the merge window: the tower is fixed-width
    // and there is nothing inboard of it to absorb with, so no block stands and the wall composes
    // exactly as it did before the wave.
    // 7D5b S2 / ADR 0110 M7/M10: swept at wall B 2600, was 1700. At 1700 the sweep now also meets
    // (b)'s 2 -> 1 at 4402; that and every other step the trades make are the ruled exceptions asserted
    // below, and here, where no trade is tried, the rule's own shape is still exactly `1 -> 0`.
    const wallBMm = WALL_B_WHERE_S1_SEATED_THE_DISHWASHER_MM;
    const dips: string[] = [];
    let previous = blockOf(planFor(roomOf(900, wallBMm, 2600))).length;
    let refusedInTheWindow = 0;
    // Swept to the storable 6300 rather than the approved 6000 on purpose (M7 7A3): a composer claim.
    for (let wallAMm = 901; wallAMm <= 6300; wallAMm += 1) {
      const plan = planFor(roomOf(wallAMm, wallBMm, 2600));
      const size = blockOf(plan).length;
      if (size < previous) dips.push(`${String(previous)}->${String(size)}`);
      if (size === 0 && plan.remainderMm.A > 0 && plan.remainderMm.A <= 200) {
        refusedInTheWindow += 1;
      }
      previous = size;
    }

    expect(new Set(dips)).toEqual(new Set(["1->0"]));
    expect(refusedInTheWindow).toBeGreaterThan(0);
  });

  it("leaves the refused single-module wall composed exactly as the leftover rule alone would", () => {
    // 7D5b S2 / ADR 0110 M7/M10: searched at wall B 2600, was 1700. At 1700 the first room this search
    // found is now 3600, which is a (c) room — no block because the dishwasher took the tower, not
    // because E6.2 refused it — and it passed only because the dishwasher's module counts as the one
    // storage module the leftover rule would give. At 2600 the first is 3602, E6.2's own refusal.
    const wallBMm = WALL_B_WHERE_S1_SEATED_THE_DISHWASHER_MM;
    const refused = (() => {
      for (let wallAMm = 3600; wallAMm <= 4199; wallAMm += 1) {
        const plan = planFor(roomOf(wallAMm, wallBMm, 2600));
        if (blockOf(plan).length === 0 && plan.remainderMm.A > 0) {
          return { wallAMm, plan };
        }
      }
      throw new Error("no wall A refuses a lone tower inside the merge window");
    })();
    const room = roomOf(refused.wallAMm, wallBMm, 2600);
    expect(refused.wallAMm).toBe(3602);
    expect(
      refused.plan.bases.filter(
        (base) => base.wall === "A" && base.buildId === DISHWASHER,
      ),
    ).toEqual([]);
    const run = lShellFloorRuns(room).A;
    const coreWidthMm = refused.plan.bases
      .filter(
        (base) =>
          base.wall === "A" &&
          (base.role !== "storage" || base.buildId === BOTTLE_CARGO_BUILD_ID),
      )
      .reduce((sum, base) => sum + base.widthMm, 0);
    const leftover = planLeftover(run.endMm - run.startMm - coreWidthMm);

    expect(
      refused.plan.floorWidthsMm.A.filter((widthMm) => widthMm !== 600),
    ).toEqual([BOTTLE_WIDTH_MM]);
    expect(
      refused.plan.bases.filter(
        (base) =>
          base.wall === "A" &&
          base.role === "storage" &&
          base.buildId !== BOTTLE_CARGO_BUILD_ID,
      ),
    ).toHaveLength(leftover.storageCount);
    expect(refused.plan.remainderMm.A).toBe(leftover.remainderMm);
    expect(hobOf(refused.plan).buildId).toBe(HOB_WITH_OVEN);
  });
});

describe("7D5b S2 — the block table where the dishwasher is traded in (ADR 0110 M7/M10)", () => {
  // 7D5b S2 / ADR 0110 M7/M10: the ruled exceptions to the table above, each read where 7D3 measured it.
  // Where S1 placed no dishwasher the run may give up, in order, one pantry column (b), the bottle (d),
  // or the oven tower where it is the block's only column (c), and the dishwasher stands directly after
  // the sink, shifting the sink's wall one module. (c) can only fire where a block of one would stand,
  // so the dishwasher's first appearance is where the run first affords the module.

  it("gives wall B 1700's first module to the dishwasher by (c), and stands the tower from 3900 beside a (d) dishwasher", () => {
    const planAt = (wallAMm: number) => planFor(roomOf(wallAMm, 1700, 2600));

    expect(featuresOf(planAt(3299))).toEqual({
      columns: [],
      hob: HOB_WITH_OVEN,
      dishwasher: "none",
      hasBottle: true,
    });
    expect(featuresOf(planAt(3300))).toEqual({
      columns: [],
      hob: HOB_WITH_OVEN,
      dishwasher: "A [1500, 2100]",
      hasBottle: false,
    });
    expect(wallASpansOf(planAt(3300))).toEqual([
      "base-sink [900, 1500]",
      "base-dishwasher [1500, 2100]",
      "base-3drawer [2100, 2700]",
      "base-hob-oven [2700, 3300]",
    ]);
    expect(featuresOf(planAt(3899)).columns).toEqual([]);
    expect(featuresOf(planAt(3900))).toEqual({
      columns: [OVEN_TOWER],
      hob: HOB_WITH_DRAWERS,
      dishwasher: "A [1500, 2100]",
      hasBottle: false,
    });
  });

  it("records every all-on-wall-A row of the old table as the trade that now decides it", () => {
    // Wall B 1600 cannot seat the fridge, so wall A carries the whole order; the old rows were
    // 3999 / 4000 -> 0 / 1, 4299 -> 1, 4899 / 4900 -> 1 / 2 and 5499 / 5500 -> 2 / 3. Every wall B under
    // 1700 is reached by the trades, so the rows are restated rather than moved.
    const rowAt = (wallAMm: number) => {
      const plan = planFor(roomOf(wallAMm, 1600, 2600));
      const { columns, dishwasher } = featuresOf(plan);
      return `${String(wallAMm)}: ${String(columns.length)} columns, dishwasher ${dishwasher}`;
    };

    expect(
      [3999, 4000, 4299, 4600, 4899, 4900, 5499, 5500, 5800].map(rowAt),
    ).toEqual([
      "3999: 0 columns, dishwasher none",
      // (c): the first afforded module, the tower's, goes to the dishwasher (was 1).
      "4000: 0 columns, dishwasher A [2200, 2800]",
      "4299: 0 columns, dishwasher A [2200, 2800]",
      // (d): the bottle goes and the tower stays.
      "4600: 1 columns, dishwasher A [2200, 2800]",
      "4899: 1 columns, dishwasher A [2200, 2800]",
      // (b): a pantry column goes (was 2 from 4900, 3 from 5500).
      "4900: 1 columns, dishwasher A [2200, 2800]",
      "5499: 1 columns, dishwasher A [2200, 2800]",
      "5500: 2 columns, dishwasher A [2200, 2800]",
      // S1's drawer swap (e): no trade, and the full block of three stands.
      "5800: 3 columns, dishwasher A [2200, 2800]",
    ]);
  });

  it("steps down at wall B 1700 only where a trade moves: (b)'s 2 -> 1 and (c)'s 1 -> 0 after (d)", () => {
    // The exact attribution the sweep at 2600 cannot show. (b)'s step lands in the room where a
    // dishwasher first stands, one step after a room with none, and keeps the oven tower innermost.
    // (c)'s step is not a dishwasher appearing: the room before already stood one by (d), keeping the
    // tower and giving up the bottle; one millimetre on, the lone tower could not absorb the 2 mm that
    // (d) would leave (E6.2), so (d) no longer fits and (c) gives up the tower and keeps the bottle.
    const dips: string[] = [];
    let previous = planFor(roomOf(900, 1700, 2600));
    for (let wallAMm = 901; wallAMm <= 6300; wallAMm += 1) {
      const plan = planFor(roomOf(wallAMm, 1700, 2600));
      const before = featuresOf(previous);
      const after = featuresOf(plan);
      if (after.columns.length < before.columns.length) {
        dips.push(
          `${String(wallAMm)}: [${before.columns.join()}] -> [${after.columns.join()}], ` +
            `dishwasher ${before.dishwasher} -> ${after.dishwasher}, ` +
            `bottle ${String(before.hasBottle)} -> ${String(after.hasBottle)}, hob ${after.hob}`,
        );
      }
      previous = plan;
    }

    expect(dips).toEqual([
      `3902: [${OVEN_TOWER}] -> [], dishwasher A [1500, 2100] -> A [1500, 2100], ` +
        `bottle false -> true, hob ${HOB_WITH_OVEN}`,
      `4402: [${OVEN_TOWER},${DOOR_COLUMN}] -> [${OVEN_TOWER}], dishwasher none -> A [1500, 2100], ` +
        `bottle true -> true, hob ${HOB_WITH_DRAWERS}`,
    ]);
  });

  it("gives up the old ceiling witness's tower to (c), and the hob carries the oven", () => {
    const plan = planFor(roomOf(3600, 1700, DECLARED_COLUMNS.columnHeightMm));

    expect(featuresOf(plan)).toEqual({
      columns: [],
      hob: HOB_WITH_OVEN,
      dishwasher: "A [1500, 2100]",
      hasBottle: true,
    });
  });
});

/** The block rule's outputs and the trade's marks, read off a plan with literal spans. */
function featuresOf(plan: ReturnType<typeof planFor>) {
  const dishwasher = plan.bases.find((base) => base.buildId === DISHWASHER);
  return {
    columns: blockOf(plan).map((base) => base.buildId),
    hob: plan.bases.find((base) => base.role === "hob")?.buildId ?? "none",
    dishwasher: dishwasher
      ? `${dishwasher.wall} [${String(dishwasher.startMm)}, ${String(dishwasher.endMm)}]`
      : "none",
    hasBottle: plan.bases.some(
      (base) => base.buildId === BOTTLE_CARGO_BUILD_ID,
    ),
  };
}

function wallASpansOf(plan: ReturnType<typeof planFor>): readonly string[] {
  return alongWallA(plan).map(
    (base) =>
      `${base.buildId} [${String(base.startMm)}, ${String(base.endMm)}]`,
  );
}

describe("the ceiling clause (criterion 14)", () => {
  it("stands a column in a room exactly as tall as it is, with nothing reported above the room", () => {
    // 7D5b S2 / ADR 0110 M7/M10: at wall B 2600, was 1700, where (c) now takes the tower at 3600.
    const room = roomOf(
      3600,
      WALL_B_WHERE_S1_SEATED_THE_DISHWASHER_MM,
      DECLARED_COLUMNS.columnHeightMm,
    );
    const result = generate(room);

    expect(placementsOf(result.design, OVEN_TOWER)).toHaveLength(1);
    expect(
      validateDesignForCatalog(result.design, CATALOG).map(
        (finding) => finding.code,
      ),
    ).toEqual([]);
    expect(findOverflowingPlacementIds(result.design)).toEqual([]);
  });

  it("plans no column one millimetre below it, and the hob keeps its own oven", () => {
    // Reachable through the engine's own limits, never through the approved policy, whose floor is
    // the column's height. Asserted on the **plan**, because at 2199 mm `generateKitchen` already
    // throws for a reason that predates this wave — the wall row's 1500 + 700 mm upper stands above
    // a 2199 mm ceiling in every room, block or no block. This clause is what stops a column from
    // being planned and then refused at insert time, which is a failure of a different kind.
    const plan = planFor(
      roomOf(
        3600,
        WALL_B_WHERE_S1_SEATED_THE_DISHWASHER_MM,
        DECLARED_COLUMNS.columnHeightMm - 1,
      ),
    );

    expect(blockOf(plan)).toEqual([]);
    expect(hobOf(plan).buildId).toBe(HOB_WITH_OVEN);
  });
});

describe("one authority for the block's bodies and sizes (criterion 23)", () => {
  const generationDir = fileURLToPath(
    new URL("../../src/generation/", import.meta.url),
  );
  const sources = readdirSync(generationDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({
      name,
      text: readFileSync(generationDir + name, "utf8"),
    }));

  it("names each of the three bodies in exactly one module", () => {
    for (const buildId of [OVEN_TOWER, DOOR_COLUMN, HOB_WITH_DRAWERS]) {
      expect(
        sources
          .filter((source) => source.text.includes(`"${buildId}"`))
          .map((source) => source.name),
      ).toEqual(["tall-end-rule.ts"]);
    }
  });

  it("writes no size of a column as a literal, and never mentions symmetry", () => {
    // The column's own width is also the leftover rule's declared module width, so a bare sweep for
    // 600 would fail on a number that has nothing to do with a column. The two claims that separate
    // them: no module writes a size only a column has, and the one module that names the columns
    // writes no number at all — it takes every size it uses from its caller.
    const columnOnlySizes = [
      DECLARED_COLUMNS.columnHeightMm,
      DECLARED_COLUMNS.doorColumnWidthMm.minMm,
      DECLARED_COLUMNS.doorColumnWidthMm.maxMm,
    ];
    for (const source of sources) {
      const code = source.text.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
      for (const sizeMm of columnOnlySizes) {
        expect(
          new RegExp(`\\b${String(sizeMm)}\\b`).test(code),
          `${source.name} writes ${String(sizeMm)} as a literal`,
        ).toBe(false);
      }
      expect(code.toLowerCase(), source.name).not.toContain("symmetry");
    }
    const rule = sources.find((source) => source.name === "tall-end-rule.ts");
    expect(rule).toBeDefined();
    expect(
      new RegExp(`\\b${String(DECLARED_COLUMNS.columnWidthMm)}\\b`).test(
        rule?.text.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "") ?? "",
      ),
    ).toBe(false);
  });
});
