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
  /** The **locale-free** path of the page the customer is on — `/d/{id}`, `/configurator/configure`.
   *  Every choice points at it, which is what makes the menu a change of language and not of place. */
  readonly pathname: string;
  /** `routing.locales`, in the order it declares them. */
  readonly choices: readonly LocaleChoice[];
  /** Where focus lands when the menu opens: the language the customer is already reading. */
  readonly currentIndex: number;
}

/**
 * The locale switcher's whole decision, as a value.
 *
 * **A menu of every locale, and the owner's 2026-09-10 ruling decides it.** Wave 6B-i shipped a
 * two-locale toggle and argued it from the reference: the mockups draw the chip closed in all
 * nineteen frames and never draw it open, so a popover was chrome the specification did not declare
 * (ADR 0104). That reasoning was sound for two locales and is superseded by a product fact the
 * mockups did not anticipate — *"in future will be also english and maybe other languages, so i need
 * a standard language switcher with dropdown"*. The toggle's guard against a third language
 * (`otherLocaleThan`, which threw rather than silently offering two of three) has done its job and is
 * gone with it; what replaces it is `locale-endonyms.ts`'s `Record<AppLocale, string>`, which fails at
 * build time instead.
 *
 * **What survives the change unaltered is the property the toggle got right**: switching changes the
 * language and not the place. Every choice's href is this page's own locale-free path, so `/d/{id}`
 * stays `/d/{id}` and a shared link survives the switch.
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
 * Where a key press moves focus inside the open menu, or `undefined` where the key is not a move.
 *
 * Arithmetic rather than a pair of hard-coded neighbours, and wrapping at both ends, so the walk is
 * the same walk at two locales and at six — the whole point of the ruling.
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
