import type { RateLimitWindow } from "@lemnaria/persistence";

const TIME_ZONE = "Europe/Chisinau";
const MS_PER_SECOND = 1000;
const DATE_YEAR_DIGITS = 4;
const DATE_PART_DIGITS = 2;

/** The longest a Chișinău day lasts, at the end of daylight saving time: the most seconds a window can have left. */
export const LONGEST_DAY_SECONDS = 25 * 60 * 60;

/** How many times a midnight's guess is corrected. The zone changes its clock in the small hours and never at
 *  midnight, so the second pass confirms the first. */
const OFFSET_CORRECTIONS = 2;

interface LocalDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/**
 * The calendar day in Chișinău that holds `instant`, as the half-open window from its local midnight to the next.
 * Pure: the instant is handed in, and the runtime's own `Intl` supplies the zone, so a runtime that cannot name it
 * throws. A day is 23, 24 or 25 hours.
 */
export function chisinauDayOf(instant: Date): RateLimitWindow {
  const { year, month, day } = localPartsOf(instant);
  return {
    startsAt: localMidnight({ year, month, day }),
    endsAt: localMidnight({ year, month, day: day + 1 }),
  };
}

/** The calendar date, as `YYYY-MM-DD`, of the Chișinău day that holds `instant`; its local midnight is its own. */
export function chisinauDateOf(instant: Date): string {
  const { year, month, day } = localPartsOf(instant);
  return [
    String(year).padStart(DATE_YEAR_DIGITS, "0"),
    String(month).padStart(DATE_PART_DIGITS, "0"),
    String(day).padStart(DATE_PART_DIGITS, "0"),
  ].join("-");
}

/** The whole seconds left of the window at `instant`, rounded up, so a caller told to wait that long is not early. */
export function secondsToWindowEnd(
  window: RateLimitWindow,
  instant: Date,
): number {
  const remainingMs = window.endsAt.getTime() - instant.getTime();
  return Math.ceil(remainingMs / MS_PER_SECOND);
}

/** The zone's offset from UTC at an instant: the wall clock read as if it were UTC, less the instant. */
function offsetMsAt(instant: Date): number {
  const { year, month, day, hour, minute, second } = localPartsOf(instant);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return (
    wallClockAsUtc -
    Math.floor(instant.getTime() / MS_PER_SECOND) * MS_PER_SECOND
  );
}

function localMidnight({ year, month, day }: LocalDate): Date {
  const wallClockAsUtc = Date.UTC(year, month - 1, day);
  let midnightMs = wallClockAsUtc;
  for (let pass = 0; pass < OFFSET_CORRECTIONS; pass += 1) {
    midnightMs = wallClockAsUtc - offsetMsAt(new Date(midnightMs));
  }
  return new Date(midnightMs);
}

function localPartsOf(instant: Date) {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError("The instant is not a valid date");
  }
  const numbers = new Map(
    chisinauClock()
      .formatToParts(instant)
      .map((piece) => [piece.type, Number(piece.value)] as const),
  );
  return {
    year: numberOf(numbers, "year"),
    month: numberOf(numbers, "month"),
    day: numberOf(numbers, "day"),
    hour: numberOf(numbers, "hour"),
    minute: numberOf(numbers, "minute"),
    second: numberOf(numbers, "second"),
  };
}

/** The runtime's own clock for the zone; one that cannot name it throws here. */
function chisinauClock(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    calendar: "gregory",
    numberingSystem: "latn",
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
}

function numberOf(numbers: ReadonlyMap<string, number>, type: string): number {
  const value = numbers.get(type);
  if (value === undefined || Number.isNaN(value)) {
    throw new RangeError("The zone's clock could not be read");
  }
  return value;
}
