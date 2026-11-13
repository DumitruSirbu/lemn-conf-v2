// @vitest-environment happy-dom
//
// Wave X2 (adversarial QA): the audit page over the nine price dashboard actions, in both languages. Every action of the
// staff list must be offered in the filter by words, asked for by its code, and told on a row in the same words; no
// action may fall through to "unknown", show a message key or a bare code, or share its words with another action.
import {
  DASHBOARD_AUDIT_ACTIONS,
  STAFF_AUDIT_ACTIONS,
} from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { allIn, type TestLocale } from "../support/render-with-intl";
import { wireAuditEvent, wireAuditPage } from "../support/staff-audit-wire";

import {
  ROWS,
  setUpAuditHarness,
  type AuditHarness,
} from "./qa-l3-u6-harness.adversarial";

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];

/** A detail the domain accepts for each action, so the wire reading recognises the row. */
const DETAILS: Readonly<Record<string, unknown>> = {
  "kitchen-opened": null,
  "note-added": null,
  "kitchen-unhidden": null,
  "status-changed": { from: "new", to: "closed" },
  "kitchens-listed": {
    segment: "all",
    status: null,
    page: 1,
    rowCount: 3,
    hasSearch: false,
  },
  "audit-viewed": {
    page: 1,
    rowCount: 3,
    hasActorFilter: false,
    hasActionFilter: false,
    hasDateFilter: false,
  },
  "price-draft-changed": { changeKind: "depth-rule" },
  "price-draft-reverted": { changeKind: "provisional", revertedCount: 1 },
  "price-bulk-changed": {
    scope: "all",
    percent: 3,
    ruleCount: 1,
    amountCount: 2,
  },
  "price-published": { sequenceNumber: 1, changeCount: 1, provisional: false },
  "price-restored-to-draft": { fromSequenceNumber: 1, changeCount: 1 },
  "catalogue-item-active-changed": {
    itemKind: "material",
    itemId: "material.painted-mdf",
    active: true,
    availabilityRevision: "1",
  },
  "kitchen-defaults-saved": { changedFields: ["finish"] },
  "kitchen-seen": {},
  "price-catalogue-viewed": { section: "history" },
};

const LABEL_KEYS: Readonly<Record<string, string>> = {
  "kitchen-opened": "actionKitchenOpened",
  "note-added": "actionNoteAdded",
  "status-changed": "actionStatusChanged",
  "kitchen-unhidden": "actionKitchenUnhidden",
  "kitchens-listed": "actionKitchensListed",
  "audit-viewed": "actionAuditViewed",
  "price-draft-changed": "actionPriceDraftChanged",
  "price-draft-reverted": "actionPriceDraftReverted",
  "price-bulk-changed": "actionPriceBulkChanged",
  "price-published": "actionPricePublished",
  "price-restored-to-draft": "actionPriceRestoredToDraft",
  "catalogue-item-active-changed": "actionCatalogueItemActiveChanged",
  "kitchen-defaults-saved": "actionKitchenDefaultsSaved",
  "kitchen-seen": "actionKitchenSeen",
  "price-catalogue-viewed": "actionPriceCatalogueViewed",
};

function wordsOf(locale: TestLocale, action: string): string {
  const catalogue = CATALOGUES[locale].staffAudit as Record<string, string>;
  const key = LABEL_KEYS[action];
  const words = key === undefined ? undefined : catalogue[key];
  if (words === undefined) throw new Error(`no words for ${action}`);
  return words;
}

function recognisedRow(serial: number, action: string) {
  return wireAuditEvent(serial, {
    entry: { kind: "recognised", action, detail: DETAILS[action] },
  });
}

let harness: AuditHarness;

beforeEach(() => {
  harness = setUpAuditHarness();
});

afterEach(() => {
  harness.tearDown();
});

describe("the catalogues hold words for every action of the list", () => {
  it("names a label key for exactly the fifteen actions", () => {
    expect(Object.keys(LABEL_KEYS).sort()).toEqual(
      [...STAFF_AUDIT_ACTIONS].sort(),
    );
    expect(DASHBOARD_AUDIT_ACTIONS).toHaveLength(9);
  });

  it.each(LOCALES)(
    "in %s every action has its own non-empty words, none of them a message key or a code",
    (locale) => {
      const labels = STAFF_AUDIT_ACTIONS.map((action) =>
        wordsOf(locale, action),
      );

      expect(new Set(labels).size).toBe(15);
      for (const [index, label] of labels.entries()) {
        const action = STAFF_AUDIT_ACTIONS[index] ?? "";
        expect(label.trim(), action).not.toBe("");
        expect(label, action).not.toContain("staffAudit");
        expect(label, action).not.toBe(action);
        expect(label, action).not.toMatch(/undefined|null|\{|\}/u);
      }
    },
  );

  it("keeps the Russian words in Cyrillic and the Romanian words free of it", () => {
    for (const action of DASHBOARD_AUDIT_ACTIONS) {
      expect(wordsOf("ru", action), action).toMatch(/\p{Script=Cyrillic}/u);
      expect(wordsOf("ro", action), action).not.toMatch(/\p{Script=Cyrillic}/u);
    }
  });
});

describe.each(LOCALES)(
  "the audit page in %s over all fifteen actions",
  (locale) => {
    beforeEach(async () => {
      harness.answers((request) => {
        const asked = request.url.searchParams.get("action");
        const shown =
          asked === null
            ? STAFF_AUDIT_ACTIONS
            : STAFF_AUDIT_ACTIONS.filter((action) => action === asked);
        return {
          body: wireAuditPage(
            shown.map((action, index) => recognisedRow(index + 1, action)),
          ),
        };
      });
      await harness.mount({ locale, width: "desktop" });
    });

    it("tells each row in its own words, never as an unknown action", () => {
      const cells = allIn(harness.container(), ROWS).map(
        (row) => allIn(row, "td")[2]?.textContent,
      );

      expect(cells).toEqual(
        STAFF_AUDIT_ACTIONS.map((action) => wordsOf(locale, action)),
      );
      expect(cells).not.toContain(CATALOGUES[locale].staffAudit.actionUnknown);
    });

    it("offers the fifteen in the menu in their words, each valued by its code", () => {
      const options = allIn<HTMLOptionElement>(
        harness.actionSelect(),
        "option",
      );

      expect(options.slice(1).map((option) => option.value)).toEqual([
        ...STAFF_AUDIT_ACTIONS,
      ]);
      expect(options.slice(1).map((option) => option.textContent)).toEqual(
        STAFF_AUDIT_ACTIONS.map((action) => wordsOf(locale, action)),
      );
    });

    it.each(STAFF_AUDIT_ACTIONS)(
      "choosing %s asks the route for that code, from the first page, and shows its row in its words",
      async (action) => {
        await harness.choose(harness.actionSelect(), action);

        expect(harness.queries().at(-1)).toEqual({ page: "1", action });
        const rows = allIn(harness.container(), ROWS);
        expect(rows).toHaveLength(1);
        expect(allIn(rows[0] ?? document.body, "td")[2]?.textContent).toBe(
          wordsOf(locale, action),
        );
      },
    );
  },
);
