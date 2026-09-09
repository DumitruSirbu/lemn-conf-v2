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
  acceptsWidthMm,
  buildableSizes,
  describeKindLabel,
  resolveWidthRangesMm,
  UNKNOWN_KIND_LABEL_RO,
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
  /** **How deep the opening is** — a `ClearanceM`, not the depth a body is built to.
   *
   *  It was both until wave 6I2, and that is `docs/BACKLOG.md` entry 15: the number is §3.2's MAX
   *  over a column's members with an appliance's door bars in it, and `resolveDepthM` was handing it
   *  to the probe as a manufactured size. What a body is built to is `BuildDepthM`, declared in
   *  `cabinet-depth-rule.ts`; the two are different types now, so this field cannot be read as one
   *  by accident (ADR 0060 decision 1).
   *
   *  It belongs to the **opening**, never to the column. `Column.d` is §3.2's MAX over the whole
   *  vertical run, so reading the depth from there builds a wall cabinet to the depth of the base
   *  cabinet standing under it: on the shipped kitchen that changed the depth of 7 of 10 columns'
   *  wall bodies on a swap, in both directions, and the replacement no longer lined up with its
   *  neighbours. ADR 0018 is why that reads as a depth at all — `frame.d` is twice a body's rear
   *  overhang, which for the two builders that consume a depth (`wallCabinet`, `openShelf`, whose
   *  carcass is centred on z = 0) is exactly the depth they were given. */
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
    // §3.3 stamps a void with its column's own depth, which `deriveColumns` derived as the MAX of
    // its members' clearances. Restated as the `ClearanceM` it is, because `VoidRecord` carries it
    // as a plain number: the frozen map persists it and a stored extent arrives off the wire.
    d: recordedClearanceM(record.d),
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
    d: vacatedOpeningDepthM(record),
    y0,
    h: slot?.h ?? record.frame.h,
    spanY0: slot?.spanY0 ?? record.frame.y0,
    spanH: slot?.spanH ?? record.frame.h,
  };
}

/** `occupiedDepthM` under the name this call site reads it by: the **clearance** of the space a body
 *  *vacates*, which is the space the next insert is planned into. The rule itself lives in
 *  `occupied-depth.ts` and its reasoning in ADR 0040.
 *
 *  This reader wants the clearance and says so (ADR 0060 decision 1): an opening is a hole, and how
 *  big the hole is is a different question from how deep a cabinet dropped into it is built. Its
 *  `ClearanceM` return type is what carries that through to `resolveDepthM`. */
const vacatedOpeningDepthM: (record: PlacementRecord) => ClearanceM =
  occupiedDepthM;

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
  if (!record.canReplace) {
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
  /** **The depth this body is built to** — `b.mk(w, h, d)`'s third argument, a manufactured size.
   *  Decided here, with the rest of the plan, so the offer list and `insertBody` cannot disagree
   *  about how deep a body would be built.
   *
   *  Typed `BuildDepthM` since wave 6I2, so an opening's `ClearanceM` cannot land here without
   *  passing through `resolveDepthM`'s declared rule (ADR 0060). */
  readonly depthM: BuildDepthM;
  readonly y0M: number;
  readonly slotBand: NormalisedBand;
  /** ADR 0046: the along-wall centre the body is seated at, in millimetres. Flush against the
   *  **left** edge of the column when the body is narrower than it, and the opening's own centre
   *  when it is not.
   *
   *  Decided here rather than in `insertBody` because seating is arithmetic on the width, and §9's
   *  offer list and the command must agree about where a body would land as much as about whether
   *  it fits.
   *
   *  **May be fractional, and is refused rather than rounded downstream.** The seated centre is
   *  `centre − (columnWidth − bodyWidth) / 2`, which falls between two millimetres whenever the
   *  column's width is odd — an extent whose members are offset by an odd millimetre gives one
   *  (`refuseFractionalCentres` in `apply-column-moves.ts` carries the measurement). */
  readonly alongMm: number;
  /** ADR 0046: what is left of the column beside the body, in millimetres, and therefore the width
   *  of the empty column the split creates. `0` means no split — the body fills the column exactly
   *  (ADR 0031 rule 6's exact-to-zero case, read for an insert) or the column is not this body's to
   *  divide (see `seatAlongColumn`). */
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
   * **The cabinet depth of the design being operated on**, which `resolveDepthM` needs and no other
   * argument carries. Read it off that design with `cabinetDepthMmOf`; never write a number here.
   *
   * **Required, and deliberately not defaulted.** Until wave 6K-b this module read the module
   * constant `WORKTOP_DEPTH_MM`, so at a 700 mm kitchen every wall body was built to the 600 mm map
   * row (ADR 0073's finding, an implementation defect against ADR 0055 decision 1). A default of 600
   * would be harmless *today* — no refusal reads the depth, and `offersFor`'s `judge` discards the
   * plan's `depthM` — and "harmless today, because no reader looks" is the precise reasoning that
   * produced the defect in the first place. Required, the wrong call site fails to compile.
   */
  readonly cabinetDepthMm: number;
}

function rejectFit(detail: RejectionDetail): InsertFit {
  return { ok: false, detail };
}

type WidthResolution =
  | { readonly ok: true; readonly widthM: number }
  | { readonly ok: false; readonly detail: RejectionDetail };

/** A discrete row's width: an entry whose every range is a single value, so there is nothing to
 *  narrow into an opening — it is built at one of its sizes or it is refused.
 *
 *  **The hood is not one of them.** It was, while ADR 0033's amendment installed a 600 centred in a
 *  wider slot; ADR 0035 decision 5 gave it the 600–800 bound every other cabinetry row carries, so
 *  it resolves on `resolveFitWidth` and fills its opening. It is built at 700 and at 800. */
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

  if (body.widthFlex === "fit")
    return resolveFitWidth(body, opening, availableMm);

  return resolveFixedSetWidth(body, body.widthFlex, opening);
}

/** §5.2's `w = void.w` for a `'fit'` body — **bounded by the entry's own set where that set is a
 *  bound** (ADR 0032 rule 4, closing `docs/BACKLOG.md` entry 13).
 *
 *  This function used to be the single line `return { ok: true, widthM: opening.w }`, and that line
 *  is why a 300 mm opening offered `wall-2door` and built one door under a two-door label — ADR 0029
 *  verbatim, through the path that ADR could not reach. `sizesMm` was consulted by `setWidth` alone,
 *  so the two halves of one engine answered the same question differently.
 *
 *  `acceptsWidthMm` is that one answer, and after ADR 0035 decision 2 it reads the entry's declared
 *  **ranges** rather than a boolean about its set. A cabinetry row is continuous between its floor
 *  and its ceiling, so `base-panbank` still fills a 570 mm opening and nothing about §5.2's "fill the
 *  void" changes for it inside 300–800; what refuses is an opening outside the entry's own bound — a
 *  fixed appliance size, a fixed aperture, §2's floor, §7's 800 mm ceiling. (A swing arc was on this
 *  list until the owner retired ADR 0030's 400 mm one-door cap on 2026-08-28; a hinged cabinet's
 *  bound has no hole in it now, and the width decides the door count rather than the cabinet.)
 *
 *  The floors have already run above and are deliberately **first**: `base-sink` in a 400 mm opening
 *  reads ADR 0017's own sentence, naming the 560 mm its worktop needs, rather than the set sentence
 *  naming widths that are no longer the point. Two facts, two codes, and the nearer one wins.
 *
 *  No tolerance, and no widest-that-fits fallback: the width **is** the opening, so there is nothing
 *  to choose between and nothing for `FIT_TOLERANCE_M` to forgive. A body that would rather be built
 *  narrower than its opening declares a millimetre set instead (`resolveFixedSetWidth`). */
function resolveFitWidth(
  body: InsertableBody,
  opening: InsertOpening,
  availableMm: number,
): WidthResolution {
  if (acceptsWidthMm(body, availableMm)) return { ok: true, widthM: opening.w };
  return {
    ok: false,
    detail: refuseFixedWidth(
      body,
      buildableSizes(body.minWidthMm, body.sizesMm),
      availableMm,
    ),
  };
}

/** §7's millimetre-set case — the dishwasher niche, the four full-height units and the bottle
 *  cargo: the widest size this builder can be made at that still fits, or the refusal that says why
 *  none can.
 *
 *  **The hood is one of them now, and was not until ADR 0033's amendment.** `catalog.ts` used to
 *  spread `wallCabinet("Hotă")` and override `sizesMm` but not `widthFlex`, so the hood inherited
 *  `'fit'` and resolved on `resolveFitWidth` — the only row in the catalogue that was both `'fit'`
 *  and discretely bounded. The consequence was that it *refused* a 700 or 800 mm opening where every
 *  other discrete row narrows into one, which was a spread rather than a decision (logic review
 *  R1.2). It declares `widthFlex` now and takes this branch, so a 700 mm slot gets a 600 mm hood,
 *  centred, exactly as `base-dishwasher` has always put a 600 in a 700.
 *
 *  "A 700 mm hood is not a product" is unchanged and still enforced by this branch: the widest size
 *  that *fits* is chosen from the entry's own set, so the hood is never built at 700.
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
 *  detail's construction is shared, so the code and its typed params cannot drift apart. */
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
      params: widthsMadeParams(body, body.sizesMm, availableMm),
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
    params: widthsMadeParams(body, sizesMm, availableMm),
  };
}

/** The parameters `WIDTH_NOT_SUPPORTED` needs to state what an entry is actually made at.
 *
 *  The ranges come from `resolveWidthRangesMm`, never from `definition.widthRangesMm` directly:
 *  that accessor raises a declared range to the floor governing the entry, and reading the raw field
 *  would be the second code path its doc block warns about — a rule stated in prose and implemented
 *  once. It also always returns an array, so there is nothing optional to spread.
 *
 *  `sizesMm` arrives already filtered by the caller (ADR 0017), and both halves matter: the ranges
 *  say what the body may be built at, the sizes say which of those §9 offers as chips. */
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
      depthM: resolveDepthM(input),
      y0M,
      slotBand,
      ...seatAlongColumn(opening, column, width.widthM),
    },
  };
}

/** Where the body sits along the wall, and what the column has left beside it. */
type Seating = Pick<InsertPlan, "alongMm" | "remainderMm">;

/** ADR 0046 part 1: **a body narrower than the column it is inserted into is seated flush against
 *  the left edge of the span — the lower along-wall coordinate — and the whole remainder becomes
 *  one empty column on the right.**
 *
 *  Centring it, which is what this path did until 2026-09-01, leaves a sliver on each side of the
 *  new body, and the two can never merge back because they are not adjacent. The owner chose the
 *  unconditional left edge over a rule that picks an end: it has no predicate to get wrong and
 *  gives the customer the same picture from the same input every time.
 *
 *  **The named cost, accepted by the owner:** where a column can be divided, `base-dishwasher` no
 *  longer centres in a 700 mm opening. It stands flush left and the 100 mm becomes a real,
 *  selectable opening on the right instead of vanishing into width no column owns. On the *seeded*
 *  kitchen that cost is not yet paid: its only 700 mm column still holds members, so it takes the
 *  centred branch below — see `dividesWholeColumn`.
 *
 *  Measured against the **column**, not the opening: the column extent is what the frozen map holds
 *  and what the split rewrites, and on a §5.3 swap in place the opening is only the outgoing body's
 *  own frame (`openingFromPlacement`). */
function seatAlongColumn(
  opening: InsertOpening,
  column: Column,
  widthM: number,
): Seating {
  // **The column still holds a member at another level, so it is not this body's to divide.** This
  // is a deliberate branch and not a fallback: the insert is *accepted* and centred, exactly as
  // every insert was before ADR 0046. Refusing it would take away an insert the customer can make
  // today. Splitting it would move the occupied half onto a new key while the member above or below
  // went on deriving the old one, and re-keying that member is backlog 2's re-split rather than
  // this wave. `dividesWholeColumn` carries the measurement.
  if (!dividesWholeColumn(opening, column)) return centredInOpening(opening);

  const remainderMm =
    seatableMillimetres(column.w) - seatableMillimetres(widthM);
  // The body fills its column — ADR 0031 rule 6's exact-to-zero case read for an insert — or
  // `FIT_TOLERANCE_M` let a discrete size overhang it by a hair. Either way there is no second
  // column, and the one that is here keeps the key it had.
  if (remainderMm <= 0) return centredInOpening(opening);

  // `C − (W − w) / 2`: the column's left edge holds and the body's left edge lands on it, which is
  // ADR 0031's "the outer edge holds" read for an insert.
  const centreMm = seatableMillimetres(alongWallM(column.wall, column));
  return { alongMm: centreMm - remainderMm / 2, remainderMm };
}

/** The seating every insert had before ADR 0046: the body takes its opening's own along-wall
 *  centre, and no column is created beside it. */
function centredInOpening(opening: InsertOpening): Seating {
  return { alongMm: seatableMillimetres(opening.alongM), remainderMm: 0 };
}

/** **A column is only divided by an opening that runs its whole height**, and this is the guard
 *  that keeps a split from stranding a body it was never about.
 *
 *  §4 subtracts height and never width (`recomputeVoids`), so a member at another level occupies
 *  the *whole* width of its column at that level — including the width the remainder would claim.
 *  Splitting under it would move the occupied half onto a new key while that member still derives
 *  the old one, leaving it in a column the map no longer holds: ADR 0011 Gap D's phantom column,
 *  and a document `validateDesignForCatalog` refuses with `EMPTY_COLUMN_OVERLAPS_PLACEMENT`.
 *
 *  Reachable with no resize and no merge: a 600 mm column with a wall cabinet above it and a
 *  300 mm bottle cargo going in below. ADR 0046 states the rule for the empty column it was written
 *  about and does not reach this case; the narrow reading is the safe one, and widening it means
 *  moving the members at the other levels, which is backlog 2's re-split rather than this wave.
 *
 *  Asked of the geometry rather than of the record set, so §9's offer list — which resolves the
 *  same opening — gets the same answer without being handed the placements. */
function dividesWholeColumn(opening: InsertOpening, column: Column): boolean {
  const floorM = Math.min(...column.regions.map(([start]) => start));
  return (
    opening.spanY0 <= floorM + COORDINATE_EPSILON_M &&
    opening.spanY0 + opening.spanH >= column.top - COORDINATE_EPSILON_M
  );
}

/** Millimetres for a coordinate that is about to be **checked** for landing on a whole one: the
 *  exact millimetre where it does — which absorbs the float noise a metre value picks up crossing a
 *  unit conversion — and the raw product where it does not, so the refusal downstream names the
 *  millimetres the value actually sits between. Rounding here is what ADR 0044 refuses by name: it
 *  collapses two column keys into one. */
function seatableMillimetres(valueM: number): number {
  return toExactMillimetres(valueM) ?? valueM * MILLIMETRES_PER_METRE;
}

/** **The one reader that wants a build depth rather than a clearance** (ADR 0060 decision 1): what
 *  the body standing in this opening is manufactured to, handed to the probe as `b.mk(w, h, d)`'s
 *  third argument.
 *
 *  It reads `columnBuildDepthM`'s **declaration** and never the opening's own MAX. Until wave 6I2 it
 *  returned `opening.d` over a full-height column, which is §3.2's MAX with an appliance's door bars
 *  in it: 703 and 742 mm wall carcasses, depths nobody manufactures, written to the database on two
 *  columns of the shipped kitchen by an ordinary delete-then-insert (`docs/BACKLOG.md` entry 15).
 *
 *  **The cap is the default and the lift is the exception**, which is the direction backlog entry 5
 *  states the rule in: "over a full-height column there is nothing to lean over". Read the other way
 *  round — cap wherever a worktop is present — an *empty* opening is uncapped, because the absence
 *  of a worktop is not the presence of a column. Empty space is neither, and empty space is what a
 *  delete produces: clearing the base cabinets under a wall run then built a 580 mm carcass, the
 *  frozen `Column.d` of the base cabinet the customer had just deleted, beside 330 mm neighbours.
 *
 *  **Where the cap applies it is a maximum and never a target**: a column shallower than the
 *  declared depth keeps its own depth, so a column that answers `hasFullHeightUnder` wrongly can
 *  only ever make a body *shallower* than the space it stands in and never push one past it, which
 *  is what keeps §11 row 19 (the back face lands on the wall plane) out of this rule's reach. The
 *  maximum is measured against the **column**, which is the space that exists, rather than against
 *  the outgoing body, which is only what happened to be standing there.
 *
 *  **Where the lift applies the declared line is the target, not a ceiling** — ADR 0060 decision 5,
 *  and the one place the two arms genuinely differ. Taking the shallower of the two would let one of
 *  ADR 0058's pinned 600 mm tops lend its pin to the catalogue body that replaces it: at a 700 mm
 *  kitchen the incoming body takes the column's build depth of 700, not the 600 it replaced.
 *
 *  The body's band, not the slot's: the cap describes what a wall **carcass** is — hung, with no
 *  plinth and no worktop of its own — and a wall cabinet dropped into a cleared column slot is
 *  still one. Base and full-height builders ignore the depth they are given anyway (ADR 0018). */
function resolveDepthM(input: InsertFitInput): BuildDepthM {
  const { body, opening, column } = input;
  if (normaliseBand(body.band) !== "wall")
    return buildToTheClearanceM(opening.d);
  // **The design's own setting, not a module constant** (wave 6K-b). This read `WORKTOP_DEPTH_MM`
  // until 2026-09-04, which was right while 600 was the only depth a document could carry and wrong
  // from wave 6J-a onward: at a 700 mm kitchen it built every wall body to the 600 mm map row — 330
  // where the map declares 400 — and nothing refused it. ADR 0073's finding carries the measurement.
  const declaredM = columnBuildDepthM({
    cabinetDepthMm: input.cabinetDepthMm,
    hasFullHeightUnder: column.hasFullHeightUnder,
  });
  if (column.hasFullHeightUnder) return declaredM;
  // **The floor is the column's clearance, not the opening's** — ADR 0060 decision 3 made total.
  // `Column.d` is §3.2's MAX over the run and both routes agree on it by construction, where
  // `InsertOpening.d` does not: a swap publishes the outgoing body's own clearance
  // (`openingFromPlacement`) and a delete-then-insert publishes the column's (`openingFromVoid`).
  // Reading the floor from the opening therefore reproduced entry 10's divergence on this arm — a
  // 200 mm body vacating a 620 mm column gave 200 by swap and 330 by delete-then-insert. Latent
  // rather than live: no reachable command mints a wall member shallower than the map row, but an
  // authored or stored document can. Raised by logic review, 2026-09-04.
  return shallowerBuildDepthM(
    declaredM,
    buildToTheClearanceM(recordedClearanceM(column.d)),
  );
}

/** **Whether the column now decides a different depth for a body that is already standing in it** —
 *  wave 6Z's outcome test (ADR 0103 decision 3), and the reason it lives here rather than in
 *  `replan-dependent-members.ts`: the answer is `resolveDepthM`'s and this wave adds no second
 *  author for it.
 *
 *  **Both sides are a `BuildDepthM`, and the opening supplies the second.** Called with the opening
 *  `openingFromPlacement` produces, `opening.d` **is** the standing body's own occupied depth — its
 *  recorded seat plus whatever its entry declares stands in front of that shell — so the comparison
 *  is "what the column says this body is built to" against "what it is built to now". The crossing is
 *  `buildToTheClearanceM`'s, which is the one sanctioned way a clearance becomes a build depth.
 *
 *  **Whole millimetres on both sides**, because both are sums of declared millimetres divided by
 *  1000 and a `1e-16` residue is not a depth anybody manufactures — the same reason
 *  `columnBuildDepthMm` states the rule in millimetres and converts once.
 *
 *  A body this answers `false` for is written through untouched: the re-plan is a no-op, so it takes
 *  no measurement and can raise no refusal. That is decision 3's own sentence — *"which may be the
 *  depth it already has, in which case the re-plan is a no-op and the placement is passed through by
 *  identity"* — and it is what keeps an insert from probing, or refusing over, a body it does not
 *  move. */
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
