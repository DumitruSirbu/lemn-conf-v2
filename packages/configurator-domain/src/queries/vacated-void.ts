// `DEVELOPMENT-SPEC.md` §5.1's last step: after a delete, select the void that covers the vacated frame.
// Found by geometry, never by a remembered id: void ids are regenerated on every recompute and a merge
// changes them, so a captured id dangles (§4).
import type { VacatedOpening } from "../commands/command-result.js";
import { alongWallCoordinate } from "../module-grid.js";
import { FIT_TOLERANCE_M, type VoidRecord } from "../void-engine.js";

/** Float slack, not manufacturing slack. A slot's height is a difference of module lines and
 *  accumulates error (the 1.50 → 2.20 slot measures 0.7000000000000002), so a body standing at exactly
 *  2.20 would read as inside the slot ending there. Nine orders of magnitude smaller than
 *  `FIT_TOLERANCE_M` on purpose (ADR 0015). */
const MODULE_LINE_EPSILON_M = 1e-9;

/** The void in the vacated body's own column whose `[y0, y0 + h]` contains where it stood; `undefined`
 *  when the delete created no void (a body narrower than `MIN_SPAN`). The bounds are asymmetric: at the
 *  bottom `FIT_TOLERANCE_M` absorbs a slot starting marginally above where the body stood; at the top it
 *  must not, since widening makes two level-adjacent slots overlap by 12 mm and the lower one claims a
 *  delete in the upper (§11 row 2). */
export function findVacatedVoid(
  voids: readonly VoidRecord[],
  vacated: VacatedOpening,
): VoidRecord | undefined {
  const covering = voids.filter((record) =>
    coversWhereItStood(record, vacated),
  );
  return (
    covering.find((record) => record.col === vacated.col) ??
    covering.find((record) => enclosesAlongWall(record, vacated))
  );
}

/** The vertical half of the match, which both routes share: the void's own `[y0, y0 + h]` contains
 *  where the body stood. */
function coversWhereItStood(
  record: VoidRecord,
  vacated: VacatedOpening,
): boolean {
  return (
    record.y0 <= vacated.y0 + FIT_TOLERANCE_M &&
    vacated.y0 < record.y0 + record.h - MODULE_LINE_EPSILON_M
  );
}

/** The fallback: ADR 0046 part 2's merge deletes the key the removed body was filed under. Clearing a
 *  column, inserting a narrower body and deleting it merges the occupied half and the remainder under a
 *  *third* key, so no void carries `vacated.col` and nothing would be selected where the customer freed
 *  space. The key is tried first; this runs only when it names no void, and asks the geometric question
 *  the key is a proxy for: the merged column's along-wall span strictly contains the centre the body
 *  stood at.
 *
 *  Strict, same-wall and vertical, all three, because columns overlap: `A|0.45`'s 900 mm corner base
 *  spans the ground under both `A|0.30` and `A|0.75`, so a delete whose own column publishes nothing
 *  could select an opening in a neighbour; the vertical predicate keeps wall-band deletes away from the
 *  base-only corner column. */
function enclosesAlongWall(
  record: VoidRecord,
  vacated: VacatedOpening,
): boolean {
  if (record.wall !== vacated.wall) return false;
  const centreM = alongWallCoordinate(record.wall, record);
  return (
    centreM - record.w / 2 < vacated.alongM &&
    vacated.alongM < centreM + record.w / 2
  );
}
