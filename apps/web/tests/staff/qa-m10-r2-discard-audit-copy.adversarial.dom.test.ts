// @vitest-environment happy-dom
//
// Adversarial QA of M10 R2: the discard-all row the draft's `DELETE` writes (`staffAuditDetail.changeKinds.discardAll`) is told
// in both languages, in the table and on the phone's cards, with its count, and the page's wire reading accepts it.
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

let screen: MountedScreen | undefined;

afterEach(() => {
  screen?.unmount();
  screen = undefined;
});

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

describe.each(["ro", "ru"] as const)("a discard-all row in %s", (locale) => {
  const translate = TRANSLATOR[locale];
  const WORDS = translate("staffAuditDetail.changeKinds.discardAll");

  it("has words of its own in the catalogue, not the key and not another kind's", () => {
    expect(WORDS).not.toMatch(/staffAuditDetail|changeKinds|discardAll/);
    expect(WORDS.trim()).not.toBe("");
    expect(WORDS).not.toBe(translate("staffAuditDetail.changeKinds.bulkGroup"));
    expect(WORDS).not.toBe(translate("staffAuditDetail.changeKinds.depthRule"));
  });

  it.each([
    [0, [] as const],
    [1, [] as const],
    [2, [{ count: 2 }] as const],
    [40, [{ count: 40 }] as const],
  ])(
    "with %i entries held is told as its words, and the count when more than one",
    (revertedCount, counts) => {
      const container = mountTable(
        listingOf([
          {
            action: "price-draft-reverted",
            detail: { changeKind: "discard-all", revertedCount },
          },
        ]),
        locale,
      );

      expect(objectPartsOf(container)).toEqual([
        [
          WORDS,
          ...counts.map(({ count }) =>
            translate("staffAuditDetail.detailChanges", { count }),
          ),
        ],
      ]);
    },
  );

  it("is told the same on a phone's cards", () => {
    const container = mountTable(
      listingOf([
        {
          action: "price-draft-reverted",
          detail: { changeKind: "discard-all", revertedCount: 3 },
        },
      ]),
      locale,
      AuditCards,
    );

    const text = requireIn(
      container,
      '[data-testid="staff-audit-row"]',
    ).textContent;
    expect(text).toContain(WORDS);
    expect(text).not.toMatch(/discard-all|staffAuditDetail/);
  });
});

describe("the two catalogues' words for a discard-all", () => {
  it("differ, and both are present", () => {
    expect(COPY.ro.staffAuditDetail.changeKinds.discardAll).not.toBe(
      COPY.ru.staffAuditDetail.changeKinds.discardAll,
    );
  });
});
