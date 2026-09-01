// Every way a command can refuse, as a stable code, its parameters, and a Romanian sentence.
//
// Both, never a choice (M3 work item 2). The code is what tests and store logic assert against; the
// sentence is what §8's `rejected` message and §9's banner render verbatim. A code with no sentence
// forces the panel to author product copy, and a sentence with no code forces tests to match on
// prose — which is how a copy edit becomes a failing engine test.
import type { NormalisedBand } from "../bands.js";
import type { WidthRangeMm } from "../void-engine.js";

/** A refusal that needs nothing spelled out: the code and its sentence say everything. */
type NoParams = Readonly<Record<string, never>>;

interface LabelParams {
  readonly label: string;
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
 *  nothing to say about a cabinet: its label falls back to a `kind` string, and publishing it would
 *  put `„base_cabinet”` in front of a customer. */
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
   *  shrink; only `NO_EMPTY_SPACE` reads it, and only a growth reaches that — see
   *  `renderNoEmptySpace`. */
  readonly deltaMm: number;
  readonly sides: readonly EmptySpaceSide[];
}

/** ADR 0031 rule 1: a resize moves the whole column, so one member that cannot be rebuilt at a new
 *  width stops all of them. `memberLabel` is that member — the customer selected something else
 *  entirely, and naming what is actually in the way is the difference between a refusal they can
 *  act on and one they cannot. */
interface ColumnMemberParams extends LabelParams {
  readonly memberLabel: string;
}

/** Which number of a `BodyMeasurement` was not a number. The value itself is deliberately absent:
 *  it is `NaN` or `±Infinity`, and neither belongs in a sentence shown to a customer. */
interface MeasurementParams extends LabelParams {
  readonly field: string;
}

/** The refusal, before its sentence is rendered. Every command builds one of these and hands it to
 *  `refuse`, so no command can invent a code the message table does not cover. */
export type RejectionDetail =
  | { readonly code: "VOID_SELECTED"; readonly params: NoParams }
  | { readonly code: "TARGET_NOT_FOUND"; readonly params: NoParams }
  | { readonly code: "INVALID_OCCURRED_AT"; readonly params: NoParams }
  /** The one code no command produces. `insertBody` requires a `BodyProbe`, and in the browser
   *  that probe cannot exist until the scene has mounted — so the caller refuses on its behalf.
   *  Declared here because every refusal in this product carries a stable code *and* a rendered
   *  sentence; a caller-local shape would give the panel a second thing to switch on. */
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
  | { readonly code: "HANDLE_NOT_SUPPORTED"; readonly params: LabelParams };

export type RejectionCode = RejectionDetail["code"];

/** What a refused command carries back: the code, its parameters, and the sentence to render. */
export type RejectionReason = RejectionDetail & { readonly message: string };

/** §11 rows 3 and 4, which are the only two pairs the gate can produce: a body is refused from a
 *  base slot only when it hangs, and from a wall slot only when it stands on the floor. */
function renderBandMismatch(params: BandParams): string {
  if (params.slotBand === "base") {
    return `„${params.label}” este un corp suspendat: nu are soclu și nici blat, deci nu poate sta pe podea.`;
  }
  return `„${params.label}” este un corp de bază și nu poate fi montat pe perete. Doar coloanele pot depăși un nivel.`;
}

/** An entry whose declared floor is not a width cannot name millimetres, so the sentence states
 *  the thing that is actually true — this body cannot be added — rather than rendering `NaN` at the
 *  customer. The row is a catalogue defect; the refusal is what keeps it from being insertable at
 *  any width while it is fixed. */
function renderWidthTooSmall(params: BodyFloorParams): string {
  if (params.requiredMm === undefined) {
    return `„${params.label}” nu poate fi adăugat: lățimea minimă din catalog nu este o valoare validă.`;
  }
  return `„${params.label}” are nevoie de cel puțin ${String(params.requiredMm)} mm lățime, iar deschiderea are doar ${String(params.availableMm)} mm.`;
}

function renderMillimetreList(sizesMm: readonly number[]): string {
  return sizesMm.map((size) => String(size)).join(" sau ");
}

/** **No width at all is a different sentence, not an empty list.** A column whose members share no
 *  width — since 2026-08-29 a hood can floor one above everything standing under it — reaches here
 *  with both lists empty, and the clause below rendered `se face doar în  mm`: a hole where the
 *  numbers should be, on a chip §9 had offered (5D2b QA finding B). There is nothing to name, so
 *  this says what is true rather than naming nothing, and it names the cause the customer can act
 *  on — the bodies sharing the column.
 *
 *  It says "de deasupra" because in every reachable case the offending member *is* above the
 *  selected body: a hood floors its column from the wall level, and the disjoint-ranges branch is
 *  reached from the base body of a column whose wall member disagrees. A column whose topmost member
 *  is the selected one would point the customer at nothing, and no fixture produces one. */
function renderWidthNotSupported(params: SizesParams): string {
  const hasNoWidth =
    params.sizesMm.length === 0 && (params.widthRangesMm?.length ?? 0) === 0;
  if (hasNoWidth) {
    return `„${params.label}” nu poate fi construit la nicio lățime pe care o acceptă și corpurile de deasupra.`;
  }
  if (params.boundScope === "column") {
    return `„${params.label}” este într-o coloană care se face ${renderWidthsMadeClause(params)}, iar acum are ${String(params.availableMm)} mm.`;
  }
  return `„${params.label}” se face ${renderWidthsMadeClause(params)}, iar deschiderea are ${String(params.availableMm)} mm.`;
}

/** The widths an entry is made at, as a **clause** spliced into `„{label}” se face …`.
 *
 *  A **bound** is spoken as a bound — *"între 200 și 800 mm"* — because since ADR 0035 that is what a
 *  cabinetry row is. Listing its thirteen chips instead would be both unreadable and false: the chips
 *  are the modular widths §9 offers, while the entry is genuinely built anywhere inside the range,
 *  which is what relative stepping reaches (a 570 mm cabinet is real).
 *
 *  Everything else is spoken as a list, which covers two cases with one arm: a discrete row, whose
 *  every range is a single width, and a **column's** refusal, which carries no ranges because it
 *  names the intersection of its members' chips rather than any one entry's bound. Both are
 *  genuinely sets, so both read *"doar în 450 sau 600 mm"*.
 *
 *  The shape is asked, never a flag: `fixedWidth` is `false` on both discrete rows, so it cannot
 *  answer this (ADR 0035 decision 3, corrected). A mixed shape — one fixed width beside a range —
 *  has no row today and renders correctly anyway. */
function renderWidthsMadeClause(params: SizesParams): string {
  const ranges = params.widthRangesMm;
  if (ranges?.some((range) => range.minMm < range.maxMm) === true) {
    return ranges
      .map((range) =>
        range.minMm === range.maxMm
          ? `la ${String(range.minMm)} mm`
          : `între ${String(range.minMm)} și ${String(range.maxMm)} mm`,
      )
      .join(" sau ");
  }
  return `doar în ${renderMillimetreList(params.sizesMm)} mm`;
}

const EMPTY_SPACE_REFUSAL_RO: Readonly<Record<EmptySpaceRefusal, string>> = {
  absent: "nu este spațiu liber",
  too_narrow: "spațiul liber este prea îngust",
  opens_a_gap: "s-ar deschide un spațiu liber peste alte corpuri",
  key_taken: "corpul ar ajunge peste altă coloană",
};

const EMPTY_SPACE_SIDE_RO: Readonly<Record<EmptySpaceSide["side"], string>> = {
  right: "în dreapta",
  left: "în stânga",
};

function renderEmptySpaceSide(side: EmptySpaceSide): string {
  return `${EMPTY_SPACE_SIDE_RO[side.side]} ${EMPTY_SPACE_REFUSAL_RO[side.reason]}`;
}

/** ADR 0031's sentence: which side was tried, and why the space there could not fund the move. The
 *  number is the **space the move needs**, which is what the owner read wrongly off the earlier
 *  wording — *"coloana ar trebui să ocupe 50 mm"* names a width the cabinet would end up at.
 *
 *  **Only a growth reaches this code, so there is one clause and not two** (QA finding Q1 on wave
 *  5B1, and it has been true since ADR 0035 decision 7). On a shrink `evaluateEmptySpace` can fail
 *  only with `absent` — `remainderMm` is the extent *plus* the width being given back, so it is
 *  never negative — and when both sides are `absent`, `fundingScan` appends `vacatedEmptySpace`,
 *  which is `undefined` on a growth alone. Every shrink therefore reaches the attempt loop with a
 *  fundable side, and what it can still be refused for renders as `COLUMN_KEY_COLLISION` or
 *  `RESIZE_OPENS_GAP`. A shrink-shaped sentence here would be copy no customer could ever read —
 *  the same reason ADR 0043 deleted `remainder_below_floor` rather than leaving it in the union. */
function renderNoEmptySpace(params: EmptySpaceParams): string {
  const sides = params.sides.map(renderEmptySpaceSide).join(", iar ");
  return `„${params.label}” nu poate ajunge la ${String(params.requestedMm)} mm: coloana ar mai avea nevoie de ${String(params.deltaMm)} mm, dar ${sides}.`;
}

/** The same scan again, reaching the sharpest of its three verdicts: the space was there and the
 *  arithmetic worked, and the move was refused for **where it would land**. It carries the sides for
 *  the same reason the other two do — "it would end up over another column" with no side named
 *  leaves the customer nothing to act on, and the other edge is often one delete away from working. */
function renderColumnKeyCollision(params: EmptySpaceParams): string {
  const sides = params.sides.map(renderEmptySpaceSide).join(", iar ");
  return `„${params.label}” nu poate ajunge la ${String(params.requestedMm)} mm: ${sides}.`;
}

/** The same scan as `renderNoEmptySpace`, reaching the other verdict: at least one side could have
 *  funded the move and the opening it would have derived stands over a body. Naming the sides is
 *  what turns "not here" into something the customer can act on — the other side is usually one
 *  delete away from working. */
function renderResizeOpensGap(params: EmptySpaceParams): string {
  const sides = params.sides.map(renderEmptySpaceSide).join(", iar ");
  return `„${params.label}” nu poate fi redimensionat aici: ${sides}.`;
}

export function renderRejection(detail: RejectionDetail): string {
  switch (detail.code) {
    case "VOID_SELECTED":
      return "Aici nu se află niciun corp.";
    case "TARGET_NOT_FOUND":
      return "Selecția nu mai există. Alege din nou un corp sau un spațiu liber.";
    case "INVALID_OCCURRED_AT":
      return "Momentul modificării nu este valid, așa că nu am salvat nimic.";
    case "BODY_PROBE_UNAVAILABLE":
      return "Modelul 3D nu este încă pregătit, așa că nu pot adăuga un corp. Încearcă din nou într-o clipă.";
    case "ACCESSORY_NOT_DELETABLE":
      return `„${detail.params.label}” face parte din corpul de sub ea și nu poate fi ștearsă separat.`;
    case "NOT_DELETABLE":
      return `„${detail.params.label}” face parte din structura bucătăriei și nu poate fi șters.`;
    case "NOT_IN_LIBRARY":
      return "Corpul acesta nu există în catalog.";
    case "NOT_INSERTABLE":
      return `„${detail.params.label}” face parte din configurația inițială și nu poate fi adăugat din catalog.`;
    case "TARGET_NOT_REPLACEABLE":
      return `„${detail.params.label}” face parte din structura bucătăriei și nu poate fi înlocuit.`;
    case "BAND_MISMATCH":
      return renderBandMismatch(detail.params);
    case "WIDTH_TOO_LARGE":
      return `„${detail.params.label}” are ${String(detail.params.requiredMm)} mm lățime, iar deschiderea are doar ${String(detail.params.availableMm)} mm.`;
    case "WIDTH_TOO_SMALL":
      return renderWidthTooSmall(detail.params);
    case "WIDTH_NOT_SUPPORTED":
      return renderWidthNotSupported(detail.params);
    case "OPENING_TOO_SHORT":
      return `Deschiderea are doar ${String(detail.params.availableMm)} mm înălțime; sub ${String(detail.params.minimumMm)} mm nu se poate construi un corp.`;
    case "HEIGHT_EXCEEDS_LEVEL":
      return `„${detail.params.label}” are ${String(detail.params.requiredMm)} mm înălțime și nu încape pe acest nivel de ${String(detail.params.availableMm)} mm. Doar coloanele pot depăși un nivel.`;
    case "HEIGHT_TOO_LARGE":
      return `„${detail.params.label}” are ${String(detail.params.requiredMm)} mm înălțime, iar spațiul liber are ${String(detail.params.availableMm)} mm.`;
    case "NO_SNAP_POSITION":
      return `„${detail.params.label}” nu poate fi așezat pe niciuna dintre liniile de modul ale acestei coloane.`;
    case "BUILT_SIZE_MISMATCH":
      return `„${detail.params.label}” s-a construit la ${String(detail.params.builtMm)} mm în loc de ${String(detail.params.requiredMm)} mm, așa că nu l-am așezat.`;
    case "MEASUREMENT_UNUSABLE":
      return `Nu am putut măsura corpul „${detail.params.label}” după ce a fost construit, așa că nu l-am așezat.`;
    case "COLUMN_MISMATCH":
      return `„${detail.params.label}” ar ieși din coloana în care a fost adăugat.`;
    case "NOT_RESIZABLE":
      return `„${detail.params.label}” nu își poate schimba lățimea.`;
    case "WIDTH_UNCHANGED":
      return `„${detail.params.label}” are deja ${String(detail.params.widthMm)} mm lățime.`;
    case "NO_EMPTY_SPACE":
      return renderNoEmptySpace(detail.params);
    case "COLUMN_MEMBER_NOT_RESIZABLE":
      return `„${detail.params.label}” nu poate fi redimensionat: în aceeași coloană stă „${detail.params.memberLabel}”, care nu își poate schimba lățimea.`;
    case "RESIZE_OPENS_GAP":
      return renderResizeOpensGap(detail.params);
    case "COLUMN_KEY_COLLISION":
      return renderColumnKeyCollision(detail.params);
    case "COLUMN_HOOD_FLOOR":
      return `„${detail.params.label}” nu poate coborî la ${String(detail.params.requestedMm)} mm: hota de deasupra are ${String(detail.params.hoodWidthMm)} mm.`;
    case "NON_INTEGER_MILLIMETRES":
      return `Dimensiunea calculată (${detail.params.field}: ${String(detail.params.valueMm)} mm) nu este un număr întreg de milimetri.`;
    case "FINISH_NOT_SUPPORTED":
      return `„${detail.params.label}” nu are uși, deci nu i se poate schimba finisajul.`;
    case "HANDLE_NOT_SUPPORTED":
      return `„${detail.params.label}” nu are mânere.`;
  }
}
