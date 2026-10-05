"use client";

import { useLocale } from "next-intl";
import { useMemo } from "react";

import { endonymOf } from "./locale-endonyms";
import { usePathname } from "./navigation";
import { routing, type AppLocale } from "./routing";

/** One language the top bar offers, named in its own language. */
export interface LocaleChoice {
  readonly locale: AppLocale;
  readonly endonym: string;
  readonly isCurrent: boolean;
}

/** Everything the locale menu draws, as a value. */
export interface LocaleMenuModel {
  /** The locale-free path of the page the customer is on (`/d/{id}`, the only route that renders this menu). Every
   *  choice points at it, so the menu changes language and not place. */
  readonly pathname: string;
  /** `routing.locales`, in the order it declares them. */
  readonly choices: readonly LocaleChoice[];
  /** Where focus lands when the menu opens: the language the customer is already reading. */
  readonly currentIndex: number;
}

/**
 * The locale switcher's whole decision, as a value: a menu of every locale in `routing.locales`, not a two-locale
 * toggle. `locale-endonyms.ts`'s `Record<AppLocale, string>` fails at build time for a locale with no endonym.
 * Switching changes the language and not the place: every choice's href is this page's own locale-free path, so
 * `/d/{id}` stays `/d/{id}` and a shared link survives the switch.
 */
export function useLocaleMenu(): LocaleMenuModel {
  const currentLocale = useLocale();
  const pathname = usePathname();
  return useMemo(
    () => describeLocaleMenu(currentLocale, pathname),
    [currentLocale, pathname],
  );
}

/** The model without React around it — `routing.locales` read straight through, so a locale added
 *  there is a menu item here and no component is edited. */
export function describeLocaleMenu(
  currentLocale: string,
  pathname: string,
): LocaleMenuModel {
  const choices = routing.locales.map((locale) => ({
    locale,
    endonym: endonymOf(locale),
    isCurrent: locale === currentLocale,
  }));
  const currentIndex = choices.findIndex((choice) => choice.isCurrent);
  return { pathname, choices, currentIndex: Math.max(currentIndex, 0) };
}

/** Where focus sits in an open menu of `count` items. */
export interface MenuFocus {
  readonly index: number;
  readonly count: number;
}

/**
 * Where a key press moves focus inside the open menu, or `undefined` where the key is not a move. Arithmetic that
 * wraps at both ends, so the walk is the same at two locales and at six.
 */
export function focusIndexAfter(
  key: string,
  focus: MenuFocus,
): number | undefined {
  const lastIndex = focus.count - 1;
  switch (key) {
    case "ArrowDown":
      return focus.index === lastIndex ? 0 : focus.index + 1;
    case "ArrowUp":
      return focus.index === 0 ? lastIndex : focus.index - 1;
    case "Home":
      return 0;
    case "End":
      return lastIndex;
    default:
      return undefined;
  }
}
