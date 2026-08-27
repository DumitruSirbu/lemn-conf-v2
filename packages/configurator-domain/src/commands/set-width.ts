// ADR 0031 — a resize moves a **whole column**, and adjacent **empty space** funds it.
//
// This supersedes `DEVELOPMENT-SPEC.md` §5.4's donor rule in full. §5.4 took the whole delta from a
// neighbouring cabinet in the same row; that rule shipped, and produced two reachable resizes in the
// entire kitchen, because the donor's residue had to land on a legal width of its own. Every defect
// it needed patching for is downstream of a resize **shrinking a cabinet nobody selected**.
//
// So there is no donor. Selecting any body resizes every member of its column, at every level, and
// the width comes from an empty column immediately left or right on the same wall: growing narrows
// it, shrinking widens it, and the run total is conserved either way.
//
// Every member's centre moves by the same amount, which is exactly why the rule fits §3.2's model —
// no body leaves the column it is in, so the only column identity that moves is the whole column's
// and the empty one's. See `rederiveTouchedColumns` in `void-engine.ts` for that half.
import type { BodyProbe } from "../body-probe.js";
import {
  resolveBuildableSizes,
  resolveCatalogEquivalent,
  toInsertableBody,
  type InsertableBody,
} from "../catalog.js";
import type { Design, DesignPlacement, DesignWall } from "../design.js";
import {
  MILLIMETRES_PER_METRE,
  toExactMillimetres,
  toMetres,
  toMillimetres,
} from "../millimetres.js";
import {
  deriveColumnKeyAt,
  derivePlacementRecords,
  recomputeVoids,
  rederiveTouchedColumns,
  withCurrentFullHeightMembers,
  MIN_WIDTH_M,
  type BodyCatalog,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../void-engine.js";
import {
  isValidOccurredAt,
  refuse,
  succeedWith,
  withPlacements,
  type BodyResizedEffect,
  type CommandResult,
  type CommandTarget,
} from "./command-result.js";
import {
  carriedAppearance,
  refuseBuiltSize,
  refuseUnusableMeasurement,
} from "./insert-body.js";
import { evaluateInsertFit, openingFromPlacement } from "./insert-fit.js";
import type {
  EmptySpaceRefusal,
  EmptySpaceSide,
  RejectionDetail,
} from "./rejection.js";

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

/** §2's `MIN_W` in millimetres — the floor the **empty column** is measured against (ADR 0031). */
const MIN_WIDTH_MM = toMillimetres(MIN_WIDTH_M);

/** Right is tried first and left only if right cannot fund the move, so the same design always
 *  resizes the same way. An order, not a set. */
const EMPTY_SPACE_ORDER: readonly Side[] = ["right", "left"];

/** Float noise from the millimetre↔metre round trip, for the one comparison that must distinguish
 *  "these two runs touch" from "this opening lies over that body". Touching is not overlapping. */
const OVERLAP_EPSILON_M = 1e-6;

type Side = EmptySpaceSide["side"];

export interface SetWidthInput {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  /** ADR 0011 Gap D: the frozen load-time extents. This command is the only one that may return a
   *  changed map, and it changes only the resized column's keys and the empty column's. */
  readonly columns: ReadonlyMap<string, Column>;
  readonly target: CommandTarget;
  readonly widthMm: number;
  readonly probe: BodyProbe;
  readonly occurredAt: string;
}

type SetWidthResult = CommandResult<BodyResizedEffect>;

type Resolved<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly detail: RejectionDetail };

/** One member of the column, resolved to the §7 entry it will be rebuilt through. */
interface ColumnMember {
  readonly record: PlacementRecord;
  readonly body: InsertableBody;
}

/** One body about to be rebuilt at a new width and a new centre. Under ADR 0031 every member of the
 *  column gets one of these and they all carry the **same** `widthMm` and the **same** `alongMm`. */
interface Rebuild extends ColumnMember {
  readonly widthMm: number;
  readonly alongMm: number;
}

/** A run's extent along its wall, in the integer millimetres the document holds. */
interface ExtentMm {
  readonly centreMm: number;
  readonly widthMm: number;
}

/** The empty column that funds the move, before the move is planned. */
interface EmptySpace {
  readonly column: Column;
  readonly side: Side;
  readonly extent: ExtentMm;
  /** What is left of it afterwards. `0` is legal and removes the column (ADR 0031 rule 6). */
  readonly remainderMm: number;
}

/** A frozen column moved to a new width and a new along-wall centre. **Both** columns a resize
 *  touches get one: the run being resized and the empty one funding it.
 *
 *  Both need it for the same reason (FINDING Q1.1). ADR 0011 Gap D freezes a column's `regions`,
 *  `top`, `d` and `ry` because a cleared run must keep the opening it just freed, and
 *  `rederiveTouchedColumns` answers a key from the members **left** under it — so a column that had
 *  a member deleted earlier in the session loses that member's region the moment a resize re-derives
 *  it, and the opening the customer freed vanishes with no void and no way back. The resize is not
 *  a delete: it moves the boundary of the space a run occupies, so `w`, the centre and the key move
 *  and nothing else does.
 *
 *  `widthMm === 0` means the resize consumed the space exactly, and the key is removed (rule 6).
 *  Only the empty column can reach zero. */
interface FrozenColumnMove {
  readonly column: Column;
  readonly widthMm: number;
  readonly centreMm: number;
}

interface ColumnResize {
  readonly label: string;
  readonly members: readonly Rebuild[];
  readonly resized: FrozenColumnMove;
  readonly empty: FrozenColumnMove;
  readonly side: Side;
}

/** What one attempt needs that is the same for both sides: the request, the records it started
 *  from, the selected placement, and the overlaps that were already there before anything moved. */
interface AttemptContext {
  readonly input: SetWidthInput;
  readonly records: readonly PlacementRecord[];
  readonly record: PlacementRecord;
  readonly covered: OverlapSet;
}

/** One side's move, carried all the way through the rebuild. `opens_a_gap` is not a refusal yet —
 *  it sends the scan to the other side (FINDING Q1.2) — while `refused` is a fact about the bodies
 *  and the width that the other side would answer identically. */
type ColumnResizeAttempt =
  | { readonly outcome: "ok"; readonly result: SetWidthResult }
  | { readonly outcome: "opens_a_gap" }
  | { readonly outcome: "refused"; readonly detail: RejectionDetail };

/** Everything ADR 0031 decides **before** it knows which side will fund the move: the column, its
 *  members, its extent, and that the requested width is legal for all of them. */
interface ColumnPlan {
  readonly label: string;
  readonly column: Column;
  readonly members: readonly ColumnMember[];
  readonly extent: ExtentMm;
}

export function setWidth(input: SetWidthInput): SetWidthResult {
  const { design } = input;
  if (input.target.kind === "void") {
    return refuse(design, { code: "VOID_SELECTED", params: {} });
  }
  if (!isValidOccurredAt(input.occurredAt)) {
    return refuse(design, { code: "INVALID_OCCURRED_AT", params: {} });
  }

  const records = derivePlacementRecords(design, input.catalog);
  const record = records.find((candidate) => candidate.id === input.target.id);
  if (!record) {
    return refuse(design, { code: "TARGET_NOT_FOUND", params: {} });
  }

  const plan = planColumnResize(input, records, record);
  if (!plan.ok) return refuse(design, plan.detail);
  return fundColumnResize(input, records, record, plan.value);
}

/** Everything ADR 0031 decides about the **column**, before anything is built and before a side is
 *  chosen: the selected body has a width to change, its column is flush, every member of it can be
 *  rebuilt, and the requested width is in the intersection of their sets. Which side funds the move
 *  is `fundColumnResize`'s question, and it is a separate one (FINDING Q1.2). */
function planColumnResize(
  input: SetWidthInput,
  records: readonly PlacementRecord[],
  record: PlacementRecord,
): Resolved<ColumnPlan> {
  const selected = resolveResizableBody(input.catalog, record);
  if (!selected.ok) return selected;
  const label = selected.value.label;

  const column = input.columns.get(record.col);
  if (!column) {
    return {
      ok: false,
      detail: { code: "COLUMN_MISMATCH", params: { label } },
    };
  }

  const members = resolveColumnMembers(input.catalog, records, record, label);
  if (!members.ok) return members;

  const extent = resolveColumnExtent(input.design, members.value);
  if (!extent) {
    return {
      ok: false,
      detail: { code: "COLUMN_MEMBERS_UNALIGNED", params: { label } },
    };
  }

  const illegal = refuseIllegalWidth(input, label, members.value, extent);
  if (illegal) return { ok: false, detail: illegal };

  return { ok: true, value: { label, column, members: members.value, extent } };
}

/** §9's `canWidth` read from the engine's end, for the body the customer actually selected: an
 *  accessory owns no width, a `fixedWidth` entry is made at one size, and a body with no §7
 *  equivalent (the corners, ADR 0011 Gap A) has nothing to be rebuilt through.
 *
 *  **Identity is declared, never inferred.** The equivalent comes from `resolveCatalogEquivalent`,
 *  which reads the pointer the row declares (ADR 0022) and verifies it is `insertable`. §5.4's
 *  `buildIdOf` mesh-tree inspection is closed by name in ADR 0011 Gap A, §6.3 and §13.2. */
function resolveResizableBody(
  catalog: BodyCatalog,
  record: PlacementRecord,
): Resolved<InsertableBody> {
  const body = resolveRebuildBody(catalog, record);
  if (body && !record.accessory && !record.fixedWidth) {
    return { ok: true, value: body };
  }
  return {
    ok: false,
    detail: {
      code: "NOT_RESIZABLE",
      params: { label: body?.label ?? describeRecordLabel(catalog, record) },
    },
  };
}

/** ADR 0031 rule 1: the scope is the column, so **every** member has to be rebuildable, not just
 *  the one that was tapped. A corner, an appliance or a hob standing at any level of the column
 *  stops the whole move — and the refusal names that body rather than the selected one, because the
 *  customer is looking at something else entirely and needs to be told what is in the way.
 *
 *  Accessories never appear here: §3.2 leaves them out of a column, so they neither block a resize
 *  nor move with one. */
function resolveColumnMembers(
  catalog: BodyCatalog,
  records: readonly PlacementRecord[],
  record: PlacementRecord,
  label: string,
): Resolved<readonly ColumnMember[]> {
  const members: ColumnMember[] = [];
  for (const member of columnMembers(records, record.col)) {
    const body = resolveResizableBody(catalog, member);
    if (!body.ok) {
      return {
        ok: false,
        detail: {
          code: "COLUMN_MEMBER_NOT_RESIZABLE",
          params: { label, memberLabel: memberLabelOf(body.detail, label) },
        },
      };
    }
    members.push({ record: member, body: body.value });
  }
  return { ok: true, value: members };
}

/** `resolveResizableBody`'s refusal already carries the member's own name; this reads it back out
 *  rather than resolving the label a second time and risking two answers. */
function memberLabelOf(detail: RejectionDetail, fallback: string): string {
  return detail.code === "NOT_RESIZABLE" ? detail.params.label : fallback;
}

/** §3.2's membership: the bodies filed under one column key, in placement order. */
function columnMembers(
  records: readonly PlacementRecord[],
  col: string,
): readonly PlacementRecord[] {
  return records.filter((record) => record.col === col && !record.accessory);
}

/** The column's own extent, and the precondition ADR 0031's arithmetic leaves implicit: its members
 *  must start **flush**. "All members' centres move by the same amount" is only a boundary move if
 *  they share a boundary to begin with, and a column whose members sit at different widths has two.
 *
 *  Reachable rather than theoretical — insert a 450 mm dishwasher into a 600 mm column's opening and
 *  the column holds a 450 and a 600 under one key. `undefined` refuses; squaring the column up
 *  silently would resize a body the customer did not select, which is the one thing ADR 0031 exists
 *  to prevent.
 *
 *  Read from the stored placements rather than from the derived frames or from `Column.w`: those are
 *  the integers the document holds, `Column.w` is the MIN over members and can be stale after a
 *  delete, and a metre round trip would put a half-nanometre into a coordinate that must stay exact. */
function resolveColumnExtent(
  design: Design,
  members: readonly ColumnMember[],
): ExtentMm | undefined {
  const placements = members.map((member) =>
    findPlacement(design, member.record.id),
  );
  const first = placements[0];
  if (!first) return undefined;
  const flush = placements.every(
    (placement) =>
      placement !== undefined &&
      placement.alongMm === first.alongMm &&
      placement.body.widthMm === first.body.widthMm,
  );
  if (!flush) return undefined;
  return { centreMm: first.alongMm, widthMm: first.body.widthMm };
}

/** The §7 entry a body would be rebuilt through, in its insertable shape. A resize rebuilds through
 *  the catalogue equivalent, so **a resized seeded body migrates its `buildId`**: after resizing a
 *  `base-drawer2-600` the stored placement carries `base-panbank`. It has to —
 *  `buildDecomposedBody` takes no width, and every seeded id is one fixed geometry. */
function resolveRebuildBody(
  catalog: BodyCatalog,
  record: PlacementRecord,
): InsertableBody | undefined {
  const equivalent = resolveCatalogEquivalent(catalog, record.buildId);
  if (!equivalent) return undefined;
  return toInsertableBody(equivalent.buildId, equivalent.definition);
}

/** A seeded row carries no `label`, so the refusal falls back to the entry's kind — the same
 *  fallback §9's header uses. */
function describeRecordLabel(
  catalog: BodyCatalog,
  record: PlacementRecord,
): string {
  return catalog.get(record.buildId)?.label ?? record.kind;
}

/** ADR 0031 rule 5: **a column's legal widths are the intersection of its members' declared sets** —
 *  and a `widthFlex: 'fit'` member "accepts any width above its floor and so does not narrow the
 *  intersection".
 *
 *  Those two sentences are both true, and reading the second one against `sizesMm` alone makes them
 *  contradict (FINDING Q1.3). A `'fit'` entry's set carries two different kinds of fact:
 *  `wall-2door`'s `[600, 800]` is a **bound**, because below 600 §7's builder makes one door under a
 *  two-door label (ADR 0029); `base-panbank`'s `[400, 600, 800]` is the **standard ladder**, and 400
 *  is the narrowest standard module rather than the narrowest honest pan bank. The catalogue now says
 *  which it has — `sizesAreStandardLadder`, declared per row — so a ladder member constrains a column
 *  only by its floor while a bounded one still binds.
 *
 *  Measured, on the shipped kitchen, with the distinction collapsed either way: treat every set as a
 *  bound and a 400 mm pan bank under a 400 mm one-door cabinet cannot reach 300, which rule 5 says it
 *  must; treat none as a bound and a resize reaches `wall-2door` at 400 and `wall-1door` at 800,
 *  which are ADR 0029 and ADR 0030 by name. Neither ADR moves, and the shipped kitchen's accepted
 *  population is unchanged at fifteen taps: every column there is bounded by a member that declares
 *  its own set.
 *
 *  Each member's set is resolved through `resolveBuildableSizes`, the same function §9 renders chips
 *  from, so a width the panel offers is a width this command will accept — for the member's own row
 *  at least. The intersection is the part §9 does not yet know about; see the note in `describe-
 *  selection.ts` about what the panel can and cannot derive from one selection.
 *
 *  Refusing the width the column already sits at is what keeps §9's tri-state honest: `active` and
 *  `free` are different states, and "a chip is free iff the command succeeds" is only true if the
 *  command refuses at the current width. */
function refuseIllegalWidth(
  input: SetWidthInput,
  label: string,
  members: readonly ColumnMember[],
  extent: ExtentMm,
): RejectionDetail | undefined {
  const sizesMm = intersectColumnWidths(input.catalog, members);
  if (!sizesMm.includes(input.widthMm)) {
    return {
      code: "WIDTH_NOT_SUPPORTED",
      params: { label, sizesMm, availableMm: extent.widthMm },
    };
  }
  if (input.widthMm === extent.widthMm) {
    return {
      code: "WIDTH_UNCHANGED",
      params: { label, widthMm: extent.widthMm },
    };
  }
  return undefined;
}

function intersectColumnWidths(
  catalog: BodyCatalog,
  members: readonly ColumnMember[],
): readonly number[] {
  // A width has to be one **somebody** in the column offers, or the column would be resizable to a
  // width no chip in it renders. The ladder members widen this candidate list; the bounded ones
  // narrow what survives it.
  const offered = new Set(
    members.flatMap((member) =>
      resolveBuildableSizes(catalog, member.record.buildId),
    ),
  );
  return [...offered]
    .filter((widthMm) =>
      members.every((member) => acceptsWidth(catalog, member, widthMm)),
    )
    .sort((left, right) => left - right);
}

/** Whether one member can take a width. A member whose set is the standard ladder is bounded only by
 *  the floor that governs it (ADR 0017, ADR 0026); every other member is bounded by its own set,
 *  which `resolveBuildableSizes` has already narrowed by that same floor. */
function acceptsWidth(
  catalog: BodyCatalog,
  member: ColumnMember,
  widthMm: number,
): boolean {
  if (member.body.definition.sizesAreStandardLadder === true) {
    return widthMm >= (member.body.minWidthMm ?? MIN_WIDTH_MM);
  }
  return resolveBuildableSizes(catalog, member.record.buildId).includes(
    widthMm,
  );
}

type EmptySpaceEvaluation =
  | { readonly ok: true; readonly value: EmptySpace }
  | { readonly ok: false; readonly reason: EmptySpaceRefusal };

/** ADR 0031 rule 2, and **the phantom test is part of it** (FINDING Q1.2).
 *
 *  It used to pick the first side that funded the move on geometry and the `MIN_W` floor alone, and
 *  run the phantom check once afterwards, on the side already chosen. There was no fallback, so
 *  a side that would have worked was never tried — and *making more space available made a
 *  previously legal move illegal*: with only the left column empty, narrowing `A|0.75` to 200 is
 *  accepted; clear the right one **as well** and the scan takes the right, widens it to 900 mm over
 *  the corner leg `p25`, and refuses. Whether a side can fund the move is one question, and an
 *  opening landing on a body is one of the ways the answer is no.
 *
 *  So each side is carried all the way through the rebuild, and a phantom sends the scan on to the
 *  other side exactly as the superseded donor scan fell through. At most two attempts; the probe is
 *  called again for the second, which is the price of answering the question properly.
 *
 *  Anything else a rebuild refuses — a built-size mismatch, an unmeasurable body, a drifted column —
 *  returns immediately. Those are facts about the bodies and the width, identical on both sides, and
 *  retrying would only produce the same refusal with a different neighbour named. */
function fundColumnResize(
  input: SetWidthInput,
  records: readonly PlacementRecord[],
  record: PlacementRecord,
  plan: ColumnPlan,
): SetWidthResult {
  // Measured once, before anything moves: the bodies §4 already derives an opening on top of. A
  // resize is answerable for the overlaps it creates and for no others (logic review R1.7).
  const covered = bodiesUnderOpenings(records, input.columns);
  const refusedSides: EmptySpaceSide[] = [];
  for (const side of EMPTY_SPACE_ORDER) {
    const space = evaluateEmptySpace(input, records, plan, side);
    if (!space.ok) {
      refusedSides.push({ side, reason: space.reason });
      continue;
    }
    const move = planMoves(input, plan, space.value);
    if (!move.ok) return refuse(input.design, move.detail);

    const attempt = applyColumnResize(
      { input, records, record, covered },
      move.value,
    );
    if (attempt.outcome === "ok") return attempt.result;
    if (attempt.outcome === "refused") {
      return refuse(input.design, attempt.detail);
    }
    refusedSides.push({ side, reason: "opens_a_gap" });
  }
  return refuse(input.design, refuseNoSideFunds(input, plan, refusedSides));
}

/** Which of the two codes the customer reads, once both sides have answered.
 *
 *  `RESIZE_OPENS_GAP` wins whenever **any** side could have funded the move and was stopped by an
 *  opening landing on a body, because that is the specific thing that went wrong and the thing the
 *  refusal exists to name. `NO_EMPTY_SPACE` is the answer when no side got that far. Both carry the
 *  whole scan, so either way the sentence says which side was tried and why — "no room" on its own
 *  leaves the customer with nothing to act on, and they need to know which side to clear. */
function refuseNoSideFunds(
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
  const opensAGap = sides.some((side) => side.reason === "opens_a_gap");
  return opensAGap
    ? { code: "RESIZE_OPENS_GAP", params }
    : { code: "NO_EMPTY_SPACE", params };
}

/** ADR 0031 rules 3 and 6: growing consumes the empty column and shrinking returns width to it,
 *  and the remainder is either zero or at least `MIN_W`. Shrinking can never fail this test — the
 *  empty column only widens — so the two floor reasons below are reachable on growth alone.
 *
 *  It answers only what can be decided from geometry. `opens_a_gap`, the fourth reason a side can
 *  refuse, needs the rebuilt records and belongs to `fundColumnResize`. */
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

  const remainderMm = extent.widthMm - (input.widthMm - plan.extent.widthMm);
  if (remainderMm < 0) return { ok: false, reason: "too_narrow" };
  if (remainderMm > 0 && remainderMm < MIN_WIDTH_MM) {
    return { ok: false, reason: "remainder_below_floor" };
  }
  return { ok: true, value: { column: neighbour, side, extent, remainderMm } };
}

/** ADR 0031's "empty" is **empty at every level**, matching the scope of the move: a column that is
 *  free only at the level being edited does not qualify, because the resize moves all levels.
 *
 *  That is exactly "no non-accessory record is filed under this key", which is what §3.2's own
 *  membership says. The resized column's edges come from its members' stored millimetres rather than
 *  from `Column.w`, which is the MIN over members and goes stale when the narrowest one is deleted. */
function findAdjacentEmptyColumn(
  columns: ReadonlyMap<string, Column>,
  records: readonly PlacementRecord[],
  plan: ColumnPlan,
  side: Side,
): Column | undefined {
  const occupied = new Set(
    records.filter((record) => !record.accessory).map((record) => record.col),
  );
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
 *  property of how the design was loaded and not a rule anyone chose (logic review R1.8). **The
 *  widest wins**: it is the one most likely to fund the move at all, and the one least likely to be
 *  left under `MIN_W` as an unusable sliver. Ties break on the key, so the order is total and the
 *  same design always resizes the same way. */
function byFundingCapacity(left: Column, right: Column): number {
  return right.w - left.w || left.key.localeCompare(right.key);
}

/** The edge an empty column on `side` presents to the run being resized: one on the right meets it
 *  with its own left edge. */
function facingEdgeM(column: Column, side: Side): number {
  const centreM = alongWallM(column.wall, column);
  return side === "right" ? centreM - column.w / 2 : centreM + column.w / 2;
}

/** An empty column has no member to read integers off, so its extent comes from the frozen map —
 *  the one place its geometry survives at all once the last body in it was deleted. */
function emptyColumnExtent(column: Column): ExtentMm | undefined {
  const centreMm = toExactMillimetres(alongWallM(column.wall, column));
  const widthMm = toExactMillimetres(column.w);
  if (centreMm === undefined || widthMm === undefined) return undefined;
  return { centreMm, widthMm };
}

/** The along-wall coordinate: `x` on wall A, `z` on wall B — the axis `deriveColumnKey` buckets on
 *  and the only one a resize moves anything along. */
function alongWallM(
  wall: DesignWall,
  position: { readonly x: number; readonly z: number },
): number {
  return wall === "A" ? position.x : position.z;
}

/** ADR 0031's arithmetic, and the whole of what the rule means: the column's outer edge — the one
 *  **away** from the empty space — holds, the empty column's far edge holds, and the boundary
 *  between them absorbs the whole delta. The two runs therefore still meet exactly where they met,
 *  so the run total is conserved and neither an overlap nor a gap is representable.
 *
 *  Every member takes the same new centre, which is rule 1 in one line: no body leaves the column,
 *  because they were flush and they stay flush. */
function planMoves(
  input: SetWidthInput,
  plan: ColumnPlan,
  empty: EmptySpace,
): Resolved<ColumnResize> {
  const outward = empty.side === "right" ? 1 : -1;
  const heldMm = plan.extent.centreMm - (outward * plan.extent.widthMm) / 2;
  const alongMm = heldMm + (outward * input.widthMm) / 2;

  const emptyFarMm =
    empty.extent.centreMm + (outward * empty.extent.widthMm) / 2;
  const emptyCentreMm = emptyFarMm - (outward * empty.remainderMm) / 2;

  return refuseFractionalCentres({
    label: plan.label,
    side: empty.side,
    members: plan.members.map((member) => ({
      ...member,
      widthMm: input.widthMm,
      alongMm,
    })),
    // Both columns move as frozen extents, and for the same reason — see `FrozenColumnMove`.
    resized: {
      column: plan.column,
      widthMm: input.widthMm,
      centreMm: alongMm,
    },
    empty: {
      column: empty.column,
      widthMm: empty.remainderMm,
      centreMm: emptyCentreMm,
    },
  });
}

/** Every **persisted** coordinate must land on a whole millimetre (§2). Half of an odd width would
 *  not, and the schema stores `alongMm` as an integer — so a catalogue set that ever lists a width
 *  of the opposite parity to the column's current one is refused here rather than rounded into a
 *  body that no longer meets its neighbour.
 *
 *  **The members only** (logic review R1.5). It used to check the empty column's new centre too, and
 *  that value is never persisted: it is consumed by `toMetres` and by `deriveColumnKeyAt`, which
 *  rounds to two decimals. §2's rule binds what the document stores, and the frozen map is derived
 *  state — a resize the model represents perfectly was being refused, under a code naming
 *  `alongMm`, a placement field that value is not.
 *
 *  Dropping it also settles R1.4, which asked whether an unfundable side should end the scan here.
 *  It cannot: a member's centre is `columnCentre ± (newWidth − oldWidth) / 2`, so it is fractional
 *  exactly when the delta is odd — a fact about the two widths and not about which side pays, and
 *  one the other side would answer identically. Returning immediately is therefore right.
 *
 *  (The empty column's centre could never have fired alone either, as it happens: it is
 *  `farEdge − remainder / 2`, and both terms move onto half-millimetres together with the delta's
 *  parity. The check was redundant as well as wrong about which rule it was enforcing.) */
function refuseFractionalCentres(move: ColumnResize): Resolved<ColumnResize> {
  const fractionalMm = move.members
    .map((member) => member.alongMm)
    .find((value) => !Number.isInteger(value));
  if (fractionalMm === undefined) return { ok: true, value: move };
  return {
    ok: false,
    detail: {
      code: "NON_INTEGER_MILLIMETRES",
      params: { field: "alongMm", valueMm: fractionalMm },
    },
  };
}

function findPlacement(
  design: Design,
  placementId: string,
): DesignPlacement | undefined {
  return design.placements.find((placement) => placement.id === placementId);
}

/** Rebuild every member of the column, write them into the design, then update the two column keys
 *  the move touched. Nothing is written unless **every** rebuild passes every guard `insertBody`
 *  applies — §9's "refuse before offering, never after the tap" is only true of a resize if the
 *  whole column is atomic. */
function applyColumnResize(
  attempt: AttemptContext,
  move: ColumnResize,
): ColumnResizeAttempt {
  const { input, records, record } = attempt;
  const rebuilt = new Map<string, DesignPlacement>();
  for (const plan of move.members) {
    const built = rebuild(input, records, plan);
    if (!built.ok) return { outcome: "refused", detail: built.detail };
    rebuilt.set(built.value.id, built.value);
  }

  const design = withPlacements(
    input.design,
    input.design.placements.map(
      (placement) => rebuilt.get(placement.id) ?? placement,
    ),
    input.occurredAt,
  );

  const moved = derivePlacementRecords(design, input.catalog);
  const columns = moveFrozenColumns(
    rederiveTouchedColumns(input.columns, records, moved),
    move,
    moved,
  );
  const drift = refuseColumnDrift(columns, moved, rebuilt, move.label);
  if (drift) return { outcome: "refused", detail: drift };
  if (opensAnOpeningOverABody(attempt.covered, moved, columns)) {
    return { outcome: "opens_a_gap" };
  }

  return {
    outcome: "ok",
    result: succeedWith(design, resizedEffect(record, move, rebuilt, columns)),
  };
}

function resizedEffect(
  record: PlacementRecord,
  move: ColumnResize,
  rebuilt: ReadonlyMap<string, DesignPlacement>,
  columns: ReadonlyMap<string, Column>,
): BodyResizedEffect {
  const selected = rebuilt.get(record.id);
  return {
    type: "body_resized",
    placementId: record.id,
    buildId: selected?.body.buildId ?? record.buildId,
    widthMm: move.members[0]?.widthMm ?? record.widthMm,
    columnPlacementIds: move.members.map((member) => member.record.id),
    emptyColumnKey: move.empty.column.key,
    ...(move.empty.widthMm > 0
      ? { emptyColumnNewKey: frozenColumnKey(move.empty) }
      : {}),
    emptyColumnWidthMm: move.empty.widthMm,
    columns,
  };
}

/** **Both** columns a resize touches, moved as the frozen extents ADR 0011 Gap D says they are:
 *  `regions`, `top`, `d` and `ry` come through untouched, and only `w`, the along-wall centre and
 *  the key move.
 *
 *  For the **empty** column that is the only way it can move at all — `rederiveTouchedColumns`
 *  answers a key from the members filed under it, and an empty column has none, so its geometry
 *  survives only in the frozen map.
 *
 *  For the **resized** column it is FINDING Q1.1. That function *does* answer its key, from the
 *  members left standing — and a column that had a member deleted earlier in the session has already
 *  lost that member from its membership while the frozen map still carries its region. Re-deriving
 *  drops the region, and the opening the customer just freed disappears: delete a wall cabinet, see
 *  the empty slot, narrow the cabinet still standing above it, and the slot is gone with no void and
 *  no way back. That is ADR 0011 Gap D verbatim, and ADR 0031 is what made it reachable — before
 *  column scope, a resize never moved a key with a *deleted* sibling under it.
 *
 *  Only `min(regions)` and `top` reach §4 (`deriveFreeSpans` takes what is *taken* from the current
 *  records), so carrying a frozen region whose member was rebuilt slightly taller changes nothing —
 *  the free spans are still computed from the bodies that are actually standing there.
 *
 *  A width of zero **removes** the key (rule 6). Only the empty column can reach it: consuming the
 *  space exactly is the one case where a column ceases to exist without anything being deleted.
 *
 *  Deleting both old keys before setting either new one, so the two passes cannot race: the empty
 *  column's old key and the resized column's new key are always distinct (their centres differ by at
 *  least half the resized column's width), but ordering that has to be reasoned about is ordering
 *  that will eventually be got wrong. */
function moveFrozenColumns(
  columns: ReadonlyMap<string, Column>,
  move: ColumnResize,
  records: readonly PlacementRecord[],
): ReadonlyMap<string, Column> {
  const updated = new Map<string, Column>(columns);
  for (const frozen of frozenMoves(move)) updated.delete(frozen.column.key);
  for (const frozen of frozenMoves(move)) {
    if (frozen.widthMm <= 0) continue;
    const centreM = toMetres(frozen.centreMm);
    updated.set(frozenColumnKey(frozen), {
      ...frozen.column,
      key: frozenColumnKey(frozen),
      w: toMetres(frozen.widthMm),
      ...(frozen.column.wall === "A" ? { x: centreM } : { z: centreM }),
    });
  }
  return withCurrentFullHeightMembers(updated, records);
}

function frozenMoves(move: ColumnResize): readonly FrozenColumnMove[] {
  return [move.resized, move.empty];
}

/** §3.2's key for a column at its new centre, derived exactly as an occupied column's is — an
 *  empty column has no member to derive one from, and a body later inserted into it must land under
 *  a key the map actually holds or `insertBody` refuses `COLUMN_MISMATCH`. */
function frozenColumnKey(frozen: FrozenColumnMove): string {
  return deriveColumnKeyAt(frozen.column.wall, toMetres(frozen.centreMm));
}

/** One body rebuilt at its new width, through the identical path `insertBody` uses: §5.2's fit
 *  guards, the probe, and the built-carcass re-check behind it. A resize that would build a body
 *  the engine refuses — `BUILT_SIZE_MISMATCH`, the sink's `minWidthMm` (ADR 0017), the hood's fixed
 *  710 (ADR 0016) — is refused here, and §9 wants that refusal to be unreachable in the first
 *  place: this is the backstop, not the gate. */
function rebuild(
  input: SetWidthInput,
  records: readonly PlacementRecord[],
  plan: Rebuild,
): Resolved<DesignPlacement> {
  const placement = findPlacement(input.design, plan.record.id);
  const column = input.columns.get(plan.record.col);
  if (!placement || !column) {
    return {
      ok: false,
      detail: { code: "COLUMN_MISMATCH", params: { label: plan.body.label } },
    };
  }

  // §5.3's opening, with the new width written over it. Everything else — the level slot, the span
  // it belongs to and the **depth** — is the opening this body already stands in, because a resize
  // changes a width and nothing else. Reading the depth from anywhere but here is how a swap once
  // built a wall cabinet to the depth of the base cabinet below it.
  const opening = {
    ...openingFromPlacement(plan.record, records, input.columns),
    alongM: toMetres(plan.alongMm),
    w: toMetres(plan.widthMm),
  };
  const fit = evaluateInsertFit({ body: plan.body, opening, column });
  if (!fit.ok) return { ok: false, detail: fit.detail };

  const measurement = input.probe.measure({
    buildId: plan.body.buildId,
    widthM: fit.plan.widthM,
    heightM: fit.plan.heightM,
    depthM: fit.plan.depthM,
  });
  const mismatch = refuseBuiltSize(plan.body, fit.plan, measurement);
  if (mismatch) return { ok: false, detail: mismatch };
  const unusable = refuseUnusableMeasurement(plan.body, measurement);
  if (unusable) return { ok: false, detail: unusable };

  const heightMm = toExactMillimetres(fit.plan.heightM);
  if (heightMm === undefined) {
    return {
      ok: false,
      detail: {
        code: "NON_INTEGER_MILLIMETRES",
        params: {
          field: "heightMm",
          valueMm: fit.plan.heightM * MILLIMETRES_PER_METRE,
        },
      },
    };
  }

  return {
    ok: true,
    value: {
      ...placement,
      // A resize moves a body along its wall and nowhere else, so `y0Mm` and `wall` come through
      // untouched: the module line a body stands on is not a function of its width.
      alongMm: plan.alongMm,
      body: {
        buildId: plan.body.buildId,
        widthMm: plan.widthMm,
        heightMm,
        seatDepthMm: toMillimetres(2 * measurement.seatOffsetM),
        // §11 rows 12 and 13, now for **every** member of the resized column.
        ...carriedAppearance(plan.body, plan.record),
      },
    },
  };
}

/** **`RESIZE_OPENS_GAP`, re-stated by ADR 0031 rather than deleted**, and asked here as a question
 *  rather than answered as a verdict.
 *
 *  It used to compare §4's derived opening set before and after and refuse on any difference. Under
 *  ADR 0031 that fires on every legal resize, because the empty column funding the move shrinks —
 *  so the comparison had to go while the defect it guarded stayed. This is that defect said
 *  directly: **no opening may appear where a body physically stands.**
 *
 *  Still reachable, and for a reason worth knowing. The empty column's extent is frozen (ADR 0011
 *  Gap D) while its width moves, so widening it past what its own members used to cover can bring
 *  its load-time regions over a body in a *neighbouring* column. Measured on the shipped kitchen:
 *  clear `A|1.30`, narrow `A|0.75` to 200, and the empty column reaches 900 mm wide with a base
 *  opening across the corner leg `p25` is standing in.
 *
 *  Refusing is the conservative direction and the one §9 asks for: a resize that cannot be
 *  represented is refused **before** it is offered, and the customer keeps a kitchen whose empty
 *  slots are all real. But it is refused only when **both** sides answer this way — the caller
 *  treats a `true` here as one side declining to fund the move, not as the end of the scan.
 *
 *  **It asks about the difference, not about the world** (logic review R1.7). Scanning every opening
 *  against every body meant that one pre-existing overlap — from seeded data, from a future command,
 *  from the near-abutment R1.8 describes — would refuse *every* resize anywhere in the design, on
 *  both sides, with a sentence about neighbours that had nothing to do with the cause and no action
 *  the customer could take. A body already standing under an opening is not this move's doing; a
 *  body that was not, and now is, is exactly what this refusal exists for. */
function opensAnOpeningOverABody(
  before: OverlapSet,
  records: readonly PlacementRecord[],
  columns: ReadonlyMap<string, Column>,
): boolean {
  const after = bodiesUnderOpenings(records, columns);
  return [...after].some((placementId) => !before.has(placementId));
}

type OverlapSet = ReadonlySet<string>;

/** Which bodies currently have an opening derived on top of them — **by placement id**, not by
 *  opening, so the comparison survives the one thing a resize always does to an opening: move it
 *  onto a new column key. */
function bodiesUnderOpenings(
  records: readonly PlacementRecord[],
  columns: ReadonlyMap<string, Column>,
): OverlapSet {
  const covered = new Set<string>();
  for (const opening of recomputeVoids(records, columns)) {
    for (const record of records) {
      if (standsInOpening(record, opening)) covered.add(record.id);
    }
  }
  return covered;
}

/** Overlapping, not merely adjoining — the same distinction `overlapsAlongWall` draws in
 *  `void-engine.ts`. Two runs that meet on a boundary share a coordinate and nothing else, and an
 *  opening that starts exactly where a body ends is the normal case rather than the defect. */
function standsInOpening(
  record: PlacementRecord,
  opening: VoidRecord,
): boolean {
  if (record.accessory || record.wall !== opening.wall) return false;
  const recordAlongM = alongWallM(record.wall, record.frame);
  const openingAlongM = alongWallM(opening.wall, opening);
  return (
    overlaps(recordAlongM, record.frame.w, openingAlongM, opening.w) &&
    overlaps(
      record.frame.y0 + record.frame.h / 2,
      record.frame.h,
      opening.y0 + opening.h / 2,
      opening.h,
    )
  );
}

/** Two centred spans overlap when the gap between their edges is positive by more than float noise. */
function overlaps(
  leftCentre: number,
  leftSize: number,
  rightCentre: number,
  rightSize: number,
): boolean {
  const gap =
    Math.min(leftCentre + leftSize / 2, rightCentre + rightSize / 2) -
    Math.max(leftCentre - leftSize / 2, rightCentre - rightSize / 2);
  return gap > OVERLAP_EPSILON_M;
}

/** ADR 0011 Gap D, read for the one command that legitimately moves a body between columns: every
 *  body this operation moved must land in a key the updated map actually holds. A body filed under
 *  a key nothing derived is a phantom column, and §4 would simply never see it — no void, no
 *  opening, no way back. Asserted rather than assumed, the same way `insertBody` asserts it. */
function refuseColumnDrift(
  columns: ReadonlyMap<string, Column>,
  records: readonly PlacementRecord[],
  rebuilt: ReadonlyMap<string, DesignPlacement>,
  label: string,
): RejectionDetail | undefined {
  const drifted = records.find(
    (record) => rebuilt.has(record.id) && !columns.has(record.col),
  );
  if (!drifted) return undefined;
  return { code: "COLUMN_MISMATCH", params: { label } };
}
