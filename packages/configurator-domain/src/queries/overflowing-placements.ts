// ADR 0065's one domain-owned answer to whether a body reaches past the end of its wall. The scene,
// price, breakdown and review surfaces consume the ids this query returns; none re-derives the
// geometry.

import type { Design, DesignPlacement, DesignRoom } from "../design.js";
import { compareOpaqueIds } from "../opaque-id-order.js";

/**
 * Placement ids whose furthest along-wall extent exceeds that placement's own wall length.
 *
 * §12 stores `alongMm` at the body's centre, so the far edge is `alongMm + widthMm / 2`. Equality
 * fits, and any amount of wall left bare is the normal case (ADR 0067).
 *
 * Byte-sorted by id so the fact is independent of the persisted array order. Id uniqueness and wire
 * validity remain boundary guarantees of `validateDesignForCatalog` and `DesignSchema`; this
 * geometry-only query neither invents a catalogue dependency nor replaces those checks.
 */
export function findOverflowingPlacementIds(design: Design): readonly string[] {
  // Named `overflowingIds` on purpose: the repository's structural guard reserves sorts of
  // placement/body lists for `projectDesignForDisplay`, and these ids need only a deterministic order.
  const overflowingIds = design.placements
    .filter((placement) => placementExtendsPastOwnWall(placement, design.room))
    .map((placement) => placement.id);
  return overflowingIds.sort(compareOpaqueIds);
}

export function placementExtendsPastOwnWall(
  placement: DesignPlacement,
  room: DesignRoom,
): boolean {
  const alongEndMm = placement.alongMm + placement.body.widthMm / 2;
  return alongEndMm > wallLengthMm(placement.wall, room);
}

/**
 * §2's own-wall bounds, shared with validation so an empty span cannot fork the wall mapping. Neither
 * wall is lent the other's axis, which would hide the overrun this fact reports (ADR 0065 decision 5).
 *
 * A shape without a wall has a run of 0, so a placement on it reads as overflowing, never as fitting
 * a wall that is not there: wall B in a straight room (whose `depthMm` is the drawn floor's depth,
 * never a wall; ADR 0130 D3, D4) and wall C in an L or straight room (ADR 0132 decision 5). The
 * schema stores such a placement (ADR 0132 decision 6); it is marked, never refused.
 */
export function wallLengthMm(
  wall: DesignPlacement["wall"],
  room: DesignRoom,
): number {
  if (wall === "A") return room.widthMm;
  if (wall === "B") return room.shape === "linear" ? 0 : room.depthMm;
  return room.shape === "U" ? (room.wallCMm ?? 0) : 0;
}
