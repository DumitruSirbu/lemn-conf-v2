// Adversarial QA of M10 wave U5: the audit page's words for the nine dashboard actions, over every code the domain lists.
// `staff-audit-dashboard-details.dom.test.ts` renders one hand-picked row per action, so a code with no Russian words, two
// codes told with the same words, or a message key shown in place of words would pass it. Here every kind, item kind, group,
// section and defaults field goes through the real detail function, in both languages, with a translator that throws on any
// missing message (next-intl's default is to return the key's path, which reads as an answer).
import {
  BOOK_FIELD_ADDRESS_KINDS,
  CHANGE_ITEM_KINDS,
  DASHBOARD_AUDIT_ACTIONS,
  KITCHEN_DEFAULTS_FIELDS,
  PRICE_CATALOGUE_SECTIONS,
  PRICE_GROUP_CODES,
  readDashboardAuditEntry,
  type DashboardAuditEntry,
} from "@lemnaria/configurator-domain";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import type { ContentTranslator } from "@/i18n/content";
import { resolveDashboardAuditDetailCopy } from "@/i18n/staff-audit-dashboard-copy";
import { dashboardDetailParts } from "@/staff/staff-audit-dashboard-details";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

const MINUS_SIGN = "−";
const LOCALES = ["ro", "ru"] as const;

function strictCopy(locale: (typeof LOCALES)[number]) {
  const translate = createTranslator({
    locale,
    messages: locale === "ro" ? roMessages : ruMessages,
    onError: (error) => {
      throw error;
    },
    getMessageFallback: ({ key }) => {
      throw new Error(`no words for ${key}`);
    },
  });
  return resolveDashboardAuditDetailCopy(
    translate as unknown as ContentTranslator,
  );
}

function entryOf(action: string, detail: unknown): DashboardAuditEntry {
  const reading = readDashboardAuditEntry(action, detail);
  if (!reading.ok) {
    throw new Error(`the domain refuses ${action} ${JSON.stringify(detail)}`);
  }
  return reading.entry;
}

const ITEMLESS_KINDS = ["depth-rule", "provisional"];

function changedDetailOf(changeKind: string) {
  return ITEMLESS_KINDS.includes(changeKind)
    ? { changeKind }
    : {
        changeKind,
        itemKind: "cabinet",
        itemId: "cabinet.base-cabinet",
        ...(changeKind === "cabinet-size" ? { widthMm: 450 } : {}),
      };
}

function partsOf(
  locale: (typeof LOCALES)[number],
  action: string,
  detail: unknown,
): readonly string[] {
  return dashboardDetailParts(entryOf(action, detail), strictCopy(locale));
}

/** A code that is also a Romanian word ("material") may be told as itself in Romanian; any other code never is. */
function expectNotTheCode(
  locale: (typeof LOCALES)[number],
  told: string | undefined,
  code: string,
): void {
  const isPlainWord = /^[a-z]+$/.test(code);
  if (locale === "ro" && isPlainWord) return;
  expect(told).not.toBe(code);
}

function expectTold(parts: readonly string[]): void {
  expect(parts.length).toBeGreaterThan(0);
  for (const part of parts) {
    expect(part.trim(), "an empty part").not.toBe("");
    expect(part).not.toMatch(
      /\b(staffAudit|staffAuditDetail|priceDashboard)\b/,
    );
    expect(part).not.toMatch(/undefined|NaN|\[object|\{|\}/);
  }
}

describe.each(LOCALES)("the audit detail in %s", (locale) => {
  it.each(BOOK_FIELD_ADDRESS_KINDS)(
    "tells a draft change of kind %s in words, never as the code",
    (changeKind) => {
      const [kindWords, ...rest] = partsOf(
        locale,
        "price-draft-changed",
        changedDetailOf(changeKind),
      );

      expectTold([kindWords ?? "", ...rest]);
      expect(kindWords).not.toBe(changeKind);
      expect(kindWords).not.toMatch(/^[a-z]+(-[a-z]+)+$/);
    },
  );

  it("tells every kind of draft change in different words, so two kinds are never read as one", () => {
    const told = BOOK_FIELD_ADDRESS_KINDS.map(
      (kind) =>
        partsOf(locale, "price-draft-changed", changedDetailOf(kind))[0],
    );

    expect(new Set(told).size).toBe(BOOK_FIELD_ADDRESS_KINDS.length);
  });

  it("tells a revert of a whole bulk action with the count of what went, and a revert of one change without a count", () => {
    const group = partsOf(locale, "price-draft-reverted", {
      changeKind: "bulk-group",
      revertedCount: 22,
    });
    const single = partsOf(locale, "price-draft-reverted", {
      ...changedDetailOf("cabinet"),
      revertedCount: 1,
    });

    expectTold(group);
    expect(group).toHaveLength(2);
    expect(group[1]).toContain("22");
    expect(single).toHaveLength(3);
    expect(single.join(" ")).not.toMatch(/\b1\b/);
  });

  it.each(CHANGE_ITEM_KINDS)(
    "tells an item of kind %s in words",
    (itemKind) => {
      const parts = partsOf(locale, "price-draft-changed", {
        changeKind: "hardware",
        itemKind,
        itemId: "tier-1",
      });

      expectTold(parts);
      expectNotTheCode(locale, parts[1], itemKind);
    },
  );

  it("tells every item kind in different words", () => {
    const told = CHANGE_ITEM_KINDS.map(
      (itemKind) =>
        partsOf(locale, "price-draft-changed", {
          changeKind: "hardware",
          itemKind,
          itemId: "tier-1",
        })[1],
    );

    expect(new Set(told).size).toBe(CHANGE_ITEM_KINDS.length);
  });

  it.each(PRICE_CATALOGUE_SECTIONS)(
    "tells the section %s in words",
    (section) => {
      const parts = partsOf(locale, "price-catalogue-viewed", { section });

      expectTold(parts);
      expect(parts).toHaveLength(1);
      expectNotTheCode(locale, parts[0], section);
    },
  );

  it("tells every section in different words", () => {
    const told = PRICE_CATALOGUE_SECTIONS.map(
      (section) => partsOf(locale, "price-catalogue-viewed", { section })[0],
    );

    expect(new Set(told).size).toBe(PRICE_CATALOGUE_SECTIONS.length);
  });

  it("tells each field of the defaults in different words, and a save of all six as six parts", () => {
    const parts = partsOf(locale, "kitchen-defaults-saved", {
      changedFields: [...KITCHEN_DEFAULTS_FIELDS],
    });

    expectTold(parts);
    expect(parts).toHaveLength(KITCHEN_DEFAULTS_FIELDS.length);
    expect(new Set(parts).size).toBe(KITCHEN_DEFAULTS_FIELDS.length);
    parts.forEach((told, index) => {
      expectNotTheCode(locale, told, KITCHEN_DEFAULTS_FIELDS[index] ?? "");
    });
  });

  it.each(PRICE_GROUP_CODES)(
    "names the group %s in a bulk action in words, with its percentage signed",
    (groupCode) => {
      const parts = partsOf(locale, "price-bulk-changed", {
        scope: "group",
        groupCode,
        percent: 5,
        ruleCount: 3,
        amountCount: 9,
      });

      expectTold(parts);
      expect(parts[0]).toMatch(/^\+5 % /);
      expect(parts[0]?.toLowerCase()).not.toBe(groupCode);
    },
  );

  it("names a bulk action over a selection by the cabinets it touched", () => {
    const say = createTranslator({
      locale,
      messages: locale === "ro" ? roMessages : ruMessages,
    });

    const parts = partsOf(locale, "price-bulk-changed", {
      scope: "selection",
      percent: 5,
      ruleCount: 22,
      amountCount: 64,
    });

    expectTold(parts);
    expect(parts[0]).toBe(
      say("priceDashboard.publish.bulkRowName", {
        signedPercent: "+5",
        group: say("priceDashboard.cabinets.groupCount", { count: 22 }),
      }),
    );
  });

  it("names a bulk action over the whole catalogue 'all the cabinets', with no count that would go stale", () => {
    const say = createTranslator({
      locale,
      messages: locale === "ro" ? roMessages : ruMessages,
    });

    const parts = partsOf(locale, "price-bulk-changed", {
      scope: "all",
      percent: -10,
      ruleCount: 22,
      amountCount: 64,
    });

    expectTold(parts);
    expect(parts[0]).toBe(
      say("priceDashboard.publish.bulkRowName", {
        signedPercent: `${MINUS_SIGN}10`,
        group: say("priceDashboard.publish.bulkScopeAll"),
      }),
    );
    expect(parts[0]).not.toContain("22");
  });

  it.each([-90, -10, -1, 1, 7, 300])(
    "writes the bulk percentage %i with its sign, a reduction with the minus sign and never a hyphen",
    (percent) => {
      const [name] = partsOf(locale, "price-bulk-changed", {
        scope: "group",
        groupCode: "wall",
        percent,
        ruleCount: 3,
        amountCount: 9,
      });

      expect(name).toMatch(
        percent < 0
          ? new RegExp(`^${MINUS_SIGN}${String(-percent)} % `)
          : new RegExp(`^\\+${String(percent)} % `),
      );
      expect(name).not.toMatch(/-\d/);
    },
  );

  it("tells a published version with its number, its count and whether the figures are provisional, in either state", () => {
    const provisional = partsOf(locale, "price-published", {
      sequenceNumber: 12,
      changeCount: 0,
      provisional: true,
    });
    const settled = partsOf(locale, "price-published", {
      sequenceNumber: 12,
      changeCount: 0,
      provisional: false,
    });

    expectTold(provisional);
    expect(provisional[0]).toContain("12");
    expect(provisional[2]).not.toBe(settled[2]);
  });

  it("tells an item switched on and an item switched off in different words", () => {
    const base = {
      itemKind: "hardware",
      itemId: "tier-1",
      availabilityRevision: "3",
    };

    const on = partsOf(locale, "catalogue-item-active-changed", {
      ...base,
      active: true,
    });
    const off = partsOf(locale, "catalogue-item-active-changed", {
      ...base,
      active: false,
    });

    expectTold(on);
    expect(on[2]).not.toBe(off[2]);
  });

  it("tells the seen marker with nothing, because the row's kitchen is its object", () => {
    expect(partsOf(locale, "kitchen-seen", {})).toEqual([]);
  });

  it("covers every dashboard action the domain lists", () => {
    expect(DASHBOARD_AUDIT_ACTIONS).toHaveLength(9);
  });
});

describe("the two languages' words for the same detail", () => {
  it("differ, so a Russian page is not the Romanian one under another locale", () => {
    const detail = { section: "history" };

    expect(partsOf("ro", "price-catalogue-viewed", detail)).not.toEqual(
      partsOf("ru", "price-catalogue-viewed", detail),
    );
  });
});
