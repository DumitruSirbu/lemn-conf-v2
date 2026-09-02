// M5B wave 5B4b — ADR 0046 part 2: adjacent empty columns on the same wall and row become one
// column, when the run's total is at most `MAX_EMPTY_COLUMN_WIDTH_MM`.
//
// That constant was this module's own `MERGE_CAP_MM` until wave 5G. ADR 0052 made it the ceiling on
// *any* empty column rather than on a merge alone, so it moved to `module-grid.ts` where the width
// command, the validator and the v1 migration can read the same 800.
//
// Beside `commands/split-column.ts` rather than inside `void-engine.ts`, for the reason ADR 0046
// gives by name: an opening belongs to a column, so §4's horizontal half is written as a rule about
// the frozen map and never as a subtraction inside `recomputeVoids`.
//
// **It declines; it never refuses.** Its two call sites are `deriveColumns`, which is pure and
// cannot fail a load, and the store's `resolveColumns`, which runs *after* the command has already
// succeeded — neither has a rejection channel, so a run this cannot merge safely is left exactly as
// it was. Two unmerged empty columns are a legal state (ADR 0043, and ADR 0037's *"ok to have empty
// space left"*); a throw from ordinary input is not.
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
// **Types only, and that is what keeps this module a leaf.** `void-engine.ts` imports this one for
// its values, so a value imported back would close a runtime cycle; a type is erased and closes
// nothing. `module-grid.ts` carries what the cycle cost when the key and the snap still lived in the
// engine.
import type { ColumnExtent, PlacementRecord } from "./void-engine.js";

/** §4's own snap, in the millimetres this module measures in — which is what the owner's *"same
 *  row"* means in the engine's terms (ADR 0046 rule 2).
 *
 *  A module constant is safe because `LEVEL_SNAP_M` comes from `module-grid.ts`, which imports
 *  nothing this module is in a cycle with. It was **not** safe while the constant lived in
 *  `void-engine.ts`: that module imports this one, so the read here ran before its body had bound
 *  the constant, the tolerance was `NaN`, every comparison answered false, and the merge silently
 *  never fired with nothing throwing anywhere. Measured during this wave, which is why the constants
 *  moved rather than the read. */
const AGREEMENT_TOLERANCE_MM = LEVEL_SNAP_M * MILLIMETRES_PER_METRE;

/** Edges must **meet**. The coordinates compared are exact halves of whole millimetres, so this
 *  forgives float noise and nothing else: a tolerance anywhere near a width a customer can leave
 *  would merge across wall that no column owns (ADR 0046, and criterion 10's 10 mm gap). */
const EDGE_TOUCH_TOLERANCE_MM = 1e-6;

/** Positive overlap, never a shared boundary — `overlapsAlongWall`'s rule, in millimetres. Two runs
 *  that meet on a module line share an edge and nothing else, and every merge is built out of
 *  columns that meet on one. */
const OVERLAP_EPSILON_MM = 1e-6;

/** One empty column as the scan reads it: whole millimetres throughout, so the cap, the edges and
 *  the merged centre are integer arithmetic rather than metre floats.
 *
 *  `leftMm` and `rightMm` are half-integers when the width is odd — a document holds an integer
 *  centre, not an integer edge — which is exactly the case `refuseFractionalCentre` exists for. */
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

/** The along-wall and vertical reach of one run of wall — the shape the occupancy check compares,
 *  and deliberately the same pair `validateDesignForCatalog` sweeps for
 *  `EMPTY_COLUMN_OVERLAPS_PLACEMENT`. */
interface WallSpanMm {
  readonly wall: DesignWall;
  readonly leftMm: number;
  readonly rightMm: number;
  readonly floorMm: number;
  readonly topMm: number;
}

/** ADR 0046 part 2 over a frozen map: the empty columns that may become one, replaced by the column
 *  they become. Every other key passes through untouched.
 *
 *  `hasFullHeightUnder` is **not** answered here. Whether a full-height member stands under a column
 *  is a fact about its extent, and the extents are what this rewrites, so both callers run
 *  `withCurrentFullHeightMembers` over the result — the single funnel `ColumnExtent` names.
 *
 *  The input map is returned by identity when nothing merges, so the overwhelmingly common case —
 *  a kitchen with no adjacent empty pair, which includes the shipped one — costs a scan and no
 *  allocation. */
export function mergeAdjacentEmptyColumns(
  columns: ReadonlyMap<string, ColumnExtent>,
  records: readonly PlacementRecord[],
): ReadonlyMap<string, ColumnExtent> {
  const plans = planMerges(columns, records);
  if (plans.length === 0) return columns;

  const merged = new Map<string, ColumnExtent>(columns);
  for (const plan of plans) {
    // Vacated before the merged column is written, because a merged centre may key back onto one of
    // its own members' keys — the split's rule, for the same reason (`writeParts`).
    for (const member of plan.members) merged.delete(member.column.key);
    merged.set(plan.column.key, plan.column);
  }
  return merged;
}

/** The empty columns of the map, wall by wall, as runs the greedy scan can read.
 *
 *  "Empty" is ADR 0037's predicate, carried forward by ADR 0046 and deliberately the one ADR 0031
 *  funds a resize from: **no record is filed under this key, at any level.** Deleting one cabinet
 *  from a column merges nothing. */
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

/** A column the document could not carry is not a column this may merge. `projectEmptyColumns`
 *  reads every one of these five values back through `toExactMillimetres` at the store seam, so
 *  measuring them here means a merged extent is projectable by construction rather than by
 *  argument — and a column already off the millimetre grid is left exactly as it was, to fail (or
 *  not) wherever it did before. */
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

/** ADR 0046 rule 1: **greedy, left to right, over the run sorted by along-wall coordinate.**
 *
 *  The capped merge is order-dependent where ADR 0037's uncapped one was not — 300 + 500 + 300 gives
 *  800 + 300 from the left and 300 + 800 from the right — and `columns` is a `Map` iterating in
 *  insertion order, which a resize and a split both rewrite. Sorting first is what makes one design
 *  one picture whatever order the customer's commands ran in.
 *
 *  A block that cannot be written — a fractional centre, an inverted extent, a body standing in the
 *  span, a key another column holds — is retried one column shorter, and a start that merges nothing
 *  leaves its first column where it is and the scan resumes at the next one, so a decline never
 *  swallows the columns after it. */
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

/** The widest block starting here that the three guards accept, shortened a column at a time until
 *  one does or nothing is left to merge.
 *
 *  Without the retry the scan is greedy but not maximal at its own start: four 200s with a body
 *  standing across the right-hand pair decline as a four, as a three and as a two-from-the-left's
 *  successor, and nothing merges where the leftmost pair was legal. Under-merging is a state ADR
 *  0037 permits — *"ok to have empty space left"* — but it is not ADR 0046 rule 1, which asks for
 *  the widest run that fits. Bounded by the block's own length, which the cap holds at a handful of
 *  columns. */
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

/** The widest contiguous sub-run starting here whose total stays at or under the cap. **Refused,
 *  never truncated** (ADR 0046): what does not fit is left at its own edges, so 600 + 400 stay a 600
 *  and a 400 and three 300s become a 600 and a 300.
 *
 *  A column already wider than the cap yields a block of one and merges with nothing. Under ADR 0052
 *  no command can produce one, and the v1 migration splits the last place a stored one could hide —
 *  but the branch stays, because it is also what makes the split of ADR 0052 **reversible**: 800 and
 *  its overflow never re-merge, while a `+50` that brings the run's total back under the ceiling
 *  restores the single column the customer started with (criterion 5G-2). */
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

/** ADR 0046 rule 2, **sharpened by a third condition this wave adds: `d`.**
 *
 *  `deriveFreeSpans` reads a column's floor and its `top`, and `recomputeVoids` publishes its `d`, so
 *  all three travel into the openings a merged column offers. Merge a base-run column (`top` 0.86)
 *  with a cleared full-height one (2.6) and a naive envelope publishes wall-level and top-level
 *  openings over ground that never had any — §4 rule 1 verbatim. Merge a cleared wall-depth column
 *  (~0.33) with a base-depth one (0.60) and the customer is offered 600 mm of depth where 330 was,
 *  or loses 270 mm of real depth, depending which way the envelope leans. Neither is acceptable, so
 *  columns whose depths disagree stay separate.
 *
 *  Judged between **neighbours**, which is what "same row as the column beside it" means; the merged
 *  extent then takes the conservative envelope (see `mergedExtent`), so the millimetres of slack this
 *  tolerance allows can never become ground the merge invented. */
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

/** The merged extent, or nothing — the four reasons a run that *may* merge still does not.
 *
 *  ADR 0031's arithmetic: the two outer edges hold and the width is what lies between them, so the
 *  run's total is conserved and neither an overlap nor a gap is representable. */
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

/** The centre guard, **inside the merge and before any extent is written**, and it *declines* — the
 *  reason it cannot refuse is that neither call site has a rejection channel (see this file's head).
 *
 *  `centreMm` is `leftMm + widthMm / 2`, fractional whenever the run's total is odd. Every width in
 *  the shipped kitchen is even and ADR 0035's step is 50 mm, so today it is whole by **coincidence
 *  and not by rule** — the same shape of coincidence that produced 5B2b's blocker
 *  (`refuseFractionalCentres` inspected member centres, which are whole when the *delta* is even,
 *  while a frozen centre is whole when the *extent's* centre is) and 5B4a's
 *  `refuseFractionalParts`.
 *
 *  It is `projectEmptyColumns`' own question, asked one seam earlier: that function reads a frozen
 *  column's along-wall coordinate and width through `toExactMillimetres` and throws
 *  `UnprojectableColumnError`, which `applyCommandResult` deliberately does not catch. So the values
 *  tested here are the ones `toExactMillimetres` produced, tested with `Number.isInteger` — and
 *  **never rounded**: `deriveColumnKeyAt` renders metres with `toFixed(2)`, so a rounded centre keys
 *  a column as its neighbour and two extents collapse into one map slot. */
function landsOnWholeMillimetres(centreMm: number, widthMm: number): boolean {
  return Number.isInteger(centreMm) && Number.isInteger(widthMm);
}

/** The envelope below takes the highest floor and the lowest top, so it **inverts** when the members
 *  are shorter than the tolerance they agree within: two abutting columns 1 mm tall, floors 0 and
 *  20 mm, agree on every condition and merge to a floor of 20 above a top of 1.
 *
 *  That is the shape `EMPTY_COLUMN_INVERTED` was added for in 5B2a, and it is refused here for the
 *  reason that record gives — an inverted interval overlaps nothing, so `standsIn` cannot see it and
 *  neither can the document's own overlap sweep, while `deriveFreeSpans` would read an opening that
 *  runs backwards. Unreachable from the UI; reachable from a crafted document, which is exactly what
 *  the load seam hands this function. */
function hasPositiveHeight(span: WallSpanMm): boolean {
  return span.topMm - span.floorMm > 0;
}

/** Trap 5, and the same geometric-rather-than-membership correction ADR 0011 applied to
 *  `hasFullHeightUnder` on 2026-08-26: **seeded columns overlap**, so a run whose members merely
 *  touch at their edges can still enclose ground a third column's member stands on. `A|0.45`'s
 *  900 mm corner base spans 0–900 across both `A|0.30` and `A|0.75`; on wall B `p9` spans 330–900
 *  under `p26`'s 580–900.
 *
 *  Positive in both axes, which is `EMPTY_COLUMN_OVERLAPS_PLACEMENT`'s own predicate — so a merged
 *  extent cannot be projected into an entry the validator refuses, and a body is never offered space
 *  it is standing in.
 *
 *  Every record counts: ADR 0038 deleted the standalone-accessory machinery, so no placement is
 *  anything but a body. */
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

/** A record's own reach, in the millimetres the span is measured in. Converted rather than rounded:
 *  the comparison it feeds is against `OVERLAP_EPSILON_MM`, four orders of magnitude above the noise
 *  a metre subtraction carries and far below any width a design can hold. */
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

/** A merged centre can land in a 10 mm bucket some other column already owns — the corner is the
 *  live example, where two cleared wall columns spanning 0–900 would key as `A|0.45`, the corner
 *  base's own column, and overwrite it in the map. The document says the same thing at its own seam
 *  (`EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT`), so the merge declines rather than nudging the key:
 *  a nudged key puts the space somewhere the customer did not free.
 *
 *  The run's own keys are excluded because they are vacated before the merged column is written.
 *  `reserved` carries the keys blocks earlier in this same scan have claimed, which the map does not
 *  yet hold. */
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

/** The column the run becomes: its two outer edges, and **the conservative envelope of everything
 *  else** — the highest floor, the lowest top, the shallowest depth. Never `max(top)` or `max(d)`:
 *  the members agree within `AGREEMENT_TOLERANCE_MM` and the envelope spends that slack on the safe
 *  side, so a merged column never publishes an opening over ground, above a ceiling or into a depth
 *  that no member of it had.
 *
 *  **Two things this does not claim.** `agrees` is judged between neighbours, so a chain may drift
 *  further than the tolerance — 620, 600, 580 loses 40 mm of depth, not 20 — which the envelope
 *  keeps on the safe side but does not bound. And because the envelope *narrows* `top` and `d`, it
 *  can change the very predicate that produced it: tops of 580, 600 and 578 refuse as a chain and a
 *  second pass over the merged 580 may accept what the first did not. The merge is monotone in the
 *  wall it covers, never in the map's key set, so "fixpoint" is a measured property of the chains
 *  tested rather than an arithmetic guarantee.
 *
 *  **The shallowest member is the template**, and that is not a stylistic choice: a column's
 *  off-wall coordinate is its own half-depth (`deriveColumns`), so the extent that keeps `d` must be
 *  the one that keeps `x`/`z` with it. Everything else the members share — `wall`, `ry` — comes
 *  across with it. */
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
    // One interval, as a frozen empty extent always is: §4 reads a column's floor and its top and
    // nothing between them, and the intervals between belonged to bodies this space no longer holds
    // (`toColumnExtent`).
    regions: [[floorM, topM]],
    ...alongWallPosition(shallowest.column.wall, centreM),
  };
}
