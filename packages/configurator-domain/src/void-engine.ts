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
 *  entry alone. Three rows declare downward since ADR 0030's amendment — `base-bottle-cargo`,
 *  the two hinged rows (`base-cabinet` and `wall-cabinet`, which ADR 0033 merged the former `base-1door`/`wall-1door` into) — and each is reachable only by being chosen deliberately.
 *
 *  ADR 0031 reads this constant for a different subject than §5.4 did. There is no donor any more,
 *  so nothing is left narrow as the residue of somebody else's edit; what this floors now is the
 *  **empty column a resize eats into**, which may be consumed exactly to zero but must never be
 *  left as a sliver under 300 mm that nothing can be inserted into.
 *
 *  **It floors consuming, never creating** (ADR 0035 decision 7). A shrink that makes its own empty
 *  column makes one 50 mm wide on the first step, and applying this floor there would disable the
 *  stepper outright; the owner has ruled that an opening no cabinet fits may simply be left
 *  (ADR 0037). `set-width.ts` says which side of that line each check is on. */
export const MIN_WIDTH_M = 0.3;

/** `DEVELOPMENT-SPEC.md` §2's `TOL`: the slack every width and height comparison uses. Frame
 *  numbers pass through unit conversions and are not bit-identical even when geometrically equal,
 *  so two values that should coincide are compared with this, never with `Number.EPSILON`. */
export const FIT_TOLERANCE_M = 0.012;

/** How close a free span's start must be to its level's own start to still count as "at" that
 *  level, per §4 rule 4 (a span starting mid-level stays one opening). */
export const LEVEL_SNAP_M = 0.02;

export type Band = "base" | "wall" | "top" | "column";

/** §7's width column: `'fit'` builds to the opening; a millimetre set builds only at those
 *  widths (the dishwasher niche's 450/600, a column's fixed 600, the bottle cargo's 200/300). */
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

/** §3.2's column key from a wall and an along-wall coordinate, at 10 mm granularity.
 *
 *  Exported because ADR 0031's resize moves an **empty** column, which by definition has no member
 *  to derive a key from — its extent is frozen (ADR 0011 Gap D) and its width is what moves. Its new
 *  key has to be derived the same way every occupied column's is, or a body later inserted into it
 *  lands under a key the map does not hold and `insertBody` refuses `COLUMN_MISMATCH`.
 *
 *  ADR 0035 decision 7 gives it a second caller for the same reason: a shrink *creates* an empty
 *  column at the extent it vacates, and that column has no member either. `set-width.ts` also uses
 *  it to ask whether the key it is about to create is one the map already holds. */
export function deriveColumnKeyAt(wall: DesignWall, alongM: number): string {
  return `${wall === "B" ? "B|" : "A|"}${alongM.toFixed(2)}`;
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

/** §3.2: derived once at load from the seeded placement set, and never recomputed afterwards —
 *  `top` and `regions` are load-time facts, not a function of the design's current state.
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

/** ADR 0037: **adjacent empty columns merge into one space**, and this is the whole of that rule.
 *
 *  Backlog 2 recorded the defect from a handset: clearing two neighbouring cabinets gives *two*
 *  openings, 800 and 600, never one 1400 — because §4 merges openings vertically within a column and
 *  columns are frozen horizontally at load. The number and position of the columns was therefore
 *  permanent, and a customer could never turn two cabinets into three.
 *
 *  **Empty means empty at every level**, which is the same predicate ADR 0031 already funds a resize
 *  from and is exactly "no record is filed under this key". Deleting one cabinet at one level merges
 *  nothing: the levels above and below are still occupied, so its space stays inside its own column.
 *
 *  **Merging does not lift the ceiling.** 800 mm still caps every cabinet (owner, 2026-08-28), so a
 *  merged 1400 mm space is filled with cabinets up to 800 rather than becoming one — and a span no
 *  cabinet fits may simply stay empty. What the merge buys is freedom over the *number and position*
 *  of cabinets in a span, which is what backlog 2 said was impossible.
 *
 *  The union is what §4 needs and nothing more: `regions` concatenated (only their minimum reaches
 *  `deriveFreeSpans`), `top` and `d` at the maximum, the extent from the outer edges, and the key
 *  derived at the new centre exactly as an occupied column's is. `hasFullHeightUnder` is not set
 *  here — it is not part of the frozen extent, and `withCurrentFullHeightMembers` re-answers it.
 *
 *  **The first exception to `deriveColumns`' horizontal freeze**, so it is bounded deliberately: a
 *  pair whose union would key onto a column the map already holds is left unmerged rather than
 *  written over. §3.2's columns may overlap along the wall, so that key can belong to an occupied
 *  run, and clobbering it would take ADR 0011 Gap D's frozen regions with it — the same hazard
 *  `set-width.ts`'s `refuseKeyCollision` guards. Two openings is a worse answer than one; a lost
 *  column is a broken design.
 *
 *  Repeated to a fixed point, so a chain of three empty columns becomes one space rather than two.
 *  It terminates because every pass removes one key. */
export function mergeAdjacentEmptyColumns(
  columns: ReadonlyMap<string, ColumnExtent>,
  records: readonly PlacementRecord[],
): ReadonlyMap<string, ColumnExtent> {
  const occupied = new Set(records.map((record) => record.col));
  const merged = new Map<string, ColumnExtent>(columns);
  for (
    let pair = findMergeablePair(merged, occupied);
    pair;
    pair = findMergeablePair(merged, occupied)
  ) {
    const union = uniteColumns(pair[0], pair[1]);
    merged.delete(pair[0].key);
    merged.delete(pair[1].key);
    merged.set(union.key, union);
  }
  return merged;
}

/** The leftmost mergeable pair, in key order so the same map always merges the same way — the
 *  reason `set-width.ts` orders its funding scan rather than taking whichever side a `Set` yields. */
function findMergeablePair(
  columns: ReadonlyMap<string, ColumnExtent>,
  occupied: ReadonlySet<string>,
): readonly [ColumnExtent, ColumnExtent] | undefined {
  const empty = [...columns.values()]
    .filter((column) => !occupied.has(column.key))
    .sort((left, right) => left.key.localeCompare(right.key));
  for (const left of empty) {
    for (const right of empty) {
      if (left.key === right.key || left.wall !== right.wall) continue;
      if (!abutsOnTheRight(left, right)) continue;
      const key = uniteColumns(left, right).key;
      if (columns.has(key) && key !== left.key && key !== right.key) continue;
      return [left, right];
    }
  }
  return undefined;
}

/** Adjacency is `left`'s right edge meeting `right`'s left edge, and nothing else — the same
 *  question `set-width.ts` asks of a funding column, answered with the same micron.
 *
 *  A micron rather than `===` because the two edges are reached through different arithmetic (a
 *  frozen load-time extent on one side, a resized one on the other), and a micron is four orders of
 *  magnitude below any gap a design can hold. Columns that *overlap* along the wall are not adjacent
 *  and are left alone: §3.2 permits the overlap, and uniting two of them would claim space a third
 *  column is keyed on. */
function abutsOnTheRight(left: ColumnExtent, right: ColumnExtent): boolean {
  return (
    Math.abs(columnEndM(left) - columnStartM(right)) <
    COLUMN_ABUTMENT_TOLERANCE_M
  );
}

const COLUMN_ABUTMENT_TOLERANCE_M = 1e-6;

function columnStartM(column: ColumnExtent): number {
  return alongWall(column.wall, column) - column.w / 2;
}

function columnEndM(column: ColumnExtent): number {
  return alongWall(column.wall, column) + column.w / 2;
}

/** Two abutting empty columns as one. The off-wall coordinate and `ry` come from the deeper of the
 *  two, matching `deriveColumns`' own choice of the deepest member — the merged opening has to seat
 *  a body at the depth the space actually offers. */
function uniteColumns(left: ColumnExtent, right: ColumnExtent): ColumnExtent {
  const startM = Math.min(columnStartM(left), columnStartM(right));
  const endM = Math.max(columnEndM(left), columnEndM(right));
  const centreM = (startM + endM) / 2;
  const deepest = left.d >= right.d ? left : right;
  return {
    key: deriveColumnKeyAt(left.wall, centreM),
    wall: left.wall,
    ry: deepest.ry,
    x: left.wall === "A" ? centreM : deepest.x,
    z: left.wall === "A" ? deepest.z : centreM,
    w: endM - startM,
    d: Math.max(left.d, right.d),
    top: Math.max(left.top, right.top),
    regions: [...left.regions, ...right.regions].sort(
      (first, second) => first[0] - second[0],
    ),
  };
}

/** The frozen map a command leaves behind: ADR 0037's merge, then the one live field re-answered.
 *
 *  One function rather than two calls at each site, because the two must happen together and in this
 *  order — `hasFullHeightUnder` is a fact about a column's extent, and the merge is what decides the
 *  extent. Every caller that re-derives records after a mutation asks through here; `deriveColumns`
 *  does not, because a load has no empty column to merge.
 */
export function columnsAfterMutation(
  columns: ReadonlyMap<string, ColumnExtent>,
  records: readonly PlacementRecord[],
): ReadonlyMap<string, Column> {
  return withCurrentFullHeightMembers(
    mergeAdjacentEmptyColumns(columns, records),
    records,
  );
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
