// The slide is witnessed by an assertion, not by a redecorated demo (ADR 0093 decision 3). Half 3a: the planning map's
// wall-B divergence on the shipped kitchen at 700 mm. Half 3b: the refusal that divergence would produce, on a design
// this file declares because the shipped kitchen cannot reach it (ADR 0090 decision 6).
// The seeded design does not move: a criterion whose ability to fail depends on which bodies the demo carries has an
// undeclared coupling (ADR 0093 decision 2).
import { describe, expect, it } from "vitest";

import { alongWallShiftByColumnMm } from "../../src/along-wall-chain-shift.js";
import { cabinetDepthRuleOf } from "../../src/cabinet-depth-rule.js";
import { insertBody } from "../../src/commands/insert-body.js";
import {
  evaluateInsertFit,
  openingFromPlacement,
} from "../../src/commands/insert-fit.js";
import { removePlacement } from "../../src/commands/remove-placement.js";
import { toMetres } from "../../src/millimetres.js";
import { resolveRebuildBody } from "../../src/commands/resolve-column-members.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import { cabinetDepthMmOf } from "../../src/design.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { frozenExtentsSlidAlongTheWall } from "../../src/frozen-map-at-cabinet-depth.js";
import { offersFor } from "../../src/queries/offers.js";
import {
  deriveColumns,
  deriveColumnsOverFrozenExtents,
  deriveRecordedColumns,
  derivePlacementRecords,
  projectFrozenMap,
  recomputeVoids,
  withFrozenMap,
  type Column,
  type PlacementRecord,
} from "../../src/void-engine.js";
import {
  createFakeProbe,
  createFakeProbeFactory,
} from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-06T10:00:00.000Z";
const SHALLOW_MM = 600;
const DEEP_MM = 700;
const DECLARED_MM = [SHALLOW_MM, DEEP_MM] as const;

/** Base rows built through §7 reach the worktop line (860); a seeded base row records the carcass without it (820). */
const BASE_BODY_HEIGHT_MM = 860;
const SEEDED_BASE_CARCASS_MM = 820;

/** A column's carried facts in millimetres, the unit the document records them in. */
interface CarriedExtentMm {
  readonly y0Mm: number;
  readonly topMm: number;
  readonly widthMm: number;
  readonly depthMm: number;
  readonly depthFromBuildId: string;
  /** The spans the column publishes: a stored extent restores as the single span `[y0Mm, topMm]`, a derived column
   *  keeps one per member group. The one field that tells the two operands apart here. */
  readonly regionsMm: readonly (readonly [number, number])[];
}

/** The five wall-B columns at the coordinates the run arrives at when the kitchen goes to 700 mm, each carrying
 *  the extent the document records for it. */
const ARRIVING_WALL_B: readonly (CarriedExtentMm & {
  readonly key: string;
  readonly recordedAtAlongMm: number;
})[] = [
  {
    key: "B|0.69",
    recordedAtAlongMm: 615,
    y0Mm: 1500,
    topMm: 2600,
    widthMm: 570,
    depthMm: 400,
    depthFromBuildId: "wall-corner-return-570",
    regionsMm: [[1500, 2600]],
  },
  {
    // The return starts at the run's carcass front, 570 / 670; its far edge stays on the 900 / 1000 reach (ADR 0135).
    key: "B|0.83",
    recordedAtAlongMm: 735,
    y0Mm: 0,
    topMm: 820,
    widthMm: 330,
    // The return carries the run's worktop overhang, so it finishes on the run's line (ADR 0135).
    depthMm: 720,
    depthFromBuildId: "base-corner-return-320",
    regionsMm: [[0, 820]],
  },
  {
    key: "B|1.30",
    recordedAtAlongMm: 1200,
    y0Mm: 0,
    topMm: 2600,
    widthMm: 600,
    depthMm: 738,
    depthFromBuildId: "tall-oven-tower-600",
    regionsMm: [[0, 2600]],
  },
  {
    key: "B|1.90",
    recordedAtAlongMm: 1800,
    y0Mm: 0,
    topMm: 2600,
    widthMm: 600,
    // 700 from the top rather than 699 from the pantry: a millimetre apart, and §3.2 MAX takes the deeper (ADR 0101).
    depthMm: 700,
    depthFromBuildId: "wall-2door-600-deep-top",
    regionsMm: [[0, 2600]],
  },
  {
    key: "B|2.55",
    recordedAtAlongMm: 2450,
    y0Mm: 0,
    topMm: 2600,
    widthMm: 700,
    depthMm: 742,
    depthFromBuildId: "fridge-free-700",
    regionsMm: [[0, 2600]],
  },
];

/** The same five extents where the un-slid map leaves them: on the coordinates the run is leaving, member-less, and
 *  at the 600 mm kitchen's own depths. `B|1.20` at 638 mm beside the slid map's `B|1.30` at 738 is the sharpest. */
const LEAVING_WALL_B: readonly (CarriedExtentMm & { readonly key: string })[] =
  [
    {
      key: "B|0.61",
      y0Mm: 1500,
      topMm: 2600,
      widthMm: 570,
      depthMm: 330,
      depthFromBuildId: "wall-corner-return-570",
      regionsMm: [[1500, 2600]],
    },
    {
      key: "B|0.73",
      y0Mm: 0,
      topMm: 820,
      widthMm: 330,
      depthMm: 620,
      depthFromBuildId: "base-corner-return-320",
      regionsMm: [[0, 820]],
    },
    {
      key: "B|1.20",
      y0Mm: 0,
      topMm: 2600,
      widthMm: 600,
      depthMm: 638,
      depthFromBuildId: "tall-oven-tower-600",
      regionsMm: [[0, 2600]],
    },
    {
      key: "B|1.80",
      y0Mm: 0,
      topMm: 2600,
      widthMm: 600,
      depthMm: 600,
      depthFromBuildId: "wall-2door-600-deep-top",
      regionsMm: [[0, 2600]],
    },
    {
      key: "B|2.45",
      y0Mm: 0,
      topMm: 2600,
      widthMm: 700,
      depthMm: 742,
      depthFromBuildId: "fridge-free-700",
      regionsMm: [[0, 2600]],
    },
  ];

/** What the un-slid map's five arriving keys carry instead: the columns the records imply. Floor, top and width
 *  agree with the document on this fixture; the spans do not. */
const ARRIVING_WITHOUT_THE_SLIDE: ReadonlyMap<
  string,
  readonly (readonly [number, number])[]
> = new Map([
  ["B|0.69", [[1500, 2200] as const, [2200, 2600] as const]],
  ["B|0.83", [[0, 820] as const]],
  ["B|1.30", [[0, 2200] as const, [2200, 2600] as const]],
  ["B|1.90", [[0, 2200] as const, [2200, 2600] as const]],
  ["B|2.55", [[0, 1850] as const, [1850, 2600] as const]],
]);

/** The shipped kitchen carrying the frozen map the product would write, built through `projectFrozenMap`: a
 *  hand-written entry would assert about a document the product does not produce. */
function carryingItsProjectedFrozenMap(design: Design): Design {
  const catalog = buildKitchenLBodyCatalog(SHALLOW_MM);
  const records = derivePlacementRecords(design, catalog);
  return withFrozenMap(
    design,
    projectFrozenMap(deriveColumns(records, {}, design.room), records),
  );
}

/** The same after ordinary deletes: the frozen map is projected from the columns before them. */
function afterDeleting(
  design: Design,
  placementIds: readonly string[],
): Design {
  const catalog = buildKitchenLBodyCatalog(SHALLOW_MM);
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

/** The pre-command design with only the along-wall coordinates the command moved its bodies to, read off the
 *  command's own output so the ladder has no second author (ADR 0090 decision 2). */
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

/** The three operands `rebuildEveryBodyAt` builds its planning map from, derived once so the maps differ in the
 *  slide only. */
interface PlanningOperands {
  /** The bodies as they arrive at the new setting. */
  readonly records: readonly PlacementRecord[];
  /** The document's extents at the coordinates the run is **leaving**: the operand `frozenExtentsSlidAlongTheWall`
   *  is handed, paired in production with pre-command records (`heldRunAcrossTheCommand`). */
  readonly frozen: ReadonlyMap<string, Column>;
  /** The same extents on the coordinates the run is **arriving** at, through the production slide. */
  readonly slid: ReadonlyMap<string, Column>;
}

function planningOperandsOf(
  design: Design,
  cabinetDepthMm: number,
): PlanningOperands {
  const previousCabinetDepthMm = cabinetDepthMmOf(design);
  const previousCatalog = buildKitchenLBodyCatalog(previousCabinetDepthMm);
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
  const slidDesign = slidAsTheCommandDid(design, cabinetDepthMm);

  const heldRecords = derivePlacementRecords(design, previousCatalog);
  const slidRecords = derivePlacementRecords(slidDesign, previousCatalog);
  const frozen = deriveRecordedColumns(
    heldRecords,
    {
      emptyColumns: design.emptyColumns,
      columnExtents: design.columnExtents,
    },
    toMetres(design.room.widthMm),
  );

  return {
    records: derivePlacementRecords(
      { ...slidDesign, settings: { ...slidDesign.settings, cabinetDepthMm } },
      catalog,
    ),
    frozen,
    slid: frozenExtentsSlidAlongTheWall({
      frozen,
      catalog,
      cabinetDepthMm,
      previousCabinetDepthMm,
      membersShiftMmByColumn: alongWallShiftByColumnMm(
        heldRecords,
        slidRecords,
      ),
      room: design.room,
    }),
  };
}

/** Both planning maps at one setting: the command's, and the one ADR 0090 decision 6 forbids. */
interface PlanningMaps {
  readonly slid: ReadonlyMap<string, Column>;
  readonly unslid: ReadonlyMap<string, Column>;
  readonly records: readonly PlacementRecord[];
}

function planningMapsOf(design: Design, cabinetDepthMm: number): PlanningMaps {
  const operands = planningOperandsOf(design, cabinetDepthMm);
  return {
    slid: deriveColumnsOverFrozenExtents(
      operands.records,
      operands.slid,
      design.room,
    ),
    unslid: deriveColumnsOverFrozenExtents(
      operands.records,
      operands.frozen,
      design.room,
    ),
    records: operands.records,
  };
}

function keysOnWall(
  map: ReadonlyMap<string, Column>,
  wall: Column["wall"],
): readonly string[] {
  return [...map.values()]
    .filter((column) => column.wall === wall)
    .map((column) => column.key)
    .sort((left, right) => left.localeCompare(right));
}

/** One wall's entries whole and in one order, so a regression that rewrote `x`, `z` or `d` is caught
 *  by the same assertion as one that moved a key. */
function columnsOnWall(
  map: ReadonlyMap<string, Column>,
  wall: Column["wall"],
): readonly (readonly [string, Column])[] {
  return [...map]
    .filter(([, column]) => column.wall === wall)
    .sort(([left], [right]) => left.localeCompare(right));
}

function columnAt(map: ReadonlyMap<string, Column>, key: string): Column {
  const column = map.get(key);
  if (!column) throw new Error(`no column ${key}`);
  return column;
}

function millimetres(metres: number): number {
  return Math.round(metres * 1000);
}

function regionsMm(column: Column): readonly (readonly [number, number])[] {
  return column.regions.map(
    ([floorM, ceilingM]) =>
      [millimetres(floorM), millimetres(ceilingM)] as const,
  );
}

function carriedExtentOf(column: Column): CarriedExtentMm {
  return {
    y0Mm: Math.min(...regionsMm(column).map(([floorMm]) => floorMm)),
    topMm: millimetres(column.top),
    widthMm: millimetres(column.w),
    depthMm: millimetres(column.d),
    depthFromBuildId: column.depthFromBuildId ?? "",
    regionsMm: regionsMm(column),
  };
}

describe("the planning map's wall-B half at 700 mm, on the shipped kitchen", () => {
  it("keys the five wall-B columns where the run arrives and carries the document's extent onto each", () => {
    const design = carryingItsProjectedFrozenMap(KITCHEN_L_DESIGN);
    const { slid } = planningMapsOf(design, DEEP_MM);

    expect(keysOnWall(slid, "B")).toStrictEqual(
      ARRIVING_WALL_B.map((expected) => expected.key),
    );
    for (const expected of ARRIVING_WALL_B) {
      // The precondition that makes the value below the *document's* rather than a literal: the
      // entry the design records at the coordinate this column is leaving.
      expect(
        (design.columnExtents ?? []).find(
          (entry) =>
            entry.wall === "B" && entry.alongMm === expected.recordedAtAlongMm,
        ),
        expected.key,
      ).toMatchObject({
        y0Mm: expected.y0Mm,
        topMm: expected.topMm,
        widthMm: expected.widthMm,
      });

      const column = columnAt(slid, expected.key);
      expect(carriedExtentOf(column), expected.key).toStrictEqual({
        y0Mm: expected.y0Mm,
        topMm: expected.topMm,
        widthMm: expected.widthMm,
        depthMm: expected.depthMm,
        depthFromBuildId: expected.depthFromBuildId,
        regionsMm: expected.regionsMm,
      });
    }
  });

  it("strands every one of those extents on the coordinate the run is leaving when the slide is removed", () => {
    const design = carryingItsProjectedFrozenMap(KITCHEN_L_DESIGN);
    const { unslid, records } = planningMapsOf(design, DEEP_MM);
    const occupied = new Set(records.map((record) => record.col));

    expect(keysOnWall(unslid, "B")).toStrictEqual(
      [
        ...LEAVING_WALL_B.map((expected) => expected.key),
        ...ARRIVING_WALL_B.map((expected) => expected.key),
      ].sort((left, right) => left.localeCompare(right)),
    );
    for (const expected of LEAVING_WALL_B) {
      // Member-less: the run has moved on and the extent is filed under a column no placement stands in.
      expect(occupied.has(expected.key), expected.key).toBe(false);
      expect(
        carriedExtentOf(columnAt(unslid, expected.key)),
        expected.key,
      ).toStrictEqual({
        y0Mm: expected.y0Mm,
        topMm: expected.topMm,
        widthMm: expected.widthMm,
        depthMm: expected.depthMm,
        depthFromBuildId: expected.depthFromBuildId,
        regionsMm: expected.regionsMm,
      });
    }
  });

  // Not "the two maps differ": an inequality stays green under a slide that moves the wrong distance. `B|1.20`'s 638 mm
  // is the 600 mm kitchen's oven-tower clearance inside a 700 mm kitchen; the slid map's `B|1.30` publishes 738.
  it("plans the arriving keys from the records rather than from the document when the slide is removed", () => {
    const design = carryingItsProjectedFrozenMap(KITCHEN_L_DESIGN);
    const maps = planningMapsOf(design, DEEP_MM);

    for (const [key, expectedRegionsMm] of ARRIVING_WITHOUT_THE_SLIDE) {
      expect(regionsMm(columnAt(maps.unslid, key)), key).toStrictEqual(
        expectedRegionsMm,
      );
    }
    expect(regionsMm(columnAt(maps.slid, "B|1.30"))).toStrictEqual([[0, 2600]]);
    expect(millimetres(columnAt(maps.slid, "B|1.30").d)).toBe(738);
    expect(millimetres(columnAt(maps.unslid, "B|1.20").d)).toBe(638);
    expect(maps.slid.has("B|1.20")).toBe(false);
  });

  // ADR 0090 decision 2, rung 1: wall A is anchored at the corner and does not move.
  it("leaves wall A identical across the two maps, key for key and value for value", () => {
    const design = carryingItsProjectedFrozenMap(KITCHEN_L_DESIGN);
    const maps = planningMapsOf(design, DEEP_MM);

    expect(columnsOnWall(maps.slid, "A").length).toBeGreaterThan(0);
    expect(columnsOnWall(maps.slid, "A")).toStrictEqual(
      columnsOnWall(maps.unslid, "A"),
    );
  });
});

/** The wall-B column the shipped kitchen does not have, declared here rather than seeded (ADR 0093 decision 2).
 *  `B|1.20`'s two seeded members become a placement recording the seeded 820 mm carcass under an ordinary, deletable
 *  top: the shape measured on `A|2.00`. */
const DECLARED_WALL_B_COLUMN: readonly DesignPlacement[] = [
  {
    id: "d1",
    wall: "B",
    alongMm: 1200,
    y0Mm: 0,
    body: {
      buildId: "base-dishwasher-600",
      widthMm: 600,
      heightMm: SEEDED_BASE_CARCASS_MM,
    },
  },
  {
    id: "d2",
    wall: "B",
    alongMm: 1200,
    y0Mm: 2200,
    body: { buildId: "wall-2door-600-top", widthMm: 600, heightMm: 400 },
  },
];

const THE_SURVIVING_BASE = "d1";
const THE_DELETED_MEMBER = "d2";
/** The oven tower and the deep top that stood in `B|1.20` on the shipped kitchen. */
const THE_SEEDED_OVEN_TOWER: readonly string[] = ["p5", "p22"];

function withADeclaredWallBColumn(): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: [
      ...KITCHEN_L_DESIGN.placements.filter(
        (placement) => !THE_SEEDED_OVEN_TOWER.includes(placement.id),
      ),
      ...DECLARED_WALL_B_COLUMN,
    ],
  };
}

/** The declared design after the ordinary delete, with the frozen map the product projects: `B|1.20` recorded at
 *  `topMm` 2600 with one 820 mm member standing in it. */
function theDeclaredDesign(): Design {
  return afterDeleting(withADeclaredWallBColumn(), [THE_DELETED_MEMBER]);
}

/** `rebuildEveryBodyAt`'s own three steps for one body, against whichever planning map it is given:
 *  resolve the §7 equivalent, take the opening the body would vacate, and evaluate the fit. */
function rebuildFitOf(
  design: Design,
  cabinetDepthMm: number,
  placementId: string,
  planningMap: ReadonlyMap<string, Column>,
  records: readonly PlacementRecord[],
) {
  const record = records.find((candidate) => candidate.id === placementId);
  if (!record) throw new Error(`no record ${placementId}`);
  const body = resolveRebuildBody(
    buildKitchenLBodyCatalog(cabinetDepthMm),
    record,
  );
  if (!body) throw new Error(`no rebuild body for ${record.buildId}`);
  return evaluateInsertFit({
    body,
    opening: openingFromPlacement(record, records, planningMap),
    column: columnAt(planningMap, record.col),
    cabinetDepthMm,
  });
}

describe("the consequence, on a wall-B column this file declares", () => {
  it("records the column's real top after the delete, with one 820 mm member left standing", () => {
    const design = theDeclaredDesign();

    expect(
      (design.columnExtents ?? []).find(
        (entry) => entry.wall === "B" && entry.alongMm === 1200,
      ),
    ).toMatchObject({
      widthMm: 600,
      y0Mm: 0,
      topMm: 2600,
      depthFromBuildId: "base-dishwasher-600",
    });
    expect(
      design.placements.find((placement) => placement.id === THE_SURVIVING_BASE)
        ?.body.heightMm,
    ).toBe(SEEDED_BASE_CARCASS_MM);
  });

  it("refuses the rebuild against the un-slid planning map and fits it at 860 against the slid one", () => {
    const design = theDeclaredDesign();
    const maps = planningMapsOf(design, DEEP_MM);

    const refused = rebuildFitOf(
      design,
      DEEP_MM,
      THE_SURVIVING_BASE,
      maps.unslid,
      maps.records,
    );
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.detail.code).toBe("HEIGHT_EXCEEDS_LEVEL");
    expect(refused.detail.params).toMatchObject({
      requiredMm: BASE_BODY_HEIGHT_MM,
      availableMm: SEEDED_BASE_CARCASS_MM,
    });

    const fitted = rebuildFitOf(
      design,
      DEEP_MM,
      THE_SURVIVING_BASE,
      maps.slid,
      maps.records,
    );
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    expect(millimetres(fitted.plan.heightM)).toBe(BASE_BODY_HEIGHT_MM);
  });

  // The fit above is evaluated outside the command, so the command is asked directly. The refusal code is the
  // expectation's subject rather than a boolean: it is what goes red, with its numbers, when `rebuildEveryBodyAt`
  // stops sliding.
  it("changes the kitchen's depth and rebuilds that body to the worktop line", () => {
    const result = changeTo(theDeclaredDesign(), DEEP_MM);

    expect(result.ok ? "ok" : result.reason.code).toBe("ok");
    if (!result.ok) return;
    expect(
      result.design.placements.find(
        (placement) => placement.id === THE_SURVIVING_BASE,
      )?.body.heightMm,
    ).toBe(BASE_BODY_HEIGHT_MM);
  });
});

// Relevance is observed, never declared (ADR 0085 decision 3): this sweep goes red the day wall B gains a column
// that could witness the consequence.

const WALL_B_MEMBER_COUNT = 9;

/** Why this member cannot be the survivor the consequence needs, or `undefined` if it could. `wall-cabinet` is
 *  `heightFlex`, so §5.2 builds it to the opening it is handed and it never requires more height than the column
 *  offers (ADR 0101). */
function whyItCannotWitness(
  record: PlacementRecord,
  cabinetDepthMm: number,
): string | undefined {
  if (!record.canDelete) return "not deletable";
  const rule = cabinetDepthRuleOf({
    buildId: record.buildId,
    rule: record.depthRule,
  });
  if (rule.follows !== "cabinet-depth") return rule.follows;
  const body = resolveRebuildBody(
    buildKitchenLBodyCatalog(cabinetDepthMm),
    record,
  );
  if (!body) return "no catalogue equivalent";
  if (body.heightFlex) return "builds to the opening it is given";
  return body.nominalHeightMm === record.heightMm
    ? "rebuilds to the height it records"
    : undefined;
}

describe("why no wall-B column of the shipped kitchen can be that design", () => {
  it.each(DECLARED_MM)(
    "has no wall-B member that is deletable, rebuilt by the setting and rebuilt taller than it records, at %i mm",
    (cabinetDepthMm) => {
      const records = derivePlacementRecords(
        {
          ...KITCHEN_L_DESIGN,
          settings: { ...KITCHEN_L_DESIGN.settings, cabinetDepthMm },
        },
        buildKitchenLBodyCatalog(cabinetDepthMm),
      ).filter((record) => record.wall === "B");

      const couldWitness = records
        .filter(
          (record) => whyItCannotWitness(record, cabinetDepthMm) === undefined,
        )
        .map((record) => `${record.id} ${record.buildId}`);

      // Non-vacuity as the measured population rather than `> 0`: a fixture that loses a wall-B body turns this red.
      expect(records.length).toBe(WALL_B_MEMBER_COUNT);
      expect(couldWitness).toStrictEqual([]);
    },
  );

  it("reaches every arm of that disjunction on the shipped wall B", () => {
    const records = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      buildKitchenLBodyCatalog(SHALLOW_MM),
    ).filter((record) => record.wall === "B");

    const reasons = new Map<string, number>();
    for (const record of records) {
      const reason = whyItCannotWitness(record, SHALLOW_MM) ?? "could witness";
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }

    expect(
      [...reasons].sort(([left], [right]) => left.localeCompare(right)),
    ).toStrictEqual([
      // `p22`, `p23` and `p24`: the three deep tops, whose `wall-cabinet` equivalent is `heightFlex`.
      ["builds to the opening it is given", 3],
      ["manufactured-size", 1],
      ["not deletable", 3],
      ["rebuilds to the height it records", 2],
    ]);
  });
});

// A body inserted through §7 records the worktop line, and no shipped command writes a seeded-style 820 mm row onto
// wall B (ADR 0093 decision 3b).

describe("item 3's design is not reachable from today's seed", () => {
  it("records 860 and not 820 for a base body inserted into a wall-B column through the §7 offer list", () => {
    const catalog = buildKitchenLBodyCatalog(SHALLOW_MM);
    const cleared = removePlacement({
      design: carryingItsProjectedFrozenMap(KITCHEN_L_DESIGN),
      catalog,
      target: { kind: "placement", id: "p5" },
      occurredAt: OCCURRED_AT,
    });
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;

    const design = cleared.design;
    const records = derivePlacementRecords(design, catalog);
    const columns = deriveColumns(
      records,
      {
        emptyColumns: design.emptyColumns,
        columnExtents: design.columnExtents,
      },
      design.room,
    );
    const voids = recomputeVoids(records, columns);
    const groundVoid = voids.find(
      (candidate) => candidate.col === "B|1.20" && candidate.y0 === 0,
    );
    expect(groundVoid).toBeDefined();
    if (!groundVoid) return;

    const target = { kind: "void", id: groundVoid.id } as const;
    const offered = offersFor({
      records,
      voids,
      columns,
      catalog,
      target,
      cabinetDepthMm: SHALLOW_MM,
    }).find((offer) => offer.buildId === "base-dishwasher");

    expect([offered?.buildsToWidthMm, offered?.buildsToHeightMm]).toEqual([
      600,
      BASE_BODY_HEIGHT_MM,
    ]);

    const inserted = insertBody({
      design,
      catalog,
      columns,
      voids,
      target,
      buildId: "base-dishwasher",
      probe: createFakeProbe({ catalog }),
      occurredAt: OCCURRED_AT,
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    const added = inserted.design.placements.find(
      (placement) =>
        !design.placements.some((held) => held.id === placement.id),
    );
    expect(added?.wall).toBe("B");
    expect(added?.body.heightMm).toBe(BASE_BODY_HEIGHT_MM);
    expect(added?.body.heightMm).not.toBe(SEEDED_BASE_CARCASS_MM);
  });
});
