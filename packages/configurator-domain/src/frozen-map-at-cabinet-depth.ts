// The whole frozen map at a new cabinet depth, in one place (ADR 0090 decision 5). The depth answer
// needs the pre-command records keyed at the coordinates a sliding run is arriving at, which only
// `setCabinetDepth` holds; moving the position axis here and leaving depth in the store would put two
// authors on one map (ADR 0088 decision 2).
//
// The map is published on `CabinetDepthSetEffect.columns`, and `setCabinetDepth` projects its own
// `emptyColumns`/`columnExtents` from it.
import {
  alongWallExtentPositionAtMm,
  type AlongWallExtentPositionQuery,
} from "./along-wall-chain-shift.js";
import { columnBuildDepthM } from "./cabinet-depth-rule.js";
import { clipEmptyColumnsToFreeGround } from "./clip-empty-columns-to-free-ground.js";
import type { DesignRoom } from "./design.js";
import { toMetres } from "./millimetres.js";
import { alongWallPosition, deriveColumnKeyAt } from "./module-grid.js";
import {
  deriveCabinetWorldTransform,
  getWallTransform,
} from "./room-transforms.js";
import {
  occupiedDepthOfEntryM,
  type CatalogEntryDepthQuery,
} from "./occupied-depth.js";
import {
  deriveColumns,
  type BodyCatalog,
  type Column,
  type PlacementRecord,
} from "./void-engine.js";

/** Everything the answer depends on. All three record sets share one key space: `frozen` is the map
 *  as loaded, `records` is what stands after the command, and `previousRecords` is what stood before
 *  it, re-keyed at the new coordinates. */
export interface FrozenMapAtCabinetDepthInput {
  /** The frozen map as the pre-command document records it (ADR 0011 Gap D), at the coordinates and
   *  depths the design was holding. */
  readonly frozen: ReadonlyMap<string, Column>;
  /** The records the command just wrote — the new depth and the new along-wall coordinates. */
  readonly records: readonly PlacementRecord[];
  /**
   * The same bodies as they stood before the command, re-keyed at the coordinates they are arriving
   * at: they are looked up by column key beside two maps built at the new coordinates, so at the old
   * ones they would answer for no column.
   *
   * They answer what a post-command map cannot: whether a frozen depth was fully explained by its
   * members, or is a surplus a delete left behind. The two look identical from the current members.
   */
  readonly previousRecords: readonly PlacementRecord[];
  /** How far each column's members moved along their wall, keyed by the column's pre-command key:
   *  rung 2 of `alongWallExtentPositionAtMm`'s ladder, the one exact rung. Built by
   *  `alongWallShiftByColumnMm`; a column with no entry holds no member. */
  readonly membersShiftMmByColumn: ReadonlyMap<string, number>;
  readonly room: DesignRoom;
  /** The catalogue at the depth the command wrote: a frozen extent is re-answered by asking the body
   *  it recorded for its declared `occupiedDepth` in this map (ADR 0073 decision 2). */
  readonly catalog: BodyCatalog;
  /** The design's declared cabinet depth after the command, for the `columnBuildDepthM` fallback on
   *  an extent whose source is absent or unknown (ADR 0073 decision 3). */
  readonly cabinetDepthMm: number;
  /** The setting before this command: it separates an unsourced depth the fallback published one
   *  setting ago from one no rule could have produced (ADR 0080 decision 4). */
  readonly previousCabinetDepthMm: number;
}

/** The frozen map the depth change publishes: every extent slid onto the chain the body it recorded
 *  declares, every depth re-answered at the new setting, and no member-less column left on ground a
 *  placement occupies. The slide runs first because the depth rules look up by column key and the
 *  clip compares along-wall intervals. */
export function frozenMapAtCabinetDepth(
  input: FrozenMapAtCabinetDepthInput,
): ReadonlyMap<string, Column> {
  return clipEmptyColumnsToFreeGround(
    atCurrentCabinetDepth(frozenExtentsSlidAlongTheWall(input), input),
    input.records,
  );
}

/** The operands the slide reads. Narrower than `FrozenMapAtCabinetDepthInput` because the planning
 *  map is built before the rebuild and has no post-command records; the wider input satisfies it
 *  structurally. */
export interface FrozenExtentsSlideQuery {
  readonly frozen: ReadonlyMap<string, Column>;
  readonly catalog: BodyCatalog;
  readonly cabinetDepthMm: number;
  readonly previousCabinetDepthMm: number;
  readonly membersShiftMmByColumn: ReadonlyMap<string, number>;
  /** Which walls take a corner depends on the room's shape (`cornerTakingWallsOf`): a U's wall C
   *  slides on its own corner as wall B does on the left one. */
  readonly room: DesignRoom;
}

/** ADR 0090 decisions 1 and 2: every positioned fact in the map moves onto the chain the body it
 *  recorded declares.
 *
 *  One ladder for `emptyColumns` and `columnExtents` alike: an occupied extent moves by the delta its
 *  own members moved, a member-less one by the chain its recorded source declares, and one with
 *  neither by the chain `FOLLOWS_CABINET_DEPTH` declares. Only the along-wall coordinate and the key
 *  move; width, floor, top, regions and depth are carried untouched (ADR 0090 decision 6).
 *
 *  Exported because the planning map must take the extents as they are moved here; restoring them at
 *  the coordinates the run is leaving would misplan inside `evaluateInsertFit`. */
export function frozenExtentsSlidAlongTheWall(
  input: FrozenExtentsSlideQuery,
): ReadonlyMap<string, Column> {
  const slid = new Map<string, Column>();
  for (const column of input.frozen.values()) {
    const moved = atAlongWallPosition(column, alongWallQueryFor(column, input));
    slid.set(moved.key, moved);
  }
  return slid;
}

function alongWallQueryFor(
  extent: Column,
  input: FrozenExtentsSlideQuery,
): AlongWallExtentPositionQuery {
  return {
    extent,
    catalog: input.catalog,
    fromCabinetDepthMm: input.previousCabinetDepthMm,
    toCabinetDepthMm: input.cabinetDepthMm,
    membersShiftMm: input.membersShiftMmByColumn.get(extent.key),
    shape: input.room.shape,
  };
}

/** One column at its new along-wall coordinate, or itself when the chain declines to move it. The
 *  off-wall coordinate stays put; the split goes through `alongWallPosition`, as `toClippedExtent`'s
 *  does, so §2's wall convention has one author. */
function atAlongWallPosition(
  column: Column,
  query: AlongWallExtentPositionQuery,
): Column {
  const alongMm = alongWallExtentPositionAtMm(query);
  if (alongMm === undefined) return column;
  const alongM = toMetres(alongMm);
  const key = deriveColumnKeyAt(column.wall, alongM);
  if (key === column.key) return column;
  return { ...column, key, ...alongWallPosition(column.wall, alongM) };
}

/** Re-answers every extent's depth at the new setting. Depth is the one axis a frozen extent may not
 *  be carried across this command: §3.2's depth is a pure function of the members, and a depth change
 *  rebuilds all of them.
 *
 *  The sibling `deriveColumnsOverFrozenExtents` is a different author on purpose: the planning map's
 *  depth is §3.2's MAX over what stands there now, while this published map keeps a surplus a delete
 *  left behind (ADR 0088 decision 3; ADR 0073, 0079, 0080).
 *
 *  Each extent is split into what its members explain and what a delete left behind. Asked at the old
 *  depth: if the members explained the frozen depth, nothing was deleted and what they measure at the
 *  new setting wins, in both directions. Otherwise the surplus (the 620 mm opening a base cabinet
 *  left under a wall run) is re-asked of the body that supplied it (`frozenDepthAtThisSetting`). A
 *  rule with no direction ("deeper only") picks the wrong one on every decrease.
 *
 *  A depth and its source are published together, never a depth alone (ADR 0079 decision 1): carrying
 *  the old `depthFromBuildId` beside a new depth records a false source, and the record answers once
 *  the winner is deleted. */
function atCurrentCabinetDepth(
  slid: ReadonlyMap<string, Column>,
  input: FrozenMapAtCabinetDepthInput,
): ReadonlyMap<string, Column> {
  const roomWidthM = toMetres(input.room.widthMm);
  // No stored half: these maps are read only for the depth their members imply, and restoring the
  // frozen entries would answer with the very numbers being re-measured.
  const atNewDepth = deriveColumns(input.records, {}, input.room);
  const atOldDepth = deriveColumns(input.previousRecords, {}, input.room);
  // The records' columns with the frozen extents restored over them (ADR 0044, ADR 0053): an extent
  // the ladder declines to move is no longer its column's extent once members slid away, and a map
  // built from the frozen keys alone would file those members under no column. Normally the base
  // contributes nothing, since every occupied key lands on its members' new key by rung 2.
  const republished = new Map([...atNewDepth, ...slid]);
  for (const [key, column] of slid) {
    const published = republishedDepth({
      frozen: frozenDepthAtThisSetting({ column, input }),
      measured: atNewDepth.get(key),
      explains: explainsTheFrozenDepth(column, atOldDepth.get(key)),
    });
    // Compare both halves: a different member can win §3.2's MAX at the same number, and skipping on
    // depth alone would leave the old source beside it.
    if (
      published.d === column.d &&
      published.depthFromBuildId === column.depthFromBuildId
    ) {
      continue;
    }
    republished.set(key, atDepthM(column, published, roomWidthM));
  }
  return republished;
}

/** A depth and the body whose declaration produced it, or a depth with no body claimed for it
 *  (ADR 0079 decisions 1 and 3). Every writer of `Column.d` here hands one over, so publishing a
 *  depth without its source does not compile. Keyed `d` so a `Column` already is one:
 *  `republishedDepth` returns an operand and cannot pair one operand's depth with the other's source. */
interface PublishedDepth {
  readonly d: number;
  /** Absent means ADR 0073 decision 3's fallback owns this depth: `columnBuildDepthM` is a declared
   *  size, not a body's declaration, so no body is claimed for it. */
  readonly depthFromBuildId?: string | undefined;
}

/** The three answers one column's depth can have after the change. */
interface RepublishedDepthQuery {
  /** The frozen depth, re-asked at the new setting, with the body that answered it (ADR 0073). */
  readonly frozen: PublishedDepth;
  /** §3.2's MAX over the members standing here now, or nothing if none are; carries its own source. */
  readonly measured: Column | undefined;
  /** Whether those members already explained the frozen depth at the old setting. */
  readonly explains: boolean;
}

/** Which rule a column gets; the winning operand supplies both depth and source (ADR 0079 decision 2).
 *
 *  - Fully explained by its members: what they measure now wins in both directions, source included,
 *    because at a new setting a different member can win the MAX.
 *  - Carrying a surplus: the deeper of the two, never shallower than either (ADR 0011 Gap D's freed
 *    opening). Within `FROZEN_SURPLUS_EPSILON_M` the measured operand wins.
 *  - Member-less: the frozen answer whole, with no source when decision 3's fallback produced it. */
function republishedDepth(query: RepublishedDepthQuery): PublishedDepth {
  const { measured } = query;
  if (measured === undefined) return query.frozen;
  if (query.explains) return measured;
  return query.frozen.d - measured.d > FROZEN_SURPLUS_EPSILON_M
    ? query.frozen
    : measured;
}

/** Whether the members standing here explain the whole frozen depth, asked at the old depth. */
function explainsTheFrozenDepth(
  column: Column,
  explained: Column | undefined,
): boolean {
  if (explained === undefined) return false;
  return column.d - explained.d <= FROZEN_SURPLUS_EPSILON_M;
}

interface FrozenDepthQuery {
  readonly column: Column;
  readonly input: FrozenMapAtCabinetDepthInput;
}

/** The frozen depth re-asked at the new setting (ADR 0073), with no arithmetic of this module's own.
 *
 *  - Recorded body (decision 2): the entry's own `occupiedDepth` declaration, read off the catalogue
 *    built at the new depth. Exceptions follow without being named: a `manufactured-size` machine and
 *    the pinned tops declare `finishesAtMm`, which is not a function of the setting.
 *  - No source, or one the catalogue no longer holds (decision 3 as ADR 0080 decision 4 amends it):
 *    `columnBuildDepthM`, deciding by "was this depth ever more than this rule could have produced",
 *    never "is it deeper than the new answer", which is the ratchet. A depth the fallback itself
 *    published follows the setting both ways and carries no source. A depth above what it could have
 *    produced at the setting being left is a surplus kept deeper-only with the column's own source;
 *    `columnBuildDepthM` is a build ceiling and cannot express a base run's 620/720.
 *
 *  Residual, re-scoped not fixed (ADR 0080 decision 5): a cleared base column frozen at 620 with no
 *  source stays 620 at both settings. It reaches no built body and self-corrects on the next insert;
 *  its coordinate still slides (ADR 0090 Amendment A).
 *
 *  A document already in the fallback arm stays in it: that arm publishes no source and
 *  `projectFrozenMap` writes that back, so a descendant is never worse off than its ancestor. */
function frozenDepthAtThisSetting(query: FrozenDepthQuery): PublishedDepth {
  const recorded = recordedSourceEntry(query);
  if (recorded) {
    return {
      d: occupiedDepthOfEntryM(recorded),
      depthFromBuildId: recorded.buildId,
    };
  }
  // Asked once and used for both ceilings, so the two operands are one answer about one column
  // (ADR 0080 decision 4). The predicate may flip between freeze and now, and that can only make this
  // rule keep more, because the test below is an equality (ADR 0080 amendment C):
  //   true -> false : a 600 published under the lifted arm meets a 330 `atFreezeM`, reads as a
  //                   surplus, and is kept.
  //   false -> true : a 400 published under the capped arm meets a 600 `atFreezeM`, reads as a
  //                   surplus, and the MAX deepens it to `declaredM`.
  const { hasFullHeightUnder } = query.column;
  const declaredM = columnBuildDepthM({
    cabinetDepthMm: query.input.cabinetDepthMm,
    hasFullHeightUnder,
  });
  const atFreezeM = columnBuildDepthM({
    cabinetDepthMm: query.input.previousCabinetDepthMm,
    hasFullHeightUnder,
  });

  // A depth this rule itself could have published is not information (ADR 0080 decision 4): it
  // follows the setting and carries no source, including dropping an id the column was carrying.
  // An equality, not a bound (ADR 0080 amendments B, C): the rule publishes `columnBuildDepthM`
  // exactly or a surplus strictly above it, and `d - atFreezeM <= ε` would also swallow a legacy 620
  // below a raised ceiling. It reads two fields of one document, never session history. The float
  // band is `FROZEN_SURPLUS_EPSILON_M`; no whole millimetre lies strictly inside it.
  if (Math.abs(query.column.d - atFreezeM) <= FROZEN_SURPLUS_EPSILON_M) {
    return { d: declaredM };
  }

  // Otherwise a surplus no rule can re-answer: deeper-only, written as a choice between two producers
  // rather than `Math.max` because a source survives exactly when the depth it explains survives
  // (ADR 0079 decision 2), including one the catalogue no longer holds.
  return query.column.d > declaredM
    ? { d: query.column.d, depthFromBuildId: query.column.depthFromBuildId }
    : { d: declaredM };
}

/** The catalogue row this extent's depth came from, or nothing. An absent `depthFromBuildId` and one
 *  the map does not hold are the same answer here and neither is an error (ADR 0073 decision 7). */
function recordedSourceEntry(
  query: FrozenDepthQuery,
): CatalogEntryDepthQuery | undefined {
  const buildId = query.column.depthFromBuildId;
  if (buildId === undefined) return undefined;
  const definition = query.input.catalog.get(buildId);
  return definition ? { buildId, definition } : undefined;
}

/** Float slack on the comparisons that pick a column's rule, not manufacturing slack. Used by
 *  `explainsTheFrozenDepth` and by `frozenDepthAtThisSetting`'s ratchet equality, so editing it moves
 *  two rules; `qa-6k-j-fallback-rule.adversarial.test.ts` pins the second. Nine orders of magnitude
 *  below `FIT_TOLERANCE_M`: a fit tolerance used where a float epsilon belongs is ADR 0015's
 *  finding. */
const FROZEN_SURPLUS_EPSILON_M = 1e-9;

/** One column at a published depth with its along-wall position untouched. The origin is the
 *  column's own half-depth on the wall's normal, so both move together. It is recomputed through the
 *  domain's transform rather than by naming an axis here (§2's wall convention has one author), and
 *  the along-wall coordinate is projected back out with the wall's tangent so a widened extent does
 *  not snap to its members' centre.
 *
 *  Takes a `PublishedDepth`, not a bare number (ADR 0079 decision 3): this is the one seam that has
 *  written a `Column.d` without its source. */
function atDepthM(
  column: Column,
  published: PublishedDepth,
  roomWidthM: number,
): Column {
  const wall = getWallTransform(column.wall, roomWidthM);
  const alongM = wall.tangent.x * column.x + wall.tangent.z * column.z;
  const { position } = deriveCabinetWorldTransform({
    wall: column.wall,
    alongM,
    y0M: columnFloorM(column),
    depthM: published.d,
    roomWidthM,
  });
  const moved: MutableColumn = {
    ...column,
    d: published.d,
    x: position.x,
    z: position.z,
  };
  // Deleted rather than set to `undefined`, so an unsourced column is shaped like one that never had
  // a source; `JSON.stringify` and an `in` check disagree about `undefined`.
  if (published.depthFromBuildId === undefined) delete moved.depthFromBuildId;
  else moved.depthFromBuildId = published.depthFromBuildId;
  return moved;
}

/** The column's own floor, which the transform validates as non-negative. `0` for a column with no
 *  region keeps this total instead of handing the transform an empty `Math.min`'s infinity. */
function columnFloorM(column: Column): number {
  const floorsM = column.regions.map(([floorM]) => floorM);
  return floorsM.length > 0 ? Math.min(...floorsM) : 0;
}

/** A `Column` under construction: its fields are `readonly`, and one has to be removed rather than
 *  overwritten, which no spread can express. */
type MutableColumn = { -readonly [Field in keyof Column]: Column[Field] };
