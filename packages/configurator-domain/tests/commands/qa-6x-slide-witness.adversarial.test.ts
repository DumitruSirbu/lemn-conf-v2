// What `6x-slide-witness.test.ts` rests on, asserted: its declared design is one the product accepts; the modelled
// planning map is production's only while no placement carries a seat (`planningDesign` strips the seats of bodies
// that follow the setting, ADR 0077 decision 8); the per-member assignment behind its histogram; and the 820 / 860
// gap, measured through the command. Two sweeps go red where its examples stay green: both directions of the depth
// change, and every wall-B void of every single-delete trail.
import { describe, expect, it } from "vitest";

import { alongWallShiftByColumnMm } from "../../src/along-wall-chain-shift.js";
import { cabinetDepthRuleOf } from "../../src/cabinet-depth-rule.js";
import { insertBody } from "../../src/commands/insert-body.js";
import {
  evaluateInsertFit,
  openingFromPlacement,
} from "../../src/commands/insert-fit.js";
import { resolveRebuildBody } from "../../src/commands/resolve-column-members.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import { cabinetDepthMmOf, CurrentDesignSchema } from "../../src/design.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { frozenExtentsSlidAlongTheWall } from "../../src/frozen-map-at-cabinet-depth.js";
import { toMetres } from "../../src/millimetres.js";
import { offersFor } from "../../src/queries/offers.js";
import {
  fatalDesignValidationIssues,
  validateDesignForCatalog,
} from "../../src/validate-design.js";
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

/** §7's base rows reach the worktop line; a seeded base row records the carcass without it. */
const WORKTOP_LINE_MM = 860;
const SEEDED_BASE_CARCASS_MM = 820;

/** The witness's declared wall-B column, reproduced rather than imported: preconditions asserted against a copy
 *  prove nothing about the design the witness runs on. */
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
const THE_SEEDED_OVEN_TOWER: readonly string[] = ["p5", "p22"];

function seededAt(cabinetDepthMm: number): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, cabinetDepthMm },
  };
}

function withADeclaredWallBColumn(cabinetDepthMm: number): Design {
  const seeded = seededAt(cabinetDepthMm);
  return {
    ...seeded,
    placements: [
      ...seeded.placements.filter(
        (placement) => !THE_SEEDED_OVEN_TOWER.includes(placement.id),
      ),
      ...DECLARED_WALL_B_COLUMN,
    ],
  };
}

/** The frozen map the product would project, over the columns as they stood before the deletes. */
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

function theDeclaredDesignAt(cabinetDepthMm: number): Design {
  return afterDeleting(withADeclaredWallBColumn(cabinetDepthMm), [
    THE_DELETED_MEMBER,
  ]);
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

/** The pre-command design with only the along-wall coordinates the command moved bodies to (ADR 0090 decision 2). */
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
      // Only the coordinate: taking the arrived placement whole would carry the rebuilt body and its new seat into an
      // operand that is pre-command by requirement.
      return arrived.alongMm === placement.alongMm
        ? placement
        : { ...placement, alongMm: arrived.alongMm };
    }),
  };
}

interface PlanningMaps {
  readonly slid: ReadonlyMap<string, Column>;
  readonly unslid: ReadonlyMap<string, Column>;
  readonly records: readonly PlacementRecord[];
}

/** Both planning maps at one setting: the one `rebuildEveryBodyAt` builds, and the one ADR 0090
 *  decision 6 forbids. */
function planningMapsOf(design: Design, cabinetDepthMm: number): PlanningMaps {
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
  const records = derivePlacementRecords(
    { ...slidDesign, settings: { ...slidDesign.settings, cabinetDepthMm } },
    catalog,
  );

  return {
    records,
    slid: deriveColumnsOverFrozenExtents(
      records,
      frozenExtentsSlidAlongTheWall({
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
      design.room,
    ),
    unslid: deriveColumnsOverFrozenExtents(records, frozen, design.room),
  };
}

/** `rebuildEveryBodyAt`'s own three steps for one body against whichever planning map it is given. */
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
  const column = planningMap.get(record.col);
  if (!column) throw new Error(`no column ${record.col}`);
  return evaluateInsertFit({
    body,
    opening: openingFromPlacement(record, records, planningMap),
    column,
    cabinetDepthMm,
  });
}

function wallBRecordsAt(
  design: Design,
  cabinetDepthMm: number,
): readonly PlacementRecord[] {
  return derivePlacementRecords(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMm),
  ).filter((record) => record.wall === "B");
}

describe("the design wave 6X declares is a design the product accepts", () => {
  it.each(DECLARED_MM)(
    "parses under the current write contract and reports no fatal validation issue at %i mm",
    (cabinetDepthMm) => {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);

      const codesOn = (design: Design) =>
        validateDesignForCatalog(design, catalog).map((issue) => issue.code);

      for (const design of [
        withADeclaredWallBColumn(cabinetDepthMm),
        theDeclaredDesignAt(cabinetDepthMm),
      ]) {
        expect(CurrentDesignSchema.safeParse(design).success).toBe(true);
        expect(
          fatalDesignValidationIssues(
            validateDesignForCatalog(design, catalog),
          ),
        ).toStrictEqual([]);
      }

      // Not only fatal: a warning-severity issue on the fixture is still a document the product would complain about.
      expect(codesOn(withADeclaredWallBColumn(cabinetDepthMm))).toStrictEqual(
        [],
      );

      // At 700 the declared design is not ordinary: `seededAt` moves no placement, so wall B's run stands where the
      // 600 mm kitchen put it while the catalogue is built at 700. The gate reports the overlap as a `mark`; the
      // document still loads, which the fatal assertion above proves.
      expect(
        new Set(codesOn(theDeclaredDesignAt(cabinetDepthMm))),
      ).toStrictEqual(
        cabinetDepthMm === SHALLOW_MM
          ? new Set<string>()
          : new Set(["RECORDED_SPAN_OVERLAPS_CORNER_BODY"]),
      );
    },
  );

  // The declared column is wall A's `A|2.00` shape transposed. Read off the frames the product derives for both, and
  // pinned as literals so the two cannot move together.
  it("declares a column the product derives to the same two frames the seed carries on wall A", () => {
    const catalog = buildKitchenLBodyCatalog(SHALLOW_MM);
    const frameMmOf = (design: Design, id: string) => {
      const frame = derivePlacementRecords(design, catalog).find(
        (record) => record.id === id,
      )?.frame;
      if (!frame) throw new Error(`no record ${id}`);
      return [frame.y0, frame.w, frame.h, frame.d].map((metres) =>
        Math.round(metres * 1000),
      );
    };
    const declared = withADeclaredWallBColumn(SHALLOW_MM);

    expect(frameMmOf(declared, "d1")).toStrictEqual(
      frameMmOf(KITCHEN_L_DESIGN, "p1"),
    );
    expect(frameMmOf(declared, "d2")).toStrictEqual(
      frameMmOf(KITCHEN_L_DESIGN, "p15"),
    );
    expect(frameMmOf(declared, "d1").slice(0, 3)).toStrictEqual([
      0,
      600,
      SEEDED_BASE_CARCASS_MM,
    ]);
    expect(frameMmOf(declared, "d2").slice(0, 3)).toStrictEqual([
      2200, 600, 400,
    ]);
  });

  it("stands where the deleted oven tower stood, so nothing else on wall B moves", () => {
    const declared = withADeclaredWallBColumn(SHALLOW_MM);
    const removed = KITCHEN_L_DESIGN.placements.filter((placement) =>
      THE_SEEDED_OVEN_TOWER.includes(placement.id),
    );

    expect(removed.map((placement) => placement.alongMm)).toStrictEqual([
      1200, 1200,
    ]);
    expect(
      declared.placements
        .filter((placement) => placement.wall === "B")
        .map((placement) => placement.alongMm)
        .sort((left, right) => left - right),
    ).toStrictEqual([615, 615, 735, 1200, 1200, 1800, 1800, 2450, 2450]);
  });
});

describe("the precondition the modelled planning map is production's under", () => {
  // `planningDesign` clears the seat of every body that follows the setting before deriving its records; a model that
  // reads stored placements agrees only while no placement carries a seat.
  it.each(DECLARED_MM)(
    "has no placement carrying a stored seat, on either design, at %i mm",
    (cabinetDepthMm) => {
      const seated = [
        ...seededAt(cabinetDepthMm).placements,
        ...theDeclaredDesignAt(cabinetDepthMm).placements,
      ].filter((placement) => placement.body.seatDepthMm !== undefined);

      expect(seated.map((placement) => placement.id)).toStrictEqual([]);
    },
  );
});

/** Why this member cannot be the survivor the consequence needs; the assignment below is pinned against the same
 *  reasons the witness's histogram counts. */
function whyItCannotWitness(
  record: PlacementRecord,
  cabinetDepthMm: number,
): string {
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
  // ADR 0101: a `heightFlex` body builds to the opening §5.2 hands it, so it never requires more height than its
  // column offers and never produces the refusal.
  if (body.heightFlex) return "builds to the opening it is given";
  return body.nominalHeightMm === record.heightMm
    ? "rebuilds to the height it records"
    : "could witness";
}

describe("wall B's limitation, by member and not by count", () => {
  // A histogram of reasons is satisfied by any assignment with the same totals; the assignment is the fact.
  it.each(DECLARED_MM)(
    "gives each of the nine wall-B members its own reason at %i mm",
    (cabinetDepthMm) => {
      const byId = Object.fromEntries(
        wallBRecordsAt(seededAt(cabinetDepthMm), cabinetDepthMm).map(
          (record) => [record.id, whyItCannotWitness(record, cabinetDepthMm)],
        ),
      );

      expect(byId).toStrictEqual({
        p26: "not deletable",
        p9: "not deletable",
        p21: "not deletable",
        p7: "manufactured-size",
        // `wall-cabinet` is `heightFlex`, so §5.2 builds it to the opening it is handed.
        p22: "builds to the opening it is given",
        p23: "builds to the opening it is given",
        p24: "builds to the opening it is given",
        p5: "rebuilds to the height it records",
        p6: "rebuilds to the height it records",
      });
    },
  );

  // Every reason that applies, not the first an `if` ladder reaches: the corner returns have no §7 row to be rebuilt
  // through, so the histogram is a property of arm ordering as well as of the fixture.
  it.each(DECLARED_MM)(
    "carries two exclusions on each corner return and one on every other wall-B member, at %i mm",
    (cabinetDepthMm) => {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      const reasonsById = Object.fromEntries(
        wallBRecordsAt(seededAt(cabinetDepthMm), cabinetDepthMm).map(
          (record) => {
            const rule = cabinetDepthRuleOf({
              buildId: record.buildId,
              rule: record.depthRule,
            });
            const rebuild = resolveRebuildBody(catalog, record);
            return [
              record.id,
              [
                record.canDelete ? undefined : "not deletable",
                rule.follows === "cabinet-depth" ? undefined : rule.follows,
                rebuild === undefined ? "no catalogue equivalent" : undefined,
                rebuild?.heightFlex === true
                  ? "builds to the opening it is given"
                  : undefined,
                rebuild?.nominalHeightMm === record.heightMm
                  ? "rebuilds to the height it records"
                  : undefined,
              ].filter((reason) => reason !== undefined),
            ];
          },
        ),
      );

      expect(reasonsById).toStrictEqual({
        p26: ["not deletable", "no catalogue equivalent"],
        p9: ["not deletable", "no catalogue equivalent"],
        p21: ["not deletable", "no catalogue equivalent"],
        p7: ["manufactured-size", "rebuilds to the height it records"],
        p22: ["builds to the opening it is given"],
        p23: ["builds to the opening it is given"],
        p24: ["builds to the opening it is given"],
        p5: ["rebuilds to the height it records"],
        p6: ["rebuilds to the height it records"],
      });
    },
  );

  // ADR 0093's premise, measured through the command: a depth change rewrites the 820 / 860 gap on four wall-A
  // base rows and moves no wall-B body's height, in either direction.
  it.each([
    [SHALLOW_MM, DEEP_MM],
    [DEEP_MM, SHALLOW_MM],
  ])("rewrites only wall A's base rows, %i → %i mm", (fromMm, toMm) => {
    const design = seededAt(fromMm);
    const result = changeTo(design, toMm);
    expect(result.ok ? "ok" : result.reason.code).toBe("ok");
    if (!result.ok) return;

    const heldHeightMm = new Map(
      design.placements.map((placement) => [
        placement.id,
        placement.body.heightMm,
      ]),
    );
    const rewritten = result.design.placements
      .filter(
        (placement) =>
          heldHeightMm.get(placement.id) !== placement.body.heightMm,
      )
      .map((placement) => ({
        id: placement.id,
        wall: placement.wall,
        fromMm: heldHeightMm.get(placement.id),
        toMm: placement.body.heightMm,
      }));

    expect(rewritten).toStrictEqual(
      ["p0", "p1", "p2", "p4"].map((id) => ({
        id,
        wall: "A",
        fromMm: SEEDED_BASE_CARCASS_MM,
        toMm: WORKTOP_LINE_MM,
      })),
    );
  });
});

describe("the consequence runs in both directions", () => {
  // A slide right going out and wrong coming back leaves the kitchen at the coordinates of a setting it left
  // (ADR 0090 decision 2).
  it.each([
    [SHALLOW_MM, DEEP_MM],
    [DEEP_MM, SHALLOW_MM],
  ])(
    "refuses the rebuild against the un-slid planning map and fits it at 860 against the slid one, %i → %i mm",
    (fromMm, toMm) => {
      const design = theDeclaredDesignAt(fromMm);
      const maps = planningMapsOf(design, toMm);

      const refused = rebuildFitOf(
        design,
        toMm,
        THE_SURVIVING_BASE,
        maps.unslid,
        maps.records,
      );
      expect(refused.ok).toBe(false);
      if (refused.ok) return;
      expect(refused.detail.code).toBe("HEIGHT_EXCEEDS_LEVEL");
      expect(refused.detail.params).toMatchObject({
        requiredMm: WORKTOP_LINE_MM,
        availableMm: SEEDED_BASE_CARCASS_MM,
      });

      const fitted = rebuildFitOf(
        design,
        toMm,
        THE_SURVIVING_BASE,
        maps.slid,
        maps.records,
      );
      expect(fitted.ok).toBe(true);
      if (!fitted.ok) return;
      expect(Math.round(fitted.plan.heightM * 1000)).toBe(WORKTOP_LINE_MM);
    },
  );

  it.each([
    [SHALLOW_MM, DEEP_MM],
    [DEEP_MM, SHALLOW_MM],
  ])(
    "changes the kitchen's depth and rebuilds that body to the worktop line, %i → %i mm",
    (fromMm, toMm) => {
      const result = changeTo(theDeclaredDesignAt(fromMm), toMm);

      expect(result.ok ? "ok" : result.reason.code).toBe("ok");
      if (!result.ok) return;
      const rebuilt = result.design.placements.find(
        (placement) => placement.id === THE_SURVIVING_BASE,
      );
      expect(rebuilt?.body.heightMm).toBe(WORKTOP_LINE_MM);
      // The along-wall coordinate the divergence is about, asserted beside the height so a rebuild that fitted at the
      // wrong coordinate is not read as agreement.
      expect(rebuilt?.alongMm).toBe(toMm === DEEP_MM ? 1300 : 1100);
    },
  );
});

interface InsertedRow {
  readonly trail: string;
  readonly buildId: string;
  readonly heightMm: number;
  readonly offeredHeightMm: number | undefined;
}

/** Every body §7 offers into every wall-B void of one design, inserted, with the height the document
 *  then records. */
function everyWallBInsertOf(
  design: Design,
  cabinetDepthMm: number,
  trail: string,
): readonly InsertedRow[] {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
  const records = derivePlacementRecords(design, catalog);
  const columns = deriveColumns(
    records,
    { emptyColumns: design.emptyColumns, columnExtents: design.columnExtents },
    design.room,
  );
  const voids = recomputeVoids(records, columns);
  const rows: InsertedRow[] = [];

  for (const opening of voids.filter((candidate) =>
    candidate.col.startsWith("B|"),
  )) {
    const target = { kind: "void", id: opening.id } as const;
    const offers = offersFor({
      records,
      voids,
      columns,
      catalog,
      target,
      cabinetDepthMm,
    });

    for (const offer of offers) {
      const inserted = insertBody({
        design,
        catalog,
        columns,
        voids,
        target,
        buildId: offer.buildId,
        probe: createFakeProbe({ catalog }),
        occurredAt: OCCURRED_AT,
      });
      if (!inserted.ok) continue;
      const added = inserted.design.placements.find(
        (placement) =>
          !design.placements.some((held) => held.id === placement.id),
      );
      if (!added) continue;
      rows.push({
        trail,
        buildId: offer.buildId,
        heightMm: added.body.heightMm,
        offeredHeightMm: offer.buildsToHeightMm,
      });
    }
  }
  return rows;
}

describe("no shipped insert writes a seeded-style row onto wall B", () => {
  // An insert recording the carcass instead of the worktop line would make the declared design reachable (ADR 0093
  // decision 3b), so every wall-B void of every single delete is swept rather than one void.
  it.each(DECLARED_MM)(
    "records the height §7 offered, never the seeded carcass, over every wall-B void of every single delete at %i mm",
    (cabinetDepthMm) => {
      const seeded = seededAt(cabinetDepthMm);
      const deletable = derivePlacementRecords(
        seeded,
        buildKitchenLBodyCatalog(cabinetDepthMm),
      )
        .filter((record) => record.canDelete)
        .map((record) => record.id);

      const rows = [
        ...everyWallBInsertOf(seeded, cabinetDepthMm, "none"),
        ...deletable.flatMap((id) =>
          everyWallBInsertOf(afterDeleting(seeded, [id]), cabinetDepthMm, id),
        ),
      ];

      // The measured population, not a floor: `toBeGreaterThan(20)` would stay green after losing most of these rows.
      expect(rows.length).toBe(56);
      expect(
        rows.filter((row) => row.heightMm !== row.offeredHeightMm),
      ).toStrictEqual([]);
      expect(
        rows.filter(
          (row) =>
            row.heightMm === SEEDED_BASE_CARCASS_MM &&
            row.buildId.startsWith("base-"),
        ),
      ).toStrictEqual([]);
    },
  );
});
