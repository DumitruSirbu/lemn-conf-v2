// ADR 0129 D2: `DesignRoom.cornerDirection` has exactly one production reader. Everything else —
// generation, commands, the probe, serialisation — reads the room through this function or not at
// all, which is what keeps a right-hand design canonical everywhere but here.
import type { DesignRoom } from "../design.js";
import type { CornerDirection } from "./validate-room.js";

/** The room's corner direction, absent meaning left (D2's writer omits the key for left, so an
 *  absent key and an explicit `"left"` are the same room).
 *
 *  ADR 0130 D7: a straight room has no corner, so this answers `"left"` for one whatever a stored
 *  key says — `validate-room.ts` never writes the key for a straight room, but a stored document is
 *  not proof of what wrote it, and "no mirror on a shape with nothing to mirror" is the rule this
 *  function exists to hold regardless. */
export function cornerDirectionOf(room: DesignRoom): CornerDirection {
  if (room.shape !== "L") return "left";
  return room.cornerDirection ?? "left";
}
