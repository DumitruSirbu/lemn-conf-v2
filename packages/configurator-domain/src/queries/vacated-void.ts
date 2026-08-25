// `DEVELOPMENT-SPEC.md` §5.1's last step: after a delete, select the void that covers the vacated
// frame.
//
// Found by **geometry**, never by a remembered id. Void ids are regenerated on every recompute and
// a merge changes them, so an id captured before the delete names nothing afterwards — which is the
// specific way a selection dangles (§4).
import type { VacatedOpening } from "../commands/command-result.js";
import { FIT_TOLERANCE_M, type VoidRecord } from "../void-engine.js";

/** The void in the vacated body's own column whose `[y0, y0 + h]` contains where it stood.
 *  `undefined` when the delete created no void — a body narrower than `MIN_SPAN` leaves none. */
export function findVacatedVoid(
  voids: readonly VoidRecord[],
  vacated: VacatedOpening,
): VoidRecord | undefined {
  return voids.find(
    (record) =>
      record.col === vacated.col &&
      record.y0 <= vacated.y0 + FIT_TOLERANCE_M &&
      vacated.y0 < record.y0 + record.h + FIT_TOLERANCE_M,
  );
}
