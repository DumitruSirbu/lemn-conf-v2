// The domain works in metres (`DEVELOPMENT-SPEC.md` §2) and persists integer millimetres (§12).
// This is the only place the two meet, so a conversion cannot pick up an ad-hoc rounding rule.

export const MILLIMETRES_PER_METRE = 1000;

/** A value must land on a whole millimetre this closely to be written into a `Design`. Anything
 *  further out is a rejection, not a rounding: an inserted body whose width silently moved by a
 *  fraction of a millimetre would not reproduce its own scene on reload. */
const EXACT_MILLIMETRE_TOLERANCE_MM = 1e-3;

/** What a non-finite metre value renders as. Three.js reports an empty `Box3` as `±Infinity` mins
 *  and maxes, and arithmetic on two of those is `NaN`, so a builder that produced nothing hands the
 *  domain these rather than an exception — and a refusal sentence must still show a number a person
 *  can read, not "NaN mm".
 *
 *  This is a rendering fallback, **not** a value: it is reached only on the display path, and every
 *  value bound for a `Design` goes through `toExactMillimetres`, which answers `undefined` for the
 *  same inputs. The one persisted number derived from a measurement — an inserted body's
 *  `seatDepthMm` — is proven finite by `refuseUnusableMeasurement` in `commands/insert-body.ts`
 *  before any conversion runs. Move or delete that guard and this sentinel becomes reachable from
 *  a document, which is the reason it is named rather than written as a bare `0`. */
const UNMEASURABLE_MM = 0;

/** Millimetres from the document into the metres the geometry works in. Exact — millimetres are
 *  the discrete side, so this direction has no rounding decision to make and no failure case:
 *  every input is an integer the schema has already validated, or a catalogue constant. That is
 *  why it returns a bare `number` while the other direction has two answers. */
export function toMetres(valueMm: number): number {
  return valueMm / MILLIMETRES_PER_METRE;
}

/** Display rounding, for a refusal's parameters and a panel's numbers. Never for a value that is
 *  about to be persisted — use `toExactMillimetres` for those.
 *
 *  Total by contract: a caller building a sentence has no branch to take if this declined, so it
 *  renders `UNMEASURABLE_MM` rather than returning `undefined`. See that constant for the
 *  invariant that keeps the sentinel out of a persisted value. */
export function toMillimetres(valueM: number): number {
  if (!Number.isFinite(valueM)) return UNMEASURABLE_MM;
  return Math.round(valueM * MILLIMETRES_PER_METRE);
}

/** The persisted conversion: the whole millimetre this value sits on, or `undefined` when it does
 *  not sit on one. `NaN` and `±Infinity` sit on no millimetre. */
export function toExactMillimetres(valueM: number): number | undefined {
  if (!Number.isFinite(valueM)) return undefined;
  const millimetres = valueM * MILLIMETRES_PER_METRE;
  const rounded = Math.round(millimetres);
  if (Math.abs(millimetres - rounded) > EXACT_MILLIMETRE_TOLERANCE_MM) {
    return undefined;
  }
  return rounded;
}
