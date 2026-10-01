// `DEVELOPMENT-SPEC.md` §2 and §3.2's grid: the level lines every opening is cut against, the snap
// that decides when two heights are "the same row", the key a column is filed under, and the half of
// a column's origin that moves along its wall.
//
// **A leaf module, and that is the whole reason it exists.** `void-engine.ts` owns the column model
// and `merge-empty-columns.ts` rewrites it, so the merge needs the key and the snap while the engine
// needs the merge — a cycle, and while these constants lived in `void-engine.ts` a top-level read of
// `LEVEL_SNAP_M` from the merge resolved to `undefined` before that module's body had run. Every
// comparison then answered false and the merge silently never fired, with nothing throwing. The
// values live here so the reverse edge does not exist rather than being documented as fragile.
// `body-kinds.ts` was split out of `catalog.ts` for the same reason and records the same argument.
import type { DesignWall } from "./design.js";

/** `DEVELOPMENT-SPEC.md` §2 module lines: base | wall | top. The 0.86–1.50 gap is backsplash and
 *  is never subdivided into — see the "no fallback" rule in `recomputeVoids`. */
export const LEVELS: readonly (readonly [number, number])[] = [
  [0, 0.86],
  [1.5, 2.2],
  [2.2, 2.6],
];

/** How close a free span's start must be to its level's own start to still count as "at" that
 *  level, per §4 rule 4 (a span starting mid-level stays one opening).
 *
 *  ADR 0046 rule 2 reads it a second way: two columns are on the same row when their floors, their
 *  tops and their depths agree this closely, which is what the owner's *"same row"* means in the
 *  engine's terms. */
export const LEVEL_SNAP_M = 0.02;

/** ADR 0052: **the widest an empty column may be**, and since 2026-09-02 that is the whole of the
 *  rule — owner, *"lets make 800 the maximum of any empty column"*, closing Q5.
 *
 *  It was `MERGE_CAP_MM` in `merge-empty-columns.ts` and bounded a *merge* alone, so ADR 0035
 *  decision 7's shrink handed width back to a neighbouring empty column with no ceiling at all —
 *  measured at 900 mm, surviving a reload since wave 5B2, publishing an opening every
 *  `widthFlex: 'fit'` body refuses as `WIDTH_NOT_SUPPORTED`. One constant now bounds both, so a
 *  merge that declines and a shrink that splits are answering the same question.
 *
 *  **A ceiling on a column, never on a space.** ADR 0037 and ADR 0043 both stand: a span of any
 *  width may be left empty, and a 1000 mm gap is legal — it is simply carried as 800 + 200.
 *
 *  **Its relationship to `CABINETRY_MAX_WIDTH_MM`.** That constant is §7's widest *cabinet*; this is
 *  the widest *empty column*, and they are equal because the point of the ceiling is that anything
 *  the customer can be left with is something the catalogue can fill. They are separate constants
 *  because they are separate rules — moving the cabinetry ceiling to 1000 need not move this — and
 *  the one thing that must hold between them (this at most that) is asserted by a test rather than
 *  imported, because this module is a leaf and importing the catalogue here is the cycle the file
 *  head describes.
 *
 *  Here rather than in `merge-empty-columns.ts` because it now has four readers across three layers
 *  — the merge, the width command, the document validator and the v1 migration — and the leaf is
 *  the one module all of them may import. */
export const MAX_EMPTY_COLUMN_WIDTH_MM = 800;

/** §3.2's column key from a wall and an along-wall coordinate, at 10 mm granularity.
 *
 *  Exported because ADR 0031's resize moves an **empty** column, which by definition has no member
 *  to derive a key from — its extent is frozen (ADR 0011 Gap D) and its width is what moves. Its new
 *  key has to be derived the same way every occupied column's is, or a body later inserted into it
 *  lands under a key the map does not hold and `insertBody` refuses `COLUMN_MISMATCH`.
 *
 *  ADR 0035 decision 7 gives it a second caller for the same reason: a shrink *creates* an empty
 *  column at the extent it vacates, and that column has no member either. `set-width.ts` also uses
 *  it to ask whether the key it is about to create is one the map already holds. ADR 0046 gives it a
 *  third and a fourth — a split writes two keys where one was, and a merge writes one where two
 *  were.
 *
 *  **The prefix is the wall letter itself, never a two-way fallback** (M7B U1 slice S3, AC8): before
 *  ADR 0132 a wall-C key would have rendered `A|…` — anything that was not `"B"` fell to `"A|"` — and
 *  collided with a real wall-A key at the same along value. `DesignWallSchema`'s whole domain is `A`,
 *  `B` or `C`, so naming the wall directly is exhaustive and needs no fallback branch. */
export function deriveColumnKeyAt(wall: DesignWall, alongM: number): string {
  return `${wall}|${alongM.toFixed(2)}`;
}

/** The half of a column's origin that moves along its wall: `x` on wall A, `z` on wall B or C — wall
 *  C's tangent is `+Z`, the same axis wall B's is (ADR 0132 decision 1), so this along/across split
 *  needs no third arm. The other coordinate is the column's own half-depth and is carried across
 *  untouched — a column starts at the wall, whatever stands in it (`deriveColumns`).
 *
 *  One function rather than the same ternary written out wherever a column's centre moves. It is
 *  three callers now — a resize, a split and a merge — and the shape it replaces is the mirrored
 *  pair with the operands swapped, which is what gets transposed on the next edit (5F clean-code
 *  review S5). */
export function alongWallPosition(
  wall: DesignWall,
  centreM: number,
): { readonly x: number } | { readonly z: number } {
  return wall === "A" ? { x: centreM } : { z: centreM };
}

/** The along-wall coordinate of anything that has a world position: `x` on wall A, `z` on wall B or
 *  C — the same axis `deriveColumnKeyAt` buckets on, and the reading counterpart of
 *  `alongWallPosition`. */
export function alongWallCoordinate(
  wall: DesignWall,
  position: { readonly x: number; readonly z: number },
): number {
  return wall === "A" ? position.x : position.z;
}
