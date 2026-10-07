// ADR 0052 over a frozen map: a member-less column wider than `MAX_EMPTY_COLUMN_WIDTH_MM` becomes the
// columns the ceiling allows. The merge's dual (`mergeAdjacentEmptyColumns` joins empty columns whose total
// fits under the ceiling, this cuts those that do not), so "no empty column is wider than 800 mm" holds
// after every command rather than being a rule each command remembers.
//
// A customer's own delete cannot produce such a column: `deriveColumns` takes a column's width as
// `Math.min` over its members' frames, the widest deletable body is 800 mm (`base-corner-x-900` is
// `canDelete: false`), and both seams already hold a stored entry to the ceiling. It stays as defence in
// depth: a resize splits the space it frees (`apply-column-moves.ts`) and an insert its remainder
// (`split-column.ts`), each by a direction only that command knows, and this is the one place that sees
// every map on its way to being published, so a future producer is a bug and not an unsaveable document.
//
// It declines, never refuses, like the merge: its callers run after a command has succeeded and have no
// rejection channel. A column it cannot split safely is left as it was.
import { toExactMillimetres, toMetres } from "./millimetres.js";
import {
  alongWallPosition,
  deriveColumnKeyAt,
  MAX_EMPTY_COLUMN_WIDTH_MM,
} from "./module-grid.js";
import {
  landsOnWholeMillimetres,
  splitEmptySpanAtCap,
} from "./split-empty-span.js";
// Types only, which keeps this module a leaf: `void-engine.ts` imports it for its value, so a value import
// back would close a runtime cycle (see `merge-empty-columns.ts`).
import type { ColumnExtent, PlacementRecord } from "./void-engine.js";

/** Every member-less column of the map held to ADR 0052's ceiling, other keys untouched. "Member-less" is
 *  the merge's predicate (ADR 0046): no record is filed under the key at any level; an occupied column is
 *  never split. Cut left to right from the column's own left edge: a map has no "near" side, only the
 *  command that produced it does, and a resize or insert cuts its own span before this sees it. The input
 *  map is returned by identity when nothing is oversized. `hasFullHeightUnder` is not answered here, as the
 *  merge does not: the caller runs `withCurrentFullHeightMembers` over the result. */
export function splitOversizedEmptyColumns(
  columns: ReadonlyMap<string, ColumnExtent>,
  records: readonly PlacementRecord[],
): ReadonlyMap<string, ColumnExtent> {
  const occupied = new Set(records.map((record) => record.col));
  const oversized = [...columns.values()].filter(
    (column) => !occupied.has(column.key) && isWiderThanCap(column),
  );
  if (oversized.length === 0) return columns;

  const split = new Map<string, ColumnExtent>(columns);
  for (const column of oversized) {
    const pieces = planPieces(column, split);
    if (!pieces) continue;
    // Vacated before any piece is written: the leftmost piece keys back onto the original key whenever the
    // two centres share a 10 mm bucket (the merge's rule, `mergeAdjacentEmptyColumns`).
    split.delete(column.key);
    for (const piece of pieces) split.set(piece.key, piece);
  }
  return split;
}

function isWiderThanCap(column: ColumnExtent): boolean {
  const widthMm = toExactMillimetres(column.w);
  return widthMm !== undefined && widthMm > MAX_EMPTY_COLUMN_WIDTH_MM;
}

/** The columns this one becomes, or nothing. A column off the millimetre grid is left as is (no document
 *  can carry one), as is a cut whose pieces would land between two millimetres (it needs an odd width,
 *  unreachable from §7's even catalogue widths), and one whose piece lands on a key another column holds,
 *  which would write a document its own validator refuses with `EMPTY_COLUMN_KEY_COLLIDES_WITH_*` (see
 *  ADR 0052). Declined whole, not per piece: half a split is a map whose columns no longer tile the space
 *  they came from. */
function planPieces(
  column: ColumnExtent,
  columns: ReadonlyMap<string, ColumnExtent>,
): readonly ColumnExtent[] | undefined {
  const centreMm = toExactMillimetres(alongWallCentre(column));
  const widthMm = toExactMillimetres(column.w);
  if (centreMm === undefined || widthMm === undefined) return undefined;

  const leftEdgeMm = centreMm - widthMm / 2;
  const pieces = splitEmptySpanAtCap(leftEdgeMm, leftEdgeMm + widthMm);
  if (!landsOnWholeMillimetres(pieces)) return undefined;

  const extents = pieces.map((piece) =>
    toExtent(column, piece.centreMm, piece.widthMm),
  );
  const keys = new Set(extents.map((extent) => extent.key));
  if (keys.size !== extents.length) return undefined;
  const collides = extents.some(
    (extent) => extent.key !== column.key && columns.has(extent.key),
  );
  return collides ? undefined : extents;
}

/** One piece as the column it becomes: the original's frozen facts with only `w`, the along-wall centre
 *  and the key moved (ADR 0011 Gap D, as `moveFrozenColumns` and `writeParts` follow). */
function toExtent(
  column: ColumnExtent,
  centreMm: number,
  widthMm: number,
): ColumnExtent {
  const centreM = toMetres(centreMm);
  return {
    ...column,
    key: deriveColumnKeyAt(column.wall, centreM),
    w: toMetres(widthMm),
    ...alongWallPosition(column.wall, centreM),
  };
}

function alongWallCentre(column: ColumnExtent): number {
  return column.wall === "A" ? column.x : column.z;
}
