// `DEVELOPMENT-SPEC.md` §5.2's guards, in the spec's order, for everything decidable before a body is
// built. §9's offer list and `insertBody` must agree exactly (§11 row 6), so both call this.
import {
  deriveSlotBand,
  isBandAccepted,
  normaliseBand,
  type NormalisedBand,
  type SlotExtent,
} from "../bands.js";
import {
  acceptsWidthMm,
  buildableSizes,
  kindLabel,
  resolveWidthRangesMm,
  type BodyLabel,
  type InsertableBody,
} from "../catalog.js";
import type { DesignWall } from "../design.js";
import {
  MILLIMETRES_PER_METRE,
  toExactMillimetres,
  toMetres,
  toMillimetres,
} from "../millimetres.js";
import { alongWallCoordinate } from "../module-grid.js";
import { findVacatedVoid } from "../queries/vacated-void.js";
import {
  recomputeVoids,
  FIT_TOLERANCE_M,
  LEVELS,
  MIN_WIDTH_M,
  VOID_KIND,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../void-engine.js";
import {
  occupiedDepthM,
  recordedClearanceM,
  type ClearanceM,
} from "../occupied-depth.js";
import {
  buildToTheClearanceM,
  columnBuildDepthM,
  shallowerBuildDepthM,
  type BuildDepthM,
} from "../cabinet-depth-rule.js";
import { alongWallM } from "./along-wall.js";
import type { CommandTarget } from "./command-result.js";
import type { RejectionDetail } from "./rejection.js";

/** §9: a height-flexible body needs this much opening before it is worth building — below it the
 *  carcass is a strip, not a cabinet. */
export const HEIGHT_FLEX_MIN_OPENING_MM = 400;

/** §5.2: a height-flexible body fills an opening this tall or shorter, and otherwise builds its
 *  nominal height. A 750 mm over-fridge slot gets a 750 mm unit; a cleared 2600 mm column does not
 *  get a 2600 mm wall cabinet. */
export const CABINET_SIZED_OPENING_MAX_M = 0.9;

/** Float noise from the millimetre↔metre round trip. Not a fit tolerance: `FIT_TOLERANCE_M` is the
 *  slack two independently derived measurements get; this is the slack `2.2 * 1000` gets. */
const COORDINATE_EPSILON_M = 1e-6;

/** The opening a body is inserted into: a derived void or, on a swap in place (§5.3), the level slot
 *  an occupied body stands in. One shape, so the guards cannot fork. */
export interface InsertOpening {
  readonly col: string;
  readonly wall: DesignWall;
  /** The along-wall coordinate: `x` on wall A, `z` on wall B or C (ADR 0132 decision 1). The
   *  wall-normal coordinate is not taken from here; it comes from the body's own measured seat
   *  (ADR 0011 Gap D). */
  readonly alongM: number;
  readonly w: number;
  /** How deep the opening is — a `ClearanceM`, never the depth a body is built to, which is a
   *  `BuildDepthM` that `resolveDepthM` derives (ADR 0060 decision 1). It belongs to the opening, not
   *  to `Column.d`, which is the MAX over the whole vertical run. */
  readonly d: ClearanceM;
  readonly y0: number;
  readonly h: number;
  readonly spanY0: number;
  readonly spanH: number;
}

export function openingFromVoid(record: VoidRecord): InsertOpening {
  return {
    col: record.col,
    wall: record.wall,
    alongM: record.wall === "A" ? record.x : record.z,
    w: record.w,
    // `VoidRecord.d` is a plain number because the frozen map persists it and a stored extent
    // arrives off the wire; restate it as the `ClearanceM` it is.
    d: recordedClearanceM(record.d),
    y0: record.y0,
    h: record.h,
    spanY0: record.spanY0,
    spanH: record.spanH,
  };
}

/** §5.3: the opening a swap targets is the one the level provides — the void this body's removal
 *  would create — not the outgoing body's own frame: seeded base cabinets record 820 mm while §7's
 *  base bodies build to the 860 mm worktop line, so reading the frame would refuse every base row.
 *
 *  Only width and depth come from the body: width because a swap is in place and an opening is never
 *  subdivided horizontally; depth because voids carry their column's MAX depth (§3.2), which would
 *  hand a wall cabinet the depth of the base cabinet under it. */
export function openingFromPlacement(
  record: PlacementRecord,
  records: readonly PlacementRecord[],
  columns: ReadonlyMap<string, Column>,
): InsertOpening {
  const slot = findVacatedSlot(record, records, columns);
  const y0 = slot?.y0 ?? record.frame.y0;
  return {
    col: record.col,
    wall: record.wall,
    alongM: record.wall === "A" ? record.frame.x : record.frame.z,
    w: record.frame.w,
    d: vacatedOpeningDepthM(record),
    y0,
    h: slot?.h ?? record.frame.h,
    spanY0: slot?.spanY0 ?? record.frame.y0,
    spanH: slot?.spanH ?? record.frame.h,
  };
}

/** `occupiedDepthM` under the name this call site reads it by: the clearance of the space a body
 *  vacates (rule in `occupied-depth.ts`). The `ClearanceM` return type carries through to
 *  `resolveDepthM` (ADR 0060 decision 1). */
const vacatedOpeningDepthM: (record: PlacementRecord) => ClearanceM =
  occupiedDepthM;

/** The void that would cover this body if it were removed — §4's derivation with the target taken
 *  out, so a swap and a delete-then-insert see the identical opening. The lookup is
 *  `findVacatedVoid`'s so the two cannot select different levels. */
function findVacatedSlot(
  record: PlacementRecord,
  records: readonly PlacementRecord[],
  columns: ReadonlyMap<string, Column>,
): VoidRecord | undefined {
  const remaining = records.filter((other) => other.id !== record.id);
  return findVacatedVoid(recomputeVoids(remaining, columns), {
    col: record.col,
    y0: record.frame.y0,
    wall: record.wall,
    alongM: alongWallCoordinate(record.wall, record.frame),
  });
}

/** The opening a command or an offer list was pointed at, resolved. */
export interface ResolvedOpening {
  readonly opening: InsertOpening;
  readonly column: Column;
  /** Present on a swap in place: the body currently standing in the opening. */
  readonly replaced?: PlacementRecord;
}

export interface OpeningLookup {
  readonly records: readonly PlacementRecord[];
  readonly voids: readonly VoidRecord[];
  readonly columns: ReadonlyMap<string, Column>;
  readonly target: CommandTarget;
}

export type OpeningResolution =
  | { readonly ok: true; readonly value: ResolvedOpening }
  | { readonly ok: false; readonly detail: RejectionDetail };

/** §5.2 fills a void; §5.3 hands the same path the current body's own frame. `insertBody` and §9's
 *  offer list resolve their target here, so an offered body and an accepted body are measured
 *  against the identical opening. */
export function resolveInsertOpening(lookup: OpeningLookup): OpeningResolution {
  const found = findOpening(lookup);
  if (!found.ok) return found;
  const column = lookup.columns.get(found.value.opening.col);
  if (!column) {
    return {
      ok: false,
      detail: {
        code: "COLUMN_MISMATCH",
        params: { label: openingLabel(found.value) },
      },
    };
  }
  return { ok: true, value: { ...found.value, column } };
}

/** A void has no body to name, so it is named by `VOID_KIND`, which the catalogue does not name and
 *  which therefore resolves to the generic word. */
function openingLabel(value: Omit<ResolvedOpening, "column">): BodyLabel {
  return kindLabel(value.replaced?.kind ?? VOID_KIND);
}

type PartialResolution =
  | { readonly ok: true; readonly value: Omit<ResolvedOpening, "column"> }
  | { readonly ok: false; readonly detail: RejectionDetail };

function findOpening(lookup: OpeningLookup): PartialResolution {
  const notFound: RejectionDetail = { code: "TARGET_NOT_FOUND", params: {} };
  if (lookup.target.kind === "void") {
    const record = lookup.voids.find(
      (candidate) => candidate.id === lookup.target.id,
    );
    if (!record) return { ok: false, detail: notFound };
    return { ok: true, value: { opening: openingFromVoid(record) } };
  }

  const record = lookup.records.find(
    (candidate) => candidate.id === lookup.target.id,
  );
  if (!record) return { ok: false, detail: notFound };
  if (!record.canReplace) {
    return {
      ok: false,
      detail: {
        code: "TARGET_NOT_REPLACEABLE",
        params: { label: kindLabel(record.kind) },
      },
    };
  }
  return {
    ok: true,
    value: {
      opening: openingFromPlacement(record, lookup.records, lookup.columns),
      replaced: record,
    },
  };
}

/** What §5.2 decided before anything was built: how wide, how tall, and on which module line. */
export interface InsertPlan {
  readonly widthM: number;
  readonly heightM: number;
  /** The depth this body is built to — `b.mk(w, h, d)`'s third argument. Decided here so the offer
   *  list and `insertBody` cannot disagree. A `BuildDepthM`, so an opening's `ClearanceM` cannot land
   *  here without passing `resolveDepthM` (ADR 0060). */
  readonly depthM: BuildDepthM;
  readonly y0M: number;
  readonly slotBand: NormalisedBand;
  /** The along-wall centre the body is seated at, in millimetres (ADR 0046): flush against the left
   *  edge of the column when the body is narrower than it, the opening's own centre when not.
   *
   *  May be fractional, and is refused rather than rounded downstream: an odd column width puts the
   *  seated centre between two millimetres (`refuseFractionalCentres` in `apply-column-moves.ts`). */
  readonly alongMm: number;
  /** What is left of the column beside the body, in millimetres: the width of the empty column the
   *  split creates. `0` means no split: the body fills the column exactly (ADR 0031 rule 6) or the
   *  column is not this body's to divide (see `seatAlongColumn`). */
  readonly remainderMm: number;
}

export type InsertFit =
  | { readonly ok: true; readonly plan: InsertPlan }
  | { readonly ok: false; readonly detail: RejectionDetail };

export interface InsertFitInput {
  readonly body: InsertableBody;
  readonly opening: InsertOpening;
  readonly column: Column;
  /**
   * The cabinet depth of the design being operated on, which `resolveDepthM` needs. Read it with
   * `cabinetDepthMmOf`; never write a number here.
   *
   * Required, not defaulted: no refusal reads the depth today, so a default would be harmless today,
   * and that is how a hard-coded 600 once built every wall body to the wrong depth at a 700 mm kitchen.
   */
  readonly cabinetDepthMm: number;
}

function rejectFit(detail: RejectionDetail): InsertFit {
  return { ok: false, detail };
}

type WidthResolution =
  | { readonly ok: true; readonly widthM: number }
  | { readonly ok: false; readonly detail: RejectionDetail };

/** Resolves a body's width in an opening: both floors first, then the `'fit'` or millimetre-set
 *  path. The hood takes the `'fit'` path and fills its opening within its 600–800 bound
 *  (ADR 0035 decision 5). */
function resolveWidth(input: InsertFitInput): WidthResolution {
  const { body, opening } = input;
  const availableMm = toMillimetres(opening.w);
  const unusableFloor = refuseUnusableDeclaredFloor(body, availableMm);
  if (unusableFloor) return { ok: false, detail: unusableFloor };

  // A floor is a fact about the cabinet, not about how its entry picks a width, so it runs on both
  // paths before any width is chosen.
  const floorRefusal = refuseWidthFloor(body, opening, availableMm);
  if (floorRefusal) return { ok: false, detail: floorRefusal };

  if (body.widthFlex === "fit") return resolveFitWidth(input, availableMm);

  return resolveFixedSetWidth(body, body.widthFlex, opening);
}

/** §5.2's `w = min(void.w, b.maxW)` for a `'fit'` body: the opening inside the entry's declared
 *  ranges (ADR 0032 rule 4, ADR 0035 decision 2), the entry's own maximum in an opening wider than it.
 *
 *  The floors have already run and must stay first, so `base-sink` in a 400 mm opening names the
 *  560 mm its worktop needs (ADR 0017) rather than a size list. No tolerance: an opening at or under
 *  the maximum is built to exactly, and one in a gap between ranges refuses. */
function resolveFitWidth(
  input: InsertFitInput,
  availableMm: number,
): WidthResolution {
  const { body, opening } = input;
  if (acceptsWidthMm(body, availableMm)) return { ok: true, widthM: opening.w };
  const widestMm = widestBuildableWidthMm(body);
  // Only where the column can be divided: elsewhere the body would be centred between two slivers
  // that never rejoin (ADR 0046 part 1), so there the over-wide opening refuses.
  if (
    widestMm !== undefined &&
    availableMm > widestMm &&
    dividesWholeColumn(opening, input.column)
  ) {
    return { ok: true, widthM: toMetres(widestMm) };
  }
  return {
    ok: false,
    detail: refuseFixedWidth(
      body,
      buildableSizes(body.minWidthMm, body.sizesMm),
      availableMm,
    ),
  };
}

/** The widest width the entry's ranges allow once its floor is applied; `undefined` when the floor
 *  leaves no range at all. */
function widestBuildableWidthMm(body: InsertableBody): number | undefined {
  const maximaMm = resolveWidthRangesMm(body)
    .filter((range) => range.minMm <= range.maxMm)
    .map((range) => range.maxMm);
  return maximaMm.length === 0 ? undefined : Math.max(...maximaMm);
}

/** §7's millimetre-set case (dishwasher niche, the four full-height units, bottle cargo): the widest
 *  size that still fits, or the refusal that says why none can.
 *
 *  `sizesMm` is passed in so the caller's narrowing carries: `widthFlex` is known not to be `'fit'`. */
function resolveFixedSetWidth(
  body: InsertableBody,
  sizesMm: readonly number[],
  opening: InsertOpening,
): WidthResolution {
  const availableMm = toMillimetres(opening.w);
  // The floor is applied before `FIT_TOLERANCE_M`, and the order must stay: filtering first means the
  // tolerance can only forgive a body slightly too wide for its opening, never admit a size below
  // the floor (ADR 0015's sibling finding R1.1). The refusal then names only buildable widths.
  const minimumMm = body.minWidthMm;
  const buildableSizesMm = buildableSizes(minimumMm, sizesMm);
  const fitting = buildableSizesMm.filter(
    (size) => toMetres(size) <= opening.w + FIT_TOLERANCE_M,
  );
  if (fitting.length > 0) {
    return { ok: true, widthM: toMetres(Math.max(...fitting)) };
  }
  // Contradictory catalogue data: every listed width is under the entry's own floor. A refusal, not a
  // throw, because the command's contract is a value. `WIDTH_TOO_SMALL` is the one code whose fact
  // (the body has a floor) holds whatever the opening measures; `WIDTH_NOT_SUPPORTED` would render
  // an empty size list and `WIDTH_TOO_LARGE` states the opposite.
  if (minimumMm !== undefined && buildableSizesMm.length === 0) {
    return {
      ok: false,
      detail: refuseBodyMinimum(body, minimumMm, availableMm),
    };
  }
  return {
    ok: false,
    detail: refuseFixedWidth(body, buildableSizesMm, availableMm),
  };
}

/** A declared floor that is not a width at all (`NaN`, `±Infinity`) refuses the entry at every
 *  opening, before either floor applies.
 *
 *  Checked here because a `BodyCatalog` is a plain map any caller can build, so this is the one place
 *  that sees every entry. It refuses rather than falling back to §2's default, so a catalogue typo
 *  cannot ship silently. The sentence names no millimetres: `rejection.ts` keeps `NaN` and
 *  `±Infinity` out of customer copy. */
function refuseUnusableDeclaredFloor(
  body: InsertableBody,
  availableMm: number,
): RejectionDetail | undefined {
  const declaredMm = body.minWidthMm;
  if (declaredMm === undefined || Number.isFinite(declaredMm)) return undefined;
  return {
    code: "WIDTH_TOO_SMALL",
    params: { label: body.label, availableMm },
  };
}

/** ADR 0017's refusal, shared by both places that reach it (an opening under the floor, and a size
 *  set entirely under it) so the code and its typed params cannot drift apart. */
function refuseBodyMinimum(
  body: InsertableBody,
  minimumMm: number,
  availableMm: number,
): RejectionDetail {
  return {
    code: "WIDTH_TOO_SMALL",
    params: { label: body.label, requiredMm: minimumMm, availableMm },
  };
}

/** The one place a width floor is applied; it returns the refusal the governing floor carries.
 *
 *  Under §2's `MIN_WIDTH_M` no cabinet exists (`WIDTH_NOT_SUPPORTED`, naming the widths this body
 *  has); under an entry's own `minWidthMm` this product cannot be made (`WIDTH_TOO_SMALL`, naming the
 *  millimetres it needs). Both codes must stay reachable (ADR 0026).
 *
 *  A declared floor at or above `MIN_WIDTH_M` adds to the default and both are checked in turn. One
 *  below it replaces the default for that entry alone (`base-bottle-cargo`: its refusal names 200 mm).
 *
 *  An upward floor is measured against the opening only on the `'fit'` path, where the width is the
 *  opening; a millimetre set measures it against its own sizes (`resolveFixedSetWidth`). §2's
 *  default runs on both.
 *
 *  `FIT_TOLERANCE_M` must not lower either floor, since both are properties of the body (ADR 0015
 *  finding R1.1): only float noise is forgiven. */
function refuseWidthFloor(
  body: InsertableBody,
  opening: InsertOpening,
  availableMm: number,
): RejectionDetail | undefined {
  const declaredMm = body.minWidthMm;
  if (declaredMm !== undefined && replacesDefaultFloor(declaredMm)) {
    return refuseBelowBuilderFloor(body, opening, availableMm);
  }
  if (opening.w < MIN_WIDTH_M - COORDINATE_EPSILON_M) {
    return {
      code: "WIDTH_NOT_SUPPORTED",
      params: widthsMadeParams(body, body.sizesMm, availableMm),
    };
  }
  if (body.widthFlex !== "fit") return undefined;
  return refuseBelowBuilderFloor(body, opening, availableMm);
}

/** ADR 0026: whether this declared floor stands instead of §2's default rather than on top of it.
 *  Only a floor below the default does. */
function replacesDefaultFloor(declaredMm: number): boolean {
  return toMetres(declaredMm) < MIN_WIDTH_M;
}

/** ADR 0017's floor read against the opening. Called only from `refuseWidthFloor`. */
function refuseBelowBuilderFloor(
  body: InsertableBody,
  opening: InsertOpening,
  availableMm: number,
): RejectionDetail | undefined {
  const minimumMm = body.minWidthMm;
  if (minimumMm === undefined) return undefined;
  if (opening.w >= toMetres(minimumMm) - COORDINATE_EPSILON_M) return undefined;
  return refuseBodyMinimum(body, minimumMm, availableMm);
}

/** A body offered in one width states that width; a body with a set states the set. Both carry the
 *  millimetres as `params` and name them in the sentence (§11 row 5). `sizesMm` is passed in so the
 *  sentence names the widths the body can be built at (ADR 0017), not every width its row lists. */
function refuseFixedWidth(
  body: InsertableBody,
  sizesMm: readonly number[],
  availableMm: number,
): RejectionDetail {
  const [onlySize] = sizesMm;
  if (sizesMm.length === 1 && onlySize !== undefined) {
    return {
      code: "WIDTH_TOO_LARGE",
      params: { label: body.label, requiredMm: onlySize, availableMm },
    };
  }
  return {
    code: "WIDTH_NOT_SUPPORTED",
    params: widthsMadeParams(body, sizesMm, availableMm),
  };
}

/** The parameters `WIDTH_NOT_SUPPORTED` needs to state what an entry is made at. Ranges come from
 *  `resolveWidthRangesMm`, never `definition.widthRangesMm`: the accessor raises a declared range to
 *  the governing floor. `sizesMm` arrives already filtered (ADR 0017): ranges say what may be built,
 *  sizes say which of those §9 offers as chips. */
function widthsMadeParams(
  body: InsertableBody,
  sizesMm: readonly number[],
  availableMm: number,
) {
  return {
    label: body.label,
    sizesMm,
    widthRangesMm: resolveWidthRangesMm(body),
    availableMm,
  };
}

/** §5.2: `h = b.hFlex ? (void.h <= 0.9 ? void.h : b.h) : b.h`. */
function resolveHeightM(body: InsertableBody, opening: InsertOpening): number {
  const nominalM = toMetres(body.nominalHeightMm);
  if (!body.heightFlex) return nominalM;
  return opening.h <= CABINET_SIZED_OPENING_MAX_M ? opening.h : nominalM;
}

function refuseHeight(
  body: InsertableBody,
  opening: InsertOpening,
  heightM: number,
): RejectionDetail | undefined {
  const takesSpan = heightM > opening.h + FIT_TOLERANCE_M;
  const requiredMm = toMillimetres(heightM);
  if (takesSpan && normaliseBand(body.band) !== "column") {
    return {
      code: "HEIGHT_EXCEEDS_LEVEL",
      params: {
        label: body.label,
        requiredMm,
        availableMm: toMillimetres(opening.h),
      },
    };
  }
  const roomM = roomAboveM(opening, takesSpan);
  if (heightM > roomM + FIT_TOLERANCE_M) {
    return {
      code: "HEIGHT_TOO_LARGE",
      params: {
        label: body.label,
        requiredMm,
        availableMm: toMillimetres(roomM),
      },
    };
  }
  return undefined;
}

/** §5.2's `room4`: from the level's own start, or from the span's floor for a body allowed to
 *  exceed its level. */
function roomAboveM(opening: InsertOpening, takesSpan: boolean): number {
  return opening.spanY0 + opening.spanH - lowestSeatM(opening, takesSpan);
}

function lowestSeatM(opening: InsertOpening, takesSpan: boolean): number {
  return takesSpan ? opening.spanY0 : opening.y0;
}

/** §5.2: "the lowest of (LEVELS starts ∪ column region starts ∪ minY) that fits". A wall unit
 *  dropped into a cleared column lands at 1500 mm, not flush on the worktop. */
function resolveSnapY0M(
  opening: InsertOpening,
  column: Column,
  heightM: number,
  takesSpan: boolean,
): number | undefined {
  const minY = lowestSeatM(opening, takesSpan);
  const spanTop = opening.spanY0 + opening.spanH;
  const candidates = [
    ...LEVELS.map(([levelStart]) => levelStart),
    ...column.regions.map(([regionStart]) => regionStart),
    minY,
  ]
    .filter((candidate) => candidate >= minY - COORDINATE_EPSILON_M)
    .filter((candidate) => candidate + heightM <= spanTop + FIT_TOLERANCE_M)
    .sort((left, right) => left - right);
  return candidates[0];
}

/** Every §5.2 guard that does not need the body built, in the spec's own order. */
export function evaluateInsertFit(input: InsertFitInput): InsertFit {
  const { body, opening, column } = input;
  const slot: SlotExtent = { y0: opening.y0, h: opening.h };
  const slotBand = deriveSlotBand(slot);
  const bandRefusal = refuseBand(body, slotBand);
  if (bandRefusal) return rejectFit(bandRefusal);

  const openingRefusal = refuseShortOpening(body, opening);
  if (openingRefusal) return rejectFit(openingRefusal);

  const width = resolveWidth(input);
  if (!width.ok) return rejectFit(width.detail);

  const heightM = resolveHeightM(body, opening);
  const heightRefusal = refuseHeight(body, opening, heightM);
  if (heightRefusal) return rejectFit(heightRefusal);

  const takesSpan = heightM > opening.h + FIT_TOLERANCE_M;
  const y0M = resolveSnapY0M(opening, column, heightM, takesSpan);
  if (y0M === undefined) {
    return rejectFit({
      code: "NO_SNAP_POSITION",
      params: { label: body.label },
    });
  }
  return {
    ok: true,
    plan: {
      widthM: width.widthM,
      heightM,
      depthM: resolveDepthM(input),
      y0M,
      slotBand,
      ...seatAlongColumn(opening, column, width.widthM),
    },
  };
}

/** Where the body sits along the wall, and what the column has left beside it. */
type Seating = Pick<InsertPlan, "alongMm" | "remainderMm">;

/** ADR 0046 part 1: a body narrower than the column it is inserted into is seated flush against the
 *  left edge of the span (the lower along-wall coordinate), and the whole remainder becomes one
 *  empty column on the right. Centring leaves two slivers that can never merge back.
 *
 *  Measured against the column, not the opening: the column extent is what the frozen map holds and
 *  the split rewrites, and on a §5.3 swap the opening is only the outgoing body's own frame. */
function seatAlongColumn(
  opening: InsertOpening,
  column: Column,
  widthM: number,
): Seating {
  // The column still holds a member at another level, so it is not this body's to divide. The insert
  // is accepted and centred, not refused; splitting would move the occupied half onto a new key while
  // the member above or below kept deriving the old one. See `dividesWholeColumn`.
  if (!dividesWholeColumn(opening, column)) return centredInOpening(opening);

  const remainderMm =
    seatableMillimetres(column.w) - seatableMillimetres(widthM);
  // The body fills its column (ADR 0031 rule 6), or `FIT_TOLERANCE_M` let a discrete size overhang it
  // by a hair: no second column, and the one that is here keeps its key.
  if (remainderMm <= 0) return centredInOpening(opening);

  // `C − (W − w) / 2`: the column's left edge holds and the body's left edge lands on it.
  const centreMm = seatableMillimetres(alongWallM(column.wall, column));
  return { alongMm: centreMm - remainderMm / 2, remainderMm };
}

/** The body takes its opening's own along-wall centre and no column is created beside it. */
function centredInOpening(opening: InsertOpening): Seating {
  return { alongMm: seatableMillimetres(opening.alongM), remainderMm: 0 };
}

/** A column is only divided by an opening that runs its whole height. §4 subtracts height and never
 *  width, so a member at another level occupies the whole column width at that level; splitting under
 *  it leaves that member in a column the map no longer holds, which `validateDesignForCatalog`
 *  refuses with `EMPTY_COLUMN_OVERLAPS_PLACEMENT` (ADR 0011 Gap D). Reachable with no resize: a
 *  wall cabinet above a column and a narrower base body going in below.
 *
 *  Asked of the geometry, not the record set, so §9's offer list gets the same answer. */
function dividesWholeColumn(opening: InsertOpening, column: Column): boolean {
  const floorM = Math.min(...column.regions.map(([start]) => start));
  return (
    opening.spanY0 <= floorM + COORDINATE_EPSILON_M &&
    opening.spanY0 + opening.spanH >= column.top - COORDINATE_EPSILON_M
  );
}

/** Millimetres for a coordinate about to be checked for landing on a whole one: the exact millimetre
 *  where it does (absorbing unit-conversion float noise), the raw product where it does not so the
 *  refusal names the millimetres the value sits between. Rounding here would collapse two column
 *  keys into one (ADR 0044). */
function seatableMillimetres(valueM: number): number {
  return toExactMillimetres(valueM) ?? valueM * MILLIMETRES_PER_METRE;
}

/** The one reader that wants a build depth rather than a clearance (ADR 0060 decision 1): what the
 *  body standing in this opening is manufactured to, passed to the probe as `b.mk(w, h, d)`.
 *
 *  Reads `columnBuildDepthM`'s declaration, never the opening's MAX, which includes an appliance's
 *  door bars (703 and 742 mm wall carcasses). The cap is the default and the lift is the exception, so
 *  an empty opening is capped too: the absence of a worktop is not the presence of a column.
 *
 *  Where the cap applies it is a maximum, never a target, so a mis-answered `hasFullHeightUnder` can
 *  only make a body shallower than its space, never push it past the wall plane (§11 row 19). Where
 *  the lift applies the declared line is the target: an incoming body takes the column's build depth
 *  and does not inherit a replaced pinned body's 600 (ADR 0060 decision 5).
 *
 *  The body's band, not the slot's: the cap describes a wall carcass (hung, no plinth, no worktop).
 *  Base and full-height builders ignore the depth they are given (ADR 0018). */
function resolveDepthM(input: InsertFitInput): BuildDepthM {
  const { body, opening, column } = input;
  if (normaliseBand(body.band) !== "wall")
    return buildToTheClearanceM(opening.d);
  const declaredM = columnBuildDepthM({
    cabinetDepthMm: input.cabinetDepthMm,
    hasFullHeightUnder: column.hasFullHeightUnder,
  });
  if (column.hasFullHeightUnder) return declaredM;
  // The floor is the column's clearance, not the opening's: a swap publishes the outgoing body's own
  // clearance and a delete-then-insert the column's, so reading the opening would give a 200 mm body
  // vacating a 620 mm column 200 by swap and 330 by delete-then-insert (ADR 0060 decision 3).
  return shallowerBuildDepthM(
    declaredM,
    buildToTheClearanceM(recordedClearanceM(column.d)),
  );
}

/** Whether the column now decides a different depth for a body already standing in it (ADR 0103
 *  decision 3). Lives here because the answer is `resolveDepthM`'s.
 *
 *  Called with the opening `openingFromPlacement` produces, `opening.d` is the standing body's own
 *  occupied depth, so this compares what the column says the body is built to against what it is
 *  built to now. Compared in whole millimetres: a `1e-16` residue is not a manufactured depth.
 *
 *  `false` means the re-plan is a no-op: the body is written through untouched, takes no measurement
 *  and can raise no refusal. */
export function columnDecidesADifferentDepth(input: InsertFitInput): boolean {
  return (
    toMillimetres(resolveDepthM(input)) !==
    toMillimetres(buildToTheClearanceM(input.opening.d))
  );
}

function refuseBand(
  body: InsertableBody,
  slotBand: NormalisedBand,
): RejectionDetail | undefined {
  const bodyBand = normaliseBand(body.band);
  if (isBandAccepted(bodyBand, slotBand)) return undefined;
  return {
    code: "BAND_MISMATCH",
    params: { label: body.label, bodyBand, slotBand },
  };
}

/** §9: `hFlex` needs `openH ≥ 400`, enforced in the engine as well as the offer list so a second
 *  caller cannot forget it. The floor is on the body and `FIT_TOLERANCE_M` does not move it; only
 *  float noise is forgiven (`2.6 - 2.2` is 0.3999999999999999). */
function refuseShortOpening(
  body: InsertableBody,
  opening: InsertOpening,
): RejectionDetail | undefined {
  if (!body.heightFlex) return undefined;
  const minimumM = toMetres(HEIGHT_FLEX_MIN_OPENING_MM);
  if (opening.h + COORDINATE_EPSILON_M >= minimumM) return undefined;
  return {
    code: "OPENING_TOO_SHORT",
    params: {
      availableMm: toMillimetres(opening.h),
      minimumMm: HEIGHT_FLEX_MIN_OPENING_MM,
    },
  };
}
