// The merge's block search the direct way: every length from the widest down judged by `planBlock` in full. The
// oracle the indexed search must equal map for map; do not optimise it. The tally shows a differential what it reached.
import {
  MILLIMETRES_PER_METRE,
  toExactMillimetres,
  toMetres,
} from "../../src/millimetres.js";
import type { DesignWall } from "../../src/design.js";
import {
  alongWallCoordinate,
  alongWallPosition,
  COLUMN_KEY_RESOLUTION_MM,
  deriveColumnKeyAt,
  LEVEL_SNAP_M,
} from "../../src/module-grid.js";
import type { ColumnExtent, PlacementRecord } from "../../src/void-engine.js";

const AGREEMENT_TOLERANCE_MM = LEVEL_SNAP_M * MILLIMETRES_PER_METRE;

const EDGE_TOUCH_TOLERANCE_MM = 1e-6;

const OVERLAP_EPSILON_MM = 1e-6;

const SAME_EDGE_OF_WALL_MM = COLUMN_KEY_RESOLUTION_MM + EDGE_TOUCH_TOLERANCE_MM;

const EDITOR_MERGE_WIDTH_LIMIT_MM = Number.POSITIVE_INFINITY;

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

interface WallScan {
  readonly records: readonly PlacementRecord[];
  readonly widthLimitMm: number;
}

type AlongWallStretchMm = Pick<WallSpanMm, "leftMm" | "rightMm">;

interface MergePlan {
  readonly members: readonly MeasuredColumn[];
  readonly column: ColumnExtent;
}

interface WallSpanMm {
  readonly wall: DesignWall;
  readonly leftMm: number;
  readonly rightMm: number;
  readonly floorMm: number;
  readonly topMm: number;
}

export function mergeByShorteningOneAtATime(
  columns: ReadonlyMap<string, ColumnExtent>,
  records: readonly PlacementRecord[],
  widthLimitMm: number = EDITOR_MERGE_WIDTH_LIMIT_MM,
): ReadonlyMap<string, ColumnExtent> {
  const scan: WallScan = { records, widthLimitMm };
  let merged = columns;
  let plans = planMerges(merged, scan);
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
    for (const member of plan.members) merged.delete(member.column.key);
    merged.set(plan.column.key, plan.column);
  }
  return merged;
}

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

function planOneWall(
  onOneWall: readonly MeasuredColumn[],
  columns: ReadonlyMap<string, ColumnExtent>,
  scan: WallScan,
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
      scan,
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

function planWidestAcceptedBlockFrom(
  sorted: readonly MeasuredColumn[],
  start: number,
  columns: ReadonlyMap<string, ColumnExtent>,
  scan: WallScan,
  reserved: ReadonlySet<string>,
): MergePlan | undefined {
  let members = widestBlockFrom(sorted, start, scan.widthLimitMm);
  const widest = members.length;
  while (members.length > 1) {
    const plan = planBlock(members, columns, scan.records, reserved);
    if (plan) {
      if (members.length < widest) recordEvent("acceptedShorterThanWidest");
      return plan;
    }
    members = members.slice(0, -1);
  }
  return undefined;
}

function widestBlockFrom(
  sorted: readonly MeasuredColumn[],
  start: number,
  widthLimitMm: number,
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
    if (totalMm + candidate.widthMm > widthLimitMm) break;
    totalMm += candidate.widthMm;
    members.push(candidate);
  }
  return members;
}

function abuts(left: MeasuredColumn, right: MeasuredColumn): boolean {
  return Math.abs(right.leftMm - left.rightMm) <= EDGE_TOUCH_TOLERANCE_MM;
}

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
  if (!landsOnWholeMillimetres(centreMm, widthMm)) {
    recordEvent("halfMillimetreCentre");
    return undefined;
  }

  const span: WallSpanMm = {
    wall: members[0]?.column.wall ?? "A",
    leftMm,
    rightMm,
    floorMm: Math.max(...members.map((member) => member.floorMm)),
    topMm: Math.min(...members.map((member) => member.topMm)),
  };
  if (!hasPositiveHeight(span)) {
    recordEvent("invertedEnvelope");
    return undefined;
  }
  if (standsIn(records, span)) {
    recordEvent("standsInABody");
    return undefined;
  }

  const key = deriveColumnKeyAt(span.wall, toMetres(centreMm));
  if (isKeyTaken(key, columns, members, reserved)) {
    recordEvent("keyTaken");
    return undefined;
  }
  if (standsOverAnotherColumn(span, columns, members)) {
    recordEvent("overAnotherColumn");
    return undefined;
  }

  return { members, column: mergedExtent(members, span, key, centreMm) };
}

function landsOnWholeMillimetres(centreMm: number, widthMm: number): boolean {
  return Number.isInteger(centreMm) && Number.isInteger(widthMm);
}

function hasPositiveHeight(span: WallSpanMm): boolean {
  return span.topMm - span.floorMm > 0;
}

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
    regions: [[floorM, topM]],
    ...alongWallPosition(shallowest.column.wall, centreM),
  };
}

/** The guard that declined a judged block, first to decline in `planBlock`'s order, or a block accepted only after a
 *  longer one from the same start was declined. */
export type BlockSearchEvent =
  | "halfMillimetreCentre"
  | "invertedEnvelope"
  | "standsInABody"
  | "keyTaken"
  | "overAnotherColumn"
  | "acceptedShorterThanWidest";

const events = new Map<BlockSearchEvent, number>();

function recordEvent(event: BlockSearchEvent): void {
  events.set(event, (events.get(event) ?? 0) + 1);
}

/** How often each event happened since the last `resetBlockSearchTally`. */
export function blockSearchTally(): ReadonlyMap<BlockSearchEvent, number> {
  return new Map(events);
}

export function resetBlockSearchTally(): void {
  events.clear();
}
