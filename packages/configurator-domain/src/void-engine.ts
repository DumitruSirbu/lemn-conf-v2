import type {
  Design,
  DesignPlacement,
  DesignWall,
  Finish,
  Handle,
} from "./design.js";
import { toMetres } from "./millimetres.js";
import { deriveCabinetWorldTransform } from "./room-transforms.js";

/** `DEVELOPMENT-SPEC.md` §2 module lines: base | wall | top. The 0.86–1.50 gap is backsplash and
 *  is never subdivided into — see the "no fallback" rule in `recomputeVoids`. */
export const LEVELS: readonly (readonly [number, number])[] = [
  [0, 0.86],
  [1.5, 2.2],
  [2.2, 2.6],
];

/** Smallest span (metres) that becomes a void. */
export const MIN_SPAN_M = 0.3;

/** `DEVELOPMENT-SPEC.md` §2's `MIN_W`: the **default** narrowest cabinet, and M5's resize floor.
 *
 *  ADR 0026 reads this as a default rather than an absolute: an entry may declare a `minWidthMm`
 *  of its own in either direction, and one declaring a floor *below* this replaces it for that
 *  entry alone. `base-bottle-cargo` is the only such row, and it is reachable only by being chosen
 *  deliberately — §5.4's donor rule reads this constant, so no resize can leave a neighbour under
 *  300 mm as the residue of somebody else's edit. */
export const MIN_WIDTH_M = 0.3;

/** `DEVELOPMENT-SPEC.md` §2's `TOL`: the slack every width and height comparison uses. Frame
 *  numbers pass through unit conversions and are not bit-identical even when geometrically equal,
 *  so two values that should coincide are compared with this, never with `Number.EPSILON`. */
export const FIT_TOLERANCE_M = 0.012;

/** How close a free span's start must be to its level's own start to still count as "at" that
 *  level, per §4 rule 4 (a span starting mid-level stays one opening). */
export const LEVEL_SNAP_M = 0.02;

/** `frame.h` below this marks a worktop accessory (§2, §6.1) rather than a body. */
export const ACCESSORY_MAX_HEIGHT_M = 0.3;

export type Band = "base" | "wall" | "top" | "column";

/** §7's width column: `'fit'` builds to the opening; a millimetre set builds only at those
 *  widths (the dishwasher niche's 450/600, the hood's 600/900, a column's fixed 600). */
export type WidthFlex = "fit" | readonly number[];

/** Why a body offers nothing structural — no swap list, no delete, no finish, no handle, no width.
 *  §11 row 16 requires the refusal to *explain why*, and a panel that offers nothing never produces
 *  a refusal to carry that explanation, so the reason is declared on the catalogue entry instead of
 *  being read back out of four false capability flags. */
export type StructuralReason = "corner";

export interface Frame {
  readonly x: number;
  readonly z: number;
  readonly ry: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
  readonly d: number;
}

/** Everything about a `buildId` that the `Design` wire schema does not carry: what the body is,
 *  where it sits in the module grid, and what a person is allowed to do to it. `frameHeightMm`
 *  defaults to the carcass `heightMm` when the full extent (accessories, proud fronts) matches it. */
export interface BodyDefinition {
  readonly kind: string;
  readonly band: Band;
  readonly frameDepthMm: number;
  readonly frameHeightMm?: number;
  readonly canFinish: boolean;
  readonly canHandle: boolean;
  readonly canReplace: boolean;
  readonly canDelete: boolean;
  readonly fixedWidth: boolean;
  /** ADR 0011 Gap A: `true` marks one of §7's parameterised catalogue entries, the only ones
   *  `insertBody` offers or accepts. Absent means `false` — M2's seeded entries each describe one
   *  specific already-built body and reproduce M1's scene, so offering one would build a fixed
   *  instance into an opening it was never measured for. */
  readonly insertable?: boolean;
  /** §7's Romanian catalogue name, on insertable entries. A seeded entry has none: nothing in the
   *  product ever offers it in a list, so `describeKindLabel` names it by kind instead. */
  readonly label?: string;
  readonly widthFlex?: WidthFlex;
  /** §7's `hFlex` column: the body builds to a cabinet-sized opening instead of its nominal
   *  height. */
  readonly heightFlex?: boolean;
  readonly nominalHeightMm?: number;
  /** This entry's nominal depth. §5.2 hands the *opening's* depth to the probe — capped for a wall
   *  carcass unless a full-height member stands under the opening — so this does not decide what
   *  gets built; it is catalogue data, and it is the entry's `frameDepthMm` fallback for a
   *  placement with no measured `seatDepthMm` of its own. A wall entry over a full-height column
   *  builds deeper than this. */
  readonly nominalDepthMm?: number;
  /** §9's width chips — the legal widths for this body. Delivered as a per-entry constant here;
   *  M5 wires them to the resize command. */
  readonly sizesMm?: readonly number[];
  /** ADR 0017: the narrowest width (millimetres) this body's own row permits. Absent means
   *  `MIN_WIDTH_M` governs, which is every entry but two.
   *
   *  It has a **direction** (ADR 0026). Declared *above* `MIN_WIDTH_M` it is a builder limitation:
   *  `base-sink` declares 560 because its worktop splits around a fixed sink aperture and inverts
   *  below that, and an entry that declares one this way is admitting its builder is not
   *  parameterised — parameterising it stays the real fix. Declared *below* `MIN_WIDTH_M` it is a
   *  product decision instead: `base-bottle-cargo` declares 200 because a 200 mm pull-out for
   *  bottles is a real cabinet, and it replaces the default floor for that one entry rather than
   *  lowering it for every `widthFlex: 'fit'` body in the catalogue. */
  readonly minWidthMm?: number;
  /** The insertable §7 entry this seeded entry is an instance of, so §9 can badge the swap row the
   *  customer is already standing on **ACTUAL**. ADR 0011 Gap A gives every seeded placement a
   *  non-insertable `buildId`, so the badge cannot come from comparing ids.
   *
   *  Declared per entry rather than inferred from kind + band + width, following ADR 0017's
   *  precedent: §6.3 records that inferring a body's identity produced a fridge housing labelled and
   *  priced as a pantry, and an inferred swap-row match is the same mistake one layer up. Absent
   *  means this body has no catalogue equivalent — the hob, the corner returns — and no row is
   *  badged, which is the correct answer for them rather than a missing one. */
  readonly catalogEquivalentId?: string;
  /** Present only on an entry that offers nothing structural, saying why (§11 row 16, §13.1). */
  readonly structuralReason?: StructuralReason;
}

export type BodyCatalog = ReadonlyMap<string, BodyDefinition>;

export interface PlacementRecord {
  readonly id: string;
  readonly buildId: string;
  readonly kind: string;
  readonly frame: Frame;
  readonly col: string;
  readonly wall: DesignWall;
  readonly rotated: boolean;
  readonly band: Band;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly canFinish: boolean;
  readonly canHandle: boolean;
  readonly canReplace: boolean;
  readonly canDelete: boolean;
  readonly fixedWidth: boolean;
  readonly accessory: boolean;
  readonly finishKey?: Finish;
  readonly handleMode?: Handle;
}

export interface Column {
  readonly key: string;
  readonly wall: DesignWall;
  readonly ry: number;
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly top: number;
  readonly regions: readonly (readonly [number, number])[];
  /** Whether a full-height member stands under this column — §7's head-clearance cap on a wall
   *  carcass is lifted over one, and applies everywhere else (`insert-fit.ts`,
   *  `WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M`).
   *
   *  **Stated positively on purpose.** It used to ask the opposite question — "is there a worktop
   *  under this opening" — and cap wherever the answer was no. The absence of a worktop is not the
   *  presence of a column: empty space is neither, and empty space is what a delete produces, so
   *  deleting the base cabinets under a wall run lifted the cap over nothing at all and built a
   *  580 mm carcass beside 330 mm neighbours. Backlog entry 5's rule is "over a full-height column
   *  there is nothing to lean over", and only the positive reading of it is safe when the column is
   *  empty. ADR 0011's third correction is the record.
   *
   *  **The one field on this record that is not frozen at load.** ADR 0011 Gap D freezes a
   *  column's *extent* — `x`, `z`, `w`, `d`, `top`, `regions` — because a cleared run must keep the
   *  opening it just freed. What stands under an opening is not part of that extent: it is a fact
   *  about **now**, so freezing it made one design answer two ways, depending on whether the member
   *  below was deleted in this session or in a previous one. Every derivation therefore re-answers
   *  it over the frozen extent — see `withCurrentFullHeightMembers`.
   *
   *  Declared, never inferred from a depth: `Column.d` is 580 over a base run and 600 over a tall
   *  column, and §6.3 records what inferring a body's identity from its measurements cost. `d` is
   *  also frozen while this is live, which is precisely how the two halves came to disagree.
   *
   *  Required rather than optional on purpose. An absent answer defaults to `false`, which is now
   *  the *conservative* direction — the cap applies — so a column that forgets to say builds a
   *  shallow cabinet rather than a deep one over a counter. */
  readonly hasFullHeightUnder: boolean;
}

/** A column's frozen half: everything ADR 0011 Gap D fixes at load. Naming the frozen half is what
 *  the type is for — a field added to `Column` has to be classified as frozen or live before this
 *  compiles, and the projections built on it (`apps/web/tests/support/column-extents.ts`) then
 *  follow.
 *
 *  It enforces nothing about `hasFullHeightUnder`: any `Column` literal sets that field directly, and
 *  several tests do. That `hasFullHeightUnder` is always current is held **by construction through a single
 *  funnel**, not by the type. In `src/` there is exactly one consumer that reads it
 *  (`commands/insert-fit.ts`), and every `Column` reaching it has passed through
 *  `withCurrentFullHeightMembers` — from `deriveColumns` at load, or from the store's `applyCommandResult`
 *  after each command. Adding a second route to that consumer breaks the invariant silently. */
export type ColumnExtent = Omit<Column, "hasFullHeightUnder">;

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

function deriveColumnKey(rotated: boolean, frame: Frame): string {
  const position = rotated ? frame.z : frame.x;
  return `${rotated ? "B|" : "A|"}${position.toFixed(2)}`;
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
): Frame {
  // ADR 0011 Gap B: an inserted body carries its own measured seat, because `frameDepthMm` is a
  // measurement of one specific seeded body and cannot seat a parameterised one.
  const depthM = toMetres(
    placement.body.seatDepthMm ?? definition.frameDepthMm,
  );
  const transform = deriveCabinetWorldTransform({
    wall: placement.wall,
    alongM: toMetres(placement.alongMm),
    y0M: toMetres(placement.y0Mm),
    depthM,
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

/** §3.1: the runtime record for a placement — its opening (`frame`, authoritative by carcass width
 *  and full-extent height/depth, never mesh bounds), its column, and its capability flags. */
export function derivePlacementRecords(
  design: Design,
  catalog: BodyCatalog,
): PlacementRecord[] {
  return design.placements.map((placement) => {
    const definition = lookupDefinition(catalog, placement.body.buildId);
    const frame = deriveFrame(placement, definition);
    const rotated = placement.wall === "B";
    return {
      id: placement.id,
      buildId: placement.body.buildId,
      kind: definition.kind,
      frame,
      col: deriveColumnKey(rotated, frame),
      wall: placement.wall,
      rotated,
      band: definition.band,
      widthMm: placement.body.widthMm,
      heightMm: placement.body.heightMm,
      canFinish: definition.canFinish,
      canHandle: definition.canHandle,
      canReplace: definition.canReplace,
      canDelete: definition.canDelete,
      fixedWidth: definition.fixedWidth,
      accessory: frame.h < ACCESSORY_MAX_HEIGHT_M,
      ...(placement.body.finish !== undefined
        ? { finishKey: placement.body.finish }
        : {}),
      ...(placement.body.handle !== undefined
        ? { handleMode: placement.body.handle }
        : {}),
    };
  });
}

function groupByColumn(
  records: readonly PlacementRecord[],
): Map<string, PlacementRecord[]> {
  const grouped = new Map<string, PlacementRecord[]>();
  for (const record of records) {
    if (record.accessory) continue;
    const bucket = grouped.get(record.col);
    if (bucket) bucket.push(record);
    else grouped.set(record.col, [record]);
  }
  return grouped;
}

/** §3.2: derived once at load from the seeded placement set, and never recomputed afterwards —
 *  `top` and `regions` are load-time facts, not a function of the design's current state.
 *  Accessories contribute nothing.
 *
 *  `hasFullHeightUnder` is the exception and is answered here only because a load is also a
 *  derivation; every derivation after this one re-answers it through
 *  `withCurrentFullHeightMembers`. */
export function deriveColumns(
  records: readonly PlacementRecord[],
): ReadonlyMap<string, Column> {
  const columns = new Map<string, ColumnExtent>();
  for (const [key, members] of groupByColumn(records)) {
    const deepest = members.reduce((deepestSoFar, member) =>
      member.frame.d > deepestSoFar.frame.d ? member : deepestSoFar,
    );
    const width = Math.min(...members.map((member) => member.frame.w));
    const depth = Math.max(...members.map((member) => member.frame.d));
    const top = Math.max(
      ...members.map((member) => member.frame.y0 + member.frame.h),
    );
    const regions = members
      .map((member): [number, number] => [
        member.frame.y0,
        member.frame.y0 + member.frame.h,
      ])
      .sort((a, b) => a[0] - b[0]);
    columns.set(key, {
      key,
      wall: deepest.wall,
      ry: deepest.frame.ry,
      x: deepest.frame.x,
      z: deepest.frame.z,
      w: width,
      d: depth,
      top,
      regions,
    });
  }
  return withCurrentFullHeightMembers(columns, records);
}

/** Re-answers "does a full-height member stand under this column" over frozen extents, and
 *  changes nothing else. The result is a new map; the extent fields are carried across untouched,
 *  so ADR 0011 Gap D still holds — a cleared run keeps the opening it freed.
 *
 *  It exists because the answer is **not** a load-time fact. Frozen, a column that had the member
 *  below it deleted in this session still reported the old answer, while the identical design
 *  reloaded reported the new one: one document, two depths, decided by the route the customer
 *  took. Every caller that re-derives records after a mutation must call this with them. */
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

/** §7's cap is lifted only by a full-height member, so this asks for one by name. `column` is the
 *  `Band` §7 gives every full-height unit — the tall pantry, the oven tower, the integrated fridge
 *  niche and the freestanding fridge — and it is the only band that reaches a person's head height,
 *  which is what "there is nothing to lean over" means.
 *
 *  **Asked of every full-height member on the wall, not of the column's own membership.** §7's cap
 *  is a head-clearance rule about what a person leans over, which is a question about geometry. A
 *  column key is one along-wall coordinate, so a wall cabinet hanging over the right-hand half of a
 *  wider unit has no member of its own; overlap is what decides.
 *
 *  Accessories are excluded for the reason `groupByColumn` drops them, and because no accessory is
 *  full-height.
 *
 *  **Same-wall only, deliberately.** Both walls originate at (0, 0, 0), so a wall-B cabinet in the
 *  inside corner is never lifted by a wall-A run standing physically beneath it. That is
 *  unreachable today — every wall-B corner column is 330 mm deep, so the cap it keeps is a no-op —
 *  and it becomes reachable only once a wall-B column exceeds 400 mm with no full-height wall-B
 *  member of its own. A corner special case was considered and rejected as not worth its cost;
 *  revisit it if that shape ever ships. */
function isFullHeightUnder(
  record: PlacementRecord,
  column: ColumnExtent,
): boolean {
  return (
    !record.accessory &&
    record.band === "column" &&
    record.wall === column.wall &&
    overlapsAlongWall(record, column)
  );
}

/** Overhanging, not merely adjoining. Two runs that meet on a module line share a boundary and
 *  nothing else, so the overlap has to be positive before the member counts as being *under* the
 *  opening — otherwise every cabinet beside a column would be uncapped. */
function overlapsAlongWall(
  record: PlacementRecord,
  column: ColumnExtent,
): boolean {
  const recordStart = alongWall(record.wall, record.frame);
  const columnStart = alongWall(column.wall, column);
  const overlap =
    Math.min(recordStart + record.frame.w, columnStart + column.w) -
    Math.max(recordStart, columnStart);
  return overlap > SPAN_EPSILON_M;
}

/** The along-wall coordinate: `x` on wall A, `z` on wall B — the same axis `deriveColumnKey`
 *  buckets on. */
function alongWall(
  wall: DesignWall,
  position: { readonly x: number; readonly z: number },
): number {
  return wall === "A" ? position.x : position.z;
}

interface FreeSpan {
  readonly lo: number;
  readonly hi: number;
}

/** Float noise from the millimetre↔metre round trip. A nanometre is four orders of magnitude below
 *  the micron the boundary tests probe with, and eight above the ~1e-16 error a subtraction of two
 *  module coordinates carries. */
const SPAN_EPSILON_M = 1e-9;

/** §4: a free interval becomes an opening only when it **exceeds** `MIN_SPAN_M` — that is §4's own
 *  pseudocode (`> MIN_SPAN`), and §2's "smallest span that becomes a void" names the threshold
 *  rather than claiming a span of exactly that size qualifies. Exactly 300 mm is therefore **not**
 *  an opening.
 *
 *  The epsilon is what makes that decision the same wherever the interval came from. The identical
 *  300 mm gap reaches this function as `0.86 - 0.56` (0.29999999999999993) below the base line and
 *  as `2.2 - 1.9` (0.30000000000000027) below the wall line, and a bare `>` answers those two
 *  differently. Every caller must ask through here for that reason. */
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

/** §4: free vertical space per column, subdivided by `LEVELS`. Pure function of `records` and
 *  `columns` — no dependence on call order, no mutation, no mesh disposal (the adapter's job). */
export function recomputeVoids(
  records: readonly PlacementRecord[],
  columns: ReadonlyMap<string, Column>,
): VoidRecord[] {
  const membersByColumn = groupByColumn(records);
  const voids: VoidRecord[] = [];
  for (const column of columns.values()) {
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
