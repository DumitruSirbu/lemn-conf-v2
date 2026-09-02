// ADR 0052: one span of free wall, decomposed into the columns that may carry it.
//
// **A leaf, and deliberately.** Its two callers sit at opposite ends of the project — the width
// command, which splits the space a shrink frees, and `migrateFromV1`, which splits an oversized
// entry a stored document already holds — and the plan requires them to use the *same* arithmetic.
// A shared function is the only form of "same" that cannot drift; two agreeing implementations is
// how the frozen key and the projected key came apart in wave 5B2b.
//
// It knows nothing about columns, walls or documents: two edges in, pieces out.
import { MAX_EMPTY_COLUMN_WIDTH_MM } from "./module-grid.js";

/** A piece of the span, in the integer millimetres a frozen column and a wire entry are both
 *  written from. Structurally the `ExtentMm` the width command passes around and the
 *  `alongMm`/`widthMm` pair `EmptyColumnSchema` holds. */
export interface SpanPieceMm {
  readonly centreMm: number;
  readonly widthMm: number;
}

/**
 * The span from `nearEdgeMm` to `farEdgeMm`, cut into pieces none of which exceeds
 * `MAX_EMPTY_COLUMN_WIDTH_MM`.
 *
 * **The near end fills first and the overflow lands beyond it**, which is the rule ADR 0052 states:
 * for a shrink the near end is the edge facing the run the customer just resized, so the space they
 * opened is against the cabinets they opened it with; for the v1 normalisation the near end is the
 * entry's left edge, so left to right. Deterministic either way, which is ADR 0046 rule 1's reason
 * for sorting — one design, one picture, whatever order the commands ran in.
 *
 * `farEdgeMm` may lie on either side of `nearEdgeMm`; the direction is read from the two, so a
 * caller filling leftwards passes them in that order rather than negating anything.
 *
 * **Total width is conserved exactly.** Pieces meet at their edges and the outermost two are the
 * edges passed in, so no millimetre of wall is stranded — the failure ADR 0046 rejected by name.
 *
 * A span at or under the ceiling comes back as the single piece it already was, and an empty span
 * comes back as no pieces at all: a resize that consumes an empty column exactly removes its key
 * (ADR 0031 rule 6) rather than recording a column of zero width.
 */
export function splitEmptySpanAtCap(
  nearEdgeMm: number,
  farEdgeMm: number,
): readonly SpanPieceMm[] {
  const totalMm = Math.abs(farEdgeMm - nearEdgeMm);
  if (totalMm <= 0) return [];
  const outward = farEdgeMm > nearEdgeMm ? 1 : -1;

  const pieces: SpanPieceMm[] = [];
  let cutMm = nearEdgeMm;
  let leftToPlaceMm = totalMm;
  while (leftToPlaceMm > 0) {
    const widthMm = Math.min(leftToPlaceMm, MAX_EMPTY_COLUMN_WIDTH_MM);
    pieces.push({ centreMm: cutMm + (outward * widthMm) / 2, widthMm });
    cutMm += outward * widthMm;
    leftToPlaceMm -= widthMm;
  }
  return pieces;
}

/** Whether every piece of a split lands on the whole millimetres a document can carry.
 *
 * A piece's centre is its near edge plus half its width, so a span whose own edges are half
 * millimetres — which is every span of odd width, since a document holds an integer *centre* and
 * not an integer edge — cuts into pieces whose centres fall between two millimetres. Rounding is
 * the one thing that must not happen: `deriveColumnKeyAt` renders metres with `toFixed(2)`, so a
 * rounded centre keys a column as its neighbour and two extents collapse into one map slot
 * (`projectEmptyColumns` records the same argument at the store seam).
 *
 * Unreachable from any command: every width in §7's catalogue is even, so every extent derived from
 * one is too. It is asked because a stored document is not built by a command, and the callers'
 * answers to a "no" differ — the width command refuses the move with `NON_INTEGER_MILLIMETRES`,
 * while the migration leaves the entry as it found it and lets the validator refuse the document.
 */
export function landsOnWholeMillimetres(
  pieces: readonly SpanPieceMm[],
): boolean {
  return pieces.every(
    (piece) =>
      Number.isInteger(piece.centreMm) && Number.isInteger(piece.widthMm),
  );
}
