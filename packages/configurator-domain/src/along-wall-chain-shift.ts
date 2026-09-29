// Wave 6J-c: **where a wall-B body stands along its wall once the corner beside it got deeper** —
// the production reader `alongWallPositionFollows` was declared for and did not have.
//
// `cabinet-depth-rule.ts` declares, per catalogue entry, which of two corner chains carries a body
// along wall B when the cabinet depth changes. Until this module it was a presence test and nothing
// more: `cabinetDepthRuleOf` threw unless the field was one of two literals, and no arm anywhere in
// `src/` branched on which. That is precisely the shape that file's own head comment is written
// against, and ADR 0089 decision 1 refuses carrying it unread.
//
// **Why a wall-B body moves at all.** Both walls walk from the same corner at the origin
// (`room-transforms.ts`), so a wall-A body's *depth* is measured along wall B: a wall-A body at the
// corner occupies wall B's along-wall interval `[0, its frame depth]`. Wall A owns that corner — its
// own run is anchored at 0 and does not move (ADR 0083 decision 1) — so when the setting deepens the
// corner body, the space it takes comes out of **wall B**, and every wall-B body slides by exactly
// what the corner gained.
//
// **Why two chains and not one delta.** The two bands stand against different wall-A bodies, and
// those bodies' depths are two different functions of the setting: the base run's carcass moves
// 560 → 660 while the wall band's carcass seat moves 291 → 361. A single uniform shift is wrong for
// one of the two by 30 mm (ADR 0089's measurement), which is why the field selects between two
// behaviours rather than labelling one. The 30 mm it leaves in wall B's top row at 700 is the
// product's answer and not a defect to smooth away — wave 6A3's *"never a sum of widths"*.
// **This module sizes nothing:** how *wide* a generated corner is belongs to
// `corner-assembly-size.ts` (7D6's J1′, ADR 0120 Amendment A), and the 30 mm above is the residue
// of a **slide** on a design whose widths are already frozen — so a corner sized for its room
// neither removes it nor is this file's subject.
//
// Both reaches are read from `catalog.ts`'s own depth formulas rather than restated here, so a
// chain and the body it is measured against cannot drift apart the way two literals agreeing at one
// depth always eventually do.
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

/** **Which walls a corner's own depth increase eats into, per shape** (ADR 0132 decision 7, M7B U2
 *  S3/D9, retired from the single `WALL_THE_CORNER_IS_TAKEN_FROM` constant by review round 1, R1.3).
 *  An L has one corner, taking wall B's run; a U has two — the left corner still takes wall B's, the
 *  right corner takes wall C's, the same way ADR 0132 decision 1 draws wall C as its own world wall
 *  rather than wall B reflected; a straight room has no corner and takes nothing.
 *
 *  **Every reader outside this module goes through this function now, and none holds a bare wall
 *  letter of its own.** `corner-assembly-size.ts`'s `ownsTheCorner` and
 *  `generation/shell-design.ts`'s `slideReserveMm` both used to compare against the retired constant
 *  directly; a direct wall-C call — neither module makes one today, both stand inside a synthetic
 *  two-wall room, but a future caller (U3's composer is the likely first) could — read a wall-C
 *  piece as owning the corner the way wall A does, or gave it no depth-change reserve at all. Both
 *  now read `cornerTakingWallsOf("U")`, the superset `{B, C}`: wall C never appears in an L's own
 *  calls, so the wider set answers exactly as `{B}` did for every wall those two ever ask about
 *  outside a U. */
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

/** **The wall whose run the corner is taken out of, on an L** — wall A is anchored at the corner
 *  and wall B begins past it, so a deeper corner consumes wall B's length and never wall A's. Kept
 *  as the private source `cornerTakingWallsOf("L")`'s own singleton is built from, so the L's one
 *  wall letter is still named in exactly one place. */
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

/** **How far wall A's corner body reaches into wall B's along-wall coordinate**, on this chain.
 *
 *  - **`base-formula`** — the base run's carcass, `baseCarcassDepthMm`: 560 at 600 and 660 at 700.
 *    It is `base-corner-x-900`'s own declared `frameDepthMm`, read through the formula rather than
 *    off that entry, so this module names no catalogue row and a fixture rename cannot silently
 *    zero the shift.
 *  - **`wall-map`** — the wall band's carcass seat, `wallCarcassSeatDepthMm`: 291 and 361. The wall
 *    band goes through §7's head-clearance map first, which is exactly why its delta is 70 and not
 *    the setting's own 100.
 *
 *  No third arm and no default: a fourth chain is a compile error here rather than a silent
 *  `base-formula`. */
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

/** **What the corner gained, which is what wall B gives up.** A difference of two reaches and
 *  nothing else, so it is zero when the setting does not change, and `from → to → from` returns the
 *  original coordinate exactly — the shift is a pure function of the setting and the declaration,
 *  with no accumulation to drift. */
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
  /** Which walls take a corner on this room (M7B U2 S3, D9) — `cornerTakingWallsOf`'s own answer for
   *  the design's shape. */
  readonly shape: DesignRoomShape;
}

/** **Where this placement stands along its wall at the new setting.**
 *
 *  Total on every placement, so a caller cannot forget the two cases that do not move: a wall-A body
 *  keeps its coordinate because wall A is anchored at the corner, and a body whose entry left the
 *  catalogue keeps its own rather than being guessed at — the same stance `setCabinetDepth` takes one
 *  file over, where an unresolvable body becomes a refusal instead of a silent rewrite.
 *
 *  **Asked of every body on a corner-taking wall, not only the ones whose depth follows the
 *  setting.** The two are different questions: `depthFollowsSetting` says whether a body is rebuilt,
 *  and this says where it stands. A freestanding fridge is 742 mm deep in both kitchens and ADR
 *  0058's pinned tops finish at 600 in both — and all of them still slide, because the corner in
 *  front of them took more wall. Excluding them would leave the run overlapping itself where the
 *  pinned rows begin. On a U this is wall B's own bodies for the left corner and wall C's for the
 *  right, each following its own corner and never the other's (`cornerTakingWallsOf`). */
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

/** How far each column's members moved along their wall, by the key that column had **before** the
 *  move — the operand rung 2 of the ladder below is built on.
 *
 *  Two derivations of the same placements, paired by id: `before` is where every body stood at the
 *  setting being left, `after` is where `alongWallPositionAtMm` puts it at the setting being reached.
 *  A column with no member has no entry, which is exactly the question rung 2 asks.
 *
 *  **A column whose members disagree gets no entry either**, and that is the ladder degrading rather
 *  than guessing: "the delta its own members moved" is not a number when they moved by two, so the
 *  extent falls to rung 3 and slides on the source it recorded — which is itself one of those
 *  members. Unreachable on the shipped catalogue, where every column is chain-homogeneous
 *  (`docs/BACKLOG.md` 51 records that nothing enforces it on an arbitrary document).
 *
 *  Answered in millimetres, for the reason `alongWallExtentPositionAtMm` gives below. */
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

/** One body's own move along its wall, or nothing when either coordinate is off the millimetre grid
 *  — no record any document can carry, and the safe answer for an operand rung 2 is exact or not at
 *  all. */
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

/** One frozen extent, the catalogue that holds the body it recorded, and the move being made. */ /** One frozen extent, the catalogue that holds the body it recorded, and the move being made. */
export interface AlongWallExtentPositionQuery {
  readonly extent: ColumnExtent;
  readonly catalog: BodyCatalog;
  readonly fromCabinetDepthMm: number;
  readonly toCabinetDepthMm: number;
  /** **How far this column's own members moved**, or `undefined` when it holds none — rung 2 of the
   *  ladder below, and `alongWallShiftByColumnMm` is what answers it.
   *
   *  Required rather than optional, so a caller that has the records cannot silently skip the one
   *  rung that is exact and land on a declaration instead. `undefined` is the member-less answer and
   *  is stated, not defaulted into. */
  readonly membersShiftMm: number | undefined;
  /** Which walls take a corner on this room (M7B U2 S3, D9) — `cornerTakingWallsOf`'s own answer for
   *  the design's shape. */
  readonly shape: DesignRoomShape;
}

/** **Where this frozen extent stands along its wall at the new setting** — ADR 0090 decision 2 as its
 *  2026-09-06 amendment states it, and the sibling of `alongWallPositionAtMm` above.
 *
 *  `Design.emptyColumns` and `Design.columnExtents` record where a column *stands*, so the command
 *  that slides a run slides them with it or returns a document that contradicts its own placements.
 *
 *  **An information ladder, ordered by how much the document actually knows** — the shape ADR 0080
 *  decision 4 already uses on the depth axis. Every rung below the first is a positive answer; there
 *  is no arm that abstains, because on a run that has moved, **standing still is not abstention**. It
 *  is a positive claim that this column follows a third chain no entry declares and whose shift is
 *  zero — the worst guess available, wrong by the full 100 mm, which is what Amendment A overturned
 *  decision 4a for.
 *
 *  1. **A wall no corner is taken from** — unchanged. Wall A is anchored at both of a U's corners
 *     and never moves at any setting; on an L or a U, wall B or wall C moves only when its own
 *     corner is the one that deepened (`cornerTakingWallsOf`, M7B U2 S3/D9).
 *  2. **The column holds a member** — the delta its own members moved, from `membersShiftMm`. Exact,
 *     and it reads no chain and no source at all: an extent *is* the column those members are in, and
 *     the command has just computed where every one of them stands. This rung is decision 2's own
 *     claim promoted from an assertion into the derivation, and it is what makes rung 4 safe — a
 *     rigid default moves the legacy `wall-map` corner extent `B|615` by +100 while its members move
 *     +70, and 30 mm parts an extent from the column it records.
 *  3. **Member-less, with a recorded source** — that source's declared chain (decision 2, unchanged).
 *     `deriveColumns` records as `depthFromBuildId` the member that won §3.2's MAX, so the recorded
 *     source is a member of that column and its chain is the column's. ADR 0073 decision 1's field,
 *     read for a second axis: no new field, no migration.
 *  4. **Member-less and sourceless** — the chain `FOLLOWS_CABINET_DEPTH` declares, read from that
 *     constant so the fallback and the catalogue's own default cannot part. Not a preference between
 *     two chains: the only two `wall-map` entries are `STRUCTURAL_CORNER`, answer `NOT_DELETABLE` and
 *     appear in no insertable row, so **a `wall-map` column can never become member-less** and this is
 *     the only reachable answer rather than the likelier of two.
 *
 *  No rung reads a band, a level or a vertical interval. Inferring a chain from the band an extent
 *  sits in is refused by measurement (`wall-2door-600-deep-top` and `wall-corner-return-570-top` are
 *  both `top` band and declare different chains, 30 mm apart at 700).
 *
 *  It **declines** — answering nothing — only for an extent whose coordinate is not on a whole
 *  millimetre, which is no document the loader accepts, exactly as `clipEmptyColumnsAtWallEnd` does
 *  for its own ungriddable input.
 *
 *  Answered in millimetres rather than metres because the placements' own slide is: `0.615 + 0.07`
 *  in metres keys to `B|0.54` on the way back down where `615 + 70` keys to `B|0.55`, and a map
 *  keyed a hair differently from the records it describes is the whole defect this closes. */
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

/** Rungs 3 and 4, as one question about one extent: the chain the body this extent recorded declares,
 *  or the catalogue's own default when it recorded none — or named one the catalogue no longer holds,
 *  which ADR 0073 decision 7 treats the same way and for the same reason (a load that refuses is a
 *  dead link).
 *
 *  `FOLLOWS_CABINET_DEPTH` rather than the string it carries, so a catalogue that changed its default
 *  moves this fallback with it. It is also the value the catalogue already gives an entry that says
 *  nothing special, which is what decision 3's *"declared, never inferred"* asks for. */
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
