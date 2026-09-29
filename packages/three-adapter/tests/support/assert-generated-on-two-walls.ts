import type { DesignWall } from "@lemnaria/configurator-domain";

/** M7B U1 slice S1's minimal type-level fix: `DesignPlacement["wall"]` is widened to include `"C"`
 *  (ADR 0132), but `generateKitchen` composes an L or a straight room in this wave — wall C's own
 *  parity suite is U4's — so every generated placement in these parity tests is asserted onto the
 *  two walls it can reach. */
export function assertGeneratedOnTwoWalls(
  wall: DesignWall,
): asserts wall is "A" | "B" {
  if (wall !== "A" && wall !== "B") {
    throw new Error(`generated placement stands on an unexpected wall ${wall}`);
  }
}
