// Adversarial QA on wave 6X — **what the witness rests on, asserted rather than assumed.**
//
// Wave 6X exists because a rule the tree cannot distinguish from its own absence is unshipped
// ([ADR 0093](../../../../docs/decisions/0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md)
// decision 1). Its witness is `6x-slide-witness.test.ts`, and every one of its criteria stands on
// four unasserted preconditions. This file asserts them, and adds the two sweeps the wave's
// example-shaped criteria leave open.
//
// - **Item 3's design must be one the product would accept**, or the wave's non-vacuity case is a
//   hand-built object no route could produce and ADR 0093's conditional owner input arises. Parsed
//   through `CurrentDesignSchema` and validated against the catalogue here.
// - **The modelled planning map is production's only while no placement carries a seat.**
//   `planningDesign` strips the seats of every body that follows the setting (ADR 0077 decision 8);
//   a model that rebuilds records from the stored placements does not. `plannedMapOf` in
//   `qa-6k-i-planning-map.adversarial.test.ts` throws when handed a seat for exactly this reason,
//   and 6X's own model carries no such guard — so the precondition is measured here instead.
// - **Item 4's histogram fixes a multiset of reasons and not an assignment.** Three `not deletable`
//   and three `pinned` is the same histogram whichever three members carry which, so the assignment
//   is pinned per id below — and with it the second reason three of those members carry, which is
//   what makes the histogram's labels a property of the predicate's arm order as well as of wall B.
// - **The 820 / 860 gap is the premise of the whole record** (ADR 0093's measured section), and it
//   is measured here through the command rather than beside it: a depth change rewrites four wall-A
//   base rows from 820 to 860 and no wall-B body at all, in both directions.
//
// And two sweeps, both of which go red where the wave's examples would stay green:
//
// - **the consequence in the other direction** — 700 → 600 as well as 600 → 700, on the same
//   declared design. Item 3 asserts one direction, and ADR 0090 decision 2's ladder is claimed
//   *"in both directions"*;
// - **the reachability boundary over every wall-B void of every single-delete trail**, not the one
//   void item 5 measures. ADR 0093's claim is that *no* shipped command writes a seeded-style
//   820 mm row onto wall B, and one insert into one void does not measure that.
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

/** §7's base rows reach the worktop line; a seeded base row records the carcass without it. The gap
 *  between the two is what ADR 0090 decision 6 protects, and what wall B does not have. */
const WORKTOP_LINE_MM = 860;
const SEEDED_BASE_CARCASS_MM = 820;

/** Wave 6X's declared wall-B column, reproduced here rather than imported: a witness whose
 *  preconditions are asserted against a copy of the design proves nothing about the design the
 *  witness runs on, so the two must be the same literal shape and are checked against each other
 *  in the first test below. */
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

/** The frozen map the product would project for this design, over the columns as they stood before
 *  the deletes — the construction wave 6X uses, so the document is the product's own. */
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

/** The pre-command design with only the along-wall coordinates the command moved its bodies to, read
 *  off the command's own output — ADR 0088 decision 2's one author for the ladder. */
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
      // **Only the coordinate.** Taking the arrived placement whole would carry the rebuilt body and
      // its new seat into an operand that is pre-command by requirement.
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
  const frozen = deriveRecordedColumns(heldRecords, {
    emptyColumns: design.emptyColumns,
    columnExtents: design.columnExtents,
  });
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

// ---------------------------------------------------------------------------------------------
// The witness's own preconditions.
// ---------------------------------------------------------------------------------------------

describe("the design wave 6X declares is a design the product accepts", () => {
  it.each(DECLARED_MM)(
    "parses under the current write contract and reports no fatal validation issue at %i mm",
    (cabinetDepthMm) => {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);

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
        // Not only fatal: a warning-severity issue on the wave's own fixture is still a document the
        // product would complain about, and the wave's claim is that this one is ordinary.
        expect(validateDesignForCatalog(design, catalog)).toStrictEqual([]);
      }
    },
  );

  it("declares a column of two bodies the seed already carries at the same sizes on wall A", () => {
    const seeded = new Map(
      KITCHEN_L_DESIGN.placements.map((placement) => [placement.id, placement]),
    );
    const dishwasher = seeded.get("p1");
    const top = seeded.get("p15");

    // The declared column is wall A's `A|2.00` shape transposed, and that is what makes it a design
    // the catalogue and the schema already accept rather than a shape invented for the test.
    expect(DECLARED_WALL_B_COLUMN[0]?.body).toStrictEqual(dishwasher?.body);
    expect(DECLARED_WALL_B_COLUMN[1]?.body).toStrictEqual(top?.body);
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
    ).toStrictEqual([615, 615, 740, 1200, 1200, 1800, 1800, 2450, 2450]);
  });
});

describe("the precondition the modelled planning map is production's under", () => {
  // `planningDesign` clears the seat of every body that follows the setting before deriving its
  // records; a model that reads the stored placements does not. The two agree only while no
  // placement carries a seat, and 6X's model — unlike `plannedMapOf` — does not check.
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

// ---------------------------------------------------------------------------------------------
// The fixture limitation, pinned as an assignment rather than as a histogram.
// ---------------------------------------------------------------------------------------------

/** Why this member cannot be the survivor the consequence needs — wave 6X's own predicate, so the
 *  assignment below is pinned against the same reasons its histogram counts. */
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
  const rebuildHeightMm = resolveRebuildBody(
    buildKitchenLBodyCatalog(cabinetDepthMm),
    record,
  )?.nominalHeightMm;
  if (rebuildHeightMm === undefined) return "no catalogue equivalent";
  return rebuildHeightMm === record.heightMm
    ? "rebuilds to the height it records"
    : "could witness";
}

describe("wall B's limitation, by member and not by count", () => {
  // A histogram of 3 / 1 / 3 / 2 is satisfied by any assignment with those totals: swap which three
  // members are structural and which three are pinned and the count is unchanged. The assignment is
  // the fact, so the assignment is what is asserted.
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
        p22: "pinned",
        p23: "pinned",
        p24: "pinned",
        p5: "rebuilds to the height it records",
        p6: "rebuilds to the height it records",
      });
    },
  );

  // **Every reason that applies, not the first one an `if` ladder reaches.** Three members carry two
  // reasons apiece, so the wave's 3 / 1 / 3 / 2 histogram is a property of its arm ordering as much
  // as of the fixture: label the corner returns by the reason that actually excludes them — they have
  // no §7 row to be rebuilt through — and the same nine members give 0 / 1 / 3 / 2 / 3.
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
        p22: ["pinned"],
        p23: ["pinned"],
        p24: ["pinned"],
        p5: ["rebuilds to the height it records"],
        p6: ["rebuilds to the height it records"],
      });
    },
  );

  // ADR 0093's premise, measured through the command rather than through a predicate beside it: the
  // 820 / 860 gap is what a depth change rewrites, it is carried by **four** wall-A base rows rather
  // than by the dishwasher niche alone, and no wall-B body's height moves in either direction.
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

// ---------------------------------------------------------------------------------------------
// The consequence, in the direction wave 6X does not assert.
// ---------------------------------------------------------------------------------------------

describe("the consequence runs in both directions", () => {
  // ADR 0090 decision 2's ladder is claimed in both directions, and a slide that is right going out
  // and wrong coming back leaves the customer's kitchen at the coordinates of a setting it left.
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
      // The along-wall coordinate the whole divergence is about, asserted beside the height so a
      // rebuild that fitted at the wrong coordinate is not read as agreement.
      expect(rebuilt?.alongMm).toBe(toMm === DEEP_MM ? 1300 : 1100);
    },
  );
});

// ---------------------------------------------------------------------------------------------
// The reachability boundary, swept rather than sampled.
// ---------------------------------------------------------------------------------------------

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
    }).filter((offer) => offer.verdict.status === "offered");

    for (const offer of offers) {
      const inserted = insertBody({
        design,
        catalog,
        columns,
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
        offeredHeightMm:
          offer.verdict.status === "offered"
            ? offer.verdict.heightMm
            : undefined,
      });
    }
  }
  return rows;
}

describe("no shipped insert writes a seeded-style row onto wall B", () => {
  // Item 5 measures one void of one trail. ADR 0093's claim is about every route, so every wall-B
  // void of every single delete is swept: an insert that recorded the carcass instead of the worktop
  // line would make item 3's design reachable, and the wave says so is a better finding than its own
  // criterion.
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

      // **The measured population, not a floor under it.** A `toBeGreaterThan(20)` here would
      // stay green after losing 35 of the 56 rows this sweep actually visits, which is the
      // weakness this wave exists to remove — the same standard `6x-slide-witness.test.ts:710`
      // already applies to its own count. 56 at both settings: the seeded wall B offers 8 voids,
      // and each of the six deletable rows opens one more.
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
