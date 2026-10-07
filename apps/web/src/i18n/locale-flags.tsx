import type { ReactElement } from "react";

import type { AppLocale } from "./routing";

/**
 * Every shipped locale's flag (ADR 0107). Romanian flies the Republic of Moldova's flag, deliberately: the language
 * is Romanian and the market is Moldova. Drawn, never typed: Windows ships no font for flag emoji, so a customer
 * there would read the bare letters *MD* and *RU*. Simplified at the size it is drawn, but exact in what a wrong
 * flag gets wrong (band order, equal bands, colours, proportion). `Record<AppLocale, ...>`, as `locale-endonyms.ts`
 * is: a locale added to `routing.locales` is a compile error until it has a flag.
 */
const LOCALE_FLAGS: Readonly<Record<AppLocale, ReactElement>> = {
  ro: <MoldovanFlag />,
  ru: <RussianFlag />,
};

/**
 * The flag drawn beside a language's name in the locale menu. Decoration to assistive technology: the endonym
 * already names the language, so every flag is `aria-hidden`; it cannot carry the menu's state either
 * (`aria-current` and the row's weight do). Throws on a locale with no flag, as `locale-endonyms.ts` records: the
 * `Record` above fails closed under `tsc` and open under `next dev`, which erases the type and hands back `undefined`.
 */
export function flagOf(locale: AppLocale): ReactElement {
  // `Partial` for the reason `locale-endonyms.ts` records: read as a `Record` the lookup can never
  // miss, and the guard below is dead code the linter deletes.
  const drawn: Partial<Record<AppLocale, ReactElement>> = LOCALE_FLAGS;
  const flag = drawn[locale];
  if (flag === undefined)
    throw new Error(`no flag is drawn for the locale ${locale}`);
  return flag;
}

/** Moldova's tricolour: equal vertical bands, blue-yellow-red, at the flag's own 1:2, without the arms. */
function MoldovanFlag(): ReactElement {
  return (
    <svg width="18" height="9" viewBox="0 0 6 3" aria-hidden="true">
      <rect width="2" height="3" fill="#0046ae" />
      <rect x="2" width="2" height="3" fill="#ffd200" />
      <rect x="4" width="2" height="3" fill="#cc092f" />
    </svg>
  );
}

/** Russia's tricolour: equal horizontal bands, white-blue-red, at the flag's own 2:3. The white band
 *  is the top one — the stylesheet gives the flag its edge so that band cannot merge into the paper. */
function RussianFlag(): ReactElement {
  return (
    <svg width="18" height="12" viewBox="0 0 9 6" aria-hidden="true">
      <rect width="9" height="2" fill="#ffffff" />
      <rect y="2" width="9" height="2" fill="#0039a6" />
      <rect y="4" width="9" height="2" fill="#d52b1e" />
    </svg>
  );
}
