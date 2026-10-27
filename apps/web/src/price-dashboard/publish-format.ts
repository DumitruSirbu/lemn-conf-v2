import { formatLei } from "./format-lei";

// A reduction is written with the minus sign (U+2212), never a hyphen; zero carries no sign.

const MINUS_SIGN = "−";
const PLUS_SIGN = "+";

export function signOf(amount: number): string {
  if (amount > 0) return PLUS_SIGN;
  return amount < 0 ? MINUS_SIGN : "";
}

/** A whole number with its sign: "+5", "−5", "0". */
export function signedWholeNumber(value: number): string {
  return `${signOf(value)}${String(Math.abs(value))}`;
}

/** An amount in bani as a signed difference in lei: "+50 lei", "−50 lei". */
export function signedLei(deltaMinor: number, currencyWord: string): string {
  return `${signOf(deltaMinor)}${formatLei(Math.abs(deltaMinor), currencyWord)}`;
}
