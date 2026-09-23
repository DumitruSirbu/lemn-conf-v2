// ADR 0110 decision 1, built as its Amendment B rules: the design generation starts from. It holds
// the entered room, the reference kitchen's settings and cabinet depth, the structural corner pieces
// that fit under the ceiling, and every free run of each wall recorded as empty space — a document
// `insertBody` can place into and nothing else has touched.
//
// **Authored for its room, never derived by removal** (Amendment B1). `removePlacement` records
// nothing in the document; the space a delete frees survives only through the web store's frozen map.
// Building the shell by deleting the reference kitchen would restate that store's order here and
// carry the reference's own column boundaries and depth sources — a fridge's, on wall B — into rooms
// where none of them ever stood. So the shell is two parts:
//
// - **the corner's own columns**, derived from the kept structural placements, never tiled;
// - **every free run**, cut by `splitEmptySpanAtCap` (ADR 0052's ceiling) from the run's start to
//   its planned end, each piece keyed from its own centre, its depth read off a neutral declared
//   source (`occupiedDepthOfEntryM`) so the extent names a body that explains it (ADR 0073, 0102).
//
// **Nothing is clipped**, so ADR 0090 Amendment B has nothing to say here (Amendment B4): each run is
// tiled to where it ends, and `clipEmptyColumnsAtWallEnd` — a published-face pass — is not applied to
// this recorded face.
//
// **Wall B's runs end short of the wall** by the corner's chain shift to the deepest declared depth
// (Amendment B3, ADR 0109 Amendment C): a deeper corner slides wall B's whole run, and a proposal
// must still fit after the customer changes the depth. **Wall A's floor run reaches the wall's end**:
// the run-end panel is not drawn where a run comes within its gap and slab of the wall (ADR 0045
// Amendment A), so nothing composed can push it past the wall, and B3a's reserve went with that veto.
//
// **An odd span gives up its last millimetre.** A document holds whole-millimetre centres, so from a
// whole-millimetre edge every piece is even; the millimetre an odd span cannot carry is left at the
// far end — the same give `widestOnTheGrid` makes (Adjudication 7D1-P, P3).
//
// No probe, no price book, and no body but the corner's: composition places every other body through
// `insertBody` (ADR 0110 decision 2).
import {
  alongWallShiftMm,
  WALL_THE_CORNER_IS_TAKEN_FROM,
} from "../along-wall-chain-shift.js";
import { cabinetDepthRuleOf } from "../cabinet-depth-rule.js";
import { isValidOccurredAt } from "../commands/command-result.js";
import {
  CORNER_ASSEMBLY_PIECES,
  cornerAlongWallCentreMm,
  cornerAssemblyWidthsMm,
  cornerFarEdgeMm,
  type CornerBand,
} from "../corner-assembly-size.js";
import {
  cabinetDepthMmOf,
  DesignRoomSchema,
  DesignWallSchema,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type DesignWall,
  type EmptyColumn,
} from "../design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../fixtures/kitchen-l-design.js";
import { toExactMillimetres } from "../millimetres.js";
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
} from "../void-engine.js";
import { declaredCabinetDepthsMm } from "../worktop-depth.js";

// =================================================================================================
// ADR 0130 D5 (wave 7J S2) — the straight kitchen's shell: no corner, no structural placement, one
// wall. The tiling primitives above (`tileRunsOn`, `tilesOver`, `plannedFloorTiles`,
// `wholeMillimetreReachableEndMm`) are shared rather than copied: a straight room's free run is the
// same shape of thing an L's is, with the corner's reach and the depth-change reserve both at zero
// rather than a second code path computing them.
// =================================================================================================

export interface LinearShellDesignInput {
  /** A room `validateRoomInput` accepted for the straight policy; the shell passes it through
   *  untouched. */
  readonly room: DesignRoom;
  readonly occurredAt: string;
  /** Composition's private row plan for wall A, the straight room's only wall. Omit it to retain the
   *  un-composed 800-first shell exactly, the same contract `LShellDesignInput.compositionPlan` has. */
  readonly compositionPlan?: LinearShellCompositionPlan;
}

export interface LinearShellCompositionPlan {
  readonly floorWidthsMm: readonly number[];
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

/** The shell for a straight `input.room`: no structural placement (D5) and wall A's one free run,
 *  recorded the same way an L's floor and wall-only runs are. */
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
  return canonicalised(withFrozenMap(shell, { emptyColumns: tiles }));
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

/** The engine's own linear limits (ADR 0130 D2), never the approved policy — the same split
 *  `isInsideTheEngineLimits` keeps for the L. Generation never reads `room.depthMm` (D3, A7), so no
 *  check here touches it. */
function isInsideTheEngineLimitsLinear(room: DesignRoom): boolean {
  return validateRoomInput(
    { shape: "linear", wallAMm: room.widthMm, heightMm: room.heightMm },
    ENGINE_ROOM_LIMITS,
  ).ok;
}

/** Wall A's free run: `[0, W]` less the odd millimetre (7D1-P P3), with no corner reach to subtract
 *  and no depth-change reserve — wall A never slides (D5), because there is no corner on wall B to
 *  slide it.
 *
 *  **One run, not two.** The L's `freeRunTiles` also records a *wall-only* run, but only over the
 *  horizontal strip where the corner's base band is occupied while its wall/top bands have already
 *  ended — the space directly above the corner's own base piece. A straight room places no structural
 *  piece at all (D5), so that strip never exists: `wallRowStartMm`'s corner reach and
 *  `floorRunStartMm`'s both equal 0, which is exactly the input that collapses the L's own wall-only
 *  span to zero length (`Math.min(floorSpan.startMm, …)` clamped against a `wallOnlyStartMm` that is
 *  the same 0). Tiling only the floor run reaches the identical, non-overlapping result the shared
 *  clamp would, without a call that is provably always empty. */
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

/** Wall A's one run, exported for the composer the same way `lShellFloorRuns` is — so the plan's
 *  declared widths and the shell's tiles are cut from the identical span. */
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
  /** Composition's private row plan (ADR 0110 Amendment D, revised). Omit it to retain the 7D1
   *  800-first shell exactly. Widths are ordered from the corner toward each wall's free end. */
  readonly compositionPlan?: LShellCompositionPlan;
}

export interface LShellCompositionPlan {
  readonly floorWidthsMm: Readonly<Record<DesignWall, readonly number[]>>;
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

/** The reference kitchen the shell's corner, settings and cabinet depth are taken from (ADR 0109
 *  decision 2: derived, never copied). */
const REFERENCE_KITCHEN = KITCHEN_L_DESIGN;
const SHELL_CABINET_DEPTH_MM = cabinetDepthMmOf(REFERENCE_KITCHEN);
const SHELL_CATALOG = buildKitchenLBodyCatalog(SHELL_CABINET_DEPTH_MM);

/** The neutral sources a tile's depth is read off: the bodies composition fills a floor run and a
 *  wall-only run with (Amendment B2). Never a body the reference happened to stand there. */
const FLOOR_TILE_SOURCE = "base-cabinet";
const WALL_ONLY_TILE_SOURCE = "wall-cabinet";

/** The input `validateRoomInput` requires and never reads (ADR 0108 decision 5); the shell is the
 *  canonical left-corner L, and a mirrored one is presentation (ADR 0109 Amendment A2). */
const CORNER_DIRECTION_VALIDATION_NEVER_READS = "left";

/** The whole structural assembly, including pieces a low ceiling excludes: an excluded piece still
 *  reserves its footprint, so `p21`'s zone stays unrecorded (Adjudication 7D1-P, P5 (iii)). */
const STRUCTURAL_ASSEMBLY = REFERENCE_KITCHEN.placements.filter(isStructural);

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

/** Which rows a wall-only run has to start past: the ones standing at or above its own floor.
 *  Filtered from the grid rather than listed, so a row that moves takes this filter with it.
 *
 *  **Exported to be pinned, not to be used.** The wall row's own floor is the bound this compares
 *  against, so the equality is the whole of the operator — and the wall and top pieces read the same
 *  catalogue row and the same near-edge branch, so their far edges are equal in every room at every
 *  depth and a `>` here moves no origin the shell computes. The membership is therefore asserted
 *  directly (7D6 QA's band-filter mutant). */
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
  const tiles = DesignWallSchema.options.flatMap((wall) =>
    freeRunTiles(wall, input.room, input.compositionPlan),
  );
  return canonicalised(withFrozenMap(corner, { emptyColumns: tiles }));
}

/** The room is passed through untouched, so it must already be exactly what a stored design may say:
 *  one carrying any other key would yield a document `DesignSchema` refuses (Adjudication 7D1-Q1,
 *  Q1.5). Refused rather than copied field by field, because building a room here is what the
 *  room-writer guard (`demo-room-envelope.test.ts`) forbids every module but two to do.
 *
 *  In that order — the document's shape, then the room's, then what the engine can build (a wall
 *  shorter than its corner is storable and unbuildable), then the moment — so the first refusal names
 *  the most basic thing wrong, and the limits are only asked of the one shape they state. */
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

/** The engine's own limits (ADR 0108 decision 6, Amendment A) and never the approved policy: the shell
 *  holds what the engine can build, and which rooms a customer may enter is the caller's policy. The
 *  corner direction is carried and never read by validation (ADR 0108 decision 5). */
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

/** ADR 0110 decision 1 and ADR 0109 Amendment B's correction: a structural piece whose top is above
 *  the ceiling is not instantiated — excluded here by selection, never removed by a command, which
 *  refuses a structural body as `NOT_DELETABLE`. */
function cornerPiecesUnder(room: DesignRoom): DesignPlacement[] {
  const widths = cornerAssemblyWidthsMm({
    cabinetDepthMm: SHELL_CABINET_DEPTH_MM,
    room,
  });
  return STRUCTURAL_ASSEMBLY.filter(
    (placement) => placement.y0Mm + placement.body.heightMm <= room.heightMm,
  ).map((placement) => {
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
 *  nothing structural stands above the corner's base, as on wall A — the wall-only run over it. */
function freeRunTiles(
  wall: DesignWall,
  room: DesignRoom,
  compositionPlan: LShellCompositionPlan | undefined,
): EmptyColumn[] {
  const runs = tileRunsOn(wall, room);
  const floorSpan = floorRunSpan(wall, room);
  const wallOnlyStartMm = wallRowStartMm(wall, room);
  return [
    // The reserve may leave this upper span ending before its corner origin. Record zero length
    // there, exactly as for a spent floor run; neither span offers capacity in that case.
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
 *  that wall — at the corner itself where there are none, as over wall A's corner base. */
function wallRowStartMm(wall: DesignWall, room: DesignRoom): number {
  return cornerReachMm({ wall, room }, BANDS_ABOVE_THE_WALL_ROW_FLOOR);
}

/** How far the corner assembly reaches along one wall in the given rows — **sized for this room and
 *  the shell's own depth** (7D6's J1′, through `corner-assembly-size.ts`' entry points 1 and 2),
 *  where it used to be read off the reference kitchen's stored widths.
 *
 *  `Math.max(0, …)` over an **empty** set of bands is what answers for wall A above the base row:
 *  the assembly stands on no wall-A piece there, so the wall row starts at the corner itself and its
 *  run stands over the corner's base (ADR 0110 Amendment B2). That zero is load-bearing — it is the
 *  900 mm of wall-A wall-only run, in two tiles, that the smallest admitted room's frozen map is
 *  made of entirely. */
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

/** The two floor runs composition is allowed to plan, from the same private arithmetic the shell
 *  itself uses. Exporting the result prevents the planner from restating either corner reach or B's
 *  dynamic deepest-depth reserve. */
export function lShellFloorRuns(room: DesignRoom): Readonly<
  Record<
    DesignWall,
    {
      readonly wall: DesignWall;
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

/** Wall A is anchored at the corner and never slides; wall B slides by the chain the run's source
 *  declares, read through the production reader `setCabinetDepth` itself uses. */
function slideReserveMm(run: TileRun): number {
  if (run.wall !== WALL_THE_CORNER_IS_TAKEN_FROM) return 0;
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

/** The run cut at ADR 0052's ceiling, the near end first, to the last millimetre a whole-millimetre
 *  centre can reach. */
function tilesOver(run: TileRun, span: AlongWallSpan): EmptyColumn[] {
  const lengthMm = span.endMm - span.startMm;
  // A run with no length, or with no height — a wall-only run in a room no taller than the wall
  // row's floor — has nothing to record, and a tile with its floor at its top is a refusal
  // (`EMPTY_COLUMN_INVERTED`).
  if (lengthMm <= 0 || run.topMm <= run.y0Mm) return [];
  const reachMm = wholeMillimetreReachableEndMm(span);
  return splitEmptySpanAtCap(span.startMm, reachMm).map((piece) =>
    tileOver(
      run,
      piece.centreMm - piece.widthMm / 2,
      piece.centreMm + piece.widthMm / 2,
    ),
  );
}

/** From a whole-millimetre edge every recorded piece needs an even width to retain a whole-
 *  millimetre centre. An odd span therefore gives up its far-end millimetre (7D1-P P3). This is the
 *  shared reach used both by the shell and by the composition planner's exported floor runs. */
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

/** The source's own declared clearance at the shell's depth — the existing reader, no new rule. */
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
 *  projected back — so the corner's own columns come from its placements and the stored arrays are
 *  in the order a later save would put them. */
function canonicalised(design: Design): Design {
  const records = derivePlacementRecords(design, SHELL_CATALOG);
  return withFrozenMap(
    design,
    projectFrozenMap(deriveRecordedColumns(records, design), records),
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
