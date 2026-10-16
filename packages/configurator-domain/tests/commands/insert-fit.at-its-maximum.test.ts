// A `'fit'` body in an opening wider than its maximum is built at that maximum, flush left, and
// the rest of the opening stays one member-less column on its right. Openings are hand-built (`fit-sweep.ts`).
import { describe, expect, it } from "vitest";

import {
  CABINETRY_MAX_WIDTH_MM,
  listInsertableBodies,
  type InsertableBody,
} from "../../src/catalog.js";
import { insertBody } from "../../src/commands/insert-body.js";
import {
  evaluateInsertFit,
  openingFromVoid,
} from "../../src/commands/insert-fit.js";
import { reconcileSuccessfulCommandResult } from "../../src/commands/reconcile-command-result.js";
import { cabinetDepthMmOf, type Design } from "../../src/design.js";
import { KITCHEN_L_BODY_CATALOG } from "../../src/fixtures/kitchen-l-design.js";
import { toExactMillimetres, toMillimetres } from "../../src/millimetres.js";
import { MAX_EMPTY_COLUMN_WIDTH_MM } from "../../src/module-grid.js";
import { offersFor } from "../../src/queries/offers.js";
import {
  deriveColumns,
  derivePlacementRecords,
  recomputeVoids,
  type BodyCatalog,
  type BodyDefinition,
  type Column,
  type VoidRecord,
} from "../../src/void-engine.js";
import { createFakeProbe } from "../support/fake-probe.js";
import {
  COLUMN_SHAPES,
  digestByEntry,
  entryMaximumMm,
  isFitEntry,
  isHeldToHead,
  OPENING_LEFT_EDGE_MM,
  openingWorld,
  SWEEP_OPENING_WIDTHS_MM,
  sweepVerdicts,
  type ColumnShape,
  type OpeningWorld,
  type SweepVerdict,
} from "../support/fit-sweep.js";
import { offeredIds } from "../support/offers.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const OCCURRED_AT = "2026-10-16T12:00:00.000Z";
const SHAPES = Object.keys(COLUMN_SHAPES) as ColumnShape[];
const BODIES = listInsertableBodies(CATALOG);
const FIT_BODIES = BODIES.filter(isFitEntry);

/** `digestByEntry(sweepVerdicts().filter(isHeldToHead))`, recorded before an over-wide opening could build anything:
 *  every row these cover must answer exactly as it did then. */
const VERDICTS_HELD_TO_HEAD: Readonly<Record<string, string>> = {
  "base-cabinet":
    "4a01db986b75a7452b79266c46a948dba8d894b737a551222ffbbc84b3f86957",
  "base-3drawer":
    "41b030595b0744cfa333b1b6fd559b96d7370323842b2c16459290a70535bc1b",
  "base-panbank":
    "44d2b7e34872cc16d65d966eda206101b83999e1473bc63dc2a96fe79daad501",
  "base-hob-2drawer":
    "8b0a24145956b839cf673a7b1731129140a8992dbd0b3167c728b899462b575c",
  "base-hob-oven":
    "f9f5aba394d71f209d2a70998f198e3eabbbfb0f14b598146f9a313a8a98f450",
  "base-bottle-cargo":
    "c08105df52275beabd69243277fa00877bebe2747cad58046dfad05587c61263",
  "base-sink":
    "401ebf2e284ef25a281521ef22981b9b3eb9be96b47f4094357e2c10cb0b2abf",
  "base-dishwasher":
    "c81acbc6f58e186e0f0c7601d01e75a8051d777d9d72816e439eda0aff337bc9",
  "wall-cabinet":
    "98d378511e166b65466d43c7319f170d73228acd881e27a4ba2dfb611a5cf31b",
  "wall-lift":
    "4a27d073911de3b933e58f8a9aa8fe89255b6325009481199078944eb3fc8a30",
  "open-shelf":
    "12bd0b94c6f412b64171559f796ae5249c8819b797c91a30a564ad10f3d34b80",
  hood: "08e65cfbbce6862103af2b570e71e6625e0082ea6302b3696b96ba41da133b03",
  "tall-pantry":
    "30e5b238f6d36c3c423d43cad174369ef120fa6e49c6b5c544e7477fc8aedfa6",
  "tall-oven-tower":
    "80cc95091f58a55fe603f24dfd03f9f831fc41f4d985aacf6992d319cd1e8282",
  "tall-fridge-housing":
    "5e7e50c8509dcb78b0358a24bfd7cc8b91ff493a382d245de7fcee3f73dd4727",
  "fridge-free":
    "8b7e06bb46018914f839d052c71b6327ceb67d8647a987ff28e314d88a3be8f0",
};

/** The `InsertPlan` fields a seat does not decide, which an over-wide opening must answer as the maximum-width one. */
interface PlanOutsideTheSeat {
  readonly heightM: number;
  readonly depthM: number;
  readonly y0M: number;
  readonly slotBand: string;
}

interface PlanAnswer extends PlanOutsideTheSeat {
  readonly widthM: number;
  readonly alongMm: number;
  readonly remainderMm: number;
}

function isPlan(answer: unknown): answer is PlanAnswer {
  return typeof answer === "object" && answer !== null && "widthM" in answer;
}

function codeOf(answer: unknown): string {
  if (isPlan(answer)) return "accepted";
  return (answer as { readonly code: string }).code;
}

function maximumOf(body: InsertableBody): number {
  const maximumMm = entryMaximumMm(body);
  if (maximumMm === undefined) throw new Error(`${body.buildId} has no range`);
  return maximumMm;
}

function bodyNamed(buildId: string, catalog: BodyCatalog = CATALOG) {
  const body = listInsertableBodies(catalog).find(
    (candidate) => candidate.buildId === buildId,
  );
  if (!body) throw new Error(`No insertable entry ${buildId}`);
  return body;
}

function voidAtFloor(world: OpeningWorld, floorMm: number): VoidRecord {
  const found = world.voids.find(
    (record) => toMillimetres(record.y0) === floorMm,
  );
  if (!found) throw new Error(`No void at ${String(floorMm)} mm`);
  return found;
}

function columnOf(world: OpeningWorld, record: VoidRecord): Column {
  const column = world.columns.get(record.col);
  if (!column) throw new Error(`No column ${record.col}`);
  return column;
}

function evaluateIn(
  world: OpeningWorld,
  record: VoidRecord,
  body: InsertableBody,
) {
  return evaluateInsertFit({
    body,
    opening: openingFromVoid(record),
    column: columnOf(world, record),
    cabinetDepthMm: world.cabinetDepthMm,
  });
}

function insertIn(world: OpeningWorld, record: VoidRecord, buildId: string) {
  return insertBody({
    design: world.design,
    catalog: world.catalog,
    columns: world.columns,
    voids: world.voids,
    target: { kind: "void", id: record.id },
    buildId,
    probe: createFakeProbe({ catalog: world.catalog }),
    occurredAt: OCCURRED_AT,
  });
}

/** The store's own path after an accepted insert: the command, then the reconcile (ADR 0090 Amendment B). */
function insertAndReconcile(
  world: OpeningWorld,
  record: VoidRecord,
  buildId: string,
): OpeningWorld {
  const result = insertIn(world, record, buildId);
  if (!result.ok) {
    throw new Error(`${buildId} was refused: ${result.reason.code}`);
  }
  const reconciled = reconcileSuccessfulCommandResult({
    result,
    catalog: world.catalog,
    previousRecordedColumns: world.columns,
  });
  return {
    design: reconciled.design,
    catalog: world.catalog,
    cabinetDepthMm: cabinetDepthMmOf(reconciled.design),
    records: reconciled.records,
    columns: reconciled.columns,
    voids: reconciled.voids,
  };
}

interface ExtentMm {
  readonly leftMm: number;
  readonly rightMm: number;
}

function extentOf(column: Column): ExtentMm {
  const centreMm = toExactMillimetres(column.x);
  const widthMm = toExactMillimetres(column.w);
  if (centreMm === undefined || widthMm === undefined) {
    throw new Error(`${column.key} is not on whole millimetres`);
  }
  return { leftMm: centreMm - widthMm / 2, rightMm: centreMm + widthMm / 2 };
}

/** The member-less columns on wall A, left to right. */
function memberlessExtents(world: OpeningWorld): ExtentMm[] {
  const occupied = new Set(world.records.map((record) => record.col));
  return [...world.columns.values()]
    .filter((column) => column.wall === "A" && !occupied.has(column.key))
    .map(extentOf)
    .sort((left, right) => left.leftMm - right.leftMm);
}

function placedBody(world: OpeningWorld) {
  const [placement] = world.design.placements;
  if (!placement) throw new Error("Nothing was placed");
  return placement;
}

function leftEdgeOfPlacement(world: OpeningWorld): number {
  const placement = placedBody(world);
  return placement.alongMm - placement.body.widthMm / 2;
}

describe("an opening at or under the maximum answers as it did before (8U criteria 8-9)", () => {
  const verdicts = sweepVerdicts();
  const held = verdicts.filter((verdict) => isHeldToHead(verdict));

  it("gives every row at or under its entry's maximum, and every millimetre-set row at every width, the verdict it gave before the change", () => {
    expect(digestByEntry(held)).toStrictEqual(VERDICTS_HELD_TO_HEAD);
  });

  it("holds both an accepted and a refused row of every entry to that verdict, so the pin covers both answers", () => {
    for (const body of BODIES) {
      const codes = new Set(
        held
          .filter((verdict) => verdict.buildId === body.buildId)
          .map((verdict) => codeOf(verdict.answer)),
      );
      expect([body.buildId, codes.has("accepted")]).toStrictEqual([
        body.buildId,
        true,
      ]);
      expect([body.buildId, codes.size]).not.toStrictEqual([body.buildId, 1]);
    }
  });
});

describe("a 'fit' body in an opening wider than its maximum (8U criterion 8)", () => {
  const verdicts = sweepVerdicts();

  /** The same entry, shape and level at an opening exactly its maximum wide: what an over-wide opening must equal. */
  function answerAtTheMaximum(verdict: SweepVerdict, maximumMm: number) {
    const found = verdicts.find(
      (candidate) =>
        candidate.buildId === verdict.buildId &&
        candidate.shape === verdict.shape &&
        candidate.levelFloorMm === verdict.levelFloorMm &&
        candidate.openingWidthMm === maximumMm,
    );
    if (!found) throw new Error(`No row at ${String(maximumMm)} mm`);
    return found.answer;
  }

  it("builds at the entry's maximum, its left edge on the opening's, with the rest as the remainder, wherever an opening of exactly that maximum accepts it", () => {
    const acceptedByEntry = new Map<string, number>();
    for (const verdict of verdicts) {
      const body = bodyNamed(verdict.buildId);
      const maximumMm = maximumOf(body);
      if (!isFitEntry(body) || verdict.openingWidthMm <= maximumMm) continue;
      const atTheMaximum = answerAtTheMaximum(verdict, maximumMm);
      if (!isPlan(atTheMaximum) || !isPlan(verdict.answer)) continue;
      const { widthM, alongMm, remainderMm, ...outsideTheSeat } =
        verdict.answer;
      const widthMm = toMillimetres(widthM);

      expect([verdict, widthMm]).toStrictEqual([verdict, maximumMm]);
      expect([verdict, alongMm - widthMm / 2]).toStrictEqual([
        verdict,
        OPENING_LEFT_EDGE_MM,
      ]);
      expect([verdict, remainderMm]).toStrictEqual([
        verdict,
        verdict.openingWidthMm - maximumMm,
      ]);
      expect([verdict, outsideTheSeat]).toStrictEqual([
        verdict,
        pickOutsideTheSeat(atTheMaximum),
      ]);
      acceptedByEntry.set(
        body.buildId,
        (acceptedByEntry.get(body.buildId) ?? 0) + 1,
      );
    }

    for (const body of FIT_BODIES) {
      expect([
        body.buildId,
        acceptedByEntry.get(body.buildId) ?? 0,
      ]).not.toStrictEqual([body.buildId, 0]);
    }
  });

  it("refuses with the maximum-width opening's own code wherever that opening refuses, and never for its width", () => {
    let refused = 0;
    for (const verdict of verdicts) {
      const body = bodyNamed(verdict.buildId);
      const maximumMm = maximumOf(body);
      if (!isFitEntry(body) || verdict.openingWidthMm <= maximumMm) continue;
      const atTheMaximum = answerAtTheMaximum(verdict, maximumMm);
      if (isPlan(atTheMaximum)) {
        expect([verdict, codeOf(verdict.answer)]).toStrictEqual([
          verdict,
          "accepted",
        ]);
        continue;
      }
      expect([verdict, codeOf(verdict.answer)]).toStrictEqual([
        verdict,
        codeOf(atTheMaximum),
      ]);
      refused += 1;
    }

    expect(refused).toBeGreaterThan(0);
  });

  it("never builds a body wider than the cabinet ceiling", () => {
    const widest = Math.max(
      ...verdicts
        .map((verdict) => verdict.answer)
        .filter(isPlan)
        .map((plan) => toMillimetres(plan.widthM)),
    );

    expect(widest).toBe(CABINETRY_MAX_WIDTH_MM);
  });

  it("reads the entry's own maximum, not the cabinet ceiling: a 300-600 mm entry builds 600 in a 1200 mm opening", () => {
    const catalog = withNarrowedEntry("base-3drawer", {
      minMm: 300,
      maxMm: 600,
    });
    const world = openingWorld("floor-to-ceiling", 1200, catalog);
    const record = voidAtFloor(world, 0);

    const fit = evaluateIn(world, record, bodyNamed("base-3drawer", catalog));

    expect(fit.ok && toMillimetres(fit.plan.widthM)).toBe(600);
    expect(fit.ok && fit.plan.remainderMm).toBe(600);
  });

  it("still refuses an over-wide opening in a column a member at another level keeps whole, rather than centring between two slivers", () => {
    const world = wideColumnOverAStandingBase(1200);
    const record = voidAtFloor(world, 1500);

    const fit = evaluateIn(world, record, bodyNamed("wall-cabinet"));

    expect(fit.ok ? "accepted" : fit.detail.code).toBe("WIDTH_NOT_SUPPORTED");
    expect(fit.ok ? undefined : fit.detail.params).toMatchObject({
      availableMm: 1200,
    });
  });
});

describe("the insert leaves one member-less column on the body's right (8U item 2: E2, E3, E11, E12)", () => {
  it("E2: a base-cabinet into a cleared 1200 mm column is 800 flush left, with its own wall and top openings, beside one 400 mm column open at every level", () => {
    const start = openingWorld("floor-to-ceiling", 1200);

    const after = insertAndReconcile(
      start,
      voidAtFloor(start, 0),
      "base-cabinet",
    );
    const body = placedBody(after);
    const remainder = memberlessExtents(after);
    const occupiedVoids = after.voids.filter(
      (record) => record.col === after.records[0]?.col,
    );
    const remainderVoids = after.voids.filter(
      (record) => record.col !== after.records[0]?.col,
    );

    expect(body.body.widthMm).toBe(800);
    expect(leftEdgeOfPlacement(after)).toBe(1000);
    expect(remainder).toStrictEqual([{ leftMm: 1800, rightMm: 2200 }]);
    expect(occupiedVoids.map(levelAndWidthMm)).toStrictEqual([
      [1500, 800, 700],
      [2200, 800, 400],
    ]);
    expect(remainderVoids.map(levelAndWidthMm)).toStrictEqual([
      [0, 400, 860],
      [1500, 400, 700],
      [2200, 400, 400],
    ]);
  });

  it("E3: a 400 mm base into E2's remainder fills it exactly and leaves no member-less column", () => {
    const start = openingWorld("floor-to-ceiling", 1200);
    const e2 = insertAndReconcile(start, voidAtFloor(start, 0), "base-cabinet");
    const remainderBase = e2.voids.find(
      (record) => toMillimetres(record.y0) === 0,
    );
    if (!remainderBase) throw new Error("E2 left no base opening");

    const after = insertAndReconcile(e2, remainderBase, "base-cabinet");

    expect(
      after.design.placements.map((placement) => placement.body.widthMm),
    ).toStrictEqual([800, 400]);
    expect(memberlessExtents(after)).toStrictEqual([]);
  });

  it("E11: the dishwasher, a millimetre set, takes its widest size, 600, flush left, beside one 600 mm column", () => {
    const start = openingWorld("floor-to-ceiling", 1200);

    const after = insertAndReconcile(
      start,
      voidAtFloor(start, 0),
      "base-dishwasher",
    );

    expect(placedBody(after).body.widthMm).toBe(600);
    expect(leftEdgeOfPlacement(after)).toBe(1000);
    expect(memberlessExtents(after)).toStrictEqual([
      { leftMm: 1600, rightMm: 2200 },
    ]);
  });

  it("E12: the pantry into the full-height opening is 800 flush left, beside one 400 mm column", () => {
    const start = openingWorld("floor-to-ceiling", 1200);

    const after = insertAndReconcile(
      start,
      voidAtFloor(start, 0),
      "tall-pantry",
    );

    expect(placedBody(after).body.widthMm).toBe(800);
    expect(leftEdgeOfPlacement(after)).toBe(1000);
    expect(memberlessExtents(after)).toStrictEqual([
      { leftMm: 1800, rightMm: 2200 },
    ]);
  });

  /** Remainders up to the 800 mm the insert's own split still cuts at (`split-column.ts`, retired in S5). */
  it("leaves exactly one remainder column, from the body's right edge to the opening's, for every 'fit' entry at every level it is accepted", () => {
    const insertedByEntry = new Map<string, number>();
    for (const body of FIT_BODIES) {
      const maximumMm = maximumOf(body);
      for (const shape of SHAPES) {
        for (const widthMm of widthsAbove(
          maximumMm,
          maximumMm + MAX_EMPTY_COLUMN_WIDTH_MM,
        )) {
          const world = openingWorld(shape, widthMm);
          for (const record of world.voids) {
            if (!insertIn(world, record, body.buildId).ok) continue;
            const after = insertAndReconcile(world, record, body.buildId);
            const label = [
              body.buildId,
              shape,
              widthMm,
              toMillimetres(record.y0),
            ];

            expect([label, placedBody(after).body.widthMm]).toStrictEqual([
              label,
              maximumMm,
            ]);
            expect([label, leftEdgeOfPlacement(after)]).toStrictEqual([
              label,
              OPENING_LEFT_EDGE_MM,
            ]);
            expect([label, memberlessExtents(after)]).toStrictEqual([
              label,
              [
                {
                  leftMm: OPENING_LEFT_EDGE_MM + maximumMm,
                  rightMm: OPENING_LEFT_EDGE_MM + widthMm,
                },
              ],
            ]);
            insertedByEntry.set(
              body.buildId,
              (insertedByEntry.get(body.buildId) ?? 0) + 1,
            );
          }
        }
      }
    }

    for (const body of FIT_BODIES) {
      expect([
        body.buildId,
        insertedByEntry.get(body.buildId) ?? 0,
      ]).not.toStrictEqual([body.buildId, 0]);
    }
  });

  it("tiles a remainder wider than 800 mm exactly, from the body's right edge to the opening's, with no gap and no overlap", () => {
    const start = openingWorld("floor-to-ceiling", 3000);

    const after = insertAndReconcile(
      start,
      voidAtFloor(start, 0),
      "base-cabinet",
    );
    const pieces = memberlessExtents(after);

    expect(pieces[0]?.leftMm).toBe(1800);
    expect(pieces.at(-1)?.rightMm).toBe(4000);
    expect(
      pieces.every(
        (piece, index) =>
          index === 0 || piece.leftMm === pieces[index - 1]?.rightMm,
      ),
    ).toBe(true);
  });

  // Owed by 8U S4/S5: the uncapped merge rejoins the pieces `splitColumn` cuts at 800 (S4), and S5 retires the cut.
  it.fails(
    "leaves one remainder column however wide the remainder (criterion 8; an expected failure until 8U S4)",
    () => {
      const start = openingWorld("floor-to-ceiling", 3000);

      const after = insertAndReconcile(
        start,
        voidAtFloor(start, 0),
        "base-cabinet",
      );

      expect(memberlessExtents(after)).toStrictEqual([
        { leftMm: 1800, rightMm: 4000 },
      ]);
    },
  );
});

describe("the offer list for an opening wider than 800 mm (8U criterion 10)", () => {
  it("lists exactly the entries the insert accepts there, each at the width the insert builds, and never nothing", () => {
    let visited = 0;
    let offering = 0;
    const offeredFitIds = new Set<string>();
    for (const shape of SHAPES) {
      for (const widthMm of widthsAbove(CABINETRY_MAX_WIDTH_MM, Infinity)) {
        const world = openingWorld(shape, widthMm);
        for (const record of world.voids) {
          const offers = offersFor({
            ...world,
            target: { kind: "void", id: record.id },
          });
          const accepted = BODIES.flatMap((body) => {
            const result = insertIn(world, record, body.buildId);
            return result.ok ? [result] : [];
          });
          const label = [shape, widthMm, toMillimetres(record.y0)];

          expect([label, offeredIds(offers)]).toStrictEqual([
            label,
            accepted.map((result) => result.effect.buildId),
          ]);
          expect([
            label,
            offers.map((offer) => offer.buildsToWidthMm),
          ]).toStrictEqual([
            label,
            accepted.map((result) =>
              widthOfPlaced(result.design, result.effect.placementId),
            ),
          ]);
          visited += 1;
          if (offers.length > 0) offering += 1;
          for (const id of offeredIds(offers)) offeredFitIds.add(id);
        }
      }
    }

    expect(visited).toBeGreaterThan(0);
    expect(offering).toBe(visited);
    expect(
      FIT_BODIES.map((body) => body.buildId).filter(
        (id) => !offeredFitIds.has(id),
      ),
    ).toStrictEqual([]);
  });
});

function pickOutsideTheSeat(plan: PlanAnswer): PlanOutsideTheSeat {
  return {
    heightM: plan.heightM,
    depthM: plan.depthM,
    y0M: plan.y0M,
    slotBand: plan.slotBand,
  };
}

function levelAndWidthMm(record: VoidRecord): readonly number[] {
  return [
    toMillimetres(record.y0),
    toMillimetres(record.w),
    toMillimetres(record.h),
  ];
}

/** The sweep's widths strictly above `lowerMm`, up to and including `upperMm`. */
function widthsAbove(lowerMm: number, upperMm: number): readonly number[] {
  return SWEEP_OPENING_WIDTHS_MM.filter(
    (widthMm) => widthMm > lowerMm && widthMm <= upperMm,
  );
}

function widthOfPlaced(design: Design, placementId: string): number {
  const placement = design.placements.find(
    (candidate) => candidate.id === placementId,
  );
  if (!placement) throw new Error(`No placement ${placementId}`);
  return placement.body.widthMm;
}

/** The catalogue with one entry's bound replaced, so its maximum differs from the cabinet ceiling. */
function withNarrowedEntry(
  buildId: string,
  range: { readonly minMm: number; readonly maxMm: number },
): BodyCatalog {
  const definition = CATALOG.get(buildId);
  if (!definition) throw new Error(`No entry ${buildId}`);
  const narrowed: BodyDefinition = {
    ...definition,
    widthRangesMm: [range],
    sizesMm: [range.minMm, range.maxMm],
  };
  return new Map([...CATALOG, [buildId, narrowed]]);
}

/** A 600 mm base standing in a frozen column `widthMm` wide and open above it: a column the insert may not divide. */
function wideColumnOverAStandingBase(widthMm: number): OpeningWorld {
  const centreMm = OPENING_LEFT_EDGE_MM + widthMm / 2;
  const design: Design = {
    room: { shape: "L", widthMm: 6000, depthMm: 2400, heightMm: 2600 },
    presetId: null,
    placements: [
      {
        id: "standing-base",
        wall: "A",
        alongMm: centreMm,
        y0Mm: 0,
        body: { buildId: "base-cabinet", widthMm: 600, heightMm: 860 },
      },
    ],
    columnExtents: [
      {
        wall: "A",
        alongMm: centreMm,
        widthMm,
        y0Mm: 0,
        topMm: 2600,
        depthMm: 580,
      },
    ],
    createdAt: OCCURRED_AT,
    updatedAt: OCCURRED_AT,
  };
  const records = derivePlacementRecords(design, CATALOG);
  const columns = deriveColumns(records, design, design.room);
  return {
    design,
    catalog: CATALOG,
    cabinetDepthMm: cabinetDepthMmOf(design),
    records,
    columns,
    voids: recomputeVoids(records, columns),
  };
}
