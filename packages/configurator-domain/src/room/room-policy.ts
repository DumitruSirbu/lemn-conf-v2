// ADR 0108: what a customer may enter as a room, as data the validator is handed rather than rules
// it holds (decision 1) — the policy's shape, and the engine's own limits. Each limit is **derived at
// module load from the constant that already imposes it**, never a chosen number (decision 6).
//
// **Since Amendment B these limits are not the product's policy.** The owner approved the L's bounds
// as numbers, and those live in `approved-room-policy.ts`; this object is the floor and ceiling that
// policy is guarded against, so an engineering change that moves a limit past an approved bound turns
// a test red instead of silently moving what a customer may enter.
//
// Nothing it imports reaches back into `room/`: a cycle here would bind a bound to `undefined` and
// compare every value against it silently, the failure `module-grid.ts`'s head comment records.
import { alongWallPositionAtMm } from "../along-wall-chain-shift.js";
import {
  MAX_ROOM_DEPTH_MM,
  MAX_ROOM_HEIGHT_MM,
  MAX_ROOM_WIDTH_MM,
} from "../design-bounds.js";
import {
  cabinetDepthMmOf,
  type DesignPlacement,
  type DesignWall,
} from "../design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../fixtures/kitchen-l-design.js";
import { toExactMillimetres } from "../millimetres.js";
import { LEVELS } from "../module-grid.js";
import { declaredCabinetDepthsMm } from "../worktop-depth.js";

/** Whole millimetres, inclusive at both ends. */
export interface MillimetreBounds {
  readonly minMm: number;
  readonly maxMm: number;
}

/** An L's two walls. Wall A's run is the room's `widthMm` and wall B's its `depthMm` —
 *  `wallLengthMm`'s mapping (ADR 0065 decision 5). */
export interface LWallBounds {
  readonly wallA: MillimetreBounds;
  readonly wallB: MillimetreBounds;
}

/** A shape is buildable exactly when its walls' bounds are stated here, so a buildable shape cannot
 *  lack them. Only the L can be stated: it is the one shape a valid input maps onto `DesignRoom`
 *  for (ADR 0108 decision 8). A straight kitchen is wave 7J's, behind owner question Q5. */
export interface BuildableShapes {
  readonly L?: LWallBounds;
}

/** Whether the owner has ruled on these bounds. Load-bearing (ADR 0108, *Consequences*): no surface,
 *  commit or record may call the bounds settled while a policy reads `interim-unapproved`. */
export type RoomPolicyApproval = "interim-unapproved" | "owner-approved";

export interface RoomPolicy {
  readonly approval: RoomPolicyApproval;
  readonly buildableShapes: BuildableShapes;
  readonly heightBounds: MillimetreBounds;
}

/** **Not a product bound — none of these is** (ADR 0108 decision 6, Amendment B). The minima are what
 *  the engine can build at all, at every cabinet depth the customer can later choose (Amendment A);
 *  the maxima are what a design can store, so no policy maximum can exceed the wire bound for its
 *  axis (decision 7). Still `interim-unapproved`: the owner ruled on the approved policy's numbers,
 *  not on these. */
export const ENGINE_ROOM_LIMITS: RoomPolicy = {
  approval: "interim-unapproved",
  buildableShapes: {
    L: {
      wallA: { minMm: farthestCornerEdgeMm("A"), maxMm: MAX_ROOM_WIDTH_MM },
      wallB: { minMm: farthestCornerEdgeMm("B"), maxMm: MAX_ROOM_DEPTH_MM },
    },
  },
  heightBounds: { minMm: baseRowTopMm(), maxMm: MAX_ROOM_HEIGHT_MM },
};

/** The farthest along-wall edge the reference kitchen's structural corner reaches on `wall`, **at any
 *  declared cabinet depth**. The L has exactly one corner assembly and it is structural (ADR 0021),
 *  so a wall shorter than this cannot hold its own corner at some depth the editor offers. Wall B's
 *  corner slides out as the cabinets deepen and wall A's does not (ADR 0108 Amendment A), which the
 *  chain reader answers per placement, so no wall is branched on here. */
function farthestCornerEdgeMm(wall: DesignWall): number {
  const corners = structuralCornersOn(wall);
  const farEdgesMm = offeredCabinetDepthsMm().flatMap((cabinetDepthMm) =>
    corners.map((corner) => farEdgeAtCabinetDepthMm(corner, cabinetDepthMm)),
  );
  return Math.max(...farEdgesMm);
}

function structuralCornersOn(wall: DesignWall): readonly DesignPlacement[] {
  const corners = KITCHEN_L_DESIGN.placements.filter(
    (placement) => placement.wall === wall && isStructuralCorner(placement),
  );
  if (corners.length === 0) {
    throw new Error(
      `ENGINE_ROOM_LIMITS: the reference kitchen has no structural corner on wall ${wall} to derive the wall's minimum from`,
    );
  }
  return corners;
}

function isStructuralCorner(placement: DesignPlacement): boolean {
  return (
    KITCHEN_L_BODY_CATALOG.get(placement.body.buildId)?.structuralReason ===
    "corner"
  );
}

function offeredCabinetDepthsMm(): readonly number[] {
  const cabinetDepthsMm = declaredCabinetDepthsMm();
  if (cabinetDepthsMm.length === 0) {
    throw new Error(
      "ENGINE_ROOM_LIMITS: no cabinet depth is declared to hold the wall minima at",
    );
  }
  return cabinetDepthsMm;
}

/** Where `corner` ends along its wall once the kitchen is taken to `cabinetDepthMm` — the reader
 *  `setCabinetDepth` positions every body with, so the policy and the command cannot disagree. */
function farEdgeAtCabinetDepthMm(
  corner: DesignPlacement,
  cabinetDepthMm: number,
): number {
  const centreMm = alongWallPositionAtMm({
    placement: corner,
    catalog: KITCHEN_L_BODY_CATALOG,
    fromCabinetDepthMm: cabinetDepthMmOf(KITCHEN_L_DESIGN),
    toCabinetDepthMm: cabinetDepthMm,
  });
  return centreMm + corner.body.widthMm / 2;
}

/** The top of `LEVELS[0]`, the base row: below it no cabinet stands at all. */
function baseRowTopMm(): number {
  const baseRow = LEVELS[0];
  const topMm =
    baseRow === undefined ? undefined : toExactMillimetres(baseRow[1]);
  if (topMm === undefined) {
    throw new Error(
      "ENGINE_ROOM_LIMITS: LEVELS declares no base row on a whole millimetre to derive the height minimum from",
    );
  }
  return topMm;
}
