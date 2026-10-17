// 8U criteria 1, 2, 3, 3a and 4 over the editor's own command sequences on generated kitchens: `removePlacement`,
// `insertBody` (an offered row into a published opening) and `setWidth` (an available chip), at most 12 commands
// deep, every step through `reconcileSuccessfulCommandResult`. Rooms are drawn from rooms the generator accepts,
// L (both hands), U and straight, off the round grid (1, 15 and 85 mm offsets) and at the three approved heights.
//
// Unlike `empty-column-ceiling.test.ts`, every surviving pair must have a guard `support/merge-oracle.ts` names.
//
// Criterion 3's band is the wall plus the module row a member-less column's floor stands on, not its exact
// `[floor, top]`: the merged envelope takes the lowest top, so the bridged chain 2.56 / 2.60 / 2.58 (criterion 7b)
// would leave the 2600 band empty though no wall was lost.
//
// R6: the editor's limit set back to 800 turns both properties red; the stored-801 fixture shows criterion 3a can fail.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import type { BodyProbe } from "../src/body-probe.js";
import type {
  CommandResult,
  CommandSuccess,
} from "../src/commands/command-result.js";
import { insertBody } from "../src/commands/insert-body.js";
import { reconcileSuccessfulCommandResult } from "../src/commands/reconcile-command-result.js";
import { removePlacement } from "../src/commands/remove-placement.js";
import { setWidth } from "../src/commands/set-width.js";
import { CABINETRY_MAX_WIDTH_MM } from "../src/catalog.js";
import { cabinetDepthMmOf, DesignSchema, type Design } from "../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
} from "../src/fixtures/kitchen-l-design.js";
import { generateKitchen } from "../src/generation/generate-kitchen.js";
import { MILLIMETRES_PER_METRE, toMetres } from "../src/millimetres.js";
import { LEVELS } from "../src/module-grid.js";
import { APPROVED_ROOM_POLICY } from "../src/room/approved-room-policy.js";
import {
  validateRoomInput,
  type RoomInput,
} from "../src/room/validate-room.js";
import { priceDesign } from "../src/pricing/price-design.js";
import { SAMPLE_PRICE_BOOK } from "../src/pricing/sample-price-book.js";
import { offersFor } from "../src/queries/offers.js";
import { widthOptionsFor } from "../src/queries/width-options.js";
import {
  clipEmptyColumnsAtWallEnd,
  clipEmptyColumnsToFreeGround,
  deriveColumns,
  derivePlacementRecords,
  deriveRecordedColumns,
  mergeAdjacentEmptyColumns,
  recomputeVoids,
  splitOversizedEmptyColumns,
  withCurrentFullHeightMembers,
  type BodyCatalog,
  type Column,
  type ColumnExtent,
  type PlacementRecord,
  type VoidRecord,
} from "../src/void-engine.js";
import { createFakeProbeFactory } from "./support/fake-probe.js";
import {
  adjacentAgreeingPairs,
  columnsUnderTheSameStretch,
  EDGE_NOISE_MM,
  halfMillimetreEdges,
  memberlessSpaces,
  type AdjacentAgreeingPair,
  type MeasuredSpace,
  type MergeGuard,
} from "./support/merge-oracle.js";

const OCCURRED_AT = "2026-10-16T12:00:00.000Z";
const MAX_COMMANDS = 12;
const SEQUENCE_RUNS = 300;
const ORDER_RUNS = 150;
const MIN_COLUMNS_CLEARED = 2;
const MAX_COLUMNS_CLEARED = 5;
const SEQUENCE_TIMEOUT_MS = 240_000;
/** Pinned so the run is the same everywhere: some seeds (e.g. -2113359913) reach the width-funding defect pinned in
 *  the known-defect block below. fast-check prints the seed and path of any failure, so a red run replays as it is. */
const PINNED_SEED = 20261016;
const probeAt = createFakeProbeFactory();

/** Rooms the generator accepts, each chosen for a shape the merge meets: the owner's L, its mirror, a U with a 100 mm
 *  leftover beside the hob, the odd-width U whose upper row is trimmed 1 mm (§4.2), and off-grid widths at all three
 *  approved heights. Filtered to those that compose, and the filter is asserted to keep every shape. */
const CANDIDATE_ROOMS: readonly RoomInput[] = [
  {
    shape: "L",
    wallAMm: 4100,
    wallBMm: 3300,
    heightMm: 2600,
    cornerDirection: "left",
  },
  {
    shape: "L",
    wallAMm: 4100,
    wallBMm: 3300,
    heightMm: 2600,
    cornerDirection: "right",
  },
  {
    shape: "L",
    wallAMm: 3801,
    wallBMm: 2215,
    heightMm: 2200,
    cornerDirection: "left",
  },
  {
    shape: "L",
    wallAMm: 5085,
    wallBMm: 3001,
    heightMm: 3900,
    cornerDirection: "right",
  },
  {
    shape: "L",
    wallAMm: 2415,
    wallBMm: 1600,
    heightMm: 2600,
    cornerDirection: "left",
  },
  {
    shape: "U",
    wallAMm: 3100,
    wallBMm: 1000,
    wallCMm: 1000,
    heightMm: 2600,
    cornerDirection: "left",
  },
  {
    shape: "U",
    wallAMm: 5985,
    wallBMm: 3000,
    wallCMm: 3000,
    heightMm: 2200,
    cornerDirection: "left",
  },
  {
    shape: "U",
    wallAMm: 4215,
    wallBMm: 1601,
    wallCMm: 2215,
    heightMm: 3900,
    cornerDirection: "left",
  },
  {
    shape: "U",
    wallAMm: 3385,
    wallBMm: 1000,
    wallCMm: 1600,
    heightMm: 2600,
    cornerDirection: "left",
  },
  { shape: "linear", wallAMm: 3001, heightMm: 2600 },
  { shape: "linear", wallAMm: 6000, heightMm: 2200 },
];

interface World {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly records: readonly PlacementRecord[];
  readonly columns: ReadonlyMap<string, Column>;
  readonly recordedColumns: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
}

type StepKind = "remove" | "clear-column" | "insert" | "resize";

interface Step {
  readonly kind: StepKind;
  readonly pick: number;
  readonly choice: number;
}

/** What the run reached, so a property that held only because it never got anywhere is red (ADR 0152 rule 5). */
interface Reach {
  commandsApplied: Record<StepKind, number>;
  spacesWiderThanACabinet: number;
  mergesObserved: number;
  excusedByGuard: Record<MergeGuard, number>;
  excusedPairs: Set<string>;
}

const COMPOSED_KITCHENS = CANDIDATE_ROOMS.flatMap((input) => {
  const accepted = validateRoomInput(input, APPROVED_ROOM_POLICY);
  if (!accepted.ok) return [];
  const result = generateKitchen({
    room: accepted.room,
    occurredAt: OCCURRED_AT,
    probeAt,
  });
  return result.ok ? [worldOf(result.design)] : [];
});

describe("the editor's merge over generated kitchens and command sequences (8U criteria 1, 2, 3, 3a, 4)", () => {
  it("draws from every candidate room, so every shape, hand and height is in the draw", () => {
    expect(COMPOSED_KITCHENS).toHaveLength(CANDIDATE_ROOMS.length);
  });

  it(
    "after every command leaves no unexcused adjacent agreeing pair, is a fixpoint, conserves length, stays on whole millimetres, and moves and reprices nothing",
    () => {
      const reach = emptyReach();
      fc.assert(
        fc.property(
          fc.nat({ max: COMPOSED_KITCHENS.length - 1 }),
          fc.array(stepArbitrary(), { minLength: 1, maxLength: MAX_COMMANDS }),
          (kitchenIndex, steps) => {
            runSequence(kitchenAt(kitchenIndex), steps, reach);
          },
        ),
        { numRuns: SEQUENCE_RUNS, seed: PINNED_SEED },
      );

      expect(reach.commandsApplied.remove).toBeGreaterThan(0);
      expect(reach.commandsApplied["clear-column"]).toBeGreaterThan(0);
      expect(reach.commandsApplied.insert).toBeGreaterThan(0);
      expect(reach.commandsApplied.resize).toBeGreaterThan(0);
      expect(reach.mergesObserved).toBeGreaterThan(0);
      expect(reach.spacesWiderThanACabinet).toBeGreaterThan(0);
      // The corner strips of every generated U (§4.1) are the one exception known in advance; both guards meet it.
      expect(reach.excusedByGuard["key taken"]).toBeGreaterThan(0);
      expect(reach.excusedByGuard["same stretch of wall"]).toBeGreaterThan(0);
    },
    SEQUENCE_TIMEOUT_MS,
  );

  // Criterion 5 over generated input: the bodies of the chosen columns removed in any interleaving, members of one
  // column split across the order, publish the same maps on both faces. The bridged chain this cannot reach is
  // hand-built in `merge-empty-columns.fixpoint-and-order.test.ts`.
  it(
    "publishes deep-equal maps whatever order the same columns' bodies are removed in",
    () => {
      fc.assert(
        fc.property(
          fc
            .nat({ max: COMPOSED_KITCHENS.length - 1 })
            .chain((kitchenIndex) => {
              const kitchen = kitchenAt(kitchenIndex);
              const keys = [
                ...new Set(
                  deletable(kitchen.records).map((record) => record.col),
                ),
              ];
              return fc
                .subarray(keys, {
                  minLength: Math.min(MIN_COLUMNS_CLEARED, keys.length),
                  maxLength: Math.min(MAX_COLUMNS_CLEARED, keys.length),
                })
                .chain((chosen) => {
                  const ids = deletable(kitchen.records)
                    .filter((record) => chosen.includes(record.col))
                    .map((record) => record.id);
                  return fc.tuple(
                    fc.constant(kitchen),
                    fc.constant(ids),
                    fc.shuffledSubarray(ids, {
                      minLength: ids.length,
                      maxLength: ids.length,
                    }),
                  );
                });
            }),
          ([kitchen, inOrder, shuffled]) => {
            const left = removedInOrder(kitchen, inOrder);
            const right = removedInOrder(kitchen, shuffled);

            expect(right.recordedColumns).toStrictEqual(left.recordedColumns);
            expect(right.columns).toStrictEqual(left.columns);
            expect(right.design.emptyColumns).toStrictEqual(
              left.design.emptyColumns,
            );
          },
        ),
        { numRuns: ORDER_RUNS, seed: PINNED_SEED },
      );
    },
    SEQUENCE_TIMEOUT_MS,
  );
});

describe("criterion 3a's check can fail (R6 non-vacuity; ADR 0093: no generated state holds an odd width)", () => {
  it("reports a stored 801 mm space by its half-millimetre edges", () => {
    const design = DesignSchema.parse({
      room: { shape: "L", widthMm: 4200, depthMm: 2400, heightMm: 2600 },
      presetId: null,
      placements: [],
      emptyColumns: [
        {
          wall: "A",
          alongMm: 2000,
          widthMm: 801,
          y0Mm: 0,
          topMm: 2600,
          depthMm: 580,
        },
      ],
      createdAt: OCCURRED_AT,
      updatedAt: OCCURRED_AT,
    });
    const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);

    const columns = deriveColumns(records, design, design.room);

    expect(
      halfMillimetreEdges({ records, maps: { published: columns } }),
    ).toEqual(["published A|2.00 1599.5-2400.5"]);
  });
});

// Known defect, pre-existing width funding; no wave owns it yet and it awaits a backlog row. Some seeds other than
// `PINNED_SEED` reach it. Flip the `it.fails` to `it` when taking the chip no longer overlaps the corner base.
describe("known defect: an offered chip grows a base beside the U's right corner into the corner base", () => {
  const CHIP_MM = 300;

  it("reaches it: the U offers a base at 4800-5084 and then a 300 mm chip for it", () => {
    const { inserted, base } = baseInsertedBesideTheRightCorner();

    expect(alongWallMm(base)).toEqual({ leftMm: 4800, rightMm: 5084 });
    expect(chipVerdict(inserted, base, CHIP_MM)).toBe("available");
  });

  it.fails(
    "keeps the base out of the corner base's footprint when the 300 mm chip is taken",
    () => {
      const { inserted, base } = baseInsertedBesideTheRightCorner();
      if (chipVerdict(inserted, base, CHIP_MM) !== "available") return;
      const result = chipTaken(inserted, base, CHIP_MM);
      if (!result.ok) return;

      const grown = reconciled(inserted, result);

      const grownBase = grown.records.find((record) => record.id === base.id);
      expect(grownBase && alongWallMm(grownBase).rightMm).toBeLessThanOrEqual(
        alongWallMm(rightCornerBaseOnWallA(grown.records)).leftMm,
      );
    },
  );
});

/** The generated U 5985 / 3000 / 3000 at 2200, with the offered base inserted into its floor opening `A|4.94`. That
 *  opening stood bare when the defect was found; generation fills it now (ADR 0167), so the editor's own removal
 *  opens it again before the base is offered. */
function baseInsertedBesideTheRightCorner(): {
  inserted: World;
  base: PlacementRecord;
} {
  const kitchen = withTheFillBesideTheRightCornerRemoved(
    composedKitchenOf({ shape: "U", widthMm: 5985 }),
  );
  const opening = kitchen.voids.find(
    (candidate) => candidate.col === "A|4.94" && candidate.y0 === 0,
  );
  if (!opening)
    throw new Error("the generated U has no floor opening at A|4.94");
  const target = { kind: "void" as const, id: opening.id };
  const offered = offersFor({
    records: kitchen.records,
    voids: kitchen.voids,
    columns: kitchen.recordedColumns,
    catalog: kitchen.catalog,
    target,
    cabinetDepthMm: cabinetDepthMmOf(kitchen.design),
  }).map((offer) => offer.buildId);
  if (!offered.includes("base-cabinet"))
    throw new Error("base-cabinet is not offered at A|4.94");
  const insertion = probeAt(cabinetDepthMmOf(kitchen.design)).use((probe) =>
    insertBody({
      design: kitchen.design,
      catalog: kitchen.catalog,
      columns: kitchen.recordedColumns,
      voids: kitchen.voids,
      target,
      buildId: "base-cabinet",
      probe,
      occurredAt: OCCURRED_AT,
    }),
  );
  if (!insertion.ok)
    throw new Error(`insert refused: ${insertion.reason.code}`);
  const inserted = reconciled(kitchen, insertion);
  const base = inserted.records.find((record) => record.col === "A|4.94");
  if (!base) throw new Error("the base was not filed under A|4.94");
  return { inserted, base };
}

function withTheFillBesideTheRightCornerRemoved(kitchen: World): World {
  const fill = kitchen.records.find((record) => record.col === "A|4.94");
  if (!fill) throw new Error("the generated U has no fill at A|4.94");
  const removal = removePlacement({
    design: kitchen.design,
    catalog: kitchen.catalog,
    target: { kind: "placement", id: fill.id },
    occurredAt: OCCURRED_AT,
  });
  if (!removal.ok) throw new Error(`remove refused: ${removal.reason.code}`);
  return reconciled(kitchen, removal);
}

function composedKitchenOf({
  shape,
  widthMm,
}: Pick<Design["room"], "shape" | "widthMm">): World {
  const kitchen = COMPOSED_KITCHENS.find(
    ({ design }) =>
      design.room.shape === shape && design.room.widthMm === widthMm,
  );
  if (!kitchen) throw new Error(`no composed ${shape} ${String(widthMm)}`);
  return kitchen;
}

function widthInput(world: World, record: PlacementRecord, probe: BodyProbe) {
  return {
    design: world.design,
    catalog: world.catalog,
    columns: world.recordedColumns,
    target: { kind: "placement" as const, id: record.id },
    probe,
  };
}

function chipVerdict(
  world: World,
  record: PlacementRecord,
  widthMm: number,
): string | undefined {
  return probeAt(cabinetDepthMmOf(world.design)).use(
    (probe) =>
      widthOptionsFor(widthInput(world, record, probe)).find(
        (option) => option.widthMm === widthMm,
      )?.verdict.status,
  );
}

function chipTaken(
  world: World,
  record: PlacementRecord,
  widthMm: number,
): CommandResult {
  return probeAt(cabinetDepthMmOf(world.design)).use((probe) =>
    setWidth({
      ...widthInput(world, record, probe),
      widthMm,
      occurredAt: OCCURRED_AT,
    }),
  );
}

function rightCornerBaseOnWallA(
  records: readonly PlacementRecord[],
): PlacementRecord {
  const corner = records.find(
    (record) =>
      record.wall === "A" && record.corner === "right" && record.frame.y0 === 0,
  );
  if (!corner) throw new Error("no right corner base on wall A");
  return corner;
}

function alongWallMm(record: PlacementRecord): {
  leftMm: number;
  rightMm: number;
} {
  const centreMm = record.frame.x * MILLIMETRES_PER_METRE;
  const halfWidthMm = (record.frame.w * MILLIMETRES_PER_METRE) / 2;
  return {
    leftMm: Math.round(centreMm - halfWidthMm),
    rightMm: Math.round(centreMm + halfWidthMm),
  };
}

function removedInOrder(start: World, ids: readonly string[]): World {
  const ignored = emptyReach();
  return ids.reduce((world, id) => {
    const result = removePlacement({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id },
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok)
      throw new Error(`removing ${id} refused: ${result.reason.code}`);
    return reconciledAndChecked(world, result, ignored);
  }, start);
}

function stepArbitrary(): fc.Arbitrary<Step> {
  return fc.record({
    // Weighted towards whole-column clears: two cleared neighbours are what the uncapped merge joins, and an even
    // draw of single removals reaches them too rarely to exercise criterion 1.
    kind: fc.constantFrom<StepKind>(
      "clear-column",
      "clear-column",
      "remove",
      "insert",
      "resize",
    ),
    pick: fc.nat(),
    choice: fc.nat(),
  });
}

function runSequence(start: World, steps: readonly Step[], reach: Reach): void {
  let world = start;
  let commands = 0;
  for (const step of steps) {
    for (const result of commandsFor(world, step)) {
      if (commands >= MAX_COMMANDS) return;
      if (!result.ok) continue;
      commands += 1;
      world = reconciledAndChecked(world, result, reach);
      reach.commandsApplied[step.kind] += 1;
    }
  }
}

/** One step's commands, built lazily against the world each previous one left. A refusal is a legal step. */
function* commandsFor(world: World, step: Step): Generator<CommandResult> {
  switch (step.kind) {
    case "remove":
      yield* removals(world, pickOne(deletable(world.records), step.pick));
      return;
    case "clear-column":
      yield* columnClear(world, step);
      return;
    case "insert":
      yield* insertion(world, step);
      return;
    case "resize":
      yield* resize(world, step);
      return;
  }
}

function* removals(
  world: World,
  record: PlacementRecord | undefined,
): Generator<CommandResult> {
  if (!record) return;
  yield removePlacement({
    design: world.design,
    catalog: world.catalog,
    target: { kind: "placement", id: record.id },
    occurredAt: OCCURRED_AT,
  });
}

/** Every deletable member of one occupied column, removed one command at a time against the state each left. */
function* columnClear(world: World, step: Step): Generator<CommandResult> {
  const keys = [
    ...new Set(deletable(world.records).map((record) => record.col)),
  ];
  const key = pickOne(keys, step.pick);
  if (!key) return;
  const ids = deletable(world.records)
    .filter((record) => record.col === key)
    .map((record) => record.id);
  let design = world.design;
  for (const id of ids) {
    const result = removePlacement({
      design,
      catalog: world.catalog,
      target: { kind: "placement", id },
      occurredAt: OCCURRED_AT,
    });
    yield result;
    if (result.ok) design = result.design;
  }
}

function* insertion(world: World, step: Step): Generator<CommandResult> {
  const opening = pickOne(world.voids, step.pick);
  if (!opening) return;
  const target = { kind: "void" as const, id: opening.id };
  const offers = offersFor({
    records: world.records,
    voids: world.voids,
    columns: world.recordedColumns,
    catalog: world.catalog,
    target,
    cabinetDepthMm: cabinetDepthMmOf(world.design),
  });
  const offer = pickOne(offers, step.choice);
  if (!offer) return;
  yield probeAt(cabinetDepthMmOf(world.design)).use((probe) =>
    insertBody({
      design: world.design,
      catalog: world.catalog,
      columns: world.recordedColumns,
      voids: world.voids,
      target,
      buildId: offer.buildId,
      probe,
      occurredAt: OCCURRED_AT,
    }),
  );
}

function* resize(world: World, step: Step): Generator<CommandResult> {
  const record = pickOne(
    world.records.filter((candidate) => !candidate.fixedWidth),
    step.pick,
  );
  if (!record) return;
  const target = { kind: "placement" as const, id: record.id };
  yield probeAt(cabinetDepthMmOf(world.design)).use((probe) => {
    const input = {
      design: world.design,
      catalog: world.catalog,
      columns: world.recordedColumns,
      target,
      probe,
    };
    const available = widthOptionsFor(input).filter(
      (option) => option.verdict.status === "available",
    );
    const chosen = pickOne(available, step.choice);
    return chosen
      ? setWidth({ ...input, widthMm: chosen.widthMm, occurredAt: OCCURRED_AT })
      : setWidth({
          ...input,
          widthMm: record.widthMm,
          occurredAt: OCCURRED_AT,
        });
  });
}

/** The store's own reconcile, then every criterion this file holds it to, on both faces. */
function reconciledAndChecked(
  before: World,
  result: CommandSuccess,
  reach: Reach,
): World {
  const after = reconciled(before, result);
  const faces = premergeFaces(before, result, after.records);

  expectNoCabinetMoved(result, after);
  for (const [face, premerge] of Object.entries(faces)) {
    const published =
      face === "recorded" ? after.recordedColumns : after.columns;
    expectTheHarnessIsTheFunnel(premerge, published, after.records);
    expectLengthConserved(premerge, published, after.records);
    expectMaximal(published, after.records, reach);
    expect(mergeAdjacentEmptyColumns(published, after.records)).toStrictEqual(
      published,
    );
    reach.mergesObserved += countMerges(premerge, published, after.records);
  }
  expect(
    halfMillimetreEdges({
      records: after.records,
      maps: { recorded: after.recordedColumns, published: after.columns },
    }),
  ).toEqual([]);
  reach.spacesWiderThanACabinet += memberlessSpaces(
    after.recordedColumns,
    after.records,
  ).filter(
    (space) =>
      space.rightMm - space.leftMm > CABINETRY_MAX_WIDTH_MM + EDGE_NOISE_MM,
  ).length;
  return after;
}

/** The store's own reconcile and nothing else. */
function reconciled(before: World, result: CommandSuccess): World {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(result.design));
  const reconciledResult = reconcileSuccessfulCommandResult({
    result,
    catalog,
    previousRecordedColumns: before.recordedColumns,
  });
  return {
    design: reconciledResult.design,
    catalog,
    records: reconciledResult.records,
    columns: reconciledResult.columns,
    recordedColumns: reconciledResult.recordedColumns,
    voids: reconciledResult.voids,
  };
}

/** The two maps the reconcile hands its merge, rebuilt from the exported funnel steps (clip free ground, split; the
 *  published face clipped at the wall's end first). `expectTheHarnessIsTheFunnel` proves the rebuild is the funnel. */
function premergeFaces(
  before: World,
  result: CommandSuccess,
  records: readonly PlacementRecord[],
): Record<"recorded" | "published", ReadonlyMap<string, ColumnExtent>> {
  const moved =
    result.effect.type === "body_inserted" ||
    result.effect.type === "body_resized" ||
    result.effect.type === "cabinet_depth_set"
      ? result.effect.columns
      : before.recordedColumns;
  const throughSplit = (columns: ReadonlyMap<string, ColumnExtent>) =>
    splitOversizedEmptyColumns(
      clipEmptyColumnsToFreeGround(columns, records),
      records,
    );
  return {
    recorded: throughSplit(moved),
    published: throughSplit(
      clipEmptyColumnsAtWallEnd(moved, records, result.design.room),
    ),
  };
}

function expectTheHarnessIsTheFunnel(
  premerge: ReadonlyMap<string, ColumnExtent>,
  published: ReadonlyMap<string, Column>,
  records: readonly PlacementRecord[],
): void {
  expect(
    withCurrentFullHeightMembers(
      mergeAdjacentEmptyColumns(premerge, records),
      records,
    ),
  ).toStrictEqual(published);
}

/** Criterion 4: the reconcile writes the frozen map and nothing else, so the placements are the command's own and
 *  the price is the command's own. */
function expectNoCabinetMoved(result: CommandSuccess, after: World): void {
  expect(after.design.placements).toStrictEqual(result.design.placements);
  expect(priceOf(after.design, after.catalog)).toStrictEqual(
    priceOf(result.design, after.catalog),
  );
}

function priceOf(design: Design, catalog: BodyCatalog) {
  return priceDesign({
    design,
    catalog,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK.version,
    selections: design.settings,
  });
}

/** Criterion 3: per wall and module row, the member-less wall is the same whole-millimetre union before and after,
 *  and each merged column's edges are the outermost edges of the columns it replaced, which tile it exactly. */
function expectLengthConserved(
  premerge: ReadonlyMap<string, ColumnExtent>,
  published: ReadonlyMap<string, ColumnExtent>,
  records: readonly PlacementRecord[],
): void {
  const before = memberlessSpaces(premerge, records);
  const after = memberlessSpaces(published, records);
  expect(unionByBand(after)).toEqual(unionByBand(before));
  for (const merged of after.filter((space) => !isOneOf(space, before))) {
    const replaced = before.filter(
      (space) =>
        space.wall === merged.wall &&
        space.leftMm >= merged.leftMm - EDGE_NOISE_MM &&
        space.rightMm <= merged.rightMm + EDGE_NOISE_MM &&
        rowOf(space) === rowOf(merged),
    );
    expect(
      tiles(replaced, merged),
      `${merged.key} is not tiled by the columns it replaced`,
    ).toBe(true);
  }
}

function isOneOf(
  space: MeasuredSpace,
  spaces: readonly MeasuredSpace[],
): boolean {
  return spaces.some(
    (candidate) =>
      candidate.key === space.key &&
      Math.abs(candidate.leftMm - space.leftMm) <= EDGE_NOISE_MM &&
      Math.abs(candidate.rightMm - space.rightMm) <= EDGE_NOISE_MM,
  );
}

function tiles(
  pieces: readonly MeasuredSpace[],
  whole: MeasuredSpace,
): boolean {
  let edgeMm = whole.leftMm;
  for (const piece of [...pieces].sort((a, b) => a.leftMm - b.leftMm)) {
    if (Math.abs(piece.leftMm - edgeMm) > EDGE_NOISE_MM) return false;
    edgeMm = piece.rightMm;
  }
  return (
    pieces.length >= 2 && Math.abs(edgeMm - whole.rightMm) <= EDGE_NOISE_MM
  );
}

/** The module row a floor stands on, so a band survives the merged envelope's narrower top. */
function rowOf(space: MeasuredSpace): number {
  const floorM = space.floorMm / MILLIMETRES_PER_METRE;
  const row = LEVELS.findIndex(([, endM]) => floorM < endM);
  return row === -1 ? LEVELS.length : row;
}

/** Each wall-and-row's member-less wall as merged whole-millimetre intervals. */
function unionByBand(
  spaces: readonly MeasuredSpace[],
): Record<string, string[]> {
  const bands: Record<string, [number, number][]> = {};
  for (const space of spaces) {
    const band = `${space.wall}@${String(rowOf(space))}`;
    (bands[band] ??= []).push([
      Math.round(space.leftMm),
      Math.round(space.rightMm),
    ]);
  }
  return Object.fromEntries(
    Object.entries(bands)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([band, intervals]) => [band, unionOf(intervals)]),
  );
}

function unionOf(intervals: [number, number][]): string[] {
  const merged: [number, number][] = [];
  for (const [left, right] of [...intervals].sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && left <= last[1]) last[1] = Math.max(last[1], right);
    else merged.push([left, right]);
  }
  return merged.map(([left, right]) => `${String(left)}-${String(right)}`);
}

/** Criterion 1: every surviving adjacent agreeing pair is declined by a named guard, and one the geometric or key
 *  test declines stands over a structural corner piece (§4.1, §4.2: anything else stops the slice). */
function expectMaximal(
  columns: ReadonlyMap<string, ColumnExtent>,
  records: readonly PlacementRecord[],
  reach: Reach,
): void {
  const pairs = adjacentAgreeingPairs(columns, records);
  expect(pairs.filter(({ guards }) => guards.length === 0).map(nameOf)).toEqual(
    [],
  );
  const overACorner = (pair: AdjacentAgreeingPair) =>
    columnsUnderTheSameStretch(pair, columns).some((column) =>
      records.some(
        (record) => record.col === column.key && record.corner !== undefined,
      ),
    );
  const outsideACorner = pairs.filter(
    (pair) => isExcusedOnlyByTheCornerGuards(pair) && !overACorner(pair),
  );
  expect(outsideACorner.map(nameOf)).toEqual([]);
  for (const pair of pairs) {
    const name = nameOf(pair);
    if (reach.excusedPairs.has(name)) continue;
    reach.excusedPairs.add(name);
    for (const guard of pair.guards) reach.excusedByGuard[guard] += 1;
  }
}

function isExcusedOnlyByTheCornerGuards(pair: AdjacentAgreeingPair): boolean {
  return pair.guards.every(
    (guard) => guard === "key taken" || guard === "same stretch of wall",
  );
}

function nameOf({ left, right, guards }: AdjacentAgreeingPair): string {
  return `${left.key} ${String(left.leftMm)}-${String(left.rightMm)} + ${right.key} ${String(right.leftMm)}-${String(right.rightMm)} [${guards.join(", ")}]`;
}

function countMerges(
  premerge: ReadonlyMap<string, ColumnExtent>,
  published: ReadonlyMap<string, ColumnExtent>,
  records: readonly PlacementRecord[],
): number {
  return (
    memberlessSpaces(premerge, records).length -
    memberlessSpaces(published, records).length
  );
}

function worldOf(design: Design): World {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  const records = derivePlacementRecords(design, catalog);
  const columns = deriveColumns(records, design, design.room);
  return {
    design,
    catalog,
    records,
    columns,
    recordedColumns: deriveRecordedColumns(
      records,
      design,
      toMetres(design.room.widthMm),
    ),
    voids: recomputeVoids(records, columns),
  };
}

function kitchenAt(index: number): World {
  const kitchen = COMPOSED_KITCHENS[index];
  if (!kitchen) throw new Error(`no composed kitchen at ${String(index)}`);
  return kitchen;
}

function deletable(records: readonly PlacementRecord[]): PlacementRecord[] {
  return records.filter((record) => record.canDelete);
}

function pickOne<T>(items: readonly T[], pick: number): T | undefined {
  return items.length === 0 ? undefined : items[pick % items.length];
}

function emptyReach(): Reach {
  return {
    commandsApplied: { remove: 0, "clear-column": 0, insert: 0, resize: 0 },
    spacesWiderThanACabinet: 0,
    mergesObserved: 0,
    excusedByGuard: {
      "half-millimetre centre": 0,
      "inverted envelope": 0,
      "stands in a placement": 0,
      "key taken": 0,
      "same stretch of wall": 0,
    },
    excusedPairs: new Set(),
  };
}
