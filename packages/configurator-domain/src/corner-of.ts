// ADR 0121: which corner a placement belongs to, answered by what it is. A leaf module on purpose:
// `void-engine.ts` carries the answer on every `PlacementRecord`, and this file's own imports
// (`catalog.ts`, `along-wall-chain-shift.ts`) import `void-engine.ts` back, so the query cannot
// live beside the corner-sizing code without a load-time cycle. `corner-assembly-size.ts`
// re-exports both names, so every existing importer is unchanged.
import type { DesignPlacement, DesignRoom } from "./design.js";
import type { BodyCatalog } from "./void-engine.js";

/** Which side of the room a corner assembly stands on — never a direction a customer chose
 *  (`cornerDirection` is a different fact, ADR 0129 D2), only which of the U's two corners a
 *  structural piece belongs to. */
export type Corner = "left" | "right";

/** ADR 0121: which corner `placement` belongs to, identified by what it is — a structural corner
 *  body (`catalog`'s own `structuralReason: "corner"`, ADR 0021, read rather than listed, so a
 *  fourth corner build id needs no second list here to keep in step) and which wall it stands on —
 *  never by comparing its position against another placement's. `undefined` for anything that is
 *  not a corner body at all.
 *
 *  A wall-B or wall-C piece belongs to the corner its own wall shares with wall A — no ambiguity,
 *  because only one corner ever stands on either of those walls. So `cornerOf` answers `"left"` for
 *  wall B and `"right"` for wall C before it reads the room's shape: wall C meets wall A only at
 *  their right-hand corner, whatever the shape (ADR 0132 Amendment A6).
 *
 *  Wall A's own piece, the X-leg, is the one body every corner puts there, so wall alone cannot
 *  answer for it on a U — this is the one place the query reads a coordinate, and only for a U,
 *  where it reads the room's own midpoint rather than comparing against another placement (ADR 0132
 *  decision 2's own split: `w/2` for the left X-leg, `W − w/2` for the right). A U has no right-hand
 *  variant (ADR 0132 decision 8), so this reads the same way whatever the room's `cornerDirection`.
 *
 *  **An L or a straight room has only ever one corner, always the left** — there is no midpoint
 *  question to ask. Reading the coordinate for every shape put the boundary in the wrong place: an
 *  L's own wall A can be as short as 900 mm (`APPROVED_L_WALL_A_MIN_MM`), which is `W`'s own
 *  midpoint's *twice*, so its one X-leg can sit exactly at `W / 2` and read as "right" — a corner
 *  that does not exist reported for one that does (R1.1). A U's own wall A is never under 1800 mm
 *  (`twoCornersWallAMinimumMm`), which is what keeps the midpoint question meaningful only there. */
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
