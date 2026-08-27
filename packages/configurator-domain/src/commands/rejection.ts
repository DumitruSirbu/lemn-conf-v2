// Every way a command can refuse, as a stable code, its parameters, and a Romanian sentence.
//
// Both, never a choice (M3 work item 2). The code is what tests and store logic assert against; the
// sentence is what §8's `rejected` message and §9's banner render verbatim. A code with no sentence
// forces the panel to author product copy, and a sentence with no code forces tests to match on
// prose — which is how a copy edit becomes a failing engine test.
import type { NormalisedBand } from "../bands.js";

/** A refusal that needs nothing spelled out: the code and its sentence say everything. */
type NoParams = Readonly<Record<string, never>>;

interface LabelParams {
  readonly label: string;
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
      return `„${detail.params.label}” se face doar în ${renderMillimetreList(detail.params.sizesMm)} mm, iar deschiderea are ${String(detail.params.availableMm)} mm.`;
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
    case "NON_INTEGER_MILLIMETRES":
      return `Dimensiunea calculată (${detail.params.field}: ${String(detail.params.valueMm)} mm) nu este un număr întreg de milimetri.`;
    case "FINISH_NOT_SUPPORTED":
      return `„${detail.params.label}” nu are uși, deci nu i se poate schimba finisajul.`;
    case "HANDLE_NOT_SUPPORTED":
      return `„${detail.params.label}” nu are mânere.`;
  }
}
