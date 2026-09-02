// M5 wave 5G — ADR 0052 over a frozen map: a member-less column wider than
// `MAX_EMPTY_COLUMN_WIDTH_MM` becomes the columns the ceiling allows.
//
// **The merge's dual, and it runs beside it.** `mergeAdjacentEmptyColumns` joins empty columns whose
// total fits under the ceiling; this cuts the ones that do not. Together they are what makes "no
// empty column is wider than 800 mm" a property of the map after every command rather than a rule
// each command has to remember.
//
// **Why it exists at map level, corrected 2026-09-02 after adversarial QA measured it.** The first
// version of this paragraph said the delete was a producer with no command to put a split in, and
// that without this guard a customer's own delete would make their design unsaveable. That is
// false, and the retraction is worth keeping because the claim is a plausible one to re-derive: a
// delete *cannot* leave a member-less column wider than the ceiling, because `deriveColumns` takes
// a column's width as `Math.min` over its members' frames, the widest deletable body a document may
// carry is 800 mm (`base-corner-x-900` is `canDelete: false`), and both seams already hold a stored
// entry to the ceiling. QA confirmed it by measurement: removing this call left both suites green
// but for a test built on a hand-made map.
//
// It stays as defence in depth, and the reason is the DOM-001 lesson rather than a known caller. A
// resize splits the space it frees (`apply-column-moves.ts`) and an insert splits the remainder it
// leaves (`split-column.ts`), each by a direction only that command knows; this is the one place
// that sees every map on its way to being published. A guard here is the difference between a
// future producer being a bug and being an unsaveable document.
//
// **It declines; it never refuses** — the same rule and the same reason as the merge: its callers
// run after a command has already succeeded and have no rejection channel. A column it cannot split
// safely is left exactly as it was, to be refused (or not) wherever it would have been.
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
// Types only, which is what keeps this module a leaf: `void-engine.ts` imports it for its value, so
// a value imported back would close a runtime cycle. `merge-empty-columns.ts` carries what that
// cycle cost when it was real.
import type { ColumnExtent, PlacementRecord } from "./void-engine.js";

/** Every member-less column of the map held to ADR 0052's ceiling, with every other key passing
 *  through untouched.
 *
 *  "Member-less" is the merge's own predicate, and ADR 0037's: **no record is filed under this key,
 *  at any level**. An occupied column is never split, because its width is its members' and it
 *  publishes no opening of its own.
 *
 *  **Left to right**, from the column's own left edge. A map has no "near" side — the command that
 *  produced it does, which is why a resize and an insert cut their own spans before this ever sees
 *  them and this cuts only what no command claimed.
 *
 *  The input map is returned by identity when nothing is oversized, which is every state the shipped
 *  kitchen reaches until a column wider than the ceiling is cleared: the common case costs a scan
 *  and no allocation.
 *
 *  `hasFullHeightUnder` is **not** answered here, exactly as the merge does not answer it — whether
 *  a full-height member stands under a column is a fact about extents, and extents are what this
 *  rewrites, so the caller runs `withCurrentFullHeightMembers` over the result. */
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
    // Vacated before any piece is written, because the leftmost piece keys back onto the original
    // column's own key whenever the two centres share a 10 mm bucket — the merge's rule, for the
    // same reason (`mergeAdjacentEmptyColumns`).
    split.delete(column.key);
    for (const piece of pieces) split.set(piece.key, piece);
  }
  return split;
}

function isWiderThanCap(column: ColumnExtent): boolean {
  const widthMm = toExactMillimetres(column.w);
  return widthMm !== undefined && widthMm > MAX_EMPTY_COLUMN_WIDTH_MM;
}

/** The columns this one becomes, or nothing — the three reasons a column that is too wide still
 *  stays as it is.
 *
 *  A column already off the millimetre grid is left where it is, to fail (or not) wherever it did
 *  before: it is not a column any document could carry, so cutting it produces nothing better. Same
 *  for a cut whose pieces would land between two millimetres, which needs an odd width and so is
 *  unreachable from §7's catalogue, every width in which is even.
 *
 *  A piece landing on a key some other column already holds is the third, and it is the failure ADR
 *  0052 names as this wave's specific risk — a seam writing a document its own validator refuses
 *  with `EMPTY_COLUMN_KEY_COLLIDES_WITH_*`. Declined whole rather than per piece, because half a
 *  split is a map whose columns no longer tile the space they came from. */
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

/** One piece, as the column it becomes: the original's frozen facts — `wall`, `ry`, the off-wall
 *  coordinate, `d`, `top` and `regions` — with only `w`, the along-wall centre and the key moved.
 *  ADR 0011 Gap D's rule, and the same one `moveFrozenColumns` and `writeParts` follow: they are all
 *  the same space. */
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
