// The room a customer may enter, as the owner approved it (ADR 0108 Amendment B). Owner, 2026-09-11,
// answering the M7 plan's Q1 with Amendment A's recommendation in front of them:
//
// > *"Yes looks like good boundaries"*
//
// **Literals, on purpose** (Amendment B decision B1): the owner approved numbers, not formulas, so a
// later engineering change must not move them silently. They are held inside `ENGINE_ROOM_LIMITS`
// by `approved-room-policy.test.ts`, which also pins each value, so editing one here is a deliberate,
// visible change. The L only: straight and U-shaped rooms stay refused until their own waves put
// their bounds to the owner (decision B2).
import type { RoomPolicy } from "./room-policy.js";

/** Wall A: the corner's reach along it at every declared depth, up to the widest room a design can
 *  store. */
const APPROVED_L_WALL_A_MIN_MM = 900;
const APPROVED_L_WALL_A_MAX_MM = 6300;

/** Wall B: the corner reaches 1000 mm along it with the 700 mm cabinets (Amendment A). */
const APPROVED_L_WALL_B_MIN_MM = 1000;
const APPROVED_L_WALL_B_MAX_MM = 5100;

/** The ceiling: from the top of the wall-cabinet row — below it a kitchen has no upper cabinets — to
 *  the tallest room a design can store. A product choice that coincides with a module line, which is
 *  why it is not read off `LEVELS`. */
const APPROVED_CEILING_MIN_MM = 2200;
const APPROVED_CEILING_MAX_MM = 3900;

export const APPROVED_ROOM_POLICY: RoomPolicy = {
  approval: "owner-approved",
  buildableShapes: {
    L: {
      wallA: {
        minMm: APPROVED_L_WALL_A_MIN_MM,
        maxMm: APPROVED_L_WALL_A_MAX_MM,
      },
      wallB: {
        minMm: APPROVED_L_WALL_B_MIN_MM,
        maxMm: APPROVED_L_WALL_B_MAX_MM,
      },
    },
  },
  heightBounds: {
    minMm: APPROVED_CEILING_MIN_MM,
    maxMm: APPROVED_CEILING_MAX_MM,
  },
};
