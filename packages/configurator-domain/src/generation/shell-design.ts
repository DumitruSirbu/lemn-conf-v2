// The design generation starts from (ADR 0110 decision 1, Amendment B): the entered room, the
// reference kitchen's settings and depth, the structural corner pieces that fit under the ceiling, and
// every free run of each wall recorded as empty space. Authored for its room, never derived by
// removing from the reference kitchen, which would carry its column boundaries and depth sources into
// rooms where none stood (Amendment B1). Each run is cut by `splitEmptySpanAtCap` at composition's width
// limit (`COMPOSITION_WIDTH_LIMIT_MM`) with its depth read off a neutral declared source
// (`occupiedDepthOfEntryM`; ADR 0073, 0102). Nothing is clipped: `clipEmptyColumnsAtWallEnd` is a
// published-face pass (ADR 0090 Amendment B4).
//
// Wall B's runs end short of the wall by the corner's chain shift to the deepest declared depth
// (Amendment B3), so a proposal still fits after the customer changes the depth. Wall A's floor run
// reaches the wall's end (ADR 0045 Amendment A). An odd span gives up its last millimetre, since a
// document holds whole-millimetre centres. No probe, no price book and no body but the corner's:
// composition places every other body through `insertBody` (ADR 0110 decision 2).
import {
  alongWallShiftMm,
  cornerTakingWallsOf,
} from "../along-wall-chain-shift.js";
import { cabinetDepthRuleOf } from "../cabinet-depth-rule.js";
import { isValidOccurredAt } from "../commands/command-result.js";
import {
  CORNER_ASSEMBLY_PIECES,
  cornerAlongWallCentreMm,
  cornerAssemblyWidthsMm,
  cornerFarEdgeMm,
  rightCornerAlongWallCentreMm,
  rightCornerAssemblyWidthsMm,
  roomForTheRightCorner,
  type CornerAssemblyWidthsMm,
  type CornerBand,
  type SizedCornerPiece,
} from "../corner-assembly-size.js";
import {
  cabinetDepthMmOf,
  DesignRoomSchema,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type DesignWall,
  type EmptyColumn,
} from "../design.js";
import {
  buildKitchenLBodyCatalog,
  CORNER_WALL_UNIT_TEMPLATES,
  KITCHEN_L_DESIGN,
} from "../fixtures/kitchen-l-design.js";
import { toExactMillimetres, toMetres } from "../millimetres.js";
import { LEVELS } from "../module-grid.js";
import { occupiedDepthOfEntryM } from "../occupied-depth.js";
import { wallLengthMm } from "../queries/overflowing-placements.js";
import { ENGINE_ROOM_LIMITS } from "../room/room-policy.js";
import { validateRoomInput } from "../room/validate-room.js";
import { splitEmptySpanAtCap } from "../split-empty-span.js";
import {
  deriveRecordedColumns,
  derivePlacementRecords,
  projectFrozenMap,
  withFrozenMap,
  type BodyDefinition,
  type PlannedBoundariesMm,
} from "../void-engine.js";
import { declaredCabinetDepthsMm } from "../worktop-depth.js";
import { COMPOSITION_WIDTH_LIMIT_MM } from "./leftover-rule.js";
import { isBackWallBaseOnly } from "./run-layout.js";

export interface LinearShellDesignInput {
  /** A room `validateRoomInput` accepted for the straight policy; the shell passes it through
   *  untouched. */
  readonly room: DesignRoom;
  readonly occurredAt: string;
  /** Composition's private row plan for wall A, the straight room's only wall. Omit it to retain the
   *  un-composed 800-first shell exactly, as `LShellDesignInput.compositionPlan` does. */
  readonly compositionPlan?: LinearShellCompositionPlan;
}

export interface LinearShellCompositionPlan {
  readonly floorWidthsMm: readonly number[];
  readonly plannedBoundariesMm?: PlannedBoundariesMm;
}

export type LinearShellInputRefusal =
  | "ROOM_NOT_A_DESIGN_ROOM"
  | "ROOM_NOT_LINEAR"
  | "ROOM_OUTSIDE_ENGINE_LIMITS"
  | "INVALID_OCCURRED_AT";

/** The builder sits behind the room validator, so a bad input here is a programming error. */
export class LinearShellInputError extends Error {
  constructor(readonly refusal: LinearShellInputRefusal) {
    super(`buildLinearShellDesign refused its input: ${refusal}`);
    this.name = "LinearShellInputError";
  }
}

/** The shell for a straight `input.room` (ADR 0130 decision 4): no structural placement, and wall A's one
 *  free run recorded the same way an L's runs are. The tiling primitives are shared with the L. */
export function buildLinearShellDesign(input: LinearShellDesignInput): Design {
  refuseUnbuildableLinearInput(input);
  const shell: Design = {
    room: input.room,
    presetId: null,
    settings: { ...REFERENCE_KITCHEN.settings },
    placements: [],
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };
  const tiles = linearFreeRunTiles(input.room, input.compositionPlan);
  return canonicalised(
    withFrozenMap(shell, { emptyColumns: tiles }),
    input.compositionPlan?.plannedBoundariesMm,
  );
}

function refuseUnbuildableLinearInput(input: LinearShellDesignInput): void {
  if (!DesignRoomSchema.safeParse(input.room).success) {
    throw new LinearShellInputError("ROOM_NOT_A_DESIGN_ROOM");
  }
  if (input.room.shape !== "linear") {
    throw new LinearShellInputError("ROOM_NOT_LINEAR");
  }
  if (!isInsideTheEngineLimitsLinear(input.room)) {
    throw new LinearShellInputError("ROOM_OUTSIDE_ENGINE_LIMITS");
  }
  if (!isValidOccurredAt(input.occurredAt)) {
    throw new LinearShellInputError("INVALID_OCCURRED_AT");
  }
}

/** The engine's own linear limits, never the approved policy. Composition never reads `room.depthMm`
 *  (ADR 0130 decisions 1, 2). */
function isInsideTheEngineLimitsLinear(room: DesignRoom): boolean {
  return validateRoomInput(
    { shape: "linear", wallAMm: room.widthMm, heightMm: room.heightMm },
    ENGINE_ROOM_LIMITS,
  ).ok;
}

/** Wall A's free run: `[0, W]` less the odd millimetre, with no corner reach and no depth-change
 *  reserve because wall A never slides.
 *
 *  One run, not two: the L's wall-only run covers only the strip above the corner's own base piece,
 *  and a straight room has no structural piece, so that strip is always empty. */
function linearFreeRunTiles(
  room: DesignRoom,
  compositionPlan: LinearShellCompositionPlan | undefined,
): EmptyColumn[] {
  const runs = tileRunsOn("A", room);
  const span = linearFloorRunSpan(room);
  return compositionPlan === undefined
    ? tilesOver(runs.floor, span)
    : plannedFloorTiles(runs.floor, span, compositionPlan.floorWidthsMm);
}

/** Wall A's one run, exported for the composer like `lShellFloorRuns`, so the plan's declared widths
 *  and the shell's tiles are cut from the identical span. */
export function linearShellFloorRuns(room: DesignRoom): Readonly<{
  readonly wall: "A";
  readonly startMm: number;
  readonly endMm: number;
}> {
  return { wall: "A", ...linearFloorRunSpan(room) };
}

function linearFloorRunSpan(room: DesignRoom): AlongWallSpan {
  const physicalSpan = { startMm: 0, endMm: wallLengthMm("A", room) };
  return {
    ...physicalSpan,
    endMm: wholeMillimetreReachableEndMm(physicalSpan),
  };
}

export interface LShellDesignInput {
  /** A room `validateRoomInput` accepted; the shell passes it through untouched. */
  readonly room: DesignRoom;
  readonly occurredAt: string;
  /** Composition's private row plan (ADR 0110 Amendment D, revised). Omit it to retain the 800-first
   *  shell exactly. Widths are ordered from the corner toward each wall's free end. */
  readonly compositionPlan?: LShellCompositionPlan;
}

// `DesignWall` includes "C" (ADR 0132), but this builder refuses every shape but L, so its tiling
// stays keyed on the two walls it tiles. Wall C's shell is the U builder's (ADR 0132 D12).
type LWall = Extract<DesignWall, "A" | "B">;
const L_SHELL_WALLS: readonly LWall[] = ["A", "B"];

export interface LShellCompositionPlan {
  readonly floorWidthsMm: Readonly<Record<LWall, readonly number[]>>;
  readonly plannedBoundariesMm?: PlannedBoundariesMm;
}

/** Why the builder refused its input — a code, never a sentence (ADR 0095 decision 3). */
export type LShellInputRefusal =
  | "ROOM_NOT_A_DESIGN_ROOM"
  | "ROOM_NOT_L"
  | "ROOM_OUTSIDE_ENGINE_LIMITS"
  | "INVALID_OCCURRED_AT";

/** The builder sits behind the room validator, so a bad input here is a programming error. */
export class LShellInputError extends Error {
  constructor(readonly refusal: LShellInputRefusal) {
    super(`buildLShellDesign refused its input: ${refusal}`);
    this.name = "LShellInputError";
  }
}

/** The reference kitchen the shell's corner, settings and cabinet depth are taken from: derived,
 *  never copied (ADR 0109 decision 2). */
const REFERENCE_KITCHEN = KITCHEN_L_DESIGN;
const SHELL_CABINET_DEPTH_MM = cabinetDepthMmOf(REFERENCE_KITCHEN);
const SHELL_CATALOG = buildKitchenLBodyCatalog(SHELL_CABINET_DEPTH_MM);

/** The neutral sources a tile's depth is read off: the bodies composition fills a floor run and a
 *  wall-only run with (Amendment B2), never a body the reference happened to stand there. */
const FLOOR_TILE_SOURCE = "base-cabinet";
const WALL_ONLY_TILE_SOURCE = "wall-cabinet";

/** The input `validateRoomInput` requires and never reads (ADR 0108 decision 5); the shell is the
 *  canonical left-corner L, and a mirrored one is presentation (ADR 0109 Amendment A2). */
const CORNER_DIRECTION_VALIDATION_NEVER_READS = "left";

/** The whole structural assembly, including pieces a low ceiling excludes: an excluded piece still
 *  reserves its footprint, so `p21`'s zone stays unrecorded. */
const STRUCTURAL_ASSEMBLY = REFERENCE_KITCHEN.placements.filter(isStructural);

/** The assembly a room's corners are cut from: the reference's structural pieces and, over wall A's
 *  base X-leg, the shell's corner wall unit template, except on a base-only back wall (a large U),
 *  which keeps its wall-A strips tiled. The reference kitchen keeps the supplier's corner. */
function assemblyFor(room: DesignRoom): readonly DesignPlacement[] {
  return isBackWallBaseOnly(room)
    ? STRUCTURAL_ASSEMBLY
    : [...STRUCTURAL_ASSEMBLY, ...CORNER_WALL_UNIT_TEMPLATES];
}

/** Where the wall row starts (`LEVELS[1]`), which is the floor of a wall-only run. */
const WALL_ROW_FLOOR_MM = wholeMillimetresOf(
  LEVELS[1]?.[0],
  "LEVELS' wall-row floor",
);

/** The corner's three rows, in §2's own order, and each row's floor read off `LEVELS`. */
const CORNER_BANDS: readonly CornerBand[] = ["base", "wall", "top"];
const CORNER_BAND_FLOORS_MM: Readonly<Record<CornerBand, number>> = {
  base: wholeMillimetresOf(LEVELS[0]?.[0], "LEVELS' base-row floor"),
  wall: WALL_ROW_FLOOR_MM,
  top: wholeMillimetresOf(LEVELS[2]?.[0], "LEVELS' top-row floor"),
};

/** Which rows a wall-only run has to start past: those standing at or above its own floor. Filtered
 *  from the grid so a row that moves takes this filter with it.
 *
 *  Exported to be pinned, not used: the wall and top pieces share a catalogue row and near-edge
 *  branch, so their far edges are equal and a `>` here would move no origin; the membership is
 *  asserted directly. */
export const BANDS_ABOVE_THE_WALL_ROW_FLOOR: readonly CornerBand[] =
  CORNER_BANDS.filter(
    (band) => CORNER_BAND_FLOORS_MM[band] >= WALL_ROW_FLOOR_MM,
  );

/** §2's last module line: no body stands above it, so no recorded space reaches past it. */
const MODULE_GRID_TOP_MM = wholeMillimetresOf(
  Math.max(...LEVELS.map(([, topM]) => topM)),
  "LEVELS' top",
);

/** The shell for `input.room`: the corner that fits under its ceiling and every free run recorded,
 *  canonicalised as a load followed by a save would write it. */
export function buildLShellDesign(input: LShellDesignInput): Design {
  refuseUnbuildableInput(input);
  const corner: Design = {
    room: input.room,
    presetId: null,
    settings: { ...REFERENCE_KITCHEN.settings },
    placements: cornerPiecesUnder(input.room),
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };
  const tiles = L_SHELL_WALLS.flatMap((wall) =>
    freeRunTiles(wall, input.room, input.compositionPlan),
  );
  return canonicalised(
    withFrozenMap(corner, { emptyColumns: tiles }),
    input.compositionPlan?.plannedBoundariesMm,
  );
}

/** The room is passed through untouched, so it must already be exactly what a stored design may say:
 *  one carrying any other key would yield a document `DesignSchema` refuses. Refused rather than
 *  copied, because building a room here is what the room-writer guard (`demo-room-envelope.test.ts`)
 *  forbids all but two modules.
 *
 *  Order: the document's shape, the room's, what the engine can build (a wall shorter than its corner
 *  is storable and unbuildable), then the moment. */
function refuseUnbuildableInput(input: LShellDesignInput): void {
  if (!DesignRoomSchema.safeParse(input.room).success) {
    throw new LShellInputError("ROOM_NOT_A_DESIGN_ROOM");
  }
  if (input.room.shape !== "L") throw new LShellInputError("ROOM_NOT_L");
  if (!isInsideTheEngineLimits(input.room)) {
    throw new LShellInputError("ROOM_OUTSIDE_ENGINE_LIMITS");
  }
  if (!isValidOccurredAt(input.occurredAt)) {
    throw new LShellInputError("INVALID_OCCURRED_AT");
  }
}

/** The engine's own limits (ADR 0108 decision 6), never the approved policy: which rooms a customer
 *  may enter is the caller's policy. The corner direction is carried and never read by validation
 *  (ADR 0108 decision 5). */
function isInsideTheEngineLimits(room: DesignRoom): boolean {
  return validateRoomInput(
    {
      shape: "L",
      wallAMm: room.widthMm,
      wallBMm: room.depthMm,
      heightMm: room.heightMm,
      cornerDirection: CORNER_DIRECTION_VALIDATION_NEVER_READS,
    },
    ENGINE_ROOM_LIMITS,
  ).ok;
}

/** The structural placements the room's ceiling admits (ADR 0110 decision 1): a piece whose top is
 *  above the ceiling is excluded by selection, never removed by a command, which refuses a structural
 *  body as `NOT_DELETABLE`. */
function piecesUnderTheCeiling(room: DesignRoom): DesignPlacement[] {
  return assemblyFor(room).filter(
    (placement) => placement.y0Mm + placement.body.heightMm <= room.heightMm,
  );
}

/** The left corner's structural placements, each sized and centred from the corner assembly. */
function cornerPiecesUnder(room: DesignRoom): DesignPlacement[] {
  const widths = cornerAssemblyWidthsMm({
    cabinetDepthMm: SHELL_CABINET_DEPTH_MM,
    room,
  });
  return piecesUnderTheCeiling(room).map((placement) => {
    const piece = CORNER_ASSEMBLY_PIECES.find(
      ({ wall, band }) =>
        wall === placement.wall &&
        CORNER_BAND_FLOORS_MM[band] === placement.y0Mm,
    );
    if (piece === undefined) {
      throw new Error(`buildLShellDesign: no corner piece for ${placement.id}`);
    }
    const sized = widths.pieces.find(
      ({ wall, band }) => wall === piece.wall && band === piece.band,
    );
    if (sized === undefined) {
      throw new Error(`buildLShellDesign: no width for ${placement.id}`);
    }
    const centre = cornerAlongWallCentreMm({
      widths,
      cabinetDepthMm: SHELL_CABINET_DEPTH_MM,
      wall: piece.wall,
      band: piece.band,
    });
    return {
      ...placement,
      alongMm: centre.alongMm,
      body: { ...placement.body, widthMm: sized.widthMm },
    };
  });
}

/** One wall's free runs: the floor run from the corner's far edge to the planned end, and — where
 *  nothing structural stands above the corner's base — the wall-only run over it. That is wall A on a
 *  base-only back wall (a large U) alone: elsewhere the corner wall unit stands there. */
function freeRunTiles(
  wall: LWall,
  room: DesignRoom,
  compositionPlan: LShellCompositionPlan | undefined,
): EmptyColumn[] {
  const runs = tileRunsOn(wall, room);
  const floorSpan = floorRunSpan(wall, room);
  const wallOnlyStartMm = wallRowStartMm(wall, room);
  return [
    // The reserve may leave this upper span ending before its corner origin. Record zero length
    // there, as for a spent floor run; neither span offers capacity in that case.
    ...tilesOver(runs.wallOnly, {
      startMm: wallOnlyStartMm,
      endMm: Math.max(
        wallOnlyStartMm,
        Math.min(floorSpan.startMm, plannedEndMm(runs.wallOnly, room)),
      ),
    }),
    ...(compositionPlan === undefined
      ? tilesOver(runs.floor, floorSpan)
      : plannedFloorTiles(
          runs.floor,
          floorSpan,
          compositionPlan.floorWidthsMm[wall],
        )),
  ];
}

/** One tile per composed body, then the ordinary 800-capped leftover. `deriveColumns` may merge a
 *  final 600 mm fit-body tile with a remainder of at most 200 mm; generation is the sole caller
 *  allowed to step that body back to its planned width (ADR 0110 revised D4). */
function plannedFloorTiles(
  run: TileRun,
  span: AlongWallSpan,
  widthsMm: readonly number[],
): EmptyColumn[] {
  if (widthsMm.some((widthMm) => !Number.isInteger(widthMm) || widthMm <= 0)) {
    throw new Error(
      "buildLShellDesign: planned widths must be positive whole millimetres",
    );
  }
  const plannedWidthMm = widthsMm.reduce((sum, widthMm) => sum + widthMm, 0);
  if (plannedWidthMm > span.endMm - span.startMm) {
    throw new Error(
      "buildLShellDesign: composition plan exceeds its floor run",
    );
  }

  let cursorMm = span.startMm;
  const planned = widthsMm.map((widthMm) => {
    const tile = tileOver(run, cursorMm, cursorMm + widthMm);
    cursorMm += widthMm;
    return tile;
  });
  return [
    ...planned,
    ...tilesOver(run, { startMm: cursorMm, endMm: span.endMm }),
  ];
}

/** A wall's two kinds of run, up to the same ceiling: full-height on the floor, and from the wall row
 *  up where it stands over the corner's base (Amendment B2). */
function tileRunsOn(
  wall: DesignWall,
  room: DesignRoom,
): { readonly floor: TileRun; readonly wallOnly: TileRun } {
  const topMm = Math.min(room.heightMm, MODULE_GRID_TOP_MM);
  return {
    floor: { wall, y0Mm: 0, topMm, source: FLOOR_TILE_SOURCE },
    wallOnly: {
      wall,
      y0Mm: WALL_ROW_FLOOR_MM,
      topMm,
      source: WALL_ONLY_TILE_SOURCE,
    },
  };
}

/** A floor run starts past every structural piece on its wall, whatever row the piece stands in. */
function floorRunStartMm(wall: DesignWall, room: DesignRoom): number {
  return cornerReachMm({ wall, room }, CORNER_BANDS);
}

/** The wall and top rows start past the structural pieces that reach above the wall row's floor on
 *  that wall: past the corner wall unit on wall A, and at the corner itself on a base-only back wall,
 *  where no unit stands and the run over the corner's base is tiled. */
function wallRowStartMm(wall: DesignWall, room: DesignRoom): number {
  // Reverting this start reddens corner-wall-unit.test.ts's approved L 900 × 1000, odd-width U and
  // stored-design tests (by mutation); an ordinary room is unchanged by it.
  const bands =
    wall === "A" && isBackWallBaseOnly(room)
      ? NO_BANDS
      : BANDS_ABOVE_THE_WALL_ROW_FLOOR;
  return cornerReachMm({ wall, room }, bands);
}

const NO_BANDS: readonly CornerBand[] = [];

/** How far the corner assembly reaches along one wall in the given rows, sized for this room and the
 *  shell's own depth (`corner-assembly-size.ts`).
 *
 *  `Math.max(0, …)` over an empty set of bands answers for wall A above the base row on a base-only
 *  back wall: no wall-A piece stands there, so the wall row starts at the corner and its run stands
 *  over the corner's base (ADR 0110 Amendment B2). Elsewhere the corner wall unit stands over the
 *  corner base, so no wall-A wall-only run is recorded over the corner. */
function cornerReachMm(
  on: { readonly wall: DesignWall; readonly room: DesignRoom },
  bands: readonly CornerBand[],
): number {
  const widths = cornerAssemblyWidthsMm({
    cabinetDepthMm: SHELL_CABINET_DEPTH_MM,
    room: on.room,
  });
  const farEdgesMm = CORNER_ASSEMBLY_PIECES.filter(
    (piece) => piece.wall === on.wall && bands.includes(piece.band),
  ).map(
    (piece) =>
      cornerFarEdgeMm({
        widths,
        cabinetDepthMm: SHELL_CABINET_DEPTH_MM,
        wall: piece.wall,
        band: piece.band,
      }).farEdgeMm,
  );
  return Math.max(0, ...farEdgesMm);
}

/** What every tile of one run shares: its wall, its vertical extent and its declared source. */
interface TileRun {
  readonly wall: DesignWall;
  readonly y0Mm: number;
  readonly topMm: number;
  readonly source: string;
}

interface AlongWallSpan {
  readonly startMm: number;
  readonly endMm: number;
}

/** Where a run's tiles must stop: the wall's own end, less the reserve the run's source slides by
 *  at the deepest declared depth. */
function plannedEndMm(run: TileRun, room: DesignRoom): number {
  return wallLengthMm(run.wall, room) - slideReserveMm(run);
}

/** The two floor runs composition is allowed to plan, from the shell's own arithmetic, so the planner
 *  restates neither the corner reach nor wall B's deepest-depth reserve.
 *
 *  `DesignWall` is narrowed to the L's two walls: this builder refuses every other shape, so a wall-C
 *  entry would be a key it can never produce. */
export function lShellFloorRuns(room: DesignRoom): Readonly<
  Record<
    LWall,
    {
      readonly wall: LWall;
      readonly startMm: number;
      readonly endMm: number;
    }
  >
> {
  return {
    A: { wall: "A", ...floorRunSpan("A", room) },
    B: { wall: "B", ...floorRunSpan("B", room) },
  };
}

function floorRunSpan(wall: DesignWall, room: DesignRoom): AlongWallSpan {
  const run = tileRunsOn(wall, room).floor;
  const physicalSpan = {
    startMm: floorRunStartMm(wall, room),
    endMm: plannedEndMm(run, room),
  };
  return {
    ...physicalSpan,
    // A short wall-B run may be consumed completely by the depth-change reserve. Keep the
    // planner's public span non-inverted, without reducing that reserve or manufacturing a tile.
    endMm: Math.max(
      physicalSpan.startMm,
      wholeMillimetreReachableEndMm(physicalSpan),
    ),
  };
}

export interface UShellDesignInput {
  /** A room `validateRoomInput` accepted for the U policy; the shell passes it through untouched. */
  readonly room: DesignRoom;
  readonly occurredAt: string;
  /** Composition's private row plan (ADR 0110 Amendment D, revised, extended to wall C). Omit it to
   *  retain the 800-first shell exactly. */
  readonly compositionPlan?: UShellCompositionPlan;
}

export interface UShellCompositionPlan {
  readonly floorWidthsMm: Readonly<Record<DesignWall, readonly number[]>>;
  readonly plannedBoundariesMm?: PlannedBoundariesMm;
}

export type UShellInputRefusal =
  | "ROOM_NOT_A_DESIGN_ROOM"
  | "ROOM_NOT_U"
  | "ROOM_OUTSIDE_ENGINE_LIMITS"
  | "INVALID_OCCURRED_AT";

/** The builder sits behind the room validator, so a bad input here is a programming error. */
export class UShellInputError extends Error {
  constructor(readonly refusal: UShellInputRefusal) {
    super(`buildUShellDesign refused its input: ${refusal}`);
    this.name = "UShellInputError";
  }
}

/** The shell for a U `input.room` (ADR 0132 D12): both structural corners under the ceiling and every
 *  free run of walls A, B and C recorded, canonicalised as the L's shell is. Wall B's tiling answers
 *  for wall C against the right corner's synthetic room, relabelled; wall A is new because both
 *  corners share it. */
export function buildUShellDesign(input: UShellDesignInput): Design {
  refuseUnbuildableUInput(input);
  const shell: Design = {
    room: input.room,
    presetId: null,
    settings: { ...REFERENCE_KITCHEN.settings },
    placements: [
      ...cornerPiecesUnder(input.room),
      ...rightCornerPiecesUnder(input.room),
    ],
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };
  const tiles = uShellFreeRunTiles(input.room, input.compositionPlan);
  return canonicalised(
    withFrozenMap(shell, { emptyColumns: tiles }),
    input.compositionPlan?.plannedBoundariesMm,
  );
}

function refuseUnbuildableUInput(input: UShellDesignInput): void {
  if (!DesignRoomSchema.safeParse(input.room).success) {
    throw new UShellInputError("ROOM_NOT_A_DESIGN_ROOM");
  }
  if (input.room.shape !== "U") throw new UShellInputError("ROOM_NOT_U");
  if (!isInsideTheEngineLimitsU(input.room)) {
    throw new UShellInputError("ROOM_OUTSIDE_ENGINE_LIMITS");
  }
  if (!isValidOccurredAt(input.occurredAt)) {
    throw new UShellInputError("INVALID_OCCURRED_AT");
  }
}

/** The engine's own U limits (ADR 0132 decision 4), never the approved policy. The corner direction
 *  is carried and never read (ADR 0108 decision 5); a U never carries one past this constant
 *  (ADR 0132 decision 8). */
function isInsideTheEngineLimitsU(room: DesignRoom): boolean {
  return validateRoomInput(
    {
      shape: "U",
      wallAMm: room.widthMm,
      wallBMm: room.depthMm,
      wallCMm: room.wallCMm,
      heightMm: room.heightMm,
      cornerDirection: CORNER_DIRECTION_VALIDATION_NEVER_READS,
    },
    ENGINE_ROOM_LIMITS,
  ).ok;
}

/** The right corner's structural placements (six, four on a base-only back wall): `cornerPiecesUnder`'s
 *  rule against the right corner's own sizing and centring, with a distinct id so a U's structural
 *  placements never collide (ADR 0132 D12). The build id is never changed, so a new catalogue entry
 *  needs no second selection here. */
function rightCornerPiecesUnder(room: DesignRoom): DesignPlacement[] {
  const widths = rightCornerAssemblyWidthsMm({
    cabinetDepthMm: SHELL_CABINET_DEPTH_MM,
    room,
  });
  return piecesUnderTheCeiling(room).map((placement) =>
    assembledAtTheRightCorner(placement, widths),
  );
}

/** One left-corner placement moved to its right-corner counterpart: the same body at the right
 *  corner's wall, width and along-wall centre. */
function assembledAtTheRightCorner(
  placement: DesignPlacement,
  widths: CornerAssemblyWidthsMm,
): DesignPlacement {
  const { wall, band } = rightCornerPieceOf(placement);
  const sized = sizedRightCornerPiece(widths, wall, band);
  const centre = rightCornerAlongWallCentreMm({
    widths,
    cabinetDepthMm: SHELL_CABINET_DEPTH_MM,
    wall,
    band,
  });
  return {
    ...placement,
    id: `right-${placement.id}`,
    wall,
    alongMm: centre.alongMm,
    body: { ...placement.body, widthMm: sized.widthMm },
  };
}

/** Which wall and band the right corner puts `placement`'s body on: the left corner's piece
 *  reflected to the right corner's wall (A stays A; B becomes C). */
function rightCornerPieceOf(placement: DesignPlacement): {
  readonly wall: DesignWall;
  readonly band: CornerBand;
} {
  const leftPiece = CORNER_ASSEMBLY_PIECES.find(
    ({ wall, band }) =>
      wall === placement.wall && CORNER_BAND_FLOORS_MM[band] === placement.y0Mm,
  );
  if (leftPiece === undefined) {
    throw new Error(`buildUShellDesign: no corner piece for ${placement.id}`);
  }
  return { wall: leftPiece.wall === "A" ? "A" : "C", band: leftPiece.band };
}

function sizedRightCornerPiece(
  widths: CornerAssemblyWidthsMm,
  wall: DesignWall,
  band: CornerBand,
): SizedCornerPiece {
  const sized = widths.pieces.find(
    (piece) => piece.wall === wall && piece.band === band,
  );
  if (sized === undefined) {
    throw new Error(
      `buildUShellDesign: no width for the right corner's ${wall} ${band} piece`,
    );
  }
  return sized;
}

function uShellFreeRunTiles(
  room: DesignRoom,
  compositionPlan: UShellCompositionPlan | undefined,
): EmptyColumn[] {
  return [
    ...wallAFreeRunTilesForU(room, compositionPlan?.floorWidthsMm.A),
    ...freeRunTiles("B", room, asLShellPlan(compositionPlan?.floorWidthsMm.B)),
    ...wallCFreeRunTiles(room, compositionPlan?.floorWidthsMm.C),
  ];
}

function asLShellPlan(
  widthsMm: readonly number[] | undefined,
): LShellCompositionPlan | undefined {
  return widthsMm === undefined
    ? undefined
    : { floorWidthsMm: { A: [], B: widthsMm } };
}

/** Wall A's free run in a U, shared by both corners (ADR 0132 decision 4): one floor run between
 *  them and, only on a base-only back wall, a wall-only strip over each corner's base band. Never one
 *  wall-only run the whole width, because nothing stands above either corner's base band elsewhere.
 *
 *  The two corners' reach is the same number (`corner-assembly-size.ts`): wall A's X-leg is sized from
 *  the wall length and cabinet depth alone, so the left corner's `cornerReachMm` answers for the right
 *  one, measured from wall A's far end. */
function wallAFreeRunTilesForU(
  room: DesignRoom,
  widthsMm: readonly number[] | undefined,
): EmptyColumn[] {
  const runs = tileRunsOn("A", room);
  const reachMm = cornerReachMm({ wall: "A", room }, CORNER_BANDS);
  const wallOnlyStartMm = wallRowStartMm("A", room);
  const floorSpan = { startMm: reachMm, endMm: room.widthMm - reachMm };

  const leftWallOnlySpan = {
    startMm: wallOnlyStartMm,
    endMm: Math.max(
      wallOnlyStartMm,
      Math.min(reachMm, plannedEndMm(runs.wallOnly, room)),
    ),
  };
  // The floor run's odd-span trim must decide where the right strip starts too, or an odd `floorSpan`
  // leaves an unrecorded millimetre between them: the floor tiles never reach past
  // `wholeMillimetreReachableEndMm(floorSpan)`. The strip's own trim carries the millimetre on to
  // wall A's true far end.
  const rightWallOnlySpan = {
    startMm: Math.max(
      floorSpan.startMm,
      wholeMillimetreReachableEndMm(floorSpan),
    ),
    endMm: room.widthMm,
  };

  return [
    ...tilesOver(runs.wallOnly, leftWallOnlySpan),
    // Where the corner wall unit stands at the right corner too, nothing is left for a strip to
    // cover. Observable only in an odd-width U: reverting this guard reddens corner-wall-unit.test.ts,
    // "an odd-width U whose two units end on the base X-legs' own ends" (by mutation).
    ...(isBackWallBaseOnly(room)
      ? tilesOver(runs.wallOnly, rightWallOnlySpan)
      : []),
    ...(widthsMm === undefined
      ? tilesOver(runs.floor, floorSpan)
      : plannedFloorTiles(runs.floor, floorSpan, widthsMm)),
  ];
}

/** Wall C's free run: wall B's `freeRunTiles` against the right corner's synthetic room, relabelled
 *  from B to C (ADR 0132 decision 1). Wall C runs along the same direction as wall B, so no
 *  coordinate is reflected. Wall B's slide reserve (`cornerTakingWallsOf`) fires unchanged, which
 *  keeps wall C's 100 mm reserve without a second formula. */
function wallCFreeRunTiles(
  room: DesignRoom,
  widthsMm: readonly number[] | undefined,
): EmptyColumn[] {
  const mirroredRoom = roomForTheRightCorner(room);
  return freeRunTiles("B", mirroredRoom, asLShellPlan(widthsMm)).map(
    (tile): EmptyColumn => ({ ...tile, wall: "C" }),
  );
}

/** Wall A's, B's and C's floor runs, exported for the composer like `lShellFloorRuns`; wall C's is
 *  read off the same mirrored-room reuse `wallCFreeRunTiles` tiles from. */
export function uShellFloorRuns(room: DesignRoom): Readonly<
  Record<
    DesignWall,
    {
      readonly wall: DesignWall;
      readonly startMm: number;
      readonly endMm: number;
    }
  >
> {
  const reachMm = cornerReachMm({ wall: "A", room }, CORNER_BANDS);
  const wallAPhysicalSpan = { startMm: reachMm, endMm: room.widthMm - reachMm };
  const wallASpan = {
    ...wallAPhysicalSpan,
    endMm: Math.max(
      wallAPhysicalSpan.startMm,
      wholeMillimetreReachableEndMm(wallAPhysicalSpan),
    ),
  };
  const wallCSpan = floorRunSpan("B", roomForTheRightCorner(room));
  return {
    A: { wall: "A", ...wallASpan },
    B: { wall: "B", ...floorRunSpan("B", room) },
    C: { wall: "C", ...wallCSpan },
  };
}

/** Wall A is anchored at the corner and never slides; wall B and wall C slide by the chain the run's
 *  source declares, read through the reader `setCabinetDepth` uses.
 *
 *  `cornerTakingWallsOf("U")` rather than a bare wall-B comparison, so a direct wall-C `TileRun` gets
 *  the same reserve as wall B. It is sound for an L's runs too: wall C never appears in one. */
function slideReserveMm(run: TileRun): number {
  if (!cornerTakingWallsOf("U").has(run.wall)) return 0;
  const chain = cabinetDepthRuleOf({
    buildId: run.source,
    rule: sourceDefinition(run.source).depthRule,
  }).alongWallPositionFollows;
  const shiftsMm = declaredCabinetDepthsMm().map((toCabinetDepthMm) =>
    alongWallShiftMm({
      fromCabinetDepthMm: SHELL_CABINET_DEPTH_MM,
      toCabinetDepthMm,
      chain,
    }),
  );
  return Math.max(0, ...shiftsMm);
}

/** The run cut at composition's width limit, the near end first, to the last millimetre a whole-millimetre
 *  centre can reach. */
function tilesOver(run: TileRun, span: AlongWallSpan): EmptyColumn[] {
  const lengthMm = span.endMm - span.startMm;
  // A run with no length, or no height (a wall-only run in a room no taller than the wall row's
  // floor), has nothing to record; a tile with its floor at its top is `EMPTY_COLUMN_INVERTED`.
  if (lengthMm <= 0 || run.topMm <= run.y0Mm) return [];
  const reachMm = wholeMillimetreReachableEndMm(span);
  return splitEmptySpanAtCap(
    span.startMm,
    reachMm,
    COMPOSITION_WIDTH_LIMIT_MM,
  ).map((piece) =>
    tileOver(
      run,
      piece.centreMm - piece.widthMm / 2,
      piece.centreMm + piece.widthMm / 2,
    ),
  );
}

/** From a whole-millimetre edge every recorded piece needs an even width to keep a whole-millimetre
 *  centre, so an odd span gives up its far-end millimetre. Shared by the shell and the planner's
 *  exported floor runs. */
function wholeMillimetreReachableEndMm(span: AlongWallSpan): number {
  const lengthMm = span.endMm - span.startMm;
  return lengthMm > 0 ? span.endMm - (lengthMm % 2) : span.endMm;
}

function tileOver(run: TileRun, startMm: number, endMm: number): EmptyColumn {
  return {
    wall: run.wall,
    alongMm: (startMm + endMm) / 2,
    widthMm: endMm - startMm,
    y0Mm: run.y0Mm,
    topMm: run.topMm,
    depthMm: tileDepthMm(run.source),
    depthFromBuildId: run.source,
  };
}

/** The source's own declared clearance at the shell's depth, through the existing reader. */
function tileDepthMm(source: string): number {
  const depthMm = toExactMillimetres(
    occupiedDepthOfEntryM({
      buildId: source,
      definition: sourceDefinition(source),
    }),
  );
  if (depthMm === undefined) {
    throw new Error(
      `buildLShellDesign: ${source}'s declared depth is not a whole millimetre`,
    );
  }
  return depthMm;
}

function sourceDefinition(source: string): BodyDefinition {
  const definition = SHELL_CATALOG.get(source);
  if (!definition) {
    throw new Error(`buildLShellDesign: the catalogue holds no ${source}`);
  }
  return definition;
}

/** The frozen map written the way the depth command writes its own: derived over the document, then
 *  projected back, so the corner's columns come from its placements and the stored arrays are in the
 *  order a later save would put them. Merged at composition's width limit and never across a planned boundary,
 *  so the planned tiles stay apart: a column the shell stores merged cannot be split again by the world that
 *  loads it (ADR 0167 D6). */
function canonicalised(
  design: Design,
  plannedBoundaries?: PlannedBoundariesMm,
): Design {
  const records = derivePlacementRecords(design, SHELL_CATALOG);
  return withFrozenMap(
    design,
    projectFrozenMap(
      deriveRecordedColumns(
        records,
        design,
        toMetres(design.room.widthMm),
        COMPOSITION_WIDTH_LIMIT_MM,
        plannedBoundaries,
      ),
      records,
    ),
  );
}

function isStructural(placement: DesignPlacement): boolean {
  return (
    SHELL_CATALOG.get(placement.body.buildId)?.structuralReason !== undefined
  );
}

function wholeMillimetresOf(valueM: number | undefined, what: string): number {
  const valueMm = valueM === undefined ? undefined : toExactMillimetres(valueM);
  if (valueMm === undefined) {
    throw new Error(`buildLShellDesign: ${what} is not a whole millimetre`);
  }
  return valueMm;
}
