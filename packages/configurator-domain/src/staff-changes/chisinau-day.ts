// The calendar day in Europe/Chisinau, which names the digest's day (ADR 0178 A-13: at most one run per day, claimed
// by a day key). The day is read from the time-zone database, never computed from a fixed offset: Chisinau is on UTC+2
// in winter and UTC+3 in summer, so a spring day is 23 hours long and an autumn day is 25.
//
// An instant is epoch milliseconds, as everywhere in this package: the domain reads no clock and holds no `Date`
// (tests/contact/qa-8h-package-purity). The caller turns its own `Date` into milliseconds with `getTime()`.

/** `YYYY-MM-DD`, the calendar day in Europe/Chisinau. The same shape as the persistence port's `DigestDayKey`. */
export type ChisinauDayKey = string;

const CHISINAU_TIME_ZONE = "Europe/Chisinau";
const YEAR_DIGITS = 4;

/** The widest instant ECMAScript can represent, in epoch milliseconds. */
const MAX_EPOCH_MS = 8.64e15;

// One formatter for the module: building an Intl formatter is the expensive part of every call.
const CHISINAU_DAY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: CHISINAU_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function chisinauDayKey(epochMs: number): ChisinauDayKey {
  if (!Number.isFinite(epochMs) || Math.abs(epochMs) > MAX_EPOCH_MS) {
    throw new RangeError(
      `chisinauDayKey: ${String(epochMs)} is not an instant in epoch milliseconds`,
    );
  }
  const parts = CHISINAU_DAY_PARTS.formatToParts(epochMs);
  const year = partValue(parts, "year").padStart(YEAR_DIGITS, "0");
  return `${year}-${partValue(parts, "month")}-${partValue(parts, "day")}`;
}

function partValue(
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const part = parts.find((candidate) => candidate.type === type);
  if (part === undefined) {
    throw new Error(`chisinauDayKey: the formatter produced no "${type}" part`);
  }
  return part.value;
}
