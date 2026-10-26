// Every way a command can refuse, as a stable code and its typed parameters. Customer-facing copy
// belongs to the app's locale catalogue; the domain remains locale-free (ADR 0095 decision 3).
import type { NormalisedBand } from "../bands.js";
import type { BodyLabel } from "../catalog.js";
import type { WidthRangeMm } from "../void-engine.js";

/** A refusal whose code needs no interpolation parameters. */
type NoParams = Readonly<Record<string, never>>;

interface LabelParams {
  /** A descriptor, never a sentence: the app resolves it through `catalog.*` and interpolates the string
   *  into this refusal's message (ICU cannot reference a sub-message by argument). see ADR 0095 decision 3 */
  readonly label: BodyLabel;
}

/** Which fact refused a resize, published so no holder of the refusal re-derives it. `fixed`: the catalogue
 *  declares this row is made at one width (ADR 0049 renders it with this refusal's own sentence).
 *  `unresolvable`: missing catalogue data, the row resolves no §7 entry to rebuild through (the corners by
 *  declaration, an unfinished row by omission); it must keep failing loudly, not pose as a constrained
 *  product (finding R2.7).
 *
 *  `unresolvable` wins when both are true: a `fixedWidth` and unfinished row has nothing to say about a
 *  cabinet, so its label falls back to its kind, and all four corner kinds are named (so a corner reads
 *  *"Dulap bază de colț"*, not `catalog.unknownKind`). Only a kind `KNOWN_BODY_KINDS` lacks falls that far. */
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

/** ADR 0017's per-entry floor, read against an opening. `requiredMm` is absent when the declared floor is
 *  not a width (`NaN` or `±Infinity`), which never belongs in a customer sentence. */
interface BodyFloorParams extends LabelParams {
  readonly requiredMm?: number;
  readonly availableMm: number;
}

interface SizesParams extends LabelParams {
  readonly sizesMm: readonly number[];
  /** What the entry can be built at (ADR 0035 decision 2): a bound, not the chip list beside it, so the
   *  sentence can say "between 200 and 800" instead of claiming a cabinet made at 570 is not. Optional
   *  because a column's refusal may have no bound behind it. */
  readonly widthRangesMm?: readonly WidthRangeMm[];
  /** Whose bound this is. A resize refuses on the column's intersected range, and rendering that under the
   *  selected body's name is false (a wall cabinet in the sink's column read "between 560 and 800 mm", the
   *  sink's floor), so the resize path uses `"column"`. The insert path's refusal is about the body's own
   *  bound and keeps `"body"`. */
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

/** The width a body already has, so §5.4's refusal can say so rather than rebuild the same geometry. §9
 *  renders this width's chip `active`, never `free`; "a chip is free iff the command succeeds" holds
 *  only if the command refuses here. */
interface CurrentWidthParams extends LabelParams {
  readonly widthMm: number;
}

/** Why one side of ADR 0031's scan could not fund the resize; each is a distinct fact so the customer
 *  knows whether to delete something, and on which side. */
export type EmptySpaceRefusal =
  /** No empty column is edge-adjacent on that side: a body stands there, the wall ends, or a shrink's
   *  only abutting column could not record the strip (`recordsTheStripAShrinkHandsOver`). Space at
   *  another level is not space this run can spend (ADR 0031 rule 2). */
  | "absent"
  /** There is an empty column, and it is narrower than the growth being asked for. */
  | "too_narrow"
  /** The move would leave an opening standing over a body (`RESIZE_OPENS_GAP`). A per-side answer, not a
   *  verdict: the scan carries on to the other side and refuses only when no side can fund the move. */
  | "opens_a_gap"
  /** The resized column's new centre lands on a key another column holds (`COLUMN_KEY_COLLISION`).
   *  Per-side like `opens_a_gap`: which edge is held decides the new centre. */
  | "key_taken";

export interface EmptySpaceSide {
  readonly side: "right" | "left";
  readonly reason: EmptySpaceRefusal;
}

/** ADR 0031's refusal with the whole scan in it: the width asked for, and what each side answered, right
 *  then left. */
interface EmptySpaceParams extends LabelParams {
  readonly requestedMm: number;
  /** Signed: positive grows the column. Signed because `RESIZE_OPENS_GAP` and `COLUMN_KEY_COLLISION` carry
   *  these params on a shrink too; only `NO_EMPTY_SPACE` reads it, and only a growth reaches that. */
  readonly deltaMm: number;
  readonly sides: readonly EmptySpaceSide[];
}

/** ADR 0031 rule 1: a resize moves the whole column, so one member that cannot be rebuilt stops all of
 *  them. `memberLabel` names that member, since the customer selected something else. */
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
  /** The one code no command produces: `insertBody` requires a `BodyProbe`, which cannot exist in the
   *  browser until the scene has mounted, so the caller refuses on its behalf. Declared here so every
   *  refusal crosses the same typed boundary. */
  | { readonly code: "BODY_PROBE_UNAVAILABLE"; readonly params: NoParams }
  /** No command produces this code: the hob is part of its cabinet body, so no placement is a standalone
   *  accessory (ADR 0027). Kept because §11 row 15 still words the rule (the hob can never be deleted out
   *  from under its cabinet) and §3.1 still allows a body standing on another. */
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
  /** §5.4 on a body with no width to change: a `fixedWidth` entry, or one with no §7 equivalent to
   *  rebuild through. `cause` is published beside the label because a surface acts differently on the
   *  two (ADR 0049 shows this sentence for a fixed-width cabinet), so which fact produced it decides
   *  whether it may be shown at all. */
  | { readonly code: "NOT_RESIZABLE"; readonly params: NotResizableParams }
  | { readonly code: "WIDTH_UNCHANGED"; readonly params: CurrentWidthParams }
  /** ADR 0031 rule 2: the move needs an adjacent empty column and there is not one. A shrink creates the
   *  column it needs (ADR 0035 decision 7), so this is a growth into a full run, plus the one shrink whose
   *  vacated strip would key onto an existing column (the corner leg's): there is nowhere to put the space. */
  | { readonly code: "NO_EMPTY_SPACE"; readonly params: EmptySpaceParams }
  /** ADR 0031 rule 1: the column holds a body that cannot change width (a corner, an appliance, a
   *  `fixedWidth` entry, or one with no §7 equivalent), so the column cannot move as one. */
  | {
      readonly code: "COLUMN_MEMBER_NOT_RESIZABLE";
      readonly params: ColumnMemberParams;
    }
  /** ADR 0103 decision 7: the insert succeeded on its own terms, but a body already standing over the
   *  column could not be rebuilt at the depth the column now decides. The insert is atomic, so the whole
   *  command is lost rather than leaving a column half re-planned. It names both bodies
   *  (`ColumnMemberParams`) rather than passing the inner refusal through, which would answer a tap on one
   *  body with a complaint about another. */
  | {
      readonly code: "DEPENDENT_MEMBER_NOT_REBUILDABLE";
      readonly params: ColumnMemberParams;
    }
  /** No opening may appear where a body physically stands (ADR 0031 restated the old any-change refusal).
   *  Still reachable because the empty column's extent is frozen (ADR 0011 Gap D) while its width moves:
   *  narrowing `A|0.75` to 200 mm into a cleared `A|1.30` offers a 900 mm base opening across the corner
   *  leg `p25`. Fires only when every side's move opens one (a side that does sends the scan to the other), and
   *  carries the same per-side record as `NO_EMPTY_SPACE`; the three width-scan codes are one scan ordered by how
   *  far it got (`COLUMN_KEY_COLLISION` > this > `NO_EMPTY_SPACE`). */
  | { readonly code: "RESIZE_OPENS_GAP"; readonly params: EmptySpaceParams }
  /** §3.2's keys are positions, so landing a column on a position another column occupies would overwrite
   *  that column's frozen extent, deleting a run with no command naming it. `refuseColumnDrift` cannot see
   *  it: the clobbered column's members still derive the same key. Reachable where columns overlap (`A|0.45`
   *  spans 0–900 across `A|0.30` and `A|0.75`) and where a shrink's vacated strip keys onto an existing
   *  column (`p8`/`p15` to 300). Carries `EmptySpaceParams` like the other two scan codes. */
  | { readonly code: "COLUMN_KEY_COLLISION"; readonly params: EmptySpaceParams }
  /** The width is one every cabinet in the column is built at, and the hood above them is wider. A hood
   *  keeps its own width and floors its column (ADR 0035 decision 6 as amended). Its own code because
   *  `WIDTH_NOT_SUPPORTED` blamed the wrong body: an 800 mm hood over a sink column read "«Corp spălător»
   *  se face doar în 800 mm" and never named the hood, the one thing the customer could delete. */
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
  /** The colour asked for is one the kitchen's material does not offer (a PAL decor on a veneer kitchen,
   *  a free colour on either). Refused rather than stored, since a stored violation would have to be
   *  corrected at the load seam and a silent no-op looks like a broken control (ADR 0078 decision 6).
   *  `NoParams`: the material id is developer text the domain has no book to name from, and the tapped
   *  colour is already on screen. */
  | { readonly code: "FINISH_NOT_OFFERED"; readonly params: NoParams }
  | { readonly code: "HANDLE_NOT_SUPPORTED"; readonly params: LabelParams }
  /** The tier asked for is not one the caller's book offers; refused rather than a silent no-op. `NoParams`:
   *  the only thing these could carry is the tier id, which is developer text no customer reads, and the
   *  domain imports no book to name it from (ADR 0062 seam 1). */
  | { readonly code: "UNKNOWN_MATERIAL_TIER"; readonly params: NoParams }
  | { readonly code: "UNKNOWN_HARDWARE_TIER"; readonly params: NoParams }
  /** The kitchen handle asked for is not a declared `Handle`. Not `HANDLE_NOT_SUPPORTED` (a body takes none)
   *  and not an availability refusal. */
  | { readonly code: "UNKNOWN_HANDLE"; readonly params: NoParams }
  /** The depth asked for is not a declared manufactured depth, or is under the floor the dishwasher sets
   *  (ADR 0059). `NoParams`: the control offers the set, so the millimetre the customer did not choose
   *  tells them nothing. */
  | { readonly code: "UNKNOWN_CABINET_DEPTH"; readonly params: NoParams };

export type RejectionCode = RejectionDetail["code"];

/** What a refused command carries back. Kept as the public name used by stores and views. */
export type RejectionReason = RejectionDetail;
