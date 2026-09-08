// The shapes the phases of a width resize hand to one another.
//
// Types only, and deliberately: every phase of `setWidth` is a pure function over these values, so
// the one module they all import carries no behaviour of its own and cannot be a place a rule hides.
import type { BodyProbe } from "../body-probe.js";
import type { InsertableBody } from "../catalog.js";
import type { Design } from "../design.js";
import type { BodyCatalog, Column, PlacementRecord } from "../void-engine.js";
import type {
  BodyResizedEffect,
  CommandResult,
  CommandTarget,
} from "./command-result.js";
import type { EmptySpaceSide, RejectionDetail } from "./rejection.js";

export type Side = EmptySpaceSide["side"];

/** **What `rebuild` reads, and nothing else** (ADR 0103 decision 5).
 *
 *  A rebuild goes through the same path an insert takes (ADR 0055 decision 1), so three commands now
 *  reach `rebuild-resized-bodies.ts`: the resize it was written for, the depth change, and wave 6Z's
 *  dependent re-plan. Only the first has a target and a width, and `set-cabinet-depth.ts` used to
 *  fabricate both — a `UNUSED_BY_REBUILD = ""` target beside a `widthMm: 0` — which is how a sentinel
 *  becomes load-bearing once a third caller copies it.
 *
 *  `SetWidthInput` extends it rather than the two being separate shapes, so a resize still hands
 *  `rebuild` the same object it always did and the narrowing costs no call site. */
export interface RebuildInput {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  /** ADR 0011 Gap D: the frozen load-time extents, in their **recorded** face (ADR 0090
   *  Amendment B). Whichever command is rebuilding, the column a body is re-fitted against is the
   *  one the map holds for it. */
  readonly columns: ReadonlyMap<string, Column>;
  readonly probe: BodyProbe;
  readonly occurredAt: string;
}

export interface SetWidthInput extends RebuildInput {
  readonly target: CommandTarget;
  readonly widthMm: number;
}

export type SetWidthResult = CommandResult<BodyResizedEffect>;

export type Resolved<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly detail: RejectionDetail };

/** One member of the column, resolved to the §7 entry it will be rebuilt through and to the two
 *  integers its extent is read from.
 *
 *  `alongMm` and `widthMm` come from the **stored placement** rather than from the derived frame or
 *  from `Column.w`: those are the integers the document holds, `Column.w` is the MIN over members
 *  and can be stale after a delete, and a metre round trip would put a half-nanometre into a
 *  coordinate that must stay exact. */
export interface ColumnMember {
  readonly record: PlacementRecord;
  readonly body: InsertableBody;
  readonly alongMm: number;
  readonly widthMm: number;
}

/** A column split by ADR 0035 decision 6: the bodies the column's width governs, and the hoods it
 *  does not. `members` is non-empty by construction — the selected body is always one of them. */
export interface ColumnUnit {
  readonly members: readonly [ColumnMember, ...ColumnMember[]];
  readonly hoods: readonly ColumnMember[];
}

/** What resolving a column's membership needs, and all it needs: the design the integers are read
 *  from, the catalogue the entries resolve through, the records the column is filtered out of, and
 *  the selected body's label, which every refusal is phrased in terms of. */
export interface ColumnContext {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly records: readonly PlacementRecord[];
  readonly label: string;
}

/** One body about to be rebuilt: the same `ColumnMember`, with `alongMm` and `widthMm` moved from
 *  the values it is standing at to the ones it is going to.
 *
 *  Under ADR 0031 every member of the column carries the **same** `alongMm`, and under ADR 0035
 *  decision 6 every member the column's width governs carries the **same** `widthMm` — that is what
 *  squaring up is. A hood is the exception on the second half only: it takes the new centre and
 *  keeps the width it had. */
export type Rebuild = ColumnMember;

/** A run's extent along its wall, in the integer millimetres the document holds. */
export interface ExtentMm {
  readonly centreMm: number;
  readonly widthMm: number;
}

/** The empty column that funds the move, before the move is planned. */
export interface EmptySpace {
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
export interface FrozenColumnMove {
  readonly column: Column;
  readonly widthMm: number;
  readonly centreMm: number;
}

export interface ColumnResize {
  readonly label: string;
  /** The width the column was squared up to. Read from here rather than off the first `Rebuild`,
   *  because that list also carries the hoods, which keep widths of their own. */
  readonly widthMm: number;
  readonly members: readonly Rebuild[];
  readonly resized: FrozenColumnMove;
  /** The empty column the move leaves against the run — **the near piece**, when ADR 0052's ceiling
   *  splits the space. `widthMm === 0` means the move consumed it exactly. */
  readonly empty: FrozenColumnMove;
  /** ADR 0052: the pieces of the freed space that did not fit under `MAX_EMPTY_COLUMN_WIDTH_MM`,
   *  beyond `empty` and away from the run. Empty on every move that frees no more than the ceiling,
   *  which is every move on the shipped kitchen until something wide is cleared.
   *
   *  A separate field rather than making `empty` a list, because the two are asked different
   *  questions: `empty` is the column the *next* resize on this side will fund from, and it is the
   *  one whose key `EmptySpace` was resolved against. Both are guarded and written identically —
   *  see `frozenMoves`. */
  readonly emptyOverflow: readonly FrozenColumnMove[];
  readonly side: Side;
}

/** Everything ADR 0031 decides **before** it knows which side will fund the move: the column, its
 *  members, its extent, and that the requested width is legal for all of them.
 *
 *  `members` are the bodies the column's width governs; `hoods` are the ones it does not (ADR 0035
 *  decision 6 as amended). Only `members` narrow the width, only `members` set the extent, and both
 *  lists are rebuilt — a hood at its own width and the run's new centre. */
export interface ColumnPlan {
  readonly label: string;
  readonly column: Column;
  readonly members: readonly [ColumnMember, ...ColumnMember[]];
  readonly hoods: readonly ColumnMember[];
  readonly extent: ExtentMm;
}
