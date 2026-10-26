// The one place a price is rounded: the percentage seam (ADR 0177 A-1). A cabinet's exact priced amount `b` is carried
// through three nested stages, each rounded half-up to a multiple of 10 lei (1 000 bani) in integer arithmetic:
//
//   cabinet  c   = r10(b)
//   material cm  = r10(b × (100 + m) / 100)
//   depth    cmd = r10(b × (100 + m) × (100 + d) / 10 000)
//
// The cabinet line is `c`, the material line the sum of `cm − c`, the depth line the sum of `cmd − cm`. Lines are
// differences of rounded stages, so they add to the sum of `cmd` exactly, and one cabinet's three parts add to `cmd`,
// the figure the dashboard's cabinet preview shows (`percentageStagesOf` is that one function, imported there).
//
// The material and depth percentages multiply and never add: the cross term lands in the depth line. Every step is an
// integer: a fraction, a float or a sum outside the safe range throws `InexactPriceArithmeticError`, which
// `price-design.ts` converts to a refusal, rather than publishing a figure somebody rounded by accident.
import { cabinetDepthMmOf, type Design } from "../design.js";

import { InexactPriceArithmeticError } from "./price-book.js";
import { PERCENT_BASE } from "./price-bounds.js";

/** Ten lei in bani: the grain every line is rounded to. */
export const TEN_LEI_MINOR = 1_000;

/** The depth the deepening uplift applies at (ADR 0177 A-1: "a depth line exists if and only if the design's depth is
 *  700"). A third declared depth is a new decision, so it is not read as "any depth above the default". */
export const DEEP_CABINET_DEPTH_MM = 700;

/** Which priced-as catalogue rows get deeper at `DEEP_CABINET_DEPTH_MM` (ADR 0177 A-6). A parameter of the seam and
 *  not a list here: which rows deepen is a measured catalogue fact whose answer is the architect's. */
export type DeepensAtDeepDepth = (pricedAsBuildId: string) => boolean;

/** The two percentages a cabinet's amount is scaled by. `deepCabinetPercent` is `0` for a cabinet that does not
 *  deepen, which is how a body that gets no deeper takes no uplift. */
export interface CabinetPercentages {
  readonly materialPercent: number;
  readonly deepCabinetPercent: number;
}

/** One cabinet's amount at each of the three stages, every one a multiple of `TEN_LEI_MINOR`. */
export interface CabinetStages {
  /** `r10(b)`: the cabinet's own line. */
  readonly cabinetMinor: number;
  /** `r10(b × (100 + m) / 100)`: the cabinet in its material. */
  readonly withMaterialMinor: number;
  /** `r10(b × (100 + m) × (100 + d) / 10 000)`: the cabinet in its material at its depth. */
  readonly withDepthMinor: number;
}

/**
 * `numerator / denominator` rounded half-up to a multiple of 10 lei, in integers: the quotient is floored after adding
 * half a ten-lei grain, so a value exactly between two multiples rounds towards +∞ (a tie at 1 500 bani gives 2 000,
 * and at −1 500 gives −1 000). The denominator is a positive integer; the quotient is never formed as a fraction.
 */
export function roundHalfUpToTenLei(
  numerator: number,
  denominator = 1,
): number {
  requireWholeNumber(numerator, "the amount being rounded");
  requireWholeNumber(denominator, "the denominator");
  if (denominator < 1) {
    throw new RangeError(
      `A denominator is positive. Found: ${String(denominator)}.`,
    );
  }
  const grain = checked(TEN_LEI_MINOR * denominator, "a ten-lei grain");
  const shifted = checked(numerator + grain / 2, "an amount before rounding");
  return checked(
    floorDivide(shifted, grain) * TEN_LEI_MINOR,
    "a rounded amount",
  );
}

/** The three stages of one cabinet. `exactMinor` is `b`, the cabinet's exact priced amount. */
export function percentageStagesOf(
  exactMinor: number,
  percentages: CabinetPercentages,
): CabinetStages {
  requireWholeNumber(percentages.materialPercent, "a material percentage");
  requireWholeNumber(percentages.deepCabinetPercent, "a depth percentage");
  const materialFactor = PERCENT_BASE + percentages.materialPercent;
  const depthFactor = PERCENT_BASE + percentages.deepCabinetPercent;
  const withMaterial = checked(
    exactMinor * materialFactor,
    "an amount in its material",
  );
  return {
    cabinetMinor: roundHalfUpToTenLei(exactMinor),
    withMaterialMinor: roundHalfUpToTenLei(withMaterial, PERCENT_BASE),
    withDepthMinor: roundHalfUpToTenLei(
      checked(
        withMaterial * depthFactor,
        "an amount in its material at its depth",
      ),
      PERCENT_BASE * PERCENT_BASE,
    ),
  };
}

/** One placement's exact amount, and whether it takes the depth uplift. */
export interface CabinetToSplit {
  readonly exactMinor: number;
  readonly deepens: boolean;
}

/** What the cabinets add up to, line by line. `cabinetMinors` follows the input order. */
export interface PercentageSplit {
  readonly cabinetMinors: readonly number[];
  readonly materialLineMinor: number;
  readonly depthLineMinor: number;
}

/** Every cabinet through the three stages, then the two lines as sums of differences. The cabinets, the material line
 *  and the depth line add to the sum of the third stage, whatever the order of the cabinets. */
export function splitCabinetsByPercentage(
  cabinets: readonly CabinetToSplit[],
  rates: {
    readonly materialPercent: number;
    readonly deepCabinetPercent: number;
  },
): PercentageSplit {
  const cabinetMinors: number[] = [];
  let materialLineMinor = 0;
  let depthLineMinor = 0;
  for (const cabinet of cabinets) {
    const stages = percentageStagesOf(cabinet.exactMinor, {
      materialPercent: rates.materialPercent,
      deepCabinetPercent: cabinet.deepens ? rates.deepCabinetPercent : 0,
    });
    cabinetMinors.push(stages.cabinetMinor);
    materialLineMinor = checked(
      materialLineMinor + (stages.withMaterialMinor - stages.cabinetMinor),
      "the material line",
    );
    depthLineMinor = checked(
      depthLineMinor + (stages.withDepthMinor - stages.withMaterialMinor),
      "the depth line",
    );
  }
  return { cabinetMinors, materialLineMinor, depthLineMinor };
}

/** Whether the design is built at the depth the deepening uplift applies at. */
export function isBuiltAtDeepDepth(design: Design): boolean {
  return cabinetDepthMmOf(design) === DEEP_CABINET_DEPTH_MM;
}

/** `floor(dividend / divisor)` for whole numbers of either sign, without a float quotient: the remainder is taken
 *  first, so the division that follows is exact. */
function floorDivide(dividend: number, divisor: number): number {
  const remainder = ((dividend % divisor) + divisor) % divisor;
  return (dividend - remainder) / divisor;
}

function requireWholeNumber(value: number, what: string): void {
  if (Number.isSafeInteger(value)) return;
  throw new InexactPriceArithmeticError({
    describedAs: `${what} (which is not a whole number of minor units)`,
    reached: value,
  });
}

/** A step's result held to the exact-integer range, so no stage can lose a ban to the float it is computed in. */
function checked(value: number, what: string): number {
  if (Number.isSafeInteger(value)) return value;
  throw new InexactPriceArithmeticError({ describedAs: what, reached: value });
}
