// Where a wall-B body stands along its wall once the corner beside it got deeper: the reader of the
// `alongWallPositionFollows` chain that `cabinet-depth-rule.ts` declares per catalogue entry.
//
// Both walls walk from the same corner at the origin (`room-transforms.ts`), so a wall-A body's depth is
// measured along wall B. Wall A is anchored at the corner, so a deeper corner body takes its space out of
// wall B and every wall-B body slides by exactly what the corner gained.
//
// Two chains, not one delta: the base run's carcass moves 560 → 660 while the wall band's carcass seat
// moves 291 → 361, so a uniform shift is wrong for one of them by 30 mm (see ADR 0089). The 30 mm left in
// wall B's top row at 700 is the product's answer, not a defect to smooth away. This module sizes nothing:
// a generated corner's width belongs to `corner-assembly-size.ts`.
//
// Both reaches are read from `catalog.ts`'s depth formulas, so a chain and the body it is measured
// against cannot drift apart.
import {
  cabinetDepthRuleOf,
  FOLLOWS_CABINET_DEPTH,
  type AlongWallDepthChain,
} from "./cabinet-depth-rule.js";
import { baseCarcassDepthMm, wallCarcassSeatDepthMm } from "./catalog.js";
import type { DesignPlacement, DesignRoomShape } from "./design.js";
import { toExactMillimetres } from "./millimetres.js";
import { alongWallCoordinate } from "./module-grid.js";
import type { WallId } from "./room-transforms.js";
import type {
  BodyCatalog,
  ColumnExtent,
  PlacementRecord,
} from "./void-engine.js";

/** Which walls a corner's own depth increase eats into, per shape: an L's one corner takes wall B's run;
 *  a U's left corner takes wall B's and its right corner wall C's (wall C is its own world wall, see
 *  ADR 0132 decision 1); a straight room takes nothing. Every reader outside this module goes through
 *  this function and holds no bare wall letter: a wall-C piece must not read as owning the corner the
 *  way wall A does, nor get no depth-change reserve (`ownsTheCorner` in `corner-assembly-size.ts`,
 *  `slideReserveMm` in `generation/shell-design.ts`). */
export function cornerTakingWallsOf(
  shape: DesignRoomShape,
): ReadonlySet<WallId> {
  switch (shape) {
    case "L":
      return CORNER_TAKING_WALLS_L;
    case "U":
      return CORNER_TAKING_WALLS_U;
    case "linear":
      return CORNER_TAKING_WALLS_NONE;
  }
}

/** The wall whose run the corner is taken out of, on an L: wall A is anchored at the corner and wall B
 *  begins past it. The private source of `cornerTakingWallsOf("L")`, so the letter is named in one place. */
const WALL_THE_CORNER_IS_TAKEN_FROM: WallId = "B";

const CORNER_TAKING_WALLS_L: ReadonlySet<WallId> = new Set([
  WALL_THE_CORNER_IS_TAKEN_FROM,
]);
const CORNER_TAKING_WALLS_U: ReadonlySet<WallId> = new Set([
  WALL_THE_CORNER_IS_TAKEN_FROM,
  "C",
]);
const CORNER_TAKING_WALLS_NONE: ReadonlySet<WallId> = new Set();

/** Which chain's corner reach to measure, at which setting. */
export interface CornerReachQuery {
  readonly cabinetDepthMm: number;
  readonly chain: AlongWallDepthChain;
}

/** How far wall A's corner body reaches into wall B's along-wall coordinate, on this chain.
 *
 *  - `base-formula`: the base run's carcass, `baseCarcassDepthMm` (560 at 600, 660 at 700). Read through the
 *    formula, not off `base-corner-x-900`'s own `frameDepthMm`, so no catalogue row is named and a fixture
 *    rename cannot silently zero the shift.
 *  - `wall-map`: the wall band's carcass seat, `wallCarcassSeatDepthMm` (291, 361). It goes through §7's
 *    head-clearance map first, so its delta is 70, not the setting's 100.
 *
 *  No third arm and no default: a fourth chain is a compile error here, not a silent `base-formula`. */
export function cornerReachAlongWallMm(query: CornerReachQuery): number {
  switch (query.chain) {
    case "base-formula":
      return baseCarcassDepthMm(query.cabinetDepthMm);
    case "wall-map":
      return wallCarcassSeatDepthMm(query.cabinetDepthMm);
  }
}

/** A move between two settings, on one chain. */
export interface AlongWallShiftQuery {
  readonly fromCabinetDepthMm: number;
  readonly toCabinetDepthMm: number;
  readonly chain: AlongWallDepthChain;
}

/** What the corner gained, which is what wall B gives up: a difference of two reaches, so it is zero when
 *  the setting does not change and `from → to → from` restores the coordinate exactly. */
export function alongWallShiftMm(query: AlongWallShiftQuery): number {
  return (
    cornerReachAlongWallMm({
      cabinetDepthMm: query.toCabinetDepthMm,
      chain: query.chain,
    }) -
    cornerReachAlongWallMm({
      cabinetDepthMm: query.fromCabinetDepthMm,
      chain: query.chain,
    })
  );
}

/** One placement, the catalogue that declares its chain, and the move being made. */
export interface AlongWallPositionQuery {
  readonly placement: DesignPlacement;
  readonly catalog: BodyCatalog;
  readonly fromCabinetDepthMm: number;
  readonly toCabinetDepthMm: number;
  /** Which walls take a corner on this room: `cornerTakingWallsOf`'s answer for the design's shape. */
  readonly shape: DesignRoomShape;
}

/** Where this placement stands along its wall at the new setting. Total on every placement: a wall-A body
 *  keeps its coordinate (wall A is anchored at the corner), and a body whose entry left the catalogue
 *  keeps its own rather than being guessed at.
 *
 *  Asked of every body on a corner-taking wall, not only those whose depth follows the setting
 *  (`depthFollowsSetting` says whether a body is rebuilt, this says where it stands): a freestanding
 *  fridge keeps its depth but still slides, because the corner in front of it took more wall. On a U this
 *  is wall B's bodies for the left corner and wall C's for the right (`cornerTakingWallsOf`). */
export function alongWallPositionAtMm(query: AlongWallPositionQuery): number {
  const { placement } = query;
  if (!cornerTakingWallsOf(query.shape).has(placement.wall))
    return placement.alongMm;
  const definition = query.catalog.get(placement.body.buildId);
  if (!definition) return placement.alongMm;
  return (
    placement.alongMm +
    alongWallShiftMm({
      fromCabinetDepthMm: query.fromCabinetDepthMm,
      toCabinetDepthMm: query.toCabinetDepthMm,
      chain: cabinetDepthRuleOf({
        buildId: placement.body.buildId,
        rule: definition.depthRule,
      }).alongWallPositionFollows,
    })
  );
}

/** How far each column's members moved along their wall, by the key the column had before the move: the
 *  operand of rung 2 below. `before` and `after` are two derivations of the same placements, paired by id.
 *  A column with no member has no entry, and neither has one whose members disagree: the ladder then
 *  falls to rung 3 rather than guess. That is unreachable on the shipped catalogue, where every column is
 *  chain-homogeneous (`docs/BACKLOG.md` 51: nothing enforces it on an arbitrary document). Millimetres,
 *  for `alongWallExtentPositionAtMm`'s reason. */
export function alongWallShiftByColumnMm(
  before: readonly PlacementRecord[],
  after: readonly PlacementRecord[],
): ReadonlyMap<string, number> {
  const arrivedAt = new Map(after.map((record) => [record.id, record]));
  const shiftsByColumn = new Map<string, Set<number>>();
  for (const record of before) {
    const moved = arrivedAt.get(record.id);
    if (!moved) continue;
    const shiftMm = alongWallShiftBetween(record, moved);
    if (shiftMm === undefined) continue;
    const seen = shiftsByColumn.get(record.col) ?? new Set<number>();
    seen.add(shiftMm);
    shiftsByColumn.set(record.col, seen);
  }
  const agreed = new Map<string, number>();
  for (const [key, shifts] of shiftsByColumn) {
    const [only] = [...shifts];
    if (shifts.size === 1 && only !== undefined) agreed.set(key, only);
  }
  return agreed;
}

/** One body's own move along its wall, or nothing when either coordinate is off the millimetre grid (no
 *  document can carry one); rung 2 needs an operand that is exact or absent. */
function alongWallShiftBetween(
  before: PlacementRecord,
  after: PlacementRecord,
): number | undefined {
  const fromMm = toExactMillimetres(
    alongWallCoordinate(before.wall, before.frame),
  );
  const toMm = toExactMillimetres(alongWallCoordinate(after.wall, after.frame));
  if (fromMm === undefined || toMm === undefined) return undefined;
  return toMm - fromMm;
}

/** One frozen extent, the catalogue that holds the body it recorded, and the move being made. */
export interface AlongWallExtentPositionQuery {
  readonly extent: ColumnExtent;
  readonly catalog: BodyCatalog;
  readonly fromCabinetDepthMm: number;
  readonly toCabinetDepthMm: number;
  /** How far this column's own members moved, or `undefined` when it holds none (rung 2 below;
   *  `alongWallShiftByColumnMm` answers it). Required, not optional, so a caller holding the records
   *  cannot silently skip the one exact rung and land on a declaration. */
  readonly membersShiftMm: number | undefined;
  /** Which walls take a corner on this room: `cornerTakingWallsOf`'s answer for the design's shape. */
  readonly shape: DesignRoomShape;
}

/** Where this frozen extent stands along its wall at the new setting, the sibling of `alongWallPositionAtMm`:
 *  `Design.emptyColumns` and `Design.columnExtents` record where a column stands, so a slide must carry them
 *  or the document contradicts its own placements. see ADR 0090 decision 2
 *
 *  An information ladder; every rung is a positive answer, because standing still on a run that has moved
 *  is not abstention but the worst guess (wrong by the full 100 mm):
 *  1. A wall no corner is taken from: unchanged. Wall B or C moves only when its own corner deepened.
 *  2. The column holds a member: the delta its members moved (`membersShiftMm`), exact and chain-free. This
 *     is what makes rung 4 safe: a rigid default would move the legacy `wall-map` corner extent `B|615` by
 *     +100 while its members move +70.
 *  3. Member-less, with a recorded source: that source's declared chain (`depthFromBuildId` is the member
 *     that won §3.2's MAX, so its chain is the column's).
 *  4. Member-less and sourceless: the chain `FOLLOWS_CABINET_DEPTH` declares, read from that constant so the
 *     fallback and the catalogue default cannot part. It is the only reachable answer: every `wall-map`
 *     entry is a `STRUCTURAL_CORNER` (`NOT_DELETABLE`, in no insertable row), so a `wall-map` column never
 *     becomes member-less.
 *
 *  No rung infers a chain from a band: `wall-2door-600-deep-top` and `wall-corner-return-570-top` are both
 *  `top` and declare chains 30 mm apart at 700. Declines (`undefined`) only for a coordinate off the whole
 *  millimetre, as `clipEmptyColumnsAtWallEnd` does. Millimetres, not metres: `0.615 + 0.07` keys to `B|0.54`
 *  on the way back down where `615 + 70` keys to `B|0.55`, and a map keyed differently from its records is
 *  the defect. */
export function alongWallExtentPositionAtMm(
  query: AlongWallExtentPositionQuery,
): number | undefined {
  const { extent } = query;
  const alongMm = toExactMillimetres(alongWallCoordinate(extent.wall, extent));
  if (alongMm === undefined) return undefined;
  if (!cornerTakingWallsOf(query.shape).has(extent.wall)) return alongMm;
  if (query.membersShiftMm !== undefined) {
    return alongMm + query.membersShiftMm;
  }
  return (
    alongMm +
    alongWallShiftMm({
      fromCabinetDepthMm: query.fromCabinetDepthMm,
      toCabinetDepthMm: query.toCabinetDepthMm,
      chain: chainOfRecordedSource(query),
    })
  );
}

/** Rungs 3 and 4 as one question about one extent: the chain its recorded source body declares, or the
 *  catalogue's default when it recorded none or names one the catalogue no longer holds (a load that
 *  refuses is a dead link, ADR 0073 decision 7). `FOLLOWS_CABINET_DEPTH`, not its string, so a changed
 *  catalogue default moves this fallback too. */
function chainOfRecordedSource(
  query: AlongWallExtentPositionQuery,
): AlongWallDepthChain {
  const source = query.extent.depthFromBuildId;
  const definition =
    source === undefined ? undefined : query.catalog.get(source);
  if (source === undefined || !definition) {
    return FOLLOWS_CABINET_DEPTH.alongWallPositionFollows;
  }
  return cabinetDepthRuleOf({ buildId: source, rule: definition.depthRule })
    .alongWallPositionFollows;
}
