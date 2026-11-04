// The three `Content` accessors the depth copy is read through (plan M10, P3-Q7, wave T3b): the breakdown's depth line
// and its scope word, and the settings sheet's priced depth sentence. The percentage is the published rule's value and
// the depth is the cabinet depth in force; neither is written into a leaf (ADR 0100 decision 5, ADR 0106 Amendment A),
// so every figure an accessor prints must arrive through its parameters, in both locales. Romanian and Russian words
// are never written here: the lint rule keeps Romanian literals out of tests and the copy lock holds the exact text.
import {
  parse,
  TYPE,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";

import { CATALOGUES, contentFor, requireLeafAt } from "../support/catalogues";

const CABINET_DEPTH_MM = 700;
const OTHER_CABINET_DEPTH_MM = 600;
const FIRST_PERCENT = 13;
const SECOND_PERCENT = 29;

const DEPTH_LEAF_KEYS = [
  "priceBreakdown.depthLine",
  "priceBreakdown.depthLineScope",
  "globalSettings.depthNotePriced",
] as const;

function withoutDepth(sentence: string): string {
  return sentence.replace(String(CABINET_DEPTH_MM), "");
}

function literalTextOf(elements: readonly MessageFormatElement[]): string {
  return elements
    .map((element) => {
      if (element.type === TYPE.literal) return element.value;
      if (element.type === TYPE.plural || element.type === TYPE.select) {
        return Object.values(element.options)
          .map((option) => literalTextOf(option.value))
          .join(" ");
      }
      return "";
    })
    .join(" ");
}

describe("the depth line accessor (priceBreakdown.depthLine)", () => {
  it.each(CATALOGUES)(
    "prints the cabinet depth and the percentage it is given in %s",
    (locale, messages) => {
      const { depthLine } = contentFor(locale, messages).priceBreakdown;

      const line = depthLine(CABINET_DEPTH_MM, FIRST_PERCENT);

      expect(line).toContain(String(CABINET_DEPTH_MM));
      expect(line).toContain(`${String(FIRST_PERCENT)} %`);
    },
  );

  it.each(CATALOGUES)(
    "changes nothing but the percentage when the rule changes, in %s",
    (locale, messages) => {
      const { depthLine } = contentFor(locale, messages).priceBreakdown;

      const first = depthLine(CABINET_DEPTH_MM, FIRST_PERCENT);
      const second = depthLine(CABINET_DEPTH_MM, SECOND_PERCENT);

      expect(second).not.toBe(first);
      expect(second).toBe(
        first.replace(String(FIRST_PERCENT), String(SECOND_PERCENT)),
      );
    },
  );

  it.each(CATALOGUES)(
    "follows the cabinet depth it is given in %s",
    (locale, messages) => {
      const { depthLine } = contentFor(locale, messages).priceBreakdown;

      const line = depthLine(OTHER_CABINET_DEPTH_MM, FIRST_PERCENT);

      expect(line).toContain(String(OTHER_CABINET_DEPTH_MM));
      expect(line).not.toContain(String(CABINET_DEPTH_MM));
    },
  );
});

describe("the depth scope accessor (priceBreakdown.depthLineScope)", () => {
  it.each(CATALOGUES)(
    "is the catalogue's scope text and says nothing of any figure in %s",
    (locale, messages) => {
      const { depthLineScope } = contentFor(locale, messages).priceBreakdown;

      expect(depthLineScope).toBe(
        requireLeafAt(messages, "priceBreakdown.depthLineScope"),
      );
      expect(depthLineScope).not.toBe("");
      expect(depthLineScope).not.toMatch(/\d/u);
    },
  );

  it("is worded differently in the two locales", () => {
    const [[roLocale, roMessages], [ruLocale, ruMessages]] = CATALOGUES;

    expect(
      contentFor(roLocale, roMessages).priceBreakdown.depthLineScope,
    ).not.toBe(contentFor(ruLocale, ruMessages).priceBreakdown.depthLineScope);
  });
});

describe("the priced depth sentence accessor (globalSettings.depthNotePriced)", () => {
  it.each(CATALOGUES)(
    "states the surcharge with the cabinet depth and the percentage it is given in %s",
    (locale, messages) => {
      const { depthNotePriced } = contentFor(locale, messages).globalSettings;

      const sentence = depthNotePriced(CABINET_DEPTH_MM, FIRST_PERCENT);

      expect(sentence).toContain(String(CABINET_DEPTH_MM));
      expect(sentence).toContain(`${String(FIRST_PERCENT)} %`);
    },
  );

  it.each(CATALOGUES)(
    "changes nothing but the percentage when the rule changes, in %s",
    (locale, messages) => {
      const { depthNotePriced } = contentFor(locale, messages).globalSettings;

      const first = depthNotePriced(CABINET_DEPTH_MM, FIRST_PERCENT);
      const second = depthNotePriced(CABINET_DEPTH_MM, SECOND_PERCENT);

      expect(second).toBe(
        first.replace(String(FIRST_PERCENT), String(SECOND_PERCENT)),
      );
    },
  );

  it.each(CATALOGUES)(
    "states no percentage and no figure but the depth when the rule is zero, in %s",
    (locale, messages) => {
      const { depthNotePriced } = contentFor(locale, messages).globalSettings;

      const sentence = depthNotePriced(CABINET_DEPTH_MM, 0);

      expect(sentence).toContain(String(CABINET_DEPTH_MM));
      expect(sentence).not.toContain("%");
      expect(withoutDepth(sentence)).not.toMatch(/\d/u);
      expect(sentence).not.toBe(
        depthNotePriced(CABINET_DEPTH_MM, FIRST_PERCENT),
      );
    },
  );
});

describe("the depth leaves carry no figure", () => {
  it.each(CATALOGUES)(
    "has no digit in the literal text of any of the three leaves in %s",
    (_locale, messages) => {
      for (const key of DEPTH_LEAF_KEYS) {
        const literalText = literalTextOf(parse(requireLeafAt(messages, key)));

        expect(literalText, key).not.toBe("");
        expect(literalText, key).not.toMatch(/\d/u);
      }
    },
  );
});
