// The merge's block search is indexed: a length the guards decline costs constant time, not a pass over the map.
// The differential holds it to the direct search (`support/merge-by-shortening-one-at-a-time.ts`) on maps drawn to
// reach every guard; the timing case is the crafted legal document that made the direct search take seconds.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { DesignSchema, type Design, type DesignWall } from "../src/design.js";
import {
  MAX_EMPTY_COLUMNS,
  MAX_ROOM_DEPTH_MM,
  MAX_ROOM_WIDTH_MM,
} from "../src/design-bounds.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { toMetres } from "../src/millimetres.js";
import { alongWallPosition, deriveColumnKeyAt } from "../src/module-grid.js";
import {
  fatalDesignValidationIssues,
  validateDesignForCatalog,
} from "../src/validate-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  deriveRecordedColumns,
  mergeAdjacentEmptyColumns,
  type ColumnExtent,
  type PlacementRecord,
} from "../src/void-engine.js";
import {
  blockSearchTally,
  mergeByShorteningOneAtATime,
  resetBlockSearchTally,
  type BlockSearchEvent,
} from "./support/merge-by-shortening-one-at-a-time.js";
import { recordOver } from "./support/span-overlap-fixtures.js";

describe("the merge on the crafted document whose every block is declined", () => {
  /** R6: the direct search takes about 0.8 s (published) and 2.7 s (recorded) here; the indexed one, a few ms. */
  const WELL_UNDER_MS = 100;

  it("is a legal document: it parses and the validator raises no refusal", () => {
    const design = everyBlockDeclinedDesign();

    const fatal = fatalDesignValidationIssues(
      validateDesignForCatalog(design, KITCHEN_L_BODY_CATALOG),
    );

    expect(design.emptyColumns).toHaveLength(MAX_EMPTY_COLUMNS);
    expect(fatal).toEqual([]);
  });

  it("derives the recorded map well under 100 ms, merging nothing", () => {
    const design = everyBlockDeclinedDesign();
    const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
    const derive = () =>
      deriveRecordedColumns(
        records,
        { emptyColumns: design.emptyColumns },
        toMetres(design.room.widthMm),
      );

    expect(fastestOfThreeMs(derive)).toBeLessThan(WELL_UNDER_MS);
    expect(derive().size).toBe(MAX_EMPTY_COLUMNS);
  });

  it("derives the published map well under 100 ms", () => {
    const design = everyBlockDeclinedDesign();
    const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);

    const elapsedMs = fastestOfThreeMs(() =>
      deriveColumns(
        records,
        { emptyColumns: design.emptyColumns },
        design.room,
      ),
    );

    expect(elapsedMs).toBeLessThan(WELL_UNDER_MS);
  });
});

describe("the indexed block search against the direct one", () => {
  const EVERY_EVENT: readonly BlockSearchEvent[] = [
    "halfMillimetreCentre",
    "invertedEnvelope",
    "standsInABody",
    "keyTaken",
    "overAnotherColumn",
    "acceptedShorterThanWidest",
  ];

  it("merges a run whose envelope narrows under a body that stands in its shorter blocks", () => {
    const columns = new Map(
      [
        { leftMm: 1000, topMm: 2600 },
        { leftMm: 1200, topMm: 2600 },
        { leftMm: 1400, topMm: 2585 },
      ].map(({ leftMm, topMm }) => {
        const column = columnOver(
          "A",
          { leftMm, rightMm: leftMm + 200 },
          { floorMm: 0, heightMm: topMm, depthMm: 600 },
        );
        return [column.key, column] as const;
      }),
    );
    const bodyInTheTopTenMillimetres = bodyOver(
      "A",
      { leftMm: 1000, rightMm: 1400 },
      { floorMm: 2590, heightMm: 50 },
    );

    const merged = mergeAdjacentEmptyColumns(columns, [
      bodyInTheTopTenMillimetres,
    ]);

    expect([...merged.values()].map((column) => column.w)).toEqual([0.6]);
  });

  it("merges every drawn map to the same entries, in the same order, at every limit", () => {
    resetBlockSearchTally();

    fc.assert(
      fc.property(drawnWall(), (drawn) => {
        const { columns, records, widthLimitMm } = drawn;
        const indexed = mergeAdjacentEmptyColumns(
          columns,
          records,
          widthLimitMm,
        );
        const direct = mergeByShorteningOneAtATime(
          columns,
          records,
          widthLimitMm,
        );

        expect([...indexed.entries()]).toStrictEqual([...direct.entries()]);
        expect(indexed === columns).toBe(direct === columns);
      }),
      { numRuns: 3000 },
    );

    const tally = blockSearchTally();
    for (const event of EVERY_EVENT) {
      expect(tally.get(event) ?? 0, event).toBeGreaterThan(0);
    }
  });
});

/** Two walls of 10 mm spaces, one entry per key a document may carry, alternately at 0-1 and 2-3 mm: neighbours
 *  agree within 20 mm, and any two of them have an inverted envelope, so every block from every start declines. */
function everyBlockDeclinedDesign(): Design {
  const SPACE_WIDTH_MM = 10;
  const WALL_A_ENTRIES = 1000;
  const emptyColumns = Array.from({ length: MAX_EMPTY_COLUMNS }, (_, index) => {
    const onWallA = index < WALL_A_ENTRIES;
    const ordinal = (onWallA ? index : index - WALL_A_ENTRIES) + 1;
    const floorMm = ordinal % 2 === 0 ? 2 : 0;
    return {
      wall: onWallA ? ("A" as const) : ("B" as const),
      alongMm: ordinal * SPACE_WIDTH_MM,
      widthMm: SPACE_WIDTH_MM,
      y0Mm: floorMm,
      topMm: floorMm + 1,
      depthMm: 300,
    };
  });
  return DesignSchema.parse({
    ...KITCHEN_L_DESIGN,
    room: {
      ...KITCHEN_L_DESIGN.room,
      widthMm: MAX_ROOM_WIDTH_MM,
      depthMm: MAX_ROOM_DEPTH_MM,
    },
    placements: [],
    columnExtents: [],
    emptyColumns,
  });
}

/** The fastest of three runs, so one garbage collection or a cold JIT cannot decide a timing verdict. */
function fastestOfThreeMs(run: () => unknown): number {
  const runs = [0, 1, 2].map(() => {
    const startedAt = performance.now();
    run();
    return performance.now() - startedAt;
  });
  return Math.min(...runs);
}

interface DrawnMap {
  readonly columns: ReadonlyMap<string, ColumnExtent>;
  readonly records: readonly PlacementRecord[];
  readonly widthLimitMm: number | undefined;
}

/** A space as drawn: its width before the parity fix-up, the gap before it, its row, and whether a body fills it. */
interface DrawnSpace {
  readonly widthMm: number;
  readonly gapMm: number;
  readonly floorMm: number;
  readonly heightMm: number;
  readonly depthMm: number;
  readonly isOccupied: boolean;
}

/** A body or an upper-row column over the run, by the spaces it starts and ends at and its offsets from them. */
interface DrawnOverlay {
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly leftOffsetMm: number;
  readonly rightOffsetMm: number;
  readonly floorMm: number;
  readonly heightMm: number;
}

/** One wall's row: values within 20 mm of their neighbours and not, so chains agree, drift and break. */
interface RowProfile {
  readonly floorsMm: readonly number[];
  readonly topsAboveFloorMm: readonly number[];
  readonly topsMm: readonly number[];
  readonly depthsMm: readonly number[];
}

/** Slivers whose envelopes invert once a 1 or 2 mm floor step meets a 1 or 2 mm height. */
const SLIVER_ROW: RowProfile = {
  floorsMm: [0, 1, 2],
  topsAboveFloorMm: [1, 2],
  topsMm: [],
  depthsMm: [300, 301],
};

/** Full-height spaces whose tops and depths step by 2, 19 and 21 mm: the tolerance's both sides. */
const FULL_ROW: RowProfile = {
  floorsMm: [0, 2, 21],
  topsAboveFloorMm: [],
  topsMm: [2600, 2598, 2581, 2579],
  depthsMm: [580, 600, 601, 620],
};

/** Widths that give odd totals (half-millimetre centres) and spans past 800. */
const DRAWN_WIDTHS_MM = [1, 2, 3, 10, 11, 20, 200, 300, 401, 600, 801];

/** Near each edge, a bucket away and just past one: `isSameStretchOfWall` and `isKeyTaken` on both sides. A left
 *  edge before a space's sorts before it and leaves the run behind it whole, so those are drawn more often. */
const DRAWN_LEFT_OFFSETS_MM = [-11, -10, -10, -1, -1, 0, 1, 10, 11];
const DRAWN_RIGHT_OFFSETS_MM = [-11, -10, -1, 0, 1, 10, 11];

/** Bodies standing in a sliver, in the whole run, in its top few millimetres only (a narrowing envelope passes
 *  under it), or in an upper row. */
const OVERLAY_FLOORS_MM = [0, 1, 855, 1500, 2585];
const OVERLAY_HEIGHTS_MM = [1, 8, 50, 860];

function drawnWall(): fc.Arbitrary<DrawnMap> {
  const overlay = fc.record({
    fromIndex: fc.nat({ max: 13 }),
    toIndex: fc.nat({ max: 13 }),
    leftOffsetMm: fc.constantFrom(...DRAWN_LEFT_OFFSETS_MM),
    rightOffsetMm: fc.constantFrom(...DRAWN_RIGHT_OFFSETS_MM),
    floorMm: fc.constantFrom(...OVERLAY_FLOORS_MM),
    heightMm: fc.constantFrom(...OVERLAY_HEIGHTS_MM),
  });
  return fc
    .constantFrom(SLIVER_ROW, FULL_ROW)
    .chain((row) =>
      fc.record({
        wall: fc.constantFrom<DesignWall>("A", "B"),
        startMm: fc.integer({ min: 0, max: 80 }).map((halves) => halves / 2),
        spaces: fc.array(spaceIn(row), { minLength: 2, maxLength: 14 }),
        bodies: fc.array(overlay, { maxLength: 2 }),
        upperColumns: fc.array(overlay, { maxLength: 3 }),
        widthLimitMm: fc.constantFrom(undefined, 800, 600),
      }),
    )
    .map(buildDrawnMap);
}

function spaceIn(row: RowProfile): fc.Arbitrary<DrawnSpace> {
  return fc
    .record({
      widthMm: fc.constantFrom(...DRAWN_WIDTHS_MM),
      gapMm: fc.constantFrom(0, 0, 0, 0, 0, 0, 1, 10),
      floorMm: fc.constantFrom(...row.floorsMm),
      heightMm: fc.constantFrom(...row.topsAboveFloorMm, 0),
      topMm: fc.constantFrom(...row.topsMm, 0),
      depthMm: fc.constantFrom(...row.depthsMm),
      isOccupied: fc.integer({ min: 0, max: 9 }).map((roll) => roll === 0),
    })
    .map(({ topMm, ...space }) => ({
      ...space,
      heightMm: topMm > 0 ? topMm - space.floorMm : Math.max(1, space.heightMm),
    }));
}

interface LaidSpace {
  readonly leftMm: number;
  readonly rightMm: number;
  readonly space: DrawnSpace;
}

interface DrawnWall {
  readonly wall: DesignWall;
  readonly startMm: number;
  readonly spaces: readonly DrawnSpace[];
  readonly bodies: readonly DrawnOverlay[];
  readonly upperColumns: readonly DrawnOverlay[];
  readonly widthLimitMm: number | undefined;
}

function buildDrawnMap(drawn: DrawnWall): DrawnMap {
  const laid = laidOut(drawn.startMm, drawn.spaces);
  const columns = new Map<string, ColumnExtent>();
  const records: PlacementRecord[] = [];
  for (const { leftMm, rightMm, space } of laid) {
    const column = columnOver(drawn.wall, { leftMm, rightMm }, space);
    if (columns.has(column.key)) continue;
    columns.set(column.key, column);
    if (space.isOccupied) records.push(bodyIn(drawn.wall, column, space));
  }
  for (const body of drawn.bodies) {
    const stretch = overlayStretch(laid, body);
    if (stretch) records.push(bodyOver(drawn.wall, stretch, body));
  }
  for (const upper of drawn.upperColumns) {
    const stretch = overlayStretch(laid, upper);
    if (!stretch) continue;
    const column = columnOver(drawn.wall, stretch, upper);
    if (!columns.has(column.key)) columns.set(column.key, column);
  }
  return { columns, records, widthLimitMm: drawn.widthLimitMm };
}

/** Abutting unless a gap is drawn. A width is bumped by 1 mm where its parity would put the centre off the whole
 *  millimetre, so every space is one the merge measures, and odd widths chain on half-millimetre edges. */
function laidOut(
  startMm: number,
  spaces: readonly DrawnSpace[],
): readonly LaidSpace[] {
  let edgeMm = startMm;
  return spaces.map((space) => {
    const leftMm = edgeMm + space.gapMm;
    const isOddWidthNeeded = !Number.isInteger(leftMm);
    const isOddWidth = space.widthMm % 2 === 1;
    const widthMm =
      isOddWidth === isOddWidthNeeded ? space.widthMm : space.widthMm + 1;
    edgeMm = leftMm + widthMm;
    return { leftMm, rightMm: edgeMm, space };
  });
}

interface StretchMm {
  readonly leftMm: number;
  readonly rightMm: number;
}

/** The overlay's span over the laid run, its right edge nudged by 1 mm when needed to centre it on a whole mm. */
function overlayStretch(
  laid: readonly LaidSpace[],
  overlay: DrawnOverlay,
): StretchMm | undefined {
  const from = laid[Math.min(overlay.fromIndex, overlay.toIndex) % laid.length];
  const to = laid[Math.max(overlay.fromIndex, overlay.toIndex) % laid.length];
  if (!from || !to) return undefined;
  const leftMm = from.leftMm + overlay.leftOffsetMm;
  const drawnRightMm = to.rightMm + overlay.rightOffsetMm;
  const rightMm = Number.isInteger((leftMm + drawnRightMm) / 2)
    ? drawnRightMm
    : drawnRightMm + 1;
  return rightMm > leftMm ? { leftMm, rightMm } : undefined;
}

interface RowMm {
  readonly floorMm: number;
  readonly heightMm: number;
  readonly depthMm?: number;
}

const UPPER_ROW_DEPTH_MM = 330;

/** Off the wall by its own half-depth, as a frozen extent is; a distinct depth source per key, so the template a
 *  merge copies is visible in its output. */
function columnOver(
  wall: DesignWall,
  { leftMm, rightMm }: StretchMm,
  row: RowMm,
): ColumnExtent {
  const centreM = toMetres((leftMm + rightMm) / 2);
  const depthM = toMetres(row.depthMm ?? UPPER_ROW_DEPTH_MM);
  const floorM = toMetres(row.floorMm);
  const topM = toMetres(row.floorMm + row.heightMm);
  const key = deriveColumnKeyAt(wall, centreM);
  return {
    key,
    wall,
    ry: 0,
    x: depthM / 2,
    z: depthM / 2,
    ...alongWallPosition(wall, centreM),
    w: toMetres(rightMm - leftMm),
    d: depthM,
    depthFromBuildId: `source-${key}`,
    top: topM,
    regions: [[floorM, topM]],
  };
}

function bodyIn(
  wall: DesignWall,
  column: ColumnExtent,
  row: RowMm,
): PlacementRecord {
  const centreMm = (wall === "A" ? column.x : column.z) * 1000;
  const halfWidthMm = (column.w * 1000) / 2;
  return recordOver(
    wall,
    { startMm: centreMm - halfWidthMm, endMm: centreMm + halfWidthMm },
    {
      col: column.key,
      y0M: toMetres(row.floorMm),
      heightM: toMetres(row.heightMm),
    },
  );
}

function bodyOver(
  wall: DesignWall,
  { leftMm, rightMm }: StretchMm,
  row: RowMm,
): PlacementRecord {
  return recordOver(
    wall,
    { startMm: leftMm, endMm: rightMm },
    { y0M: toMetres(row.floorMm), heightM: toMetres(row.heightMm) },
  );
}
