// **The two shipped message catalogues, and the three things every i18n test does with them.**
//
// Four files under `tests/i18n/` had grown their own copy of `contentFor`, of the `["ro", …],
// ["ru", …]` row pair, and of the dotted-path leaf lookup. They are one package and one directory,
// so there is no boundary reason for three spellings of the same walk — and a fourth copy is how a
// sweep ends up proving a claim in `ro` alone.
import { createTranslator } from "next-intl";

import { resolveContent, type Content } from "../../src/i18n/content";
import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

/** Every locale's catalogue has the authored one's shape, so `ro.json` is the type. */
export type Catalogue = typeof roMessages;

export type CatalogueLocale = "ro" | "ru";

/** Both shipped locales as `it.each` rows. A claim proved in `ro` and never in `ru` is the exact
 *  defect wave 6B-f2 exists to close, so the pair travels together. */
export const CATALOGUES = [
  ["ro", roMessages],
  ["ru", ruMessages as Catalogue],
] as const;

export function translatorFor(locale: CatalogueLocale, messages: Catalogue) {
  return createTranslator({ locale, messages });
}

export function contentFor(
  locale: CatalogueLocale,
  messages: Catalogue,
): Content {
  return resolveContent(translatorFor(locale, messages));
}

/** The leaf a dotted path names, read straight out of the JSON — deliberately **not** through a
 *  `Content` resolver, which is the function under test on the other side of every assertion.
 *  `undefined` where the path names nothing or names a subtree rather than a string. */
export function leafAt(messages: Catalogue, key: string): string | undefined {
  let cursor: unknown = messages;
  for (const segment of key.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Readonly<Record<string, unknown>>)[segment];
  }
  return typeof cursor === "string" ? cursor : undefined;
}

/** `leafAt` where a missing leaf is a broken test rather than a claim under test: throws, so an
 *  assertion can never quietly compare a rendered string against `undefined`. */
export function requireLeafAt(messages: Catalogue, key: string): string {
  const leaf = leafAt(messages, key);
  if (leaf === undefined) throw new Error(`no leaf at ${key}`);
  return leaf;
}
