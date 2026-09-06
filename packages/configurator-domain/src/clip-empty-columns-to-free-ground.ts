// ADR 0090 decision 4b: **no published map may put free space where a body stands.**
//
// The fourth stage of the clip → split → merge funnel, and it joins that family ahead of the split
// for the funnel's own recorded reason — a pass that only ever removes cannot hand the split more
// work than it already had, so running it first is at worst a no-op for everything after it.
//
// **Dropped whole, never cut back.** A partial cut invents an along-wall coordinate exactly as
// surely as a chain default does, and an interior overlap would have to split one recorded space
// into two the customer never made. ADR 0055 decision 1 permits the loss — every body adapts and
// nothing is left behind, and the document need not round-trip — and ADR 0080 decision 2's
// *"following, not disappearing"* is not violated, because when a cabinet is standing on that
// ground the space genuinely is gone.
//
// **It is a guard, and it has no reachable population.** It was written for what ADR 0090's struck
// decision 4a produced — a sourceless extent left on its own coordinate while the run slid out from
// under it — and Amendment A overturned that rule: every extent now slides, on the last rung of the
// ladder if nothing better is known, so it lands beside its neighbours rather than under them. What
// remains is the structural statement that no published map places free space on occupied ground,
// held for a producer that does not yet exist — the same defence-in-depth stance
// `splitOversizedEmptyColumns` is already documented as taking. That it drops nothing is asserted,
// and so is the fact that it still can.
//
// **The two-axis test is `findWallOverlaps`', deliberately.** A member-less column in the wall band
// and a base cabinet at the same along-wall coordinate share no ground at all, so the vertical
// question is as much part of the overlap as the horizontal one — and abutting is not overlapping,
// because ADR 0046 merges two spaces that meet at a coordinate. Matching the validator's own
// predicate is what makes this pass and `EMPTY_COLUMN_OVERLAPS_PLACEMENT` answer the same question,
// which is the whole point: the store never publishes a document the write seam refuses.
import { toExactMillimetres } from "./millimetres.js";
import { alongWallCoordinate } from "./module-grid.js";
// Types only, for the reason `clip-empty-columns-at-wall-end.ts`'s head gives: `void-engine.ts`
// imports this module for its value, so a value imported back would close a runtime cycle.
import type { ColumnExtent, PlacementRecord } from "./void-engine.js";

/** Every member-less column that stands on ground a placement occupies, removed from the map.
 *
 *  Generic in the column shape because this pass only ever **deletes**: it writes no extent of its
 *  own, so a map of `Column`s comes back as a map of `Column`s and the store's funnel does not have
 *  to re-answer `hasFullHeightUnder` for the privilege of running it.
 *
 *  "Member-less" is the split's and the wall-end clip's own predicate: **no record is filed under
 *  this key, at any level**. An occupied column is never dropped — the bodies standing in it are
 *  what its extent is for, and `extentContains` is what judges those. */
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

/** The same wall, the same along-wall interval and the same vertical one — all three, because any
 *  two of them are places that never meet. Both walls originate at the room's corner and walk their
 *  own axis (§2), so the same coordinate on wall A and on wall B are two different places. */
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

/** One run on one wall, **in millimetres** — the same shape and the same units
 *  `validate-design.ts`'s own sweep judges, so this pass and `EMPTY_COLUMN_OVERLAPS_PLACEMENT`
 *  cannot answer differently about one document.
 *
 *  Millimetres are not a convenience here. In metres, `1.2 + 0.6 / 2` and `0.74 + 0.32 / 2` land
 *  1.11e-16 apart at the coordinate where a cleared oven-tower column meets the corner return
 *  beside it — abutting runs that read as an overlap, and this pass would drop a space the customer
 *  can see. Every coordinate a document carries is a whole millimetre and every catalogue width is
 *  an even one, so a centre and a half-width are exact in this unit and abutting subtracts to
 *  exactly zero. */
interface WallSpan {
  readonly alongStartMm: number;
  readonly alongEndMm: number;
  readonly floorMm: number;
  readonly topMm: number;
}

/** §4 reads a column's floor and its top and nothing between them, which is also what
 *  `toEmptyColumn` persists — so the interval this pass judges is the one the document carries and
 *  the one `validateDesignForCatalog` sweeps.
 *
 *  Nothing, rather than an invented interval, for a column that reads off the millimetre grid or has
 *  no region to stand on: it is not a column any document could carry, so this pass has nothing to
 *  say about it either — the same stance `reachesPastWallEnd` takes, and the safe one for a guard
 *  whose only action is to remove. */
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

/** §12: `alongMm` is the centre of a run, on a placement and on an empty column alike, so both
 *  reach this comparison as the same kind of interval — `toPlacementSpan` and `toStoredSpan` in
 *  `validate-design.ts`, one conversion earlier. */
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

/** Strictly positive on **both** axes, never `>=`: two runs that merely touch share no ground, and
 *  ADR 0046 merges two spaces that meet at a coordinate — refusing that input would make the merge
 *  unrepresentable. A member-less column in the wall band and a base cabinet at the same along-wall
 *  coordinate share nothing at all, which is why the vertical question is as much part of the
 *  overlap as the horizontal one. The same pair of comparisons `findWallOverlaps` makes. */
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
