// The one direction a room length travels out of whole millimetres into metres: the URL's wire form.
// The domain only ever sees millimetres (ADR 0108 decision 4), so this is presentation and lives here
// beside `parse-metres.ts`, which reads it back. Since ADR 0126 the customer reads and types whole
// millimetres, so no reading form in metres remains. Like the parser it works on the digit string and
// never divides a float — `parse-metres.ts` records why.

const MILLIMETRES_PER_METRE = 1000;

/** A metre's decimal places that are still whole millimetres. */
const MILLIMETRE_DECIMALS = 3;

const TRAILING_ZEROS = /0+$/;

/** A length split the way the wire reads it: whole metres, then exactly three millimetre digits. */
interface MetreDigits {
  readonly wholeMetres: string;
  readonly millimetreDigits: string;
}

/**
 * The form the query string carries: a decimal point in every locale, because the URL is a wire
 * value and not a reading surface. Pinned by wave 7E2's sweep over `roomHrefFromDesignRoom`.
 */
export function metresTextForUrl(millimetres: number): string {
  const { wholeMetres, millimetreDigits } = splitMetres(millimetres);
  const decimals = millimetreDigits.replace(TRAILING_ZEROS, "");
  if (decimals === "") return wholeMetres;
  return `${wholeMetres}.${decimals}`;
}

function splitMetres(millimetres: number): MetreDigits {
  const remainder = millimetres % MILLIMETRES_PER_METRE;
  return {
    wholeMetres: String(Math.floor(millimetres / MILLIMETRES_PER_METRE)),
    millimetreDigits: String(remainder).padStart(MILLIMETRE_DECIMALS, "0"),
  };
}
