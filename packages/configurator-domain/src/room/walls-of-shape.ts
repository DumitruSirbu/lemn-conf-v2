// ADR 0132 decision 5 (M7B plan D7): which walls a shape has, as one domain fact instead of an
// enumeration every caller repeats. `requiredFieldsFor` and the plan preview's `DRAWABLE_WALLS`
// derive from this (backlog 76), which is why it is exported rather than kept as a private table
// inside whichever caller needed it first.
import type { DesignRoomShape } from "../design.js";
import type { WallId } from "../room-transforms.js";

const WALLS_OF_SHAPE: Readonly<Record<DesignRoomShape, readonly WallId[]>> = {
  linear: ["A"],
  L: ["A", "B"],
  U: ["A", "B", "C"],
};

/** The walls `shape` has, in the order they are walked from the A∩B corner. A shape a room can
 *  never be is not this function's question — every `DesignRoomShape` answers something, because
 *  the schema that produces one already refused anything else. */
export function wallsOf(shape: DesignRoomShape): readonly WallId[] {
  return WALLS_OF_SHAPE[shape];
}
