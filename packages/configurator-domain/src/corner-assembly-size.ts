// How wide the corner assembly is built: a function of the cabinet depth, the two wall directions and
// the room, and of nothing else (ADR 0120 Amendment A: every cabinet is custom made, corners included).
//
// The sibling of `along-wall-chain-shift.ts`, which answers where a corner slides when a stored
// design's depth changes (ADR 0089); this answers how wide a corner is when the generator builds one.
// A design authored at 600 mm and taken to 700 slides and does not resize.
//
// Three entry points, each named for its own quantifier, because "the corner's reach" is two
// questions and one function answering both lets the shell acquire the policy's number:
//
// 1. `cornerAssemblyWidthsMm` — the six along-wall widths at one (depth, room). The room enters as a
//    ceiling and never as a target: a corner is built to the reference size unless the wall cannot
//    hold it, and never wider.
// 2. `cornerFarEdgeMm` and `cornerAlongWallCentreMm` — arithmetic over (1), band-aware, reading no
//    policy and no catalogue row. The centre is where the millimetre grid binds: a piece is placed
//    on its centre, so an odd width would put it on a half millimetre, which
//    `docs/best-practices/product-invariants.md` rejects rather than rounds.
// 3. `narrowestCornerReachMm` — the least length a wall may have and still hold a corner, at the
//    declared depth that reaches farthest. It takes no room: the corner shrinks to fit, so the
//    binding case is room-independent, which keeps `ENGINE_ROOM_LIMITS`' reader from being a fixed
//    point over the bound it computes.
//
// (2) and (3) answer in distinct named types so a caller cannot take the other's number. Nothing here
// imports from `room/`: a cycle would bind a bound to `undefined` at module load and compare every
// value against it silently (see `room/room-policy.ts`).
import { cornerTakingWallsOf } from "./along-wall-chain-shift.js";
import {
  baseCarcassFrontMm,
  INSERTABLE_BODY_DEFINITIONS,
  wallCarcassDepthMm,
} from "./catalog.js";
import type { DesignRoom, DesignWall } from "./design.js";
import { wallLengthMm } from "./queries/overflowing-placements.js";
import { declaredCabinetDepthsMm, WORKTOP_DEPTH_MM } from "./worktop-depth.js";

/** The rows a corner piece stands in. `column` is not among them: no corner piece is full height
 *  (ADR 0021, ADR 0025). */
export type CornerBand = "base" | "wall" | "top";

/** One corner body, named by the two things this module sizes it from. */
export interface CornerAssemblyPiece {
  readonly wall: DesignWall;
  readonly band: CornerBand;
}

/** The six corner bodies. Wall A carries the blind X-leg in the base row and the corner wall unit in
 *  the wall and top rows, 900 mm from the corner, so the back wall's corner is covered at every level
 *  (ADR 0110 Amendment O). None is insertable: the assembly is the bodies the catalogue seeds. */
export const CORNER_ASSEMBLY_PIECES: readonly CornerAssemblyPiece[] = [
  { wall: "A", band: "base" },
  { wall: "A", band: "wall" },
  { wall: "A", band: "top" },
  { wall: "B", band: "base" },
  { wall: "B", band: "wall" },
  { wall: "B", band: "top" },
];

/** One corner piece with the width it is built at. */
export interface SizedCornerPiece extends CornerAssemblyPiece {
  readonly widthMm: number;
}

/** The whole assembly's along-wall widths at one (depth, room). Carries its depth so
 *  `cornerFarEdgeMm` cannot be handed widths from one depth and asked for an edge at another. */
export interface CornerAssemblyWidthsMm {
  readonly cabinetDepthMm: number;
  /** The room these widths were derived in, so a downstream refusal names the room that produced
   *  the number. */
  readonly room: DesignRoom;
  readonly pieces: readonly SizedCornerPiece[];
}

export interface CornerAssemblyQuery {
  readonly cabinetDepthMm: number;
  /** The room the corner is built for: a ceiling on each width, never a target. */
  readonly room: DesignRoom;
}

export interface CornerFarEdgeQuery {
  readonly widths: CornerAssemblyWidthsMm;
  readonly cabinetDepthMm: number;
  readonly wall: DesignWall;
  readonly band: CornerBand;
}

/** Where the corner assembly stops along one wall in one row. A far edge, not a wall minimum; the
 *  distinct type stops a caller answering one with the other. */
export interface CornerFarEdge {
  readonly wall: DesignWall;
  readonly band: CornerBand;
  readonly farEdgeMm: number;
}

/** Where one piece's centre sits along its wall: half a width from the far edge, and a distinct type
 *  so a caller cannot place a piece on the wrong one. */
export interface CornerAlongWallCentre {
  readonly wall: DesignWall;
  readonly band: CornerBand;
  readonly alongMm: number;
}

/** The least length a wall may have and still hold a corner at all. A wall minimum, not a far edge;
 *  no room took part in deriving it. */
export interface NarrowestCornerReach {
  readonly wall: DesignWall;
  readonly wallMinimumMm: number;
}

/** The along-wall widths for one cabinet depth in one room (entry point 1). */
export function cornerAssemblyWidthsMm(
  query: CornerAssemblyQuery,
): CornerAssemblyWidthsMm {
  return {
    cabinetDepthMm: query.cabinetDepthMm,
    room: query.room,
    pieces: CORNER_ASSEMBLY_PIECES.map((piece) => ({
      ...piece,
      widthMm: widthInRoomMm(piece, query),
    })),
  };
}

/** The largest even whole-millimetre width below the reference and wall ceilings, floored at the
 *  piece's own floor (ADR 0120 Amendment A; the persisted centre's millimetre grid).
 *
 *  The room can only take width away. A `min`, not a target, so no room can widen a piece past the
 *  one-door threshold the three fronted pieces sit below. */
function widthInRoomMm(
  piece: CornerAssemblyPiece,
  query: CornerAssemblyQuery,
): number {
  const wallCanHoldMm =
    wallLengthMm(piece.wall, query.room) -
    nearEdgeMm(piece, query.cabinetDepthMm);
  const ceilingMm = Math.min(referenceWidthMm(piece), wallCanHoldMm);
  return Math.max(
    narrowestWidthMm(piece, query.cabinetDepthMm),
    Math.floor(ceilingMm / 2) * 2,
  );
}

/** Where one piece stops along its wall (entry point 2): its near edge at this depth plus its width. */
export function cornerFarEdgeMm(query: CornerFarEdgeQuery): CornerFarEdge {
  if (query.widths.cabinetDepthMm !== query.cabinetDepthMm) {
    throw new Error(
      `cornerFarEdgeMm: widths derived at ${String(query.widths.cabinetDepthMm)} mm cannot answer for a ${String(query.cabinetDepthMm)} mm kitchen`,
    );
  }
  const piece = sizedPieceOf(query);
  return {
    wall: query.wall,
    band: query.band,
    farEdgeMm: nearEdgeMm(piece, query.cabinetDepthMm) + piece.widthMm,
  };
}

/** Where one piece is centred along its wall: the coordinate a `DesignPlacement` carries.
 *
 *  A half-millimetre centre is refused, never rounded (`docs/best-practices/product-invariants.md`):
 *  rounding would move the piece off the wall end its width was derived from. Width derivation keeps
 *  every width even, so this catches an invalid width supplied another way. */
export function cornerAlongWallCentreMm(
  query: CornerFarEdgeQuery,
): CornerAlongWallCentre {
  const { widthMm } = sizedPieceOf(query);
  const { farEdgeMm } = cornerFarEdgeMm(query);
  const centre = {
    wall: query.wall,
    band: query.band,
    alongMm: farEdgeMm - widthMm / 2,
  };
  refuseAHalfMillimetreCentre({ centre, widthMm, room: query.widths.room });
  return centre;
}

function refuseAHalfMillimetreCentre(placed: {
  readonly centre: CornerAlongWallCentre;
  readonly widthMm: number;
  readonly room: DesignRoom;
}): void {
  if (
    Number.isInteger(placed.widthMm) &&
    Number.isInteger(placed.centre.alongMm)
  ) {
    return;
  }
  const { wall, band, alongMm } = placed.centre;
  throw new Error(
    `cornerAlongWallCentreMm: the wall ${wall} ${band} corner is ${String(placed.widthMm)} mm wide in the ${String(placed.room.widthMm)} × ${String(placed.room.depthMm)} mm room, so its centre falls on ${String(alongMm)} mm — a persisted design holds whole millimetres`,
  );
}

function sizedPieceOf(query: CornerFarEdgeQuery): SizedCornerPiece {
  const piece = query.widths.pieces.find(
    (candidate) =>
      candidate.wall === query.wall && candidate.band === query.band,
  );
  if (piece === undefined) {
    throw new Error(
      `cornerFarEdgeMm: the assembly stands on no wall ${query.wall} piece in the ${query.band} row`,
    );
  }
  return piece;
}

/** The wall minimum (entry point 3): the farthest the narrowest corner this product builds reaches
 *  along `wall`, maximised over every declared cabinet depth, taking no room.
 *
 *  `ENGINE_ROOM_LIMITS` reads this. A maximum over rooms would be attained in the largest one,
 *  pinning the bound to the reference corner and blinding the guard written to catch a shrink. */
export function narrowestCornerReachMm(wall: DesignWall): NarrowestCornerReach {
  const pieces = CORNER_ASSEMBLY_PIECES.filter((piece) => piece.wall === wall);
  if (pieces.length === 0) {
    throw new Error(
      `narrowestCornerReachMm: the assembly stands on no wall ${wall} piece to derive the wall's minimum from`,
    );
  }
  const reachesMm = offeredCabinetDepthsMm().flatMap((cabinetDepthMm) =>
    pieces.map(
      (piece) =>
        nearEdgeMm(piece, cabinetDepthMm) +
        narrowestWidthMm(piece, cabinetDepthMm),
    ),
  );
  return { wall, wallMinimumMm: Math.max(...reachesMm) };
}

function offeredCabinetDepthsMm(): readonly number[] {
  const cabinetDepthsMm = declaredCabinetDepthsMm();
  if (cabinetDepthsMm.length === 0) {
    throw new Error(
      "narrowestCornerReachMm: no cabinet depth is declared to hold the wall minima at",
    );
  }
  return cabinetDepthsMm;
}

// The right corner of a U (A∩C; ADR 0132 decision 2) is the left corner's rule run again: entry points
// 1 and 2 against wall C's run standing in for wall B's, output relabelled from B to C. The X-leg
// (wall A) is shared by both corners, so it is reflected about the room's width (`W − centreMm`)
// instead. That is ordinary arithmetic on a domain-canonical number, not a `Group`-level reflection,
// which ADR 0129 keeps out of the domain.

export { cornerOf, type Corner } from "./corner-of.js";

/** The right corner's along-wall widths, in the room's own coordinates: entry point 1 run against
 *  wall C's run, with wall B's pieces relabelled to wall C.
 *
 *  The X-leg sizes identically to the left corner's: `widthInRoomMm` for the wall-A piece reads only
 *  `wallLengthMm("A", room)` and the depth, which the two corners share, so no second formula is
 *  needed. */
export function rightCornerAssemblyWidthsMm(
  query: CornerAssemblyQuery,
): CornerAssemblyWidthsMm {
  const sized = cornerAssemblyWidthsMm({
    cabinetDepthMm: query.cabinetDepthMm,
    room: roomForTheRightCorner(query.room),
  });
  return {
    cabinetDepthMm: sized.cabinetDepthMm,
    room: query.room,
    pieces: sized.pieces.map(relabelledToTheRightCorner),
  };
}

/** ADR 0132 decision 2: "the along values the corner rule gives for the L room (W, C)". An L-shaped
 *  room standing in for the real U, its depth wall C's run — the one place a U's `wallCMm` enters the
 *  corner rule. Exported so `generation/shell-design.ts`'s wall-C tiling shares this derivation rather
 *  than copying it. */
export function roomForTheRightCorner(room: DesignRoom): DesignRoom {
  if (room.wallCMm === undefined) {
    throw new Error(
      "roomForTheRightCorner: the room carries no wallCMm to size the right corner against",
    );
  }
  return {
    shape: "L",
    widthMm: room.widthMm,
    depthMm: room.wallCMm,
    heightMm: room.heightMm,
  };
}

function relabelledToTheRightCorner(piece: SizedCornerPiece): SizedCornerPiece {
  return piece.wall === "B" ? { ...piece, wall: "C" } : piece;
}

/** The inverse relabelling, so a right corner's widths can be handed to entry point 2's functions,
 *  which read a wall-B piece for anything that is not wall A (`ownsTheCorner`, `nearEdgeMm`). Not
 *  exported: no caller should hold a corner's widths under the wrong corner's wall letters. */
function asLeftCornerWidths(
  widths: CornerAssemblyWidthsMm,
): CornerAssemblyWidthsMm {
  return {
    ...widths,
    pieces: widths.pieces.map((piece) =>
      piece.wall === "C" ? { ...piece, wall: "B" } : piece,
    ),
  };
}

/** Where one right-corner piece is centred along its wall. Wall C's pieces take the along values
 *  entry point 2 gives wall B's in the synthetic room, unreflected, because wall C runs the same way
 *  as wall B (ADR 0132 decision 1). The X-leg (wall A) is the left X-leg's centre reflected,
 *  `W − centreMm` (ADR 0132 decision 2): exact on whole millimetres, so entry point 2's refusal on
 *  the left numbers is the only one needed. */
export function rightCornerAlongWallCentreMm(
  query: CornerFarEdgeQuery,
): CornerAlongWallCentre {
  const leftStyle = cornerAlongWallCentreMm({
    ...query,
    wall: query.wall === "C" ? "B" : query.wall,
    widths: asLeftCornerWidths(query.widths),
  });
  if (query.wall === "A") {
    return {
      wall: "A",
      band: query.band,
      alongMm: query.widths.room.widthMm - leftStyle.alongMm,
    };
  }
  return { wall: "C", band: query.band, alongMm: leftStyle.alongMm };
}

/** The least length wall A may have and still hold both of a U's corners without their X-legs
 *  overlapping (ADR 0132 decision 4): the sum of each X-leg's reference width, deliberately not twice
 *  `narrowestCornerReachMm("A")`'s 870. The X-legs overlap only below 1800 mm
 *  (`2 × REFERENCE_CORNER_REACH_MM`), because each X-leg's ceiling is the whole of wall A. This is
 *  `ENGINE_ROOM_LIMITS.U.wallA.minMm`'s derivation source. */
export function twoCornersWallAMinimumMm(): number {
  return REFERENCE_CORNER_REACH_MM * 2;
}

/** The reference kitchen's corner: 900 mm along each wall at the declared 600 mm depth, the one
 *  measurement in this module (the figure ADR 0108 Amendment B's wall-A minimum was taken from).
 *  The other pieces' reference widths (330 mm base return, 570 for the two upper ones) are derived
 *  from it, because four numbers that agree at one depth eventually part (ADR 0102). */
const REFERENCE_CORNER_REACH_MM = 900;

/** How wide this piece is built where the room does not constrain it: the reference reach less
 *  whatever stands in front of it at the reference kitchen's own depth. */
function referenceWidthMm(piece: CornerAssemblyPiece): number {
  return REFERENCE_CORNER_REACH_MM - nearEdgeMm(piece, WORKTOP_DEPTH_MM);
}

/** Where a piece starts along its own wall: past whatever the other wall's run puts in front of the
 *  corner in that row.
 *
 *  Wall A owns the corner and starts at 0. Wall B starts past wall A's body in the same row: the base
 *  run's carcass front in the base row (570 at 600 mm, 670 at 700; ADR 0135) and §7's head-clearance
 *  depth in the wall and top rows (330, 400). The rows part by 240 mm at 600 and 270 at 700 rather
 *  than by a constant (ADR 0089's two chains), so no depth-independent width pair makes them agree. */
function nearEdgeMm(
  piece: CornerAssemblyPiece,
  cabinetDepthMm: number,
): number {
  if (ownsTheCorner(piece)) return 0;
  return standsInTheBaseRow(piece)
    ? baseCarcassFrontMm(cabinetDepthMm)
    : wallCarcassDepthMm(cabinetDepthMm);
}

/** Wall A's pieces start at the corner, so nothing of the other wall stands in front of them or
 *  moves them.
 *
 *  `cornerTakingWallsOf("U")` rather than a bare wall-B comparison: every call here is inside a
 *  two-wall synthetic room, so the wider set answers as the bare comparison would today, and a
 *  direct wall-C piece from a caller outside this module is not reported as owning the corner. */
function ownsTheCorner(piece: CornerAssemblyPiece): boolean {
  return !cornerTakingWallsOf("U").has(piece.wall);
}

function standsInTheBaseRow(piece: CornerAssemblyPiece): boolean {
  return piece.band === "base";
}

/** The narrowest this piece is ever built: the blind span it has to cover before it is a cabinet at
 *  all, plus a cabinet with one door. */
function narrowestWidthMm(
  piece: CornerAssemblyPiece,
  cabinetDepthMm: number,
): number {
  return blindSpanMm(piece, cabinetDepthMm) + oneDoorCabinetFloorMm(piece.band);
}

/** How much of a piece's own width the other wall's body stands in front of. Only wall A's pieces
 *  have any, the same in every row: the return leg butts against the X-leg's front face, so the X-leg
 *  is a cabinet only past the run's carcass front. The corner wall unit is built to the X-leg's
 *  width, so the two share one floor. A wall-B piece has none: what stands in front of it moves its
 *  near edge instead (`nearEdgeMm`). */
function blindSpanMm(
  piece: CornerAssemblyPiece,
  cabinetDepthMm: number,
): number {
  return ownsTheCorner(piece) ? baseCarcassFrontMm(cabinetDepthMm) : 0;
}

/** The owner's rule that a corner cabinet has at least one door on all three levels: a one-door
 *  cabinet opens at the hinged rows' own declared floor, read off those rows rather than typed and
 *  refused rather than defaulted when a row stops declaring one. The wall and top bands read the same
 *  row because `wall-cabinet` is the one height-flexible family, so they share a floor by
 *  construction. */
const ONE_DOOR_CABINET_ROW_BY_BAND: Readonly<Record<CornerBand, string>> = {
  base: "base-cabinet",
  wall: "wall-cabinet",
  top: "wall-cabinet",
};

/** Resolved once at module load: a width floor follows neither the depth nor the room, and a row that
 *  stops declaring one refuses the module rather than every call. */
const ONE_DOOR_CABINET_FLOOR_MM_BY_BAND: Readonly<Record<CornerBand, number>> =
  {
    base: declaredWidthFloorMm(ONE_DOOR_CABINET_ROW_BY_BAND.base),
    wall: declaredWidthFloorMm(ONE_DOOR_CABINET_ROW_BY_BAND.wall),
    top: declaredWidthFloorMm(ONE_DOOR_CABINET_ROW_BY_BAND.top),
  };

function oneDoorCabinetFloorMm(band: CornerBand): number {
  return ONE_DOOR_CABINET_FLOOR_MM_BY_BAND[band];
}

function declaredWidthFloorMm(buildId: string): number {
  const floorMm = INSERTABLE_BODY_DEFINITIONS.find(
    ([id]) => id === buildId,
  )?.[1].minWidthMm;
  if (floorMm === undefined) {
    throw new Error(
      `corner-assembly-size: ${buildId} declares no width floor, so no corner piece can be floored at a cabinet with one door`,
    );
  }
  return floorMm;
}
