// The domain works in metres (`DEVELOPMENT-SPEC.md` §2) and persists integer millimetres (§12).
// This is the only place the two meet, so a conversion cannot pick up an ad-hoc rounding rule.

export const MILLIMETRES_PER_METRE = 1000;

/** A value must land on a whole millimetre this closely to be written into a `Design`. Anything
 *  further out is a rejection, not a rounding: an inserted body whose width silently moved by a
 *  fraction of a millimetre would not reproduce its own scene on reload. */
const EXACT_MILLIMETRE_TOLERANCE_MM = 1e-3;

/** Display rounding, for a refusal's parameters and a panel's numbers. Never for a value that is
 *  about to be persisted — use `toExactMillimetres` for those. */
export function toMillimetres(valueM: number): number {
  return Math.round(valueM * MILLIMETRES_PER_METRE);
}

/** The persisted conversion: the whole millimetre this value sits on, or `undefined` when it does
 *  not sit on one. */
export function toExactMillimetres(valueM: number): number | undefined {
  const millimetres = valueM * MILLIMETRES_PER_METRE;
  const rounded = Math.round(millimetres);
  if (Math.abs(millimetres - rounded) > EXACT_MILLIMETRE_TOLERANCE_MM) {
    return undefined;
  }
  return rounded;
}
