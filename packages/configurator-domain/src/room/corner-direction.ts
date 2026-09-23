// ADR 0129 D2: `DesignRoom.cornerDirection` has exactly one production reader. Everything else —
// generation, commands, the probe, serialisation — reads the room through this function or not at
// all, which is what keeps a right-hand design canonical everywhere but here.
import type { DesignRoom } from "../design.js";
import type { CornerDirection } from "./validate-room.js";

/** The room's corner direction, absent meaning left (D2's writer omits the key for left, so an
 *  absent key and an explicit `"left"` are the same room). */
export function cornerDirectionOf(room: DesignRoom): CornerDirection {
  return room.cornerDirection ?? "left";
}
