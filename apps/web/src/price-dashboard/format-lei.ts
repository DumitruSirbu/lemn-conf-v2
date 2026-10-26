// An amount of the manufacturer's price book as the dashboard writes it: the exact lei, never rounded, with the currency's
// word after it ("1 500 lei"). It is not the customer's figure (`price/starting-price.ts` rounds that up and says "MDL").
// The separators are product constants, not `Intl`'s (ADR 0095 Amendment C). Whole lei carry no decimals; an amount with
// bani carries two, after a comma, so a stored amount is never shown as another.

const BANI_PER_LEU = 100;
const DIGITS_PER_GROUP = 3;
const NON_BREAKING_SPACE = " ";
const DECIMAL_SEPARATOR = ",";
const DECIMAL_PLACES = 2;

/** Whether an amount is a whole, non-negative count of bani: the only kind this module writes. */
export function isCountOfBani(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount >= 0;
}

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

function assertCountOfBani(totalBani: number): void {
  if (isCountOfBani(totalBani)) return;
  throw new RangeError(
    `A price is a non-negative whole count of bani; got ${String(totalBani)}`,
  );
}
