import type { AppLocale } from "@/i18n/routing";

// What a kitchen's card says that is neither a name nor a sentence of the catalogue: how long ago it was changed, and
// whether it may be called a draft. The words of "how long ago" are the platform's, per language (`Intl`); everything
// else on the card is the catalogue's.

/**
 * Whether a kitchen that was not sent may be called "Ciornă". The sent mark is written by the contact flow when a request
 * is stored (Lot 2 plan, S5); until that wave is merged no kitchen is ever `isSent`, so "Ciornă" would be a claim the
 * product cannot tell apart from "Trimisă" (plan C3). Set it once S5 is in. Widened to `boolean` so it stays a switch.
 */
export const IS_SENT_MARK_WRITTEN = false as boolean;

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
  const elapsedMs = Math.max(0, nowMs - updatedAtMs);
  const minutes = Math.floor(elapsedMs / MS_PER_MINUTE);
  if (minutes < 1) return { value: 0, unit: "second" };
  if (minutes < MINUTES_BELOW_ONE_HOUR) return ago(minutes, "minute");
  const hours = Math.floor(elapsedMs / MS_PER_HOUR);
  if (hours < HOURS_BELOW_ONE_DAY) return ago(hours, "hour");
  return agoInDays(calendarDaysBetween(updatedAtMs, nowMs));
}

function agoInDays(days: number): RelativeAge {
  if (days < DAYS_PER_WEEK) return ago(days, "day");
  const weeks = Math.floor(days / DAYS_PER_WEEK);
  if (weeks < WEEKS_BELOW_MONTHS) return ago(weeks, "week");
  if (days < DAYS_PER_YEAR)
    return ago(Math.floor(days / DAYS_PER_MONTH), "month");
  return ago(Math.floor(days / DAYS_PER_YEAR), "year");
}

/** Whole local calendar days from the change's date to now's, at least one (the change is over a day old). */
function calendarDaysBetween(updatedAtMs: number, nowMs: number): number {
  const days = Math.round(
    (startOfLocalDayMs(nowMs) - startOfLocalDayMs(updatedAtMs)) / MS_PER_DAY,
  );
  return Math.max(1, days);
}

function startOfLocalDayMs(ms: number): number {
  const date = new Date(ms);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
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
