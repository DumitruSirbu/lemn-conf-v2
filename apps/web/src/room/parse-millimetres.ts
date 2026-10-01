// Step 1's length fields take whole millimetres, digits only (ADR 0126, amending ADR 0108 decision 4's
// notation; its rule stands): the text becomes a millimetre count once, here at the form boundary, on
// the digit string. The URL keeps its metre wire form and `parse-metres.ts` stays its reader, so the
// two notations meet only through the draft's millimetres.
//
// **Refused, never stripped** (ADR 0126, C-S1b-2). Deleting the characters that are not digits turns
// the habitual metre entry into a different room — *"3,6"* would read as 36 mm — and a millimetre that
// moved in conversion is a room the customer did not enter. Leading zeros are one reading of a digit
// string, so they are accepted.

/** Why a typed length is not yet a millimetre count. A code, not a sentence: the form resolves it. */
export type MillimetresRefusal =
  | "empty"
  | "notDigits"
  | "notPositive"
  | "notSafeInteger";

export type MillimetresParse =
  | { readonly ok: true; readonly mm: number }
  | { readonly ok: false; readonly reason: MillimetresRefusal };

/** ASCII digits and nothing else: no separator, sign, exponent, unit, or another script's digits. */
const MILLIMETRES_PATTERN = /^[0-9]+$/;

export function parseMillimetres(text: string): MillimetresParse {
  const trimmed = text.trim();
  if (trimmed === "") return refuse("empty");
  if (!MILLIMETRES_PATTERN.test(trimmed)) return refuse("notDigits");
  const mm = Number(trimmed);
  // Past 2^53 a digit string no longer reads back as the number it spells; refused, not rounded.
  if (!Number.isSafeInteger(mm)) return refuse("notSafeInteger");
  if (mm === 0) return refuse("notPositive");
  return { ok: true, mm };
}

function refuse(reason: MillimetresRefusal): MillimetresParse {
  return { ok: false, reason };
}
