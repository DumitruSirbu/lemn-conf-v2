// `DEVELOPMENT-SPEC.md` §5.2's guards, in the order the spec states them, with everything that can
// be decided **before** a body is built.
//
// Split out because §9's offer list and `insertBody` must agree exactly: "never offer what cannot
// be satisfied" and "the hood is neither offered for nor accepted into the 400 mm top slot" are the
// same rule read from two ends (§11 row 6). One evaluation, two callers.
import {
  deriveSlotBand,
  isBandAccepted,
  normaliseBand,
  type NormalisedBand,
  type SlotExtent,
} from "../bands.js";
import {
  buildableSizes,
  describeKindLabel,
  UNKNOWN_KIND_LABEL_RO,
  type InsertableBody,
} from "../catalog.js";
import type { DesignWall } from "../design.js";
import { toMetres, toMillimetres } from "../millimetres.js";
import { findVacatedVoid } from "../queries/vacated-void.js";
import {
  recomputeVoids,
  FIT_TOLERANCE_M,
  LEVELS,
  MIN_WIDTH_M,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../void-engine.js";
import type { CommandTarget } from "./command-result.js";
import type { RejectionDetail } from "./rejection.js";

/** §9: a height-flexible body needs this much opening before it is worth building — below it the
 *  carcass is a strip, not a cabinet. */
export const HEIGHT_FLEX_MIN_OPENING_MM = 400;

/** §5.2: a height-flexible body fills an opening this tall or shorter, and otherwise builds its
 *  nominal height. A 750 mm over-fridge slot gets a 750 mm unit; a cleared 2600 mm column does not
 *  get a 2600 mm wall cabinet. */
export const CABINET_SIZED_OPENING_MAX_M = 0.9;

/** Float noise from the millimetre↔metre round trip. Not a fit tolerance — `FIT_TOLERANCE_M` is
 *  the slack two independently derived measurements get; this is the slack `2.2 * 1000` gets. */
const COORDINATE_EPSILON_M = 1e-6;

/** The opening a body is being inserted into, whether it is a derived void or — on a swap in
 *  place (§5.3) — the level slot an occupied body stands in. One shape, so the guards cannot
 *  fork. */
export interface InsertOpening {
  readonly col: string;
  readonly wall: DesignWall;
  /** The along-wall coordinate: `x` on wall A, `z` on wall B. ADR 0011 Gap D — the wall-normal
   *  coordinate is *not* taken from here; it comes from the body's own measured seat. */
  readonly alongM: number;
  readonly w: number;
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
    y0: record.y0,
    h: record.h,
    spanY0: record.spanY0,
    spanH: record.spanH,
  };
}

/** §5.3: an opening's size does not change because its contents did. The opening a swap targets is
 *  therefore the one the *level* provides — literally the void this body's removal would create —
 *  and not the outgoing body's own frame.
 *
 *  Reading "the frame IS the opening" as the frame's own numbers does not survive the shipped
 *  data: M2's seeded base cabinets record 820 mm (carcass without the counter) while §7's base
 *  bodies build to the 860 mm worktop line, so every seeded base cabinet would refuse every base
 *  row in its own swap list. The level slot is 860 mm either way, which is the sense in which it is
 *  unchanged. See the report for M3 Wave 3A.
 *
 *  Only the width comes from the body itself: §5.3 swaps in place, and horizontal subdivision of an
 *  opening is not in the model. */
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
    y0,
    h: slot?.h ?? record.frame.h,
    spanY0: slot?.spanY0 ?? record.frame.y0,
    spanH: slot?.spanH ?? record.frame.h,
  };
}

/** The void that would cover this body if it were removed — §4's own derivation, run once with the
 *  target taken out, so a swap and a delete-then-insert see the identical opening.
 *
 *  The lookup itself is `findVacatedVoid`'s, not a second copy of it: a swap resolving its opening
 *  one level away from where a delete would have selected is the same defect twice, and the two
 *  predicates had already drifted into being one bug in two files. */
function findVacatedSlot(
  record: PlacementRecord,
  records: readonly PlacementRecord[],
  columns: ReadonlyMap<string, Column>,
): VoidRecord | undefined {
  const remaining = records.filter((other) => other.id !== record.id);
  return findVacatedVoid(recomputeVoids(remaining, columns), {
    col: record.col,
    y0: record.frame.y0,
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

/** §5.2 fills a void; §5.3 hands the same path the current body's own frame. `insertBody` and
 *  §9's offer list resolve their target through this one function, so a body the list offers and a
 *  body the command accepts are measured against the identical opening. */
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

function openingLabel(value: Omit<ResolvedOpening, "column">): string {
  return value.replaced
    ? describeKindLabel(value.replaced.kind)
    : UNKNOWN_KIND_LABEL_RO;
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
  if (record.accessory || !record.canReplace) {
    return {
      ok: false,
      detail: {
        code: "TARGET_NOT_REPLACEABLE",
        params: { label: describeKindLabel(record.kind) },
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
  readonly y0M: number;
  readonly slotBand: NormalisedBand;
}

export type InsertFit =
  | { readonly ok: true; readonly plan: InsertPlan }
  | { readonly ok: false; readonly detail: RejectionDetail };

export interface InsertFitInput {
  readonly body: InsertableBody;
  readonly opening: InsertOpening;
  readonly column: Column;
}

function rejectFit(detail: RejectionDetail): InsertFit {
  return { ok: false, detail };
}

type WidthResolution =
  | { readonly ok: true; readonly widthM: number }
  | { readonly ok: false; readonly detail: RejectionDetail };

/** §5.2: `w = b.w === 'fit' ? void.w : b.w`, plus the millimetre-set case §7 gives the dishwasher
 *  niche, the hood and the columns. A fixed-set body takes the widest size that still fits. */
function resolveWidth(
  body: InsertableBody,
  opening: InsertOpening,
): WidthResolution {
  const availableMm = toMillimetres(opening.w);
  if (body.widthFlex === "fit") {
    const narrowRefusal = refuseNarrowOpening(body, opening, availableMm);
    if (narrowRefusal) return { ok: false, detail: narrowRefusal };
    return { ok: true, widthM: opening.w };
  }

  // ADR 0017's floor is a property of the *builder*, so it governs a millimetre set exactly as it
  // governs the fit path: a listed size below it is a width this body cannot be made at, and
  // taking it would hand the probe a width the builder inverts.
  //
  // **The floor is applied before `FIT_TOLERANCE_M`, and the order must stay that way.** Filtering
  // first means the tolerance can only ever forgive a body being slightly too *wide* for its
  // opening; it can never reach back and admit a size below the floor. Comparing first and
  // filtering after would reintroduce ADR 0015's sibling finding R1.1 — manufacturing slack
  // lowering a body's own minimum — one branch further along. Filtering first also means the
  // refusal that follows names only the widths this body actually has.
  const minimumMm = body.minWidthMm;
  const buildableSizesMm = buildableSizes(minimumMm, body.widthFlex);
  const fitting = buildableSizesMm.filter(
    (size) => toMetres(size) <= opening.w + FIT_TOLERANCE_M,
  );
  if (fitting.length > 0) {
    return { ok: true, widthM: toMetres(Math.max(...fitting)) };
  }
  // Contradictory catalogue data: every width the entry lists is under the floor its own builder
  // declares, so there is no width at which this body can be made. Unreachable from the shipped
  // catalogue, and a refusal rather than a throw for the reason `NON_INTEGER_MILLIMETRES` is — the
  // command's contract is a value, not an exception.
  //
  // `WIDTH_TOO_SMALL` even though `availableMm` is the opening rather than the widest listed size:
  // the fact that code states — the body has a floor and cannot go under it — is true whatever the
  // opening measures, which is not so for either other width code. `WIDTH_NOT_SUPPORTED` would
  // render an empty size list, and `WIDTH_TOO_LARGE` states the opposite fact.
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

/** ADR 0017's refusal, from both places that reach it — an opening under the floor, and a size set
 *  entirely under it. The two reasons differ and are documented at their own call sites; only the
 *  detail's construction is shared, so the code, its params and its sentence cannot drift apart. */
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

/** The two floors a `'fit'` body has, narrowest-general first: §2's `MIN_WIDTH_M`, which no
 *  cabinet may go under, and — ADR 0017 — this entry's own `minWidthMm`, which its builder cannot
 *  go under. They are different facts and carry different codes: below 300 mm no cabinet exists at
 *  all, while below 560 mm it is *this product* that cannot be made, and the sentence the customer
 *  reads should say which.
 *
 *  `FIT_TOLERANCE_M` is slack on the *fit* — it lets a body slightly wider than its opening still
 *  go in. It must not lower either floor, which are properties of the body: a 288 mm carcass is
 *  narrower than the narrowest cabinet §2 permits, and a 550 mm sink base has an inverted worktop.
 *  ADR 0015's sibling finding R1.1 is exactly the defect of conflating the two. Only float noise
 *  from the millimetre↔metre round trip is forgiven. */
function refuseNarrowOpening(
  body: InsertableBody,
  opening: InsertOpening,
  availableMm: number,
): RejectionDetail | undefined {
  if (opening.w < MIN_WIDTH_M - COORDINATE_EPSILON_M) {
    return {
      code: "WIDTH_NOT_SUPPORTED",
      params: { label: body.label, sizesMm: body.sizesMm, availableMm },
    };
  }
  const minimumMm = body.minWidthMm;
  if (minimumMm === undefined) return undefined;
  if (opening.w >= toMetres(minimumMm) - COORDINATE_EPSILON_M) return undefined;
  return refuseBodyMinimum(body, minimumMm, availableMm);
}

/** A body offered in one width only states that width; a body with a set states the set. Both
 *  carry the millimetres as `params` and name them in the sentence (§11 row 5).
 *
 *  The sizes are passed in rather than read back off the body, so the sentence names the widths
 *  this body can be *built* at (ADR 0017) rather than the ones its catalogue row lists. */
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
    params: { label: body.label, sizesMm, availableMm },
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

  const width = resolveWidth(body, opening);
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
    plan: { widthM: width.widthM, heightM, y0M, slotBand },
  };
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

/** §9: `hFlex` needs `openH ≥ 400`. Enforced in the engine as well as in the offer list, because
 *  a guard the UI owns alone is a guard a second caller forgets.
 *
 *  A height-flexible body builds to its opening, so an opening under the minimum builds a body
 *  under the minimum — the floor is on the *body*, and `FIT_TOLERANCE_M` does not move it. Only
 *  float noise is forgiven, which `2.6 - 2.2` needs: it is 0.3999999999999999. */
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
