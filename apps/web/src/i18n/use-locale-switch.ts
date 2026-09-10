"use client";

import { useLocale } from "next-intl";

import { usePathname } from "./navigation";
import { routing, type AppLocale } from "./routing";

/** Where the top bar's locale control points: the one locale it is not, at the path it is on. */
export interface LocaleSwitchTarget {
  readonly locale: AppLocale;
  /** The **locale-free** path of the page the customer is on — `/d/{id}`, `/configurator/configure`.
   *  Handing it back unchanged is what makes the switch a change of language and not of place. */
  readonly pathname: string;
}

/**
 * The locale switcher's whole decision, as a value.
 *
 * **A toggle rather than a menu, and the reference decides it rather than taste.** The mockups draw
 * the chip closed in all nineteen frames and never draw it open, so a popover would be chrome the
 * specification does not declare (ADR 0104: the mockups are the chrome specification). With two
 * locales the entire choice is *the other one*, which a link expresses completely — and a link
 * rather than a button because a locale here **is** a URL: shareable, reachable without JavaScript,
 * and given a focus ring and keyboard activation by the browser itself.
 */
export function useLocaleSwitch(): LocaleSwitchTarget {
  const currentLocale = useLocale();
  const pathname = usePathname();
  return { locale: otherLocaleThan(currentLocale), pathname };
}

/**
 * The locale a two-locale toggle moves to.
 *
 * **It throws where there is no single other locale rather than taking the first**, and that is the
 * point at which the menu question gets asked again. A first-match would turn a third locale into a
 * control that can silently never reach it — a switcher that looks like it works and offers two of
 * three languages.
 */
export function otherLocaleThan(locale: string): AppLocale {
  const others = routing.locales.filter((candidate) => candidate !== locale);
  const [only] = others;
  if (only === undefined || others.length > 1) {
    throw new Error(
      `A toggle cannot switch from ${locale}: ${String(others.length)} other locales are configured`,
    );
  }
  return only;
}
