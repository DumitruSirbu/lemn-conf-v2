// ADR 0090 decision 4b: no published map may put free space where a body stands. The fourth stage of the
// clip → split → merge funnel, run ahead of the split: a pass that only removes cannot hand the split
// more work than it already had.
//
// Dropped whole, never cut back: a partial cut invents an along-wall coordinate, and an interior overlap
// would split one recorded space into two the customer never made. When a cabinet stands on the ground the
// space is gone.
//
// It is a guard with no reachable population: every extent now slides, so none is left under its
// neighbours (see ADR 0090 Amendment A). It remains as the structural statement that no published map
// places free space on occupied ground, held for a producer that does not yet exist, as
// `splitOversizedEmptyColumns` is.
//
// The two-axis test is `findWallOverlaps`', deliberately: a member-less column in the wall band and a base
// cabinet at the same along-wall coordinate share no ground, and abutting is not overlapping (two spaces
// that meet at a coordinate merge). Matching the validator's predicate makes this pass and
// `EMPTY_COLUMN_OVERLAPS_PLACEMENT` answer one question, so the store never publishes a document the write
// seam refuses.
import { toExactMillimetres } from "./millimetres.js";
import { alongWallCoordinate } from "./module-grid.js";
// Types only: `void-engine.ts` imports this module for its value, so a value import back would close a
// runtime cycle.
import type { ColumnExtent, PlacementRecord } from "./void-engine.js";

/** Every member-less column that stands on ground a placement occupies, removed from the map. Generic in
 *  the column shape because this pass only deletes, so a map of `Column`s comes back as `Column`s and the
 *  funnel need not re-answer `hasFullHeightUnder`. "Member-less" is the split's predicate: no record is
 *  filed under the key at any level. An occupied column is never dropped. */
export function clipEmptyColumnsToFreeGround<TColumn extends ColumnExtent>(
  columns: ReadonlyMap<string, TColumn>,
  records: readonly PlacementRecord[],
): ReadonlyMap<string, TColumn> {
  const occupied = new Set(records.map((record) => record.col));
  const standingOnABody = [...columns.values()].filter(
    (column) =>
      !occupied.has(column.key) && overlapsAnyPlacement(column, records),
  );
  if (standingOnABody.length === 0) return columns;

  const free = new Map<string, TColumn>(columns);
  for (const column of standingOnABody) free.delete(column.key);
  return free;
}

/** The same wall, along-wall interval and vertical interval: all three, since any two are places that never
 *  meet. Both walls originate at the room's corner and walk their own axis (§2), so the same coordinate on
 *  wall A and wall B is two different places. */
function overlapsAnyPlacement(
  column: ColumnExtent,
  records: readonly PlacementRecord[],
): boolean {
  const space = spanOfColumn(column);
  if (!space) return false;
  return records.some((record) => {
    if (record.wall !== column.wall) return false;
    const body = spanOfRecord(record);
    return body !== undefined && overlap(space, body);
  });
}

/** One run on one wall, in millimetres, the shape and units `validate-design.ts`'s sweep judges, so this
 *  pass and `EMPTY_COLUMN_OVERLAPS_PLACEMENT` cannot answer differently. In metres `1.2 + 0.6 / 2` and
 *  `0.74 + 0.32 / 2` land 1.11e-16 apart where a cleared oven-tower column meets the corner return, so
 *  abutting runs would read as an overlap and a visible space would be dropped; every document coordinate is
 *  a whole millimetre and every catalogue width even, so in millimetres abutting subtracts to exactly zero. */
interface WallSpan {
  readonly alongStartMm: number;
  readonly alongEndMm: number;
  readonly floorMm: number;
  readonly topMm: number;
}

/** §4 reads a column's floor and its top and nothing between, which is what `toEmptyColumn` persists and
 *  `validateDesignForCatalog` sweeps. Nothing, not an invented interval, for a column off the millimetre
 *  grid or with no region: no document can carry one, and that is the safe answer for a guard whose only
 *  action is to remove (as `reachesPastWallEnd`). */
function spanOfColumn(column: ColumnExtent): WallSpan | undefined {
  const floorsM = column.regions.map(([floorM]) => floorM);
  if (floorsM.length === 0) return undefined;
  return toSpan({
    centreM: alongWallCoordinate(column.wall, column),
    widthM: column.w,
    floorM: Math.min(...floorsM),
    topM: column.top,
  });
}

function spanOfRecord(record: PlacementRecord): WallSpan | undefined {
  const { frame } = record;
  return toSpan({
    centreM: alongWallCoordinate(record.wall, frame),
    widthM: frame.w,
    floorM: frame.y0,
    topM: frame.y0 + frame.h,
  });
}

/** A run as its four measurements, before either side of the comparison knows which it is. */
interface RunMeasurements {
  readonly centreM: number;
  readonly widthM: number;
  readonly floorM: number;
  readonly topM: number;
}

/** §12: `alongMm` is the centre of a run on a placement and an empty column alike, so both reach this
 *  comparison as the same kind of interval (`toPlacementSpan` and `toStoredSpan` in `validate-design.ts`
 *  are one conversion earlier). */
function toSpan(run: RunMeasurements): WallSpan | undefined {
  const centreMm = toExactMillimetres(run.centreM);
  const widthMm = toExactMillimetres(run.widthM);
  const floorMm = toExactMillimetres(run.floorM);
  const topMm = toExactMillimetres(run.topM);
  if (
    centreMm === undefined ||
    widthMm === undefined ||
    floorMm === undefined ||
    topMm === undefined
  ) {
    return undefined;
  }
  return {
    alongStartMm: centreMm - widthMm / 2,
    alongEndMm: centreMm + widthMm / 2,
    floorMm,
    topMm,
  };
}

/** Strictly positive on both axes, never `>=`: two runs that merely touch share no ground, and ADR 0046
 *  merges two spaces that meet at a coordinate. A member-less column in the wall band and a base cabinet at
 *  the same along-wall coordinate share nothing, so the vertical question is part of the overlap. The same
 *  comparisons `findWallOverlaps` makes. */
function overlap(first: WallSpan, second: WallSpan): boolean {
  return (
    Math.min(first.alongEndMm, second.alongEndMm) -
      Math.max(first.alongStartMm, second.alongStartMm) >
      0 &&
    Math.min(first.topMm, second.topMm) -
      Math.max(first.floorMm, second.floorMm) >
      0
  );
}
