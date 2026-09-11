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

export interface LShellDesignInput {
  /** A room `validateRoomInput` accepted; the shell passes it through untouched. */
  readonly room: DesignRoom;
  readonly occurredAt: string;
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
    placements: cornerPiecesUnder(input.room.heightMm),
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };
  const tiles = DesignWallSchema.options.flatMap((wall) =>
    freeRunTiles(wall, input.room),
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
function cornerPiecesUnder(ceilingMm: number): DesignPlacement[] {
  return STRUCTURAL_ASSEMBLY.filter(
    (placement) => placement.y0Mm + placement.body.heightMm <= ceilingMm,
  ).map((placement) => ({ ...placement, body: { ...placement.body } }));
}

/** One wall's free runs: the floor run from the corner's far edge to the planned end, and — where
 *  nothing structural stands above the corner's base, as on wall A — the wall-only run over it. */
function freeRunTiles(wall: DesignWall, room: DesignRoom): EmptyColumn[] {
  const runs = tileRunsOn(wall, room);
  const floorStartMm = floorRunStartMm(wall);
  return [
    ...tilesOver(runs.wallOnly, {
      startMm: wallRowStartMm(wall),
      endMm: Math.min(floorStartMm, plannedEndMm(runs.wallOnly, room)),
    }),
    ...tilesOver(runs.floor, {
      startMm: floorStartMm,
      endMm: plannedEndMm(runs.floor, room) - (wall === "A" ? 19 : 0),
    }),
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
function floorRunStartMm(wall: DesignWall): number {
  return farthestEdgeMm(
    STRUCTURAL_ASSEMBLY.filter((placement) => placement.wall === wall),
  );
}

/** The wall and top rows start past the structural pieces that reach above the wall row's floor on
 *  that wall — at the corner itself where there are none, as over wall A's corner base. */
function wallRowStartMm(wall: DesignWall): number {
  return farthestEdgeMm(
    STRUCTURAL_ASSEMBLY.filter(
      (placement) =>
        placement.wall === wall &&
        placement.y0Mm + placement.body.heightMm > WALL_ROW_FLOOR_MM,
    ),
  );
}

function farthestEdgeMm(pieces: readonly DesignPlacement[]): number {
  return Math.max(
    0,
    ...pieces.map(
      (placement) => placement.alongMm + placement.body.widthMm / 2,
    ),
  );
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
  const reachMm = span.endMm - (lengthMm % 2);
  const depthMm = tileDepthMm(run.source);
  return splitEmptySpanAtCap(span.startMm, reachMm).map((piece) => ({
    wall: run.wall,
    alongMm: piece.centreMm,
    widthMm: piece.widthMm,
    y0Mm: run.y0Mm,
    topMm: run.topMm,
    depthMm,
    depthFromBuildId: run.source,
  }));
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
