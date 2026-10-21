import type { AppLocale } from "@/i18n/routing";

// How the staff screens write a typed string and an instant. The shop's clock is Chișinău's, whatever clock the browser
// keeps.

const SHOP_TIME_ZONE = "Europe/Chisinau";
const FIRST_STRONG_ISOLATE = "⁨";
const POP_DIRECTIONAL_ISOLATE = "⁩";

/** A string somebody typed, fenced between isolate marks where it stands inside a sentence, so a right-to-left run left open
 *  in it cannot reorder the date or the minute beside it. (A value in an element of its own is isolated by the stylesheet.) */
export function isolated(typed: string): string {
  return `${FIRST_STRONG_ISOLATE}${typed}${POP_DIRECTIONAL_ISOLATE}`;
}

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
