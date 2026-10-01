// Wave 6X-a — **the ladder's direction is asserted, not only its existence**
// ([ADR 0093](../../../../docs/decisions/0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md)
// Amendment A §6).
//
// Wave 6X witnesses that `frozenExtentsSlidAlongTheWall` moves a frozen extent. It does not witness
// **which way**. Adversarial QA measured the gap: swapping `cabinetDepthMm` and
// `previousCabinetDepthMm` at `rebuildEveryBodyAt`'s planning call site slides a member-less extent
// 100 mm the *wrong* way — `B|1.10` where the rule says `B|1.30` — and leaves the whole tree green.
// ADR 0093 decision 1 rules that a behaviour the tree cannot distinguish from its own absence is
// unshipped; a **direction** the tree cannot distinguish from its own reverse is unshipped by the
// same sentence, one rung down.
//
// The swap reaches exactly the rungs with the least evidence behind them. `alongWallQueryFor` feeds
// the two settings to `fromCabinetDepthMm` / `toCabinetDepthMm`, which only the **declared-chain**
// rungs (3 and 4) read; an occupied extent takes rung 2 and moves by `membersShiftMm`, which the
// swap cannot touch. So this file is in four parts:
//
// - **the declared-chain rung, by value** — the member-less extent's arriving key and along-wall
//   coordinate as literals, in both directions, with the coordinate the swap produces named beside
//   the one the rule produces, so a rung that moves the right distance the wrong way is told apart
//   from one that does not move at all;
// - **the occupied rungs' indifference** — asserted rather than assumed, because an occupied extent
//   that *did* move under the swap would mean the ladder is not the ladder ADR 0090 decision 2
//   describes;
// - **wall A unmoved**, key for key and value for value (decision 2 rung 1);
// - **the command's own output**, on a design this file declares. The shipped kitchen cannot show
//   the mis-slide at the command boundary — measured below, and it is why the whole tree stays
//   green — so the consequence is witnessed the way ADR 0093 decision 2 requires: by a declared
//   document, never by moving the seeded one.
import { describe, expect, it } from "vitest";

import {
  alongWallShiftByColumnMm,
  alongWallShiftMm,
} from "../../src/along-wall-chain-shift.js";
import type { AlongWallDepthChain } from "../../src/cabinet-depth-rule.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import { cabinetDepthMmOf } from "../../src/design.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  frozenExtentsSlidAlongTheWall,
  type FrozenExtentsSlideQuery,
} from "../../src/frozen-map-at-cabinet-depth.js";
import { toMetres } from "../../src/millimetres.js";
import { alongWallCoordinate } from "../../src/module-grid.js";
import {
  deriveColumns,
  deriveRecordedColumns,
  derivePlacementRecords,
  projectFrozenMap,
  withFrozenMap,
  type Column,
} from "../../src/void-engine.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-07T10:00:00.000Z";
const SHALLOW_MM = 600;
const DEEP_MM = 700;

/** §7's base rows reach the worktop line; a placement that records only the carcass records 820. The
 *  gap between the two is what turns a planning column's top into a refusal — ADR 0088's `A|2.00`. */
const BASE_BODY_HEIGHT_MM = 860;
const SEEDED_BASE_CARCASS_MM = 820;

/** `p5` and `p22` — the oven tower and the cabinet over it, the whole of the shipped kitchen's
 *  `B|1.20`. Deleting both leaves the one genuinely member-less column on wall B, which is the only
 *  column of the shipped kitchen that reaches rung 3 at all. */
const THE_WHOLE_OVEN_TOWER: readonly string[] = ["p5", "p22"];

// ---------------------------------------------------------------------------------------------
// The numbers this wave exists to pin. Both of them, per direction: what the rule produces, and
// what the swapped operands produce.
// ---------------------------------------------------------------------------------------------

/** One direction of travel, with the member-less extent's three coordinates in millimetres.
 *
 *  `alongWallShiftMm` is a difference of two corner reaches, so `base-formula`'s reach of 560 at
 *  600 mm and 660 at 700 mm makes the shift ±100 — and reversing the operands negates it rather
 *  than zeroing it. **That is the whole of what this file measures**: the swap does not stop the
 *  extent, it turns it round, and `arrivesAtMm` and `arrivesAtMmSwapped` sit 200 mm apart. */
interface DirectionOfTravel {
  readonly label: string;
  readonly startsAtMm: number;
  readonly endsAtMm: number;
  readonly leavesFromMm: number;
  readonly arrivesAtMm: number;
  readonly arrivesAtKey: string;
  readonly arrivesAtMmSwapped: number;
  readonly arrivesAtKeySwapped: string;
  /** The recorded source the chain is read from — `deriveColumns` names the member that won §3.2's
   *  MAX, and the rebuild renames it once the kitchen has been through the command. */
  readonly recordedSource: string;
  /** The occupied wall-B keys the same map carries, which rung 2 puts there and the swap cannot
   *  reach. Literals, so a wave that moved one of them has to say so. */
  readonly occupiedWallBKeys: readonly string[];
  /** Every wall-A key in the same map. Rung 1: wall A is anchored at the corner. */
  readonly wallAKeys: readonly string[];
}

const DEEPENING: DirectionOfTravel = {
  label: "600 → 700",
  startsAtMm: SHALLOW_MM,
  endsAtMm: DEEP_MM,
  leavesFromMm: 1200,
  arrivesAtMm: 1300,
  arrivesAtKey: "B|1.30",
  arrivesAtMmSwapped: 1100,
  arrivesAtKeySwapped: "B|1.10",
  recordedSource: "tall-oven-tower-600",
  occupiedWallBKeys: ["B|0.69", "B|0.84", "B|1.90", "B|2.55"],
  wallAKeys: [
    "A|0.30",
    "A|0.45",
    "A|0.75",
    "A|1.30",
    "A|2.00",
    "A|2.60",
    "A|3.20",
  ],
};

const SHALLOWING: DirectionOfTravel = {
  label: "700 → 600",
  startsAtMm: DEEP_MM,
  endsAtMm: SHALLOW_MM,
  leavesFromMm: 1300,
  arrivesAtMm: 1200,
  arrivesAtKey: "B|1.20",
  arrivesAtMmSwapped: 1400,
  arrivesAtKeySwapped: "B|1.40",
  recordedSource: "tall-oven-tower",
  occupiedWallBKeys: ["B|0.61", "B|0.74", "B|1.80", "B|2.45"],
  wallAKeys: [
    "A|0.30",
    "A|0.45",
    "A|0.75",
    "A|1.30",
    "A|2.00",
    "A|2.60",
    "A|3.20",
  ],
};

const BOTH_DIRECTIONS: readonly DirectionOfTravel[] = [DEEPENING, SHALLOWING];

/** The chain shift the two arriving coordinates are 2 × apart by. Named rather than inlined so the
 *  criterion *"the 100 mm the swap displaces is named with both numbers"* is one readable line. */
const CHAIN_SHIFT_MM = 100;

/** Every body of the shipped kitchen's `B|1.20` is a base-run body, so the extent it leaves behind
 *  slides on the base run's carcass — 560 mm of corner reach at 600 and 660 at 700. */
const THE_RECORDED_SOURCE_CHAIN: AlongWallDepthChain = "base-formula";

// ---------------------------------------------------------------------------------------------
// The documents, and the operands the command's planning map is built from.
// ---------------------------------------------------------------------------------------------

/** The design carrying the frozen map the product would carry after these deletes: `publishedColumns`
 *  returns the map unchanged on a delete (ADR 0011 Gap D) and `projectFrozenMap` writes the survivors
 *  out. Copied from the 6K-i adversarial file's `afterDeleting` rather than shared, because that file
 *  reads the setting off `KITCHEN_L_DESIGN` and this one deletes from a 700 mm document too. */
function afterDeleting(
  design: Design,
  placementIds: readonly string[],
): Design {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  const beforeTheDeletes = deriveColumns(
    derivePlacementRecords(design, catalog),
    {},
    design.room,
  );
  const cleared: Design = {
    ...design,
    placements: design.placements.filter(
      (placement) => !placementIds.includes(placement.id),
    ),
  };
  return withFrozenMap(
    cleared,
    projectFrozenMap(
      beforeTheDeletes,
      derivePlacementRecords(cleared, catalog),
    ),
  );
}

function changeTo(design: Design, cabinetDepthMm: number) {
  return setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: createFakeProbeFactory(),
    occurredAt: OCCURRED_AT,
  });
}

/** The shipped kitchen at the setting a direction **starts** from, so the 700 → 600 case is a real
 *  700 mm document rather than a 600 mm one asked a backwards question: its wall-B run stands where
 *  the command put it and its oven tower has been rebuilt to `tall-oven-tower`. */
function theShippedKitchenAt(cabinetDepthMm: number): Design {
  if (cabinetDepthMm === cabinetDepthMmOf(KITCHEN_L_DESIGN)) {
    return KITCHEN_L_DESIGN;
  }
  const result = changeTo(KITCHEN_L_DESIGN, cabinetDepthMm);
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result.design;
}

/** The pre-command design with **only** the along-wall coordinates the command actually moved its
 *  bodies to, read off the command's own output and paired by id — 6K-i's rule, unchanged: a second
 *  author for ADR 0090 decision 2's ladder is what ADR 0088 decision 2 exists to prevent. */
function slidAsTheCommandDid(design: Design, cabinetDepthMm: number): Design {
  const result = changeTo(design, cabinetDepthMm);
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  const arrivedAt = new Map(
    result.design.placements.map((placement) => [placement.id, placement]),
  );
  return {
    ...design,
    placements: design.placements.map((placement) => {
      const arrived = arrivedAt.get(placement.id);
      if (!arrived) throw new Error(`${placement.id} left the design`);
      return arrived.alongMm === placement.alongMm
        ? placement
        : { ...placement, alongMm: arrived.alongMm };
    }),
  };
}

/** The five operands `rebuildEveryBodyAt` passes the slide, assembled here in the same order and
 *  from the same derivations `heldRunAcrossTheCommand` uses. Returned as the query rather than as a
 *  map, so the two callers below differ in the operand **order** and in nothing else. */
function slideOperandsOf(
  design: Design,
  cabinetDepthMm: number,
): FrozenExtentsSlideQuery {
  const previousCabinetDepthMm = cabinetDepthMmOf(design);
  const previousCatalog = buildKitchenLBodyCatalog(previousCabinetDepthMm);
  const heldRecords = derivePlacementRecords(design, previousCatalog);
  const slidRecords = derivePlacementRecords(
    slidAsTheCommandDid(design, cabinetDepthMm),
    previousCatalog,
  );
  return {
    frozen: deriveRecordedColumns(
      heldRecords,
      {
        emptyColumns: design.emptyColumns,
        columnExtents: design.columnExtents,
      },
      toMetres(design.room.widthMm),
    ),
    catalog: buildKitchenLBodyCatalog(cabinetDepthMm),
    cabinetDepthMm,
    previousCabinetDepthMm,
    membersShiftMmByColumn: alongWallShiftByColumnMm(heldRecords, slidRecords),
    room: design.room,
  };
}

function slidAsProductionPassesTheOperands(
  design: Design,
  cabinetDepthMm: number,
): ReadonlyMap<string, Column> {
  return frozenExtentsSlidAlongTheWall(slideOperandsOf(design, cabinetDepthMm));
}

/** The same map with the two depth operands the other way round — the weakening ADR 0093
 *  Amendment A §6 measured, expressed as a value here so its result can be asserted rather than
 *  remembered from a mutation run. */
function slidWithTheDepthOperandsSwapped(
  design: Design,
  cabinetDepthMm: number,
): ReadonlyMap<string, Column> {
  const operands = slideOperandsOf(design, cabinetDepthMm);
  return frozenExtentsSlidAlongTheWall({
    ...operands,
    cabinetDepthMm: operands.previousCabinetDepthMm,
    previousCabinetDepthMm: operands.cabinetDepthMm,
  });
}

function millimetres(metres: number): number {
  return Math.round(metres * 1000);
}

function columnAt(map: ReadonlyMap<string, Column>, key: string): Column {
  const column = map.get(key);
  if (!column) throw new Error(`no column ${key} in ${[...map.keys()].join()}`);
  return column;
}

function alongWallMm(column: Column): number {
  return millimetres(alongWallCoordinate(column.wall, column));
}

/** One wall's entries in one order, so two maps can be compared whole rather than field by field —
 *  a regression that rewrote `x`, `z` or `d` is caught by the same assertion as one that moved a
 *  key. */
function columnsOnWall(
  map: ReadonlyMap<string, Column>,
  wall: Column["wall"],
): readonly (readonly [string, Column])[] {
  return [...map]
    .filter(([, column]) => column.wall === wall)
    .sort(([left], [right]) => left.localeCompare(right));
}

function keysOnWall(
  map: ReadonlyMap<string, Column>,
  wall: Column["wall"],
): readonly string[] {
  return columnsOnWall(map, wall).map(([key]) => key);
}

/** The one wall-B column no placement stands in, at the coordinates the run arrives at. */
function memberLessWallBKeys(
  map: ReadonlyMap<string, Column>,
  occupied: readonly string[],
): readonly string[] {
  return keysOnWall(map, "B").filter((key) => !occupied.includes(key));
}

// ---------------------------------------------------------------------------------------------
// Part 1 — the declared-chain rung, by value, per direction.
// ---------------------------------------------------------------------------------------------

describe("the member-less extent's arriving coordinate, and the one the swapped operands give it", () => {
  it.each(BOTH_DIRECTIONS)(
    "slides the oven tower's frozen extent to its arriving coordinate at $label, and to the mirror of it when the depth operands are swapped",
    (direction) => {
      const design = afterDeleting(
        theShippedKitchenAt(direction.startsAtMm),
        THE_WHOLE_OVEN_TOWER,
      );

      // The preconditions that make the two coordinates below the *document's* rather than two
      // literals that happen to differ: the extent really is member-less, it really is recorded at
      // `leavesFromMm`, and the chain it slides on really is the recorded source's.
      expect(design.emptyColumns).toStrictEqual([
        {
          wall: "B",
          alongMm: direction.leavesFromMm,
          widthMm: 600,
          y0Mm: 0,
          topMm: 2600,
          depthMm: direction.startsAtMm === SHALLOW_MM ? 638 : 738,
          depthFromBuildId: direction.recordedSource,
        },
      ]);

      const slid = slidAsProductionPassesTheOperands(
        design,
        direction.endsAtMm,
      );
      const swapped = slidWithTheDepthOperandsSwapped(
        design,
        direction.endsAtMm,
      );

      // **The rule's answer, by value.** Not "it moved", not a bound: the key and the coordinate.
      expect(
        memberLessWallBKeys(slid, direction.occupiedWallBKeys),
      ).toStrictEqual([direction.arrivesAtKey]);
      expect(alongWallMm(columnAt(slid, direction.arrivesAtKey))).toBe(
        direction.arrivesAtMm,
      );

      // **The swap's answer, by value, beside it.** The same 100 mm, negated — which is what tells a
      // rung that moves the right distance the wrong way apart from one that does not move.
      expect(
        memberLessWallBKeys(swapped, direction.occupiedWallBKeys),
      ).toStrictEqual([direction.arrivesAtKeySwapped]);
      expect(
        alongWallMm(columnAt(swapped, direction.arrivesAtKeySwapped)),
      ).toBe(direction.arrivesAtMmSwapped);
      expect(swapped.has(direction.arrivesAtKey)).toBe(false);
      expect(slid.has(direction.arrivesAtKeySwapped)).toBe(false);
    },
  );

  // The displacement stated against the shift rule itself, so the pair above cannot be satisfied by
  // two numbers that merely differ, and neither coordinate can be quietly edited to accommodate a
  // defect (ADR 0090 decision 7). `1300 - 1200` is what `alongWallShiftMm` answers for the move
  // being made and `1100 - 1200` is what it answers for its reverse — the corner reach's own
  // 560 → 660, not a literal restated here.
  it.each(BOTH_DIRECTIONS)(
    "displaces the extent by the corner's own gain one way and by its reverse the other, at $label",
    (direction) => {
      const shiftMm = (fromMm: number, toMm: number) =>
        alongWallShiftMm({
          fromCabinetDepthMm: fromMm,
          toCabinetDepthMm: toMm,
          chain: THE_RECORDED_SOURCE_CHAIN,
        });

      expect(direction.arrivesAtMm - direction.leavesFromMm).toBe(
        shiftMm(direction.startsAtMm, direction.endsAtMm),
      );
      expect(direction.arrivesAtMmSwapped - direction.leavesFromMm).toBe(
        shiftMm(direction.endsAtMm, direction.startsAtMm),
      );
      expect(
        Math.abs(direction.arrivesAtMm - direction.arrivesAtMmSwapped),
      ).toBe(2 * CHAIN_SHIFT_MM);
    },
  );
});

// ---------------------------------------------------------------------------------------------
// Part 2 — the occupied rung is indifferent to the operand order, and that is asserted.
// ---------------------------------------------------------------------------------------------

describe("the occupied extents, which move by their own members and not by the setting", () => {
  it.each(BOTH_DIRECTIONS)(
    "lands every occupied wall-B extent at the same key and the same values under either operand order, at $label",
    (direction) => {
      const design = afterDeleting(
        theShippedKitchenAt(direction.startsAtMm),
        THE_WHOLE_OVEN_TOWER,
      );

      const slid = slidAsProductionPassesTheOperands(
        design,
        direction.endsAtMm,
      );
      const swapped = slidWithTheDepthOperandsSwapped(
        design,
        direction.endsAtMm,
      );

      const occupied = (map: ReadonlyMap<string, Column>) =>
        columnsOnWall(map, "B").filter(([key]) =>
          direction.occupiedWallBKeys.includes(key),
        );

      // Non-vacuity first: rung 2 has to be carrying real columns here, or the equality below is a
      // comparison of two empty lists.
      expect(occupied(slid).map(([key]) => key)).toStrictEqual([
        ...direction.occupiedWallBKeys,
      ]);
      expect(occupied(swapped)).toStrictEqual(occupied(slid));
    },
  );
});

// ---------------------------------------------------------------------------------------------
// Part 3 — wall A is anchored at the corner. ADR 0090 decision 2 rung 1.
// ---------------------------------------------------------------------------------------------

describe("wall A, which is anchored at the corner and moves for no operand order", () => {
  it.each(BOTH_DIRECTIONS)(
    "keeps every wall-A column at the coordinate it was recorded at, under either operand order, at $label",
    (direction) => {
      const design = afterDeleting(
        theShippedKitchenAt(direction.startsAtMm),
        THE_WHOLE_OVEN_TOWER,
      );
      const operands = slideOperandsOf(design, direction.endsAtMm);

      const slid = slidAsProductionPassesTheOperands(
        design,
        direction.endsAtMm,
      );
      const swapped = slidWithTheDepthOperandsSwapped(
        design,
        direction.endsAtMm,
      );

      expect(keysOnWall(slid, "A")).toStrictEqual([...direction.wallAKeys]);
      expect(columnsOnWall(swapped, "A")).toStrictEqual(
        columnsOnWall(slid, "A"),
      );
      // Key for key **and value for value** against the operand the slide was handed, so a wall-A
      // entry re-keyed or re-seated by either order is caught rather than compared with its twin.
      expect(columnsOnWall(slid, "A")).toStrictEqual(
        columnsOnWall(operands.frozen, "A"),
      );
    },
  );
});

// ---------------------------------------------------------------------------------------------
// Part 4 — the consequence at the command boundary, on a design this file declares.
// ADR 0093 decision 2: the seeded kitchen does not move.
// ---------------------------------------------------------------------------------------------

/** **Two 200 mm columns 200 mm apart, which is the pitch the mis-slide can be seen at.**
 *
 *  A mis-slid member-less extent changes no output unless it lands on the key of a column that
 *  holds a record: `deriveColumnsOverFrozenExtents` merges by key, and a member-less planning column
 *  standing on its own is read by nothing. The displacement is one chain shift each way, so the
 *  swapped destination is 2 × 100 mm from the correct one — and a column exactly 200 mm from the
 *  member-less one is what the swap collides with.
 *
 *  §7's hinged base row opens at 200 mm (`HINGED_CABINET_MIN_WIDTH_MM`), so two 200 mm columns
 *  centred 200 mm apart abut without overlapping. The shipped kitchen has no such pair — measured
 *  below — which is exactly why swapping the operands leaves the whole tree green.
 *
 *  `u1` is the survivor: a placement recording the seeded 820 mm carcass under an ordinary,
 *  deletable top, the shape ADR 0088 measured on `A|2.00`. `v1` is the whole of the column that goes
 *  member-less, and it is 820 mm tall so the extent it leaves behind records a top of 820 — the
 *  number that refuses `u1`'s 860 mm rebuild once it lands on `u1`'s column. */
const DECLARED_COLUMN_PITCH_MM = 200;
const DECLARED_COLUMN_WIDTH_MM = 200;
const THE_SURVIVING_BASE = "u1";
const THE_DELETED_TOP = "u2";
const THE_WHOLE_MEMBER_LESS_COLUMN = "v1";

const DECLARED_WALL_B_COLUMNS: readonly DesignPlacement[] = [
  {
    id: THE_SURVIVING_BASE,
    wall: "B",
    alongMm: 1000,
    y0Mm: 0,
    body: {
      buildId: "base-cabinet",
      widthMm: DECLARED_COLUMN_WIDTH_MM,
      heightMm: SEEDED_BASE_CARCASS_MM,
    },
  },
  {
    id: THE_DELETED_TOP,
    wall: "B",
    alongMm: 1000,
    y0Mm: 2200,
    body: {
      buildId: "wall-2door-600-top",
      widthMm: DECLARED_COLUMN_WIDTH_MM,
      heightMm: 400,
    },
  },
  {
    id: THE_WHOLE_MEMBER_LESS_COLUMN,
    wall: "B",
    alongMm: 1200,
    y0Mm: 0,
    body: {
      buildId: "base-cabinet",
      widthMm: DECLARED_COLUMN_WIDTH_MM,
      heightMm: SEEDED_BASE_CARCASS_MM,
    },
  },
];

/** Where the two declared columns stand once the run has moved: both slide by their own chain's
 *  100 mm, so they stay 200 mm apart — and the member-less extent slid the wrong way lands exactly
 *  on the occupied one. */
const OCCUPIED_ARRIVES_AT_KEY = "B|1.10";
const MEMBER_LESS_ARRIVES_AT_KEY = "B|1.30";
const MEMBER_LESS_ARRIVES_AT_MM = 1300;

function theDeclaredDesign(): Design {
  const withTheColumns: Design = {
    ...KITCHEN_L_DESIGN,
    placements: [
      ...KITCHEN_L_DESIGN.placements.filter(
        (placement) => !THE_WHOLE_OVEN_TOWER.includes(placement.id),
      ),
      ...DECLARED_WALL_B_COLUMNS,
    ],
  };
  return afterDeleting(withTheColumns, [
    THE_DELETED_TOP,
    THE_WHOLE_MEMBER_LESS_COLUMN,
  ]);
}

describe("the consequence at the command boundary, on a pitch the mis-slide can be seen at", () => {
  it("records a 2600 mm extent over the surviving 820 mm base, and an 820 mm extent 200 mm along from it", () => {
    const design = theDeclaredDesign();

    expect(
      (design.columnExtents ?? []).find(
        (entry) => entry.wall === "B" && entry.alongMm === 1000,
      ),
    ).toMatchObject({
      widthMm: DECLARED_COLUMN_WIDTH_MM,
      y0Mm: 0,
      topMm: 2600,
      depthFromBuildId: "base-cabinet",
    });
    expect(design.emptyColumns).toStrictEqual([
      {
        wall: "B",
        alongMm: 1200,
        widthMm: DECLARED_COLUMN_WIDTH_MM,
        y0Mm: 0,
        topMm: SEEDED_BASE_CARCASS_MM,
        depthMm: 620,
        depthFromBuildId: "base-cabinet",
      },
    ]);
    expect(
      design.placements.find((placement) => placement.id === THE_SURVIVING_BASE)
        ?.body.heightMm,
    ).toBe(SEEDED_BASE_CARCASS_MM);
  });

  // **The assertion the wave is for.** With the operands the right way round the member-less extent
  // goes to `B|1.30` and `B|1.10` keeps its recorded 2600 mm top, so the surviving base rebuilds to
  // the worktop line. With them swapped the extent goes to `B|1.10` instead, overwrites that top
  // with its own 820, and the 860 mm rebuild is refused — `HEIGHT_EXCEEDS_LEVEL`, at the command's
  // own boundary. The refusal code is the subject rather than a boolean so the red carries a number.
  it("changes the kitchen's depth and rebuilds the surviving base to the worktop line", () => {
    const result = changeTo(theDeclaredDesign(), DEEP_MM);

    expect(result.ok ? "ok" : result.reason.code).toBe("ok");
    if (!result.ok) return;
    expect(
      result.design.placements.find(
        (placement) => placement.id === THE_SURVIVING_BASE,
      )?.body.heightMm,
    ).toBe(BASE_BODY_HEIGHT_MM);
  });

  it("publishes the member-less column where the rule sends it, not where the swapped operands would", () => {
    const result = changeTo(theDeclaredDesign(), DEEP_MM);

    expect(result.ok ? "ok" : result.reason.code).toBe("ok");
    if (!result.ok) return;
    expect(result.design.emptyColumns).toStrictEqual([
      {
        wall: "B",
        alongMm: MEMBER_LESS_ARRIVES_AT_MM,
        widthMm: DECLARED_COLUMN_WIDTH_MM,
        y0Mm: 0,
        topMm: SEEDED_BASE_CARCASS_MM,
        depthMm: 720,
        depthFromBuildId: "base-cabinet",
      },
    ]);
  });

  // The collision is the mechanism, and it is asserted as a value so the test above cannot go green
  // for a different reason: swapped, the two columns share one key and the 820 mm top wins.
  it("puts the mis-slid extent on the occupied column's own key, and its 820 mm top over the recorded 2600", () => {
    const design = theDeclaredDesign();

    const slid = slidAsProductionPassesTheOperands(design, DEEP_MM);
    const swapped = slidWithTheDepthOperandsSwapped(design, DEEP_MM);

    expect(alongWallMm(columnAt(slid, MEMBER_LESS_ARRIVES_AT_KEY))).toBe(
      MEMBER_LESS_ARRIVES_AT_MM,
    );
    expect(millimetres(columnAt(slid, OCCUPIED_ARRIVES_AT_KEY).top)).toBe(2600);
    expect(swapped.has(MEMBER_LESS_ARRIVES_AT_KEY)).toBe(false);
    expect(millimetres(columnAt(swapped, OCCUPIED_ARRIVES_AT_KEY).top)).toBe(
      SEEDED_BASE_CARCASS_MM,
    );
  });

  // **Why nothing else in the tree can see the swap**, observed rather than declared (ADR 0085
  // decision 3). On the shipped kitchen the mis-slid extent lands on `B|1.10`, where no placement
  // stands, so no rebuild is planned against it and the command's output is unchanged. The shipped
  // kitchen's own wall-B pitch is what puts it there, and it is stated as the fixture fact it is.
  it("has no shipped wall-B column standing where the mis-slide would land it", () => {
    for (const direction of BOTH_DIRECTIONS) {
      const design = afterDeleting(
        theShippedKitchenAt(direction.startsAtMm),
        THE_WHOLE_OVEN_TOWER,
      );
      const swapped = slidWithTheDepthOperandsSwapped(
        design,
        direction.endsAtMm,
      );

      expect(
        direction.occupiedWallBKeys,
        `${direction.label} lands on an occupied column`,
      ).not.toContain(direction.arrivesAtKeySwapped);
      expect(keysOnWall(swapped, "B"), direction.label).toStrictEqual(
        [...direction.occupiedWallBKeys, direction.arrivesAtKeySwapped].sort(
          (left, right) => left.localeCompare(right),
        ),
      );
    }
  });

  it("declares two columns exactly one mis-slide apart, which the shipped kitchen does not offer", () => {
    const declared = DECLARED_WALL_B_COLUMNS.map(
      (placement) => placement.alongMm,
    );

    expect(Math.max(...declared) - Math.min(...declared)).toBe(
      DECLARED_COLUMN_PITCH_MM,
    );
  });
});
