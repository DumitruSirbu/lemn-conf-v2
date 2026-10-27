// Adversarial QA for wave T1 (all M10 copy). Claims the implementer's `m10-copy-rules.test.ts` and the catalogue parity
// gate do not make: that a plural arm reads correctly across the whole count range in each language (Romanian "de" from
// twenty, Russian `one` for 21 and 101 as well as 1), that availability copy says "applies immediately" while price copy
// keeps the publish line (plan M10 A-17/A-18, S-15), that parameters agree across the two locales, and that the customer
// strings and the digest footer render the numbers they are given. Romanian letters are written as `.` in the patterns
// below because the lint rule keeps Romanian literals out of tests; the exact RO text is held by the copy lock.
import {
  parse,
  TYPE,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  CATALOGUES,
  catalogueLeaves,
  leafAt,
  type Catalogue,
  type CatalogueLocale,
} from "../support/catalogues";
import { isExactValueSwitch, pluralNodesOf } from "../support/icu-signature";

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

const PLURAL_NODES_ADDED_BY_T1 = 27;
const COUNT_SWEEP_UPPER_BOUND = 205;

/** Owner ruling 2026-09-10 (engineering-conventions, "Plurals"): cabinets stay the bare noun in every arm. */
const CABINET_NOUN_COUNTS: readonly string[] = [
  "priceDashboard.cabinets.groupCount|count",
  "priceDashboard.bulk.preview|cabinetCount",
  "priceDashboard.publish.bulkRowSummary|cabinetCount",
  "replacementSheet.chooserAppliesTo|bodyCount",
];

/** A cabinet has one to four doors, so "20 uși" is unreachable; the bare noun is recorded as a gap in the QA report. */
const DOOR_COUNTS_UNREACHABLE_AT_TWENTY: readonly string[] = [
  "priceDashboard.cabinet.doorCount|doorCount",
  "priceDashboard.cabinet.doorsFromHere|doorCount",
  "priceDashboard.cabinet.summaryDoor|doorCount",
];

type LeafRow = readonly [key: string, text: string];

function m10Leaves(messages: Catalogue): readonly LeafRow[] {
  const namespaced = M10_NAMESPACES.flatMap((namespace) =>
    catalogueLeaves(messages[namespace], namespace),
  );
  const added = M10_LEAVES_IN_OLDER_NAMESPACES.map((key): LeafRow => {
    const text = leafAt(messages, key);
    if (text === undefined) throw new Error(`no leaf at ${key}`);
    return [key, text];
  });
  return [...namespaced, ...added];
}

function leavesOf(locale: CatalogueLocale): readonly LeafRow[] {
  const [, messages] = CATALOGUES.find(([name]) => name === locale) ?? [];
  if (messages === undefined) throw new Error(`no catalogue for ${locale}`);
  return m10Leaves(messages);
}

function walk(
  elements: readonly MessageFormatElement[],
  visit: (element: MessageFormatElement) => void,
): void {
  for (const element of elements) {
    visit(element);
    if (element.type === TYPE.tag) walk(element.children, visit);
    if (element.type === TYPE.plural || element.type === TYPE.select) {
      for (const option of Object.values(element.options)) {
        walk(option.value, visit);
      }
    }
  }
}

/** Argument name to whether the message wants a number (plural selector or `number` format) or a string. */
function argumentKinds(
  elements: readonly MessageFormatElement[],
): ReadonlyMap<string, "number" | "text"> {
  const kinds = new Map<string, "number" | "text">();
  walk(elements, (element) => {
    if (element.type === TYPE.number || element.type === TYPE.plural) {
      kinds.set(element.value, "number");
    } else if (element.type === TYPE.argument && !kinds.has(element.value)) {
      kinds.set(element.value, "text");
    }
  });
  return kinds;
}

function valuesFor(
  kinds: ReadonlyMap<string, "number" | "text">,
  overrides: Readonly<Record<string, number>>,
): Record<string, string | number> {
  const values: Record<string, string | number> = {};
  for (const [name, kind] of kinds) {
    values[name] = kind === "number" ? (overrides[name] ?? 5) : `«${name}»`;
  }
  return values;
}

function render(
  locale: CatalogueLocale,
  key: string,
  values: Record<string, string | number>,
): string {
  const [, messages] = CATALOGUES.find(([name]) => name === locale) ?? [];
  if (messages === undefined) throw new Error(`no catalogue for ${locale}`);
  const translate = createTranslator({ locale, messages }) as unknown as (
    key: string,
    values: Record<string, string | number>,
  ) => string;
  return translate(key, values);
}

interface PluralSite {
  readonly key: string;
  readonly selector: string;
  readonly text: string;
}

/** The grammatical plurals only: a `{percent, plural, =0 {…} other {…}}` is an exact-value switch, covered on its own. */
function pluralSitesOf(locale: CatalogueLocale): readonly PluralSite[] {
  return leavesOf(locale).flatMap(([key, text]) =>
    pluralNodesOf(parse(text))
      .filter((node) => !isExactValueSwitch(Object.keys(node.options)))
      .map((node) => ({ key, selector: node.value, text })),
  );
}

function sweepRenders(
  locale: CatalogueLocale,
  site: PluralSite,
): readonly (readonly [count: number, sentence: string])[] {
  const kinds = argumentKinds(parse(site.text));
  return Array.from({ length: COUNT_SWEEP_UPPER_BOUND + 1 }, (_, count) => [
    count,
    render(locale, site.key, valuesFor(kinds, { [site.selector]: count })),
  ]);
}

describe("the M10 leaves parse and agree on their parameters across the two locales", () => {
  it("parses every new leaf in both catalogues", () => {
    for (const locale of ["ro", "ru"] as const) {
      const leaves = leavesOf(locale);
      expect(leaves.length).toBeGreaterThan(400);
      for (const [key, text] of leaves) {
        expect(() => parse(text), `${locale} ${key}`).not.toThrow();
      }
    }
  });

  it("names the same parameters in Romanian and Russian for every new leaf", () => {
    const romanian = new Map(leavesOf("ro"));
    const russian = new Map(leavesOf("ru"));

    expect([...russian.keys()]).toEqual([...romanian.keys()]);
    for (const [key, roText] of romanian) {
      const ruText = russian.get(key);
      if (ruText === undefined) throw new Error(`no Russian leaf at ${key}`);
      const roNames = [...argumentKinds(parse(roText))].sort();
      const ruNames = [...argumentKinds(parse(ruText))].sort();
      expect(ruNames, key).toEqual(roNames);
    }
  });

  it("gives every plural exactly the CLDR categories of its language and no exact-value arm", () => {
    const expected: Record<CatalogueLocale, string> = {
      ro: "few,one,other",
      ru: "few,many,one,other",
    };
    for (const locale of ["ro", "ru"] as const) {
      for (const site of pluralSitesOf(locale)) {
        const [node] = pluralNodesOf(parse(site.text)).filter(
          (candidate) => candidate.value === site.selector,
        );
        expect(
          Object.keys(node?.options ?? {})
            .sort()
            .join(","),
          `${locale} ${site.key}`,
        ).toBe(expected[locale]);
      }
    }
  });

  it("adds exactly the plural nodes the signature module counts for wave T1", () => {
    expect(pluralSitesOf("ro")).toHaveLength(PLURAL_NODES_ADDED_BY_T1);
    expect(pluralSitesOf("ru")).toHaveLength(PLURAL_NODES_ADDED_BY_T1);
  });
});

describe("a Romanian count reads the CLDR arm across 0 to 205", () => {
  const sites = pluralSitesOf("ro");

  it("never leaves a placeholder, a plural keyword or a missing number in the sentence", () => {
    for (const site of sites) {
      for (const [count, sentence] of sweepRenders("ro", site)) {
        const label = `${site.key} at ${String(count)}: ${sentence}`;
        expect(sentence, label).not.toMatch(/[{}#]|undefined|NaN|\[object/u);
        if (count !== 1) {
          expect(sentence, label).toContain(String(count));
        }
      }
    }
  });

  it('puts "de" between the number and the noun from twenty up, except where the owner ruled the bare cabinet noun', () => {
    const bareNounSites = [
      ...CABINET_NOUN_COUNTS,
      ...DOOR_COUNTS_UNREACHABLE_AT_TWENTY,
    ];
    const lackingDe: string[] = [];

    for (const site of sites) {
      const siteId = `${site.key}|${site.selector}`;
      for (const [count, sentence] of sweepRenders("ro", site)) {
        const category = new Intl.PluralRules("ro").select(count);
        const hasDe = sentence.includes(`${String(count)} de `);
        const label = `${siteId} at ${String(count)}: ${sentence}`;
        if (category !== "other") {
          expect(hasDe, label).toBe(false);
        } else if (!bareNounSites.includes(siteId) && !hasDe) {
          lackingDe.push(label);
        }
      }
    }

    expect(lackingDe).toEqual([]);
  });

  it("keeps the cabinet noun bare in every arm (owner ruling 2026-09-10)", () => {
    for (const siteId of CABINET_NOUN_COUNTS) {
      const site = sites.find((s) => `${s.key}|${s.selector}` === siteId);
      if (site === undefined) throw new Error(`no plural site ${siteId}`);
      for (const [count, sentence] of sweepRenders("ro", site)) {
        expect(sentence, `${siteId} at ${String(count)}`).not.toContain(
          `${String(count)} de dulap`,
        );
      }
    }
  });

  it("says a singular for one and not for the neighbours 0 and 2", () => {
    for (const site of sites) {
      const renders = new Map(sweepRenders("ro", site));
      expect(renders.get(1), site.key).not.toBe(renders.get(2));
    }
  });
});

describe("a Russian count reads the CLDR arm across 0 to 205", () => {
  const sites = pluralSitesOf("ru");

  it("states the number for every count whose CLDR category is not the word for exactly one", () => {
    // Russian `one` covers 21, 31, 101 and so on, so an arm that spells out "one" ("Одна …") reads wrongly there.
    const firstFailurePerSite: string[] = [];

    for (const site of sites) {
      const failing = sweepRenders("ru", site).find(
        ([count, sentence]) => count !== 1 && !sentence.includes(String(count)),
      );
      if (failing !== undefined) {
        firstFailurePerSite.push(
          `${site.key}|${site.selector} at ${String(failing[0])}: ${failing[1]}`,
        );
      }
    }

    expect(firstFailurePerSite).toEqual([]);
  });

  it("declines the noun by the CLDR category for a spread of counts", () => {
    const forms: readonly (readonly [string, string, readonly string[]])[] = [
      [
        "priceDashboard.cabinets.groupCount",
        "count",
        ["шкаф", "шкафа", "шкафов"],
      ],
      [
        "priceDashboard.cabinet.hingeCount",
        "count",
        ["петля", "петли", "петель"],
      ],
      [
        "priceDashboard.materials.colourCount",
        "count",
        ["цвет", "цвета", "цветов"],
      ],
      [
        "priceDashboard.publish.changeCount",
        "count",
        ["изменение", "изменения", "изменений"],
      ],
    ];
    const countsByForm = [
      [1, 0],
      [21, 0],
      [101, 0],
      [2, 1],
      [4, 1],
      [22, 1],
      [104, 1],
      [0, 2],
      [5, 2],
      [11, 2],
      [14, 2],
      [20, 2],
      [25, 2],
      [111, 2],
    ] as const;

    for (const [key, selector, nouns] of forms) {
      const site = sites.find((s) => s.key === key && s.selector === selector);
      if (site === undefined) throw new Error(`no plural site ${key}`);
      const renders = new Map(sweepRenders("ru", site));
      for (const [count, formIndex] of countsByForm) {
        expect(renders.get(count), `${key} at ${String(count)}`).toContain(
          `${String(count)} ${nouns[formIndex] ?? ""}`,
        );
      }
    }
  });
});

describe("the priced depth sentence has a zero form (a 0 % rule must not read as a surcharge)", () => {
  const KEY = "globalSettings.depthNotePriced";

  it.each(CATALOGUES)(
    "is an exact-value switch on percent with an =0 arm and an other arm in %s",
    (_locale, messages) => {
      const nodes = pluralNodesOf(parse(leafAt(messages, KEY) ?? ""));
      const [node, ...rest] = nodes.filter((n) => n.value === "percent");

      expect(rest).toEqual([]);
      expect(Object.keys(node?.options ?? {}).sort()).toEqual(["=0", "other"]);
      expect(isExactValueSwitch(Object.keys(node?.options ?? {}))).toBe(true);
    },
  );

  it.each(CATALOGUES)(
    "states no percent and no surcharge when the rule is zero, in %s",
    (locale) => {
      const zero = render(locale, KEY, { cabinetDepthMm: 700, percent: 0 });

      expect(zero, locale).not.toContain("%");
      expect(zero, locale).not.toMatch(/\d+\s*%/u);
      expect(zero, locale).toContain("700");
      expect(zero, locale).not.toMatch(
        locale === "ro" ? /scump/iu : /удорожа/iu,
      );
    },
  );

  it.each(CATALOGUES)(
    "carries the percentage as the plural's own number (#) in the other arm only, in %s",
    (_locale, messages) => {
      const [node] = pluralNodesOf(parse(leafAt(messages, KEY) ?? ""));
      // `#` rather than a second `{percent}`: the generated declaration types a plural selector and a plain argument of
      // one name as `never`, so no caller could pass either.
      const poundCount = (name: string): number => {
        const arm = node?.options[name]?.value ?? [];
        let count = 0;
        walk(arm, (element) => {
          if (element.type === TYPE.pound) count += 1;
        });
        return count;
      };

      expect(poundCount("=0")).toBe(0);
      expect(poundCount("other")).toBe(1);
    },
  );

  it.each(["1", "7", "15", "100"])(
    "keeps the surcharge sentence for a non-zero rule of %s %%",
    (percent) => {
      expect(render("ro", KEY, { cabinetDepthMm: 700, percent })).toContain(
        `${percent} %`,
      );
      expect(render("ru", KEY, { cabinetDepthMm: 700, percent })).toContain(
        `${percent} %`,
      );
    },
  );
});

describe("availability applies immediately and the price line stays on publishing (plan A-17, A-18, S-15)", () => {
  const APPLIES_IMMEDIATELY = {
    ro: /se aplic. imediat/iu,
    ru: /применяется сразу/iu,
  } as const;
  const WAITS_FOR_PUBLISH = {
    ro: /intr. .n vigoare c.nd publici/iu,
    ru: /(вступит в силу|вступят в силу|начнёт действовать|начнут действовать) после публикации/iu,
  } as const;

  const IMMEDIATE_LEAVES = [
    "priceDashboard.lifecycle.appliesImmediately",
    "priceDashboard.hardware.activeHint",
    "priceDashboard.materials.activeHint",
    "priceDashboard.accessories.activeHint",
  ] as const;

  const DEACTIVATION_AND_ACTIVATION_LEAVES = [
    "priceDashboard.lifecycle.deactivateTitle",
    "priceDashboard.lifecycle.whatHappens",
    "priceDashboard.lifecycle.usedBy",
    "priceDashboard.lifecycle.clientsCannotChoose",
    "priceDashboard.lifecycle.replacementExplained",
    "priceDashboard.lifecycle.accessoryRemovedExplained",
    "priceDashboard.lifecycle.appliesImmediately",
    "priceDashboard.lifecycle.deactivateConfirm",
    "priceDashboard.lifecycle.activateTitle",
    "priceDashboard.lifecycle.activateBody",
    "priceDashboard.lifecycle.activateConfirm",
    "priceDashboard.lifecycle.deactivateInstead",
    "priceDashboard.materials.inactiveBanner",
    "priceDashboard.materials.activeHint",
    "priceDashboard.hardware.activeHint",
    "priceDashboard.accessories.activeHint",
  ] as const;

  const PUBLISHED_CHANGE_LEAVES = [
    "priceDashboard.common.priceSavedNotice",
    "priceDashboard.rule.savedNotice",
    "priceDashboard.cabinet.pendingNotice",
    "priceDashboard.hardware.deleteNotice",
    "priceDashboard.hardware.pricesHint",
    "priceDashboard.materials.surchargeHint",
    "priceDashboard.accessories.priceHint",
    "priceDashboard.common.textSavedNotice",
  ] as const;

  it.each(CATALOGUES)(
    "says %s deactivation applies immediately",
    (locale, messages) => {
      for (const key of IMMEDIATE_LEAVES) {
        const text = leafAt(messages, key) ?? "";
        expect(text, `${locale} ${key}`).toMatch(APPLIES_IMMEDIATELY[locale]);
      }
    },
  );

  it.each(CATALOGUES)(
    "never tells the owner a %s deactivation or activation waits for publishing",
    (locale, messages) => {
      for (const key of DEACTIVATION_AND_ACTIVATION_LEAVES) {
        const text = leafAt(messages, key);
        expect(text, `${locale} ${key} exists`).toBeDefined();
        expect(text ?? "", `${locale} ${key}`).not.toMatch(
          WAITS_FOR_PUBLISH[locale],
        );
      }
    },
  );

  it.each(CATALOGUES)(
    "keeps the publish line on every %s price save, creation and deletion notice",
    (locale, messages) => {
      for (const key of PUBLISHED_CHANGE_LEAVES) {
        expect(leafAt(messages, key) ?? "", `${locale} ${key}`).toMatch(
          WAITS_FOR_PUBLISH[locale],
        );
      }
    },
  );

  it.each(CATALOGUES)(
    "carries no %s leaf that both applies immediately and waits for publishing",
    (locale, messages) => {
      const contradictory = m10Leaves(messages)
        .filter(
          ([, text]) =>
            APPLIES_IMMEDIATELY[locale].test(text) &&
            WAITS_FOR_PUBLISH[locale].test(text),
        )
        .map(([key]) => key);

      expect(contradictory).toEqual([]);
    },
  );

  it.each(CATALOGUES)(
    "adds no Russian-tab label to the %s dashboard copy (A-21)",
    (locale, messages) => {
      const tabLabels = m10Leaves(messages)
        .filter(([key]) => key.startsWith("priceDashboard"))
        .filter(([, text]) => /\bRU\b|\bRO\b|RU TBD/u.test(text))
        .map(([key]) => key);

      expect(tabLabels).toEqual([]);
    },
  );
});

describe("the review-fix leaves keep their contracts", () => {
  it("writes the group-off width in a publish example line (1200, never 1.200 or 1 200)", () => {
    const values = { name: "X", widthMm: 1200, before: "1", after: "2" };

    expect(
      render("ro", "priceDashboard.publish.exampleLine", values),
    ).toContain("X 1200:");
    expect(
      render("ru", "priceDashboard.publish.exampleLine", values),
    ).toContain("X 1200:");
  });

  it.each(CATALOGUES)(
    "names the blocked item and nothing else in the default-refusal sentence in %s",
    (locale) => {
      const sentence = render(
        locale,
        "priceDashboard.publish.blockedIsDefault",
        {
          name: "[item]",
        },
      );

      expect(sentence).toContain("[item]");
      expect(sentence).not.toMatch(/[{}]/u);
    },
  );

  it.each(CATALOGUES)(
    "keeps the zero-argument %s leaves free of parameters, so a caller passing one is the defect",
    (locale, messages) => {
      const keys = [
        "priceDashboard.cabinets.editHint",
        "priceDashboard.cabinet.sinkNote",
        "priceDashboard.hardware.newPricesNote",
        "priceDashboard.accessories.linkFixedNote",
        "priceDashboard.lifecycle.accessoryRemovedExplained",
        "priceDashboard.common.textSavedNotice",
        "replacementSheet.settingsNoLongerOffered",
      ] as const;

      for (const key of keys) {
        expect(
          [...argumentKinds(parse(leafAt(messages, key) ?? ""))],
          `${locale} ${key}`,
        ).toEqual([]);
      }
    },
  );

  it.each(CATALOGUES)(
    "takes only the count in the %s restore dialog body (the version id lives in the title and action)",
    (locale, messages) => {
      const names = (key: string): readonly string[] => [
        ...argumentKinds(parse(leafAt(messages, key) ?? "")).keys(),
      ];

      expect(names("priceDashboard.history.restoreDialogBody"), locale).toEqual(
        ["count"],
      );
      expect(names("priceDashboard.history.restoreTitle"), locale).toEqual([
        "versionId",
      ]);
      expect(names("priceDashboard.history.restoreAction"), locale).toEqual([
        "versionId",
      ]);
    },
  );
});

describe("the digest renders the numbers it is given (frame D10D)", () => {
  const statuses = { offerSentStatus: "[offer]", closedStatus: "[closed]" };

  it('reads the Romanian subject\'s count with "de" from twenty and a singular for one', () => {
    expect(render("ro", "staffChanges.digest.title", { count: 3 })).toMatch(
      /^3 buc/u,
    );
    expect(render("ro", "staffChanges.digest.title", { count: 20 })).toMatch(
      /^20 de buc/u,
    );
    expect(render("ro", "staffChanges.digest.title", { count: 1 })).toMatch(
      /^O buc/u,
    );
  });

  it('states the footer\'s day limit and both closing statuses as parameters, reading 30 days as "30 de zile"', () => {
    const footer = render("ro", "staffChanges.digest.footer", {
      ...statuses,
      days: 30,
    });

    expect(footer).toContain("30 de zile de la trimitere");
    expect(footer).toContain("[offer]");
    expect(footer).toContain("[closed]");
  });

  it('reads the Russian footer\'s 30 days as "30 дней" and the Russian subject\'s 3 kitchens as "3 кухни"', () => {
    expect(
      render("ru", "staffChanges.digest.footer", { ...statuses, days: 30 }),
    ).toContain("через 30 дней после отправки");
    expect(render("ru", "staffChanges.digest.title", { count: 3 })).toMatch(
      /^3 кухни изменены/u,
    );
  });
});

describe("the new leaves keep the project's register", () => {
  it("addresses Romanian readers as tu, never as voi", () => {
    const voiForms =
      /\b(?:le-a.i|alege.i|.ncerca.i|verifica.i|pute.i|primi.i|trece.i|completa.i|corecta.i|scrie.i|deschide.i)\b/iu;
    const leaves = leavesOf("ro")
      .filter(([, text]) => voiForms.test(text))
      .map(([key]) => key);

    expect(leaves).toEqual([]);
  });

  it("addresses Russian readers as ты, never as вы", () => {
    const vyForms =
      /(?:\bВы\b|\bвы\b|\bВаш\w*|\bваш\w*|(?:Выберите|Введите|Проверьте|Попробуйте|Заполните|Напишите|Исправьте|Откройте)\b)/u;
    const leaves = leavesOf("ru")
      .filter(([, text]) => vyForms.test(text))
      .map(([key]) => key);

    expect(leaves).toEqual([]);
  });
});
