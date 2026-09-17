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

/** How close the funding column's facing edge must be to the resized run's, to count as **abutting**
 *  it. Float noise and nothing more (logic review R1.8).
 *
 *  §5.4 used `< 0.03` here, and that 30 mm was right for the question §5.4 asked — "do these two
 *  runs meet", answered only to *pick* a donor. ADR 0031 asks it of a column whose far edge is then
 *  **held** while the boundary between the two moves, so a candidate 29 mm away is not a neighbour
 *  the arithmetic can use: the new extents overlap by 29 mm, or leave a 29 mm strip belonging to no
 *  column at all. The second is worse than the first, because §4 derives no void for a gap between
 *  two frozen extents — ADR 0031 says so itself — so the strip would be invisible.
 *
 *  Folding the measured offset into the delta was the alternative and is rejected: it would move a
 *  boundary the customer did not ask to move, and leave the column at a width other than the one
 *  they tapped. Requiring the runs to actually meet keeps the resize the operation it claims to be.
 *
 *  The two edges are computed from different sources — the run's from its placements' integer
 *  millimetres, the empty column's from the frozen map's metres — so they are compared with a micron
 *  rather than with `===`. That is four orders of magnitude below any gap a design can hold and
 *  eight above the millimetre↔metre round-trip error. */
const EDGE_ABUTMENT_TOLERANCE_M = 1e-6;

/** Right is tried first and left only if right cannot fund the move, so the same design always
 *  resizes the same way. An order, not a set. */
const EMPTY_SPACE_ORDER: readonly Side[] = ["right", "left"];

/** How far short of the band it receives a column may fall and still be said to record it. Float
 *  noise and nothing more, for the reason `EDGE_ABUTMENT_TOLERANCE_M` is: the two bands are metres
 *  off two different frames, so a region ending exactly where the next begins can part by an ulp. */
const BAND_COVERAGE_TOLERANCE_M = 1e-6;

export type EmptySpaceEvaluation =
  | { readonly ok: true; readonly value: EmptySpace }
  | { readonly ok: false; readonly reason: EmptySpaceRefusal };

/** One entry in the scan `fundColumnResize` walks: a side, and what it offers to fund the move. */
export interface FundingAttempt {
  readonly side: Side;
  readonly space: EmptySpaceEvaluation;
}

/** Where the width comes from, in the order it is looked for.
 *
 *  **ADR 0031 rule 3 first**: an empty column that is already there is narrowed by a growth and
 *  widened by a shrink. **ADR 0035 decision 7 second**: a shrink that finds no empty column at all
 *  *creates* one out of the space it vacates.
 *
 *  Decision 7 is what makes the stepper usable. ADR 0031's recorded consequence was that **nothing
 *  in the shipped kitchen is resizable until something is deleted** — it loads with no empty column
 *  — so every `−50` would have been disabled on a design nobody had edited yet, and width editing
 *  stayed a second step of deleting. ADR 0031's own correction had already conceded the ground: it
 *  called creating a column "not representable", then noted that `moveFrozenColumns` synthesises one
 *  at a derived key on every legal resize. This spends exactly that machinery.
 *
 *  Ordered rather than chosen, and returning space to an existing opening wins: stepping a column
 *  down and back up puts the width back where it came from instead of leaving a sliver beside a
 *  widened opening. That ordering is also what delivers ADR 0037's outcome for the stepper without its merge —
 *  the second `−50` widens the strip the first one made instead of parking a second beside it — and
 *  it only started working when `evaluateEmptySpace` stopped applying `MIN_W` to a shrink — and
 *  since ADR 0043 it applies to neither direction.
 *
 *  **Creation is a last resort, not a fallback.** It is offered only when neither side has an empty
 *  column at all — not when one has one that then refuses. A shrink stopped by `RESIZE_OPENS_GAP`
 *  could technically be rescued by splitting a fresh strip off beside the opening that caused it,
 *  and that is a wider change than decision 7 makes: the decision is about a kitchen with no empty
 *  column anywhere, which is the state the shipped design loads in. */
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

/** ADR 0035 decision 7: the empty column a **shrink** brings into existence, expressed as the same
 *  `EmptySpace` an existing one produces so that `planMoves` needs no second arithmetic.
 *
 *  It starts as a zero-width column sitting exactly on the run's `VACATED_SPACE_SIDE` edge, and the
 *  remainder it is left at is the whole of what the shrink gives back. `planMoves` then holds that
 *  edge as the empty column's *far* edge and holds the run's opposite edge, so the new opening is
 *  precisely the strip the members withdrew from and the run total is conserved exactly as it is
 *  for an existing column.
 *
 *  **`MIN_W` does not apply here, and since ADR 0043 it applies nowhere in this file.** A 50 mm step
 *  creates a sliver every single time, so the floor could never have applied to a strip a shrink
 *  makes; the owner has since decided the same for a gap a growth *leaves* — "Empty space can be
 *  even 100 mm or 50 mm, if somebody want to keep it" — which is what makes the stepper reversible.
 *  ADR 0037 had already settled the wide end of the same question: an opening no cabinet fits "is ok
 *  to have empty space left".
 *
 *  `undefined` on a growth, which has nothing to vacate, and on a delta of zero. **Nothing else**:
 *  the strip's key colliding with one the frozen map holds is `refuseKeyCollision`'s question and no
 *  longer this function's, since clean-code review R3.5 gave the pair one guard. It is not
 *  theoretical either — measured on the shipped kitchen, narrowing `A|0.30` to 300 vacates 0.30–0.60,
 *  whose centre keys as `A|0.45`, the corner leg `p25`'s column — and it is refused there rather than
 *  nudged to a free key, which would put the empty column somewhere the cabinets did not vacate.
 *
 *  **ADR 0037's merge would not have reached that case, and was not meant to** — it united two *empty* columns;
 *  a strip landing inside an *occupied* column's extent is the different question M5 still records
 *  under *Not established* — "whether a resize should merge into an existing column key or refuse". */
function vacatedEmptySpace(
  input: SetWidthInput,
  plan: ColumnPlan,
): EmptySpace | undefined {
  const vacatedMm = plan.extent.widthMm - input.widthMm;
  if (vacatedMm <= 0) return undefined;

  return {
    // The strip was this column's, so it inherits this column's frozen facts — `regions`, `top`,
    // `d` and `ry` — which is what ADR 0011 Gap D requires of any column entered into the map.
    column: plan.column,
    side: VACATED_SPACE_SIDE,
    extent: {
      centreMm: plan.extent.centreMm + plan.extent.widthMm / 2,
      widthMm: 0,
    },
    remainderMm: vacatedMm,
  };
}

/** Which end of the run a shrink vacates when nothing else decides it. Arbitrary in the way
 *  `EMPTY_SPACE_ORDER` is arbitrary, and fixed for the same reason: the same design must always
 *  resize the same way. It matches that order's first side, so a column stepped down and back up
 *  returns to where it started. */
const VACATED_SPACE_SIDE: Side = "right";

/** Which of the three codes the customer reads, once both sides have answered.
 *
 *  **Ordered by how specific the answer is**, and each rank means the scan got further than the one
 *  below it. `COLUMN_KEY_COLLISION` wins whenever any side found the space and made the arithmetic
 *  work and was refused for **where the column would land**. `RESIZE_OPENS_GAP` is next: a side
 *  could have funded the move and an opening would have landed on a body. `NO_EMPTY_SPACE` is what
 *  is left when no side got that far.
 *
 *  **All three carry the whole scan**, so whichever is read the sentence says which side was tried
 *  and what each answered — "no room" on its own leaves the customer with nothing to act on, and
 *  they need to know which side to clear. */
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
  // Ordered by how specific the answer is. A key collision is the sharpest thing the scan can say —
  // the space was there and the arithmetic worked, and the move was refused for where it would
  // *land* — so it outranks the gap, which in turn outranks "no space at all". Each is per-side and
  // the terminal code names whichever the scan actually met.
  if (sides.some((side) => side.reason === "key_taken")) {
    return { code: "COLUMN_KEY_COLLISION", params };
  }
  const opensAGap = sides.some((side) => side.reason === "opens_a_gap");
  // `NO_EMPTY_SPACE` is reachable on a **growth** only — a shrink always has `vacatedEmptySpace` to
  // fall back on — and its localized message presents `params.deltaMm` unsigned on that assumption. Nothing in
  // the type system holds that; what does is the tap sweep in `qa-w5b1.adversarial.test.ts`, which
  // fails if any reachable resize reaches this line with a negative delta.
  return opensAGap
    ? { code: "RESIZE_OPENS_GAP", params }
    : { code: "NO_EMPTY_SPACE", params };
}

/** ADR 0031 rules 3 and 6: growing consumes the empty column and shrinking returns width to it.
 *  **Since ADR 0043 there is no floor on either**, so the one arithmetic refusal left is asking for
 *  more space than the empty column holds — `too_narrow`, and reachable on a growth alone, because
 *  a shrink adds to the remainder rather than spending it.
 *
 *  It answers only what can be decided from geometry. `opens_a_gap`, the fourth reason a side can
 *  refuse, needs the rebuilt records and belongs to `fundColumnResize`.
 *
 *  **`absent` covers two ways a side can hold nothing to trade**: no empty column abuts the edge at
 *  all, and one abuts it but could not record the strip a shrink would hand it — see
 *  `recordsTheStripAShrinkHandsOver`. One reason rather than two, because the customer's answer is
 *  the same, "there is no space on this side", and because a column standing only over the wall row
 *  is not space a base run can spend. On a shrink the refusal is never terminal: `fundingScan` falls
 *  to ADR 0035 decision 7 and the run records the strip itself. */
function evaluateEmptySpace(
  input: SetWidthInput,
  records: readonly PlacementRecord[],
  plan: ColumnPlan,
  side: Side,
): EmptySpaceEvaluation {
  const neighbour = findAdjacentEmptyColumn(input.columns, records, plan, side);
  if (!neighbour) return { ok: false, reason: "absent" };

  const extent = emptyColumnExtent(neighbour);
  // A frozen extent that does not sit on whole millimetres cannot be moved onto them either, so it
  // is not empty space this command can spend. Unreachable from any shipped design.
  if (!extent) return { ok: false, reason: "absent" };

  const deltaMm = input.widthMm - plan.extent.widthMm;
  if (!recordsTheStripAShrinkHandsOver(plan.column, neighbour, deltaMm)) {
    return { ok: false, reason: "absent" };
  }

  const remainderMm = extent.widthMm - deltaMm;
  // **The only arithmetic bound on a growth** (ADR 0043). A remainder of any width at or above zero
  // is a legal state: the owner, 2026-09-01, *"Empty space can be even 100 mm or 50 mm, if somebody
  // want to keep it. Such narrow empty space will force user to resize accordingly and not leave
  // such spaces."* ADR 0031's remainder floor is superseded — refusing a growth that left under
  // `MIN_W` made the stepper one-way below its first rung, since `−50` twice leaves a 100 mm strip
  // and `+50` back would have left 50. ADR 0037 had already waived the floor on the shrink side.
  if (remainderMm < 0) return { ok: false, reason: "too_narrow" };
  return { ok: true, value: { column: neighbour, side, extent, remainderMm } };
}

/** ADR 0031's "empty" is **empty at every level**, matching the scope of the move: a column that is
 *  free only at the level being edited does not qualify, because the resize moves all levels.
 *
 *  That is exactly "no record is filed under this key", which is what §3.2's own membership says.
 *  The resized column's edges come from its members' stored millimetres rather than
 *  from `Column.w`, which is the MIN over members and goes stale when the narrowest one is deleted. */
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

/** Which empty column to spend when two abut the same edge. Two *can*: §3.2's columns are keyed on
 *  a centre and may overlap along the wall, so a 900 mm run and a 300 mm one can share a right-hand
 *  edge and both be empty.
 *
 *  It used to be whichever `columns.values()` yielded first — map insertion order, which is a
 *  property of how the design was loaded and not a rule anyone chose (logic review R1.8).
 *
 *  **The widest wins**, because it is the side most likely to fund the move at all. Ties break on
 *  the key, so the order is total and the same design always resizes the same way. Under ADR 0043
 *  this no longer decides whether a move is *allowed* — both choices are legal — only where the
 *  leftover gap ends up, and it is kept as it is because changing which side a resize spends is a
 *  product question. */
function byFundingCapacity(left: Column, right: Column): number {
  return right.w - left.w || left.key.localeCompare(right.key);
}

/** The edge an empty column on `side` presents to the run being resized: one on the right meets it
 *  with its own left edge. */
function facingEdgeM(column: Column, side: Side): number {
  const centreM = alongWallM(column.wall, column);
  return side === "right" ? centreM - column.w / 2 : centreM + column.w / 2;
}

/** **The column a shrink hands its strip to has to record that strip at every height the run stood
 *  at.** ADR 0031's "empty" is already "empty at every level" (`findAdjacentEmptyColumn`); this is
 *  the same sentence read the other way, about the level rather than about the emptiness.
 *
 *  A column is a space along the wall *and* a vertical extent, and a resize moves a boundary in both
 *  at once: the strip the run withdraws from is the strip the empty column takes, over the whole
 *  height the run stood at. Where the empty column stands at other heights, the width is conserved
 *  and the **floor is lost** — that part of the strip belongs to no placement, no recorded empty
 *  column and no derived void, and §4 derives nothing for it because both extents are frozen and
 *  neither covers it. That is the invisibility `EDGE_ABUTMENT_TOLERANCE_M` is set to avoid, arrived
 *  at by a different route.
 *
 *  **Measured, and older than the wave that surfaced it.** On a 1550×1600 L the built wall A shipped
 *  `base-corner-x-900[0,900]`, 50 mm of nothing, then `base-sink[950,1550]`, where the plan puts the
 *  sink at `[900,1500]`: the free-end shrink funded itself from the wall-row-only empty column at
 *  `[800,900]`, whose only region is 1.5–2.6 m, so the floor under the returned strip was recorded
 *  nowhere. The built design contradicted its own plan, which is why nothing measuring the plan
 *  could see it. The same strip is reachable on the **shipped reference kitchen** with two ordinary
 *  deletes and one step — `set-width.records-the-strip-it-hands-over.test.ts` walks it — so the
 *  repair belongs to this command and not to whatever composed the kitchen.
 *
 *  **A growth is left alone, and that is a scope decision rather than a claim that it is safe.** The
 *  mirror case exists: growing into an empty column whose bands the run does not cover leaves the
 *  uncovered part of the taken strip recorded nowhere, by the same arithmetic. It is not repaired
 *  here because refusing it **withdraws an operation customers have today** — growing a wall cabinet
 *  into the opening beside it is the commonest instance, and the suite has nine assertions across
 *  six files that spend it — and which of "refuse the growth" or "accept the sliver" is right is a
 *  product question rather than a defect. The shrink has no such cost: ADR 0035 decision 7 catches
 *  it and records the strip where the run actually vacated it.
 *
 *  **Asked of the column the scan already selected, rather than folded into
 *  `findAdjacentEmptyColumn`'s filter.** Filtering would let a narrower abutting column win where
 *  the widest one fails the band, and which of two abutting columns a resize spends is a product
 *  question this does not reopen (`byFundingCapacity`).
 *
 *  Both bands come from the **frozen** map, the one place a member-less column's heights survive, so
 *  the two sides of the comparison have the same source. */
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
