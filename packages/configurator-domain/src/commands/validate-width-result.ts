// The two facts a rebuilt column is checked against before the resize is accepted: no opening may
// have appeared where a body physically stands, and every body the move touched must land under a
// column key the updated map actually holds.
import type { BodyLabel } from "../catalog.js";
import type { DesignPlacement } from "../design.js";
import {
  recomputeVoids,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../void-engine.js";
import { alongWallM } from "./along-wall.js";
import type { RejectionDetail } from "./rejection.js";

/** Float noise from the millimetre↔metre round trip, for the one comparison that must distinguish
 *  "these two runs touch" from "this opening lies over that body". Touching is not overlapping. */
const OVERLAP_EPSILON_M = 1e-6;

export type OverlapSet = ReadonlySet<string>;

/** `RESIZE_OPENS_GAP` as ADR 0031 restates it, asked as a question: no opening may appear where a body
 *  physically stands. A before/after comparison of the whole opening set fires on every legal resize,
 *  because the empty column funding the move shrinks.
 *
 *  Still reachable: the empty column's extent is frozen (ADR 0011 Gap D) while its width moves, so
 *  widening it past what its members covered can bring its load-time regions over a body in a
 *  neighbouring column (clear `A|1.30`, narrow `A|0.75` to 200 on the shipped kitchen).
 *
 *  Refusing is the conservative direction (§9: a resize that cannot be represented is refused before
 *  it is offered), but only when both sides answer this way: the caller treats `true` as one side
 *  declining to fund the move, not as the end of the scan.
 *
 *  It asks about the difference, not about the world: scanning every opening against every body would
 *  let one pre-existing overlap refuse every resize anywhere, on both sides, for a reason unrelated to
 *  the move. */
export function opensAnOpeningOverABody(
  before: OverlapSet,
  records: readonly PlacementRecord[],
  columns: ReadonlyMap<string, Column>,
  exemptIds: ReadonlySet<string>,
): boolean {
  const after = bodiesUnderOpenings(records, columns, exemptIds);
  return [...after].some((placementId) => !before.has(placementId));
}

/** Which bodies currently have an opening derived on top of them, by placement id and not by opening,
 *  so the comparison survives the one thing a resize always does to an opening: move it onto a new
 *  column key. */
export function bodiesUnderOpenings(
  records: readonly PlacementRecord[],
  columns: ReadonlyMap<string, Column>,
  exemptIds: ReadonlySet<string>,
): OverlapSet {
  const covered = new Set<string>();
  for (const opening of recomputeVoids(records, columns)) {
    for (const record of records) {
      // The hoods of the column being resized are exempt: a hood hangs over its run and keeps its own
      // width while the cabinets beneath it change (ADR 0039, ADR 0035 decision 6), so it overhangs
      // the strip its own shrink vacated, and every shrink of a column holding one would refuse.
      // Scoped to this column's hoods: exempting every hood would let an opening grow across a hood
      // in a different, overlapping column. Excluded from the before set as well, so this stays a
      // difference.
      if (exemptIds.has(record.id)) continue;
      if (standsInOpening(record, opening)) covered.add(record.id);
    }
  }
  return covered;
}

/** Overlapping, not merely adjoining, as `overlapsAlongWall` in `void-engine.js` draws it: an opening
 *  that starts exactly where a body ends is the normal case. */
function standsInOpening(
  record: PlacementRecord,
  opening: VoidRecord,
): boolean {
  if (record.wall !== opening.wall) return false;
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

/** ADR 0011 Gap D for the one command that moves a body between columns: every body this operation
 *  moved must land in a key the updated map holds. A body filed under a key nothing derived is a
 *  phantom column that §4 never sees (no void, no opening, no way back), so it is asserted, as
 *  `insertBody` does. */
export function refuseColumnDrift(
  columns: ReadonlyMap<string, Column>,
  records: readonly PlacementRecord[],
  rebuilt: ReadonlyMap<string, DesignPlacement>,
  label: BodyLabel,
): RejectionDetail | undefined {
  const drifted = records.find(
    (record) => rebuilt.has(record.id) && !columns.has(record.col),
  );
  if (!drifted) return undefined;
  return { code: "COLUMN_MISMATCH", params: { label } };
}
