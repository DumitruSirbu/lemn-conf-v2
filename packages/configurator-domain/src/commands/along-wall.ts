import type { DesignWall } from "../design.js";

/** The along-wall coordinate: `x` on wall A, `z` on wall B or C (ADR 0132 decision 1: wall C's
 *  tangent is `+Z`, the same axis wall B's is) — the axis `deriveColumnKey` buckets on and the only
 *  one a resize moves anything along. */
export function alongWallM(
  wall: DesignWall,
  position: { readonly x: number; readonly z: number },
): number {
  return wall === "A" ? position.x : position.z;
}
