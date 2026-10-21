// An oracle for the Chisinau calendar day that shares no code with `rate-limit/chisinau-day.ts`: the zone's rule written
// out (Moldova changes its clocks at 00:00 UTC on the last Sunday of March and of October, UTC+2 to UTC+3 and back),
// and a reader of a wall clock built with its own `Intl` formatter. A test that asks the production day window the same
// question twice would pass for a window that is wrong in the same way.

const MS_PER_HOUR = 3_600_000;
const MARCH = 2;
const OCTOBER = 9;
const SUNDAY = 0;

export interface CivilDay {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function dayText({ year, month, day }: CivilDay): string {
  const pad = (value: number, width: number) =>
    String(value).padStart(width, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** The calendar day after, by the calendar and not by 24 hours. */
export function nextCivilDay({ year, month, day }: CivilDay): CivilDay {
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

/** The calendar day before, by the calendar. */
export function previousCivilDay({ year, month, day }: CivilDay): CivilDay {
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return {
    year: previous.getUTCFullYear(),
    month: previous.getUTCMonth() + 1,
    day: previous.getUTCDate(),
  };
}

function lastSundayAtMidnightUtc(year: number, monthIndex: number): number {
  const lastOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0));
  const daysSinceSunday = (lastOfMonth.getUTCDay() - SUNDAY + 7) % 7;
  return Date.UTC(year, monthIndex, lastOfMonth.getUTCDate() - daysSinceSunday);
}

/** 2 in winter, 3 in summer. */
export function chisinauOffsetHoursAt(instantMs: number): 2 | 3 {
  const year = new Date(instantMs).getUTCFullYear();
  const summerBegins = lastSundayAtMidnightUtc(year, MARCH);
  const summerEnds = lastSundayAtMidnightUtc(year, OCTOBER);
  return instantMs >= summerBegins && instantMs < summerEnds ? 3 : 2;
}

/** The instant the wall clock of Chisinau reads 00:00:00 on the day. The zone never changes its clock at midnight, so
 *  exactly one of the two offsets lands on it. */
export function localMidnightOf(civil: CivilDay): Date {
  const wallClockAsUtc = Date.UTC(civil.year, civil.month - 1, civil.day);
  const summer = wallClockAsUtc - 3 * MS_PER_HOUR;
  const winter = wallClockAsUtc - 2 * MS_PER_HOUR;
  if (chisinauOffsetHoursAt(summer) === 3) return new Date(summer);
  if (chisinauOffsetHoursAt(winter) === 2) return new Date(winter);
  throw new Error(`no local midnight for ${dayText(civil)}`);
}

const WALL_CLOCK = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Chisinau",
  calendar: "gregory",
  numberingSystem: "latn",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** The wall clock of Chisinau at the instant, as `YYYY-MM-DD hh:mm:ss`, read by this file's own formatter. */
export function wallClockAt(instant: Date): string {
  const parts = new Map(
    WALL_CLOCK.formatToParts(instant).map(({ type, value }) => [type, value]),
  );
  const part = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.get(type);
    if (value === undefined) throw new Error(`the clock gave no ${type}`);
    return value;
  };
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

export function civilDayFromText(text: string): CivilDay {
  const [year, month, day] = text.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`not a day: ${text}`);
  }
  return { year, month, day };
}

/** Every day from the first to the last, both included. */
export function civilDaysBetween(first: CivilDay, last: CivilDay): CivilDay[] {
  const days: CivilDay[] = [];
  const lastMs = Date.UTC(last.year, last.month - 1, last.day);
  for (
    let ms = Date.UTC(first.year, first.month - 1, first.day);
    ms <= lastMs;
    ms += 24 * MS_PER_HOUR
  ) {
    const date = new Date(ms);
    days.push({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    });
  }
  return days;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_OF_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return DAYS_OF_MONTH[month - 1] ?? 0;
}
