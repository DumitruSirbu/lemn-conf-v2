// The copy of the accessory screens, in both languages: the namespaces they draw from hold the same keys in Romanian and in
// Russian, each leaf the screens added is a real sentence with the same placeholders and no digit of its own, and the
// sentences an accessory's switch is asked in or answered with neither call the accessory an option (customers do not choose
// it, they earn it) nor say that the switch waits for publication (it applies at once).
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

/** The leaves the accessory screens added, by key. */
const LEAVES_OF_THE_ACCESSORY_SCREENS = [
  "accessories.activeHintNew",
  "accessories.linkPlaceholder",
  "accessories.linkRefused",
  "accessories.createRefused",
  "accessories.renameAction",
  "accessories.deleteHeading",
  "accessories.deleteHint",
  "accessories.deleteAction",
  "accessories.deleteNotice",
  "accessories.createdRemoved",
  "lifecycle.usedByAccessory",
  "lifecycle.clientsNoLongerGetAccessory",
  "lifecycle.activateAccessoryBody",
  "lifecycle.usageUnavailableAccessory",
  "lifecycle.countingAccessory",
  "lifecycle.builtInAccessoryCannotBeDeleted",
  "lifecycle.deleteCreatedAccessoryBody",
];

/** What an accessory's switch is asked in and answered with, and what the screens say of it beside the switch. */
const LEAVES_OF_AN_ACCESSORY_SWITCH = [
  "lifecycle.usedByAccessory",
  "lifecycle.clientsNoLongerGetAccessory",
  "lifecycle.accessoryRemovedExplained",
  "lifecycle.activateAccessoryBody",
  "lifecycle.usageUnavailableAccessory",
  "lifecycle.countingAccessory",
  "accessories.activeHint",
  "accessories.activeLabel",
];

/** Every sentence that speaks of an accessory by name, which must call it an accessory. */
const LEAVES_THAT_NAME_AN_ACCESSORY = [
  ...LEAVES_OF_AN_ACCESSORY_SWITCH,
  "lifecycle.builtInAccessoryCannotBeDeleted",
  "lifecycle.deleteCreatedAccessoryBody",
  "accessories.deleteHint",
  "accessories.createRefused",
];

const WAITS_FOR_PUBLICATION = {
  ro: /publici\b|\bpublicare|\bpublic.\b/iu,
  ru: /публикац|опубликов/iu,
};
/** The word for something a customer chooses, which an accessory, being earned, is not. */
const AN_OPTION = { ro: /op.iun/iu, ru: /вариант/iu };

const placeholdersOf = (sentence: string): string[] =>
  [
    ...new Set(
      [...sentence.matchAll(/\{(\w+)\s*[,}]/g)].map((match) => match[1] ?? ""),
    ),
  ].sort();

describe("the namespaces the accessory screens draw from", () => {
  it.each(["accessories", "lifecycle", "chips", "common", "errors"])(
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

  it.each(LEAVES_OF_THE_ACCESSORY_SCREENS)(
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

describe("an accessory's switch's own sentences", () => {
  it.each(["ro", "ru"] as const)(
    "never say in %s that the switch waits for publication, and never call the accessory an option",
    (locale) => {
      const leaves = locale === "ro" ? RO : RU;

      expect(
        LEAVES_OF_AN_ACCESSORY_SWITCH.every((key) => leaves[key] !== undefined),
      ).toBe(true);
      expect(
        LEAVES_OF_AN_ACCESSORY_SWITCH.filter((key) =>
          WAITS_FOR_PUBLICATION[locale].test(leaves[key] ?? ""),
        ),
      ).toEqual([]);
      expect(
        LEAVES_THAT_NAME_AN_ACCESSORY.filter((key) =>
          AN_OPTION[locale].test(leaves[key] ?? ""),
        ),
      ).toEqual([]);
    },
  );

  it("is told from the sentences about any other item by the detector, so a sweep that matched nothing would show", () => {
    expect(AN_OPTION.ro.test(RO["lifecycle.usedBy"] ?? "")).toBe(true);
    expect(AN_OPTION.ru.test(RU["lifecycle.usedBy"] ?? "")).toBe(true);
    expect(
      WAITS_FOR_PUBLICATION.ro.test(RO["accessories.deleteNotice"] ?? ""),
    ).toBe(true);
    expect(
      WAITS_FOR_PUBLICATION.ru.test(RU["accessories.deleteNotice"] ?? ""),
    ).toBe(true);
  });
});
