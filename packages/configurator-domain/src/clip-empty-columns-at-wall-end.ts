// Clips every member-less column to the length of the wall it stands on, so an empty column is never
// offered as an insertable opening that reaches past its wall's end (ADR 0069). A map-level pass: a resize
// and an insert each cut only the span they know about, so a future producer of a member-less column is a
// bug caught here and not an unofferable document.
//
// It runs beside `splitOversizedEmptyColumns` (which holds columns to ADR 0052's 800 mm ceiling), before
// it, never after: clipping only shrinks a column (the far edge moves in, the near edge never moves), so
// it cannot hand the split more work, whereas split-first could publish an 800 mm column that still
// reaches past the wall.
//
// It declines, never refuses, like its siblings: both callers run after a command has succeeded and have
// no rejection channel. A column it cannot clip safely is left as it was, to be marked
// (`EMPTY_COLUMN_PAST_WALL_END`), which stays as a backstop for a stored document no command wrote.
import type { DesignRoom } from "./design.js";
import { toExactMillimetres, toMetres } from "./millimetres.js";
import { alongWallCoordinate, alongWallPosition } from "./module-grid.js";
import { wallLengthMm } from "./queries/overflowing-placements.js";
// Types only: `void-engine.ts` imports this module for its value, so a value import back would close a
// runtime cycle.
import type { ColumnExtent, PlacementRecord } from "./void-engine.js";

/** Every member-less column of the map held to the length of the wall it stands on, other keys untouched.
 *  "Member-less" is the split's predicate (ADR 0037): no record is filed under the key at any level. An
 *  occupied column is never clipped: its width is its members', and a body past its wall is
 *  `PLACEMENT_PAST_WALL_END`'s mark. The input map is returned by identity when nothing reaches past the
 *  wall (every state the shipped kitchen reaches), so the common case costs a scan and no allocation. */
export function clipEmptyColumnsAtWallEnd(
  columns: ReadonlyMap<string, ColumnExtent>,
  records: readonly PlacementRecord[],
  room: DesignRoom,
): ReadonlyMap<string, ColumnExtent> {
  const occupied = new Set(records.map((record) => record.col));
  const overflowing = [...columns.values()].filter(
    (column) => !occupied.has(column.key) && reachesPastWallEnd(column, room),
  );
  if (overflowing.length === 0) return columns;

  const clipped = new Map<string, ColumnExtent>(columns);
  for (const column of overflowing) {
    const outcome = planClip(column, room);
    if (outcome.action === "decline") continue;
    // Replace under the key it arrived on, never a re-derived one (see `toClippedExtent`); a drop is the
    // only outcome that removes a key.
    if (outcome.action === "drop") clipped.delete(column.key);
    else clipped.set(column.key, outcome.column);
  }
  return clipped;
}

/** Equality fits (ADR 0067's one-sided rule, as in `placementExtendsPastOwnWall`). A column off the
 *  millimetre grid answers `false`: no document can carry one, as `isWiderThanCap` decides for the split. */
function reachesPastWallEnd(column: ColumnExtent, room: DesignRoom): boolean {
  const centreMm = toExactMillimetres(alongWallCoordinate(column.wall, column));
  const widthMm = toExactMillimetres(column.w);
  if (centreMm === undefined || widthMm === undefined) return false;
  return centreMm + widthMm / 2 > wallLengthMm(column.wall, room);
}

type ClipOutcome =
  | { readonly action: "decline" }
  | { readonly action: "drop" }
  | { readonly action: "replace"; readonly column: ColumnExtent };

/** The column this one becomes once its far edge is known to be past the wall: a decline (nothing on the
 *  grid to publish: a column no document could carry, or one the wall covers by a single millimetre of the
 *  wrong parity), a drop, or a replacement. An off-grid clip is not declined (see `widestOnTheGrid`). */
function planClip(column: ColumnExtent, room: DesignRoom): ClipOutcome {
  const centreMm = toExactMillimetres(alongWallCoordinate(column.wall, column));
  const widthMm = toExactMillimetres(column.w);
  if (centreMm === undefined || widthMm === undefined)
    return { action: "decline" };

  const nearEdgeMm = centreMm - widthMm / 2;
  const wallEndMm = wallLengthMm(column.wall, room);
  // A column starting at or past the wall's end is wholly off the wall (including a zero-width remainder
  // exactly at the end): it has nothing to offer, so it is dropped rather than published as an empty,
  // uninsertable point.
  if (nearEdgeMm >= wallEndMm) return { action: "drop" };

  const clippedWidthMm = widestOnTheGrid(wallEndMm - nearEdgeMm, widthMm);
  // The one decline left: the wall covers a single millimetre of the wrong parity, so no publishable
  // column exists between "as it arrived" and nothing. Declined, not dropped: a member-less key the wall
  // still touches is left to be marked (`EMPTY_COLUMN_PAST_WALL_END`).
  if (clippedWidthMm <= 0) return { action: "decline" };

  return {
    action: "replace",
    column: toClippedExtent(
      column,
      nearEdgeMm + clippedWidthMm / 2,
      clippedWidthMm,
    ),
  };
}

/**
 * The widest column that fits in `slackMm` of wall and still lands on the whole millimetres a document
 * can carry, near edge held. The near edge is `centre − width / 2` and the clipped centre is
 * `nearEdge + clipped / 2`; both are whole exactly when the clipped width has the same parity as the
 * recorded one, so the answer is the largest such width within the slack, giving up at most one millimetre.
 *
 * It must not decline instead: an even column `alongMm 1782 widthMm 3558` on the shipped 3560 mm wall A has
 * its near edge at 3 (odd whenever the half-width is, `widthMm % 4 === 2`), so declining published it
 * whole, 1 mm past its wall, with no validator between here and the offer list. see ADR 0090 Amendment B
 * (no opening past the wall is ever derived, drawn or offered). `landsOnWholeMillimetres` is left to the
 * callers whose "no" has an answer.
 */
function widestOnTheGrid(slackMm: number, recordedWidthMm: number): number {
  const whole = Math.floor(slackMm);
  return whole % 2 === recordedWidthMm % 2 ? whole : whole - 1;
}

/** One column, clipped: the original's frozen facts and its key, with only `w` and the along-wall centre
 *  moved. The key is the one thing the cap may not move: it is the column's identity across the recorded
 *  and offered faces, and re-deriving it from the moved centre turned one column into two (`B|2.72`
 *  recorded, `B|2.67` offered), so a resize or insert could no longer find the column its own void named
 *  (`COLUMN_MISMATCH`). Sound because this pass never clips an occupied column, so no `record.col` derives
 *  onto the key. It differs from `toExtent` in `split-oversized-empty-columns.ts` because the split writes
 *  both faces, so its pieces are new columns, while the cap writes one face of the same column.
 *  see ADR 0090 Amendment B addendum */
function toClippedExtent(
  column: ColumnExtent,
  centreMm: number,
  widthMm: number,
): ColumnExtent {
  const centreM = toMetres(centreMm);
  return {
    ...column,
    w: toMetres(widthMm),
    ...alongWallPosition(column.wall, centreM),
  };
}
