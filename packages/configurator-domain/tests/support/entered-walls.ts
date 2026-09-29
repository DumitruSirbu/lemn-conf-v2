// M7 wave 7D8 — which of the two entered walls is the wider one, derived once for the whole suite.
//
// **Ten tests need this key and each had its own copy.** The run follows the wider entered wall, so
// the answer decides which wall carries the sink and the hob, which wall the block stands on, and
// which wall is read backwards (ADR 0120 Amendment E; ADR 0110 Amendment I). Five of the ten copies
// spelled it `room.depthMm > room.widthMm` and bypassed the wall-to-axis mapping altogether —
// and that mapping has **already been re-pointed once**: `overflowing-placements.ts` records that
// both walls were briefly `Math.max(widthMm, depthMm)` and that lending either wall the other axis
// hid the very overrun the query existed to report (ADR 0065 decision 5). Re-pointed a second time,
// ten private copies would each keep the old answer and each stay green, because each agrees only
// with itself.
//
// **This is not production's key, and cannot become it.** `generation-priorities.ts` decides the
// same question in `readingOrderWallsFor` and applies it in `isLaidOutInReverse`; both are
// module-private and neither is exported, so no import can route this file to the composer's own
// answer. What is shared here is `wallLengthMm` — the published mapping from a wall letter to the
// number the customer typed, which is a fact about the room and not a layout decision. A test using
// it still agrees with the composer only if both read the owner's wider-wall rule the same way,
// which is exactly the independence one copy per file was bought for (7D8 adjudication, finding C2).
import {
  wallLengthMm,
  type DesignRoom,
  type DesignWall,
} from "../../src/index.js";

// M7B U1 slice S1's minimal type-level fix: `DesignWall` widened to include `"C"` (ADR 0132), but
// the wider/narrower question this file answers is the L composer's own — wall C is U3's third
// wall, not a third answer to a two-wall question.
type TwoWallDispatch = Extract<DesignWall, "A" | "B">;

/**
 * The wider entered wall: the one the run ends on, so the one the hob and the block stand on, and
 * the one read from the corner outward.
 *
 * **Wall A where the two are equal** — equal walls keep wall B as the reading order's prefix, which
 * is the answer every room had before the rule existed (ADR 0120 Amendment E).
 */
export function widerEnteredWall(room: DesignRoom): TwoWallDispatch {
  return wallLengthMm("B", room) > wallLengthMm("A", room) ? "B" : "A";
}

/**
 * The narrower entered wall: the reading order's prefix, laid out **against** that order from its
 * free end toward the corner, and wall B where the two are equal.
 */
export function narrowerEnteredWall(room: DesignRoom): TwoWallDispatch {
  return widerEnteredWall(room) === "A" ? "B" : "A";
}
