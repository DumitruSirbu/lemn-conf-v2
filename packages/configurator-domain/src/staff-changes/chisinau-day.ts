// The Europe/Chisinau calendar day that names a digest run (ADR 0178 A-13), read from the time-zone database so
// the 23-hour and 25-hour change days come out right. An instant is epoch milliseconds: the domain holds no `Date`.

/** `YYYY-MM-DD`. */
export type ChisinauDayKey = string;

const CHISINAU_TIME_ZONE = "Europe/Chisinau";
const YEAR_DIGITS = 4;

/** The widest instant ECMAScript can represent, in epoch milliseconds. */
const MAX_EPOCH_MS = 8.64e15;

// Built once: constructing the formatter is the expensive part of each call.
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
