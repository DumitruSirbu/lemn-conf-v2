import type { ReactElement } from "react";

import type { AppLocale } from "./routing";

/**
 * Every shipped locale's flag, and the rulings that decide what is drawn.
 *
 * **Romanian flies the Republic of Moldova's flag**, not Romania's — the owner's 2026-09-10 ruling,
 * and it is deliberate: the language is Romanian, the market is Moldova. The flag names the customer's
 * country; the endonym beside it names the language.
 *
 * **Drawn, never typed.** The flag emoji are regional-indicator pairs and Windows ships no font that
 * has them, so a customer there reads the bare letters *MD* and *RU* where a flag belongs. An SVG has
 * no font to be missing.
 *
 * **Simplified at the size it is drawn.** Moldova's arms sit on the yellow band and are illegible
 * much below 40 px; the tricolour is what actually reads at 18, and a shape nobody can resolve is not
 * more honest than one nobody expects. What is exact is everything a wrong flag gets wrong: the band
 * order, the equal bands, the colours and each flag's own proportion.
 *
 * `Record<AppLocale, …>` for the same reason `locale-endonyms.ts` is one — adding a locale to
 * `routing.locales` is a compile error here until it has a flag of its own. A lookup with a fallback
 * — a blank box, a globe — is how a language ships unmarked and nobody notices.
 */
const LOCALE_FLAGS: Readonly<Record<AppLocale, ReactElement>> = {
  ro: <MoldovanFlag />,
  ru: <RussianFlag />,
};

/**
 * The flag drawn beside a language's name in the locale menu.
 *
 * **Decoration to assistive technology, and it has to be**: the endonym already names the language,
 * so every flag here is `aria-hidden` and a screen reader hears `Română` rather than *"Moldova flag,
 * Română"*. It also cannot carry the menu's state — a flag says which language a row *is*, never
 * which one is current; `aria-current` and the row's weight say that.
 *
 * **Throws on a locale with no flag**, for the reason `locale-endonyms.ts` records at length: the
 * `Record<AppLocale, …>` above fails closed under `tsc` and fails *open* under `next dev`, which
 * erases the type and hands the caller `undefined` — a menu row with a right href, no flag and no
 * name. The head comment's own warning about *"a lookup with a fallback"* was describing this
 * function's dev behaviour until 2026-09-11.
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

/** Moldova's tricolour: equal vertical bands, blue-yellow-red, at the flag's own 1:2. The arms that
 *  stand on the yellow band are left out for the reason above. */
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
