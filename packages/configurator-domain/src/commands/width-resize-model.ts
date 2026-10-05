// The shapes the phases of a width resize hand to one another. Types only: every phase of `setWidth`
// is a pure function over these values, so the module they all import carries no behaviour and cannot
// be a place a rule hides.
import type { BodyProbe } from "../body-probe.js";
import type { BodyLabel, InsertableBody } from "../catalog.js";
import type { Design } from "../design.js";
import type { BodyCatalog, Column, PlacementRecord } from "../void-engine.js";
import type {
  BodyResizedEffect,
  CommandResult,
  CommandTarget,
} from "./command-result.js";
import type { EmptySpaceSide, RejectionDetail } from "./rejection.js";

export type Side = EmptySpaceSide["side"];

/** What `rebuild` reads and nothing else (ADR 0103 decision 5). Three commands reach
 *  `rebuild-resized-bodies.ts` through the insert path (ADR 0055 decision 1): the resize, the depth
 *  change and the dependent re-plan. Only the resize has a target and a width, so the others must not
 *  fabricate sentinels. `SetWidthInput` extends it, so a resize hands `rebuild` the same object. */
export interface RebuildInput {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  /** ADR 0011 Gap D: the frozen load-time extents, in their recorded face (ADR 0090 Amendment B).
   *  Whichever command is rebuilding, a body is re-fitted against the column the map holds for it. */
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
 *  integers its extent is read from. `alongMm` and `widthMm` come from the stored placement, not from
 *  the derived frame or `Column.w`: they are the integers the document holds, `Column.w` is the MIN
 *  over members and can be stale after a delete, and a metre round trip would put a half-nanometre
 *  into a coordinate that must stay exact. */
export interface ColumnMember {
  readonly record: PlacementRecord;
  readonly body: InsertableBody;
  readonly alongMm: number;
  readonly widthMm: number;
}

/** A column split by ADR 0035 decision 6: the bodies the column's width governs, and the hoods it does
 *  not. `members` is non-empty by construction: the selected body is always one of them. */
export interface ColumnUnit {
  readonly members: readonly [ColumnMember, ...ColumnMember[]];
  readonly hoods: readonly ColumnMember[];
}

/** What resolving a column's membership needs: the design the integers are read from, the catalogue
 *  the entries resolve through, the records the column is filtered out of, and the selected body's
 *  label, which every refusal is phrased in terms of. */
export interface ColumnContext {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly records: readonly PlacementRecord[];
  readonly label: BodyLabel;
}

/** One body about to be rebuilt: the same `ColumnMember` with `alongMm` and `widthMm` moved to where it
 *  is going. Every member of the column carries the same `alongMm` (ADR 0031) and every member its
 *  width governs the same `widthMm` (ADR 0035 decision 6: squaring up). A hood takes the new centre and
 *  keeps its width. */
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

/** A frozen column moved to a new width and a new along-wall centre. Both columns a resize touches get
 *  one: the run being resized and the empty one funding it. ADR 0011 Gap D freezes `regions`, `top`,
 *  `d` and `ry` so a cleared run keeps the opening it freed, while `rederiveTouchedColumns` answers a
 *  key from the members left under it. Re-deriving would drop the region of a column that lost a
 *  member earlier, and the freed opening would vanish with no way back. A resize moves the boundary of
 *  the space a run occupies, so `w`, the centre and the key move and nothing else does.
 *
 *  `widthMm === 0` means the resize consumed the space exactly and the key is removed (rule 6); only
 *  the empty column can reach it. */
export interface FrozenColumnMove {
  readonly column: Column;
  readonly widthMm: number;
  readonly centreMm: number;
}

export interface ColumnResize {
  readonly label: BodyLabel;
  /** The width the column was squared up to. Read from here, not off the first `Rebuild`, because that
   *  list also carries hoods, which keep widths of their own. */
  readonly widthMm: number;
  readonly members: readonly Rebuild[];
  readonly resized: FrozenColumnMove;
  /** The empty column the move leaves against the run: the near piece when ADR 0052's ceiling splits
   *  the space. `widthMm === 0` means the move consumed it exactly. */
  readonly empty: FrozenColumnMove;
  /** ADR 0052: the pieces of the freed space that did not fit under `MAX_EMPTY_COLUMN_WIDTH_MM`,
   *  beyond `empty` and away from the run; empty on every move that frees no more than the ceiling.
   *  A separate field because `empty` is the column the next resize on this side funds from and the
   *  one `EmptySpace` was resolved against. Both are guarded and written alike (`frozenMoves`). */
  readonly emptyOverflow: readonly FrozenColumnMove[];
  readonly side: Side;
}

/** Everything ADR 0031 decides before it knows which side will fund the move: the column, its members,
 *  its extent, and that the requested width is legal for all of them. Only `members` narrow the width
 *  and set the extent; `hoods` (ADR 0035 decision 6 as amended) are rebuilt at their own width and the
 *  run's new centre. */
export interface ColumnPlan {
  readonly label: BodyLabel;
  readonly column: Column;
  readonly members: readonly [ColumnMember, ...ColumnMember[]];
  readonly hoods: readonly ColumnMember[];
  readonly extent: ExtentMm;
}
