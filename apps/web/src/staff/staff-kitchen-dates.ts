import type { AppLocale } from "@/i18n/routing";

// How the staff screens write an instant. The shop's clock is Chișinău's, whatever clock the browser keeps. Client-safe:
// the server's own Chișinău day (`lib/server/rate-limit/chisinau-day.ts`) is a server module the browser may not import.

const SHOP_TIME_ZONE = "Europe/Chisinau";

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
