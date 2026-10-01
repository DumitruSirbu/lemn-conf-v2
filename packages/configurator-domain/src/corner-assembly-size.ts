// **How wide the corner assembly is built** — wave 7D6's J1′ as its 2026-09-17 adjudication rules
// it: a function of the cabinet depth, the two wall directions and the room, and of nothing else.
//
// **The sibling of `along-wall-chain-shift.ts`, and that distinction is the whole of this module.**
// That file answers where a corner *slides* to when a stored design's depth setting changes (ADR
// 0089); this one answers how *wide* a corner is when the generator builds one (ADR 0120 Amendment
// A: every cabinet is custom made, corners included, and the algorithm is the actor). A design
// authored at 600 mm and taken to 700 **slides and does not resize**, which is why the 30 mm ADR
// 0089 records in wall B's top row at 700 is not this module's to remove.
//
// **Three entry points, each named for its own quantifier** (adjudication D1, D2), because "the
// corner's reach" is two different questions and answering both with one function is how the shell
// silently acquires the policy's number. The second answers in two halves — an edge and a centre —
// which share that one quantifier and differ by half a width:
//
// 1. `cornerAssemblyWidthsMm` — the four along-wall widths at one (depth, room). **The room enters
//    as a ceiling and never as a target** (ADR 0120 Amendment A): a corner is built to the
//    reference kitchen's own size unless the wall cannot hold it, and never wider.
// 2. `cornerFarEdgeMm` — where one piece stops along its wall — and `cornerAlongWallCentreMm`, the
//    coordinate a placement carries. Both are arithmetic over (1), band-aware, and read no policy
//    and no catalogue row; the room they answer in is the one (1) was derived for, carried so a
//    refusal can name it and never computed from. **The centre is where the millimetre grid binds**:
//    a piece is placed on its centre, so an odd width would put that centre on a half millimetre,
//    which `docs/best-practices/product-invariants.md` rejects rather than rounds.
// 3. `narrowestCornerReachMm` — the least length a wall may have and still hold a corner at all,
//    which is the **narrowest** corner the product builds, at whichever declared depth reaches
//    farthest. **It takes no room**: under J1′ the corner shrinks to fit, so the binding case is
//    room-independent and the quantifier over rooms disappears rather than being resolved. That is
//    what makes `ENGINE_ROOM_LIMITS`' reader well-defined instead of a fixed point over the bound
//    it is itself computing.
//
// (2) and (3) answer in **distinct named types**, so a caller cannot take the other's number: wall
// B's bound and wall B's run origin are different figures and always have been. **Nothing here
// imports from `room/`** — a cycle would bind a bound to `undefined` at module load and compare
// every value against it silently, the failure `room/room-policy.ts`'s own head comment names.
import { cornerTakingWallsOf } from "./along-wall-chain-shift.js";
import {
  baseSeatDepthMm,
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

/** The four shipped corner bodies, as the questions this module answers them by. **Wall A carries
 *  the blind X-leg in the base row alone** — nothing structural stands above it, which is why wall
 *  A's wall row starts at the corner itself and its wall-only run stands over the corner's base
 *  (ADR 0110 Amendment B2).
 *
 *  **No piece is added or removed here** (7D6's J2): the assembly is the four bodies the catalogue
 *  already seeds, and none of them becomes insertable. */
export const CORNER_ASSEMBLY_PIECES: readonly CornerAssemblyPiece[] = [
  { wall: "A", band: "base" },
  { wall: "B", band: "base" },
  { wall: "B", band: "wall" },
  { wall: "B", band: "top" },
];

/** One corner piece with the width it is built at. */
export interface SizedCornerPiece extends CornerAssemblyPiece {
  readonly widthMm: number;
}

/** The whole assembly's along-wall widths at one (depth, room). Carries the depth it was derived at
 *  so `cornerFarEdgeMm` cannot be handed widths from one depth and asked for a far edge at another
 *  — the same reason `setCabinetDepth` takes a catalogue *factory* rather than a catalogue. */
export interface CornerAssemblyWidthsMm {
  readonly cabinetDepthMm: number;
  /** The room these widths were derived in, for the same reason the depth is carried: a refusal
   *  downstream names the room that produced the number rather than leaving a reader to find it. */
  readonly room: DesignRoom;
  readonly pieces: readonly SizedCornerPiece[];
}

export interface CornerAssemblyQuery {
  readonly cabinetDepthMm: number;
  /** The room the corner is being built for. A **ceiling** on each width and never a target. */
  readonly room: DesignRoom;
}

export interface CornerFarEdgeQuery {
  readonly widths: CornerAssemblyWidthsMm;
  readonly cabinetDepthMm: number;
  readonly wall: DesignWall;
  readonly band: CornerBand;
}

/** Where the corner assembly stops along one wall in one row. **A far edge, not a wall minimum**
 *  (adjudication D2): the two are different questions, and a distinct type is what stops a caller
 *  answering one with the other. */
export interface CornerFarEdge {
  readonly wall: DesignWall;
  readonly band: CornerBand;
  readonly farEdgeMm: number;
}

/** Where one piece's centre sits along its wall. **A centre, not a far edge**: the two differ by
 *  half a width, and a distinct type is what stops a caller placing a piece on the wrong one. */
export interface CornerAlongWallCentre {
  readonly wall: DesignWall;
  readonly band: CornerBand;
  readonly alongMm: number;
}

/** The least length a wall may have and still hold a corner at all. **A wall minimum, not a far
 *  edge**, and no room took part in deriving it. */
export interface NarrowestCornerReach {
  readonly wall: DesignWall;
  readonly wallMinimumMm: number;
}

/** The four along-wall widths for one cabinet depth in one room (entry point 1, J1′). */
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
 *  piece's own floor — ADR 0120 Amendment A's ceiling and the persisted centre's millimetre grid.
 *
 *  **The room can only take width away.** A wall longer than the reference room's buys nothing: the
 *  reference corner is the one the owner approved, and a wider corner is not a better one. Stated
 *  as a `min` rather than as a target so no room can widen a piece past the one-door threshold the
 *  three fronted pieces sit below. */
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

/** Where one piece stops along its wall (entry point 2). Pure arithmetic: the piece's own near edge
 *  at this depth plus the width it was sized to. */
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

/** Where one piece is centred along its wall — the coordinate a `DesignPlacement` carries, so this
 *  is the last arithmetic before a derived width becomes a persisted number.
 *
 *  **A half-millimetre centre is refused, never rounded** (`docs/best-practices/product-invariants.md`):
 *  the persisted `Design` holds integer millimetres, and rounding one here would move the piece off
 *  the wall end its own width was derived from. Width derivation now keeps every width even; this
 *  refusal still catches an invalid width supplied through another path. */
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

/** The wall minimum (entry point 3): the farthest the **narrowest** corner this product builds
 *  reaches along `wall`, maximised over every declared cabinet depth and **taking no room at all**.
 *
 *  This is what `ENGINE_ROOM_LIMITS` reads. A maximum over *rooms* would be attained in the largest
 *  one, pinning the bound to the reference corner for ever and blinding the guard written to catch
 *  a shrink (adjudication D1). */
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

// =================================================================================================
// M7B U2 S1 — the right corner (ADR 0132 decision 2). A U's second corner, at A∩C, is the left
// corner's own rule run again: entry points 1 and 2 above, called with wall C's run standing in for
// wall B's — "the along values the corner rule gives for the L room (W, C)", ADR 0132's own phrase
// — and their output relabelled from wall B to wall C. The X-leg (wall A) is the one piece both
// corners share a wall with, so it is not relabelled; it is reflected about the room's own width
// instead, `W − centreMm`, which is what a piece already computed for wall B's frame becomes once
// its wall is wall C's instead (ADR 0132 decision 1: wall C's world frame is wall B's own mirrored
// about `x = W`, never about the room's centre line).
//
// **No reflection primitive is added to the domain.** This is ordinary arithmetic on an already-
// domain-canonical number (`W − centreMm`), the same shape `originOnWall`'s wall-C arm and
// `deriveCabinetWorldTransform`'s wall-C frame already use (`room-transforms.ts`, `void-engine.ts`,
// M7B U1 slice S3) — not a `Group`-level reflection, which ADR 0129 D1/D5 keeps out of the domain
// entirely.
// =================================================================================================

export { cornerOf, type Corner } from "./corner-of.js";

/** The right corner's four along-wall widths, in the room's own real coordinates (D5). Sized by
 *  entry point 1's own rule, run against wall C's run instead of wall B's, with wall B's pieces
 *  relabelled to wall C afterward.
 *
 *  **The X-leg sizes identically to the left corner's own**, and this is not asserted separately —
 *  it falls out of entry point 1 unchanged: `widthInRoomMm` for the wall-A piece reads
 *  `wallLengthMm("A", room)` and `cabinetDepthMm` alone, neither of which differs between the two
 *  corners, so the same arithmetic on the same inputs gives the same width (D5's "wall A carries
 *  both X-legs" needs no second formula, only two calls). */
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

/** ADR 0132 decision 2's own phrase: "the along values the corner rule gives for the L room
 *  (W, C)". An L-shaped room standing in for the real U, its depth wall C's own run — the one place
 *  a U's `wallCMm` enters the corner rule; everything after this is entry point 1's unchanged
 *  arithmetic, read for a room that happens to be synthetic.
 *
 *  **Exported since review round 1 (C1.1)**: `generation/shell-design.ts`'s wall-C tiling reuse
 *  built an identical three-line copy of this synthesis (`roomMirroredForWallC`) rather than import
 *  a function this module kept private. One export and one caller now share the one derivation, the
 *  same way `cornerOf` is the one place a placement's corner is ever read. */
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

/** The inverse relabelling, so a right corner's own widths (wall A and wall C) can be handed to
 *  entry point 2's unchanged functions, which read a wall-B piece for anything that is not wall A
 *  (`ownsTheCorner`, `nearEdgeMm`). Never exported: a caller outside this module has no reason to
 *  hold a corner's widths under the wrong corner's wall letters even momentarily. */
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

/** Where one right-corner piece is centred along its wall (D4). The three returns (wall C) stand at
 *  the along values entry point 2 gives the left corner's own wall-B piece in the room
 *  `roomForTheRightCorner` built — unreflected, because wall C's own along runs the same direction
 *  wall B's does (ADR 0132 decision 1), so nothing here mirrors it a second time. The X-leg (wall A)
 *  is the left X-leg's centre reflected about the room's own width, `W − centreMm` (ADR 0132
 *  decision 2) — algebraically exact on whole millimetres, because both `W` and the left centre
 *  already are (D4's odd-millimetre finding, ADR 0132 decision 4): there is no second refusal to
 *  raise here that entry point 2 has not already raised on the left corner's own numbers. */
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
 *  overlapping (ADR 0132 decision 4) — the sum of each X-leg's own reference width, and deliberately
 *  **not** twice `narrowestCornerReachMm("A")`'s 880: U0 measured the two X-legs overlapping only
 *  below 1800 mm, which is `2 × REFERENCE_CORNER_REACH_MM`, because each X-leg's own ceiling is the
 *  whole of wall A (`widthInRoomMm`) and both reach the reference 900 mm whenever their own side of
 *  wall A is at least that long. This is `ENGINE_ROOM_LIMITS.U.wallA.minMm`'s derivation source; the
 *  literal itself is U2 slice S2's to declare. */
export function twoCornersWallAMinimumMm(): number {
  return REFERENCE_CORNER_REACH_MM * 2;
}

/** The reference kitchen's own corner: **900 mm along each wall at the declared 600 mm depth**, and
 *  the one measurement in this module. It is the corner ADR 0108 Amendment B's owner-approved wall-A
 *  minimum was taken from and the figure 7D6 criterion 1 pins.
 *
 *  The three other pieces' reference widths are **derived from it** — 320 mm for the base return and
 *  570 for the two upper ones — rather than restated as three more literals, which is the second
 *  authority ADR 0102 forbids: four numbers that agree at one depth always eventually part. */
const REFERENCE_CORNER_REACH_MM = 900;

/** How wide this piece is built where the room does not constrain it: the reference reach less
 *  whatever stands in front of it at the reference kitchen's own depth. */
function referenceWidthMm(piece: CornerAssemblyPiece): number {
  return REFERENCE_CORNER_REACH_MM - nearEdgeMm(piece, WORKTOP_DEPTH_MM);
}

/** Where a piece starts along its own wall: past whatever the **other** wall's run puts in front of
 *  the corner in that row.
 *
 *  Wall A owns the corner and starts at 0 (`cornerTakingWallsOf` names the asymmetry: wall A is
 *  never in the set a corner is taken from, on any shape). Wall B starts past wall A's own body in
 *  the same row — the base run's X-leg front plane in the
 *  base row (ADR 0025's `d − 20`, so 580 at 600 mm and 680 at 700) and §7's head-clearance depth in
 *  the wall and top rows (330 and 400). **The two rows therefore part by 250 mm at 600 and 280 at
 *  700 rather than by a constant**, which is the arithmetic ADR 0089's two chains express and the
 *  reason no depth-independent width pair makes the rows agree at both depths. */
function nearEdgeMm(
  piece: CornerAssemblyPiece,
  cabinetDepthMm: number,
): number {
  if (ownsTheCorner(piece)) return 0;
  return standsInTheBaseRow(piece)
    ? baseSeatDepthMm(cabinetDepthMm)
    : wallCarcassDepthMm(cabinetDepthMm);
}

/** Wall A's pieces start at the corner itself, so nothing of the other wall stands in front of them
 *  and nothing of the other wall moves them.
 *
 *  **`cornerTakingWallsOf("U")` rather than a bare wall-B comparison** (R1.3): every call this
 *  module makes stands inside a synthetic two-wall room (`roomForTheRightCorner`'s own "L room (W,
 *  C)"), so `piece.wall` is always `"A"` or `"B"` here today and the wider set answers exactly as
 *  the old bare comparison did. It is the set a **direct** wall-C piece would need — a caller
 *  outside this module's own relabelling, most likely U3's composer — and reading it from one
 *  answer rather than the bare constant is what keeps that future call from reporting a wall-C
 *  piece as owning the corner the way wall A does. */
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

/** How much of a piece's own width the other wall's body stands in front of.
 *
 *  **Only the blind X-leg has any.** The return leg butts against the X-leg's front face, so the
 *  X-leg is a cabinet only past `d − 20`: today's 900 decomposes as 580 of the other wall's depth
 *  plus a 320 mm accessible front (7D7's derivation, and the 280 mm door the builder puts in it).
 *  A wall-B piece has none — what stands in front of it moves its **near edge** instead, which is
 *  `nearEdgeMm` above, and wall A carries no piece in the rows where that would differ. */
function blindSpanMm(
  piece: CornerAssemblyPiece,
  cabinetDepthMm: number,
): number {
  return ownsTheCorner(piece) ? baseSeatDepthMm(cabinetDepthMm) : 0;
}

/** The owner's rule of 2026-09-16 — *"corner cabinet should have at least one door so calculate to
 *  fit a cabinet with one door on all 3 levels"* — as the number this product already holds: a
 *  one-door cabinet opens at the hinged rows' own declared floor.
 *
 *  Read off those rows rather than typed (7D7's L-R7), and refused rather than defaulted when a row
 *  stops declaring one. The wall and top rows read the same row on purpose: `wall-cabinet` is the
 *  one height-flexible family, built 700 mm tall on the wall row and 400 on the top one, so the two
 *  bands share a floor by construction instead of by two declarations agreeing. */
const ONE_DOOR_CABINET_ROW_BY_BAND: Readonly<Record<CornerBand, string>> = {
  base: "base-cabinet",
  wall: "wall-cabinet",
  top: "wall-cabinet",
};

/** Resolved once, at module load: a width floor is a declared product number and follows neither
 *  the depth nor the room, and a row that stops declaring one refuses the module rather than every
 *  call. */
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
