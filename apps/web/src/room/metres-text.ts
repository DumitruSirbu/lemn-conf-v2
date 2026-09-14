// The two directions a room length travels out of whole millimetres: the URL's wire form and the
// customer's reading form. The domain only ever sees millimetres (ADR 0108 decision 4), so both are
// presentation and live here beside `parse-metres.ts`, which reads either one back. Like the parser
// they work on the digit string and never divide a float — `parse-metres.ts:2-4` records why.

const MILLIMETRES_PER_METRE = 1000;

/** A metre's decimal places that are still whole millimetres. */
const MILLIMETRE_DECIMALS = 3;

/** Frame 1B writes a length as *"3,60 m"*, so two decimals is the reading convention and the third
 *  shows only when the length needs it. */
const MINIMUM_DISPLAY_DECIMALS = 2;

const TRAILING_ZEROS = /0+$/;

/** A length split the way both forms read it: whole metres, then exactly three millimetre digits. */
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

/**
 * The form a length field shows, with the separator the locale itself declares. A decimal comma is
 * a locale's rule and this product runs in two locales, so it is derived and never written here
 * (ADR 0095 decision 3).
 */
export function formatMetresForDisplay(
  millimetres: number,
  locale: string,
): string {
  const { wholeMetres, millimetreDigits } = splitMetres(millimetres);
  const decimals = displayDecimals(millimetreDigits);
  return `${wholeMetres}${decimalSeparatorFor(locale)}${decimals}`;
}

/** `1.1` is the smallest value whose formatting must contain a decimal separator, so its parts are
 *  where the locale states one. */
function decimalSeparatorFor(locale: string): string {
  const separator = new Intl.NumberFormat(locale)
    .formatToParts(1.1)
    .find((part) => part.type === "decimal")?.value;
  if (separator === undefined) {
    throw new Error(
      `Locale ${locale} declares no decimal separator to write a room length with`,
    );
  }
  return separator;
}

/** Zeros trailing past the reading convention are noise; the ones inside it are the convention. So
 *  3560 mm reads *"3,56"* and 3060 mm reads *"3,06"* — never *"3,60"*, which is a different room. */
function displayDecimals(millimetreDigits: string): string {
  return millimetreDigits
    .replace(TRAILING_ZEROS, "")
    .padEnd(MINIMUM_DISPLAY_DECIMALS, "0");
}

function splitMetres(millimetres: number): MetreDigits {
  const remainder = millimetres % MILLIMETRES_PER_METRE;
  return {
    wholeMetres: String(Math.floor(millimetres / MILLIMETRES_PER_METRE)),
    millimetreDigits: String(remainder).padStart(MILLIMETRE_DECIMALS, "0"),
  };
}
