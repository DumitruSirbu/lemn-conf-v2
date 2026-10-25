// Lot 2 criterion 19: the count renders through ICU one / few / other (Russian one / few / many / other) at 1, 2, 5 and 20,
// "in the form O17 rules". The owner ruled O17 on 2026-10-20: Romanian puts "de" between the number and the noun from
// twenty up ("20 de bucătării"), overriding the 2026-09-10 "without de" ruling for kitchens. The rule is the CLDR `other`
// arm: n mod 100 of 0 or 20 to 99 reads "de", while 2 to 19 and 101 to 119 read the bare noun.
import { createTranslator } from "next-intl";
import { Fragment, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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

const KITCHEN_COUNT_MESSAGES = [
  "accountKitchens.count",
  "claimDialog.question",
  "claimDialog.claimedTitle",
] as const;

const EXPORT_CAP_KITCHENS = 200;

type KitchenCountMessage = (typeof KITCHEN_COUNT_MESSAGES)[number];

function romanianKitchenSentence(
  message: KitchenCountMessage,
  count: number,
): string {
  const [, ro] = CATALOGUES[0];
  const translate = createTranslator({ locale: "ro", messages: ro });
  const chunk = (chunks: ReactNode): ReactNode => chunks;
  const rendered = translate.rich(message, {
    count,
    strong: chunk,
    check: chunk,
  });
  return renderToStaticMarkup(createElement(Fragment, null, rendered));
}

// The nouns come from the catalogue at 1 and at 5, two counts the ruling did not touch; the copy lock pins the words
// themselves, so this file pins only where "de" stands.
const SINGULAR_NOUN = romanianNounAt(1);
const PLURAL_NOUN = romanianNounAt(5);

function romanianNounAt(count: number): string {
  return countSentence("ro", CATALOGUES[0][1], count).replace(/^\d+\s+/, "");
}

function romanianNounPhrase(count: number): string {
  const noun = count === 1 ? SINGULAR_NOUN : PLURAL_NOUN;
  const lastTwoDigits = count % 100;
  const takesDe = count >= 20 && (lastTwoDigits === 0 || lastTwoDigits >= 20);
  return takesDe ? `${String(count)} de ${noun}` : `${String(count)} ${noun}`;
}

function range(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

describe("Romanian (owner ruling O17, 2026-10-20: 'de' from twenty up)", () => {
  const COUNTS_WITH_DE = [20, 21, 99, 100, 120, EXPORT_CAP_KITCHENS];
  const COUNTS_WITHOUT_DE = [1, 2, 19, 101, 119];

  describe.each(KITCHEN_COUNT_MESSAGES)("%s", (message) => {
    it.each(COUNTS_WITH_DE)("puts 'de' before the noun at %i", (count) => {
      expect(romanianKitchenSentence(message, count)).toContain(
        `${String(count)} de ${PLURAL_NOUN}`,
      );
    });

    it.each(COUNTS_WITHOUT_DE)(
      "puts no 'de' before the noun at %i",
      (count) => {
        const sentence = romanianKitchenSentence(message, count);
        expect(sentence).toContain(romanianNounPhrase(count));
        expect(sentence).not.toContain(`${String(count)} de `);
      },
    );

    it("never says the bare noun after a number that takes 'de', nor 'de' after one that does not (1 to 999)", () => {
      for (const count of range(1, 999)) {
        expect(
          romanianKitchenSentence(message, count),
          String(count),
        ).toContain(romanianNounPhrase(count));
      }
    });
  });

  it("keeps zero as CLDR files it, without 'de' (the claimed sentence has its own =0 arm)", () => {
    expect(romanianKitchenSentence("accountKitchens.count", 0)).toBe(
      `0 ${PLURAL_NOUN}`,
    );
    expect(romanianKitchenSentence("claimDialog.question", 0)).toContain(
      `0 ${PLURAL_NOUN}`,
    );
    expect(romanianKitchenSentence("claimDialog.claimedTitle", 0)).not.toMatch(
      /\d/,
    );
  });

  it("states the grammar rule itself, so the tables above and the oracle cannot drift together", () => {
    expect(romanianNounPhrase(20)).toBe(`20 de ${PLURAL_NOUN}`);
    expect(romanianNounPhrase(119)).toBe(`119 ${PLURAL_NOUN}`);
    expect(romanianNounPhrase(120)).toBe(`120 de ${PLURAL_NOUN}`);
    expect(romanianNounPhrase(1)).toBe(`1 ${SINGULAR_NOUN}`);
  });

  it("leaves the cabinet plurals as they were: 20 cabinets still read without 'de'", () => {
    const [, ro] = CATALOGUES[0];
    const sentence = createTranslator({ locale: "ro", messages: ro })(
      "leadNotice.groupCount",
      { heading: "Baza", count: 20 },
    );
    expect(sentence).toContain("20 corpuri");
    expect(sentence).not.toMatch(/\bde\b/);
  });

  it("tells 0 and 12 like the other plurals", () => {
    expect(romanianNounAt(0)).toBe(PLURAL_NOUN);
    expect(romanianNounAt(12)).toBe(PLURAL_NOUN);
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
