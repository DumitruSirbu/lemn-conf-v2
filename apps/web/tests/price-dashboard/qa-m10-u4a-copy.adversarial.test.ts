// The copy of the hardware screens' lifecycle, creation and save feedback, in both languages: every leaf is in both
// catalogues with the same placeholders, a leaf that counts kitchens reads right for each count (the plural categories
// of Romanian and of Russian differ, and a count of a thousand has a grouping the other categories switch off), and no
// leaf holds a digit of its own (a number is a placeholder, never typed into a sentence).
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

type Leaves = Readonly<Record<string, string>>;

function leavesOf(tree: unknown, prefix = ""): Leaves {
  if (typeof tree === "string") return { [prefix]: tree };
  if (typeof tree !== "object" || tree === null) return {};
  return Object.entries(tree).reduce<Leaves>(
    (leaves, [key, value]) => ({
      ...leaves,
      ...leavesOf(value, prefix === "" ? key : `${prefix}.${key}`),
    }),
    {},
  );
}

const RO = leavesOf(roMessages.priceDashboard);
const RU = leavesOf(ruMessages.priceDashboard);

/** The leaves written for the hardware screens, by key. */
const LEAVES_OF_THE_SCREENS = [
  "errors.textEmpty",
  "errors.textTooLong",
  "errors.textForbiddenCharacter",
  "errors.textStatesAnAmount",
  "hardware.createdRemoved",
  "lifecycle.fixedDefaultCannotChange",
  "lifecycle.cannotJudge",
  "lifecycle.usageUnavailable",
  "lifecycle.deleteBlockedInactiveBody",
  "lifecycle.working",
  "lifecycle.deleteCreatedBody",
  "lifecycle.deleteBlockedAccessoryInactiveBody",
  "lifecycle.deleteBlockedUncountedBody",
  "lifecycle.deleteBlockedAccessoryUncountedBody",
  "lifecycle.counting",
  "errors.savePartlyFailed",
  "hardware.createRefused",
];

const COUNTING_LEAVES = [
  "lifecycle.usedBy",
  "lifecycle.deleteBlockedBody",
  "lifecycle.deleteBlockedAccessoryBody",
  "chips.inactiveInUse",
];

const placeholdersOf = (sentence: string): string[] =>
  [
    ...new Set(
      [...sentence.matchAll(/\{(\w+)/g)].map((match) => match[1] ?? ""),
    ),
  ].sort();

const translatorOf = (locale: "ro" | "ru") =>
  createTranslator({
    locale,
    messages: locale === "ro" ? roMessages : ruMessages,
    namespace: "priceDashboard",
  }) as unknown as (key: string, values?: Record<string, unknown>) => string;

describe("the namespace the screens draw from", () => {
  it("holds every leaf of the lifecycle, the hardware pages and the creation errors in Russian as in Romanian, and nothing more", () => {
    const scoped = (leaves: Leaves) =>
      Object.keys(leaves)
        .filter((key) =>
          /^(lifecycle|hardware|errors|chips|common)\./.test(key),
        )
        .sort();

    expect(scoped(RU)).toEqual(scoped(RO));
  });

  it.each(LEAVES_OF_THE_SCREENS)(
    "%s is a real sentence in both languages, with the same placeholders, and Russian is not the Romanian",
    (key) => {
      const ro = RO[key];
      const ru = RU[key];

      expect(ro?.trim()).toBeTruthy();
      expect(ru?.trim()).toBeTruthy();
      expect(placeholdersOf(ru ?? "")).toEqual(placeholdersOf(ro ?? ""));
      expect(ru).not.toBe(ro);
      expect(ru).toMatch(/\p{Script=Cyrillic}/u);
    },
  );

  it.each(LEAVES_OF_THE_SCREENS)(
    "%s carries no digit of its own: a number is a placeholder",
    (key) => {
      expect(RO[key]).not.toMatch(/\d/);
      expect(RU[key]).not.toMatch(/\d/);
    },
  );

  it("is caught by the digit check when a sentence holds a digit, so the check can fail", () => {
    expect("takes 2 days").toMatch(/\d/);
  });
});

describe("a leaf that counts saved kitchens", () => {
  it.each(["ro", "ru"] as const)(
    "never groups the thousands of a count in %s, in any plural category",
    (locale) => {
      const translate = translatorOf(locale);
      const grouped = COUNTING_LEAVES.flatMap((key) =>
        [1000, 1001, 1002, 1005, 1011, 1021, 123456].flatMap((count) => {
          const sentence = translate(key, { count, name: "X" });
          return /\d[\s\u00a0\u202f,.]\d{3}/.test(sentence)
            ? [`${key} for ${String(count)}: ${sentence}`]
            : [];
        }),
      );

      expect(grouped).toEqual([]);
    },
  );

  it("has the plural categories the language needs: Romanian one, few and other; Russian one, few, many and other", () => {
    const categoriesIn = (sentence: string) =>
      new Set(
        [...sentence.matchAll(/\b(zero|one|two|few|many|other)\s*\{/g)].map(
          (match) => match[1],
        ),
      );

    for (const key of COUNTING_LEAVES) {
      expect(categoriesIn(RO[key] ?? ""), `ro ${key}`).toEqual(
        new Set(["one", "few", "other"]),
      );
      expect(categoriesIn(RU[key] ?? ""), `ru ${key}`).toEqual(
        new Set(["one", "few", "many", "other"]),
      );
    }
  });
});
