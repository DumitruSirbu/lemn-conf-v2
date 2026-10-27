// @vitest-environment happy-dom
//
// The audit page's detail for the nine price dashboard actions: which kind of price changed, which item was switched, which
// version went live and how many changes it held, told in the catalogue's words in both languages. The rows are read through
// the page's own wire reading, which asks the domain again, so every detail below is one the domain accepts.
import { createTranslator } from "next-intl";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { AuditCards, AuditTable } from "@/staff/staff-audit-rows";
import type { StaffAuditListing } from "@/staff/staff-audit-listing";
import { staffAuditPageFrom } from "@/staff/staff-audit-wire-reading";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import {
  allIn,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import { wireAuditEvent, wireAuditPage } from "../support/staff-audit-wire";

const COPY = { ro: roMessages, ru: ruMessages } as const;
const TRANSLATOR = {
  ro: createTranslator({ locale: "ro", messages: roMessages }),
  ru: createTranslator({ locale: "ru", messages: ruMessages }),
} as const;
const READ_AT_MS = Date.parse("2026-10-21T12:00:00.000Z");
const FIRST_STRONG_ISOLATE = "⁨";
const POP_DIRECTIONAL_ISOLATE = "⁩";

let screen: MountedScreen | undefined;

afterEach(() => {
  screen?.unmount();
  screen = undefined;
});

function isolated(id: string): string {
  return `${FIRST_STRONG_ISOLATE}${id}${POP_DIRECTIONAL_ISOLATE}`;
}

function listingOf(
  rows: readonly { action: string; detail: unknown; kitchen?: unknown }[],
): StaffAuditListing {
  const page = staffAuditPageFrom(
    wireAuditPage(
      rows.map((row, index) =>
        wireAuditEvent(index + 1, {
          entry: { kind: "recognised", action: row.action, detail: row.detail },
          subject: null,
          kitchen: row.kitchen ?? null,
        }),
      ),
    ),
  );
  if (page === undefined) throw new Error("the page does not read");
  return {
    query: { actorId: null, action: null, from: null, to: null, page: 1 },
    total: page.total,
    pageSize: page.pageSize,
    firstPage: 1,
    lastPage: 1,
    events: page.events,
    readAtMs: READ_AT_MS,
    focusRequest: undefined,
    isExhausted: true,
  };
}

function mountTable(
  listing: StaffAuditListing,
  locale: TestLocale,
  Rows: typeof AuditTable | typeof AuditCards = AuditTable,
): HTMLElement {
  screen = mountInCatalogue(createElement(Rows, { locale, listing }), locale);
  return screen.container;
}

/** What the object column of each row says: the first line, then the parts that follow it. */
function objectPartsOf(container: HTMLElement): string[][] {
  return allIn(container, '[data-testid="staff-audit-row"]').map((row) => {
    const cell = allIn(row, "td")[3] ?? row;
    const [primary, rest] = Array.from(cell.children);
    return [
      primary?.textContent ?? "",
      ...Array.from(rest?.children ?? []).map((part) => part.textContent),
    ];
  });
}

type Translate = (typeof TRANSLATOR)["ro"];

interface Case {
  readonly name: string;
  readonly action: string;
  readonly detail: unknown;
  readonly kitchen?: unknown;
  readonly parts: (t: Translate) => string[];
}

const BULK_NAME = (t: Translate, signedPercent: string, group: string) =>
  t("priceDashboard.publish.bulkRowName", { signedPercent, group });

const CASES: readonly Case[] = [
  {
    name: "a price changed in the draft",
    action: "price-draft-changed",
    detail: {
      changeKind: "cabinet",
      itemKind: "cabinet",
      itemId: "cabinet.base-cabinet",
      field: "anchorMinor",
    },
    parts: (t) => [
      t("staffAuditDetail.changeKinds.cabinet"),
      t("staffAuditDetail.itemKinds.cabinet"),
      isolated("cabinet.base-cabinet"),
    ],
  },
  {
    name: "a price of one size of a fixed-size cabinet",
    action: "price-draft-changed",
    detail: {
      changeKind: "cabinet-size",
      itemKind: "cabinet",
      itemId: "cabinet.base-hob-2drawer",
      widthMm: 600,
    },
    parts: (t) => [
      t("staffAuditDetail.changeKinds.cabinetSize"),
      t("staffAuditDetail.itemKinds.cabinet"),
      isolated("cabinet.base-hob-2drawer"),
      t("staffAuditDetail.detailWidth", { widthMm: 600 }),
    ],
  },
  {
    name: "a rule that names no item",
    action: "price-draft-reverted",
    detail: { changeKind: "depth-rule", revertedCount: 1 },
    parts: (t) => [t("staffAuditDetail.changeKinds.depthRule")],
  },
  {
    name: "a whole bulk action taken back",
    action: "price-draft-reverted",
    detail: { changeKind: "bulk-group", revertedCount: 12 },
    parts: (t) => [
      t("staffAuditDetail.changeKinds.bulkGroup"),
      t("staffAuditDetail.detailChanges", { count: 12 }),
    ],
  },
  {
    name: "a bulk rise for one group",
    action: "price-bulk-changed",
    detail: {
      scope: "group",
      groupCode: "tall",
      percent: 5,
      ruleCount: 2,
      amountCount: 6,
    },
    parts: (t) => [
      BULK_NAME(t, "+5", t("priceDashboard.cabinets.groupTall")),
      t("priceDashboard.publish.bulkRowSummary", {
        cabinetCount: 2,
        priceCount: 6,
      }),
    ],
  },
  {
    name: "a bulk reduction for every cabinet",
    action: "price-bulk-changed",
    detail: { scope: "all", percent: -3, ruleCount: 22, amountCount: 66 },
    parts: (t) => [
      BULK_NAME(
        t,
        "−3",
        t("priceDashboard.cabinets.groupCount", { count: 22 }),
      ),
      t("priceDashboard.publish.bulkRowSummary", {
        cabinetCount: 22,
        priceCount: 66,
      }),
    ],
  },
  {
    name: "the version that went live",
    action: "price-published",
    detail: { sequenceNumber: 7, changeCount: 5, provisional: false },
    parts: (t) => [
      t("staffAuditDetail.detailVersion", { sequenceNumber: 7 }),
      t("staffAuditDetail.detailChanges", { count: 5 }),
      t("staffAuditDetail.detailProvisionalOff"),
    ],
  },
  {
    name: "the version that went live while the figures were still provisional",
    action: "price-published",
    detail: { sequenceNumber: 8, changeCount: 1, provisional: true },
    parts: (t) => [
      t("staffAuditDetail.detailVersion", { sequenceNumber: 8 }),
      t("staffAuditDetail.detailChanges", { count: 1 }),
      t("staffAuditDetail.detailProvisionalOn"),
    ],
  },
  {
    name: "the version whose prices were brought back into the draft",
    action: "price-restored-to-draft",
    detail: { fromSequenceNumber: 3, changeCount: 2 },
    parts: (t) => [
      t("staffAuditDetail.detailFromVersion", { sequenceNumber: 3 }),
      t("staffAuditDetail.detailChanges", { count: 2 }),
    ],
  },
  {
    name: "an item that was switched off",
    action: "catalogue-item-active-changed",
    detail: {
      itemKind: "material",
      itemId: "material.painted-mdf",
      active: false,
      availabilityRevision: "4",
    },
    parts: (t) => [
      t("staffAuditDetail.itemKinds.material"),
      isolated("material.painted-mdf"),
      t("priceDashboard.chips.inactive"),
    ],
  },
  {
    name: "an item that was switched on",
    action: "catalogue-item-active-changed",
    detail: {
      itemKind: "hardware",
      itemId: "hardware.blum",
      active: true,
      availabilityRevision: "5",
    },
    parts: (t) => [
      t("staffAuditDetail.itemKinds.hardware"),
      isolated("hardware.blum"),
      t("priceDashboard.chips.active"),
    ],
  },
  {
    name: "the defaults that were saved",
    action: "kitchen-defaults-saved",
    detail: { changedFields: ["finish", "topRowHandle"] },
    parts: (t) => [
      t("staffAuditDetail.defaultsFields.finish"),
      t("staffAuditDetail.defaultsFields.topRowHandle"),
    ],
  },
  {
    name: "a kitchen marked as seen",
    action: "kitchen-seen",
    detail: {},
    kitchen: { id: "k".repeat(21), name: "Bucatarie 1" },
    parts: () => [isolated("Bucatarie 1")],
  },
  {
    name: "the history that was opened",
    action: "price-catalogue-viewed",
    detail: { section: "history" },
    parts: (t) => [t("priceDashboard.publish.tabHistory")],
  },
  {
    name: "a version that was opened",
    action: "price-catalogue-viewed",
    detail: { section: "version" },
    parts: (t) => [t("staffAuditDetail.sectionVersion")],
  },
];

function caseAt(index: number): Case {
  const found = CASES[index];
  if (found === undefined) throw new Error(`no case at ${String(index)}`);
  return found;
}

describe.each(["ro", "ru"] as const)("the audit page in %s", (locale) => {
  it.each(CASES)("tells $name in the object column", (row) => {
    const container = mountTable(listingOf([row]), locale);

    expect(objectPartsOf(container)).toEqual([row.parts(TRANSLATOR[locale])]);
  });

  it("tells every dashboard action's row without a bare action code or an empty object", () => {
    const container = mountTable(listingOf([...CASES]), locale);

    const parts = objectPartsOf(container);
    expect(parts).toHaveLength(CASES.length);
    for (const row of parts) {
      expect(row[0]).not.toBe("");
      expect(row[0]).not.toMatch(/^(price|catalogue|kitchen)-/);
      expect(row.join(" ")).not.toMatch(/staffAudit|priceDashboard|undefined/);
    }
  });

  it("covers all nine dashboard actions", () => {
    expect(new Set(CASES.map((row) => row.action)).size).toBe(9);
  });

  it("leaves an item's id a text child inside an isolate, so an id cannot reorder the words around it", () => {
    const container = mountTable(listingOf([caseAt(0)]), locale);

    const idCell = requireIn(
      container,
      '[data-testid="staff-audit-row"]',
    ).textContent;
    expect(idCell).toContain(isolated("cabinet.base-cabinet"));
  });

  it("tells the same details on a phone's cards", () => {
    const container = mountTable(listingOf([caseAt(6)]), locale, AuditCards);

    expect(
      requireIn(container, '[data-testid="staff-audit-row"]').textContent,
    ).toContain(
      TRANSLATOR[locale]("staffAuditDetail.detailVersion", {
        sequenceNumber: 7,
      }),
    );
  });
});

describe("the catalogue's words for these details", () => {
  it.each(["ro", "ru"] as const)(
    "has no empty leaf in %s under the audit detail namespace",
    (locale) => {
      const leaves = JSON.stringify(COPY[locale].staffAuditDetail);

      expect(leaves).not.toMatch(/:\s*""/);
    },
  );
});
