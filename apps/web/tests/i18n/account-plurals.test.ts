// Lot 2 criterion 19: the count renders through ICU one / few / other (Russian one / few / many / other) at 1, 2, 5 and 20,
// "in the form O17 rules: default '20 bucatarii' (C30)". Without "de" in Romanian: the bare noun stands in `other`, so 20
// and 100 read "20 N" and not "20 de N" (the owner's 2026-09-10 ruling, engineering-conventions rule 3).
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { CATALOGUES, type CatalogueLocale } from "../support/catalogues";

const COUNTS_UNDER_TEST = [
  0, 1, 2, 3, 4, 5, 11, 12, 19, 20, 21, 22, 100, 101,
] as const;

function countSentence(
  locale: CatalogueLocale,
  messages: (typeof CATALOGUES)[number][1],
  count: number,
): string {
  return createTranslator({ locale, messages })("accountKitchens.count", {
    count,
  });
}

describe.each(CATALOGUES)("the kitchens count in %s", (locale, messages) => {
  const sentenceAt = (count: number): string =>
    countSentence(locale, messages, count);

  it("states the number it was given, for every count", () => {
    for (const count of COUNTS_UNDER_TEST) {
      expect(sentenceAt(count), String(count)).toMatch(
        new RegExp(`^${String(count)}\\s`),
      );
    }
  });

  it("never renders a placeholder, a plural keyword or an empty noun", () => {
    for (const count of COUNTS_UNDER_TEST) {
      const sentence = sentenceAt(count);
      expect(sentence).not.toMatch(/[{}#]|\b(?:one|few|many|other)\b/);
      expect(sentence.split(/\s+/).length, sentence).toBeGreaterThanOrEqual(2);
    }
  });

  it("uses a different word for one than for five", () => {
    const noun = (count: number) => sentenceAt(count).replace(/^\d+\s+/, "");
    expect(noun(1)).not.toBe(noun(5));
  });
});

describe("Romanian", () => {
  const [, ro] = CATALOGUES[0];
  const sentenceAt = (count: number): string => countSentence("ro", ro, count);
  const noun = (count: number): string =>
    sentenceAt(count).replace(/^\d+\s+/, "");

  it("tells 1 in the singular, and 2, 5 and 20 in the one plural form", () => {
    expect(noun(2)).toBe(noun(5));
    expect(noun(5)).toBe(noun(20));
    expect(noun(1)).not.toBe(noun(2));
  });

  it("puts no 'de' between a big number and the noun: 20 and 100 read as 5 does", () => {
    for (const count of [20, 21, 22, 100, 101]) {
      expect(sentenceAt(count), String(count)).not.toMatch(/\bde\b/);
      expect(noun(count), String(count)).toBe(noun(5));
    }
  });

  it("tells 0 and 12 like the other plurals", () => {
    expect(noun(0)).toBe(noun(5));
    expect(noun(12)).toBe(noun(5));
  });
});

describe("Russian", () => {
  const ru = CATALOGUES[1][1];
  const noun = (count: number): string =>
    countSentence("ru", ru, count).replace(/^\d+\s+/, "");

  it("uses one / few / many by CLDR: 1, 21 and 101 are one; 2 to 4, 22 and 102 are few; 5, 11 to 14, 20 and 100 are many", () => {
    expect(noun(1)).toBe(noun(21));
    expect(noun(21)).toBe(noun(101));
    expect(noun(2)).toBe(noun(3));
    expect(noun(3)).toBe(noun(4));
    expect(noun(4)).toBe(noun(22));
    expect(noun(5)).toBe(noun(11));
    expect(noun(11)).toBe(noun(12));
    expect(noun(12)).toBe(noun(14));
    expect(noun(14)).toBe(noun(20));
    expect(noun(20)).toBe(noun(100));
  });

  it("keeps the three forms distinct", () => {
    expect(new Set([noun(1), noun(2), noun(5)]).size).toBe(3);
  });
});
