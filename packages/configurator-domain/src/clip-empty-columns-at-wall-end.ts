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
import { alongWallCoordinate, alongWallPosition } from "./module-grid.js";
import { wallLengthMm } from "./queries/overflowing-placements.js";
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
 *  the shipped kitchen reaches (at the 600 mm cabinet depth its walls end with 40 mm and 120 mm of
 *  the run still bare, and wall B's run still clears its wall by 20 mm at 700): the common case
 *  costs a scan and no allocation. */
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
    // Replacing under the key it arrived on, never under a re-derived one — a capped column is the
    // same column, narrower (see `toClippedExtent`). A drop is the only outcome that removes a key.
    if (outcome.action === "drop") clipped.delete(column.key);
    else clipped.set(column.key, outcome.column);
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
 *  reasons it still stays as it is, and the one reason it vanishes instead of shrinking.
 *
 *  **A decline is no longer the ordinary answer to an off-grid clip**, which is what let an opening
 *  past the wall be published (see `widestOnTheGrid`). What is left of it is the one input where
 *  there is nothing on the grid to publish at all: a column no document could carry, and a column
 *  the wall covers by a single millimetre of the wrong parity. */
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

  const clippedWidthMm = widestOnTheGrid(wallEndMm - nearEdgeMm, widthMm);
  // **The one decline left**: the wall covers a single millimetre of the wrong parity, so there is
  // no publishable column between "as it arrived" and nothing at all. Declined rather than dropped
  // — a member-less key the wall still touches is left to be marked
  // (`EMPTY_COLUMN_PAST_WALL_END`), which is what this pass has always done with a column it cannot
  // clip safely, and what its `drop` arm deliberately does *not* do to a column the wall reaches.
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
 * The widest column that fits in `slackMm` of wall and still lands on the whole millimetres a
 * document can carry — the near edge held, exactly as everywhere else in this pass.
 *
 * **Why a parity and not a floor.** The near edge is `centre − width / 2`, so it is whole when the
 * recorded width is even and a half millimetre when it is odd; the clipped centre is
 * `nearEdge + clipped / 2`. Both land on whole millimetres exactly when the clipped width has the
 * **same parity as the recorded one**, so the answer is the largest such width no wider than the
 * slack. It gives up at most one millimetre of a published opening, and only where the wall's own
 * end and the column's near edge disagree in parity.
 *
 * **This replaces a decline, and the decline's stated justification was false.** It read: *"every
 * catalogue width is even, so a member-less column of an even width never puts this off the grid by
 * itself"*, and attributed every reachable case to an odd room length. What actually decides it is
 * the parity of `wallEndMm − nearEdgeMm`, and a near edge is odd whenever the half-width is
 * (`widthMm % 4 === 2`). Measured on the **shipped, even** 3560 mm wall A: an even column
 * `alongMm 1782 widthMm 3558` has its near edge at 3, wants a clip of 3557, and was published
 * whole — 1 mm past the end of its wall, with `recomputeVoids` publishing an opening through it.
 * That is ADR 0069's owner ruling — *"never"* — broken by the pass written to keep it, and ADR 0090
 * Amendment B repeats it in as many words: *"no opening past the wall is ever derived, drawn or
 * offered."*
 *
 * A decline was the wrong shape for that reason and not merely the wrong arithmetic: this pass's
 * two siblings decline into a state a *validator* still refuses, and there is no validator between
 * here and the offer list. `landsOnWholeMillimetres` is left to the two callers whose "no" has an
 * answer — the width command's `NON_INTEGER_MILLIMETRES` and the v1 migration's untouched entry.
 */
function widestOnTheGrid(slackMm: number, recordedWidthMm: number): number {
  const whole = Math.floor(slackMm);
  return whole % 2 === recordedWidthMm % 2 ? whole : whole - 1;
}

/** One column, clipped: the original's frozen facts — `wall`, `ry`, the off-wall coordinate, `d`,
 *  `top`, `regions` **and its key** — with only `w` and the along-wall centre moved.
 *
 *  **The key is the one thing the cap may not move** (ADR 0090 Amendment B addendum). The width and
 *  the centre must diverge between the two faces — a cap holds the near edge and brings the far edge
 *  in, so the centre follows — but a column's key is its *identity across those faces*. Re-deriving
 *  it from the moved centre, which is what this did until backlog 52, turned one column into two:
 *  the record stood at `B|2.72` while what was offered stood at `B|2.67`, and a resize or an insert
 *  handed the recorded map could no longer find the column its own void named
 *  (`COLUMN_MISMATCH`). That divergence is what made handing those two commands the recorded map
 *  look expensive; preserving the key removes the cause rather than the symptom.
 *
 *  It is sound because this pass never clips an occupied column: a capped column is always
 *  member-less, so no `record.col` is ever derived onto its key and `key = deriveColumnKeyAt(centre)`
 *  — mandatory for the recorded face and for every occupied column — is not load-bearing here. The
 *  key it keeps is the one the document records, which is the one `toColumnExtent` restores it under
 *  on the next load.
 *
 *  It diverges from `toExtent` in `split-oversized-empty-columns.ts` for that reason and no other:
 *  the split derives from a declared ceiling and writes both faces, so its pieces are new columns and
 *  must be keyed as such. The cap derives from the room and writes one face, so its output is the
 *  same column seen from the other side. */
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
