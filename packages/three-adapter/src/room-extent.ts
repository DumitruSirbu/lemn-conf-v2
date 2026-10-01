import { wallLengthMm, type DesignRoom } from "@lemnaria/configurator-domain";

/** How far the drawn floor reaches from wall A, before the corner overhang: the farther of the two
 *  side walls (M7B D12). A room with no wall C has 0 for it, so an L's and a straight room's floor
 *  is `depthMm` exactly. Read by the shell that draws the floor and by the overview preset that
 *  looks at its middle, so the two cannot disagree about where the floor ends. */
export function floorDepthMm(room: DesignRoom): number {
  return Math.max(room.depthMm, wallLengthMm("C", room));
}
