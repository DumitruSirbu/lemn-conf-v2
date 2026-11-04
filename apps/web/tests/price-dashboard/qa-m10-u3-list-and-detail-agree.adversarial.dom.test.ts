// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U3, the list and the page it opens, for every rule: the two are drawn from one set of facts,
// and a person reads them one after the other, so they must not say two things. The widths the list gives a row (its range
// or its fixed sizes, its default width, whether the default is only proposed) are the dimensions the cabinet's page gives,
// and the price the list draws as the default-size price is the page's table at that width in the default material.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";

import { CabinetListEditor } from "@/price-dashboard/cabinet-list-editor";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { flushPromises } from "../support/render-hook";
import {
  allIn,
  mountInCatalogue,
  type MountedScreen,
} from "../support/render-with-intl";
import { mountDetail, type MountedDetail } from "./cabinet-detail-harness";
import { pageOf } from "./dashboard-state-fixture";
import { inMemoryPriceDraftClient } from "./in-memory-price-draft-client";
import { ALL_RULE_IDS, ruleIn } from "./qa-m10-u3-support";
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const MANUFACTURER_RULE_IDS = ALL_RULE_IDS.filter(
  (ruleId) => ruleIn(SAMPLE_PRICE_BOOK, ruleId).suppliedBy !== "customer",
);

let list: MountedScreen | undefined;
let detail: MountedDetail | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  detail?.unmount();
  list?.unmount();
  detail = undefined;
  list = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

async function mountList(): Promise<HTMLElement> {
  const page = pageOf();
  list = mountInCatalogue(
    createElement(CabinetListEditor, {
      locale: "ro",
      context: contextOf("administrator", ["kitchens", "cabinets", "publish"]),
      page,
      client: inMemoryPriceDraftClient(page.state).client,
    }),
    "ro",
  );
  await flushPromises(5);
  return list.container;
}

function rowOf(container: HTMLElement, ruleId: string): HTMLElement {
  const found = allIn(container, '[data-testid="cabinet-row"]').find(
    (row) => row.dataset.ruleId === ruleId,
  );
  if (found === undefined) throw new Error(`no row for ${ruleId}`);
  return found;
}

function numbersIn(text: string): number[] {
  return (text.match(/\d+/g) ?? []).map(Number);
}

describe("the list's widths and the page's dimensions, rule by rule", () => {
  it.each(ALL_RULE_IDS)(
    "%s: the list row and the page name the same default width, the same range or sizes, and both or neither call the default proposed",
    async (ruleId) => {
      const container = await mountList();
      const widthCell = rowOf(container, ruleId).querySelector(
        '[class*="rowWidth"]',
      );
      detail = await mountDetail(ruleId);
      const terms = allIn(detail.container, "dl dt");
      const valueOf = (label: string) =>
        terms.find((term) => term.textContent.includes(label))
          ?.nextElementSibling?.textContent;
      const defaultTerm = terms.find((term) =>
        term.textContent.includes(
          roCopy("priceDashboard.cabinet.defaultWidth"),
        ),
      );
      const listText = widthCell?.textContent ?? "";
      const proposed = roCopy("priceDashboard.cabinets.proposed");

      const defaultMm = numbersIn(
        valueOf(roCopy("priceDashboard.cabinet.defaultWidth")) ?? "",
      )[0];
      expect(defaultMm).toBeDefined();
      expect(
        listText.includes(proposed),
        "the list and the page disagree on whether the default is only proposed",
      ).toBe(defaultTerm?.textContent.includes(proposed));
      const minMm = valueOf(roCopy("priceDashboard.cabinet.minWidth"));
      if (minMm === undefined) {
        const sizes = numbersIn(
          valueOf(roCopy("priceDashboard.cabinet.availableWidths")) ?? "",
        );
        expect(numbersIn(listText).filter((mm) => sizes.includes(mm))).toEqual(
          sizes,
        );
      } else {
        const maxMm = valueOf(roCopy("priceDashboard.cabinet.maxWidth"));
        expect(listText).toContain(
          roCopy("priceDashboard.cabinets.widthRange", {
            minMm: numbersIn(minMm)[0] ?? 0,
            maxMm: numbersIn(maxMm ?? "")[0] ?? 0,
          }),
        );
        expect(listText).toContain(
          roCopy("priceDashboard.cabinets.widthDefault", {
            widthMm: defaultMm ?? 0,
          }),
        );
      }
    },
  );

  it.each(MANUFACTURER_RULE_IDS)(
    "%s: the price the list draws at the default size is a price the page's table draws for the default material",
    async (ruleId) => {
      const container = await mountList();
      const listed = rowOf(container, ruleId).querySelector(
        '[data-testid="cabinet-price"]',
      )?.textContent;
      detail = await mountDetail(ruleId);
      const cells = allIn(detail.container, 'tbody td[data-role="active"]').map(
        (cell) => cell.textContent.trim(),
      );

      expect(listed).toBeDefined();
      const figure = /^\d[\d\s]*lei/.exec(listed ?? "")?.[0];
      expect(figure, listed).toBeDefined();
      expect(cells).toContain(figure);
    },
  );
});
