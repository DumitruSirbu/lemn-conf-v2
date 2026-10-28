// What a published line's amount must be, restated without the production rounding (ADR 0177 A-1). In a percentage
// book every line but an accessory is `quantity × unitAmountMinor`; an accessory line carries the book's exact rate as
// its unit and `r10(quantity × unit)` as its amount, so the product identity does not hold for it. Scoping the
// exemption to `kind === "accessory"` keeps the identity on every other line kind.
const TEN_LEI_BANI = 1_000;
const HALF_A_GRAIN_BANI = 500;

/** Half-up to a multiple of ten lei, for a non-negative whole amount; written out here so the oracle shares no code
 *  with the seam it checks. */
export function roundedToTenLei(amountMinor: number): number {
  return (
    Math.floor((amountMinor + HALF_A_GRAIN_BANI) / TEN_LEI_BANI) * TEN_LEI_BANI
  );
}

interface PublishedLine {
  readonly kind: string;
  readonly quantity: number;
  readonly unitAmountMinor: number;
}

export function expectedLineAmountMinor(line: PublishedLine): number {
  const product = line.quantity * line.unitAmountMinor;
  return line.kind === "accessory" ? roundedToTenLei(product) : product;
}
