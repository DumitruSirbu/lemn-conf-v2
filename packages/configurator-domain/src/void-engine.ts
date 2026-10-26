import type {
  Design,
  DesignPlacement,
  DesignRoom,
  EmptyColumn,
  StoredColumnExtent,
  DesignWall,
  Handle,
} from "./design.js";
import type { Finish } from "./materials.js";
import { clipEmptyColumnsAtWallEnd } from "./clip-empty-columns-at-wall-end.js";
import {
  mergeAdjacentEmptyColumns,
  type PlannedBoundariesMm,
} from "./merge-empty-columns.js";
import { toExactMillimetres, toMetres } from "./millimetres.js";
import {
  kitchenHandleSettingsOf,
  ownHandleOf,
  type KitchenHandleSettings,
} from "./kitchen-handle/kitchen-handle.js";
import { drawnFinishOf } from "./resolved-finish.js";
import type { SeatRule } from "./seat-rule.js";
import { bodyFinishRuleOf, type BodyFinishRule } from "./body-finish-rule.js";
import {
  alongWallCoordinate,
  alongWallPosition,
  deriveColumnKeyAt,
  LEVELS,
  LEVEL_SNAP_M,
} from "./module-grid.js";
import { deriveCabinetWorldTransform } from "./room-transforms.js";
import { cornerOf, type Corner } from "./corner-of.js";

// One front door for the column model; defined in `module-grid.ts`, which column code never imports back.
export {
  alongWallCoordinate,
  alongWallPosition,
  deriveColumnKeyAt,
  LEVELS,
  LEVEL_SNAP_M,
  MAX_EMPTY_COLUMN_WIDTH_MM,
} from "./module-grid.js";
export {
  mergeAdjacentEmptyColumns,
  type PlannedBoundariesMm,
} from "./merge-empty-columns.js";
export { splitOversizedEmptyColumns } from "./split-oversized-empty-columns.js";
export { clipEmptyColumnsAtWallEnd } from "./clip-empty-columns-at-wall-end.js";
export { clipEmptyColumnsToFreeGround } from "./clip-empty-columns-to-free-ground.js";

/** Smallest span (metres) that becomes a void. */
export const MIN_SPAN_M = 0.3;

/** `DEVELOPMENT-SPEC.md` §2's `MIN_W`: the default narrowest cabinet; an entry's `minWidthMm` may override it. Not a
 *  resize floor: an empty column may be any width (ADR 0043). */
export const MIN_WIDTH_M = 0.3;

/** `DEVELOPMENT-SPEC.md` §2's `TOL`: slack for width and height comparisons. Frame numbers are not bit-identical
 *  after unit conversions, so never compare with `Number.EPSILON`. */
export const FIT_TOLERANCE_M = 0.012;

export type Band = "base" | "wall" | "top" | "column";

/** §7's width column: `'fit'` builds to the opening; a millimetre set builds only at those widths. */
export type WidthFlex = "fit" | readonly number[];

/** Why a body offers nothing structural; declared on the entry so §11 row 16's refusal can explain itself. */
export type StructuralReason = "corner";

import { occupiedDepthM, type OccupiedDepthRule } from "./occupied-depth.js";
import type { CabinetHandleRule } from "./cabinet-handles.js";
import type { FrontPopulationRule } from "./front-population.js";
import {
  cabinetDepthRuleOf,
  depthFollowsSetting,
  type CabinetDepthRule,
} from "./cabinet-depth-rule.js";

export interface Frame {
  readonly x: number;
  readonly z: number;
  readonly ry: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
  readonly d: number;
}

/** An inclusive width range in millimetres; both ends are real numbers (ADR 0035 decision 1). */
export interface WidthRangeMm {
  readonly minMm: number;
  readonly maxMm: number;
}

/** Whether a catalogue row holds a sink, as named instances rather than a bare boolean (ADR 0092 decision 9). */
export interface SinkRule {
  readonly carriesSink: boolean;
}

/** A row whose body holds a sink: `base-sink` and the seeded `base-sink-800`, and no third row. */
export const CARRIES_SINK: SinkRule = Object.freeze({ carriesSink: true });

/** Every other row; named so the default reads as an answer, as `NO_DOOR_BANDS` does. */
export const NO_SINK: SinkRule = Object.freeze({ carriesSink: false });

/** Whether a catalogue row holds a sink. An absent definition declares no sink; `priceDesign` refuses an
 *  uncataloged body before a line exists. */
export function declaresASink(
  definition: { readonly sink?: SinkRule } | undefined,
): boolean {
  return definition?.sink?.carriesSink === true;
}

/** What a `buildId` is, where it sits in the module grid, and what may be done to it. */
export interface BodyDefinition {
  readonly kind: string;
  readonly band: Band;
  readonly frameDepthMm: number;
  /** How deep the space this body fills is (§3.1 full extent), which `frameDepthMm` is not (ADR 0018).
   *  Required so no entry skips the question; applied by `occupied-depth.ts`. */
  readonly occupiedDepth: OccupiedDepthRule;
  /** How many of this body's handles are the cabinet's, not the bars its builder draws (ADR 0061). Declared, never
   *  inferred; `cabinet-handles.ts` throws when absent (ADR 0061 decision 4). */
  readonly cabinetHandles?: CabinetHandleRule;
  /** What this body's fronts are: door leaves, drawers, door-band heights (ADR 0070). Declared, never inferred;
   *  `front-population.ts` throws when absent. */
  readonly fronts?: FrontPopulationRule;
  /** Whether this body holds a sink (ADR 0092 decision 9). Never inferred from `kind` or id; defaulting to `NO_SINK`
   *  is safe only because `sink-declaration.parity.test.ts` checks both directions. */
  readonly sink?: SinkRule;
  /** Whether this body's depth follows the cabinet-depth setting (ADR 0058 decision 2). Optional because `BodyCatalog`
   *  is a port; `refuseUndeclaredDepthRules` refuses an undeclared row at assembly. */
  readonly depthRule?: CabinetDepthRule;
  /** True when a rebuild takes its depth from `columnBuildDepthM`'s lifted arm, not the equivalent's `frameDepthMm`
   *  (ADR 0101 decision 1). Declared, never inferred; read via `declaresALiftedColumnDepth`; absent means false. */
  readonly builtDepthFollowsALiftedColumn?: boolean;
  /** Which plane seats this body (ADR 0077); optional because `BodyDefinition` is a port, refused at assembly by
   *  `refuseUndeclaredSeatRules`. */
  readonly seatRule?: SeatRule;
  /** Defaults to the carcass `heightMm` when the full extent (accessories, proud fronts) matches it. */
  readonly frameHeightMm?: number;
  /** Whether this body carries its own colour, wears the kitchen's, or is never painted (`body-finish-rule.ts`);
   *  `refuseUndeclaredFinishRules` refuses an undeclared row at assembly. */
  readonly finishRule?: BodyFinishRule;
  readonly canFinish: boolean;
  readonly canHandle: boolean;
  readonly canReplace: boolean;
  readonly canDelete: boolean;
  readonly fixedWidth: boolean;
  /** ADR 0011 Gap A: marks a §7 parameterised entry, the only kind `insertBody` offers; absent means false
   *  (a seeded entry is one already-built body, not measured for any other opening). */
  readonly insertable?: boolean;
  readonly widthFlex?: WidthFlex;
  /** §7's `hFlex` column: builds to a cabinet-sized opening instead of its nominal height. */
  readonly heightFlex?: boolean;
  readonly nominalHeightMm?: number;
  /** Catalogue nominal depth, the `frameDepthMm` fallback for a placement with no `seatDepthMm`. It does not decide
   *  what is built: §5.2 hands the opening's depth to the probe, so a wall entry over a tall column is deeper. */
  readonly nominalDepthMm?: number;
  /** §9's modular widths a customer picks from (ADR 0035); the bound, not this list, decides whether a width may be
   *  built. */
  readonly sizesMm?: readonly number[];
  /** Narrowest width this row permits; absent means `MIN_WIDTH_M`. Above it is a builder limitation (`base-sink`
   *  560); below it a product decision (`base-bottle-cargo` 200; ADR 0026). */
  readonly minWidthMm?: number;
  /** The insertable §7 entry this seeded entry instances, so §9 badges its swap row ACTUAL (a seeded `buildId` is
   *  never insertable; ADR 0011 Gap A). Declared, never inferred; absent means no equivalent and no badge. */
  readonly catalogEquivalentId?: string;
  /** The accessory `kind` built into this body (`induction_cooktop` on the hob bases; ADR 0027). Declared because
   *  the domain has no meshes to inspect; absent means none. */
  readonly carriesAccessoryKind?: string;
  /** True when the builder derives the door count from the width, so the label counts doors at build time (ADR 0033).
   *  Declared, never inferred from `kind`; absent means false and the row is named generically. */
  readonly doorCountFollowsWidth?: boolean;

  /** The widths this body may be built to (ADR 0035 decisions 2-3): continuous for cabinetry, discrete for appliances.
   *  Declared via `cabinetryWidths` / `discreteWidths` in `catalog.ts`, which also derive `sizesMm`. */
  readonly widthRangesMm?: readonly WidthRangeMm[];

  /** Present only on an entry that offers nothing structural, saying why (§11 row 16, §13.1). */
  readonly structuralReason?: StructuralReason;
}

export type BodyCatalog = ReadonlyMap<string, BodyDefinition>;

export interface PlacementRecord {
  readonly id: string;
  readonly buildId: string;
  readonly kind: string;
  readonly frame: Frame;
  /** Copied off the catalogue entry because the answer depends on `frame.d`, which a resize rewrites. Read via
   *  `occupiedDepthM`, never directly. */
  readonly occupiedDepth: OccupiedDepthRule;
  /** Copied raw off the definition so `deepestMember` can break a tie without the catalogue (ADR 0079 decision 6). Read
   *  via `depthFollowsSetting`; `cabinetDepthRuleOf` throws when absent (ADR 0079 amendment D). */
  readonly depthRule?: CabinetDepthRule;
  readonly col: string;
  readonly wall: DesignWall;
  /** Which room corner this body is a structural piece of (`cornerOf`, ADR 0121); absent if none. `"right"` occurs
   *  only in a U. */
  readonly corner?: Corner;
  readonly rotated: boolean;
  readonly band: Band;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly canFinish: boolean;
  readonly canHandle: boolean;
  readonly canReplace: boolean;
  readonly canDelete: boolean;
  readonly fixedWidth: boolean;
  /** The colour this cabinet chose itself; absent means it follows the kitchen. Never write a resolved colour here:
   *  `carriedAppearance` would stamp it into the document (ADR 0099 decision 2). */
  readonly finishKey?: Finish;
  /** The colour to paint, resolved by `drawnFinishOf` (ADR 0099 decision 1), so the renderer needs no capability guard.
   *  Never stored and never read by a command; use `finishKey` for what the customer picked. */
  readonly drawnFinish?: Finish;
  /** The handle this cabinet chose itself; absent means it follows the kitchen's (a legacy `null` reads as absent).
   *  Never the resolved handle: that is `resolvedHandleAt`'s answer. */
  readonly handleMode?: Handle;
  /** The design's kitchen handle settings, carried so the scene resolves a handle by the same call as the price and
   *  the panel (ADR 0092 Amendment C). Absent reads as `{}`: a record built by hand states none. */
  readonly kitchenSettings?: KitchenHandleSettings;
}

export interface Column {
  readonly key: string;
  readonly wall: DesignWall;
  readonly ry: number;
  readonly x: number;
  readonly z: number;
  readonly w: number;
  /** §3.2's MAX over the members' `occupiedDepthM`: a clearance deciding where the column sits, not the depth a body
   *  inserted here is built to (`columnBuildDepthM`, ADR 0060); a plain `number`, as extents arrive off the wire. */
  readonly d: number;
  /** The `buildId` whose clearance supplied `d`. Travels with `d`, never alone: wherever `d` is written this names
   *  the body that produced it, or is absent (ADR 0079 decision 1). */
  readonly depthFromBuildId?: string | undefined;
  readonly top: number;
  readonly regions: readonly (readonly [number, number])[];
  /** Whether a full-height member stands under this column, lifting §7's wall-carcass depth cap; stated positively
   *  so an emptied run keeps the cap (ADR 0011 third correction). Live, not frozen: `withCurrentFullHeightMembers`. */
  readonly hasFullHeightUnder: boolean;
}

/** A column's frozen half (ADR 0011 Gap D). `hasFullHeightUnder` stays current only because every `Column` reaching
 *  `insert-fit.ts` passes through `withCurrentFullHeightMembers`; a second route breaks it silently. */
export type ColumnExtent = Omit<Column, "hasFullHeightUnder">;

/** The `kind` of an opening with no body; not in `catalog.kinds`, so it resolves to `catalog.unknownKind`. Selection
 *  labels a void `catalog.emptySlot` instead; latent, as only `COLUMN_MISMATCH` (an invariant break) names one. */
export const VOID_KIND = "void";

export interface VoidRecord {
  readonly id: string;
  readonly col: string;
  readonly wall: DesignWall;
  readonly x: number;
  readonly z: number;
  readonly ry: number;
  readonly w: number;
  readonly d: number;
  readonly y0: number;
  readonly h: number;
  readonly spanY0: number;
  readonly spanH: number;
}

export class UnknownBodyError extends Error {
  constructor(buildId: string) {
    super(`No catalog entry for buildId "${buildId}"`);
    this.name = "UnknownBodyError";
  }
}

function deriveColumnKey(wall: DesignWall, frame: Frame): string {
  return deriveColumnKeyAt(wall, wall === "A" ? frame.x : frame.z);
}

function lookupDefinition(
  catalog: BodyCatalog,
  buildId: string,
): BodyDefinition {
  const definition = catalog.get(buildId);
  if (!definition) throw new UnknownBodyError(buildId);
  return definition;
}

function deriveFrame(
  placement: DesignPlacement,
  definition: BodyDefinition,
  roomWidthM: number,
): Frame {
  // ADR 0011 Gap B: an inserted body carries its own measured seat; `frameDepthMm` measures one seeded body.
  const depthM = toMetres(
    placement.body.seatDepthMm ?? definition.frameDepthMm,
  );
  const transform = deriveCabinetWorldTransform({
    wall: placement.wall,
    alongM: toMetres(placement.alongMm),
    y0M: toMetres(placement.y0Mm),
    depthM,
    roomWidthM,
  });
  const heightMm = definition.frameHeightMm ?? placement.body.heightMm;
  return {
    x: transform.position.x,
    z: transform.position.z,
    ry: transform.yawRadians,
    y0: transform.position.y,
    w: toMetres(placement.body.widthMm),
    h: toMetres(heightMm),
    d: depthM,
  };
}

/** §3.1: the runtime record for a placement; `frame` is authoritative by carcass width, never mesh bounds. */
export function derivePlacementRecords(
  design: Design,
  catalog: BodyCatalog,
): PlacementRecord[] {
  const roomWidthM = toMetres(design.room.widthMm);
  const kitchenSettings = kitchenHandleSettingsOf(design.settings);
  return design.placements.map((placement) => {
    const definition = lookupDefinition(catalog, placement.body.buildId);
    const ownHandle = ownHandleOf(placement.body.handle);
    const frame = deriveFrame(placement, definition, roomWidthM);
    // "Rotated" names the along axis (`+z`), not a wall; wall C reads exactly as B (ADR 0132 decision 1).
    const rotated = placement.wall !== "A";
    const corner = cornerOf(placement, design.room, catalog);
    const drawnFinish = drawnFinishOf({
      rule: bodyFinishRuleOf({
        buildId: placement.body.buildId,
        rule: definition.finishRule,
        canFinish: definition.canFinish,
      }),
      placement,
      design,
    });
    return {
      id: placement.id,
      buildId: placement.body.buildId,
      kind: definition.kind,
      frame,
      occupiedDepth: definition.occupiedDepth,
      ...(definition.depthRule !== undefined
        ? { depthRule: definition.depthRule }
        : {}),
      col: deriveColumnKey(placement.wall, frame),
      wall: placement.wall,
      ...(corner !== undefined ? { corner } : {}),
      rotated,
      band: definition.band,
      widthMm: placement.body.widthMm,
      heightMm: placement.body.heightMm,
      canFinish: definition.canFinish,
      canHandle: definition.canHandle,
      canReplace: definition.canReplace,
      canDelete: definition.canDelete,
      fixedWidth: definition.fixedWidth,
      ...(placement.body.finish !== undefined
        ? { finishKey: placement.body.finish }
        : {}),
      ...(drawnFinish !== undefined ? { drawnFinish } : {}),
      ...(ownHandle !== undefined ? { handleMode: ownHandle } : {}),
      kitchenSettings,
    };
  });
}

/** A column's origin: along its wall from any member, across it from the column's own depth. */
function originOnWall(
  member: PlacementRecord,
  centreM: number,
  roomWidthM: number,
): { readonly x: number; readonly z: number } {
  if (member.wall === "A") return { x: member.frame.x, z: centreM };
  if (member.wall === "B") return { x: centreM, z: member.frame.z };
  // Wall C is a world wall at `x = W` fronting `−X`: wall B's mirror about `W`, not the room centre (ADR 0132 dec. 1).
  return { x: roomWidthM - centreM, z: member.frame.z };
}

function groupByColumn(
  records: readonly PlacementRecord[],
): Map<string, PlacementRecord[]> {
  const grouped = new Map<string, PlacementRecord[]>();
  for (const record of records) {
    const bucket = grouped.get(record.col);
    if (bucket) bucket.push(record);
    else grouped.set(record.col, [record]);
  }
  return grouped;
}

/** The two halves of the frozen map as `Design` carries them; named fields, as same-typed arrays would swap. */
export interface FrozenMapDocument {
  readonly emptyColumns?: readonly EmptyColumn[] | undefined;
  readonly columnExtents?: readonly StoredColumnExtent[] | undefined;
}

/** The columns the placements imply with the document's stored empty columns and frozen extents restored over them
 *  (ADR 0053); shared by the recorded and published faces. */
function restoredColumns(
  records: readonly PlacementRecord[],
  stored: FrozenMapDocument,
  roomWidthM: number,
): Map<string, ColumnExtent> {
  const columns = new Map<string, ColumnExtent>();
  for (const [key, members] of groupByColumn(records)) {
    // Any member gives the orientation facts (`ry`, wall); the space itself comes from all of them.
    const orientation = members[0];
    if (!orientation) {
      throw new Error(`deriveColumns: column ${key} has no members`);
    }
    const width = Math.min(...members.map((member) => member.frame.w));
    // `Column.d` is the clearance, not the depth a cabinet inserted here is built to (ADR 0060 decision 1). The MAX is
    // taken by naming its winner, so depth and source cannot diverge.
    const deepest = deepestMember(members);
    const clearanceM = occupiedDepthM(deepest);
    const top = Math.max(
      ...members.map((member) => member.frame.y0 + member.frame.h),
    );
    const regions = members
      .map((member): [number, number] => [
        member.frame.y0,
        member.frame.y0 + member.frame.h,
      ])
      .sort((a, b) => a[0] - b[0]);
    // The off-wall coordinate is `depth / 2` from the wall, never a member's own seat offset.
    const centre = clearanceM / 2;
    columns.set(key, {
      key,
      wall: orientation.wall,
      ry: orientation.frame.ry,
      ...originOnWall(orientation, centre, roomWidthM),
      w: width,
      d: clearanceM,
      depthFromBuildId: deepest.buildId,
      top,
      regions,
    });
  }
  addStoredEmptyColumns(columns, stored.emptyColumns ?? [], roomWidthM);
  addStoredColumnExtents(columns, stored.columnExtents ?? [], roomWidthM);
  return columns;
}

/** §3.2: derived once at load; `top` and `regions` are load-time facts, never recomputed. Stored spaces and extents
 *  restore before the merge and before `hasFullHeightUnder` is answered (ADR 0053). `mergeWidthLimitMm` omitted is
 *  the editor's own, and so are the planned boundaries; only composition passes either
 *  (`mergeAdjacentEmptyColumns`). */
export function deriveColumns(
  records: readonly PlacementRecord[],
  stored: FrozenMapDocument = {},
  room: DesignRoom,
  mergeWidthLimitMm?: number,
  plannedBoundaries?: PlannedBoundariesMm,
): ReadonlyMap<string, Column> {
  const columns = restoredColumns(records, stored, toMetres(room.widthMm));
  return publishedFunnel(
    columns,
    records,
    room,
    mergeWidthLimitMm,
    plannedBoundaries,
  );
}

/** The one published-face assembly: wall-end clip, merge, then the live full-height answer, which reads the extents
 *  the merge writes (ADR 0053, *The ordering that is unfalsifiable*). */
function publishedFunnel(
  columns: Map<string, ColumnExtent>,
  records: readonly PlacementRecord[],
  room: DesignRoom,
  mergeWidthLimitMm?: number,
  plannedBoundaries?: PlannedBoundariesMm,
): ReadonlyMap<string, Column> {
  return withCurrentFullHeightMembers(
    mergeAdjacentEmptyColumns(
      clipEmptyColumnsAtWallEnd(columns, records, room),
      records,
      mergeWidthLimitMm,
      plannedBoundaries,
    ),
    records,
  );
}

/** Planning map: the frozen extent's vertical and along-wall axes with the records' depth (ADR 0088 decision 1).
 *  `frozen` is at the coordinates the run is arriving at; re-deriving every axis collapses it. */
export function deriveColumnsOverFrozenExtents(
  records: readonly PlacementRecord[],
  frozen: ReadonlyMap<string, ColumnExtent>,
  room: DesignRoom,
): ReadonlyMap<string, Column> {
  const derived = restoredColumns(records, {}, toMetres(room.widthMm));
  const planned = new Map<string, ColumnExtent>(derived);
  for (const [key, extent] of frozen) {
    planned.set(key, atDerivedDepth(extent, derived.get(key)));
  }
  // `clipEmptyColumnsToFreeGround` is deliberately not run: this is planning input and `evaluateInsertFit` refuses an
  // overlap; measured latent, it removed 0 columns across 704 delete-by-depth scenarios.
  return publishedFunnel(planned, records, room);
}

/** The frozen extent carrying the depth its members measure now, or whole when none stand in it (ADR 0088). Overwrite
 *  the depth onto the extent, never the extent over the derived column. */
function atDerivedDepth(
  extent: ColumnExtent,
  derived: ColumnExtent | undefined,
): ColumnExtent {
  if (!derived) return extent;
  // The off-wall origin travels with `d` (it is `d / 2`); the along-wall coordinate stays the extent's.
  const atDepth: MutableColumnExtent = {
    ...extent,
    d: derived.d,
    x: derived.x,
    z: derived.z,
    ...alongWallPosition(extent.wall, alongWallCoordinate(extent.wall, extent)),
  };
  // Deleted rather than set to `undefined`, so the shape matches a column that never had a source.
  if (derived.depthFromBuildId === undefined) delete atDepth.depthFromBuildId;
  else atDepth.depthFromBuildId = derived.depthFromBuildId;
  return atDepth;
}

/** A `ColumnExtent` under construction: `depthFromBuildId` must be removed, which no spread can express. */
type MutableColumnExtent = {
  -readonly [Field in keyof ColumnExtent]: ColumnExtent[Field];
};

/** The map as the document records it: `deriveColumns` minus the wall-end clip (ADR 0090 Amendment B). A projection
 *  into `emptyColumns`/`columnExtents` must use this, or a reversible wall length truncates stored spaces. The merge
 *  limit and the planned boundaries are `deriveColumns`'. */
export function deriveRecordedColumns(
  records: readonly PlacementRecord[],
  stored: FrozenMapDocument = {},
  roomWidthM: number,
  mergeWidthLimitMm?: number,
  plannedBoundaries?: PlannedBoundariesMm,
): ReadonlyMap<string, Column> {
  // A sibling pipeline, not `deriveColumns` with the clip moved: the clip drops and narrows columns, changing the
  // centres, widths and envelope the merge reads, so merging before clipping keys and tops the run differently.
  return withCurrentFullHeightMembers(
    mergeAdjacentEmptyColumns(
      restoredColumns(records, stored, roomWidthM),
      records,
      mergeWidthLimitMm,
      plannedBoundaries,
    ),
    records,
  );
}

/** §3.2's MAX as the winning member, so `Column.d` and `depthFromBuildId` are one answer. Not a bare `>` on floats:
 *  catalogue pairs sit 1.11e-16 m apart (ADR 0079 decision 5). */
function deepestMember(members: readonly PlacementRecord[]): PlacementRecord {
  return members.reduce((winner, member) =>
    winsTheMax(member, winner) ? member : winner,
  );
}

/** The millimetre band §3.2's MAX is decided at: below what `toEmptyColumn` persists, far below `FIT_TOLERANCE_M`
 *  (ADR 0079 decision 5). */
const DECLARED_DEPTH_EPSILON_M = 1e-9;

/** Whether `challenger` takes the MAX from `holder` (ADR 0079 decision 6): deeper at the millimetre, then a depth that
 *  follows the setting, then ascending `buildId`. An entry with no `CabinetDepthRule` throws (ADR 0079 amendment D). */
function winsTheMax(
  challenger: PlacementRecord,
  holder: PlacementRecord,
): boolean {
  const gapM = occupiedDepthM(challenger) - occupiedDepthM(holder);
  if (Math.abs(gapM) > DECLARED_DEPTH_EPSILON_M) return gapM > 0;

  const challengerFollows = followsTheSetting(challenger);
  if (challengerFollows !== followsTheSetting(holder)) return challengerFollows;

  return challenger.buildId < holder.buildId;
}

/** Fails closed on an entry that declares no depth rule; see `winsTheMax`. */
function followsTheSetting(record: PlacementRecord): boolean {
  return depthFollowsSetting(
    cabinetDepthRuleOf({ buildId: record.buildId, rule: record.depthRule }),
  );
}

/** ADR 0044: restores member-less spaces into the map. No tie-break on a key collision, since
 *  `validateDesignForCatalog` refuses colliding entries at both seams. */
function addStoredEmptyColumns(
  columns: Map<string, ColumnExtent>,
  emptyColumns: readonly EmptyColumn[],
  roomWidthM: number,
): void {
  restoreStoredExtents(columns, emptyColumns, roomWidthM);
}

/** ADR 0053: restores frozen extents of occupied columns over derived ones, the one place a stored value overwrites a
 *  derived one; safe by precedence (extent fields only) and containment, proven by `validateDesignForCatalog`. */
function addStoredColumnExtents(
  columns: Map<string, ColumnExtent>,
  columnExtents: readonly StoredColumnExtent[],
  roomWidthM: number,
): void {
  restoreStoredExtents(columns, columnExtents, roomWidthM);
}

/** One entry, one slot, through `toColumnExtent` — the same conversion for both stored arrays,
 *  because a frozen extent is one shape whether or not a body stands in it. */
function restoreStoredExtents(
  columns: Map<string, ColumnExtent>,
  stored: readonly EmptyColumn[],
  roomWidthM: number,
): void {
  for (const entry of stored) {
    const extent = toColumnExtent(entry, roomWidthM);
    columns.set(extent.key, extent);
  }
}

function toColumnExtent(
  emptyColumn: EmptyColumn,
  roomWidthM: number,
): ColumnExtent {
  const alongM = toMetres(emptyColumn.alongMm);
  const depthM = toMetres(emptyColumn.depthMm);
  const y0M = toMetres(emptyColumn.y0Mm);
  const topM = toMetres(emptyColumn.topMm);
  // Through the transform a placement's frame uses, so a restored space stands where a body there would.
  const transform = deriveCabinetWorldTransform({
    wall: emptyColumn.wall,
    alongM,
    y0M,
    depthM,
    roomWidthM,
  });
  const extent: ColumnExtent = {
    key: deriveColumnKeyAt(emptyColumn.wall, alongM),
    wall: emptyColumn.wall,
    ry: transform.yawRadians,
    x: transform.position.x,
    z: transform.position.z,
    w: toMetres(emptyColumn.widthMm),
    d: depthM,
    top: topM,
    // A single interval: §4 reads only a column's floor and top (`deriveFreeSpans`).
    regions: [[y0M, topM]],
  };
  // ADR 0073 decision 1: omitted rather than `undefined` when absent, so older documents load unchanged.
  return emptyColumn.depthFromBuildId === undefined
    ? extent
    : { ...extent, depthFromBuildId: emptyColumn.depthFromBuildId };
}

/** ADR 0044's wire shape: columns with no member in `records`, the exact inverse of `toColumnExtent`. Occupied keys are
 *  skipped here, not left to `validateDesignForCatalog`, because commands do not validate their results. */
export function projectEmptyColumns(
  columns: ReadonlyMap<string, Column>,
  records: readonly PlacementRecord[],
): readonly EmptyColumn[] {
  return projectFrozenMap(columns, records).emptyColumns ?? [];
}

/** ADR 0053's wire shape: the frozen extent of every column that holds a member; `projectEmptyColumns`' complement. */
export function projectColumnExtents(
  columns: ReadonlyMap<string, Column>,
  records: readonly PlacementRecord[],
): readonly StoredColumnExtent[] {
  return projectFrozenMap(columns, records).columnExtents ?? [];
}

/** The whole frozen map as the document carries it, partitioned by `occupiedKeys.has(key)` alone so the halves are
 *  disjoint. Every entry goes through `toEmptyColumn`, so its refusals apply to both halves. */
export function projectFrozenMap(
  columns: ReadonlyMap<string, Column>,
  records: readonly PlacementRecord[],
): FrozenMapDocument {
  const occupiedKeys = new Set(records.map((record) => record.col));
  const emptyColumns: EmptyColumn[] = [];
  const columnExtents: StoredColumnExtent[] = [];
  for (const [key, column] of columns) {
    const entry = toEmptyColumn(key, column);
    if (occupiedKeys.has(key)) columnExtents.push(entry);
    else emptyColumns.push(entry);
  }
  // Sorted so one state has one document: `Map` order follows insertion, which differs by route (ADR 0002).
  return {
    emptyColumns: emptyColumns.sort(compareEmptyColumns),
    columnExtents: columnExtents.sort(compareEmptyColumns),
  };
}

/** ADR 0053: records the frozen map on the design. An empty half is removed rather than set to `[]`, so an untouched
 *  document is not rewritten; this is the one author of that rule, also used by the depth command. */
export function withFrozenMap(
  design: Design,
  frozen: FrozenMapDocument,
): Design {
  const emptyColumns = frozen.emptyColumns ?? [];
  const columnExtents = frozen.columnExtents ?? [];
  const next = { ...design };
  if (emptyColumns.length > 0) next.emptyColumns = [...emptyColumns];
  else delete next.emptyColumns;
  if (columnExtents.length > 0) next.columnExtents = [...columnExtents];
  else delete next.columnExtents;
  return next;
}

function compareEmptyColumns(left: EmptyColumn, right: EmptyColumn): number {
  if (left.wall !== right.wall) return left.wall < right.wall ? -1 : 1;
  return left.alongMm - right.alongMm;
}

function toEmptyColumn(key: string, column: Column): EmptyColumn {
  const alongM = column.wall === "A" ? column.x : column.z;
  const extent: EmptyColumn = {
    wall: column.wall,
    alongMm: exactMillimetresOf("alongMm", alongM, key),
    widthMm: exactMillimetresOf("widthMm", column.w, key),
    // §4 reads only a column's floor and top, so the lowest region start and the top are all a restored column needs.
    y0Mm: exactMillimetresOf("y0Mm", lowestRegionStartM(column, key), key),
    topMm: exactMillimetresOf("topMm", column.top, key),
    depthMm: exactMillimetresOf("depthMm", column.d, key),
  };
  // ADR 0073 decision 1; omitted rather than `undefined`, so an untouched document saves byte-identical.
  const entry: EmptyColumn =
    column.depthFromBuildId === undefined
      ? extent
      : { ...extent, depthFromBuildId: column.depthFromBuildId };
  return refuseUnreproducibleKey(entry, key);
}

/** The whole millimetre a frozen coordinate sits on, or a refusal. Never `Math.round`: rounding 3575.1 to 3575 would
 *  key the entry as its neighbour (`deriveColumnKeyAt` uses `toFixed(2)`) and collapse two columns on reload. */
function exactMillimetresOf(
  field: string,
  valueM: number,
  key: string,
): number {
  const millimetres = toExactMillimetres(valueM);
  if (millimetres === undefined) {
    throw new UnprojectableColumnError(
      key,
      `${field} is ${String(valueM)} m, which is not a whole millimetre`,
    );
  }
  return millimetres;
}

function lowestRegionStartM(column: Column, key: string): number {
  const starts = column.regions.map(([start]) => start);
  if (starts.length === 0) {
    throw new UnprojectableColumnError(
      key,
      "it has no regions, so it has no floor to record",
    );
  }
  return Math.min(...starts);
}

/** An entry must key back to its own slot (`toFixed(2)` can differ by an ulp at a half-centimetre); refused, not
 *  repaired, since the recomputed key would move the space from where the customer left it. */
function refuseUnreproducibleKey(entry: EmptyColumn, key: string): EmptyColumn {
  const restoredKey = deriveColumnKeyAt(entry.wall, toMetres(entry.alongMm));
  if (restoredKey !== key) {
    throw new UnprojectableColumnError(
      key,
      `it would be restored under key ${restoredKey}`,
    );
  }
  return entry;
}

/** A frozen column the document cannot carry; thrown rather than dropped, as a silent omission is ADR 0044's defect.
 *  Defence in depth only: `refuseFractionalCentres` guards just the resize path and just two centres. */
export class UnprojectableColumnError extends Error {
  constructor(key: string, reason: string) {
    super(`Column ${key} cannot be recorded as an empty column: ${reason}`);
    this.name = "UnprojectableColumnError";
  }
}

/** The keys whose set of member ids differs between two record sets; membership rather than geometry, so a re-split
 *  is the same question as a move. */
function findTouchedColumnKeys(
  recordsBefore: readonly PlacementRecord[],
  recordsAfter: readonly PlacementRecord[],
): Set<string> {
  const before = groupByColumn(recordsBefore);
  const after = groupByColumn(recordsAfter);
  const touched = new Set<string>();
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    if (!haveSameMembers(before.get(key) ?? [], after.get(key) ?? [])) {
      touched.add(key);
    }
  }
  return touched;
}

function haveSameMembers(
  left: readonly PlacementRecord[],
  right: readonly PlacementRecord[],
): boolean {
  if (left.length !== right.length) return false;
  const ids = new Set(left.map((record) => record.id));
  return right.every((record) => ids.has(record.id));
}

/** Re-derives only the columns whose membership the operation touched, leaving every other key frozen. Resize only:
 *  after a delete the touched key is the cleared run and would be dropped, losing the opening it just freed; see ADR
 *  0011 Gap D. */
export function rederiveTouchedColumns(
  columns: ReadonlyMap<string, Column>,
  recordsBefore: readonly PlacementRecord[],
  recordsAfter: readonly PlacementRecord[],
  room: DesignRoom,
): ReadonlyMap<string, Column> {
  const touched = findTouchedColumnKeys(recordsBefore, recordsAfter);
  const rederived = deriveColumns(recordsAfter, {}, room);
  const updated = new Map<string, ColumnExtent>(columns);
  for (const key of touched) {
    const column = rederived.get(key);
    if (column) updated.set(key, column);
    else updated.delete(key);
  }
  return withCurrentFullHeightMembers(updated, recordsAfter);
}

/** Re-answers `hasFullHeightUnder` over frozen extents and changes nothing else (ADR 0011 Gap D). It is not a load-time
 *  fact, so every caller that re-derives records after a mutation must call this. */
export function withCurrentFullHeightMembers(
  columns: ReadonlyMap<string, ColumnExtent>,
  records: readonly PlacementRecord[],
): ReadonlyMap<string, Column> {
  const answered = new Map<string, Column>();
  for (const [key, column] of columns) {
    answered.set(key, {
      ...column,
      hasFullHeightUnder: records.some((record) =>
        isFullHeightUnder(record, column),
      ),
    });
  }
  return answered;
}

/** §7's cap is lifted only by a same-wall full-height (`column` band) member overlapping the column. Known gap: a
 *  wall-A tall run never lifts a wall-B corner column (both walls originate at 0,0,0); harmless while those are 330
 *  mm deep, reachable beyond 400 mm. */
function isFullHeightUnder(
  record: PlacementRecord,
  column: ColumnExtent,
): boolean {
  return (
    record.band === "column" &&
    record.wall === column.wall &&
    overlapsAlongWall(record, column)
  );
}

/** Overhanging, not merely adjoining, or every cabinet beside a column would be uncapped. Exported for the re-plan,
 *  which asks the same question of another pair (ADR 0103 decision 3). */
export function overlapsAlongWall(
  record: PlacementRecord,
  column: ColumnExtent,
): boolean {
  // `alongWallCoordinate` is a centre, so each span is centre ± half its width; reading it as a start makes neighbours
  // overlap.
  const recordCentre = alongWallCoordinate(record.wall, record.frame);
  const columnCentre = alongWallCoordinate(column.wall, column);
  const overlap =
    Math.min(recordCentre + record.frame.w / 2, columnCentre + column.w / 2) -
    Math.max(recordCentre - record.frame.w / 2, columnCentre - column.w / 2);
  return overlap > SPAN_EPSILON_M;
}

interface FreeSpan {
  readonly lo: number;
  readonly hi: number;
}

/** Float noise from the mm to m round trip: far below any boundary test, far above a subtraction's ~1e-16 error. */
const SPAN_EPSILON_M = 1e-9;

/** §4: a free interval is an opening only when it exceeds `MIN_SPAN_M`, so exactly 300 mm is not one. The epsilon
 *  keeps that true wherever the gap came from (`0.86 - 0.56` vs `2.2 - 1.9` differ by noise); callers ask here. */
function isOpeningSpan(heightM: number): boolean {
  return heightM > MIN_SPAN_M + SPAN_EPSILON_M;
}

function deriveFreeSpans(
  column: Column,
  taken: readonly [number, number][],
): FreeSpan[] {
  const floor = Math.min(...column.regions.map(([start]) => start));
  const free: FreeSpan[] = [];
  let y = floor;
  for (const [lo, hi] of [...taken].sort((a, b) => a[0] - b[0])) {
    if (isOpeningSpan(lo - y)) free.push({ lo: y, hi: lo });
    y = Math.max(y, hi);
  }
  if (isOpeningSpan(column.top - y)) free.push({ lo: y, hi: column.top });
  return free;
}

interface LevelSlice {
  readonly start: number;
  readonly end: number;
  readonly levelStart: number;
}

function sliceLevels(span: FreeSpan): LevelSlice[] {
  return LEVELS.map(([levelStart, levelEnd]) => ({
    start: Math.max(span.lo, levelStart),
    end: Math.min(span.hi, levelEnd),
    levelStart,
  })).filter((slice) => isOpeningSpan(slice.end - slice.start));
}

/** §4 rule 4: a free span that starts mid-level (not at that level's own boundary) stays one
 *  opening instead of being cut by the level lines it happens to straddle. */
function collapseMidLevelStart(slices: readonly LevelSlice[]): LevelSlice[] {
  const first = slices[0];
  if (!first) return [];
  const startsMidLevel = first.start > first.levelStart + LEVEL_SNAP_M;
  if (slices.length > 1 && startsMidLevel) {
    const last = slices[slices.length - 1];
    if (!last) return [];
    return [
      { start: first.start, end: last.end, levelStart: first.levelStart },
    ];
  }
  return [...slices];
}

function subdivideFreeSpan(
  column: Column,
  span: FreeSpan,
  columnKey: string,
): VoidRecord[] {
  const slices = collapseMidLevelStart(sliceLevels(span));
  return slices.map((slice, index) => ({
    id: `${columnKey}:v${String(index)}:${slice.start.toFixed(2)}`,
    col: column.key,
    wall: column.wall,
    x: column.x,
    z: column.z,
    ry: column.ry,
    w: column.w,
    d: column.d,
    y0: slice.start,
    h: slice.end - slice.start,
    spanY0: span.lo,
    spanH: span.hi - span.lo,
  }));
}

/** §4: free vertical space per column, subdivided by `LEVELS`; pure. No horizontal half: a body narrower than its
 *  column splits it first (`commands/split-column.ts`, ADR 0046 part 1), so every void belongs to a column. */
export function recomputeVoids(
  records: readonly PlacementRecord[],
  columns: ReadonlyMap<string, Column>,
): VoidRecord[] {
  const membersByColumn = groupByColumn(records);
  const voids: VoidRecord[] = [];
  for (const column of columns.values()) {
    // A column narrower than any cabinet still publishes its opening.
    const taken = (membersByColumn.get(column.key) ?? []).map(
      (member): [number, number] => [
        member.frame.y0,
        member.frame.y0 + member.frame.h,
      ],
    );
    for (const span of deriveFreeSpans(column, taken)) {
      voids.push(...subdivideFreeSpan(column, span, column.key));
    }
  }
  return voids;
}
