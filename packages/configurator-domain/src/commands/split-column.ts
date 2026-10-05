// The write to the frozen map after an insert (ADR 0046 part 1): the column the insert did not fill becomes
// the occupied part at the body's own width, and the remainder becomes one or more empty columns beside it,
// cut at ADR 0052's `MAX_EMPTY_COLUMN_WIDTH_MM` by the same `splitEmptySpanAtCap` a shrink and the v1
// migration use.
//
// It is the insert's `apply-column-moves.ts` and sits beside it, not inside `void-engine.ts`: subtracting a
// member's width inside `recomputeVoids` would make a void no column owns, and every consumer
// (`insertBody`'s `COLUMN_MISMATCH` guard, `deriveColumnKeyAt`, the frozen map, the funding scan) assumes an
// opening belongs to a column.
import { toMetres } from "../millimetres.js";
import { alongWallPosition, deriveColumnKeyAt } from "../module-grid.js";
import { splitEmptySpanAtCap } from "../split-empty-span.js";
import {
  withCurrentFullHeightMembers,
  type Column,
  type PlacementRecord,
} from "../void-engine.js";
import type { RejectionDetail } from "./rejection.js";

/** The map after the split, and the key the body it was made for now stands under. */
export interface ColumnSplit {
  /** What `refuseColumnDrift` holds the placed body to (ADR 0046 rule 3): the planned key, derived from the
   *  same millimetre the placement's `alongMm` was written from, so the two cannot disagree at a
   *  `toFixed(2)` boundary. */
  readonly occupiedKey: string;
  readonly columns: ReadonlyMap<string, Column>;
}

export interface SplitColumnInput {
  /** ADR 0011 Gap D's frozen extents; the split is a command-owned write to them, as a resize is. */
  readonly columns: ReadonlyMap<string, Column>;
  /** The column being divided: the target opening's own, and the only key this touches. */
  readonly column: Column;
  /** The records the design has after the insert, for `hasFullHeightUnder`. */
  readonly records: readonly PlacementRecord[];
  /** The seated centre of the body just placed, in the millimetres its `alongMm` holds. */
  readonly centreMm: number;
  readonly widthMm: number;
  /** What is left of the column beside it (`InsertPlan.remainderMm`). `0` means no division. */
  readonly remainderMm: number;
}

export type SplitColumnResult =
  | { readonly ok: true; readonly value: ColumnSplit }
  | { readonly ok: false; readonly detail: RejectionDetail };

/** One extent the split writes, in the whole millimetres the document holds. */
interface PartMm {
  readonly centreMm: number;
  readonly widthMm: number;
}

export function splitColumn(input: SplitColumnInput): SplitColumnResult {
  // Nothing to divide: the body fills the column exactly (ADR 0031 rule 6) or the column was never this
  // body's to divide. The map passes through with `hasFullHeightUnder` re-answered, so the column keeps its
  // key and `projectEmptyColumns` yields no entry for it.
  if (input.remainderMm <= 0) {
    return {
      ok: true,
      value: {
        occupiedKey: input.column.key,
        columns: withCurrentFullHeightMembers(input.columns, input.records),
      },
    };
  }
  const parts = planParts(input);
  const fractional = refuseFractionalParts(parts);
  if (fractional) return { ok: false, detail: fractional };
  return { ok: true, value: writeParts(input, parts) };
}

/** The extents, from the two edges that hold: the occupied part's left edge and the remainder's right edge
 *  are the column's own, so the boundary absorbs the whole difference (the run total is conserved and
 *  neither an overlap nor a gap is representable; ADR 0031). The remainder is cut at ADR 0052's ceiling,
 *  filling from the boundary outwards, so the part the customer can next insert into sits against the body
 *  just placed. */
function planParts(input: SplitColumnInput): readonly [PartMm, ...PartMm[]] {
  const occupied: PartMm = {
    centreMm: input.centreMm,
    widthMm: input.widthMm,
  };
  const boundaryMm = input.centreMm + input.widthMm / 2;
  return [
    occupied,
    ...splitEmptySpanAtCap(boundaryMm, boundaryMm + input.remainderMm),
  ];
}

/** Every centre and width the split writes must land on a whole millimetre: a liveness guard, not
 *  tidiness. `projectEmptyColumns` reads a frozen centre through `exactMillimetresOf`, which throws
 *  `UnprojectableColumnError`, and `applyCommandResult` does not catch, so a fractional centre would be a
 *  crash from ordinary input rather than a refusal.
 *
 *  Every part is checked because their centres decouple: the occupied part sits at `C − (W − w) / 2`
 *  (fractional whenever the column's width is odd), the first remainder part at `C + w / 2`, and each
 *  further part a ceiling along. `refuseFractionalCentres` is the resize path's guard and does not run on
 *  an insert; the occupied centre is re-checked here because this function writes it into a second place.
 *  Never rounded: `deriveColumnKeyAt` uses `toFixed(2)`, so rounding keys a column as its neighbour and
 *  collapses two extents into one map slot (ADR 0044). */
function refuseFractionalParts(
  parts: readonly PartMm[],
): RejectionDetail | undefined {
  const written = parts.flatMap((part) => [
    { field: "centreMm", valueMm: part.centreMm },
    { field: "widthMm", valueMm: part.widthMm },
  ]);
  const fractional = written.find(
    (candidate) => !Number.isInteger(candidate.valueMm),
  );
  if (!fractional) return undefined;
  return { code: "NON_INTEGER_MILLIMETRES", params: fractional };
}

/** The original key is vacated before any part is written: leaving it puts a member-less full-width column
 *  across the new placement, which `validateDesignForCatalog` refuses with `EMPTY_COLUMN_OVERLAPS_PLACEMENT`
 *  at the write seam, making the design unsaveable with nothing in session saying so.
 *
 *  Every part carries the original's `regions`, `top`, `d` and `ry`; only `w`, the along-wall centre and
 *  the key move (`moveFrozenColumns`' rule). Giving the occupied part the body's extent instead would close
 *  every level the column had free above it (ADR 0011 Gap D).
 *
 *  A key collision between the parts is unreachable: neighbouring centres are at least half the narrower
 *  part's width apart and `deriveColumnKeyAt` buckets at 10 mm, so a clash needs a part narrower than 20 mm.
 *  The occupied part is at least `NARROWEST_CATALOG_WIDTH_MM` and every remainder part but the last is a
 *  full ceiling wide; the last (a 1601 mm remainder cuts to 800, 800 and 1) is still 800 from its neighbour.
 *
 *  `withCurrentFullHeightMembers` runs last: whether a full-height member stands under a column is a fact
 *  about its extent, and both halves must be written before it can be re-answered. */
function writeParts(
  input: SplitColumnInput,
  parts: readonly [PartMm, ...PartMm[]],
): ColumnSplit {
  const updated = new Map<string, Column>(input.columns);
  updated.delete(input.column.key);
  const [occupied] = parts;
  for (const part of parts) writePart(updated, input.column, part);
  return {
    occupiedKey: deriveColumnKeyAt(
      input.column.wall,
      toMetres(occupied.centreMm),
    ),
    columns: withCurrentFullHeightMembers(updated, input.records),
  };
}

/** The `set` is bare: the argument above covers parts colliding with each other, while a collision with a
 *  different live column would overwrite it silently. That needs two overlapping extents on one wall, which
 *  the record set does not admit (every column is keyed by a centre no two extents can share), so it is
 *  unreachable rather than guarded. */
function writePart(
  columns: Map<string, Column>,
  column: Column,
  part: PartMm,
): void {
  const centreM = toMetres(part.centreMm);
  const key = deriveColumnKeyAt(column.wall, centreM);
  columns.set(key, {
    ...column,
    key,
    w: toMetres(part.widthMm),
    ...alongWallPosition(column.wall, centreM),
  });
}
