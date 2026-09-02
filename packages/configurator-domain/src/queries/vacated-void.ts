// `DEVELOPMENT-SPEC.md` §5.1's last step: after a delete, select the void that covers the vacated
// frame.
//
// Found by **geometry**, never by a remembered id. Void ids are regenerated on every recompute and
// a merge changes them, so an id captured before the delete names nothing afterwards — which is the
// specific way a selection dangles (§4).
import type { VacatedOpening } from "../commands/command-result.js";
import { alongWallCoordinate } from "../module-grid.js";
import { FIT_TOLERANCE_M, type VoidRecord } from "../void-engine.js";

/** Float slack, **not** manufacturing slack. A slot's height is a difference of module lines and
 *  accumulates error — the 1.50 → 2.20 slot measures 0.7000000000000002 — so its computed top can
 *  sit a few ULPs above the line it was derived from. Without this, a body standing at exactly 2.20
 *  reads as "inside" the slot that ends at 2.20 and the level below swallows the delete.
 *
 *  It is deliberately nine orders of magnitude smaller than `FIT_TOLERANCE_M`: ADR 0015 records
 *  what happens when a fit tolerance is used where a float epsilon belongs. */
const MODULE_LINE_EPSILON_M = 1e-9;

/** The void in the vacated body's own column whose `[y0, y0 + h]` contains where it stood.
 *  `undefined` when the delete created no void — a body narrower than `MIN_SPAN` leaves none.
 *
 *  The two bounds are deliberately asymmetric. At the **bottom**, `FIT_TOLERANCE_M` absorbs a slot
 *  that starts marginally above where the body stood. At the **top** it must not: two level-adjacent
 *  slots share a boundary, and widening there makes them overlap by 12 mm, so the lower one claims
 *  a delete that happened in the upper one (§11 row 2's failure shape, one level up). */
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

/** The fallback, and the reason this function needed one: **ADR 0046 part 2's merge deletes the key
 *  the removed body was filed under.** Clear a column, insert a body narrower than it (5B4a splits
 *  off a remainder), delete that body, and the occupied half and the remainder merge into a column
 *  under a *third* key — so no void carries `vacated.col`, and §5.1's "select the void that covers
 *  the vacated frame" selected nothing where the customer had just freed the space. Reachable on the
 *  seeded kitchen in five taps.
 *
 *  The key is still tried first, so nothing about a delete that merges nothing changes. This runs
 *  only when the key names no void at all, and it asks the geometric question the key is a proxy
 *  for: the merged column's along-wall span **strictly contains** the centre the body stood at,
 *  because a member of a merged run is always a proper sub-interval of it.
 *
 *  Strict, and same-wall, and vertical — all three, because columns overlap. `A|0.45`'s 900 mm
 *  corner base spans the ground under both `A|0.30` and `A|0.75`, so a delete whose own column
 *  publishes nothing could otherwise select an opening in a column beside it; the vertical predicate
 *  is what keeps the shipped kitchen's wall-band deletes away from the base-only corner column. */
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
