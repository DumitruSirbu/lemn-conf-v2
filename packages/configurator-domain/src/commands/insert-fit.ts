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
import { wallDepthMmForWorktop, WORKTOP_DEPTH_MM } from "../worktop-depth.js";
import type { CommandTarget } from "./command-result.js";
import type { RejectionDetail } from "./rejection.js";

/** §9: a height-flexible body needs this much opening before it is worth building — below it the
 *  carcass is a strip, not a cabinet. */
export const HEIGHT_FLEX_MIN_OPENING_MM = 400;

/** §7's `min(d, cap)` on a wall carcass, as what it actually is: a **head-clearance rule**, not a
 *  geometry limit. The cap is the worktop → wall depth map's row for the shipped worktop, never a
 *  value written down here. `wallCabinet(W, doors, H, D)` builds any depth it is handed.
 *
 *  A wall cabinet above a worktop is shallow so you do not hit your head leaning over the counter.
 *  Above a full-height column there is nothing to lean over, so it may be as deep as the column —
 *  which is why the shipped kitchen has 330 mm wall cabinets over its base run and 600 mm ones over
 *  the oven tower, the pantry and the fridge.
 *
 *  **The cap is the rule and the column is the exception**, not the other way round: see
 *  `resolveDepthM`, where reading it as "cap over a worktop" left an emptied column uncapped.
 *
 *  It lives in the domain rather than beside the builders (where it was, as
 *  `WALL_CARCASS_MAX_DEPTH_M`) because the cap is now a function of the **design** — of what stands
 *  under the opening — and the adapter cannot see a design. §12: the domain owns product rules, the
 *  adapter owns builders. The builders now build the depth they are given.
 *
 *  Backlog entry 5, decided by the owner on 2026-08-26.
 *
 *  **The number itself is the worktop's, not this rule's** (owner, 2026-08-27): it reads the same
 *  map row as §7's `nominalDepthMm`, so the cap and the catalogue nominal cannot drift apart. They
 *  were independent literals agreeing at 400 until then, which is why a re-inserted top-row cabinet
 *  built 400 mm beside 330 mm neighbours. */
export const WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M = toMetres(
  wallDepthMmForWorktop(WORKTOP_DEPTH_MM),
);

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
  /** The depth the body is built to — §5.2's `void.d`, handed to the probe as `depthM`.
   *
   *  It belongs to the **opening**, never to the column. `Column.d` is §3.2's MAX over the whole
   *  vertical run, so reading the depth from there builds a wall cabinet to the depth of the base
   *  cabinet standing under it: on the shipped kitchen that changed the depth of 7 of 10 columns'
   *  wall bodies on a swap, in both directions, and the replacement no longer lined up with its
   *  neighbours. ADR 0018 is why that reads as a depth at all — `frame.d` is twice a body's rear
   *  overhang, which for the two builders that consume a depth (`wallCabinet`, `openShelf`, whose
   *  carcass is centred on z = 0) is exactly the depth they were given. */
  readonly d: number;
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
    d: record.d,
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
 *  Only the width and the **depth** come from the body itself. The width because §5.3 swaps in
 *  place and horizontal subdivision of an opening is not in the model. The depth because the model
 *  has no per-level depth at all: `recomputeVoids` stamps every void with its column's MAX depth
 *  (§3.2), so taking it from the vacated slot would hand a wall cabinet the depth of the base
 *  cabinet under it — the defect this reading exists to close. The outgoing body's own `frame.d`
 *  is the only recorded fact about how deep the thing standing in this opening was, and §5.3's
 *  "the current body's frame IS the target opening" applies to it literally. The `h` and `w`
 *  carve-outs above are documented exceptions with their own recorded reasons; neither reason
 *  touches depth. */
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
    d: record.frame.d,
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
  /** §5.2's `void.d`, capped by §7's head-clearance rule where it applies — the depth handed to the
   *  probe as `b.mk(w, h, d)`'s third argument. Decided here, with the rest of the plan, so the
   *  offer list and `insertBody` cannot disagree about how deep a body would be built. */
  readonly depthM: number;
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
 *  niche, the four full-height units and the bottle cargo. A fixed-set body takes the widest size
 *  that still fits. */
function resolveWidth(
  body: InsertableBody,
  opening: InsertOpening,
): WidthResolution {
  const availableMm = toMillimetres(opening.w);
  const unusableFloor = refuseUnusableDeclaredFloor(body, availableMm);
  if (unusableFloor) return { ok: false, detail: unusableFloor };

  // Whichever floor governs this body, checked once, before any width is chosen at all. It runs on
  // both width paths: a floor is a fact about the cabinet, not about how a particular entry picks
  // its width, and a millimetre set listing a member under §2's default would otherwise slip past
  // unexamined.
  const floorRefusal = refuseWidthFloor(body, opening, availableMm);
  if (floorRefusal) return { ok: false, detail: floorRefusal };

  if (body.widthFlex === "fit") return { ok: true, widthM: opening.w };

  return resolveFixedSetWidth(body, body.widthFlex, opening);
}

/** §7's millimetre-set case — the dishwasher niche, the four full-height units and the bottle
 *  cargo: the widest size this builder can be made at that still fits, or the refusal that says why
 *  none can.
 *
 *  **The hood is not one of them, despite its own `sizesMm`.** `catalog.ts` spreads
 *  `wallCabinet("Hotă")` and overrides `sizesMm` but not `widthFlex`, so the hood inherits `'fit'`
 *  and resolves on the branch above: it builds to its opening at any width, and {600, 900} is only
 *  the chip set §9 offers.
 *
 *  `sizesMm` is passed in rather than read back off the body so the caller's narrowing carries: by
 *  the time this runs, `widthFlex` is known not to be `'fit'`. */
function resolveFixedSetWidth(
  body: InsertableBody,
  sizesMm: readonly number[],
  opening: InsertOpening,
): WidthResolution {
  const availableMm = toMillimetres(opening.w);
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
  const buildableSizesMm = buildableSizes(minimumMm, sizesMm);
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

/** A declared floor that is not a width at all — `NaN` or `±Infinity` — refuses the entry before
 *  either floor is applied, at every opening.
 *
 *  **Read here rather than validated at load**, because there is no single load to validate in: a
 *  `BodyCatalog` is a plain map that a fixture, a preset or a caller builds directly, so the only
 *  place guaranteed to see every entry is the place that reads it. **A refusal rather than a
 *  throw**, for the reason `NON_INTEGER_MILLIMETRES` is one: a command's contract is a value.
 *
 *  It refuses at *every* width rather than falling back to §2's default, because a row whose floor
 *  cannot be read is a defect in the catalogue and the safe direction is that nothing is built from
 *  it — a fallback would let one typo ship silently. The sentence names no millimetres:
 *  `rejection.ts` already holds that `NaN` and `±Infinity` do not belong in customer copy. */
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

/** **The one place a width floor is applied.** It decides which floor governs this body and
 *  returns the refusal that floor carries, so a caller never has to ask a second time.
 *
 *  Two floors reach a body and they are different facts, so they carry different codes: under
 *  §2's `MIN_WIDTH_M` no cabinet exists at all (`WIDTH_NOT_SUPPORTED`, naming the widths this body
 *  has), while under an entry's own `minWidthMm` it is *this product* that cannot be made
 *  (`WIDTH_TOO_SMALL`, naming the millimetres it needs). The sentence the customer reads has to
 *  say which one stopped them, so both codes stay reachable from here and each stays true where it
 *  fires — that distinction is ADR 0026's whole point.
 *
 *  **ADR 0026: the per-entry floor has a direction.** Declared at or above `MIN_WIDTH_M` it *adds*
 *  to the default, and both are checked in turn — `base-sink` in a 299 mm opening still reads the
 *  general sentence, because 299 mm is under the narrowest cabinet there is and that is the truer
 *  thing to say. Declared *below* it, the entry's floor **replaces** the default for that entry
 *  alone: `base-bottle-cargo` is the deliberate exception the default exists to keep out of every
 *  other row, so the only floor that can stop it is its own, and its refusal names 200 mm.
 *
 *  **An upward floor is measured against the opening only on the `'fit'` path**, where the width
 *  *is* the opening and the floor therefore *is* a constraint on the opening. A millimetre set
 *  measures the same floor against its own sizes instead (`resolveFixedSetWidth`), where it belongs:
 *  a set body never takes the opening's width, so what it needs to know is which of its sizes it can
 *  be built at, and its refusal names those sizes rather than a floor no size of its own sits on.
 *  §2's default is not path-dependent and runs on both.
 *
 *  `FIT_TOLERANCE_M` is slack on the *fit* — it lets a body slightly wider than its opening still
 *  go in. It must not lower whichever floor applies, because both are properties of the body: a
 *  288 mm carcass is narrower than the narrowest cabinet §2 permits, and a 550 mm sink base has an
 *  inverted worktop. ADR 0015's sibling finding R1.1 is exactly the defect of conflating the two.
 *  Only float noise from the millimetre↔metre round trip is forgiven. */
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
      params: { label: body.label, sizesMm: body.sizesMm, availableMm },
    };
  }
  if (body.widthFlex !== "fit") return undefined;
  return refuseBelowBuilderFloor(body, opening, availableMm);
}

/** ADR 0026: whether this declared floor stands *instead of* §2's default rather than on top of
 *  it. Only a floor below the default does, which is the one direction §2's own sentence did not
 *  previously admit. */
function replacesDefaultFloor(declaredMm: number): boolean {
  return toMetres(declaredMm) < MIN_WIDTH_M;
}

/** ADR 0017's floor read against the opening: an opening narrower than the width this entry's own
 *  row permits. Called only from `refuseWidthFloor`, from both of its branches that reach a
 *  declared floor — the downward one that replaced the default, and the upward one on the `'fit'`
 *  path. */
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
    plan: {
      widthM: width.widthM,
      heightM,
      depthM: resolveDepthM(body, opening, column),
      y0M,
      slotBand,
    },
  };
}

/** §5.2 hands the builder the **opening's** own depth (`InsertOpening.d`), capped by §7's
 *  head-clearance rule everywhere that rule applies — which is everywhere but over a full-height
 *  member, and only for a wall carcass.
 *
 *  **The cap is the default and the lift is the exception**, which is the direction backlog entry 5
 *  states the rule in: "over a full-height column there is nothing to lean over". Read the other way
 *  round — cap wherever a worktop is present — an *empty* opening is uncapped, because the absence
 *  of a worktop is not the presence of a column. Empty space is neither, and empty space is what a
 *  delete produces: clearing the base cabinets under a wall run then built a 580 mm carcass, the
 *  frozen `Column.d` of the base cabinet the customer had just deleted, beside 330 mm neighbours.
 *
 *  The cap is a maximum and never a target: an opening shallower than the cap keeps its own depth,
 *  and a column that answers `hasFullHeightUnder` wrongly can only ever make a body *shallower*
 *  than the opening it stands in. It can never push a body past its opening, which is what keeps
 *  §11 row 19 (the back face lands on the wall plane) out of reach of this rule.
 *
 *  The body's band, not the slot's: the cap describes what a wall **carcass** is — hung, with no
 *  plinth and no worktop of its own — and a wall cabinet dropped into a cleared column slot is
 *  still one. Base and full-height builders ignore the depth they are given anyway (ADR 0018). */
function resolveDepthM(
  body: InsertableBody,
  opening: InsertOpening,
  column: Column,
): number {
  const capApplies =
    normaliseBand(body.band) === "wall" && !column.hasFullHeightUnder;
  if (!capApplies) return opening.d;
  return Math.min(opening.d, WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M);
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
