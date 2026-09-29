// A witness policy for the U (ADR 0108 H1-H4): the bounds the owner approved for a U, and its minimum
// kitchen rule switched on, stated as literals in a test-only policy. `APPROVED_ROOM_POLICY` states no U
// until U6, so the U's gate has no shipped policy to run under. The literals are the owner's (H1 walls,
// RQ1's 2700, H3's 900-per-X-leg and 1000-per-side-wall reaches), never read from the code under test.
import { APPROVED_ROOM_POLICY, validateRoomInput } from "../../src/index.js";
import type {
  DesignRoom,
  RoomPolicy,
  RoomValidation,
} from "../../src/index.js";
import { ENGINE_ROOM_LIMITS } from "../../src/room/room-policy.js";

const APPROVED_U_WALL_A_MIN_MM = 2700;
const APPROVED_U_WALL_MAX_MM = 6000;
const APPROVED_U_SIDE_WALL_MIN_MM = 1000;
const APPROVED_U_X_LEGS_MM = 1800;
const APPROVED_U_SIDE_WALL_REACH_MM = 1000;

function engineU() {
  const walls = ENGINE_ROOM_LIMITS.buildableShapes.U;
  if (walls === undefined) throw new Error("the engine states no U");
  return walls;
}

/** The approved-shaped U with the coupled gate required, under the approved heights. */
export const U_WITNESS_POLICY: RoomPolicy = {
  approval: "interim-unapproved",
  buildableShapes: {
    ...APPROVED_ROOM_POLICY.buildableShapes,
    U: {
      wallA: { minMm: APPROVED_U_WALL_A_MIN_MM, maxMm: APPROVED_U_WALL_MAX_MM },
      wallB: {
        minMm: APPROVED_U_SIDE_WALL_MIN_MM,
        maxMm: APPROVED_U_WALL_MAX_MM,
      },
      wallC: {
        minMm: APPROVED_U_SIDE_WALL_MIN_MM,
        maxMm: APPROVED_U_WALL_MAX_MM,
      },
      minimumKitchen: {
        ...engineU().minimumKitchen,
        isRequired: true,
        cornerReachMm: {
          wallA: APPROVED_U_X_LEGS_MM,
          sideWall: APPROVED_U_SIDE_WALL_REACH_MM,
        },
      },
    },
  },
  heightBounds: APPROVED_ROOM_POLICY.heightBounds,
};

/** What `validateRoomInput` says of `room` entered on a U form, under the witness policy. */
export function gateVerdictFor(
  room: DesignRoom,
  policy: RoomPolicy = U_WITNESS_POLICY,
): RoomValidation {
  return validateRoomInput(
    {
      shape: "U",
      wallAMm: room.widthMm,
      wallBMm: room.depthMm,
      wallCMm: room.wallCMm,
      heightMm: room.heightMm,
      cornerDirection: "left",
    },
    policy,
  );
}
