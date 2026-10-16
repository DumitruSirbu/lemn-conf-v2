// ADR 0052: one span of free wall, decomposed into the columns that may carry it. A leaf, deliberately: its
// two callers (the width command, which splits the space a shrink frees, and `migrateFromV1`, which splits
// an oversized entry a stored document already holds) must use the same arithmetic, and a shared function
// is the only form of "same" that cannot drift. It knows nothing about columns, walls or documents: two
// edges in, pieces out.
import { MAX_EMPTY_COLUMN_WIDTH_MM } from "./module-grid.js";

/** A piece of the span, in the integer millimetres a frozen column and a wire entry are both written from
 *  (structurally the width command's `ExtentMm` and `EmptyColumnSchema`'s `alongMm`/`widthMm`). */
export interface SpanPieceMm {
  readonly centreMm: number;
  readonly widthMm: number;
}

/**
 * The span from `nearEdgeMm` to `farEdgeMm`, cut into pieces none of which exceeds `widthLimitMm`
 * (omitted, `MAX_EMPTY_COLUMN_WIDTH_MM`; composition's shell passes its own). The near end fills first and
 * the overflow lands beyond it (ADR 0052): for a shrink the near end is the edge facing the run just
 * resized, so the space opened is against the cabinets that opened it; for the v1 normalisation it is the
 * entry's left edge. Deterministic either way: one design, one picture.
 *
 * `farEdgeMm` may lie on either side of `nearEdgeMm`; a caller filling leftwards passes them in that order
 * rather than negating anything. Total width is conserved exactly: the outermost two edges are the ones
 * passed in, so no millimetre of wall is stranded. A span at or under the ceiling returns the single piece
 * it already was, and an empty span returns no pieces: a resize that consumes an empty column exactly
 * removes its key rather than recording a zero-width column.
 */
export function splitEmptySpanAtCap(
  nearEdgeMm: number,
  farEdgeMm: number,
  widthLimitMm: number = MAX_EMPTY_COLUMN_WIDTH_MM,
): readonly SpanPieceMm[] {
  const totalMm = Math.abs(farEdgeMm - nearEdgeMm);
  if (totalMm <= 0) return [];
  const outward = farEdgeMm > nearEdgeMm ? 1 : -1;

  const pieces: SpanPieceMm[] = [];
  let cutMm = nearEdgeMm;
  let leftToPlaceMm = totalMm;
  while (leftToPlaceMm > 0) {
    const widthMm = Math.min(leftToPlaceMm, widthLimitMm);
    pieces.push({ centreMm: cutMm + (outward * widthMm) / 2, widthMm });
    cutMm += outward * widthMm;
    leftToPlaceMm -= widthMm;
  }
  return pieces;
}

/** Whether every piece of a split lands on the whole millimetres a document can carry. A span of odd width
 * has half-millimetre edges (a document holds an integer centre, not an integer edge), so its pieces'
 * centres fall between millimetres. Never rounded: `deriveColumnKeyAt` uses `toFixed(2)`, so a rounded
 * centre keys a column as its neighbour and collapses two extents into one slot. Unreachable from any
 * command (every §7 width is even); asked because a stored document is not built by a command, and the
 * callers' answers to a "no" differ: the width command refuses with `NON_INTEGER_MILLIMETRES`, while the
 * migration leaves the entry and lets the validator refuse the document.
 */
export function landsOnWholeMillimetres(
  pieces: readonly SpanPieceMm[],
): boolean {
  return pieces.every(
    (piece) =>
      Number.isInteger(piece.centreMm) && Number.isInteger(piece.widthMm),
  );
}
