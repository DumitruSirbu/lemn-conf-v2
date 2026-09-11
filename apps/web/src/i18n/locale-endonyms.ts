import type { AppLocale } from "./routing";

/**
 * Every shipped locale's name **for itself**, and the reason it is here rather than in a catalogue.
 *
 * A language is offered under its endonym — `Română`, never *Romanian*; `Русский`, never *Румынский*
 * — because the person looking for it cannot read the page they are on: they scan for the word
 * *they* recognise. So the string is the same in every locale, which makes it exactly the shape the
 * catalogues are wrong for. N locales would need N² identical leaves and give a translator N² chances
 * to translate a word that must not be translated. This is the ruling *Hettich* and *Blum* already
 * carry in the price book, applied again: **a name that must not be translated gets no key.**
 *
 * `Record<AppLocale, string>` rather than a lookup with a fallback, and that is deliberate: adding a
 * locale to `routing.locales` makes this a compile error until its own name is written down. It is
 * the guard `otherLocaleThan` used to be — a third language that the switcher could not name — moved
 * from a throw at runtime to a failure at build time.
 */
const LOCALE_ENDONYMS: Readonly<Record<AppLocale, string>> = {
  ro: "Română",
  ru: "Русский",
};

/**
 * The name a language is offered under, or a throw.
 *
 * **The compile error is not the whole guard, because `next dev` erases types.** `tsc` refuses a
 * locale with no entry here (`TS2741`), and `pnpm typecheck` is where that is meant to be caught —
 * but the dev server transpiles without checking, so a missing entry returned `undefined`, React
 * rendered nothing, and the menu drew a row with a correct href and no name on it. That is exactly
 * the *ships unmarked and nobody notices* failure this table exists to prevent, reintroduced by the
 * one toolchain a developer looks at first. Throwing restores the runtime half of the guard
 * `otherLocaleThan` used to give.
 */
export function endonymOf(locale: AppLocale): string {
  // `Partial` because the whole point is that the type is not to be trusted at this call: read as a
  // `Record` the lookup is a `string` and the guard below is dead code the linter deletes.
  const written: Partial<Record<AppLocale, string>> = LOCALE_ENDONYMS;
  const endonym = written[locale];
  if (endonym === undefined)
    throw new Error(`no endonym is written down for the locale ${locale}`);
  return endonym;
}
