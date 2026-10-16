// DEVELOPMENT-SPEC §2 and §3.2's grid: the level lines every opening is cut against, the snap that decides
// when two heights are "the same row", the key a column is filed under, and the half of a column's origin
// that moves along its wall.
//
// A leaf module, deliberately: `void-engine.ts` owns the column model and `merge-empty-columns.ts`
// rewrites it, so the merge needs the key and the snap while the engine needs the merge. With these
// constants in `void-engine.ts` that cycle made the merge's top-level read of `LEVEL_SNAP_M` resolve to
// `undefined`, every comparison answered false, and the merge silently never fired. `body-kinds.ts` was
// split out of `catalog.ts` for the same reason.
import type { DesignWall } from "./design.js";

/** `DEVELOPMENT-SPEC.md` §2 module lines: base | wall | top. The 0.86–1.50 gap is backsplash and
 *  is never subdivided into — see the "no fallback" rule in `recomputeVoids`. */
export const LEVELS: readonly (readonly [number, number])[] = [
  [0, 0.86],
  [1.5, 2.2],
  [2.2, 2.6],
];

/** How close a free span's start must be to its level's own start to still count as "at" that level
 *  (§4 rule 4: a span starting mid-level stays one opening). Also the tolerance for "same row": two columns
 *  are on the same row when their floors, tops and depths agree this closely (ADR 0046 rule 2). */
export const LEVEL_SNAP_M = 0.02;

/** ADR 0052's 800 mm cut on an empty column. It no longer bounds the editor's merge, which is uncapped
 *  (8U plan §5), nor composition's, which reads the catalogue's ceiling. Until 8U S5 retires the cuts it
 *  still bounds the width a shrink hands back, an insert's remainder, the reconcile's split and the v1
 *  arm; in the editor the merge after them rejoins the pieces, so a 1000 mm gap shows as one space.
 *
 *  Equal to `CABINETRY_MAX_WIDTH_MM` (§7's widest cabinet) so anything the customer can be left with is
 *  something the catalogue can fill, but a separate constant because a separate rule; a test asserts this
 *  is at most that, since importing the catalogue here would close the cycle the file head describes. Here
 *  because it has readers across several layers (the merge, the width command, the document validator, the
 *  v1 migration) and the leaf is the one module all of them may import. */
export const MAX_EMPTY_COLUMN_WIDTH_MM = 800;

/** The along-wall granularity of a column key: `deriveColumnKeyAt` renders metres with `toFixed(2)`, so
 *  two centres less than a centimetre apart address one column. Change the two together. */
export const COLUMN_KEY_RESOLUTION_MM = 10;

/** §3.2's column key from a wall and an along-wall coordinate, at 10 mm granularity. Exported because an
 *  empty column has no member to derive a key from (its extent is frozen, ADR 0011 Gap D), so every
 *  producer of one (a resize, a shrink's vacated strip, a split, a merge, and `set-width.ts`'s collision
 *  check) must derive its key as an occupied column's is, or a body inserted into it lands under a key the
 *  map does not hold and `insertBody` refuses `COLUMN_MISMATCH`.
 *
 *  The prefix is the wall letter itself, never a two-way fallback: a wall-C key must not render `A|…` and
 *  collide with a wall-A key at the same along value. `DesignWallSchema`'s domain is `A`, `B` or `C`, so
 *  naming the wall is exhaustive. */
export function deriveColumnKeyAt(wall: DesignWall, alongM: number): string {
  return `${wall}|${alongM.toFixed(2)}`;
}

/** The half of a column's origin that moves along its wall: `x` on wall A, `z` on wall B or C (wall C's
 *  tangent is +Z, as wall B's; see ADR 0132 decision 1). The other coordinate is the column's own
 *  half-depth, carried across untouched. One function rather than the same ternary at every caller (a
 *  resize, a split, a merge): the mirrored pair with swapped operands is what gets transposed on the next
 *  edit. */
export function alongWallPosition(
  wall: DesignWall,
  centreM: number,
): { readonly x: number } | { readonly z: number } {
  return wall === "A" ? { x: centreM } : { z: centreM };
}

/** The along-wall coordinate of anything that has a world position: `x` on wall A, `z` on wall B or C,
 *  the axis `deriveColumnKeyAt` buckets on and the reading counterpart of `alongWallPosition`. */
export function alongWallCoordinate(
  wall: DesignWall,
  position: { readonly x: number; readonly z: number },
): number {
  return wall === "A" ? position.x : position.z;
}
