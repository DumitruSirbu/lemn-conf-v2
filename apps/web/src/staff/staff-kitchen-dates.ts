import {
  formatRelativeAge,
  relativeAgeByCalendar,
  type RelativeAge,
} from "@/account/kitchens/relative-age";
import type { AppLocale } from "@/i18n/routing";

// How the staff screens write an instant. The shop's clock is Chișinău's, whatever clock the browser keeps. Client-safe:
// the server's own Chișinău day (`lib/server/rate-limit/chisinau-day.ts`) is a server module the browser may not import.

const SHOP_TIME_ZONE = "Europe/Chisinau";
const MS_PER_DAY = 86_400_000;

/** The day as dd.mm.yyyy on the shop's clock. */
export function dayOf(instant: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: SHOP_TIME_ZONE,
  }).format(new Date(instant));
}

/** The day and the minute, as the frames write them ("18.10.2026, 14:22"), on the shop's clock. */
export function dayAndTimeOf(instant: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: SHOP_TIME_ZONE,
  }).format(new Date(instant));
}

/** The day as the frames write it for a recent event, "ieri, 10:05": today and yesterday by their words on the shop's wall,
 *  any earlier day by its date, then the minute on the shop's clock. */
export function recentDayAndTimeOf(
  instant: string,
  nowMs: number,
  locale: AppLocale,
): string {
  const instantMs = Date.parse(instant);
  const daysAgo = shopDayNumberOf(nowMs) - shopDayNumberOf(instantMs);
  const isRecent = daysAgo === 0 || daysAgo === 1;
  const day = isRecent
    ? formatRelativeAge(locale, { value: -daysAgo, unit: "day" })
    : dayOf(instant, locale);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: SHOP_TIME_ZONE,
  }).format(instantMs);
  return `${day}, ${time}`;
}

/** The shop's calendar day as a count of days, so the difference of two is the days between their dates on the wall. */
function shopDayNumberOf(instantMs: number): number {
  const numbers = new Map(
    new Intl.DateTimeFormat("en-US", {
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      timeZone: SHOP_TIME_ZONE,
    })
      .formatToParts(new Date(instantMs))
      .map((piece) => [piece.type, Number(piece.value)] as const),
  );
  const utcMidnightMs = Date.UTC(
    numbers.get("year") ?? Number.NaN,
    (numbers.get("month") ?? Number.NaN) - 1,
    numbers.get("day"),
  );
  return Math.round(utcMidnightMs / MS_PER_DAY);
}

/** How long before `nowMs` an event happened, with its days counted on the shop's wall: the one the date beside it is
 *  written on, whatever clock the browser keeps. */
export function shopRelativeAgeOf(
  updatedAtMs: number,
  nowMs: number,
): RelativeAge {
  return relativeAgeByCalendar(updatedAtMs, nowMs, shopDayNumberOf);
}
