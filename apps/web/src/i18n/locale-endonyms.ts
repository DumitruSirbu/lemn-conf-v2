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

export function endonymOf(locale: AppLocale): string {
  return LOCALE_ENDONYMS[locale];
}
