// M6 — the owner's ruling on the open question ADR 0069's consequences left standing: an empty
// column must never be *offered* as an insertable opening that reaches past the end of its own
// wall. The answer is to clip it, not to refuse the document over it.
//
// **The wall-end dual of `splitOversizedEmptyColumns`, and it runs beside it — before it, never
// after.** Both are map-level passes that hold a member-less column to a bound no single command
// sees end-to-end: the split holds it to ADR 0052's 800 mm grid ceiling, this holds it to the room's
// own along-wall length (`wallLengthMm`). They are independent, composable constraints, not one
// rule — a column can need either, both or neither.
//
// **Clip first, split second, and this is provable rather than assumed.** Clipping can only ever
// shrink a column's width: the far edge moves inward to the wall's own end and the near edge never
// moves. A pass that only shrinks cannot hand the split *more* work than it already had, so running
// clip before split is at worst a no-op for the split and never a reason for it to see a wider
// column than it would have otherwise. Running them the other way could publish a column the split
// had already cut to 800 mm that still reached past the wall — exactly the state this pass exists to
// make unreachable.
//
// **Why this exists at map level, mirroring the split's own reasoning.** A resize and an insert each
// cut the span they know about, by a direction only that command knows, and this is the one place
// that sees every map on its way to being published. ADR 0069's consequences section named this
// question and left it to "the insert command's own surface... the owner's call" — the owner's
// answer, recorded here, is a map-level clip rather than a per-command guard, for the same
// defence-in-depth reason `splitOversizedEmptyColumns` gives: a future producer of a member-less
// column should be a bug caught here, not an unsaveable — or now, an unofferable — document.
//
// **It declines; it never refuses** — the same rule as its two siblings, for the same reason: both
// callers run after a command has already succeeded and have no rejection channel. A column this
// cannot clip safely is left exactly as it was, to be marked (`EMPTY_COLUMN_PAST_WALL_END`) or not
// wherever it would have been. That mark stays exactly as it is — a defence-in-depth backstop for a
// stored document nobody wrote through a command, the same relationship the split has with
// `EMPTY_COLUMN_WIDER_THAN_CAP` — and this pass makes it unreachable from anything a command
// produces going forward without touching what it means.
import type { DesignRoom } from "./design.js";
import { toExactMillimetres, toMetres } from "./millimetres.js";
import {
  alongWallCoordinate,
  alongWallPosition,
  deriveColumnKeyAt,
} from "./module-grid.js";
import { wallLengthMm } from "./queries/overflowing-placements.js";
import { landsOnWholeMillimetres } from "./split-empty-span.js";
// Types only, for the reason `split-oversized-empty-columns.ts`'s head gives: `void-engine.ts`
// imports this module for its value, so a value imported back would close a runtime cycle.
import type { ColumnExtent, PlacementRecord } from "./void-engine.js";

/** Every member-less column of the map held to the length of the wall it stands on, with every
 *  other key passing through untouched.
 *
 *  "Member-less" is the split's own predicate and ADR 0037's: **no record is filed under this key,
 *  at any level**. An occupied column is never clipped — its width is its members' and it publishes
 *  no opening of its own, so the wall's own length has nothing to say about it; a body that reaches
 *  past its wall is `PLACEMENT_PAST_WALL_END`'s mark, unchanged by this pass.
 *
 *  The input map is returned by identity when nothing reaches past the wall, which is every state
 *  the shipped kitchen reaches (its walls end with 40 mm and 30 mm of the run still bare): the
 *  common case costs a scan and no allocation. */
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
    clipped.delete(column.key);
    if (outcome.action === "replace") {
      clipped.set(outcome.column.key, outcome.column);
    }
  }
  return clipped;
}

/** Equality fits — ADR 0067's one-sided rule, the same one `placementExtendsPastOwnWall` and
 *  `findOverflowingPlacementIds` are built on. A column already off the millimetre grid answers
 *  `false` here rather than being flagged and declined later: it is not a column any document could
 *  carry, so this pass has nothing to say about it either, the same choice `isWiderThanCap` makes
 *  for the split. */
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

/** The column this one becomes, once its far edge is already known to be past the wall — the two
 *  reasons it still stays as it is, and the one reason it vanishes instead of shrinking. */
function planClip(column: ColumnExtent, room: DesignRoom): ClipOutcome {
  const centreMm = toExactMillimetres(alongWallCoordinate(column.wall, column));
  const widthMm = toExactMillimetres(column.w);
  if (centreMm === undefined || widthMm === undefined)
    return { action: "decline" };

  const nearEdgeMm = centreMm - widthMm / 2;
  const wallEndMm = wallLengthMm(column.wall, room);
  // The column starts at or past the wall's own end — wholly off the wall, including the boundary
  // case of a zero-width remainder landing exactly at the end. ADR 0067's equality-fits rule is
  // about a run that still *reaches* the wall; a column with nothing on the wall side of its near
  // edge has nothing to offer, so it is dropped rather than published as an empty, uninsertable
  // point. The same "member-less key with nothing left to offer" instinct `rederiveTouchedColumns`
  // states for a column a delete emptied out, reached here by a different route: there the members
  // left, here the wall never reached the column at all.
  if (nearEdgeMm >= wallEndMm) return { action: "drop" };

  const clippedWidthMm = wallEndMm - nearEdgeMm;
  const clippedCentreMm = nearEdgeMm + clippedWidthMm / 2;
  // **Reachable, and not the coincidence the split's own version of this guard rests on.** Every
  // catalogue width is even, so a member-less column of an even width never puts this off the grid
  // by itself — the same fact `landsOnWholeMillimetres`'s own doc comment gives for the split. But
  // `wallEndMm` comes from the room, and `DesignRoomSchema` holds `widthMm`/`depthMm` to any integer
  // millimetre, not to an even one, so an odd wall length still lands the clipped centre on a half
  // millimetre even when the column's own width was even. Reachable today from a hand-crafted or
  // migrated document, and from ordinary editing the moment a command can change the room's own
  // measurements.
  if (
    !landsOnWholeMillimetres([
      { centreMm: clippedCentreMm, widthMm: clippedWidthMm },
    ])
  ) {
    return { action: "decline" };
  }

  return {
    action: "replace",
    column: toClippedExtent(column, clippedCentreMm, clippedWidthMm),
  };
}

/** One column, clipped: the original's frozen facts — `wall`, `ry`, the off-wall coordinate, `d`,
 *  `top` and `regions` — with only `w`, the along-wall centre and the key moved. The same rule
 *  `toExtent` in `split-oversized-empty-columns.ts` follows, for the same reason: ADR 0011 Gap D's
 *  space is one and the same however it comes to be cut. */
function toClippedExtent(
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
