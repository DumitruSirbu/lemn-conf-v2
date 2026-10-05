// Where the width comes from: the empty column on either side that funds the move, or — on a shrink
// with no empty column anywhere — the strip the run vacates (ADR 0031 rules 2, 3 and 6; ADR 0035
// decision 7).
import { toExactMillimetres, toMetres } from "../millimetres.js";
import type { Column, PlacementRecord } from "../void-engine.js";
import { alongWallM } from "./along-wall.js";
import type {
  EmptySpaceRefusal,
  EmptySpaceSide,
  RejectionDetail,
} from "./rejection.js";
import type {
  ColumnPlan,
  EmptySpace,
  ExtentMm,
  SetWidthInput,
  Side,
} from "./width-resize-model.js";

/** How close the funding column's facing edge must be to the resized run's to count as abutting it: float
 *  noise only (a micron). The far edge is held while the boundary moves, so a 29 mm offset would overlap
 *  the new extents or leave a strip belonging to no column, for which §4 derives no void. The edges come
 *  from different sources (integer millimetres versus the frozen map's metres), so never compare with `===`. */
const EDGE_ABUTMENT_TOLERANCE_M = 1e-6;

/** Right is tried first and left only if right cannot fund the move, so the same design always resizes
 *  the same way. An order, not a set. */
const EMPTY_SPACE_ORDER: readonly Side[] = ["right", "left"];

/** How far short of the band it receives a column may fall and still be said to record it: float noise
 *  only, as for `EDGE_ABUTMENT_TOLERANCE_M`; two bands in metres off different frames can part by an ulp. */
const BAND_COVERAGE_TOLERANCE_M = 1e-6;

export type EmptySpaceEvaluation =
  | { readonly ok: true; readonly value: EmptySpace }
  | { readonly ok: false; readonly reason: EmptySpaceRefusal };

/** One entry in the scan `fundColumnResize` walks: a side, and what it offers to fund the move. */
export interface FundingAttempt {
  readonly side: Side;
  readonly space: EmptySpaceEvaluation;
}

/** Where the width comes from, in order: an existing empty column (ADR 0031 rule 3), narrowed by a growth
 *  and widened by a shrink; then, only when neither side has an empty column at all, a shrink creates
 *  one from the space it vacates (ADR 0035 decision 7). Returning space to an existing opening wins, so
 *  stepping a column down and back up restores its width and the second `−50` widens the first strip.
 *
 *  Creation is a last resort, not a fallback for a side that refused: rescuing a shrink stopped by
 *  `RESIZE_OPENS_GAP` with a fresh strip is a wider change than decision 7 makes. */
export function fundingScan(
  input: SetWidthInput,
  records: readonly PlacementRecord[],
  plan: ColumnPlan,
): readonly FundingAttempt[] {
  const existing = EMPTY_SPACE_ORDER.map((side) => ({
    side,
    space: evaluateEmptySpace(input, records, plan, side),
  }));
  if (existing.some((attempt) => attempt.space.ok)) return existing;

  const created = vacatedEmptySpace(input, plan);
  if (!created) return existing;
  return [
    ...existing,
    { side: created.side, space: { ok: true, value: created } },
  ];
}

/** The empty column a shrink brings into existence, as the same `EmptySpace` an existing one produces so
 *  `planMoves` needs no second arithmetic: a zero-width column on the run's `VACATED_SPACE_SIDE` edge whose
 *  remainder is the whole vacated width. `MIN_W` applies nowhere in this file: a 50 mm step always creates
 *  a sliver. `undefined` on a growth and on a delta of zero, and nothing else: a strip whose key collides
 *  with the frozen map (narrowing `A|0.30` to 300 vacates 0.30–0.60, keyed `A|0.45`, the corner leg
 *  `p25`'s column) is `refuseKeyCollision`'s question, and is refused there rather than nudged to a free
 *  key, which would put the empty column where the cabinets did not vacate. see ADR 0035 decision 7 */
function vacatedEmptySpace(
  input: SetWidthInput,
  plan: ColumnPlan,
): EmptySpace | undefined {
  const vacatedMm = plan.extent.widthMm - input.widthMm;
  if (vacatedMm <= 0) return undefined;

  return {
    // The strip was this column's, so it inherits its frozen facts (`regions`, `top`, `d`, `ry`), as ADR 0011
    // Gap D requires of any column entered into the map.
    column: plan.column,
    side: VACATED_SPACE_SIDE,
    extent: {
      centreMm: plan.extent.centreMm + plan.extent.widthMm / 2,
      widthMm: 0,
    },
    remainderMm: vacatedMm,
  };
}

/** Which end of the run a shrink vacates when nothing else decides it: arbitrary but fixed, so the same
 *  design always resizes the same way, and `EMPTY_SPACE_ORDER`'s first side so a column stepped down
 *  and back up returns to where it started. */
const VACATED_SPACE_SIDE: Side = "right";

/** Which of the three codes the customer reads once both sides have answered, ordered by how far the scan
 *  got: `COLUMN_KEY_COLLISION` (space found, arithmetic worked, refused for where the column would land),
 *  then `RESIZE_OPENS_GAP` (a side could fund it but an opening would land on a body), then
 *  `NO_EMPTY_SPACE`. All three carry the whole scan, so the sentence says which side was tried and what
 *  each answered. */
export function refuseNoSideFunds(
  input: SetWidthInput,
  plan: ColumnPlan,
  sides: readonly EmptySpaceSide[],
): RejectionDetail {
  const params = {
    label: plan.label,
    requestedMm: input.widthMm,
    deltaMm: input.widthMm - plan.extent.widthMm,
    sides,
  };
  if (sides.some((side) => side.reason === "key_taken")) {
    return { code: "COLUMN_KEY_COLLISION", params };
  }
  const opensAGap = sides.some((side) => side.reason === "opens_a_gap");
  // `NO_EMPTY_SPACE` is reachable on a growth only (a shrink falls back on `vacatedEmptySpace`), and its
  // message presents `params.deltaMm` unsigned on that assumption; the tap sweep in
  // `qa-w5b1.adversarial.test.ts` fails if a negative delta reaches this line.
  return opensAGap
    ? { code: "RESIZE_OPENS_GAP", params }
    : { code: "NO_EMPTY_SPACE", params };
}

/** ADR 0031 rules 3 and 6: growing consumes the empty column and shrinking returns width to it. There is
 *  no floor on either (ADR 0043), so the one arithmetic refusal is `too_narrow` (asking for more than the
 *  empty column holds), reachable on a growth alone. It answers only what geometry decides; `opens_a_gap`
 *  needs the rebuilt records and belongs to `fundColumnResize`.
 *
 *  `absent` covers a side with no abutting empty column and one that cannot record the strip a shrink
 *  would hand it (`recordsTheStripAShrinkHandsOver`); the customer's answer is the same either way. On a
 *  shrink it is never terminal: `fundingScan` falls to ADR 0035 decision 7. */
function evaluateEmptySpace(
  input: SetWidthInput,
  records: readonly PlacementRecord[],
  plan: ColumnPlan,
  side: Side,
): EmptySpaceEvaluation {
  const neighbour = findAdjacentEmptyColumn(input.columns, records, plan, side);
  if (!neighbour) return { ok: false, reason: "absent" };

  const extent = emptyColumnExtent(neighbour);
  // A frozen extent off the whole-millimetre grid cannot be moved onto it, so it is not empty space this
  // command can spend. Unreachable from any shipped design.
  if (!extent) return { ok: false, reason: "absent" };

  const deltaMm = input.widthMm - plan.extent.widthMm;
  if (!recordsTheStripAShrinkHandsOver(plan.column, neighbour, deltaMm)) {
    return { ok: false, reason: "absent" };
  }

  const remainderMm = extent.widthMm - deltaMm;
  // The only arithmetic bound on a growth: a remainder of zero or more is legal, since refusing one under
  // `MIN_W` would make the stepper one-way below its first rung (ADR 0043).
  if (remainderMm < 0) return { ok: false, reason: "too_narrow" };
  return { ok: true, value: { column: neighbour, side, extent, remainderMm } };
}

/** ADR 0031's "empty" is empty at every level, matching the move: a column free only at the edited level
 *  does not qualify (§3.2: no record filed under its key). The resized column's edges come from its
 *  members' stored millimetres, not `Column.w`, which is the MIN over members and goes stale when the
 *  narrowest one is deleted. */
function findAdjacentEmptyColumn(
  columns: ReadonlyMap<string, Column>,
  records: readonly PlacementRecord[],
  plan: ColumnPlan,
  side: Side,
): Column | undefined {
  const occupied = new Set(records.map((record) => record.col));
  const sharedEdgeM = toMetres(
    side === "right"
      ? plan.extent.centreMm + plan.extent.widthMm / 2
      : plan.extent.centreMm - plan.extent.widthMm / 2,
  );
  const abutting = [...columns.values()].filter(
    (candidate) =>
      candidate.key !== plan.column.key &&
      candidate.wall === plan.column.wall &&
      !occupied.has(candidate.key) &&
      Math.abs(facingEdgeM(candidate, side) - sharedEdgeM) <
        EDGE_ABUTMENT_TOLERANCE_M,
  );
  return abutting.sort(byFundingCapacity)[0];
}

/** Which empty column to spend when two abut the same edge (§3.2 columns are keyed on a centre and may
 *  overlap, so a 900 mm and a 300 mm run can share a right edge). The widest wins, ties break on the
 *  key, so the same design always resizes the same way. It only decides where the leftover gap ends up,
 *  and changing which column a resize spends is a product question. */
function byFundingCapacity(left: Column, right: Column): number {
  return right.w - left.w || left.key.localeCompare(right.key);
}

/** The edge an empty column on `side` presents to the run being resized: one on the right meets it
 *  with its own left edge. */
function facingEdgeM(column: Column, side: Side): number {
  const centreM = alongWallM(column.wall, column);
  return side === "right" ? centreM - column.w / 2 : centreM + column.w / 2;
}

/** The column a shrink hands its strip to must record that strip at every height the run stood at. A
 *  resize moves a boundary along the wall and in height at once; where the empty column stands at other
 *  heights the width is conserved but the floor is lost: it belongs to no placement, empty column or
 *  derived void, because §4 derives nothing between two frozen extents. The shipped reference kitchen
 *  reaches it with two deletes and one step (`set-width.records-the-strip-it-hands-over.test.ts`), so the
 *  repair belongs to this command, not to whatever composed the kitchen.
 *
 *  A growth is left alone, which is a scope decision and not a claim that it is safe: the mirror case
 *  exists, but refusing it withdraws an operation customers have (growing a wall cabinet into the
 *  opening beside it), and refuse-or-accept-the-sliver is a product question. Asked of the column the scan
 *  already selected, not folded into `findAdjacentEmptyColumn`'s filter, which would let a narrower
 *  column win (`byFundingCapacity`). Both bands come from the frozen map, so both sides of the
 *  comparison share a source. */
function recordsTheStripAShrinkHandsOver(
  resized: Column,
  neighbour: Column,
  deltaMm: number,
): boolean {
  if (deltaMm >= 0) return true;
  return resized.regions.every((band) => coversBand(neighbour.regions, band));
}

/** Whether `regions` cover `band` end to end. A union rather than any single region: a column that
 *  grew by a merge carries one region per member, and two that meet cover the span across them. */
function coversBand(
  regions: readonly (readonly [number, number])[],
  band: readonly [number, number],
): boolean {
  let reached = band[0];
  for (const [start, end] of [...regions].sort((a, b) => a[0] - b[0])) {
    if (start > reached + BAND_COVERAGE_TOLERANCE_M) break;
    reached = Math.max(reached, end);
  }
  return reached >= band[1] - BAND_COVERAGE_TOLERANCE_M;
}

/** An empty column has no member to read integers off, so its extent comes from the frozen map —
 *  the one place its geometry survives at all once the last body in it was deleted. */
function emptyColumnExtent(column: Column): ExtentMm | undefined {
  const centreMm = toExactMillimetres(alongWallM(column.wall, column));
  const widthMm = toExactMillimetres(column.w);
  if (centreMm === undefined || widthMm === undefined) return undefined;
  return { centreMm, widthMm };
}
