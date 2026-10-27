// @vitest-environment happy-dom
//
// Adversarial QA for M10 wave R1, criterion R-b: with no active version "the price bar, the account card and D10B's current
// estimate show no figure; the contact route refuses; nothing renders 0". Every client price surface is mounted under the
// root a page hands it when no book could be read, beside the same surface under a book, so a surface that shows no figure
// because it is broken cannot pass for one that shows none because it was told there is no book.
//
// A surface that THROWS with no book is a finding, not a refusal: there is no error boundary in the application, so a
// throw while rendering is the customer's whole page.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { createElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { describeStaffSummaryRows } from "@/staff/staff-kitchen-view";
import { PriceBar } from "@/price/price-bar";
import { NO_PRICE_BOOK } from "@/price/price-book-root";
import { useReview } from "@/review/use-review";
import { usePanelView } from "@/panel/use-panel-view";
import { GlobalSettings } from "@/settings/global-settings";
import { useConfiguratorStore } from "@/store/configurator-store";
import { useTopBarFit } from "@/app/configurator/configure/use-top-bar-fit";
import { createTranslator } from "next-intl";
import { resolveContent, resolveStaffKitchenCopy } from "@/i18n/content";

import roMessages from "../../src/messages/ro.json";
import {
  mountInCatalogue,
  type MountedScreen,
} from "../support/render-with-intl";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

const DESIGN_ID = "dom-test-design";
const NO_VALUE = "—";
const A_PRICE = /\d[\d\s]*(MDL|lei)/u;

let screen: MountedScreen | undefined;

beforeEach(() => {
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: DESIGN_ID,
    revision: "1",
    canWrite: true,
  });
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function mountUnder(
  element: ReactElement,
  priceBook: typeof NO_PRICE_BOOK | typeof SAMPLE_PRICE_ROOT,
): MountedScreen {
  screen = mountInCatalogue(element, "ro", priceBook);
  return screen;
}

/** What a hook returned on a mount under the given root, as JSON text. */
function probedAs(
  useHook: () => unknown,
  priceBook: typeof NO_PRICE_BOOK | typeof SAMPLE_PRICE_ROOT,
): string {
  let seen: unknown;
  function Probe() {
    seen = useHook();
    return null;
  }
  mountUnder(createElement(Probe), priceBook);
  screen?.unmount();
  screen = undefined;
  return JSON.stringify(seen);
}

describe("the surfaces that draw a figure draw none without a book", () => {
  it("the price bar draws no amount and no zero, where under a book it draws one", () => {
    const withBook = mountUnder(createElement(PriceBar), SAMPLE_PRICE_ROOT);
    const withBookText = withBook.container.textContent;
    withBook.unmount();
    screen = undefined;

    const without = mountUnder(createElement(PriceBar), NO_PRICE_BOOK);

    expect(withBookText).toMatch(A_PRICE);
    expect(without.container.textContent).not.toMatch(A_PRICE);
    expect(without.container.textContent).not.toMatch(/\b0\b/);
  });

  it("the price bar is absent altogether, not a bar with nothing in it", () => {
    const without = mountUnder(createElement(PriceBar), NO_PRICE_BOOK);

    expect(without.container.querySelector('[data-testid="price-bar"]')).toBe(
      null,
    );
  });

  it("the panel's footer and the review show no figure", () => {
    const [firstBody] = KITCHEN_L_DESIGN.placements;
    if (firstBody === undefined) throw new Error("the design has no body");
    useConfiguratorStore
      .getState()
      .select({ kind: "placement", id: firstBody.id });
    for (const [name, useHook] of [
      ["the panel", usePanelView],
      ["the review", useReview],
    ] as const) {
      const withBook = probedAs(useHook, SAMPLE_PRICE_ROOT);
      const without = probedAs(useHook, NO_PRICE_BOOK);

      expect(withBook, `${name} has a figure under a book`).toMatch(A_PRICE);
      expect(without, `${name} has none without`).not.toMatch(A_PRICE);
    }
  });

  it("the staff's estimate row is the no-value dash, never a zero", () => {
    const translate = createTranslator({ locale: "ro", messages: roMessages });
    const rowsUnder = (
      priceBook: typeof NO_PRICE_BOOK | typeof SAMPLE_PRICE_ROOT,
    ) =>
      describeStaffSummaryRows({
        design: KITCHEN_L_DESIGN,
        priceBook,
        copy: resolveStaffKitchenCopy(translate),
        content: resolveContent(translate),
        noValue: NO_VALUE,
      });

    const priceRow = (rows: ReturnType<typeof rowsUnder>) =>
      rows.find(({ key }) => key === "price");

    expect(priceRow(rowsUnder(SAMPLE_PRICE_ROOT))?.value).toMatch(A_PRICE);
    expect(priceRow(rowsUnder(NO_PRICE_BOOK))?.value).toBe(NO_VALUE);
    expect(priceRow(rowsUnder(NO_PRICE_BOOK))?.sub).toBeUndefined();
  });
});

describe("the editor's own surfaces, without a book (deferred to Q3, ruling R1-Q1, 2026-10-27)", () => {
  // `useWholeKitchenTierOffer` throws `UnreadablePriceBookError` with no book (price-book-root.ts: "what the settings sheet
  // should show when no book can be read is an open product question"). Both the settings pill and the top bar's fit hook
  // call it, and the application has no error boundary, so the editor route renders no page at all. Deferred to Q3 (ruling
  // R1-Q1, 2026-10-27): R-b's editor clause is recorded unmet at R1's merge, and Q3 gives the sheet a "no tier offer" state.
  // Skipped, not deleted, so they come back red-or-green when Q3 lands.
  it.skip("the settings pill renders", () => {
    expect(() =>
      mountUnder(
        createElement(GlobalSettings, { visibleCount: 4 }),
        NO_PRICE_BOOK,
      ),
    ).not.toThrow();
  });

  it.skip("the top bar's fit hook runs", () => {
    function Probe() {
      useTopBarFit();
      return null;
    }

    expect(() => mountUnder(createElement(Probe), NO_PRICE_BOOK)).not.toThrow();
  });
});
