// ADR 0046 part 1's write to the frozen map: the column an insert did not fill becomes the occupied
// part at the body's own width, and the remainder as empty columns beside it.
//
// **Two parts until wave 5G, and one or more remainder parts since.** ADR 0052 caps an empty column
// at `MAX_EMPTY_COLUMN_WIDTH_MM`, and this is the third place the product can produce one — a 200 mm
// bottle cargo dropped into a cleared 2600 mm column leaves 2400 mm, which was a single column no
// `widthFlex: 'fit'` body could then be built into. The remainder is split by the same
// `splitEmptySpanAtCap` a shrink and the v1 migration use.
//
// It is the insert's `apply-column-moves.ts` and it sits beside it rather than inside
// `void-engine.ts` on purpose: ADR 0046 rejected subtracting a member's width inside
// `recomputeVoids` by name, because that makes a void no column owns and every consumer —
// `insertBody`'s `COLUMN_MISMATCH` guard, `deriveColumnKeyAt`, the frozen map, ADR 0031's funding
// scan — is written against the rule that an opening belongs to a column.
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
interface PartMm {
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
  const parts = planParts(input);
  const fractional = refuseFractionalParts(parts);
  if (fractional) return { ok: false, detail: fractional };
  return { ok: true, value: writeParts(input, parts) };
}

/** The extents, from the two edges that hold. The occupied part's left edge is the column's own and
 *  the remainder's right edge is the column's own, so the boundary between them absorbs the whole of
 *  the difference — ADR 0031's arithmetic, and what makes the run total conserved and neither an
 *  overlap nor a gap representable.
 *
 *  The remainder is then cut at ADR 0052's ceiling, filling from the boundary outwards, so the part
 *  the customer can next insert into sits against the body they just placed. One part on every
 *  insert the shipped kitchen admits; more only when a wide column is cleared first. */
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

/** Every centre and width the split is about to write must land on a whole millimetre, and this is
 *  a **liveness** guard rather than a tidiness one.
 *
 *  `projectEmptyColumns` reads a frozen column's centre at the store seam through
 *  `exactMillimetresOf`, which throws `UnprojectableColumnError` — and `applyCommandResult` does not
 *  catch. So a fractional centre published from here is a crash from ordinary input, not a refusal.
 *
 *  **Every part, because their centres decouple.** The occupied part sits at
 *  `C − (W − w) / 2`, which is fractional whenever the column's width is odd; the first remainder
 *  part sits at `C + w / 2`, which is whole whenever `C` is, and each part beyond it is a further
 *  ceiling along. `refuseFractionalCentres` covers neither: it is the
 *  resize path's guard and does not run on an insert. The occupied centre is also checked by
 *  `resolvePlacementMillimetres` before this runs, and is checked again here because this function
 *  writes it into a second place and must be safe for its own callers.
 *
 *  **Never rounded.** `deriveColumnKeyAt` renders metres with `toFixed(2)`, so rounding a centre
 *  keys a column as its neighbour and two extents collapse into one map slot (ADR 0044). */
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

/** **The original key is vacated before any part is written.** Leaving it behind puts a
 *  member-less full-width column across the new placement, which `validateDesignForCatalog` refuses
 *  with `EMPTY_COLUMN_OVERLAPS_PLACEMENT` at the write seam — the design becomes unsaveable, and
 *  nothing in session says so.
 *
 *  **Every part carries the original's `regions`, `top`, `d` and `ry`**, and only `w`, the
 *  along-wall centre and the key move — `moveFrozenColumns`' rule, for the same reason. Giving the
 *  occupied part the *body's* extent instead closes every level the column had free above it: clear
 *  `A|2.60`, insert a bottle cargo, and the 1780 mm above it is gone. That is ADR 0011 Gap D
 *  verbatim.
 *
 *  A key collision between the parts is unreachable rather than handled: neighbouring centres are
 *  half the narrower part's width apart at least, and `deriveColumnKeyAt` buckets at 10 mm, so a
 *  clash would need a part narrower than 20 mm. The occupied part is a body, so it is at least
 *  `NARROWEST_CATALOG_WIDTH_MM`; every remainder part but the last is a full ceiling wide. **The
 *  last one is the exception the ceiling introduced** — a 1601 mm remainder cuts to 800, 800 and 1 —
 *  and it is still 800 from the part before it, so the pair cannot collide either.
 *
 *  `withCurrentFullHeightMembers` last, because whether a full-height member stands under a column
 *  is a fact about its **extent** and both halves have to be written before it can be re-answered. */
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

/** The `set` is bare, and the unreachability argument above covers only the parts colliding
 *  with **each other**. A collision with a different *live* column would overwrite it silently.
 *  That needs two overlapping extents on one wall, which the record set does not admit — every
 *  column is keyed by a centre no two extents can share — so it is unreachable rather than
 *  guarded. Written down because "unreachable" is a claim about the rest of the system, and this
 *  wave has already watched one such claim (`refuseFractionalCentres` covering every centre) turn
 *  out to be false. */
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
