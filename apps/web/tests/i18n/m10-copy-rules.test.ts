// The M10 copy (plan M10, wave T1) states no figure: no amount, no percentage and no "inclus", and every percentage is an
// ICU parameter (T acceptance; ADR 0106 Amendment A decision 5, ADR 0100 decision 5). A figure written into a leaf is a
// second copy of a fact the price book owns, and it goes stale the day the dashboard edits the book.
//
// Scope is the leaves wave T1 added: five namespaces, and five leaves inside two older ones. The digit rule is the
// strictest reading of "no figure" and is checked on the text left after ICU syntax is removed, so `::group-off` and a
// parameter name cannot trip it. "3D" is the one product word that carries a digit.
import { describe, expect, it } from "vitest";

import {
  CATALOGUES,
  catalogueLeaves,
  leafAt,
  type CatalogueLocale,
} from "../support/catalogues";

const M10_NAMESPACES = [
  "priceDashboard",
  "staffChanges",
  "customerPriceNotice",
  "replacementSheet",
  "sentKitchenNote",
] as const;

const M10_LEAVES_IN_OLDER_NAMESPACES = [
  "globalSettings.depthNotePriced",
  "globalSettings.kitchenHandleHeading",
  "globalSettings.kitchenHandleHint",
  "priceBreakdown.depthLine",
  "priceBreakdown.depthLineScope",
] as const;

/** The same words `price-book-text.test.ts` sweeps for, so one definition of "inclus" holds across both. */
const INCLUSION_WORDS: Readonly<Record<CatalogueLocale, RegExp>> = {
  ro: /\binclu[sz]\w*/iu,
  ru: /(включ|входит|входят|входящ)/iu,
};

const PERCENT_PARAMETER_BEFORE_SIGN = /\{(percent|signedPercent|max)\}\s*$/u;

/** The two labels whose sign names the operation ("change prices by %") and not a value; ruled by key, not by wording. */
const LEAVES_WHOSE_SIGN_NAMES_THE_OPERATION: readonly string[] = [
  "priceDashboard.cabinets.bulkAction",
  "priceDashboard.bulk.title",
];

function newLeaves(
  messages: (typeof CATALOGUES)[number][1],
): readonly (readonly [string, string])[] {
  const namespaced = M10_NAMESPACES.flatMap((namespace) =>
    catalogueLeaves(messages[namespace], namespace),
  );
  const added = M10_LEAVES_IN_OLDER_NAMESPACES.map((key) => {
    const text = leafAt(messages, key);
    if (text === undefined) throw new Error(`no leaf at ${key}`);
    return [key, text] as const;
  });
  return [...namespaced, ...added];
}

/** What is left of a message once ICU syntax is gone: argument references, plural and select headers, branch labels and
 *  braces. The text inside a branch stays, because that is prose a customer reads. */
function proseOf(message: string): string {
  return message
    .replace(/\{\w+, number, [^{}]*\}/gu, "")
    .replace(/\{\w+\}/gu, "")
    .replace(/\{\w+, (?:plural|select),/gu, "")
    .replace(/(?:=\d+|\b(?:zero|one|two|few|many|other|f))\s*\{/gu, "")
    .replace(/[{}#]/gu, "")
    .replaceAll("3D", "");
}

function leavesWithDigits(
  leaves: readonly (readonly [string, string])[],
): readonly string[] {
  return leaves
    .filter(([, text]) => /\d/u.test(proseOf(text)))
    .map(([key]) => key);
}

function leavesWithBarePercent(
  leaves: readonly (readonly [string, string])[],
): readonly string[] {
  return leaves
    .filter(([key]) => !LEAVES_WHOSE_SIGN_NAMES_THE_OPERATION.includes(key))
    .filter(([, text]) => {
      const beforeSigns = text.split("%").slice(0, -1);
      return beforeSigns.some(
        (before) => !PERCENT_PARAMETER_BEFORE_SIGN.test(before),
      );
    })
    .map(([key]) => key);
}

describe("the M10 copy states no figure", () => {
  it.each(CATALOGUES)(
    "carries no digit in any new %s leaf",
    (_locale, messages) => {
      const leaves = newLeaves(messages);

      // Non-vacuity: a walk that reached nothing would pass every assertion below.
      expect(leaves.length).toBeGreaterThan(400);
      expect(leavesWithDigits(leaves)).toEqual([]);
    },
  );

  it.each(CATALOGUES)(
    "writes every percentage in a new %s leaf as a parameter",
    (_locale, messages) => {
      const leaves = newLeaves(messages);

      expect(leaves.some(([, text]) => text.includes("%"))).toBe(true);
      expect(leavesWithBarePercent(leaves)).toEqual([]);
    },
  );

  it.each(CATALOGUES)(
    "says nothing is included in any new %s leaf",
    (locale, messages) => {
      const claims = newLeaves(messages)
        .filter(([, text]) => INCLUSION_WORDS[locale].test(text))
        .map(([key]) => key);

      expect(claims).toEqual([]);
    },
  );

  // Not a copy rule but a measured cost: next-intl types every message's arguments from the literal text in
  // `ro.d.json.ts`, and a leaf written with an ICU `select` made type-aware lint of the tests that resolve every key
  // (`content.test.ts`, `body-label.test.ts`, `locale-menu-model.test.ts`, `qa-6bf-label-resolution-totality`) about ten
  // seconds slower each. Three such leaves took `content.test.ts` from about five seconds to over forty, and twenty-one
  // of them past ninety (measured 2026-10-26 on the T1 draft). A grammatical gender is written as a noun in the sentence
  // ("această opțiune"), not as a `select`; plural stays, because its cost is small and the grammar needs it.
  it.each(CATALOGUES)(
    "uses no ICU select in a new %s leaf",
    (_locale, messages) => {
      const selects = newLeaves(messages)
        .filter(([, text]) => /\{\w+, select,/u.test(text))
        .map(([key]) => key);

      expect(selects).toEqual([]);
    },
  );

  it("recognises a hard-coded figure, so the sweeps above cannot pass by matching nothing", () => {
    // Detector inputs, written without diacritics because the detectors do not read letters.
    const withFigure: readonly (readonly [string, string])[] = [
      ["figure", "Adancimea de 700 mm scumpeste dulapurile cu 15 %."],
      ["parameter", "Adancimea scumpeste dulapurile cu {percent} %."],
      ["branch", "{n, plural, one {1 dulap} other {{n} dulapuri}}"],
    ];

    expect(leavesWithDigits(withFigure)).toEqual(["figure", "branch"]);
    expect(leavesWithBarePercent(withFigure)).toEqual(["figure"]);
    expect(
      INCLUSION_WORDS.ro.test("Materialul standard, inclus in pret."),
    ).toBe(true);
    expect(INCLUSION_WORDS.ru.test("Цена включена в стоимость.")).toBe(true);
  });
});
