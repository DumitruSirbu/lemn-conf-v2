// ADR 0011 Gap D freezes a column's **extent** — `x`, `z`, `w`, `d`, `top`, `regions`. It does not
// freeze `hasFullHeightUnder`, which answers what stands under an opening *now*, so a command that
// deletes or inserts a full-height unit is supposed to change it.
//
// A test proving a command left a column alone therefore compares the extent rather than the whole
// record. Comparing the whole record passes today only where the column happens to be one no
// command in the flow can put a full-height unit under; a flow that legitimately flips
// `hasFullHeightUnder` would then fail under a Gap D heading, which is not what broke.
import type { ColumnExtent } from "../../src/void-engine.js";

/** Named field by field rather than by dropping `hasFullHeightUnder` with a rest spread: a field
 *  added to `Column` is then a type error here, and whoever adds it has to decide whether it is
 *  frozen. */
export function extentOf(column: ColumnExtent): ColumnExtent {
  const { key, wall, ry, x, z, w, d, top, regions } = column;
  return { key, wall, ry, x, z, w, d, top, regions };
}
