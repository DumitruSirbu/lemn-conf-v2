// Adjacent empty columns on the same wall and row become one column when the run's total is at most
// `MAX_EMPTY_COLUMN_WIDTH_MM`. A rule about the frozen map, not a subtraction inside `recomputeVoids`.
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
  alongWallPosition,
  deriveColumnKeyAt,
  LEVEL_SNAP_M,
  MAX_EMPTY_COLUMN_WIDTH_MM,
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
 *  result. The input map is returned by identity when nothing merges. */
export function mergeAdjacentEmptyColumns(
  columns: ReadonlyMap<string, ColumnExtent>,
  records: readonly PlacementRecord[],
): ReadonlyMap<string, ColumnExtent> {
  const plans = planMerges(columns, records);
  if (plans.length === 0) return columns;

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
  records: readonly PlacementRecord[],
): readonly MergePlan[] {
  const occupied = new Set(records.map((record) => record.col));
  const measured: MeasuredColumn[] = [];
  for (const column of columns.values()) {
    if (occupied.has(column.key)) continue;
    const candidate = measure(column);
    if (candidate) measured.push(candidate);
  }
  return [...groupByWall(measured).values()].flatMap((onOneWall) =>
    planOneWall(onOneWall, columns, records),
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

/** Greedy, left to right, over the run sorted by along-wall coordinate (ADR 0046 rule 1). The capped
 *  merge is order-dependent (300 + 500 + 300 gives 800 + 300 from the left, 300 + 800 from the right)
 *  and `columns` iterates in insertion order, so sorting makes one design one picture. A block that
 *  cannot be written is retried one column shorter; a start that merges nothing leaves its first
 *  column and the scan resumes at the next, so a decline never swallows the columns after it. */
function planOneWall(
  onOneWall: readonly MeasuredColumn[],
  columns: ReadonlyMap<string, ColumnExtent>,
  records: readonly PlacementRecord[],
): readonly MergePlan[] {
  const sorted = [...onOneWall].sort((a, b) => a.leftMm - b.leftMm);
  const plans: MergePlan[] = [];
  const reserved = new Set<string>();
  let index = 0;
  while (index < sorted.length) {
    const plan = planWidestAcceptedBlockFrom(
      sorted,
      index,
      columns,
      records,
      reserved,
    );
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

/** The widest block starting here that the three guards accept, shortened a column at a time. Without
 *  the retry the scan is not maximal at its own start: four 200s with a body across the right-hand
 *  pair would decline entirely though the leftmost pair was legal. */
function planWidestAcceptedBlockFrom(
  sorted: readonly MeasuredColumn[],
  start: number,
  columns: ReadonlyMap<string, ColumnExtent>,
  records: readonly PlacementRecord[],
  reserved: ReadonlySet<string>,
): MergePlan | undefined {
  let members = widestBlockFrom(sorted, start);
  while (members.length > 1) {
    const plan = planBlock(members, columns, records, reserved);
    if (plan) return plan;
    members = members.slice(0, -1);
  }
  return undefined;
}

/** The widest contiguous sub-run starting here whose total stays at or under the cap. Refused, never
 *  truncated (ADR 0046): 600 + 400 stay as they are, three 300s become a 600 and a 300.
 *
 *  A column already wider than the cap yields a block of one. The branch stays so the split is
 *  reversible: 800 and its overflow never re-merge, while a `+50` bringing the total back under the
 *  ceiling restores the single column. */
function widestBlockFrom(
  sorted: readonly MeasuredColumn[],
  start: number,
): readonly MeasuredColumn[] {
  const first = sorted[start];
  if (!first) return [];
  const members = [first];
  let totalMm = first.widthMm;
  for (let next = start + 1; next < sorted.length; next += 1) {
    const candidate = sorted[next];
    const previous = members[members.length - 1];
    if (!candidate || !previous) break;
    if (!abuts(previous, candidate) || !agrees(previous, candidate)) break;
    if (totalMm + candidate.widthMm > MAX_EMPTY_COLUMN_WIDTH_MM) break;
    totalMm += candidate.widthMm;
    members.push(candidate);
  }
  return members;
}

function abuts(left: MeasuredColumn, right: MeasuredColumn): boolean {
  return Math.abs(right.leftMm - left.rightMm) <= EDGE_TOUCH_TOLERANCE_MM;
}

/** ADR 0046 rule 2, plus a third condition: `d`. A column's floor, `top` and `d` all travel into the
 *  openings a merged column offers, so merging a base-run column (`top` 0.86) with a cleared
 *  full-height one (2.6), or a wall-depth column (~0.33) with a base-depth one (0.60), would publish
 *  openings over ground or depth that never existed. Judged between neighbours; the merged extent
 *  takes the conservative envelope (`mergedExtent`). */
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

/** The merged extent, or nothing: the four reasons a run that may merge still does not. The two outer
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

/** The column the run becomes: its two outer edges and the conservative envelope of the rest (highest
 *  floor, lowest top, shallowest depth), never `max(top)` or `max(d)`, so the tolerance slack never
 *  becomes ground, ceiling or depth no member had.
 *
 *  Not claimed: `agrees` is judged between neighbours, so a chain may drift past the tolerance (620,
 *  600, 580 loses 40 mm of depth); and the envelope narrows `top` and `d`, so a second pass over a
 *  merged column may accept what the first refused. "Fixpoint" is measured, not guaranteed.
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
