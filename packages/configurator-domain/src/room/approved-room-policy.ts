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

// Both wall maxima are the owner's 6000 mm per wall (ADR 0120 Amendment B2, owner 2026-09-15:
// *"lets stick to 6 now for each of the wall"*), replacing the 6300 / 5100 first approved. A product
// number, not the widest room a design can store: that is `MAX_ROOM_*`, which ADR 0124 keeps above
// it on both walls.

/** Wall A: the corner's reach along it at every declared depth. */
const APPROVED_L_WALL_A_MIN_MM = 900;
const APPROVED_L_WALL_A_MAX_MM = 6000;

/** Wall B: the corner reaches 1000 mm along it with the 700 mm cabinets (Amendment A). */
const APPROVED_L_WALL_B_MIN_MM = 1000;
const APPROVED_L_WALL_B_MAX_MM = 6000;

/** ADR 0108 Amendment E: the generated kitchen uses 600 mm for both required bodies, and each free
 *  run begins beyond the corner's farthest reach over all offered cabinet depths. Literals are
 *  intentional owner-approved product data; the engine guard lives in the paired policy test. */
const APPROVED_GENERATED_SINK_WIDTH_MM = 600;
const APPROVED_GENERATED_HOB_WIDTH_MM = 600;
const APPROVED_L_CORNER_REACH_WALL_A_MM = 900;
const APPROVED_L_CORNER_REACH_WALL_B_MM = 1000;

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
      minimumKitchen: {
        isRequired: true,
        sinkWidthMm: APPROVED_GENERATED_SINK_WIDTH_MM,
        hobWidthMm: APPROVED_GENERATED_HOB_WIDTH_MM,
        cornerReachMm: {
          wallA: APPROVED_L_CORNER_REACH_WALL_A_MM,
          wallB: APPROVED_L_CORNER_REACH_WALL_B_MM,
        },
      },
    },
  },
  heightBounds: {
    minMm: APPROVED_CEILING_MIN_MM,
    maxMm: APPROVED_CEILING_MAX_MM,
  },
};
