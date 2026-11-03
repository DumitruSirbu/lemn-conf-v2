// The copy of the materials screens, in both languages: the namespaces they draw from hold the same keys in Romanian and in
// Russian, each leaf the screens added is a real sentence with the same placeholders and no digit of its own, and no
// sentence a switch is asked in or answered with says that it waits for publication (a switch applies at once and is never
// a draft change, so a deletion's leaves are the only ones that may say so).
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

/** The leaves the materials screens added, by key. */
const LEAVES_OF_THE_MATERIALS_SCREENS = [
  "materials.colourPicker",
  "materials.colourPickerManaged",
  "materials.surchargeEmpty",
  "materials.nameLabel",
  "materials.descriptionLabel",
  "materials.inactiveBannerPlain",
  "materials.deleteHeading",
  "materials.deleteHint",
  "materials.deleteAction",
  "materials.deleteNotice",
];

/** What a switch is asked in and answered with: none may say it waits for publication. */
const LEAVES_OF_A_SWITCH = [
  "lifecycle.deactivateTitle",
  "lifecycle.whatHappens",
  "lifecycle.usedBy",
  "lifecycle.clientsCannotChoose",
  "lifecycle.replacementExplained",
  "lifecycle.appliesImmediately",
  "lifecycle.remaining",
  "lifecycle.deactivateConfirm",
  "lifecycle.activateTitle",
  "lifecycle.activateBody",
  "lifecycle.activateConfirm",
  "lifecycle.lastActiveTitle",
  "lifecycle.lastActiveBody",
  "lifecycle.defaultCannotChange",
  "lifecycle.fixedDefaultCannotChange",
  "lifecycle.working",
  "materials.activeHint",
  "materials.activeLabel",
  "materials.inactiveBanner",
  "materials.inactiveBannerPlain",
  "chips.active",
  "chips.inactive",
  "chips.inactiveInUse",
];

const WAITS_FOR_PUBLICATION = {
  ro: /publici\b|\bpublicare|\bpublic[a\u0103]\b/iu,
  ru: /публикац|опубликов/iu,
};

const placeholdersOf = (sentence: string): string[] =>
  [
    ...new Set(
      [...sentence.matchAll(/\{(\w+)/g)].map((match) => match[1] ?? ""),
    ),
  ].sort();

describe("the namespaces the materials screens draw from", () => {
  it.each(["materials", "lifecycle", "chips", "common", "errors"])(
    "hold the same keys in Russian as in Romanian under %s, and nothing more",
    (namespace) => {
      const under = (leaves: Leaves) =>
        Object.keys(leaves)
          .filter((key) => key.startsWith(`${namespace}.`))
          .sort();

      expect(under(RO).length).toBeGreaterThan(5);
      expect(under(RU)).toEqual(under(RO));
    },
  );

  it.each(LEAVES_OF_THE_MATERIALS_SCREENS)(
    "%s is a real sentence in both languages, with the same placeholders and no digit of its own, and Russian is not the Romanian",
    (key) => {
      const ro = RO[key];
      const ru = RU[key];

      expect(ro?.trim()).toBeTruthy();
      expect(ru?.trim()).toBeTruthy();
      expect(placeholdersOf(ru ?? "")).toEqual(placeholdersOf(ro ?? ""));
      expect(ru).not.toBe(ro);
      expect(ru).toMatch(/\p{Script=Cyrillic}/u);
      expect(ro).not.toMatch(/\d/);
      expect(ru).not.toMatch(/\d/);
    },
  );
});

describe("a switch's own sentences", () => {
  it.each(["ro", "ru"] as const)(
    "never say in %s that the switch waits for publication",
    (locale) => {
      const leaves = locale === "ro" ? RO : RU;
      const offenders = LEAVES_OF_A_SWITCH.filter((key) =>
        WAITS_FOR_PUBLICATION[locale].test(leaves[key] ?? ""),
      );

      expect(LEAVES_OF_A_SWITCH.every((key) => leaves[key] !== undefined)).toBe(
        true,
      );
      expect(offenders).toEqual([]);
    },
  );

  it("is told from a deletion's by the detector, so a sweep that matched nothing would show", () => {
    expect(
      WAITS_FOR_PUBLICATION.ro.test(RO["lifecycle.deleteBody"] ?? ""),
    ).toBe(true);
    expect(
      WAITS_FOR_PUBLICATION.ru.test(RU["lifecycle.deleteBody"] ?? ""),
    ).toBe(true);
    expect(
      WAITS_FOR_PUBLICATION.ro.test(RO["materials.deleteNotice"] ?? ""),
    ).toBe(true);
  });
});
