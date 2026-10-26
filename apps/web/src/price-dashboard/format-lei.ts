// An amount of the manufacturer's price book as the dashboard writes it: the exact lei, never rounded, with the
// currency's word after it (frames D2A, D2B: "1 500 lei"). It is not the customer's figure (`price/starting-price.ts`
// rounds that up to a thousand and says "MDL"): a manufacturer editing a price must read the amount that is stored.
//
// Not `Intl.NumberFormat`, whose output varies with runtime locale data (ADR 0095 Amendment C); the separators are product
// constants, as `starting-price.ts`'s are. Whole lei carry no decimals; an amount with bani carries exactly two, after a
// comma, so a stored amount is never shown as another. Nothing here rounds: the split into lei and bani is exact
// integer arithmetic on a count of bani.

const BANI_PER_LEU = 100;
const DIGITS_PER_GROUP = 3;
const NON_BREAKING_SPACE = " ";
const DECIMAL_SEPARATOR = ",";
const DECIMAL_PLACES = 2;

/** The amount's digits, grouped by thousands with a non-breaking space; bani follow a comma only when there are any. */
export function formatLeiAmount(totalBani: number): string {
  assertCountOfBani(totalBani);
  const bani = totalBani % BANI_PER_LEU;
  const wholeLei = (totalBani - bani) / BANI_PER_LEU;
  const grouped = groupThousands(wholeLei);
  if (bani === 0) return grouped;
  return `${grouped}${DECIMAL_SEPARATOR}${String(bani).padStart(DECIMAL_PLACES, "0")}`;
}

/** The amount and its currency's word (`units.currency`), joined so a line never breaks between them. */
export function formatLei(totalBani: number, currencyWord: string): string {
  return `${formatLeiAmount(totalBani)}${NON_BREAKING_SPACE}${currencyWord}`;
}

function groupThousands(wholeLei: number): string {
  const digits = String(wholeLei);
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= DIGITS_PER_GROUP) {
    groups.unshift(digits.slice(Math.max(0, end - DIGITS_PER_GROUP), end));
  }
  return groups.join(NON_BREAKING_SPACE);
}

/** A price that is not a whole, non-negative count of bani is refused, as `starting-price.ts` refuses it: showing it
 *  would invent a number. */
function assertCountOfBani(totalBani: number): void {
  if (Number.isSafeInteger(totalBani) && totalBani >= 0) return;
  throw new RangeError(
    `A price is a non-negative whole count of bani; got ${String(totalBani)}`,
  );
}
