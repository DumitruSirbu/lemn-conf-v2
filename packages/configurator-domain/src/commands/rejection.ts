// Every way a command can refuse, as a stable code and its typed parameters. Customer-facing copy
// belongs to the app's locale catalogue; the domain remains locale-free (ADR 0095 decision 3).
import type { NormalisedBand } from "../bands.js";
import type { BodyLabel } from "../catalog.js";
import type { WidthRangeMm } from "../void-engine.js";

/** A refusal whose code needs no interpolation parameters. */
type NoParams = Readonly<Record<string, never>>;

interface LabelParams {
  /** **A descriptor, never a sentence** (ADR 0095 decision 4). The app resolves it through
   *  `catalog.*` and interpolates the resulting string into this refusal's own message; ICU cannot
   *  reference a sub-message by argument, so the order is resolve-then-interpolate. */
  readonly label: BodyLabel;
}

/** Which fact refused a resize, published rather than left to be re-derived by whoever is holding
 *  the refusal.
 *
 *  `fixed` is a **fact about a cabinet**: the catalogue declares this row is made at one width, and
 *  ADR 0049 renders it as a disabled chip carrying this refusal's own sentence. `unresolvable` is
 *  **missing catalogue data**: the row resolves no §7 entry to be rebuilt through — the corners
 *  (ADR 0011 Gap A) by declaration, an unfinished row by omission — and finding R2.7 requires it to
 *  keep failing loudly rather than being dressed up as a constrained product.
 *
 *  **`unresolvable` wins when both are true.** A row that is `fixedWidth` *and* unfinished has
 *  nothing to say about a *cabinet*, so its label falls back to its kind — which is a real word and
 *  not a fallback of last resort: all four corner kinds are named (`corner_base_x`,
 *  `corner_base_return`, `corner_wall_return`, `corner_wall_return_top`, ADR 0025 and ADR 0066), so
 *  the refusal reads *"Dulap bază de colț"* rather than the generic `catalog.unknownKind`. Only a
 *  kind `KNOWN_BODY_KINDS` does not carry falls that far, and no shipped row has one. */
export type NotResizableCause = "fixed" | "unresolvable";

interface NotResizableParams extends LabelParams {
  readonly cause: NotResizableCause;
}

interface BuildIdParams {
  readonly buildId: string;
}

/** A comparison the customer can check against the tape measure in their hand (§11 row 5). */
interface FitParams extends LabelParams {
  readonly requiredMm: number;
  readonly availableMm: number;
}

/** ADR 0017's per-entry floor, read against an opening. `requiredMm` is **absent** when the row's
 *  declared floor is not a width at all — the same position `MeasurementParams` takes below: the
 *  value is `NaN` or `±Infinity`, and neither belongs in a sentence shown to a customer. */
interface BodyFloorParams extends LabelParams {
  readonly requiredMm?: number;
  readonly availableMm: number;
}

interface SizesParams extends LabelParams {
  readonly sizesMm: readonly number[];
  /** ADR 0035 decision 2: what the entry can be **built** at, which after this wave is a bound and
   *  not the chip list beside it. Carried so the sentence can say "between 200 and 800" where that
   *  is the truth; `sizesMm` alone would make it claim a cabinet made at 570 is not made at 570.
   *
   *  Optional because a **column's** refusal may have no bound behind it at all. */
  readonly widthRangesMm?: readonly WidthRangeMm[];
  /** **Whose bound this is**, and the sentence changes accordingly.
   *
   *  A resize refuses on the **column's** intersected range, and rendering that under the selected
   *  body's name is a lie: selecting a wall cabinet in the sink's column produced *„Corp suspendat”
   *  se face între 560 și 800 mm* — 560 is `SINK_MIN_WIDTH_MM` from the body one level down, and a
   *  wall cabinet is built 200–800. The sentence was false about the cabinet it named and never
   *  named the sink, the one body the customer could act on (5D2c product-logic review B1).
   *
   *  Same defect class `COLUMN_HOOD_FLOOR` was created for — a column-scoped fact in body-scoped
   *  words — on the range axis instead of the floor axis. The insert path's refusal really is about
   *  the body's own bound, so it keeps the body wording; `"column"` is the resize path's. */
  readonly boundScope?: "body" | "column";
  readonly availableMm: number;
}

interface BandParams extends LabelParams {
  readonly bodyBand: NormalisedBand;
  readonly slotBand: NormalisedBand;
}

interface OpeningHeightParams {
  readonly availableMm: number;
  readonly minimumMm: number;
}

interface BuiltSizeParams extends LabelParams {
  readonly requiredMm: number;
  readonly builtMm: number;
}

interface MillimetreParams {
  readonly field: string;
  readonly valueMm: number;
}

/** The width a body already has, so §5.4's refusal can say so rather than rebuilding it into the
 *  same geometry. §9 renders this width's chip `active`, never `free`, so the customer cannot reach
 *  it — but "a chip is free iff the command succeeds" only holds if the command refuses here. */
interface CurrentWidthParams extends LabelParams {
  readonly widthMm: number;
}

/** Why one side of ADR 0031's scan could not fund the resize. Each value is a distinct fact about
 *  the space next door, because a refusal that says only "no room" leaves the customer with nothing
 *  to act on: they need to know whether to delete something, and on which side. */
export type EmptySpaceRefusal =
  /** No **empty** column is edge-adjacent on that side — either a body stands there or the wall
   *  ends. ADR 0031 rule 2: width comes from empty space and from nowhere else. */
  | "absent"
  /** There is an empty column, and it is narrower than the growth being asked for. */
  | "too_narrow"
  /** The space is there and the arithmetic works, but the move would leave an opening standing over
   *  a body — see `RESIZE_OPENS_GAP`. It is a per-side answer rather than a verdict (FINDING Q1.2):
   *  the scan carries on to the other side, and only refuses when no side can fund the move without
   *  one. */
  | "opens_a_gap"
  /** The space is there and the arithmetic works, but the resized column's new centre lands on a
   *  key another column already holds — see `COLUMN_KEY_COLLISION`. Per-side for the same reason
   *  `opens_a_gap` is: which edge is held decides the new centre, so a key taken funding from the
   *  right may be free funding from the left. */
  | "key_taken";

export interface EmptySpaceSide {
  readonly side: "right" | "left";
  readonly reason: EmptySpaceRefusal;
}

/** ADR 0031's refusal, with the whole scan in it: the width that was asked for, how much empty
 *  space it needed, and what each side answered — in the order right-then-left it tries them. */
interface EmptySpaceParams extends LabelParams {
  readonly requestedMm: number;
  /** Signed: positive grows the column, so the empty column must give that much away. It stays
   *  signed because `RESIZE_OPENS_GAP` and `COLUMN_KEY_COLLISION` carry these same params on a
   *  shrink; only `NO_EMPTY_SPACE` reads it, and only a growth reaches that. */
  readonly deltaMm: number;
  readonly sides: readonly EmptySpaceSide[];
}

/** ADR 0031 rule 1: a resize moves the whole column, so one member that cannot be rebuilt at a new
 *  width stops all of them. `memberLabel` is that member — the customer selected something else
 *  entirely, and naming what is actually in the way is the difference between a refusal they can
 *  act on and one they cannot. */
interface ColumnMemberParams extends LabelParams {
  readonly memberLabel: BodyLabel;
}

/** Which number of a `BodyMeasurement` was not a number. The value itself is deliberately absent:
 *  it is `NaN` or `±Infinity`, and neither belongs in a sentence shown to a customer. */
interface MeasurementParams extends LabelParams {
  readonly field: string;
}

/** Every command builds one of these and hands it to `refuse`, so refusal data remains exhaustive
 *  and typed at the domain boundary. */
export type RejectionDetail =
  | { readonly code: "VOID_SELECTED"; readonly params: NoParams }
  | { readonly code: "TARGET_NOT_FOUND"; readonly params: NoParams }
  | { readonly code: "INVALID_OCCURRED_AT"; readonly params: NoParams }
  /** The one code no command produces. `insertBody` requires a `BodyProbe`, and in the browser
   *  that probe cannot exist until the scene has mounted — so the caller refuses on its behalf.
   *  Declared here so every refusal in this product crosses the same typed boundary; a caller-local
   *  shape would give the panel a second thing to switch on. */
  | { readonly code: "BODY_PROBE_UNAVAILABLE"; readonly params: NoParams }
  /** ADR 0027 removed this refusal's subject and ADR 0038 confirmed no stored document carries
   *  one: the hob is part of its cabinet body, so no placement is a standalone accessory and no
   *  command produces this code. Kept because §11 row 15 is still the rule it words — a customer
   *  must never be able to delete the hob out from under its cabinet — and because a body that
   *  stands on another is a shape §3.1 still allows. `BODY_PROBE_UNAVAILABLE` above is the
   *  precedent for a declared-but-uncommanded code. */
  | { readonly code: "ACCESSORY_NOT_DELETABLE"; readonly params: LabelParams }
  | { readonly code: "NOT_DELETABLE"; readonly params: LabelParams }
  | { readonly code: "NOT_IN_LIBRARY"; readonly params: BuildIdParams }
  | { readonly code: "NOT_INSERTABLE"; readonly params: LabelParams }
  | { readonly code: "TARGET_NOT_REPLACEABLE"; readonly params: LabelParams }
  | { readonly code: "BAND_MISMATCH"; readonly params: BandParams }
  | { readonly code: "WIDTH_TOO_LARGE"; readonly params: FitParams }
  | { readonly code: "WIDTH_TOO_SMALL"; readonly params: BodyFloorParams }
  | { readonly code: "WIDTH_NOT_SUPPORTED"; readonly params: SizesParams }
  | {
      readonly code: "OPENING_TOO_SHORT";
      readonly params: OpeningHeightParams;
    }
  | { readonly code: "HEIGHT_EXCEEDS_LEVEL"; readonly params: FitParams }
  | { readonly code: "HEIGHT_TOO_LARGE"; readonly params: FitParams }
  | { readonly code: "NO_SNAP_POSITION"; readonly params: LabelParams }
  | { readonly code: "BUILT_SIZE_MISMATCH"; readonly params: BuiltSizeParams }
  | {
      readonly code: "MEASUREMENT_UNUSABLE";
      readonly params: MeasurementParams;
    }
  | { readonly code: "COLUMN_MISMATCH"; readonly params: LabelParams }
  /** §5.4 on a body that has no width to change: a `fixedWidth` entry, or one with no §7
   *  equivalent to rebuild through.
   *
   *  **The two are different facts, and since [ADR 0049] a surface acts differently on them**, which
   *  is why `cause` is published beside the label. The section used to be hidden for both — §9's
   *  `canWidth` did it — and this code was the engine's own half of that one rule. It is now the
   *  sentence a fixed-width cabinet shows the customer, so which fact produced it decides whether it
   *  may be shown at all. */
  | { readonly code: "NOT_RESIZABLE"; readonly params: NotResizableParams }
  | { readonly code: "WIDTH_UNCHANGED"; readonly params: CurrentWidthParams }
  /** ADR 0031 rule 2: the move needs an adjacent empty column and there is not one.
   *
   *  **ADR 0035 decision 7 narrowed what reaches this to growth, near enough.** A shrink now creates
   *  the empty column it needs out of the extent it vacates, so "nowhere to take the width from" is
   *  a fact about growing into a full run. The one shrink that still lands here is the one whose
   *  vacated strip would key onto a column the frozen map already holds — the corner leg's, measured
   *  — and the sentence is honest for it too: there is nowhere to put the space. */
  | { readonly code: "NO_EMPTY_SPACE"; readonly params: EmptySpaceParams }
  /** ADR 0031 rule 1 read from the engine's end: the column holds a body that cannot change width
   *  — a corner, an appliance, a `fixedWidth` entry, or one with no §7 equivalent — so the column
   *  cannot move as one. */
  | {
      readonly code: "COLUMN_MEMBER_NOT_RESIZABLE";
      readonly params: ColumnMemberParams;
    }
  /** Wave 6Z, ADR 0103 decision 7: the insert succeeded on its own terms, and a body already
   *  standing over the column could not be rebuilt at the depth the column now decides.
   *
   *  **The insert is atomic**, so this loses the whole command rather than leaving a column half
   *  re-planned — the "silent mixture" `rebuildEveryBodyAt` refuses by name, and the state this wave
   *  exists to remove.
   *
   *  **It names both bodies**, which is why it carries `ColumnMemberParams` rather than passing the
   *  inner refusal through. The inner one is a sentence about a cabinet the customer never touched;
   *  handing it over unchanged would answer a tap on one body with a complaint about another and no
   *  connective between them. */
  | {
      readonly code: "DEPENDENT_MEMBER_NOT_REBUILDABLE";
      readonly params: ColumnMemberParams;
    }
  /** **Re-stated by ADR 0031, not deleted.** It used to refuse whenever the derived opening set
   *  changed at all; under ADR 0031 that happens on *every* legal resize, because the empty column
   *  funding it shrinks. The defect it guards is unchanged and still live, so it is now that
   *  defect stated directly: **no opening may appear where a body physically stands.**
   *
   *  It stays reachable because the empty column's extent is frozen (ADR 0011 Gap D) while its
   *  width moves. Widen it past what its own members used to cover and its load-time regions can
   *  come to lie over a body in a neighbouring column — measured on the shipped kitchen, where
   *  narrowing `A|0.75` to 200 mm into a cleared `A|1.30` offers a 900 mm base opening across the
   *  corner leg `p25` is standing in.
   *
   *  It fires only when **no** side can fund the move without one (FINDING Q1.2): a phantom on the
   *  right sends the scan to the left, and the same clear that makes the right side available must
   *  not take away a move the left side was funding. It carries the same per-side record
   *  `NO_EMPTY_SPACE` does, so the sentence still says which side was tried and what each answered —
   *  the three width-scan codes are one scan reaching three verdicts, ordered by how far it got
   *  (`COLUMN_KEY_COLLISION` > this > `NO_EMPTY_SPACE`). */
  | { readonly code: "RESIZE_OPENS_GAP"; readonly params: EmptySpaceParams }
  /** §3.2's keys are positions, so a move that lands a column on a position another column already
   *  occupies would **overwrite** that column's frozen extent — deleting a run with no command and
   *  no effect naming it. `refuseColumnDrift` cannot see it: the clobbered column's members still
   *  derive the same key, so nothing has drifted.
   *
   *  Reachable where columns overlap, which §3.2 permits and the shipped kitchen has (`A|0.45` spans
   *  0–900 across `A|0.30` and `A|0.75`), **and** where a shrink's vacated strip would key onto an
   *  existing column — the `p8`/`p15` → 300 case in the shipped kitchen. Found by wave 5D2b's QA on
   *  both, and answered by one guard rather than two (clean-code review R3.5).
   *
   *  Carries `EmptySpaceParams` like `NO_EMPTY_SPACE` and `RESIZE_OPENS_GAP`: all three are the same
   *  scan reaching different verdicts, and each names the sides it tried. */
  | { readonly code: "COLUMN_KEY_COLLISION"; readonly params: EmptySpaceParams }
  /** The width is one every cabinet in the column is built at, and the **hood above them** is wider
   *  than it. ADR 0035 decision 6 as amended: a hood keeps its own width and floors its column, so
   *  the run can never be narrower than the hood hanging over it.
   *
   *  Its own code because `WIDTH_NOT_SUPPORTED` was blaming the wrong body — the floor is folded
   *  into the column's bound, so an 800 mm hood over a sink column produced *"«Corp spălător» se
   *  face doar în 800 mm"* when the sink is built 560–800, and never mentioned the hood, which is
   *  the one thing the customer could delete to unlock the column (5D2b product-logic review). */
  | {
      readonly code: "COLUMN_HOOD_FLOOR";
      readonly params: LabelParams & {
        readonly hoodWidthMm: number;
        readonly requestedMm: number;
      };
    }
  | {
      readonly code: "NON_INTEGER_MILLIMETRES";
      readonly params: MillimetreParams;
    }
  | { readonly code: "FINISH_NOT_SUPPORTED"; readonly params: LabelParams }
  /** Wave 6Q-a, ADR 0078 decision 6: the colour asked for is one the kitchen's **material** does not
   *  offer — a PAL decor on a veneer kitchen, a free colour on either. Refused rather than stored,
   *  because the invalid state this refusal prevents is exactly the one the load seam would then
   *  have to correct, and because a silent no-op looks identical to a broken control.
   *
   *  **`NoParams`, for the two 6E tier codes' reason.** The material id is developer text the domain
   *  has no book to name from (ADR 0062 seam 1), and the colour the customer just tapped is already
   *  on screen in front of them.
   *
   *  Between this wave and 6R the panel still offers the five legacy chips, two of which (*Lut*,
   *  *Salvie*) write a free colour onto a PAL kitchen and land here. That is a named, accepted
   *  interim — a sentence instead of a stored violation — and 6R clears it by making the offer the
   *  control's own. */
  | { readonly code: "FINISH_NOT_OFFERED"; readonly params: NoParams }
  | { readonly code: "HANDLE_NOT_SUPPORTED"; readonly params: LabelParams }
  /** Wave 6E: the tier asked for is not one the caller's book offers. A refusal rather than a
   *  silent no-op, for `set-appearance.ts`'s own stated reason — a no-op looks identical to a
   *  broken control.
   *
   *  **`NoParams`, deliberately.** The only thing these two could carry is the tier id, and a raw
   *  book identifier is developer text: it is never rendered, translated or read by a customer, and
   *  `LabelParams` has no name to fill from because the domain imports no book to look one up in
   *  (ADR 0062 seam 1). */
  | { readonly code: "UNKNOWN_MATERIAL_TIER"; readonly params: NoParams }
  | { readonly code: "UNKNOWN_HARDWARE_TIER"; readonly params: NoParams }
  /** The depth asked for is not one of the declared manufactured depths, or it is under the floor
   *  ADR 0059's dishwasher sets. `NoParams` for the same reason the two tiers carry none: the
   *  millimetre the customer did not choose tells them nothing, and the control offers the set. */
  | { readonly code: "UNKNOWN_CABINET_DEPTH"; readonly params: NoParams };

export type RejectionCode = RejectionDetail["code"];

/** What a refused command carries back. Kept as the public name used by stores and views. */
export type RejectionReason = RejectionDetail;
