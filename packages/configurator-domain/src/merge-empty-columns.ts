// Adjacent empty columns on the same wall and row become one column when the run's total is at most the
// caller's width limit. The editor's is none (8U plan §5: 800 mm caps a cabinet, not a space); composition
// passes its own, and with it the planned boundaries it will not merge across (ADR 0167 D6). A rule about
// the frozen map, not a subtraction inside `recomputeVoids`.
//
// It declines, never refuses: its call sites (`deriveColumns` and the store's `resolveColumns`) have no
// rejection channel, so a run that cannot merge safely is left as it was. Two unmerged empty columns are
// a legal state (ADR 0043); a throw from ordinary input is not.
import {
  MILLIMETRES_PER_METRE,
  toExactMillimetres,
  toMetres,
} from "./millimetres.js";
import type { DesignWall } from "./design.js";
import {
  alongWallCoordinate,
  alongWallPosition,
  COLUMN_KEY_RESOLUTION_MM,
  deriveColumnKeyAt,
  LEVEL_SNAP_M,
} from "./module-grid.js";
// Types only, to keep this module a leaf: `void-engine.ts` imports this one for values, so a value
// import back would close a runtime cycle.
import type { ColumnExtent, PlacementRecord } from "./void-engine.js";

/** §4's own snap in millimetres: the engine's "same row" (ADR 0046 rule 2). `LEVEL_SNAP_M` must stay
 *  imported from `module-grid.ts`: read from `void-engine.ts`, which imports this module, it is unbound
 *  at load, the tolerance is `NaN`, and the merge silently never fires. */
const AGREEMENT_TOLERANCE_MM = LEVEL_SNAP_M * MILLIMETRES_PER_METRE;

/** Edges must **meet**. The coordinates are exact halves of whole millimetres, so this forgives float
 *  noise only: a larger tolerance would merge across wall that no column owns. */
const EDGE_TOUCH_TOLERANCE_MM = 1e-6;

/** Positive overlap, never a shared boundary (`overlapsAlongWall`'s rule, in millimetres): runs that
 *  meet on a module line share an edge only. */
const OVERLAP_EPSILON_MM = 1e-6;

/** One key bucket, inclusive, plus float noise: two along-wall edges this close are one edge of wall to the key
 *  grid, so a trim that moves a merged centre into the next bucket cannot separate them. */
const SAME_EDGE_OF_WALL_MM = COLUMN_KEY_RESOLUTION_MM + EDGE_TOUCH_TOLERANCE_MM;

/** The editor's limit: none. Adjacent agreeing member-less columns are one space whatever their total (8U plan §5);
 *  the 800 mm ceiling is the cabinet's (§7). Not read from `module-grid.ts`, whose constant bounds the cuts inside
 *  the commands and the v1 arm. */
const EDITOR_MERGE_WIDTH_LIMIT_MM = Number.POSITIVE_INFINITY;

/** Along-wall coordinates, in millimetres and per wall, of the edges that two planned tiles share (ADR 0167 D6):
 *  the only places composition's merge may not join across. The far edge of the last planned tile is not one,
 *  for the leftover beyond it is not a planned tile and composition merges it in (ADR 0166 criterion 15). The
 *  coordinates are a column's own (`x` on wall A, `z` on the others, times 1000), as a plan's `startMm` and
 *  `endMm` are. */
export type PlannedBoundariesMm = ReadonlyMap<DesignWall, readonly number[]>;

/** The editor's: none. Only composition has planned tiles. */
const EDITOR_PLANNED_BOUNDARIES: PlannedBoundariesMm = new Map();

/** One empty column as the scan reads it, in whole millimetres. `leftMm` and `rightMm` are
 *  half-integers when the width is odd, the case `landsOnWholeMillimetres` guards. */
interface MeasuredColumn {
  readonly column: ColumnExtent;
  readonly centreMm: number;
  readonly widthMm: number;
  readonly leftMm: number;
  readonly rightMm: number;
  readonly floorMm: number;
  readonly topMm: number;
  readonly depthMm: number;
}

/** What every block on a wall is judged against: the records that stand in it, the widest it may merge to, and
 *  the planned boundaries it may not cross. */
interface WallScan {
  readonly records: readonly PlacementRecord[];
  readonly widthLimitMm: number;
  readonly plannedBoundaries: PlannedBoundariesMm;
}

/** A run of wall along its length only, in millimetres. */
type AlongWallStretchMm = Pick<WallSpanMm, "leftMm" | "rightMm">;

/** The extent a run merges to, and the columns it replaces. */
interface MergePlan {
  readonly members: readonly MeasuredColumn[];
  readonly column: ColumnExtent;
}

/** The along-wall and vertical reach of one run of wall: the same pair `validateDesignForCatalog`
 *  sweeps for `EMPTY_COLUMN_OVERLAPS_PLACEMENT`. */
interface WallSpanMm {
  readonly wall: DesignWall;
  readonly leftMm: number;
  readonly rightMm: number;
  readonly floorMm: number;
  readonly topMm: number;
}

/** The empty columns that may become one, replaced by the column they become; other keys pass through.
 *  `hasFullHeightUnder` is not answered here: both callers run `withCurrentFullHeightMembers` over the
 *  result. The input map is returned by identity when nothing merges. `widthLimitMm` omitted is the
 *  editor's own limit, none, the one place it is set; composition passes its own (8U plan §6.1, amending
 *  ADR 0110 decision 2). `plannedBoundaries` omitted is the editor's too, none: composition passes the edges its
 *  planned tiles share, and a run is never joined across one (ADR 0166 decision 4, amended by ADR 0167 D6). */
export function mergeAdjacentEmptyColumns(
  columns: ReadonlyMap<string, ColumnExtent>,
  records: readonly PlacementRecord[],
  widthLimitMm: number = EDITOR_MERGE_WIDTH_LIMIT_MM,
  plannedBoundaries: PlannedBoundariesMm = EDITOR_PLANNED_BOUNDARIES,
): ReadonlyMap<string, ColumnExtent> {
  const scan: WallScan = { records, widthLimitMm, plannedBoundaries };
  let merged = columns;
  let plans = planMerges(merged, scan);
  // Iterated, because a merged envelope narrows `top` and `d` and may then agree with a neighbour the pass
  // refused. It terminates: every plan replaces at least two columns with one, so each pass shrinks the map.
  // It makes one map's answer a fixpoint, not the clear order irrelevant: it recovers a narrowing into
  // agreement (2560 | 2600 2580), never one out of it (620 | 600 580 once the right pair has merged). A known
  // limit, 8U plan §6.3.
  while (plans.length > 0) {
    merged = withPlansApplied(merged, plans);
    plans = planMerges(merged, scan);
  }
  return merged;
}

function withPlansApplied(
  columns: ReadonlyMap<string, ColumnExtent>,
  plans: readonly MergePlan[],
): ReadonlyMap<string, ColumnExtent> {
  const merged = new Map<string, ColumnExtent>(columns);
  for (const plan of plans) {
    // Vacated before the merged column is written: a merged centre may key back onto a member's own key.
    for (const member of plan.members) merged.delete(member.column.key);
    merged.set(plan.column.key, plan.column);
  }
  return merged;
}

/** The empty columns of the map, wall by wall. "Empty" means no record is filed under the key at any
 *  level (ADR 0037's predicate), so deleting one cabinet from a column merges nothing. */
function planMerges(
  columns: ReadonlyMap<string, ColumnExtent>,
  scan: WallScan,
): readonly MergePlan[] {
  const occupied = new Set(scan.records.map((record) => record.col));
  const measured: MeasuredColumn[] = [];
  for (const column of columns.values()) {
    if (occupied.has(column.key)) continue;
    const candidate = measure(column);
    if (candidate) measured.push(candidate);
  }
  return [...groupByWall(measured).values()].flatMap((onOneWall) =>
    planOneWall(onOneWall, columns, scan),
  );
}

/** A column the document could not carry is not one this may merge: every value is read through
 *  `toExactMillimetres`, as `projectEmptyColumns` does at the store seam, so a merged extent is
 *  projectable by construction. A column already off the millimetre grid is left as it was. */
function measure(column: ColumnExtent): MeasuredColumn | undefined {
  const floorM = lowestRegionStartM(column);
  if (floorM === undefined) return undefined;
  const centreMm = toExactMillimetres(
    column.wall === "A" ? column.x : column.z,
  );
  const widthMm = toExactMillimetres(column.w);
  const floorMm = toExactMillimetres(floorM);
  const topMm = toExactMillimetres(column.top);
  const depthMm = toExactMillimetres(column.d);
  if (
    centreMm === undefined ||
    widthMm === undefined ||
    floorMm === undefined ||
    topMm === undefined ||
    depthMm === undefined
  ) {
    return undefined;
  }
  return {
    column,
    centreMm,
    widthMm,
    leftMm: centreMm - widthMm / 2,
    rightMm: centreMm + widthMm / 2,
    floorMm,
    topMm,
    depthMm,
  };
}

function lowestRegionStartM(column: ColumnExtent): number | undefined {
  const starts = column.regions.map(([start]) => start);
  if (starts.length === 0) return undefined;
  return Math.min(...starts);
}

function groupByWall(
  measured: readonly MeasuredColumn[],
): Map<DesignWall, MeasuredColumn[]> {
  const walls = new Map<DesignWall, MeasuredColumn[]>();
  for (const candidate of measured) {
    const wall = candidate.column.wall;
    const bucket = walls.get(wall);
    if (bucket) bucket.push(candidate);
    else walls.set(wall, [candidate]);
  }
  return walls;
}

/** Greedy, left to right, over the run sorted by along-wall coordinate (ADR 0046 rule 1). A finite limit
 *  makes the merge order-dependent (at 800, 300 + 500 + 300 gives 800 + 300 from the left, 300 + 800 from
 *  the right) and `columns` iterates in insertion order, so sorting makes one design one picture; uncapped,
 *  the sort still decides `mergedExtent`'s template tie. A start that merges nothing leaves its first
 *  column and the scan resumes at the next, so a decline never swallows the columns after it. */
function planOneWall(
  onOneWall: readonly MeasuredColumn[],
  columns: ReadonlyMap<string, ColumnExtent>,
  scan: WallScan,
): readonly MergePlan[] {
  const wall = indexWall(onOneWall, columns, scan);
  const plans: MergePlan[] = [];
  const reserved = new Set<string>();
  let index = 0;
  while (index < wall.sorted.length) {
    const plan = planWidestAcceptedBlockFrom(index, wall, reserved);
    if (!plan) {
      index += 1;
      continue;
    }
    plans.push(plan);
    reserved.add(plan.column.key);
    index += plan.members.length;
  }
  return plans;
}

/** One wall's pass, read once: the bodies standing on it and every column's stretch of it sorted by left edge, so
 *  a length the guards decline is screened out without re-reading the map. */
interface WallIndex extends WallScan {
  /** This wall's planned boundaries, from the scan's map. */
  readonly plannedBoundariesMm: readonly number[];
  readonly sorted: readonly MeasuredColumn[];
  readonly columns: ReadonlyMap<string, ColumnExtent>;
  readonly footprints: readonly WallSpanMm[];
  readonly stretches: readonly KeyedStretch[];
}

/** A column's stretch of wall under its key, as `standsOverAnotherColumn` reads it. */
interface KeyedStretch extends AlongWallStretchMm {
  readonly key: string;
}

function indexWall(
  onOneWall: readonly MeasuredColumn[],
  columns: ReadonlyMap<string, ColumnExtent>,
  scan: WallScan,
): WallIndex {
  const sorted = [...onOneWall].sort((a, b) => a.leftMm - b.leftMm);
  const wall = sorted[0]?.column.wall ?? "A";
  return {
    ...scan,
    plannedBoundariesMm: scan.plannedBoundaries.get(wall) ?? [],
    sorted,
    columns,
    footprints: scan.records
      .filter((record) => record.wall === wall)
      .map(footprintOf),
    stretches: stretchesOnWall(columns, wall),
  };
}

/** A stretch whose left edge is not finite is never within a bucket of a span's, so leaving it out of the sort
 *  changes no verdict and keeps the order the binary search needs. */
function stretchesOnWall(
  columns: ReadonlyMap<string, ColumnExtent>,
  wall: DesignWall,
): readonly KeyedStretch[] {
  return [...columns.values()]
    .filter((column) => column.wall === wall)
    .map((column) => ({ key: column.key, ...alongWallStretchOf(column) }))
    .filter((stretch) => Number.isFinite(stretch.leftMm))
    .sort((a, b) => a.leftMm - b.leftMm);
}

/** The longest block starting here that `planBlock` accepts. Without trying shorter blocks the scan is not maximal
 *  at its own start: four 200s with a body across the right-hand pair would decline entirely though the leftmost
 *  pair was legal. Only a length that passes the screen reaches `planBlock`, which stays the one judge: judging
 *  every declined length re-reads the map once per length, cubic in a crafted wall of declining columns. */
function planWidestAcceptedBlockFrom(
  start: number,
  wall: WallIndex,
  reserved: ReadonlySet<string>,
): MergePlan | undefined {
  const block = widestBlockFrom(start, wall);
  if (block.members.length < 2) return undefined;
  const screen = screenBlock(block, wall);
  for (let last = block.members.length - 1; last >= 1; last -= 1) {
    if (!passesScreen(screen, last, reserved)) continue;
    const members = block.members.slice(0, last + 1);
    const plan = planBlock(members, wall.columns, wall.records, reserved);
    if (plan) return plan;
  }
  return undefined;
}

/** A run that may merge, and the span each of its leading sub-runs would merge to: `prefixes[i]` is the span of
 *  `members[0..i]`, the envelope `planBlock` writes for that length. */
interface CandidateBlock {
  readonly members: readonly MeasuredColumn[];
  readonly prefixes: readonly WallSpanMm[];
}

/** The widest contiguous sub-run starting here whose total stays at or under the limit. Refused, never
 *  truncated (ADR 0046): at composition's 800, 600 + 400 stay as they are and three 300s become a 600 and
 *  a 300. Under the editor's limit, none, the block runs until an edge fails to meet or a pair disagrees.
 *  It also ends where the envelope stops having height: the envelope only narrows as a block grows, so no
 *  longer block can pass `hasPositiveHeight`. And it ends at a planned boundary: a longer block crosses it too,
 *  so ending here is exact, and the guards `passesScreen` restates only ever see blocks that stop short of one.
 *
 *  A column already wider than a finite limit yields a block of one, so at that limit 800 and its overflow
 *  never re-merge. In the editor the reconcile's split cuts at 800 and this merge rejoins the pieces. */
function widestBlockFrom(start: number, wall: WallIndex): CandidateBlock {
  const { sorted, widthLimitMm } = wall;
  const first = sorted[start];
  if (!first) return { members: [], prefixes: [] };
  const members = [first];
  const prefixes = [spanOf(first)];
  let totalMm = first.widthMm;
  for (let next = start + 1; next < sorted.length; next += 1) {
    const candidate = sorted[next];
    const previous = members[members.length - 1];
    const envelope = prefixes[prefixes.length - 1];
    if (!candidate || !previous || !envelope) break;
    if (!abuts(previous, candidate) || !agrees(previous, candidate)) break;
    if (isPlannedBoundary(previous.rightMm, wall.plannedBoundariesMm)) break;
    if (totalMm + candidate.widthMm > widthLimitMm) break;
    const widened = widenedBy(envelope, candidate);
    if (!hasPositiveHeight(widened)) break;
    totalMm += candidate.widthMm;
    members.push(candidate);
    prefixes.push(widened);
  }
  return { members, prefixes };
}

function spanOf(member: MeasuredColumn): WallSpanMm {
  return {
    wall: member.column.wall,
    leftMm: member.leftMm,
    rightMm: member.rightMm,
    floorMm: member.floorMm,
    topMm: member.topMm,
  };
}

/** `planBlock`'s span grown by one member: the sort puts the leftmost edge first, and `max`/`min` are exact, so
 *  this is the span `planBlock` computes for the longer block, to the bit. */
function widenedBy(envelope: WallSpanMm, member: MeasuredColumn): WallSpanMm {
  return {
    ...envelope,
    rightMm: Math.max(envelope.rightMm, member.rightMm),
    floorMm: Math.max(envelope.floorMm, member.floorMm),
    topMm: Math.min(envelope.topMm, member.topMm),
  };
}

/** Which lengths of one block the guards may still accept, read in constant time per length. */
interface BlockScreen {
  readonly block: CandidateBlock;
  readonly columns: ReadonlyMap<string, ColumnExtent>;
  /** By offset of the last member: a body stands in that span, or it is over another column. */
  readonly declinedByGeometry: readonly boolean[];
  /** Each member's key and the first offset holding it, so "vacated by this length" is one comparison. */
  readonly memberOffsets: ReadonlyMap<string, number>;
}

function screenBlock(block: CandidateBlock, wall: WallIndex): BlockScreen {
  const memberOffsets = new Map<string, number>();
  block.members.forEach((member, offset) => {
    if (!memberOffsets.has(member.column.key)) {
      memberOffsets.set(member.column.key, offset);
    }
  });
  const ranges = [
    ...wall.footprints.map((footprint) =>
      offsetsStoodIn(block.prefixes, footprint),
    ),
    ...stretchesStartingAt(block, wall.stretches).map((stretch) =>
      offsetsOverAnotherColumn(block.prefixes, stretch, memberOffsets),
    ),
  ];
  return {
    block,
    columns: wall.columns,
    declinedByGeometry: coveredOffsets(ranges, block.members.length),
    memberOffsets,
  };
}

/** `planBlock`'s guards, short of building the extent: never false where `planBlock` would accept, so screening a
 *  length out cannot change a result, only skip a call that would decline. Change a guard in both places: one
 *  loosened in `planBlock` alone changes nothing, since the screen keeps declining what it declined. */
function passesScreen(
  screen: BlockScreen,
  last: number,
  reserved: ReadonlySet<string>,
): boolean {
  const prefix = screen.block.prefixes[last];
  if (!prefix || screen.declinedByGeometry[last]) return false;
  const widthMm = prefix.rightMm - prefix.leftMm;
  const centreMm = prefix.leftMm + widthMm / 2;
  if (!landsOnWholeMillimetres(centreMm, widthMm)) return false;
  const key = deriveColumnKeyAt(prefix.wall, toMetres(centreMm));
  if (reserved.has(key)) return false;
  const vacatedFrom = screen.memberOffsets.get(key);
  const isVacated = vacatedFrom !== undefined && vacatedFrom <= last;
  return isVacated || !screen.columns.has(key);
}

/** The offsets of the last member, inclusive, over which one guard declines; empty when `from > to`. */
interface OffsetRange {
  readonly from: number;
  readonly to: number;
}

/** `standsIn` for one body, as a range: the along-wall overlap only appears as the block grows and the vertical one
 *  only disappears, as the envelope narrows. Not a cut-off, then: a narrowing envelope can pass under the body. */
function offsetsStoodIn(
  prefixes: readonly WallSpanMm[],
  footprint: WallSpanMm,
): OffsetRange {
  return {
    from: firstIndexWhere(prefixes, (prefix) =>
      overlaps(
        footprint.leftMm,
        footprint.rightMm,
        prefix.leftMm,
        prefix.rightMm,
      ),
    ),
    to:
      firstIndexWhere(
        prefixes,
        (prefix) =>
          !overlaps(
            footprint.floorMm,
            footprint.topMm,
            prefix.floorMm,
            prefix.topMm,
          ),
      ) - 1,
  };
}

/** The stretches `isSameStretchOfWall` can match on the left edge, which every length of the block shares. */
function stretchesStartingAt(
  block: CandidateBlock,
  stretches: readonly KeyedStretch[],
): readonly KeyedStretch[] {
  const leftMm = block.prefixes[0]?.leftMm ?? Number.NaN;
  const near: KeyedStretch[] = [];
  let index = firstIndexWhere(
    stretches,
    (stretch) => stretch.leftMm - leftMm >= -SAME_EDGE_OF_WALL_MM,
  );
  for (; index < stretches.length; index += 1) {
    const stretch = stretches[index];
    if (!stretch || stretch.leftMm - leftMm > SAME_EDGE_OF_WALL_MM) break;
    near.push(stretch);
  }
  return near;
}

/** `standsOverAnotherColumn` for one column already matched on the left edge: the right edges within a bucket form
 *  one range as the block's right edge grows, ending before the length that makes the column a member. */
function offsetsOverAnotherColumn(
  prefixes: readonly WallSpanMm[],
  stretch: KeyedStretch,
  memberOffsets: ReadonlyMap<string, number>,
): OffsetRange {
  const memberFrom = memberOffsets.get(stretch.key) ?? prefixes.length;
  const to =
    firstIndexWhere(
      prefixes,
      (prefix) => stretch.rightMm - prefix.rightMm < -SAME_EDGE_OF_WALL_MM,
    ) - 1;
  return {
    from: firstIndexWhere(
      prefixes,
      (prefix) => stretch.rightMm - prefix.rightMm <= SAME_EDGE_OF_WALL_MM,
    ),
    to: Math.min(to, memberFrom - 1),
  };
}

/** The first index whose item holds `predicate`, which must be false and then true along `items`; the length when
 *  none does. */
function firstIndexWhere<Item>(
  items: readonly Item[],
  predicate: (item: Item) => boolean,
): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const item = items[middle];
    if (item !== undefined && predicate(item)) high = middle;
    else low = middle + 1;
  }
  return low;
}

/** Whether any range covers each offset, by a running count over the ranges' ends. */
function coveredOffsets(
  ranges: readonly OffsetRange[],
  length: number,
): readonly boolean[] {
  const opened = new Array<number>(length + 1).fill(0);
  for (const { from, to } of ranges) {
    if (from > to) continue;
    opened[from] = (opened[from] ?? 0) + 1;
    opened[to + 1] = (opened[to + 1] ?? 0) - 1;
  }
  let open = 0;
  return opened.slice(0, length).map((change) => {
    open += change;
    return open > 0;
  });
}

function abuts(left: MeasuredColumn, right: MeasuredColumn): boolean {
  return Math.abs(right.leftMm - left.rightMm) <= EDGE_TOUCH_TOLERANCE_MM;
}

function isPlannedBoundary(
  edgeMm: number,
  boundariesMm: readonly number[],
): boolean {
  return boundariesMm.some(
    (boundaryMm) => Math.abs(boundaryMm - edgeMm) <= EDGE_TOUCH_TOLERANCE_MM,
  );
}

/** ADR 0046 rule 2, plus a third condition: `d`. A column's floor, `top` and `d` all travel into the
 *  openings a merged column offers, so merging a base-run column (`top` 0.86) with a cleared
 *  full-height one (2.6), or a wall-depth column (~0.33) with a base-depth one (0.60), would publish
 *  openings over ground or depth that never existed. Judged between neighbours on their current extents;
 *  the merged extent takes the conservative envelope (`mergedExtent`) and forgets its members.
 *
 *  Not transitive: 620 agrees with 600 and 600 with 580, but 620 not with 580. So a run whose neighbours
 *  agree but whose spread passes the tolerance may become one column or two depending on the order it was
 *  cleared in, and may lose more than 20 mm on a member. A known limit (8U plan §6.3, R14), not accepted
 *  by any record: ADR 0046 Part 2 accepts 20 mm on a pair. */
function agrees(left: MeasuredColumn, right: MeasuredColumn): boolean {
  return (
    withinAgreement(left.topMm, right.topMm) &&
    withinAgreement(left.floorMm, right.floorMm) &&
    withinAgreement(left.depthMm, right.depthMm)
  );
}

function withinAgreement(left: number, right: number): boolean {
  return Math.abs(left - right) <= AGREEMENT_TOLERANCE_MM;
}

/** The merged extent, or nothing: the five reasons a run that may merge still does not. The two outer
 *  edges hold and the width is what lies between them (ADR 0031), so the run's total is conserved. */
function planBlock(
  members: readonly MeasuredColumn[],
  columns: ReadonlyMap<string, ColumnExtent>,
  records: readonly PlacementRecord[],
  reserved: ReadonlySet<string>,
): MergePlan | undefined {
  const leftMm = Math.min(...members.map((member) => member.leftMm));
  const rightMm = Math.max(...members.map((member) => member.rightMm));
  const widthMm = rightMm - leftMm;
  const centreMm = leftMm + widthMm / 2;
  if (!landsOnWholeMillimetres(centreMm, widthMm)) return undefined;

  const span: WallSpanMm = {
    wall: members[0]?.column.wall ?? "A",
    leftMm,
    rightMm,
    floorMm: Math.max(...members.map((member) => member.floorMm)),
    topMm: Math.min(...members.map((member) => member.topMm)),
  };
  if (!hasPositiveHeight(span)) return undefined;
  if (standsIn(records, span)) return undefined;

  const key = deriveColumnKeyAt(span.wall, toMetres(centreMm));
  if (isKeyTaken(key, columns, members, reserved)) return undefined;
  if (standsOverAnotherColumn(span, columns, members)) return undefined;

  return { members, column: mergedExtent(members, span, key, centreMm) };
}

/** The centre guard: declines before any extent is written, because neither call site can refuse.
 *  `centreMm` is fractional whenever the run's total is odd; widths are even today by coincidence, not
 *  by rule. Asks `projectEmptyColumns`' question one seam earlier, since its `UnprojectableColumnError`
 *  is not caught by `applyCommandResult`. Never rounded: `deriveColumnKeyAt` uses `toFixed(2)`, so a
 *  rounded centre keys a column as its neighbour and two extents collapse into one map slot. */
function landsOnWholeMillimetres(centreMm: number, widthMm: number): boolean {
  return Number.isInteger(centreMm) && Number.isInteger(widthMm);
}

/** The envelope below takes the highest floor and lowest top, so it inverts when members are shorter
 *  than the tolerance they agree within (two abutting 1 mm columns, floors 0 and 20 mm). An inverted
 *  interval overlaps nothing, so neither `standsIn` nor the document's overlap sweep sees it
 *  (`EMPTY_COLUMN_INVERTED`). Reachable from a crafted document at the load seam, not from the UI. */
function hasPositiveHeight(span: WallSpanMm): boolean {
  return span.topMm - span.floorMm > 0;
}

/** Seeded columns overlap, so a run whose members merely touch can still enclose ground a third
 *  column's member stands on (`A|0.45`'s 900 mm corner base spans `A|0.30` and `A|0.75`). Positive in
 *  both axes, `EMPTY_COLUMN_OVERLAPS_PLACEMENT`'s own predicate, so a merged extent is never one the
 *  validator refuses and a body is never offered space it stands in. */
function standsIn(
  records: readonly PlacementRecord[],
  span: WallSpanMm,
): boolean {
  return records.some((record) => {
    if (record.wall !== span.wall) return false;
    const footprint = footprintOf(record);
    return (
      overlaps(
        footprint.leftMm,
        footprint.rightMm,
        span.leftMm,
        span.rightMm,
      ) &&
      overlaps(footprint.floorMm, footprint.topMm, span.floorMm, span.topMm)
    );
  });
}

/** A record's reach in the span's millimetres. Converted, not rounded: it is compared against
 *  `OVERLAP_EPSILON_MM`, far above metre-subtraction noise and far below any design width. */
function footprintOf(record: PlacementRecord): WallSpanMm {
  const centreMm =
    (record.wall === "A" ? record.frame.x : record.frame.z) *
    MILLIMETRES_PER_METRE;
  const widthMm = record.frame.w * MILLIMETRES_PER_METRE;
  const floorMm = record.frame.y0 * MILLIMETRES_PER_METRE;
  return {
    wall: record.wall,
    leftMm: centreMm - widthMm / 2,
    rightMm: centreMm + widthMm / 2,
    floorMm,
    topMm: floorMm + record.frame.h * MILLIMETRES_PER_METRE,
  };
}

function overlaps(
  firstLo: number,
  firstHi: number,
  secondLo: number,
  secondHi: number,
): boolean {
  return (
    Math.min(firstHi, secondHi) - Math.max(firstLo, secondLo) >
    OVERLAP_EPSILON_MM
  );
}

/** A merged centre can land in a 10 mm bucket another column owns: two cleared wall columns spanning
 *  0-900 would key as `A|0.45`, the corner base's column. The merge declines rather than nudging the
 *  key (`EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT`), which would put the space where the customer did
 *  not free it. The run's own keys are vacated first; `reserved` holds keys earlier blocks claimed. */
function isKeyTaken(
  key: string,
  columns: ReadonlyMap<string, ColumnExtent>,
  members: readonly MeasuredColumn[],
  reserved: ReadonlySet<string>,
): boolean {
  if (reserved.has(key)) return true;
  const vacated = new Set(members.map((member) => member.column.key));
  return columns.has(key) && !vacated.has(key);
}

/** `isKeyTaken`'s geometric twin: a run over the same stretch of wall as a column that is not its member (the upper
 *  row over a corner base) declines whatever its centre keys to, so a 1 mm trim cannot decide whether it merges.
 *  Along the wall only, since the two stand at different heights; see ADR 0122 decision 4. */
function standsOverAnotherColumn(
  span: WallSpanMm,
  columns: ReadonlyMap<string, ColumnExtent>,
  members: readonly MeasuredColumn[],
): boolean {
  const memberKeys = new Set(members.map((member) => member.column.key));
  return [...columns.values()].some(
    (column) =>
      column.wall === span.wall &&
      !memberKeys.has(column.key) &&
      isSameStretchOfWall(alongWallStretchOf(column), span),
  );
}

/** Read from the centre and width alone, never through `measure`: a column off the millimetre grid still stands
 *  over its wall, and skipping it would let the run merge. */
function alongWallStretchOf(column: ColumnExtent): AlongWallStretchMm {
  const centreMm =
    alongWallCoordinate(column.wall, column) * MILLIMETRES_PER_METRE;
  const widthMm = column.w * MILLIMETRES_PER_METRE;
  return { leftMm: centreMm - widthMm / 2, rightMm: centreMm + widthMm / 2 };
}

function isSameStretchOfWall(
  first: AlongWallStretchMm,
  second: AlongWallStretchMm,
): boolean {
  return (
    Math.abs(first.leftMm - second.leftMm) <= SAME_EDGE_OF_WALL_MM &&
    Math.abs(first.rightMm - second.rightMm) <= SAME_EDGE_OF_WALL_MM
  );
}

/** The column the run becomes: its two outer edges and the conservative envelope of the rest (highest
 *  floor, lowest top, shallowest depth), never `max(top)` or `max(d)`, so the tolerance slack never
 *  becomes ground, ceiling or depth no member had.
 *
 *  A chain may drift past the tolerance: `agrees` is judged between neighbours, so 620, 600, 580 merged as
 *  one loses 40 mm of depth on its 620 member, and whether it merges as one depends on the clear order. A
 *  known limit (8U plan §6.3), not an accepted cost. The envelope narrows `top` and `d`, so a second pass
 *  over a merged column may accept what the first refused; `mergeAdjacentEmptyColumns` iterates to the
 *  fixpoint for it, which fixes one map's answer and not the order's.
 *
 *  The shallowest member is the template: a column's off-wall coordinate is its own half-depth, so the
 *  extent that keeps `d` keeps `x`/`z`, `wall`, `ry` and `depthFromBuildId` with it (ADR 0073 decision 8).
 *  The `reduce` keeps the first of two equal depths and that tie is load-bearing: `members` is sorted
 *  along the wall, so the winner is the leftmost of the shallowest, derived from geometry
 *  (ADR 0079 decision 7). It is not a defect. */
function mergedExtent(
  members: readonly MeasuredColumn[],
  span: WallSpanMm,
  key: string,
  centreMm: number,
): ColumnExtent {
  const shallowest = members.reduce((deepest, member) =>
    member.depthMm < deepest.depthMm ? member : deepest,
  );
  const floorM = toMetres(span.floorMm);
  const topM = toMetres(span.topMm);
  const centreM = toMetres(centreMm);
  return {
    ...shallowest.column,
    key,
    w: toMetres(span.rightMm - span.leftMm),
    d: toMetres(shallowest.depthMm),
    top: topM,
    // One interval, as a frozen empty extent always is (`toColumnExtent`): §4 reads only floor and top.
    regions: [[floorM, topM]],
    ...alongWallPosition(shallowest.column.wall, centreM),
  };
}
