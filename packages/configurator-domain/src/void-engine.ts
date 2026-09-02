import type {
  Design,
  DesignPlacement,
  EmptyColumn,
  StoredColumnExtent,
  DesignWall,
  Finish,
  Handle,
} from "./design.js";
import { mergeAdjacentEmptyColumns } from "./merge-empty-columns.js";
import { toExactMillimetres, toMetres } from "./millimetres.js";
import {
  alongWallCoordinate,
  deriveColumnKeyAt,
  LEVELS,
  LEVEL_SNAP_M,
} from "./module-grid.js";
import { deriveCabinetWorldTransform } from "./room-transforms.js";

// The column model has one front door, so everything that already reads `LEVELS`, `LEVEL_SNAP_M` or
// `deriveColumnKeyAt` from here goes on doing so. They are **defined** in `module-grid.ts`, which
// nothing in this package's column code imports back — see that module for the cycle it removes.
export {
  alongWallCoordinate,
  alongWallPosition,
  deriveColumnKeyAt,
  LEVELS,
  LEVEL_SNAP_M,
  MAX_EMPTY_COLUMN_WIDTH_MM,
} from "./module-grid.js";
export { mergeAdjacentEmptyColumns } from "./merge-empty-columns.js";
export { splitOversizedEmptyColumns } from "./split-oversized-empty-columns.js";

/** Smallest span (metres) that becomes a void. */
export const MIN_SPAN_M = 0.3;

/** `DEVELOPMENT-SPEC.md` §2's `MIN_W`: the **default** narrowest cabinet.
 *
 *  ADR 0026 reads this as a default rather than an absolute: an entry may declare a `minWidthMm`
 *  of its own in either direction, and one declaring a floor *below* this replaces it for that
 *  entry alone. Three rows declare downward since ADR 0030's amendment — `base-bottle-cargo`,
 *  the two hinged rows (`base-cabinet` and `wall-cabinet`, which ADR 0033 merged the former `base-1door`/`wall-1door` into) — and each is reachable only by being chosen deliberately.
 *
 *  **It is not a resize floor any more, in any direction** (ADR 0043, 2026-09-01). This doc used to
 *  say that a resize may consume an empty column to zero but must never leave it as a sliver under
 *  300 mm. The owner decided otherwise: *"Empty space can be even 100 mm or 50 mm, if somebody want
 *  to keep it."* A gap is not a cabinet and has no floor, so `setWidth` measures nothing against
 *  this constant — what it still governs is the narrowest **cabinet** anything may be built at. */
export const MIN_WIDTH_M = 0.3;

/** `DEVELOPMENT-SPEC.md` §2's `TOL`: the slack every width and height comparison uses. Frame
 *  numbers pass through unit conversions and are not bit-identical even when geometrically equal,
 *  so two values that should coincide are compared with this, never with `Number.EPSILON`. */
export const FIT_TOLERANCE_M = 0.012;

export type Band = "base" | "wall" | "top" | "column";

/** §7's width column: `'fit'` builds to the opening; a millimetre set builds only at those
 *  widths (the dishwasher niche's 450/600, a column's fixed 600, the bottle cargo's 200/300). */
export type WidthFlex = "fit" | readonly number[];

/** Why a body offers nothing structural — no swap list, no delete, no finish, no handle, no width.
 *  §11 row 16 requires the refusal to *explain why*, and a panel that offers nothing never produces
 *  a refusal to carry that explanation, so the reason is declared on the catalogue entry instead of
 *  being read back out of four false capability flags. */
export type StructuralReason = "corner";

import { occupiedDepthM, type OccupiedDepthRule } from "./occupied-depth.js";

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
/** An inclusive width range in millimetres, as `resolveWidthRangesMm` reads it. Both ends are real
 *  numbers: ADR 0035 decision 1 gives every cabinetry row a ceiling, so no range is open above. */
export interface WidthRangeMm {
  readonly minMm: number;
  readonly maxMm: number;
}

export interface BodyDefinition {
  readonly kind: string;
  readonly band: Band;
  readonly frameDepthMm: number;
  /** **How deep the space this body fills is** — §3.1's full extent on the depth axis, which
   *  `frameDepthMm` is not (ADR 0018: it is twice the body's rear overhang). Required, so a new
   *  entry cannot be added without answering the question: the catch-all it replaces answered it
   *  wrongly for four body families and nothing failed (DOM-002). `occupied-depth.ts` applies it. */
  readonly occupiedDepth: OccupiedDepthRule;
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
  /** §9's **modular** widths for this body — what a customer picks from. ADR 0035 derives them from
   *  `widthRangesMm` at a 50 mm step for a cabinetry row and states them literally for an appliance
   *  row; either way it is the bound, not this, that decides whether a width may be built. */
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
   *  means this body has no catalogue equivalent — the corner returns — and no row is badged,
   *  which is the correct answer for them rather than a missing one. The hob was the other example
   *  until ADR 0027 folded it into its cabinet: the surviving hob-bearing base declares
   *  `base-hob-2drawer`, so it is now a body that has one. */
  readonly catalogEquivalentId?: string;
  /** ADR 0027: the accessory `kind` this body has **built into it** — `induction_cooktop` on both
   *  hob-bearing bases and on the seeded cabinet they replaced.
   *
   *  Declared rather than inspected, for the reason `catalogEquivalentId` above is: the domain has
   *  no meshes to look at, so "this body already carries a hob" is a fact only the catalogue can
   *  state. It said what a body is made of before anything read it (ADR 0027 records that), and
   *  ADR 0038 put it back in that position: the §5.3 cascade that consumed it existed only to
   *  de-duplicate a hob on a document saved before ADR 0027, and no such document was ever stored.
   *  Absent means the body carries nothing of its own, which is every entry but three. */
  readonly carriesAccessoryKind?: string;
  /** ADR 0033: `true` marks an entry whose **door count the builder derives from the width**, so the
   *  displayed label counts doors that are decided at build time rather than declared here.
   *
   *  It exists because merging `wall-2door` + `wall-1door` (and the base pair) into one entry each
   *  removed the only thing that had ever said how many doors a row has: its name. §7's builder has
   *  always branched on `TWO_DOOR_MIN_WIDTH_MM` and has always been right at every width; what lied
   *  was the label, which is why ADR 0033 calls every defect in this class "a naming defect wearing
   *  geometry's clothes". `label` is now the entry's **generic** name — *Corp suspendat* — true at
   *  every width, and `describeBodyLabelAt` adds the count where a width is actually known.
   *
   *  **Declared, never inferred.** `kind` is not enough: `base-3drawer`, `base-panbank` and
   *  `base-sink` all carry `base_cabinet` and none of them has a hinged door to count. Absent means
   *  `false` — the label is whatever the row says — which is the conservative direction, since a row
   *  that forgets to declare shows its own name rather than a door count nothing verified. */
  readonly doorCountFollowsWidth?: boolean;

  /** ADR 0033's amendment, and after ADR 0035 decision 2 **the entry's width model**: the widths this
   *  body may actually be built to.
   *
   *  `sizesMm` and this are different facts and both are true. `sizesMm` is the **modular widths a
   *  customer picks from**; this is **what the body may be built to**, which is a continuum for
   *  cabinetry. A hinged cabinet's chips sit inside one unbroken range, 200–800 — the (400, 500) hole
   *  went with ADR 0030's retired cap — and a 570 mm opening takes an honest two-door even though
   *  570 is not a chip.
   *
   *  **Declared by every §7 row**, through `cabinetryWidths` or `discreteWidths` in `catalog.ts`,
   *  each of which produces this and `sizesMm` from one argument so the two cannot drift. Absent
   *  means the ranges are derived from `sizesMm` as one degenerate range per size — the conservative
   *  reading of a bare list, and no shipped row relies on it.
   *
   *  **Cabinetry is continuous between its bounds; appliances are discrete** (ADR 0035 decision 3). A
   *  dishwasher niche is 450 or 600 because dishwashers are, and `base-bottle-cargo` stays discrete
   *  for ADR 0026's own reason, that the proportion is the product. */
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
  /** Copied off the catalogue entry rather than resolved here, because the answer depends on
   *  `frame.d` for a parameterised wall carcass and `frame.d` is what a resize rewrites. Read it
   *  through `occupiedDepthM`, never directly: the rule is a declaration, not a depth. */
  readonly occupiedDepth: OccupiedDepthRule;
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
  return deriveColumnKeyAt(rotated ? "B" : "A", rotated ? frame.z : frame.x);
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
      occupiedDepth: definition.occupiedDepth,
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
      ...(placement.body.finish !== undefined
        ? { finishKey: placement.body.finish }
        : {}),
      ...(placement.body.handle !== undefined
        ? { handleMode: placement.body.handle }
        : {}),
    };
  });
}

/** A column's origin: along its wall from any member, across it from the column's own depth.
 *
 *  One function rather than two mirrored ternaries, because the mirrored pair — the same predicate
 *  negated on adjacent lines with the operands swapped — is the shape that gets transposed on the
 *  next edit (5F clean-code review S5). */
function originOnWall(
  member: PlacementRecord,
  centreM: number,
): { readonly x: number; readonly z: number } {
  return member.wall === "A"
    ? { x: member.frame.x, z: centreM }
    : { x: centreM, z: member.frame.z };
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

/** The two halves of the frozen map, as `Design` carries them and as `deriveColumns` restores them.
 *
 *  **One named object rather than two positional arrays, because the two are the same type.** The
 *  wire shape of a stored empty column and of a stored column extent is the same six fields, so two
 *  parameters would swap without a type error and restore each half onto the other — silently, with
 *  no symptom until a reload put a column where a space should be. Named fields make that swap
 *  unspellable.
 *
 *  Both halves are optional exactly as `Design` declares them: a document with no free space carries
 *  no `emptyColumns`, and one written before ADR 0053 carries no `columnExtents`. */
export interface FrozenMapDocument {
  readonly emptyColumns?: readonly EmptyColumn[] | undefined;
  readonly columnExtents?: readonly StoredColumnExtent[] | undefined;
}

/** §3.2: derived once at load from the seeded placement set, and never recomputed afterwards —
 *  `top` and `regions` are load-time facts, not a function of the design's current state.
 *
 *  Three sources, in one order that matters: the placements group into the columns they imply, then
 *  the document's own two stored halves are restored over them — the member-less columns nothing
 *  could rebuild (ADR 0044) and the frozen extents of the occupied columns the placements no longer
 *  imply (ADR 0053). Both arrive **before** the merge and before `hasFullHeightUnder` is answered,
 *  so every later step reads the extents the customer actually left behind.
 *
 *  `hasFullHeightUnder` is the exception and is answered here only because a load is also a
 *  derivation; every derivation after this one re-answers it through
 *  `withCurrentFullHeightMembers`. */
export function deriveColumns(
  records: readonly PlacementRecord[],
  stored: FrozenMapDocument = {},
): ReadonlyMap<string, Column> {
  const columns = new Map<string, ColumnExtent>();
  for (const [key, members] of groupByColumn(records)) {
    // §3.2's MAX is over the **space each member fills**, not over its recorded `frame.d`. The two
    // parted company in wave 5F: a fronted wall carcass records 39 mm less than it occupies
    // (ADR 0036) and a front-hung hood records 200 mm more (ADR 0039).
    //
    // **The column's own off-wall coordinate is derived from that depth, not borrowed from a
    // member's seat.** Those were the same fact until wave 5F, because every body was seated so its
    // back face met the plane — so nothing said they were two, and borrowing quietly stopped working
    // the moment a body was deliberately off the plane.
    //
    // A column is **the space a run occupies** (ADR 0031), and that space starts at the wall. So the
    // coordinate is `depth / 2` on the wall's normal axis, and no member's own deliberate offset —
    // ADR 0025's corner leg 20 mm inside the wall, ADR 0039's hood 100 mm off it — travels into the
    // column that holds it. `ry` and the wall still come from a member, because those are facts
    // about orientation rather than about the space.
    // Any member will do for the two facts that are about orientation rather than about space.
    const orientation = members[0];
    if (!orientation) {
      throw new Error(`deriveColumns: column ${key} has no members`);
    }
    const width = Math.min(...members.map((member) => member.frame.w));
    const depth = Math.max(...members.map(occupiedDepthM));
    const top = Math.max(
      ...members.map((member) => member.frame.y0 + member.frame.h),
    );
    const regions = members
      .map((member): [number, number] => [
        member.frame.y0,
        member.frame.y0 + member.frame.h,
      ])
      .sort((a, b) => a[0] - b[0]);
    const centre = depth / 2;
    columns.set(key, {
      key,
      wall: orientation.wall,
      ry: orientation.frame.ry,
      ...originOnWall(orientation, centre),
      w: width,
      d: depth,
      top,
      regions,
    });
  }
  addStoredEmptyColumns(columns, stored.emptyColumns ?? []);
  addStoredColumnExtents(columns, stored.columnExtents ?? []);
  // ADR 0046 part 2, at the load seam ADR 0037's merge never had. **After the stored spaces are
  // restored**, because they are most of what there is to merge, and **before**
  // `withCurrentFullHeightMembers`, because whether a full-height member stands under a column is a
  // fact about its extent and the merge is what writes the extents — the ordering `writeParts`
  // uses for the same reason.
  //
  // **That last ordering is not commutative in principle, and no reachable document distinguishes
  // it** — measured 2026-09-02, when swapping the two survived the whole suite. It is unfalsifiable
  // rather than unimportant: the merge widens a column and the full-height answer is a geometric
  // along-wall overlap over that width, so the two orders *can* disagree. What stops them today is
  // that wall A carries no full-height body at all, and on wall B the tall runs partition the wall,
  // so a member-less key only ever touches its tall neighbours and touching is not overlap. A
  // hand-built entry that did overlap one is refused before it reaches here. Both of those facts
  // are pinned by tests, so a wave that puts a tall body on wall A, or lifts that refusal, turns
  // them red rather than silently making this line matter.
  return withCurrentFullHeightMembers(
    mergeAdjacentEmptyColumns(columns, records),
    records,
  );
}

/** ADR 0044: the spaces nothing else can reconstruct, restored into the map the placements built.
 *
 *  After the grouping and never inside it. An empty column has no member, so it is restored rather
 *  than derived, and the member-less throw above stays exactly as it was — that one is about a
 *  column the *placements* produced, and a placement-derived column with no placements in it is
 *  still an impossible state.
 *
 *  **No key can collide here.** §3.2's key is a wall plus an along-wall coordinate at 10 mm
 *  granularity, so an entry recorded at an occupied column's centre, or two entries a few
 *  millimetres apart, would address one slot in this map and one of the two would be lost.
 *  `validateDesignForCatalog` refuses both shapes at the write seam and the load seam, so there is
 *  deliberately no tie-break here: a silent drop would be a space the document records and the
 *  derivation does not have, which is the failure the refusal exists to stop.
 *
 *  That statement is about **this** array and stays exactly as strong as it was. ADR 0053's
 *  `columnExtents` collides with the placements' keys on purpose, and it is a second array rather
 *  than a widening of this one precisely so that the nine refusals governing `emptyColumns` and the
 *  skip rule that makes them sound are untouched — see `addStoredColumnExtents`. */
function addStoredEmptyColumns(
  columns: Map<string, ColumnExtent>,
  emptyColumns: readonly EmptyColumn[],
): void {
  restoreStoredExtents(columns, emptyColumns);
}

/** ADR 0053: the frozen extents of the columns that **do** hold a member, restored over the ones
 *  their placements imply.
 *
 *  These entries land on keys the placements produced, deliberately — that is the whole point of
 *  them — so this is the one place in the derivation where a stored value overwrites a derived one.
 *  What makes that safe is not disjointness, which no longer holds here, but **precedence plus
 *  containment**:
 *
 *  - *Precedence*: a stored entry wins on the whole of ADR 0011 Gap D's extent — `x`, `z`, `w`, `d`,
 *    `top`, `regions`. Nothing else: membership comes from the records, and `hasFullHeightUnder` is
 *    still re-answered afterwards by `withCurrentFullHeightMembers`, so the extent-frozen /
 *    live-predicates-re-answered boundary is exactly where Gap D's own correction put it. Gap D is
 *    obeyed rather than overturned — re-deriving an occupied column's extent from its current
 *    records is precisely what this **stops** doing.
 *  - *Containment*: `validateDesignForCatalog` proves at both seams that every placement filed under
 *    the key lies inside the stored extent. So an overwrite can only ever widen a column: it can
 *    never lose a member or publish an opening over a body. That is strictly stronger than the
 *    disjointness it replaces, which only said the two halves never met.
 *
 *  It runs after `addStoredEmptyColumns` and the two arrays are partitioned by the same predicate
 *  (`projectFrozenMap`), so the order between them decides nothing: no key is in both.
 */
function addStoredColumnExtents(
  columns: Map<string, ColumnExtent>,
  columnExtents: readonly StoredColumnExtent[],
): void {
  restoreStoredExtents(columns, columnExtents);
}

/** One entry, one slot, through `toColumnExtent` — the same conversion for both stored arrays,
 *  because a frozen extent is one shape whether or not a body stands in it. */
function restoreStoredExtents(
  columns: Map<string, ColumnExtent>,
  stored: readonly EmptyColumn[],
): void {
  for (const entry of stored) {
    const extent = toColumnExtent(entry);
    columns.set(extent.key, extent);
  }
}

function toColumnExtent(emptyColumn: EmptyColumn): ColumnExtent {
  const alongM = toMetres(emptyColumn.alongMm);
  const depthM = toMetres(emptyColumn.depthMm);
  const y0M = toMetres(emptyColumn.y0Mm);
  const topM = toMetres(emptyColumn.topMm);
  // Through the transform a placement's own frame goes through, so a restored space stands where a
  // body recorded at the same coordinate would: the along-wall centre on the wall's tangent, and
  // the column's own half-depth on its normal (§3.2, and the origin rule in `deriveColumns`).
  const transform = deriveCabinetWorldTransform({
    wall: emptyColumn.wall,
    alongM,
    y0M,
    depthM,
  });
  return {
    key: deriveColumnKeyAt(emptyColumn.wall, alongM),
    wall: emptyColumn.wall,
    ry: transform.yawRadians,
    x: transform.position.x,
    z: transform.position.z,
    w: toMetres(emptyColumn.widthMm),
    d: depthM,
    top: topM,
    // The frozen extent as a single interval. §4 reads a column's floor and its top and nothing
    // between them (`deriveFreeSpans` takes `min(regions)` and `top`), and the members whose own
    // intervals these were are the bodies this space no longer holds.
    regions: [[y0M, topM]],
  };
}

/** ADR 0044's wire shape, written from the frozen map at the store seam: the columns of `columns`
 *  with no member in `records`, as the entries `deriveColumns` restores.
 *
 *  It is the exact inverse of `toColumnExtent`, and the pairing is the point — a space is stored so
 *  that a reload rebuilds the column the session was holding, not one that merely resembles it.
 *  The frozen map is an **argument** rather than something rederived here, so whichever map a later
 *  wave makes canonical (ADR 0046's merge answers pre- or post-merge) reaches the document without
 *  reopening this seam.
 *
 *  **Membership is asked by column key, which is what makes the result collision-free by
 *  construction.** A key is unique in the map it came from, and a key that any placement is filed
 *  under is skipped — so no entry can address an occupied column's slot at load, and no two entries
 *  can address each other's. That guarantee has to live here rather than in `validateDesignForCatalog`:
 *  since 5B2a a stored entry **overwrites** the placements' column instead of being dropped, and
 *  commands do not validate what they return, so a projection that merely expected to be checked
 *  would have already lost a column by the time anything looked. */
export function projectEmptyColumns(
  columns: ReadonlyMap<string, Column>,
  records: readonly PlacementRecord[],
): readonly EmptyColumn[] {
  return projectFrozenMap(columns, records).emptyColumns ?? [];
}

/** ADR 0053's wire shape: the frozen extent of every column of `columns` that **does** hold a
 *  member in `records` — `projectEmptyColumns`' exact complement, and the reason backlog 22's
 *  column comes back at 2600 mm instead of 860.
 *
 *  Same entries, same conversion, same refusals; only the side of the predicate differs. */
export function projectColumnExtents(
  columns: ReadonlyMap<string, Column>,
  records: readonly PlacementRecord[],
): readonly StoredColumnExtent[] {
  return projectFrozenMap(columns, records).columnExtents ?? [];
}

/** The whole frozen map as the document carries it: two arrays, disjoint by construction.
 *
 *  **One pass over one predicate, deliberately.** The two halves are partitioned by
 *  `occupiedKeys.has(key)` and by nothing else, so their disjointness is a property of this loop
 *  rather than of two independent scans agreeing with each other — and it is what lets
 *  `deriveColumns` restore both without either being able to overwrite the other. Written as one
 *  function for the same reason: a later edit cannot move a key into both halves without making
 *  this loop visibly contradict itself.
 *
 *  Every entry goes through `toEmptyColumn`, so `refuseUnreproducibleKey` and the whole-millimetre
 *  refusal apply to the occupied half exactly as they apply to the empty one. */
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
  // Sorted so one state has one document: `Map` iteration follows insertion order, and a resize
  // deletes and re-adds both keys it moves, so two sessions reaching the same kitchen by different
  // routes would otherwise serialise to two different strings and save each other's work back and
  // forth (ADR 0002's round-trip invariant is about one design, not about how it was reached).
  return {
    emptyColumns: emptyColumns.sort(compareEmptyColumns),
    columnExtents: columnExtents.sort(compareEmptyColumns),
  };
}

function compareEmptyColumns(left: EmptyColumn, right: EmptyColumn): number {
  if (left.wall !== right.wall) return left.wall < right.wall ? -1 : 1;
  return left.alongMm - right.alongMm;
}

function toEmptyColumn(key: string, column: Column): EmptyColumn {
  const alongM = column.wall === "A" ? column.x : column.z;
  const entry: EmptyColumn = {
    wall: column.wall,
    alongMm: exactMillimetresOf("alongMm", alongM, key),
    widthMm: exactMillimetresOf("widthMm", column.w, key),
    // §4 reads a column's floor and its top and nothing between them, and `resolveSnapY0M` reads
    // region starts only below a floor it is already standing on — so the frozen extent's lowest
    // start and its top are the whole of what a restored column has to reproduce. The intervals
    // between them belonged to bodies this space no longer holds.
    y0Mm: exactMillimetresOf("y0Mm", lowestRegionStartM(column, key), key),
    topMm: exactMillimetresOf("topMm", column.top, key),
    depthMm: exactMillimetresOf("depthMm", column.d, key),
  };
  return refuseUnreproducibleKey(entry, key);
}

/** The whole millimetre a frozen coordinate sits on, or a refusal.
 *
 *  **Never `Math.round`.** `deriveColumnKeyAt` renders metres with `toFixed(2)`, so rounding a
 *  centre of 3575.1 mm to 3575 keys the entry as its neighbour and two distinct columns collapse
 *  into one map slot on reload — the seam would be writing a document its own validator refuses
 *  (`EMPTY_COLUMN_KEY_COLLIDES_WITH_*`). `toExactMillimetres` accepts the float noise a metre
 *  value picks up crossing a unit conversion and refuses a value that genuinely sits between two
 *  millimetres, which is the distinction this needs and the one `Math.round` cannot make. */
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

/** The last of the two uniqueness halves: an entry has to key back to the slot it came from.
 *
 *  Skipping the occupied keys is only sound if a restored entry lands on its own key again, and
 *  that is arithmetic — `toFixed(2)` on a centre one ulp either side of a half-centimetre boundary
 *  can render differently. A mismatch is an impossible state rather than a case to handle, and it
 *  is refused rather than repaired: writing the recomputed key would move the space away from where
 *  the customer left it, and writing it anyway would silently overwrite a column at load. */
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

/** A frozen column the document cannot carry.
 *
 *  **Defence in depth, not the primary guard.** The primary guard is `refuseFractionalCentres`
 *  (`commands/apply-column-moves.ts`), which refuses the *command* when either centre a resize
 *  writes — a member's `alongMm` or a frozen column's `centreMm` — is not a whole millimetre. It
 *  covers only the resize path, and only the two centres: nothing checks a frozen column's `top`,
 *  `d` or floor, which are inherited from members whose own values the schema keeps whole.
 *
 *  It is deliberately not stated as unreachable, and the earlier claim that it was is what wave
 *  5B2b's QA disproved: the guard used to inspect the members alone, and a member centre is whole
 *  when the *delta* is even while a frozen centre is whole when the *extent's centre* is — two
 *  conditions that part company as soon as an extent's width is odd. No catalogue step size makes
 *  that impossible; the seeded kitchen already carries 320 mm and 570 mm bodies.
 *
 *  Thrown rather than dropped because a silently omitted entry is the defect ADR 0044 exists to
 *  fix, arriving by a new route. */
export class UnprojectableColumnError extends Error {
  constructor(key: string, reason: string) {
    super(`Column ${key} cannot be recorded as an empty column: ${reason}`);
    this.name = "UnprojectableColumnError";
  }
}

/** The keys whose membership an operation changed, comparing the placement records before and
 *  after it. A key is touched when the set of ids filed under it differs — which covers a body
 *  leaving a key, a body arriving at one, and a key that gained a member it did not have.
 *
 *  Membership rather than geometry, so that one body becoming two (backlog 2's re-split) is the
 *  same question as one body moving: the ids under the old key change and two new keys appear. */
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

/** §5.4's half of ADR 0011 Gap D: **re-derive the columns for the keys this operation touched,
 *  from the resulting records, and leave every other key exactly as it was.**
 *
 *  A column's key comes from a body's centre (§3.2), so a resize — the only operation that moves a
 *  body horizontally — moves bodies out of the columns that hold them. Keeping the whole map frozen
 *  through one then makes **two empty slots appear out of nowhere**: the resized bodies leave
 *  columns that still carry their regions, and the space they no longer occupy is derived as free.
 *  Nothing was deleted, and the model hallucinates openings.
 *
 *  Recomputing the whole map is not the fix and must never be the fix. Gap D exists because a
 *  cleared run has to keep the opening it just freed: recompute after a delete and `top` shrinks to
 *  what is left, so §10's signature flow — clear the fridge column, get three openings — yields
 *  none at all and the delete button reads as broken. So the update is per operation, and only a
 *  command that moved a body may ask for it.
 *
 *  **Stated for the record set, never for the roles.** It takes the records before and after and
 *  knows nothing about a "target" or a "donor", because backlog 2's re-split turns one body into
 *  two at the same total width and must be the same call with a different record set rather than a
 *  second mechanism.
 *
 *  A touched key with no members left is **dropped**. Keeping it would carry the departed body's
 *  own region forward as free space, which is the phantom-opening failure above.
 *
 *  Two consequences worth knowing, both bounded to the touched keys:
 *  - `w` is the MIN over members and `d` the MAX, so a key a body *left* can change its `w` for the
 *    bodies that stayed. That is the arithmetic §3.2 already specifies, applied to the new
 *    membership.
 *  - a re-derived key loses the load-time regions of members deleted earlier in the session. Only a
 *    key the operation actually moved a body through can be affected; every other key, and every
 *    delete, is untouched. */
export function rederiveTouchedColumns(
  columns: ReadonlyMap<string, Column>,
  recordsBefore: readonly PlacementRecord[],
  recordsAfter: readonly PlacementRecord[],
): ReadonlyMap<string, Column> {
  const touched = findTouchedColumnKeys(recordsBefore, recordsAfter);
  const rederived = deriveColumns(recordsAfter);
  const updated = new Map<string, ColumnExtent>(columns);
  for (const key of touched) {
    const column = rederived.get(key);
    if (column) updated.set(key, column);
    else updated.delete(key);
  }
  return withCurrentFullHeightMembers(updated, recordsAfter);
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
  const recordStart = alongWallCoordinate(record.wall, record.frame);
  const columnStart = alongWallCoordinate(column.wall, column);
  const overlap =
    Math.min(recordStart + record.frame.w, columnStart + column.w) -
    Math.max(recordStart, columnStart);
  return overlap > SPAN_EPSILON_M;
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
/** **§4 has no horizontal half.** A column's free spans come from its members' `y0`/`h` and the
 *  column's `top`; nothing subtracts the **width** a member occupies from the width the column has.
 *  So a body narrower than its column closes the level, and the remainder is stranded — no void, no
 *  column, no second insert. Backlog 2's re-split is the missing piece (§13.3 item 2).
 *
 *  **Closed for an insert on 2026-09-01 (ADR 0046 part 1), and this function is not where.** A body
 *  narrower than its column now **splits** that column before this runs (`commands/split-column.ts`),
 *  so no column is ever wider than its members and there is nothing here to subtract. Subtracting a
 *  width in this function was considered and rejected by name: it would make a void no column owns,
 *  and every consumer — `insertBody`'s `COLUMN_MISMATCH` guard, `deriveColumnKeyAt`, the frozen map,
 *  ADR 0031's funding scan — is written against the rule that an opening belongs to a column. The
 *  paragraphs below record why the gap existed and are kept as the reasoning behind that choice.
 *
 *  **This is not the merge's doing, and an earlier version of this note said it was.** Corrected
 *  2026-08-30 after product-logic review: the gap predates M5 and is reachable in four taps with no
 *  resize at all — clear `A|2.60`, insert a 300 mm bottle cargo into the 600 mm opening, and 300 mm
 *  of wall is gone. What ADR 0037's merge did was make it **unbounded and ordinary**, on the delete
 *  path backlog 2 was reported from, which is why it was withdrawn.
 *
 *  **And ADR 0035 decision 7 widened the same door.** A shrink hands width back to the empty column
 *  beside it, and nothing caps how wide that column may get: measured, clearing `A|2.60` and then
 *  pressing `−50` six times on `A|3.20` grows the empty column to **900 mm**, where every
 *  `widthFlex: 'fit'` cabinet is refused for trying to fill 900 against §7's 800 ceiling. Before
 *  decision 7 the only >800 column in the shipped kitchen was the corner's, and corners cannot be
 *  deleted — so a >800 *empty* column was unreachable and now takes nine taps.
 *
 *  Whether a shrink may widen an empty column past 800 is an open product question, recorded in
 *  `docs/milestones/M5-width.md`. */
export function recomputeVoids(
  records: readonly PlacementRecord[],
  columns: ReadonlyMap<string, Column>,
): VoidRecord[] {
  const membersByColumn = groupByColumn(records);
  const voids: VoidRecord[] = [];
  for (const column of columns.values()) {
    // **A column narrower than any cabinet still publishes its opening.** 5D2b's QA found a 50 mm
    // strip answering `offersFor` with sixteen rows and nothing offered, and asked whether it should
    // be an opening at all. It should: suppressing it would also hide the 190-199 mm openings the
    // bottle-cargo floor tests observe a refusal in, and ADR 0032's rule is *disabled with a reason*
    // rather than removed. What is owed is the **sentence** — §9 telling the customer the space is
    // too narrow for anything and may be left — and that is wave 5D2c's copy, recorded there.
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
