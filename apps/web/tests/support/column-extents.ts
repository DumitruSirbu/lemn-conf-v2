// ADR 0011 Gap D freezes a column's **extent** — `x`, `z`, `w`, `d`, `top`, `regions`. It does not
// freeze `hasFullHeightUnder`, which answers what stands under an opening *now*, so a command that
// deletes or inserts a full-height unit is supposed to change it.
//
// A test proving the store did not recompute its columns therefore compares extents rather than map
// identity. Identity would fail on a correct change and, for the defect it was written to catch,
// proves nothing that this does not: a column recomputed from the mutated records shrinks its `top`
// and drops its freed region, and both are compared here.
import type { Column, ColumnExtent } from "@lemnaria/configurator-domain";

export function columnExtents(
  columns: ReadonlyMap<string, Column>,
): ReadonlyMap<string, ColumnExtent> {
  const extents = new Map<string, ColumnExtent>();
  for (const [key, column] of columns) {
    extents.set(key, extentOf(column));
  }
  return extents;
}

/** Named field by field rather than by dropping `hasFullHeightUnder` with a rest spread: a field
 *  added to `Column` is then a type error here, and whoever adds it has to decide whether it is
 *  frozen. */
function extentOf(column: ColumnExtent): ColumnExtent {
  const { key, wall, ry, x, z, w, d, top, regions } = column;
  return { key, wall, ry, x, z, w, d, top, regions };
}
