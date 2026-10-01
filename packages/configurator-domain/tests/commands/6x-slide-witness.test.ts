// Wave 6X — **the slide is witnessed by an assertion, not by a redecorated demo**
// ([ADR 0093](../../../../docs/decisions/0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md)).
//
// [ADR 0090](../../../../docs/decisions/0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md)
// decision 6 requires `rebuildEveryBodyAt`'s **planning** map to be built from the frozen extents as
// decision 2 moves them, which is why `frozenExtentsSlidAlongTheWall` is exported. Adversarial QA
// then measured that removing it is byte-identical over 284 delete × depth trails and green across
// the whole tree: the rule is correct-but-unobservable, and ADR 0093 decision 1 rules that *"a
// ruled behaviour that the tree cannot distinguish from its own absence is unshipped"*.
//
// This file is the witness, in the two halves ADR 0093 decision 3 keeps apart:
//
// - **the divergence** (3a), on the shipped kitchen at 700 mm — the wall-B half keyed at the
//   arriving coordinates and carrying the document's own extents, against the same map built from
//   un-slid extents, where the document's extents strand on the coordinates the run is leaving;
// - **the consequence** (3b), on a design *this file declares* — the refusal the divergence would
//   produce if wall B held a column that could reach it. It cannot, and the last two describes say
//   why by measurement rather than by prose: no wall-B member of the shipped kitchen is both
//   removable and rebuilt taller than it records, and a body inserted through §7 records the
//   worktop line rather than a seeded carcass height.
//
// **The seeded design does not move** (ADR 0093 decision 2, on ADR 0090 Amendment B's reasoning
// transposed from the room to the placements): a criterion whose ability to fail depends on which
// bodies the demo happens to carry has an undeclared coupling, so the fixture that makes the rule
// falsifiable is declared here.
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

/** §7's base rows reach the worktop line. A seeded base row records the carcass without it, and the
 *  820 / 860 gap between the two is the whole of what decision 6 protects — see ADR 0088's `A|2.00`
 *  reproduction, which is the one column of the shipped kitchen that carries it. */
const BASE_BODY_HEIGHT_MM = 860;
const SEEDED_BASE_CARCASS_MM = 820;

/** A column's three carried facts in the unit the document records them in, so an expectation reads
 *  as the entry it came from rather than as a float. */
interface CarriedExtentMm {
  readonly y0Mm: number;
  readonly topMm: number;
  readonly widthMm: number;
  readonly depthMm: number;
  readonly depthFromBuildId: string;
  /** The spans the column publishes. **The one field that tells the two operands apart here**: a
   *  stored extent restores as the single span `[y0Mm, topMm]`, while a derived column keeps one
   *  span per member group. Everything else about wall B's five columns agrees, because every one
   *  of them is fully occupied on the shipped kitchen. */
  readonly regionsMm: readonly (readonly [number, number])[];
}

/** The five wall-B columns at the coordinates the run **arrives** at when the kitchen goes to
 *  700 mm, each carrying the extent the document records for it — ADR 0093 decision 3a's primary
 *  criterion, per key and with its own numbers. */
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
    key: "B|0.84",
    recordedAtAlongMm: 740,
    y0Mm: 0,
    topMm: 820,
    widthMm: 320,
    depthMm: 700,
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
    // **700 from the top rather than 699 from the pantry, since ADR 0101.** The two are a
    // millimetre apart and the §3.2 MAX takes the deeper, so unpinning the top moved this column's
    // source as well as its number. The same pair at 600 already reads `wall-2door-600-deep-top` at
    // 600 against the pantry's 599 — see `LEAVING_WALL_B` — which is the relationship being
    // restored, not a new one.
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

/** The same five extents where the un-slid map leaves them: on the coordinates the run is
 *  **leaving**, member-less, and — because nothing standing there re-derives their depth axis — at
 *  the *600 mm* kitchen's own depths inside a 700 mm kitchen. `B|1.20` at 638 mm beside the slid
 *  map's `B|1.30` at 738 is the sharpest single number in this file. */
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
      key: "B|0.74",
      y0Mm: 0,
      topMm: 820,
      widthMm: 320,
      depthMm: 600,
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

/** What the un-slid map's five **arriving** keys carry instead: the columns the records imply. The
 *  floor, the top and the width agree with the document on this fixture — every wall-B column is
 *  fully occupied — and the spans do not, which is the divergence stated as a value. */
const ARRIVING_WITHOUT_THE_SLIDE: ReadonlyMap<
  string,
  readonly (readonly [number, number])[]
> = new Map([
  ["B|0.69", [[1500, 2200] as const, [2200, 2600] as const]],
  ["B|0.84", [[0, 820] as const]],
  ["B|1.30", [[0, 2200] as const, [2200, 2600] as const]],
  ["B|1.90", [[0, 2200] as const, [2200, 2600] as const]],
  ["B|2.55", [[0, 1850] as const, [1850, 2600] as const]],
]);

/** The shipped kitchen carrying the frozen map the product would write for it — the document
 *  `setCabinetDepth` actually receives, built through `projectFrozenMap` rather than hand-written
 *  for the reason `set-cabinet-depth.plans-against-the-frozen-extent.test.ts` states: an entry
 *  written here would be an assertion about a document the product does not produce. */
function carryingItsProjectedFrozenMap(design: Design): Design {
  const catalog = buildKitchenLBodyCatalog(SHALLOW_MM);
  const records = derivePlacementRecords(design, catalog);
  return withFrozenMap(
    design,
    projectFrozenMap(deriveColumns(records, {}, design.room), records),
  );
}

/** The same construction after a set of ordinary deletes: the frozen map is projected from the
 *  columns **before** them, so the survivors' extents keep what the deleted members implied. */
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

/** The pre-command design with **only** the along-wall coordinates the command moved its bodies to,
 *  read off the command's own output and paired by id.
 *
 *  ADR 0090 decision 2's ladder is not re-derived here — a second author for it is what ADR 0088
 *  decision 2 exists to prevent — and the same construction is `qa-6k-i-planning-map.adversarial.test.ts`'s
 *  for the same reason. */
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

/** The three operands `rebuildEveryBodyAt` builds its planning map from, derived once so the map
 *  with the slide and the map without it differ in that one place and nowhere else. */
interface PlanningOperands {
  /** The bodies as they arrive at the new setting. */
  readonly records: readonly PlacementRecord[];
  /** The document's extents at the coordinates the run is **leaving** — the operand
   *  `frozenExtentsSlidAlongTheWall` is handed, which production pairs with pre-command records at
   *  the previous catalogue (`heldRunAcrossTheCommand`). */
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

// ---------------------------------------------------------------------------------------------
// Work item 2 — the divergence, on the shipped kitchen. ADR 0093 decision 3a.
// ---------------------------------------------------------------------------------------------

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
      // Member-less, and that is the point: the run has moved on and the document's extent is filed
      // under a column no placement stands in.
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

  // **Not "the two maps differ".** An inequality stays green under a slide that moves the wrong
  // distance; every number here is a value, and the pair worth reading twice is `B|1.20`'s depth of
  // 638 mm — the 600 mm kitchen's own oven-tower clearance, standing inside a 700 mm kitchen where
  // the slid map's `B|1.30` publishes 738.
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

  // ADR 0090 decision 2 rung 1: wall A is anchored at the corner and does not move. A wave that made
  // it move has broken the rung the whole ladder rests on.
  it("leaves wall A identical across the two maps, key for key and value for value", () => {
    const design = carryingItsProjectedFrozenMap(KITCHEN_L_DESIGN);
    const maps = planningMapsOf(design, DEEP_MM);

    expect(columnsOnWall(maps.slid, "A").length).toBeGreaterThan(0);
    expect(columnsOnWall(maps.slid, "A")).toStrictEqual(
      columnsOnWall(maps.unslid, "A"),
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Work item 3 — the consequence, on a design this file declares. ADR 0093 decision 3b.
// ---------------------------------------------------------------------------------------------

/** **The wall-B column the shipped kitchen does not have**, and ADR 0093 decision 2's reason for
 *  declaring it here rather than seeding it: a criterion that could only fail because the demo
 *  happens to carry a particular body has an undeclared coupling.
 *
 *  `B|1.20`'s two seeded members are replaced by the shape ADR 0088 measured on `A|2.00` — a
 *  placement recording the seeded 820 mm carcass under an ordinary, deletable top. Everything else
 *  in the room is the shipped kitchen's, so nothing but this column can account for a difference. */
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

/** The declared design after the ordinary delete, carrying the frozen map the product projects for
 *  it: `B|1.20` recorded at `topMm` 2600 with one 820 mm member standing in it. */
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

  // The fit above is evaluated outside the command that runs it, so the command is asked the same
  // question directly: nothing here rests on a seam reproduced beside the product.
  //
  // **The refusal code is the expectation's own subject rather than a boolean**, because this is the
  // assertion that goes red when `rebuildEveryBodyAt` stops sliding: a `toBe(true)` on `ok` reports
  // `expected false to be true` and says nothing about *which* refusal, and the whole point of the
  // wave is that the red carries its numbers.
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

// ---------------------------------------------------------------------------------------------
// Work item 4 — the shipped kitchen's limitation, derived from the fixture's own entries.
// ADR 0085 decision 3: relevance is observed, never declared, so this is a sweep and not a list of
// five build ids. It goes red the day wall B gains a column that could witness item 3, which is the
// direction that wants noticing.
// ---------------------------------------------------------------------------------------------

/** Every wall-B member of the shipped kitchen, at both declared settings. */
const WALL_B_MEMBER_COUNT = 9;

/** Why this member cannot be the survivor item 3 needs, or `undefined` if it could be.
 *
 *  **The `heightFlex` arm is ADR 0101's**, and it replaces an exclusion that was accidental. Until
 *  2026-09-07 the three deep tops were ADR 0058 pins, so they left through the `follows` arm and the
 *  question of what their rebuild would need was never put. Unpinned, they reach the height
 *  comparison — and `wall-cabinet` is `heightFlex`, so §5.2 builds it to the opening it is handed
 *  and it can never require more height than the column offers. Its 700 mm nominal against their
 *  recorded 400 and 750 is not a shortfall; it is a number the fit never reads.
 *
 *  So the finding stands and rests on something better: wall B could not witness item 3 because of
 *  what its members *are*, not because two of them happened to be held at one depth. */
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

      // Non-vacuity as the measured population rather than as a `> 0`: a fixture that loses a
      // wall-B body turns this red instead of quietly sweeping a smaller set.
      expect(records.length).toBe(WALL_B_MEMBER_COUNT);
      expect(couldWitness).toStrictEqual([]);
    },
  );

  // The disjunction above is only as strong as its arms being reached, so each one is measured on
  // the fixture rather than left as a branch nothing takes.
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
      // `p22`, `p23` and `p24` — the three deep tops, whose `wall-cabinet` equivalent is
      // `heightFlex`. They counted as `pinned` until ADR 0101; see `whyItCannotWitness`.
      ["builds to the opening it is given", 3],
      ["manufactured-size", 1],
      ["not deletable", 3],
      ["rebuilds to the height it records", 2],
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// Work item 5 — the reachability boundary, as an assertion rather than as an opinion.
// ADR 0093 decision 3b: item 3's document is not reachable from today's seed, because a body
// inserted through §7 records the worktop line and no shipped command writes a seeded-style 820 mm
// row onto wall B. A wave that finds it *is* reachable has found something better than this test.
// ---------------------------------------------------------------------------------------------

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

    // §7 offers it, and the offer's own answer for what it would build to is the worktop line.
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
