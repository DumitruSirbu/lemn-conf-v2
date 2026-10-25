import type { AppLocale } from "@/i18n/routing";

// How long ago a kitchen was changed. Its clock arithmetic rounds, so it stays out of `kitchen-summary.ts`: the price
// guard allows rounding in no module that reaches a price.

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const MINUTES_BELOW_ONE_HOUR = 60;
const HOURS_BELOW_ONE_DAY = 24;
const DAYS_PER_WEEK = 7;
const WEEKS_BELOW_MONTHS = 5;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;

export interface RelativeAge {
  /** Negative: how far back. `0` of any unit reads as "now". */
  readonly value: number;
  readonly unit: Intl.RelativeTimeFormatUnit;
}

/**
 * How long before `nowMs` a change was made, in the largest unit that is at least one: minutes and hours by the clock,
 * days by the calendar (a change at 23:00 is "yesterday" at 01:00 the next day), then weeks, months and years. A change
 * dated after `nowMs` (the server's clock ahead of the browser's) is "now".
 */
export function relativeAgeOf(updatedAtMs: number, nowMs: number): RelativeAge {
  return relativeAgeByCalendar(updatedAtMs, nowMs, localDayNumberOf);
}

/** A whole number that rises by one at each midnight of some calendar, so two instants' difference is their days apart. */
export type DayNumberOf = (ms: number) => number;

/** `relativeAgeOf` with the calendar a caller names: the shop's wall rather than the browser's. */
export function relativeAgeByCalendar(
  updatedAtMs: number,
  nowMs: number,
  dayNumberOf: DayNumberOf,
): RelativeAge {
  const elapsedMs = Math.max(0, nowMs - updatedAtMs);
  const minutes = Math.floor(elapsedMs / MS_PER_MINUTE);
  if (minutes < 1) return { value: 0, unit: "second" };
  if (minutes < MINUTES_BELOW_ONE_HOUR) return ago(minutes, "minute");
  const hours = Math.floor(elapsedMs / MS_PER_HOUR);
  if (hours < HOURS_BELOW_ONE_DAY) return ago(hours, "hour");
  return agoInDays(calendarDaysBetween(updatedAtMs, nowMs, dayNumberOf));
}

function agoInDays(days: number): RelativeAge {
  if (days < DAYS_PER_WEEK) return ago(days, "day");
  const weeks = Math.floor(days / DAYS_PER_WEEK);
  if (weeks < WEEKS_BELOW_MONTHS) return ago(weeks, "week");
  if (days < DAYS_PER_YEAR)
    return ago(Math.floor(days / DAYS_PER_MONTH), "month");
  return ago(Math.floor(days / DAYS_PER_YEAR), "year");
}

/** Whole calendar days from the change's date to now's, at least one (the change is over a day old). */
function calendarDaysBetween(
  updatedAtMs: number,
  nowMs: number,
  dayNumberOf: DayNumberOf,
): number {
  return Math.max(1, dayNumberOf(nowMs) - dayNumberOf(updatedAtMs));
}

/** The browser's calendar day, counted as if every day were 24 hours so a clock change does not shift the count. */
function localDayNumberOf(ms: number): number {
  const date = new Date(ms);
  const utcMidnightMs = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  return Math.round(utcMidnightMs / MS_PER_DAY);
}

function ago(count: number, unit: Intl.RelativeTimeFormatUnit): RelativeAge {
  return { value: -count, unit };
}

/** The age in the person's language: "acum 2 zile", "ieri", "acum". */
export function formatRelativeAge(locale: AppLocale, age: RelativeAge): string {
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    age.value,
    age.unit,
  );
}
