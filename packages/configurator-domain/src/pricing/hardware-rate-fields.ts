import type { HardwareMechanismCounts } from "../hardware-mechanisms.js";

/** The per-mechanism rates of a hardware tier, in the order they are charged (D4, ADR 0177 A-20). One list: the
 *  hardware line's check and terms, the dashboard's addresses and the cabinet preview all read it. All in bani. */
export const HARDWARE_RATE_FIELDS = Object.freeze([
  "perHingeMinor",
  "perDrawerMinor",
  "perPushToOpenMinor",
  "perLiftMinor",
  "perPushRunnerMinor",
] as const);
export type HardwareRateField = (typeof HARDWARE_RATE_FIELDS)[number];

/** The rates a tier may not state as zero: a zero would bill that mechanism at nothing. A rate read as zero is refused
 *  at parse, on a created class and on a rate edit. */
export const NEVER_ZERO_HARDWARE_RATES: readonly HardwareRateField[] =
  Object.freeze(["perPushRunnerMinor"] as const);

export function isRateNeverZero(field: HardwareRateField): boolean {
  return NEVER_ZERO_HARDWARE_RATES.includes(field);
}

/** Which mechanism count each rate is charged over (ADR 0092 decision 2). A `Record` over the rate union, so a rate
 *  added to the list without a count here does not compile. */
const COUNT_CHARGED_AT_RATE: Readonly<
  Record<HardwareRateField, keyof HardwareMechanismCounts>
> = {
  perHingeMinor: "hinges",
  perDrawerMinor: "drawers",
  perPushToOpenMinor: "pushToOpen",
  perLiftMinor: "lifts",
  perPushRunnerMinor: "pushRunners",
};

export function mechanismsChargedAt(
  counts: HardwareMechanismCounts,
  field: HardwareRateField,
): number {
  return counts[COUNT_CHARGED_AT_RATE[field]];
}
