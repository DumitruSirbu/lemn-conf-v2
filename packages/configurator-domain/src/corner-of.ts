// ADR 0121: which corner a placement belongs to, answered by what it is. A leaf module: `void-engine.ts`
// carries the answer on every `PlacementRecord`, and this file's imports (`catalog.ts`,
// `along-wall-chain-shift.ts`) import `void-engine.ts` back, so living beside the corner-sizing code
// would create a load-time cycle. `corner-assembly-size.ts` re-exports both names.
import type { DesignPlacement, DesignRoom } from "./design.js";
import type { BodyCatalog } from "./void-engine.js";

/** Which side of the room a corner assembly stands on — never a direction a customer chose
 *  (`cornerDirection` is a different fact, ADR 0129 D2), only which of the U's two corners a
 *  structural piece belongs to. */
export type Corner = "left" | "right";

/** ADR 0121: which corner `placement` belongs to, identified by what it is: a structural corner body
 *  (`structuralReason: "corner"`, read rather than listed, ADR 0021) and the wall it stands on, never
 *  by comparing positions. `undefined` for anything that is not a corner body.
 *
 *  A wall-B or wall-C piece belongs to the corner its wall shares with wall A, so `cornerOf` answers
 *  `"left"` for wall B and `"right"` for wall C before reading the room's shape (ADR 0132
 *  Amendment A6). Wall A's X-leg is the one body every corner puts there, so on a U alone this reads a
 *  coordinate: the room's own midpoint (`w/2` for the left X-leg, `W − w/2` for the right; ADR 0132
 *  decision 2). A U has no right-hand variant, so this holds whatever `cornerDirection` says.
 *
 *  An L or a straight room has one corner, always the left. Reading the coordinate for every shape put
 *  the boundary wrong: an L's wall A can be as short as 900 mm (`APPROVED_L_WALL_A_MIN_MM`), so its one
 *  X-leg can sit exactly at `W / 2` and read as "right". A U's wall A is never under 1800 mm
 *  (`twoCornersWallAMinimumMm`), which keeps the midpoint question meaningful only there. */
export function cornerOf(
  placement: DesignPlacement,
  room: DesignRoom,
  catalog: BodyCatalog,
): Corner | undefined {
  if (catalog.get(placement.body.buildId)?.structuralReason !== "corner") {
    return undefined;
  }
  if (placement.wall === "B") return "left";
  if (placement.wall === "C") return "right";
  if (room.shape !== "U") return "left";
  return placement.alongMm < room.widthMm / 2 ? "left" : "right";
}
