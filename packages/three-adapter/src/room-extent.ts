import {
  toMetres,
  wallLengthMm,
  type DesignRoom,
} from "@lemnaria/configurator-domain";

/** The floor and the two wall planes run this far past the corner, so the planes meet without a visible seam.
 *  Fixed, not proportional: it is a construction detail, not a room dimension (see ADR 0143 decision 1). At a
 *  900 mm wall a third of the 1200 mm plane sits behind the corner: accepted appearance, not a defect. */
export const CORNER_OVERHANG_M = 0.3;

/** How far the drawn floor reaches from wall A, before the corner overhang: the farther of the two
 *  side walls (M7B D12). A room with no wall C has 0 for it, so an L's and a straight room's floor
 *  is `depthMm` exactly. Read by the shell that draws the floor and by the overview preset that
 *  looks at its middle, so the two cannot disagree about where the floor ends. */
export function floorDepthMm(room: DesignRoom): number {
  return Math.max(room.depthMm, wallLengthMm("C", room));
}

export interface FloorPlanBoundsM {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** The drawn floor's footprint in the room's canonical (left-hand) frame, in metres: from the corner overhang behind
 *  wall A and wall B to the ends of the entered walls. Every body, wall and run-end panel stands inside it. */
export function floorPlanBoundsM(room: DesignRoom): FloorPlanBoundsM {
  return {
    minX: -CORNER_OVERHANG_M,
    maxX: toMetres(room.widthMm),
    minZ: -CORNER_OVERHANG_M,
    maxZ: toMetres(floorDepthMm(room)),
  };
}
