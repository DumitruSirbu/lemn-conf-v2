// ADR 0065's one domain-owned answer to whether a body reaches past the end of its wall. The
// scene, price, breakdown and review surfaces consume the ids this query returns; none re-derives
// the geometry.

import type { Design, DesignPlacement, DesignRoom } from "../design.js";
import { compareOpaqueIds } from "../opaque-id-order.js";

/**
 * Placement ids whose furthest along-wall extent exceeds that placement's own wall length.
 *
 * §12 stores `alongMm` at the body's centre, so the far edge is `alongMm + widthMm / 2`. Wall A is
 * bounded by the room width and wall B by its depth (§2). Equality fits, and any amount of wall
 * left bare is the normal case (ADR 0067).
 *
 * Results are byte-sorted by id so this fact is independent of the persisted array order. Placement
 * id uniqueness and wire validity remain boundary guarantees of `validateDesignForCatalog` and
 * `DesignSchema`; this geometry-only query neither invents a catalogue dependency nor replaces
 * those checks.
 */
export function findOverflowingPlacementIds(design: Design): readonly string[] {
  // This is a set-like diagnostic, not a customer-facing body order. Give the receiver a name that
  // says so: the repository's structural guard reserves sorts of placement/body lists for
  // `projectDesignForDisplay`, while ids here need only a deterministic order for equal facts.
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
 * §2's own-wall bounds, shared with validation so an empty span cannot fork the wall mapping.
 *
 * This was once `Math.max(widthMm, depthMm)` for both walls to accommodate a bad 2400 mm fixture
 * depth. The corrected wall B is 2830 mm; lending either wall the other axis would again hide the
 * exact overrun this fact exists to report (ADR 0065 decision 5).
 */
export function wallLengthMm(
  wall: DesignPlacement["wall"],
  room: DesignRoom,
): number {
  return wall === "A" ? room.widthMm : room.depthMm;
}
