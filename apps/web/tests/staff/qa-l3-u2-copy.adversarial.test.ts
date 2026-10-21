// The sentences that count the kitchens of the staff list, over every count: which noun, and where Romanian's "de" falls,
// are decided by a plural rule, and a catalogue arm swapped for another passes the structure checks (the right categories
// are declared) and fails here. The expected nouns are written out below and the category of each count is the platform's own
// CLDR rule, so neither the catalogue nor the formatter is its own witness.
import { createTranslator } from "next-intl";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

const LARGEST_COUNT = 100_000;

/* eslint-disable no-restricted-syntax -- 6B-j allow-list: an independent oracle. The sweep compares the catalogue's plural arms
   with nouns written here, so the catalogue is not its own witness; a leaf cannot supply them. */
const ROMANIAN_NOUNS = {
  countSent: {
    one: "bucătărie trimisă",
    few: "bucătării trimise",
    other: "de bucătării trimise",
  },
  countDrafts: { one: "ciornă", few: "ciorne", other: "de ciorne" },
  countAll: {
    one: "bucătărie",
    few: "bucătării",
    other: "de bucătării",
  },
} as const;

const RUSSIAN_NOUNS = {
  countSent: {
    one: "отправленная кухня",
    few: "отправленные кухни",
    many: "отправленных кухонь",
  },
  countDrafts: { one: "черновик", few: "черновика", many: "черновиков" },
  countAll: { one: "кухня", few: "кухни", many: "кухонь" },
} as const;

/* eslint-enable no-restricted-syntax */

const MESSAGES = ["countSent", "countDrafts", "countAll"] as const;

function sentenceOf(locale: "ro" | "ru", key: string, count: number): string {
  const translate = createTranslator({
    locale,
    messages: (locale === "ro" ? roMessages : ruMessages) as typeof roMessages,
    namespace: "staffKitchens",
  });
  return translate(key as "countAll", { count });
}

function numberOf(locale: "ro" | "ru", count: number): string {
  return new Intl.NumberFormat(locale).format(count);
}

describe.each(MESSAGES)("the count sentence %s", (key) => {
  it("is the number and the Romanian noun its plural category asks for, with 'de' from twenty up, for every count", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: LARGEST_COUNT }), (count) => {
        const category = new Intl.PluralRules("ro").select(count);
        const nouns: Readonly<Record<string, string>> = ROMANIAN_NOUNS[key];
        const noun = nouns[category];

        expect(sentenceOf("ro", key, count), String(count)).toBe(
          `${numberOf("ro", count)} ${noun ?? "NO NOUN FOR THE CATEGORY"}`,
        );
      }),
      { numRuns: 400 },
    );
  });

  it.each([
    0, 1, 2, 19, 20, 21, 22, 100, 101, 102, 119, 120, 121, 1000, 1019, 1020,
  ])("puts 'de' where Romanian does, at %i", (count) => {
    const hasDe = sentenceOf("ro", key, count).includes(" de ");

    expect(hasDe).toBe(count >= 20 && (count % 100 === 0 || count % 100 >= 20));
  });

  it("is the number and the Russian noun its plural category asks for, for every count", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: LARGEST_COUNT }), (count) => {
        const category = new Intl.PluralRules("ru").select(count);
        const nouns: Readonly<Record<string, string>> = RUSSIAN_NOUNS[key];
        const noun = nouns[category];

        expect(sentenceOf("ru", key, count), String(count)).toBe(
          `${numberOf("ru", count)} ${noun ?? "NO NOUN FOR THE CATEGORY"}`,
        );
      }),
      { numRuns: 400 },
    );
  });

  it("states the number it was given in both languages, whatever the noun", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: LARGEST_COUNT }), (count) => {
        for (const locale of ["ro", "ru"] as const) {
          expect(sentenceOf(locale, key, count)).toContain(
            numberOf(locale, count),
          );
        }
      }),
      { numRuns: 100 },
    );
  });
});
