// What the U's gate says of a room: `validateRoomInput` handed a U form's fields. Until M7B U6 the
// approved policy stated no U, so this file also held a witness policy carrying the owner's literals
// (ADR 0108 H1-H4); `APPROVED_ROOM_POLICY` states them itself now, and `approved-room-policy.test.ts`
// pins them, so the witness is retired and the gate runs under the product's own policy.
import { APPROVED_ROOM_POLICY, validateRoomInput } from "../../src/index.js";
import type {
  DesignRoom,
  RoomPolicy,
  RoomValidation,
} from "../../src/index.js";

/** What `validateRoomInput` says of `room` entered on a U form, under `policy` (the approved one by default). */
export function gateVerdictFor(
  room: DesignRoom,
  policy: RoomPolicy = APPROVED_ROOM_POLICY,
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
