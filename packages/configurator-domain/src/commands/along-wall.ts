import type { DesignWall } from "../design.js";

/** The along-wall coordinate: `x` on wall A, `z` on wall B — the axis `deriveColumnKey` buckets on
 *  and the only one a resize moves anything along. */
export function alongWallM(
  wall: DesignWall,
  position: { readonly x: number; readonly z: number },
): number {
  return wall === "A" ? position.x : position.z;
}
