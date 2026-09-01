// ADR 0046 part 1's write to the frozen map: the column an insert did not fill becomes two — the
// occupied part at the body's own width, and the remainder as a new empty column beside it.
//
// It is the insert's `apply-column-moves.ts` and it sits beside it rather than inside
// `void-engine.ts` on purpose: ADR 0046 rejected subtracting a member's width inside
// `recomputeVoids` by name, because that makes a void no column owns and every consumer —
// `insertBody`'s `COLUMN_MISMATCH` guard, `deriveColumnKeyAt`, the frozen map, ADR 0031's funding
// scan — is written against the rule that an opening belongs to a column.
import { toMetres } from "../millimetres.js";
import {
  deriveColumnKeyAt,
  withCurrentFullHeightMembers,
  type Column,
  type PlacementRecord,
} from "../void-engine.js";
import type { RejectionDetail } from "./rejection.js";

/** The map after the split, and the key the body it was made for now stands under. */
export interface ColumnSplit {
  /** What `refuseColumnDrift` holds the placed body to (ADR 0011 Gap D, ADR 0046 rule 3): the key
   *  the split planned, derived from the same millimetre the placement's `alongMm` was written
   *  from, so the two cannot disagree at a `toFixed(2)` boundary. */
  readonly occupiedKey: string;
  readonly columns: ReadonlyMap<string, Column>;
}

export interface SplitColumnInput {
  /** ADR 0011 Gap D's frozen extents. The split is a command-owned write to them, exactly as a
   *  resize is. */
  readonly columns: ReadonlyMap<string, Column>;
  /** The column being divided — the target opening's own, and the only key this touches. */
  readonly column: Column;
  /** The records the design has **after** the insert, for `hasFullHeightUnder`. */
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
interface HalfMm {
  readonly centreMm: number;
  readonly widthMm: number;
}

export function splitColumn(input: SplitColumnInput): SplitColumnResult {
  // Nothing to divide: the body fills the column exactly (ADR 0031 rule 6's exact-to-zero case) or
  // the column was never this body's to divide. The map passes through with `hasFullHeightUnder`
  // re-answered, which is exactly what the store did for an insert before ADR 0046 — so the key the
  // column had is the key it keeps, and `projectEmptyColumns` yields no entry for it.
  if (input.remainderMm <= 0) {
    return {
      ok: true,
      value: {
        occupiedKey: input.column.key,
        columns: withCurrentFullHeightMembers(input.columns, input.records),
      },
    };
  }
  const halves = planHalves(input);
  const fractional = refuseFractionalHalves(halves);
  if (fractional) return { ok: false, detail: fractional };
  return { ok: true, value: writeHalves(input, halves) };
}

/** The two extents, from the two edges that hold. The occupied half's left edge is the column's own
 *  and the remainder's right edge is the column's own, so the boundary between them absorbs the
 *  whole of the difference — ADR 0031's arithmetic, and what makes the run total conserved and
 *  neither an overlap nor a gap representable. */
function planHalves(input: SplitColumnInput): readonly [HalfMm, HalfMm] {
  const occupied: HalfMm = {
    centreMm: input.centreMm,
    widthMm: input.widthMm,
  };
  const remainder: HalfMm = {
    centreMm: input.centreMm + (input.widthMm + input.remainderMm) / 2,
    widthMm: input.remainderMm,
  };
  return [occupied, remainder];
}

/** Every centre and width the split is about to write must land on a whole millimetre, and this is
 *  a **liveness** guard rather than a tidiness one.
 *
 *  `projectEmptyColumns` reads a frozen column's centre at the store seam through
 *  `exactMillimetresOf`, which throws `UnprojectableColumnError` — and `applyCommandResult` does not
 *  catch. So a fractional centre published from here is a crash from ordinary input, not a refusal.
 *
 *  **Both halves, because their centres decouple.** The occupied half sits at
 *  `C − (W − w) / 2`, which is fractional whenever the column's width is odd; the remainder sits at
 *  `C + w / 2`, which is whole whenever `C` is. `refuseFractionalCentres` covers neither: it is the
 *  resize path's guard and does not run on an insert. The occupied centre is also checked by
 *  `resolvePlacementMillimetres` before this runs, and is checked again here because this function
 *  writes it into a second place and must be safe for its own callers.
 *
 *  **Never rounded.** `deriveColumnKeyAt` renders metres with `toFixed(2)`, so rounding a centre
 *  keys a column as its neighbour and two extents collapse into one map slot (ADR 0044). */
function refuseFractionalHalves(
  halves: readonly [HalfMm, HalfMm],
): RejectionDetail | undefined {
  const written = halves.flatMap((half) => [
    { field: "centreMm", valueMm: half.centreMm },
    { field: "widthMm", valueMm: half.widthMm },
  ]);
  const fractional = written.find(
    (candidate) => !Number.isInteger(candidate.valueMm),
  );
  if (!fractional) return undefined;
  return { code: "NON_INTEGER_MILLIMETRES", params: fractional };
}

/** **The original key is vacated before either half is written.** Leaving it behind puts a
 *  member-less full-width column across the new placement, which `validateDesignForCatalog` refuses
 *  with `EMPTY_COLUMN_OVERLAPS_PLACEMENT` at the write seam — the design becomes unsaveable, and
 *  nothing in session says so.
 *
 *  **Both halves carry the original's `regions`, `top`, `d` and `ry`**, and only `w`, the along-wall
 *  centre and the key move — `moveFrozenColumns`' rule, for the same reason. Giving the occupied
 *  half the *body's* extent instead closes every level the column had free above it: clear `A|2.60`,
 *  insert a bottle cargo, and the 1780 mm above it is gone. That is ADR 0011 Gap D verbatim.
 *
 *  A key collision between the two halves is unreachable rather than handled: they are half the
 *  column's width apart and `deriveColumnKeyAt` buckets at 10 mm, so a clash would need a column
 *  narrower than 20 mm, which no opening produces.
 *
 *  `withCurrentFullHeightMembers` last, because whether a full-height member stands under a column
 *  is a fact about its **extent** and both halves have to be written before it can be re-answered. */
function writeHalves(
  input: SplitColumnInput,
  halves: readonly [HalfMm, HalfMm],
): ColumnSplit {
  const updated = new Map<string, Column>(input.columns);
  updated.delete(input.column.key);
  const [occupied] = halves;
  for (const half of halves) writeHalf(updated, input.column, half);
  return {
    occupiedKey: deriveColumnKeyAt(
      input.column.wall,
      toMetres(occupied.centreMm),
    ),
    columns: withCurrentFullHeightMembers(updated, input.records),
  };
}

/** The `set` is bare, and the unreachability argument above covers only the two halves colliding
 *  with **each other**. A collision with a different *live* column would overwrite it silently.
 *  That needs two overlapping extents on one wall, which the record set does not admit — every
 *  column is keyed by a centre no two extents can share — so it is unreachable rather than
 *  guarded. Written down because "unreachable" is a claim about the rest of the system, and this
 *  wave has already watched one such claim (`refuseFractionalCentres` covering every centre) turn
 *  out to be false. */
function writeHalf(
  columns: Map<string, Column>,
  column: Column,
  half: HalfMm,
): void {
  const centreM = toMetres(half.centreMm);
  const key = deriveColumnKeyAt(column.wall, centreM);
  columns.set(key, {
    ...column,
    key,
    w: toMetres(half.widthMm),
    ...alongWallPosition(column, centreM),
  });
}

/** The half of a column's origin that moves along the wall. The other coordinate is the column's
 *  own half-depth and is carried across untouched — a column starts at the wall, whatever stands
 *  in it (`deriveColumns`). */
function alongWallPosition(
  column: Column,
  centreM: number,
): Pick<Column, "x"> | Pick<Column, "z"> {
  return column.wall === "A" ? { x: centreM } : { z: centreM };
}
