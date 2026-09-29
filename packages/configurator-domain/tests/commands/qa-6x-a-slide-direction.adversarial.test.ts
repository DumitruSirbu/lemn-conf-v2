// Adversarial QA on wave 6X-a — **the direction witness, attacked at the places it rests on
// something it does not assert**
// ([ADR 0093](../../../../docs/decisions/0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md)
// Amendment A §6).
//
// `6x-a-slide-direction.test.ts` pins the member-less extent's arriving key and coordinate in both
// directions and witnesses the consequence at the command's own boundary on a design it declares.
// Three things it leans on are not asserted anywhere, and each is measured here rather than trusted:
//
// - **the declared document's legality.** The whole command-boundary witness is a document this
//   suite writes by hand. If the schema refuses it, or `validateDesignForCatalog` has a complaint
//   about it, the witness is an artefact of a document the product would never load. Asserted at the
//   setting it is declared at, at the setting it arrives at, and through the wire schema.
// - **the two 200 mm columns really abut rather than overlap**, against every seeded wall-B body and
//   not only against each other — the pitch is the wave's load-bearing trick and its legality is an
//   interval fact, so it is measured as one.
// - **the occupied extents' carried values.** The wave asserts the occupied keys as literals and
//   then compares the swapped map's *values* with the correct map's own output. That pair moves
//   together under any regression that moves both, so the rule ADR 0090 decision 6 states — *only*
//   the along-wall coordinate and the key move — is asserted here against the frozen extents the
//   slide was handed, field by field.
//
// And one thing the wave witnesses in one direction only: the consequence at the command boundary is
// declared for 600 → 700 and not for 700 → 600. The mirror design below is the same trick pointed the
// other way — the survivor stands one mis-slide *past* the member-less column rather than one before
// it — so a swap that is caught only on a deepening kitchen is told apart from one caught on both.
import { describe, expect, it } from "vitest";

import { alongWallShiftByColumnMm } from "../../src/along-wall-chain-shift.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import { cabinetDepthMmOf, DesignSchema } from "../../src/design.js";
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
import { validateDesignForCatalog } from "../../src/validate-design.js";
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

/** §7's base rows reach the worktop line; a placement recording only the carcass records 820. */
const BASE_BODY_HEIGHT_MM = 860;
const SEEDED_BASE_CARCASS_MM = 820;

/** The corner's own gain on the `base-formula` chain between the two settings — 660 − 560. The
 *  swapped operands negate it, so the two destinations sit `2 ×` this apart. */
const CHAIN_SHIFT_MM = 100;

const THE_WHOLE_OVEN_TOWER: readonly string[] = ["p5", "p22"];
const DECLARED_COLUMN_WIDTH_MM = 200;

// ---------------------------------------------------------------------------------------------
// The documents, and the operands the command's planning map is built from. Same derivations as the
// wave's file, because a second author for them would measure a different seam.
// ---------------------------------------------------------------------------------------------

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

function theShippedKitchenAt(cabinetDepthMm: number): Design {
  if (cabinetDepthMm === cabinetDepthMmOf(KITCHEN_L_DESIGN)) {
    return KITCHEN_L_DESIGN;
  }
  const result = changeTo(KITCHEN_L_DESIGN, cabinetDepthMm);
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result.design;
}

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
      return { ...placement, alongMm: arrived.alongMm };
    }),
  };
}

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

function slidWithTheOperandsInTheOrder(
  design: Design,
  cabinetDepthMm: number,
  order: "as production passes them" | "swapped",
): ReadonlyMap<string, Column> {
  const operands = slideOperandsOf(design, cabinetDepthMm);
  if (order === "as production passes them") {
    return frozenExtentsSlidAlongTheWall(operands);
  }
  return frozenExtentsSlidAlongTheWall({
    ...operands,
    cabinetDepthMm: operands.previousCabinetDepthMm,
    previousCabinetDepthMm: operands.cabinetDepthMm,
  });
}

function millimetres(metres: number): number {
  return Math.round(metres * 1000);
}

/** The single element of a list the caller has already asserted the length of, without a non-null
 *  assertion the lint rules forbid: a wrong length is a thrown error naming what was expected. */
function theOnly<Item>(items: readonly Item[], what: string): Item {
  const [only] = items;
  if (items.length !== 1 || only === undefined) {
    throw new Error(`expected one ${what}, got ${String(items.length)}`);
  }
  return only;
}

function columnAt(map: ReadonlyMap<string, Column>, key: string): Column {
  const column = map.get(key);
  if (!column) throw new Error(`no column ${key} in ${[...map.keys()].join()}`);
  return column;
}

function alongWallMm(column: Column): number {
  return millimetres(alongWallCoordinate(column.wall, column));
}

function columnsOnWallB(
  map: ReadonlyMap<string, Column>,
): readonly (readonly [string, Column])[] {
  return [...map]
    .filter(([, column]) => column.wall === "B")
    .sort(([left], [right]) => left.localeCompare(right));
}

/** The wall-B extents rung 2 answers for, in the **leaving** key space `membersShiftMmByColumn` is
 *  keyed in — the frozen map's own, and not the slid map's. */
function occupiedFrozenColumns(
  operands: FrozenExtentsSlideQuery,
): readonly (readonly [string, Column])[] {
  return columnsOnWallB(operands.frozen).filter(([key]) =>
    operands.membersShiftMmByColumn.has(key),
  );
}

/** Every field of a column except the key and the along-wall coordinate — the only two the ladder is
 *  allowed to move ("only the along-wall coordinate and the key move", `frozenExtentsSlidAlongTheWall`).
 *  Compared as a whole so a regression that re-seated the off-wall axis, widened `w` or re-sourced
 *  `depthFromBuildId` is caught by the same assertion as one that moved a key. */
function everythingTheSlideMustCarry(column: Column) {
  return {
    wall: column.wall,
    ry: column.ry,
    offWallM: column.wall === "A" ? column.z : column.x,
    w: column.w,
    d: column.d,
    top: column.top,
    depthFromBuildId: column.depthFromBuildId,
    regions: column.regions,
  };
}

// ---------------------------------------------------------------------------------------------
// Part 1 — the declared document the whole command-boundary witness rests on is one the product
// would accept. ADR 0093 decision 2 lets the test declare its fixture; it does not let the test
// declare an illegal one.
// ---------------------------------------------------------------------------------------------

const THE_SURVIVING_BASE = "u1";
const THE_DELETED_TOP = "u2";
const THE_WHOLE_MEMBER_LESS_COLUMN = "v1";

/** The wave's own declared columns, restated here rather than imported: the file under test exports
 *  nothing, and a copy that drifts from it fails the legality assertions below rather than passing
 *  them for the wrong document. **The two copies are not cross-checked against each other** — an
 *  earlier draft of this comment named a test that does not exist. What holds them together is that
 *  both pin the same `emptyColumns` literal, and the legality assertions below would fail on a
 *  drifted copy rather than pass for the wrong document. */
const DECLARED_DEEPENING_COLUMNS: readonly DesignPlacement[] = [
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

function withDeclaredColumns(
  base: Design,
  columns: readonly DesignPlacement[],
): Design {
  return {
    ...base,
    placements: [
      ...base.placements.filter(
        (placement) => !THE_WHOLE_OVEN_TOWER.includes(placement.id),
      ),
      ...columns,
    ],
  };
}

function theDeclaredDeepeningDesign(): Design {
  return afterDeleting(
    withDeclaredColumns(KITCHEN_L_DESIGN, DECLARED_DEEPENING_COLUMNS),
    [THE_DELETED_TOP, THE_WHOLE_MEMBER_LESS_COLUMN],
  );
}

describe("the declared document, which is a fixture the test writes and the product must accept", () => {
  it("parses through the wire schema and validates against its own catalogue, before the command", () => {
    const design = theDeclaredDeepeningDesign();

    expect(DesignSchema.safeParse(design).success).toBe(true);
    expect(
      validateDesignForCatalog(design, buildKitchenLBodyCatalog(SHALLOW_MM)),
    ).toStrictEqual([]);
  });

  it("parses and validates after the command too, so the witness is not a document the product could only reach and never keep", () => {
    const result = changeTo(theDeclaredDeepeningDesign(), DEEP_MM);

    expect(result.ok ? "ok" : result.reason.code).toBe("ok");
    if (!result.ok) return;
    expect(DesignSchema.safeParse(result.design).success).toBe(true);
    expect(
      validateDesignForCatalog(
        result.design,
        buildKitchenLBodyCatalog(DEEP_MM),
      ),
    ).toStrictEqual([]);
  });

  // The pitch is the trick the wave turns on, and "200 mm apart" is not the same claim as "they do
  // not overlap". Measured as intervals against **every** body standing on wall B, so a declared
  // column that quietly sits inside the corner return is caught here rather than surviving as a
  // document `validateDesignForCatalog` happens not to complain about.
  it("abuts its neighbour and overlaps no wall-B body at ground level, interval by interval", () => {
    const design = withDeclaredColumns(
      KITCHEN_L_DESIGN,
      DECLARED_DEEPENING_COLUMNS,
    );
    const groundLevel = design.placements
      .filter((placement) => placement.wall === "B" && placement.y0Mm === 0)
      .map((placement) => ({
        id: placement.id,
        fromMm: placement.alongMm - placement.body.widthMm / 2,
        toMm: placement.alongMm + placement.body.widthMm / 2,
      }))
      .sort((left, right) => left.fromMm - right.fromMm);

    expect(groundLevel.map(({ id }) => id)).toStrictEqual([
      "p26",
      THE_SURVIVING_BASE,
      THE_WHOLE_MEMBER_LESS_COLUMN,
      "p6",
      "p7",
    ]);
    expect(groundLevel.map(({ fromMm, toMm }) => [fromMm, toMm])).toStrictEqual(
      [
        [580, 900],
        [900, 1100],
        [1100, 1300],
        [1500, 2100],
        [2100, 2800],
      ],
    );
    const overlapping = groundLevel.filter((body, index) => {
      const next = groundLevel[index + 1];
      return next !== undefined && body.toMm > next.fromMm;
    });
    expect(overlapping.map(({ id }) => id)).toStrictEqual([]);

    const survivor = groundLevel.find(({ id }) => id === THE_SURVIVING_BASE);
    const memberLess = groundLevel.find(
      ({ id }) => id === THE_WHOLE_MEMBER_LESS_COLUMN,
    );
    expect((memberLess?.fromMm ?? NaN) - (survivor?.fromMm ?? NaN)).toBe(
      2 * CHAIN_SHIFT_MM,
    );
  });

  // The wave's file asserts the surviving column's extent with `toMatchObject`, which is silent about
  // `depthMm` and about the entry's own `alongMm`. Pinned whole here.
  it("records the surviving column's whole extent, every field of it", () => {
    const design = theDeclaredDeepeningDesign();

    expect(
      (design.columnExtents ?? []).filter(
        (entry) => entry.wall === "B" && entry.alongMm === 1000,
      ),
    ).toStrictEqual([
      {
        wall: "B",
        alongMm: 1000,
        widthMm: DECLARED_COLUMN_WIDTH_MM,
        y0Mm: 0,
        topMm: 2600,
        depthMm: 620,
        depthFromBuildId: "base-cabinet",
      },
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// Part 2 — the occupied extents, pinned against the frozen extents the slide was handed rather than
// against the correct map's own output.
// ---------------------------------------------------------------------------------------------

interface OccupiedRung {
  readonly label: string;
  readonly startsAtMm: number;
  readonly endsAtMm: number;
  /** Every wall-B key the map carries, member-less one included, at the coordinates it arrives at. */
  readonly arrivingKeys: readonly string[];
  /** The occupied extents' arriving along-wall coordinates, in the same order. The `wall-map` corner
   *  extent moves 70 and the three `base-formula` ones move 100 — ADR 0090 decision 2 rung 2, which
   *  reads the members and not the setting. */
  readonly occupiedArrivesAtMm: readonly number[];
}

const OCCUPIED_DEEPENING: OccupiedRung = {
  label: "600 → 700",
  startsAtMm: SHALLOW_MM,
  endsAtMm: DEEP_MM,
  arrivingKeys: ["B|0.69", "B|0.84", "B|1.30", "B|1.90", "B|2.55"],
  occupiedArrivesAtMm: [685, 840, 1900, 2550],
};

const OCCUPIED_SHALLOWING: OccupiedRung = {
  label: "700 → 600",
  startsAtMm: DEEP_MM,
  endsAtMm: SHALLOW_MM,
  arrivingKeys: ["B|0.61", "B|0.74", "B|1.20", "B|1.80", "B|2.45"],
  occupiedArrivesAtMm: [615, 740, 1800, 2450],
};

const BOTH_RUNGS: readonly OccupiedRung[] = [
  OCCUPIED_DEEPENING,
  OCCUPIED_SHALLOWING,
];

describe("the occupied extents, against the extents the slide was handed", () => {
  it.each(BOTH_RUNGS)(
    "carries every field but the key and the position across unchanged, under either operand order, at $label",
    (rung) => {
      const design = afterDeleting(
        theShippedKitchenAt(rung.startsAtMm),
        THE_WHOLE_OVEN_TOWER,
      );
      const operands = slideOperandsOf(design, rung.endsAtMm);
      const occupiedFrozen = occupiedFrozenColumns(operands);
      expect(occupiedFrozen).toHaveLength(4);

      for (const order of ["as production passes them", "swapped"] as const) {
        const slid = slidWithTheOperandsInTheOrder(
          design,
          rung.endsAtMm,
          order,
        );
        for (const [leavingKey, frozen] of occupiedFrozen) {
          const shiftMm =
            operands.membersShiftMmByColumn.get(leavingKey) ?? NaN;
          const arrivedAtMm = alongWallMm(frozen) + shiftMm;
          const arrived = columnsOnWallB(slid).find(
            ([, column]) => alongWallMm(column) === arrivedAtMm,
          );
          expect(
            arrived?.[1] === undefined
              ? `nothing at ${String(arrivedAtMm)}`
              : everythingTheSlideMustCarry(arrived[1]),
            `${leavingKey} under ${order}`,
          ).toStrictEqual(everythingTheSlideMustCarry(frozen));
        }
      }
    },
  );

  it.each(BOTH_RUNGS)(
    "lands the occupied extents at the coordinates their own members reached, as literals, at $label",
    (rung) => {
      const design = afterDeleting(
        theShippedKitchenAt(rung.startsAtMm),
        THE_WHOLE_OVEN_TOWER,
      );
      const operands = slideOperandsOf(design, rung.endsAtMm);

      // Where rung 2 says each occupied extent lands, derived from the frozen map and the members'
      // own shift and never from the slide's output — then pinned against the literals.
      const arrivesAtMm = occupiedFrozenColumns(operands).map(
        ([key, frozen]) =>
          alongWallMm(frozen) +
          (operands.membersShiftMmByColumn.get(key) ?? NaN),
      );
      expect(arrivesAtMm).toStrictEqual([...rung.occupiedArrivesAtMm]);

      for (const order of ["as production passes them", "swapped"] as const) {
        const slid = slidWithTheOperandsInTheOrder(
          design,
          rung.endsAtMm,
          order,
        );
        const standing = columnsOnWallB(slid).map(([, column]) =>
          alongWallMm(column),
        );
        for (const expectedMm of arrivesAtMm) {
          expect(
            standing.filter((mm) => mm === expectedMm),
            `${rung.label} under ${order}: nothing at ${String(expectedMm)}`,
          ).toStrictEqual([expectedMm]);
        }
      }
    },
  );

  // The displacement read off the maps rather than off the file's own constants, so the pair cannot
  // be satisfied by two literals that merely differ from each other.
  it.each(BOTH_RUNGS)(
    "displaces the member-less extent by exactly one chain shift each way, measured from the frozen map, at $label",
    (rung) => {
      const design = afterDeleting(
        theShippedKitchenAt(rung.startsAtMm),
        THE_WHOLE_OVEN_TOWER,
      );
      const operands = slideOperandsOf(design, rung.endsAtMm);
      const memberLess = columnsOnWallB(operands.frozen).filter(
        ([key]) => !operands.membersShiftMmByColumn.has(key),
      );
      expect(memberLess).toHaveLength(1);
      const leftFromMm = alongWallMm(
        theOnly(memberLess, "member-less wall-B extent")[1],
      );
      const occupiedArriveAtMm = occupiedFrozenColumns(operands).map(
        ([key, frozen]) =>
          alongWallMm(frozen) +
          (operands.membersShiftMmByColumn.get(key) ?? NaN),
      );

      const arrivedAtMm = (order: "as production passes them" | "swapped") => {
        const slid = slidWithTheOperandsInTheOrder(
          design,
          rung.endsAtMm,
          order,
        );
        const arrived = columnsOnWallB(slid)
          .map(([, column]) => alongWallMm(column))
          .filter((mm) => !occupiedArriveAtMm.includes(mm));
        expect(arrived, `${rung.label} under ${order}`).toHaveLength(1);
        return arrived[0] ?? NaN;
      };

      const towardsTheRule =
        arrivedAtMm("as production passes them") - leftFromMm;
      const towardsTheSwap = arrivedAtMm("swapped") - leftFromMm;
      const deepening = rung.endsAtMm > rung.startsAtMm;

      expect(towardsTheRule).toBe(deepening ? CHAIN_SHIFT_MM : -CHAIN_SHIFT_MM);
      expect(towardsTheSwap).toBe(deepening ? -CHAIN_SHIFT_MM : CHAIN_SHIFT_MM);
      expect(towardsTheRule).toBe(-towardsTheSwap);
    },
  );
});

// ---------------------------------------------------------------------------------------------
// Part 3 — the mirror witness: the same trick pointed the other way, so the consequence is caught on
// a shallowing kitchen too and not only on a deepening one.
// ---------------------------------------------------------------------------------------------

/** At 700 the run stands 100 mm further along, so the mirror declares its survivor **past** the
 *  member-less column: `w1` at 1500 arrives at 1400 on the way down, which is exactly where the
 *  swapped operands send the extent that leaves 1300. Correct, the extent goes to 1200 and `w1`
 *  keeps the 2600 mm top its deleted neighbour left it, so its 820 mm carcass rebuilds to 860. */
const THE_MIRROR_SURVIVING_BASE = "w1";
const THE_MIRROR_DELETED_TOP = "w2";
const THE_MIRROR_MEMBER_LESS_COLUMN = "x1";

const DECLARED_SHALLOWING_COLUMNS: readonly DesignPlacement[] = [
  {
    id: THE_MIRROR_MEMBER_LESS_COLUMN,
    wall: "B",
    alongMm: 1300,
    y0Mm: 0,
    body: {
      buildId: "base-cabinet",
      widthMm: DECLARED_COLUMN_WIDTH_MM,
      heightMm: SEEDED_BASE_CARCASS_MM,
    },
  },
  {
    id: THE_MIRROR_SURVIVING_BASE,
    wall: "B",
    alongMm: 1500,
    y0Mm: 0,
    body: {
      buildId: "base-cabinet",
      widthMm: DECLARED_COLUMN_WIDTH_MM,
      heightMm: SEEDED_BASE_CARCASS_MM,
    },
  },
  {
    id: THE_MIRROR_DELETED_TOP,
    wall: "B",
    alongMm: 1500,
    y0Mm: 2200,
    body: {
      buildId: "wall-2door-600-top",
      widthMm: DECLARED_COLUMN_WIDTH_MM,
      heightMm: 400,
    },
  },
];

const MIRROR_MEMBER_LESS_ARRIVES_AT_KEY = "B|1.20";
const MIRROR_MEMBER_LESS_ARRIVES_AT_MM = 1200;
const MIRROR_SURVIVOR_ARRIVES_AT_KEY = "B|1.40";

function theDeclaredShallowingDesign(): Design {
  return afterDeleting(
    withDeclaredColumns(
      theShippedKitchenAt(DEEP_MM),
      DECLARED_SHALLOWING_COLUMNS,
    ),
    [THE_MIRROR_DELETED_TOP, THE_MIRROR_MEMBER_LESS_COLUMN],
  );
}

describe("the consequence at the command boundary, on a shallowing kitchen", () => {
  it("declares a legal 700 mm document with an 820 mm extent one mis-slide before its survivor", () => {
    const design = theDeclaredShallowingDesign();

    expect(DesignSchema.safeParse(design).success).toBe(true);
    expect(
      validateDesignForCatalog(design, buildKitchenLBodyCatalog(DEEP_MM)),
    ).toStrictEqual([]);
    expect(design.emptyColumns).toStrictEqual([
      {
        wall: "B",
        alongMm: 1300,
        widthMm: DECLARED_COLUMN_WIDTH_MM,
        y0Mm: 0,
        topMm: SEEDED_BASE_CARCASS_MM,
        depthMm: 720,
        depthFromBuildId: "base-cabinet",
      },
    ]);
    expect(
      (design.columnExtents ?? []).filter(
        (entry) => entry.wall === "B" && entry.alongMm === 1500,
      ),
    ).toStrictEqual([
      {
        wall: "B",
        alongMm: 1500,
        widthMm: DECLARED_COLUMN_WIDTH_MM,
        y0Mm: 0,
        topMm: 2600,
        depthMm: 720,
        depthFromBuildId: "base-cabinet",
      },
    ]);
  });

  it("shallows the kitchen and rebuilds the surviving base to the worktop line", () => {
    const result = changeTo(theDeclaredShallowingDesign(), SHALLOW_MM);

    expect(result.ok ? "ok" : result.reason.code).toBe("ok");
    if (!result.ok) return;
    expect(
      result.design.placements.find(
        (placement) => placement.id === THE_MIRROR_SURVIVING_BASE,
      )?.body.heightMm,
    ).toBe(BASE_BODY_HEIGHT_MM);
    expect(result.design.emptyColumns).toStrictEqual([
      {
        wall: "B",
        alongMm: MIRROR_MEMBER_LESS_ARRIVES_AT_MM,
        widthMm: DECLARED_COLUMN_WIDTH_MM,
        y0Mm: 0,
        topMm: SEEDED_BASE_CARCASS_MM,
        depthMm: 620,
        depthFromBuildId: "base-cabinet",
      },
    ]);
  });

  it("puts the mis-slid extent on the survivor's key and its 820 mm top over the recorded 2600", () => {
    const design = theDeclaredShallowingDesign();

    const slid = slidWithTheOperandsInTheOrder(
      design,
      SHALLOW_MM,
      "as production passes them",
    );
    const swapped = slidWithTheOperandsInTheOrder(
      design,
      SHALLOW_MM,
      "swapped",
    );

    expect(alongWallMm(columnAt(slid, MIRROR_MEMBER_LESS_ARRIVES_AT_KEY))).toBe(
      MIRROR_MEMBER_LESS_ARRIVES_AT_MM,
    );
    expect(
      millimetres(columnAt(slid, MIRROR_SURVIVOR_ARRIVES_AT_KEY).top),
    ).toBe(2600);
    expect(swapped.has(MIRROR_MEMBER_LESS_ARRIVES_AT_KEY)).toBe(false);
    expect(
      millimetres(columnAt(swapped, MIRROR_SURVIVOR_ARRIVES_AT_KEY).top),
    ).toBe(SEEDED_BASE_CARCASS_MM);
  });
});
