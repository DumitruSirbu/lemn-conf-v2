// What a priced line must be in the percentage-form book (ADR 0177 A-1), restated without the production rounding. The
// hardware line is its three rates over its three counts rounded once to ten lei; the material line is the sum, over
// the cabinets, of the difference between two rounded stages, so it equals a percentage of the cabinet lines to within a
// bounded error per cabinet and no closer.
const TEN_LEI_BANI = 1_000;
const HALF_A_GRAIN_BANI = 500;

/** Half-up to a multiple of ten lei, for a non-negative whole amount. */
export function roundedToTenLei(amountMinor: number): number {
  return (
    Math.floor((amountMinor + HALF_A_GRAIN_BANI) / TEN_LEI_BANI) * TEN_LEI_BANI
  );
}

/** The most a cabinet's material share can differ from the percentage of its rounded line: the cabinet's own rounding,
 *  the stage's rounding, and the first scaled by the percentage (at most 200 %, so three half grains and a half). */
const PER_CABINET_TOLERANCE_BANI = 2 * TEN_LEI_BANI;

interface PricedLine {
  readonly kind: string;
  readonly amountMinor: number;
}

/** The material line of a kitchen priced at `percentOfCabinets`, as the percentage of its cabinet lines and the most it
 *  may differ from that (A-1: "up to the per-cabinet 10-lei rounding", never asserted equal). */
export function materialLineBounds(
  lines: readonly PricedLine[],
  percentOfCabinets: number,
): { readonly nearMinor: number; readonly toleranceMinor: number } {
  const cabinets = lines.filter((line) => line.kind === "cabinet");
  const cabinetsMinor = cabinets.reduce(
    (sum, line) => sum + line.amountMinor,
    0,
  );
  return {
    nearMinor: (cabinetsMinor * percentOfCabinets) / 100,
    toleranceMinor: cabinets.length * PER_CABINET_TOLERANCE_BANI,
  };
}
