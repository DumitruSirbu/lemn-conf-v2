// ADR 0129 D2: `DesignRoom.cornerDirection` has exactly one production reader. Everything else —
// generation, commands, the probe, serialisation — reads the room through this function or not at
// all, which is what keeps a right-hand design canonical everywhere but here.
import type { DesignRoom, DesignRoomShape } from "../design.js";
import type { CornerDirection } from "./validate-room.js";

/** The shapes whose corner turns the way the customer chose. **The one place that fact is spelled**
 *  (M7B U5 review, AC8): a straight room has no corner to turn, and a U has one hand (ADR 0132
 *  decision 8, Q-U4 (b) — `DesignRoomSchema` refuses a `"right"` on one), so today only an L. Both
 *  `carriesCornerDirection` and `cornerDirectionOf` read this set, so they cannot disagree. */
const SHAPES_WITH_A_CHOSEN_DIRECTION: ReadonlySet<DesignRoomShape> = new Set([
  "L",
]);

/** Whether a room of `shape` can be right-hand, and so whether a surface offers a toggle for it and
 *  writes a `direction`. The shape-level question `cornerDirectionOf` answers for a room. */
export function carriesCornerDirection(shape: DesignRoomShape): boolean {
  return SHAPES_WITH_A_CHOSEN_DIRECTION.has(shape);
}

/** The room's corner direction, absent meaning left (D2's writer omits the key for left, so an
 *  absent key and an explicit `"left"` are the same room).
 *
 *  ADR 0130 D7: a straight room has no corner, so this answers `"left"` for one whatever a stored
 *  key says — `validate-room.ts` never writes the key for a straight room, but a stored document is
 *  not proof of what wrote it, and "no mirror on a shape with nothing to mirror" is the rule this
 *  function exists to hold regardless. */
export function cornerDirectionOf(room: DesignRoom): CornerDirection {
  if (!carriesCornerDirection(room.shape)) return "left";
  return room.cornerDirection ?? "left";
}
