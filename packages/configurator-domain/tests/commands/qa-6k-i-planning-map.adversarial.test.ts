// The arms of the axis split that `set-cabinet-depth.plans-against-the-frozen-extent.test.ts` cannot reach: on its
// fixture (ADR 0088's `A|2.00` with `p12` and `p18` deleted) only the `top` can differ between the stored extent and
// the derived column, so an implementation taking the floor or width from the derived column keeps it green. Here:
// the floor, the width (asserted as the fixture fact it is), the member-less arm non-vacuously, and the whole
// ordinary-delete population.
import { describe, expect, it } from "vitest";

import { alongWallShiftByColumnMm } from "../../src/along-wall-chain-shift.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import { cabinetDepthMmOf } from "../../src/design.js";
import type { Design, DesignRoom } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { frozenExtentsSlidAlongTheWall } from "../../src/frozen-map-at-cabinet-depth.js";
import { toMetres } from "../../src/millimetres.js";
import { alongWallCoordinate } from "../../src/module-grid.js";
import { wallLengthMm } from "../../src/queries/overflowing-placements.js";
import {
  deriveColumns,
  deriveColumnsOverFrozenExtents,
  deriveRecordedColumns,
  derivePlacementRecords,
  projectFrozenMap,
  withFrozenMap,
  MAX_EMPTY_COLUMN_WIDTH_MM,
  type Column,
  type PlacementRecord,
} from "../../src/void-engine.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-06T10:00:00.000Z";
const DEEP_MM = 700;
const DECLARED_MM = [600, DEEP_MM] as const;

/** The column ADR 0088 measures, and the one delete that takes its floor with it: `p1` is the
 *  dishwasher niche, the only member of `A|2.00` standing on the ground. */
const NICHE_COLUMN_KEY = "A|2.00";
const THE_BASE_BODY = "p1";
/** Where the shelves above it start, and so where the derived floor lands once the base is gone. */
const COLLAPSED_FLOOR_MM = 1500;
const STORED_FLOOR_MM = 0;
const STORED_TOP_MM = 2600;

/** `p5` and `p22`: the oven tower and the cabinet over it, the whole of `B|1.20`. The result carries a genuine
 *  member-less column, which the `p12` + `p18` fixture does not. */
const THE_WHOLE_OVEN_TOWER: readonly string[] = ["p5", "p22"];

/** The oven tower plus the whole of `A|2.00`. The result records a member-less column on each wall, which the
 *  corner-anchor assertion needs: wall A's only reachable move is the member-less rungs'. */
const BOTH_COLUMNS_EMPTIED: readonly string[] = [
  THE_BASE_BODY,
  "p12",
  "p18",
  ...THE_WHOLE_OVEN_TOWER,
];

/** The shipped kitchen after ordinary deletes with the frozen map the product would carry (`publishedColumns`
 *  returns it unchanged on a delete, ADR 0011 Gap D; `projectFrozenMap` writes the survivors out). */
function afterDeleting(placementIds: readonly string[]): Design {
  const catalog = buildKitchenLBodyCatalog(600);
  const beforeTheDeletes = deriveColumns(
    derivePlacementRecords(KITCHEN_L_DESIGN, catalog),
    {},
    KITCHEN_L_DESIGN.room,
  );
  const cleared: Design = {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.filter(
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

function recordsAt(
  design: Design,
  cabinetDepthMm: number,
): readonly PlacementRecord[] {
  return derivePlacementRecords(
    { ...design, settings: { ...design.settings, cabinetDepthMm } },
    buildKitchenLBodyCatalog(cabinetDepthMm),
  );
}

/** The pre-command design with only the along-wall coordinates the command moved its bodies to, read off the
 *  command's own output and paired by id. ADR 0090 decision 2's ladder is not re-derived here: a second author for it
 *  could agree with the command today and part from it later (ADR 0088 decision 2). */
function slidAsTheCommandDid(design: Design, cabinetDepthMm: number): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: createFakeProbeFactory(),
    occurredAt: OCCURRED_AT,
  });
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

/** The three operands the command's planning map is built from, derived once so the maps with and without the slide
 *  differ in that one place. Seat clearing is a no-op here, asserted below, not assumed. */
interface PlanningOperands {
  /** The bodies as they arrive at the new setting. */
  readonly records: readonly PlacementRecord[];
  /** The document's extents restored at the coordinates the run is leaving, as before ADR 0090 decision 2's slide. */
  readonly frozen: ReadonlyMap<string, Column>;
  /** The same extents on the coordinates the run is **arriving** at. */
  readonly slid: ReadonlyMap<string, Column>;
  readonly room: DesignRoom;
}

function planningOperandsOf(
  design: Design,
  cabinetDepthMm: number,
): PlanningOperands {
  const seated = design.placements.filter(
    (placement) => placement.body.seatDepthMm !== undefined,
  );
  if (seated.length > 0) {
    throw new Error(
      `this model does not clear seats; ${String(seated.length)} placement(s) carry one`,
    );
  }
  const previousCabinetDepthMm = cabinetDepthMmOf(design);
  const previousCatalog = buildKitchenLBodyCatalog(previousCabinetDepthMm);
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
  const slidDesign = slidAsTheCommandDid(design, cabinetDepthMm);

  const heldRecords = derivePlacementRecords(design, previousCatalog);
  const slidRecords = derivePlacementRecords(slidDesign, previousCatalog);
  const records = derivePlacementRecords(
    { ...slidDesign, settings: { ...slidDesign.settings, cabinetDepthMm } },
    catalog,
  );

  const frozen = deriveRecordedColumns(
    heldRecords,
    {
      emptyColumns: design.emptyColumns,
      columnExtents: design.columnExtents,
    },
    toMetres(design.room.widthMm),
  );

  return {
    records,
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
    room: design.room,
  };
}

/** The planning map the command builds from the same three operands in the same order: the frozen map at the
 *  coordinates the run is leaving, slid onto those it is arriving at, then merged with the arriving records. The slide
 *  is part of the model: omitting it keys restored extents where the run is leaving while `occupied` names where it
 *  arrives, so at 700 every wall-B extent reads as member-less and the cap and wall-end bound are evaluated at 600 mm
 *  coordinates (ADR 0090 Amendment B). `set-cabinet-depth.frozen-map.test.ts` covers the republish call site; this
 *  file reaches the planning one (ADR 0090 decision 6). */
function plannedMapOf(
  design: Design,
  cabinetDepthMm: number,
): ReadonlyMap<string, Column> {
  const operands = planningOperandsOf(design, cabinetDepthMm);
  return deriveColumnsOverFrozenExtents(
    operands.records,
    operands.slid,
    operands.room,
  );
}

/** The map before the slide existed, as a value: recorded extents at the leaving coordinates with no slide before
 *  the merge, so wall A's no-move can be asserted against it key for key. */
function plannedMapBeforeTheSlideOf(
  design: Design,
  cabinetDepthMm: number,
): ReadonlyMap<string, Column> {
  const operands = planningOperandsOf(design, cabinetDepthMm);
  return deriveColumnsOverFrozenExtents(
    operands.records,
    operands.frozen,
    operands.room,
  );
}

/** The records that arrive at the new setting: the key space `plannedMapOf`'s result is in, so "which of these
 *  columns holds a member" is asked there rather than at the coordinates the run left. */
function arrivingRecordsAt(
  design: Design,
  cabinetDepthMm: number,
): readonly PlacementRecord[] {
  return derivePlacementRecords(
    {
      ...slidAsTheCommandDid(design, cabinetDepthMm),
      settings: { ...design.settings, cabinetDepthMm },
    },
    buildKitchenLBodyCatalog(cabinetDepthMm),
  );
}

/** One wall's entries in one order, so two maps from the same records are compared whole: a regression rewriting
 *  `x`, `z` or `d` on wall A is caught by the same assertion as one that moved its key. */
function columnsOnWall(
  map: ReadonlyMap<string, Column>,
  wall: Column["wall"],
): readonly (readonly [string, Column])[] {
  return [...map]
    .filter(([, column]) => column.wall === wall)
    .sort(([left], [right]) => left.localeCompare(right));
}

function floorMm(column: Column | undefined): number {
  if (!column) throw new Error("no such column");
  return Math.round(
    Math.min(...column.regions.map(([floorM]) => floorM)) * 1000,
  );
}

describe("the floor the surviving members no longer imply", () => {
  // `deriveFreeSpans` reads `min(regions)` and `top` only, so a collapsed floor mis-plans the same hops a collapsed
  // top does; the `p12` + `p18` fixture keeps the base, so its floor never moves.
  it.each(DECLARED_MM)(
    "carries the stored floor into the planning map at %i mm, not the surviving members'",
    (cabinetDepthMm) => {
      const design = afterDeleting([THE_BASE_BODY]);

      // The precondition that makes the assertion below discriminating rather than decorative: the
      // derived column really has lost the ground, and the document really still records it.
      expect(
        floorMm(
          deriveColumns(recordsAt(design, cabinetDepthMm), {}, design.room).get(
            NICHE_COLUMN_KEY,
          ),
        ),
      ).toBe(COLLAPSED_FLOOR_MM);
      expect(
        (design.columnExtents ?? []).find(
          (extent) => extent.wall === "A" && extent.alongMm === 2000,
        ),
      ).toMatchObject({ y0Mm: STORED_FLOOR_MM, topMm: STORED_TOP_MM });

      const niche = plannedMapOf(design, cabinetDepthMm).get(NICHE_COLUMN_KEY);

      expect(floorMm(niche)).toBe(STORED_FLOOR_MM);
      expect(niche?.top).toBeCloseTo(toMetres(STORED_TOP_MM), 6);
    },
  );

  it.each(DECLARED_MM)(
    "still changes the kitchen's depth with the niche's ground gone, at %i mm",
    (cabinetDepthMm) => {
      const result = setCabinetDepth({
        design: afterDeleting([THE_BASE_BODY]),
        catalogAt: buildKitchenLBodyCatalog,
        cabinetDepthMm,
        probeAt: createFakeProbeFactory(),
        occurredAt: OCCURRED_AT,
      });

      expect(result.ok).toBe(true);
    },
  );
});

// The width arm is unfalsifiable on this fixture: `w` is a MIN over the members' frames, so it can part from the
// stored extent only in a column of mixed-width members, and the shipped kitchen has none. Pinned as the
// precondition, so a body seated beside a wider one turns this red and the owed coverage is flagged.
describe("the width arm, and why no assertion in this tree can move it", () => {
  it("has no column whose members differ in width, at either setting", () => {
    for (const cabinetDepthMm of DECLARED_MM) {
      const widthsByColumn = new Map<string, Set<number>>();
      for (const record of recordsAt(KITCHEN_L_DESIGN, cabinetDepthMm)) {
        const widths = widthsByColumn.get(record.col) ?? new Set<number>();
        widths.add(Math.round(record.frame.w * 1000));
        widthsByColumn.set(record.col, widths);
      }

      expect(widthsByColumn.size).toBeGreaterThan(0);
      for (const [key, widths] of widthsByColumn) {
        expect([...widths], `${key} at ${String(cabinetDepthMm)}`).toHaveLength(
          1,
        );
      }
    }
  });
});

// ADR 0090 decision 2, rung 1: wall A is anchored at the corner and does not move. `atDerivedDepth` rewrites `x` and
// `z` on every entry, so a wall-A entry re-keyed or re-seated there would leave the ladder's return value untouched.
// The baseline is the map before the slide, built as a value from the same operands; wall A must be identical across
// that difference and wall B must not, or the slide does nothing.
describe("wall A does not move, key for key", () => {
  it.each(DECLARED_MM)(
    "plans every wall-A column exactly as it did before the slide, at %i mm",
    (cabinetDepthMm) => {
      const design = afterDeleting(BOTH_COLUMNS_EMPTIED);
      const occupied = new Set(
        arrivingRecordsAt(design, cabinetDepthMm).map((record) => record.col),
      );

      const wallA = columnsOnWall(plannedMapOf(design, cabinetDepthMm), "A");

      // Non-vacuity on the rung that can move: an occupied wall-A extent takes rung 1 with zero delta whatever the
      // corner rule says; `A|2.00` emptied reaches rungs 3 and 4, where a chain shift is a real number.
      expect(wallA.length).toBeGreaterThan(0);
      expect(
        wallA.filter(([, column]) => !occupied.has(column.key)).length,
      ).toBeGreaterThan(0);
      expect(wallA).toStrictEqual(
        columnsOnWall(plannedMapBeforeTheSlideOf(design, cabinetDepthMm), "A"),
      );
    },
  );

  it("moves wall B at the deeper setting, so wall A's stillness is the anchor rather than a slide that does nothing", () => {
    const design = afterDeleting(BOTH_COLUMNS_EMPTIED);

    expect(columnsOnWall(plannedMapOf(design, DEEP_MM), "B")).not.toStrictEqual(
      columnsOnWall(plannedMapBeforeTheSlideOf(design, DEEP_MM), "B"),
    );
  });
});

describe("the member-less arm, on a document that carries one", () => {
  // ADR 0052's ceiling and ADR 0069's clip are `deriveColumns`' own tail; this starts from a document that really
  // carries a member-less column. The population is asserted before its members: a stale 600 mm extent satisfies the
  // cap and wall-end bound (`B|2.45` w700 gives a far edge of 2800), so a model dropping the slide would pass every
  // per-column assertion while iterating the wrong extents. The count is the document's own: a slide never creates or
  // destroys a member-less column.
  it.each(DECLARED_MM)(
    "plans exactly the columns the document records as member-less, at %i mm",
    (cabinetDepthMm) => {
      const design = afterDeleting(THE_WHOLE_OVEN_TOWER);
      const occupied = new Set(
        arrivingRecordsAt(design, cabinetDepthMm).map((record) => record.col),
      );

      const memberLess = [
        ...plannedMapOf(design, cabinetDepthMm).values(),
      ].filter((column) => !occupied.has(column.key));

      // Non-vacuity: a version of this assertion iterating over nothing would pass.
      expect(memberLess.length).toBeGreaterThan(0);
      expect(memberLess.length).toBe((design.emptyColumns ?? []).length);
    },
  );

  // Only ADR 0069's wall-end clip runs here (`clipEmptyColumnsAtWallEnd` is the first stage of `publishedFunnel`).
  // ADR 0052's 800 mm ceiling does not: the split is `apply-command-result.ts`'s and the refusal is
  // `validate-design.ts`'s, both upstream. So this asserts the path neither splits nor widens what it was handed;
  // the document's own compliance is asserted separately as the precondition.
  it.each(DECLARED_MM)(
    "carries every member-less column at its recorded width and inside its wall at %i mm",
    (cabinetDepthMm) => {
      const design = afterDeleting(THE_WHOLE_OVEN_TOWER);
      const occupied = new Set(
        arrivingRecordsAt(design, cabinetDepthMm).map((record) => record.col),
      );
      const recordedWidthsMm = (design.emptyColumns ?? [])
        .map((emptyColumn) => emptyColumn.widthMm)
        .sort((left, right) => left - right);

      const memberLess = [
        ...plannedMapOf(design, cabinetDepthMm).values(),
      ].filter((column) => !occupied.has(column.key));

      expect(memberLess.length).toBeGreaterThan(0);
      // The precondition, and where the 800 actually comes from: `validate-design.ts` refuses a
      // document recording a wider entry, so no map built from one can reach this file.
      for (const widthMm of recordedWidthsMm) {
        expect(widthMm).toBeLessThanOrEqual(MAX_EMPTY_COLUMN_WIDTH_MM);
      }
      expect(
        memberLess
          .map((column) => Math.round(column.w * 1000))
          .sort((left, right) => left - right),
      ).toStrictEqual(recordedWidthsMm);
      for (const column of memberLess) {
        const farEdgeMm =
          Math.round(alongWallCoordinate(column.wall, column) * 1000) +
          Math.round(column.w * 1000) / 2;
        expect(farEdgeMm, column.key).toBeLessThanOrEqual(
          wallLengthMm(column.wall, design.room),
        );
      }
    },
  );
});

describe("no ordinary delete leaves the shipped kitchen unable to change its depth", () => {
  // Every single delete and each pair, at both declared settings: a population the store's four-step sweep reaches
  // only a sample of.
  it("succeeds on every single and paired delete, at both settings", () => {
    const ids = KITCHEN_L_DESIGN.placements.map((placement) => placement.id);
    const deletions: string[][] = [[], ...ids.map((id) => [id])];
    for (let first = 0; first < ids.length; first += 1) {
      for (let second = first + 1; second < ids.length; second += 1) {
        deletions.push([ids[first] ?? "", ids[second] ?? ""]);
      }
    }
    const refusals: string[] = [];
    let commandsRun = 0;

    for (const deleted of deletions) {
      const design = afterDeleting(deleted);
      for (const cabinetDepthMm of DECLARED_MM) {
        const result = setCabinetDepth({
          design,
          catalogAt: buildKitchenLBodyCatalog,
          cabinetDepthMm,
          probeAt: createFakeProbeFactory(),
          occurredAt: OCCURRED_AT,
        });
        commandsRun += 1;
        if (!result.ok) {
          refusals.push(
            `${deleted.join("+") || "(none)"} @ ${String(cabinetDepthMm)} => ${result.reason.code}`,
          );
        }
      }
    }

    // Non-vacuity as the measured count: the shipped kitchen's 26 placements give 352 delete sets and 704 commands.
    expect(commandsRun).toBe(704);
    expect(refusals).toStrictEqual([]);
  });
});
