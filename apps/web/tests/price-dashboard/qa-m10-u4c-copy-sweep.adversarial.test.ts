// The accessory screens' copy swept rather than listed: every catalogue key the screens' sources name exists in Romanian and
// in Russian with the same placeholders (so a leaf added without its twin, or named and never written, is found whether or
// not a list was kept), no accessory leaf carries a digit of its own, and the count sentence agrees with its number in both
// languages over every count a saved-kitchen reader could answer.
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { filesUnder } from "../support/files-under";
import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const NAMED_KEY = /["'`](priceDashboard\.[A-Za-z0-9_.]+)["'`]/g;
const ACCESSORY_SOURCES =
  /price-dashboard\/(accessory-|use-accessory-|created-name-field|item-dialogs|item-lifecycle-words|price-input-words)/;
const LARGEST_COUNT = 400;

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

const RO = leavesOf(roMessages);
const RU = leavesOf(ruMessages);

const keysNamedBy = (path: string): string[] =>
  [...readFileSync(join(SOURCE_ROOT, path), "utf8").matchAll(NAMED_KEY)].map(
    (match) => match[1] ?? "",
  );

const sourcesOfTheScreens = filesUnder(SOURCE_ROOT)
  .map((path) => relative(SOURCE_ROOT, path))
  .filter((path) => ACCESSORY_SOURCES.test(path) && /\.tsx?$/.test(path));
const NAMED = [...new Set(sourcesOfTheScreens.flatMap(keysNamedBy))].sort();

const placeholdersOf = (sentence: string): string[] =>
  [
    ...new Set(
      [...sentence.matchAll(/\{(\w+)\s*[,}]/g)].map((match) => match[1] ?? ""),
    ),
  ].sort();

describe("the keys the accessory screens name", () => {
  it("are found in their sources, so the sweep below sweeps something", () => {
    expect(sourcesOfTheScreens.length).toBeGreaterThan(8);
    expect(NAMED).toContain("priceDashboard.accessories.createAction");
    expect(NAMED).toContain(
      "priceDashboard.lifecycle.alwaysPresentCannotChange",
    );
    expect(NAMED.length).toBeGreaterThan(40);
  });

  it("each hold a sentence in Romanian and in Russian, with the same placeholders", () => {
    const missing = NAMED.filter((key) => !RO[key]?.trim() || !RU[key]?.trim());
    const mismatched = NAMED.filter(
      (key) =>
        placeholdersOf(RO[key] ?? "").join() !==
        placeholdersOf(RU[key] ?? "").join(),
    );

    expect(missing).toEqual([]);
    expect(mismatched).toEqual([]);
  });

  it("hold no digit of their own where the sentence is about an accessory", () => {
    const accessoryKeys = Object.keys(RO).filter(
      (key) =>
        key.startsWith("priceDashboard.accessories.") ||
        key.includes("Accessory") ||
        key === "priceDashboard.lifecycle.alwaysPresentCannotChange",
    );

    expect(accessoryKeys.length).toBeGreaterThan(30);
    expect(accessoryKeys.filter((key) => /\d/.test(RO[key] ?? ""))).toEqual([]);
    expect(accessoryKeys.filter((key) => /\d/.test(RU[key] ?? ""))).toEqual([]);
  });

  it("are all still named by the screens, for each leaf the accessory screens added", () => {
    const added = [
      "priceDashboard.accessories.activeHintNew",
      "priceDashboard.accessories.linkPlaceholder",
      "priceDashboard.accessories.linkRefused",
      "priceDashboard.accessories.createRefused",
      "priceDashboard.accessories.renameAction",
      "priceDashboard.accessories.deleteHeading",
      "priceDashboard.accessories.deleteHint",
      "priceDashboard.accessories.deleteAction",
      "priceDashboard.accessories.deleteNotice",
      "priceDashboard.accessories.createdRemoved",
      "priceDashboard.lifecycle.usedByAccessory",
      "priceDashboard.lifecycle.clientsNoLongerGetAccessory",
      "priceDashboard.lifecycle.activateAccessoryBody",
      "priceDashboard.lifecycle.usageUnavailableAccessory",
      "priceDashboard.lifecycle.countingAccessory",
      "priceDashboard.lifecycle.builtInAccessoryCannotBeDeleted",
      "priceDashboard.lifecycle.deleteCreatedAccessoryBody",
      "priceDashboard.lifecycle.alwaysPresentCannotChange",
    ];

    expect(added.filter((key) => !NAMED.includes(key))).toEqual([]);
  });
});

describe("the sentence that counts the saved kitchens using an accessory", () => {
  const KEY = "priceDashboard.lifecycle.usedByAccessory";
  const sayIn = (locale: "ro" | "ru") => {
    const translate = createTranslator({
      locale,
      messages: locale === "ro" ? roMessages : ruMessages,
    }) as unknown as (key: string, values: { count: number }) => string;
    return (count: number) => translate(KEY, { count });
  };
  const counts = Array.from({ length: LARGEST_COUNT }, (_, index) => index + 1);

  it("agrees with every count in Romanian: each count reads as the form of its plural category with its number written whole", () => {
    const say = sayIn("ro");
    const rules = new Intl.PluralRules("ro");
    const NUMBER_SLOT = "7";
    const formOf = new Map<string, string>();
    for (const exemplar of [1, 2, 20]) {
      formOf.set(
        rules.select(exemplar),
        say(exemplar).replace(String(exemplar), NUMBER_SLOT),
      );
    }
    const wrong = counts.filter((count) => {
      const form = formOf.get(rules.select(count));
      return (
        form === undefined ||
        say(count) !== form.replace(NUMBER_SLOT, String(count)) ||
        /[{}]|undefined|NaN/.test(say(count))
      );
    });

    expect([...formOf.keys()].sort()).toEqual(["few", "one", "other"]);
    expect(wrong).toEqual([]);
    expect(say(1)).not.toMatch(/\d/);
  });

  it("agrees with every count in Russian: the noun and the verb of its plural form, the number written whole", () => {
    const say = sayIn("ru");
    const forms: Record<string, string> = {
      one: "сохранённая кухня использует",
      few: "сохранённые кухни используют",
      many: "сохранённых кухонь используют",
      other: "сохранённой кухни используют",
    };
    const wrong = counts.filter((count) => {
      const category = new Intl.PluralRules("ru").select(count);
      return (
        say(count) !==
        `${String(count)} ${forms[category] ?? ""} этот аксессуар.`
      );
    });

    expect(wrong).toEqual([]);
  });

  it("writes a count of one thousand without a group separator in both languages", () => {
    expect(sayIn("ru")(1_000)).toContain("1000 ");
    expect(sayIn("ro")(1_000)).toContain("1000 ");
  });
});
