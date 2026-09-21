// The room URL carries lengths as metres (`?wallA=3.56`) and the domain judges whole millimetres, so
// the query's reading converts once, here (ADR 0108 decision 4). Since ADR 0126 the length fields take
// whole millimetres through `parse-millimetres.ts`; this parser reads the wire alone, and every link
// ever written still means what it meant. It works on the digit string and never multiplies a float:
// `1.005 * 1000` is `1004.9999999999999`, and a millimetre that moved in conversion is a room the
// customer did not enter.

/** Why a typed length is not yet a millimetre count. A code, not a sentence: the form resolves it. */
export type MetresRefusal =
  | "empty"
  | "notANumber"
  | "notWholeMillimetres"
  | "notPositive";

export type MetresParse =
  | { readonly ok: true; readonly mm: number }
  | { readonly ok: false; readonly reason: MetresRefusal };

/** Whole metres, then optionally one decimal comma or point and at least one digit. No sign, no
 *  exponent and no group separator — every other shape is `notANumber`. */
const METRES_PATTERN = /^(\d+)(?:[.,](\d+))?$/;

/** A metre's decimal places that are still millimetres. */
const MILLIMETRE_DECIMALS = 3;

const NON_ZERO_DIGIT = /[1-9]/;

export function parseMetresToMillimetres(text: string): MetresParse {
  const trimmed = text.trim();
  if (trimmed === "") return refuse("empty");
  const match = METRES_PATTERN.exec(trimmed);
  if (match === null) return refuse("notANumber");
  const [, wholeMetreDigits = "", decimalDigits = ""] = match;
  return millimetresFromDigits(wholeMetreDigits, decimalDigits);
}

/** Joins the whole metres to the first three decimals as one digit string, so `3` and `6` read as
 *  `3` + `600`. A non-zero digit past the third decimal is a fraction of a millimetre: refused, not
 *  rounded, so `3,6000` is 3600 and `3,6005` is not a length. */
function millimetresFromDigits(
  wholeMetreDigits: string,
  decimalDigits: string,
): MetresParse {
  const millimetreDigits = decimalDigits
    .slice(0, MILLIMETRE_DECIMALS)
    .padEnd(MILLIMETRE_DECIMALS, "0");
  if (NON_ZERO_DIGIT.test(decimalDigits.slice(MILLIMETRE_DECIMALS))) {
    return refuse("notWholeMillimetres");
  }
  const mm = Number(wholeMetreDigits + millimetreDigits);
  // Past 2^53 a digit string no longer reads back as the number it spells; refused, not rounded.
  if (!Number.isSafeInteger(mm)) return refuse("notANumber");
  if (mm === 0) return refuse("notPositive");
  return { ok: true, mm };
}

function refuse(reason: MetresRefusal): MetresParse {
  return { ok: false, reason };
}
