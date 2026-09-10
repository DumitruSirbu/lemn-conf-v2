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

/**
 * **Every leaf of a catalogue as `[dotted key, value]`**, so a claim can be made about the whole
 * tree rather than about the section somebody remembered to look in.
 *
 * **An unexpected leaf throws rather than being skipped**, and that is the whole reason this walk is
 * shared. A fourth private copy had grown in `price/starting-price.adversarial.test.ts` returning
 * `[]` for a leaf that is neither string nor namespace, which turns *"exactly one leaf carries the
 * currency"* into *"exactly one of the leaves this walk happens to reach"* — a sweep silently
 * covering less than its name claims is the failure mode this module was created for.
 *
 * Callers that want keys alone map over the pairs; a second walk is how the two come to disagree.
 */
export function catalogueLeaves(
  tree: Catalogue | Readonly<Record<string, unknown>>,
  prefix = "",
): readonly (readonly [string, string])[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") return [[path, value] as const];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return catalogueLeaves(value as Readonly<Record<string, unknown>>, path);
    }
    throw new Error(`${path} is not a catalogue message or namespace`);
  });
}

/**
 * The Romanian catalogue with `price.amountWithCurrency` overwritten, so the join under test is
 * authored by the test rather than shipped — the only way to prove a formatter *consults* the leaf
 * instead of appending a currency of its own.
 *
 * `Catalogue` types every leaf as its own authored literal — the shipped join *is* the type — so a
 * differing one has to be cast in, and the cast is on the tree rather than the leaf.
 */
export function catalogueJoining(template: string): Catalogue {
  const [, romanian] = CATALOGUES[0];
  return {
    ...romanian,
    price: { ...romanian.price, amountWithCurrency: template },
  } as Catalogue;
}
