// @vitest-environment happy-dom
//
// Adversarial QA for M10 Q1c on what the two row screens actually paint. The review screen and the breakdown sheet are
// rendered whole, for the seeded kitchens at both depths, in both shipped locales, and every painted amount cell is read
// back from the DOM (spaces stripped, times a hundred) and compared with the priced line it belongs to: the row shows
// the line's own amount (a multiple of ten lei, so an equality) and the figure shows the thousand round-up of the total.
// The expected side is BigInt arithmetic written here, not the formatter or the helpers the wave rewrote.
import {
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  type Design,
  type PricedDesign,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/review/review-scene", () => ({
  ReviewScene: () => createElement("div"),
}));
vi.mock("@/app/configurator/configure/locale-menu", () => ({
  LocaleMenu: () => createElement("div"),
}));
vi.mock("@/components/webgl-unavailable", () => ({
  WebGLUnavailable: () => createElement("main"),
}));

import { ReviewScreen } from "@/app/d/[id]/review/review-screen";
import type { Content } from "@/i18n/content";
import { PriceBookProvider } from "@/price/price-book-provider";
import { PriceBreakdown } from "@/price/price-breakdown";
import { ConfiguratorSnapshotProvider } from "@/store/configurator-snapshot";
import { useConfiguratorStore } from "@/store/configurator-store";

import {
  CATALOGUES,
  contentFor,
  type Catalogue,
  type CatalogueLocale,
} from "../support/catalogues";
import {
  builtDeep,
  pricedKitchenAtPercent,
  pricedOf,
} from "../support/deep-priced-kitchens";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import { VARIED_U_ARM } from "../support/varied-kitchens";
import { sendableKitchensOf } from "../lib/server/mail/lead-notice-fixtures";

const BANI_PER_LEU = 100;
const SAMPLE_PERCENT = SAMPLE_PRICE_BOOK.depthRule.deepCabinetPercent;

const GENERATED_U: Design = (() => {
  const [first] = sendableKitchensOf(VARIED_U_ARM);
  if (first === undefined) throw new Error("the U arm has a sendable kitchen");
  return first.design;
})();

const KITCHENS: readonly (readonly [string, Design])[] = [
  ["the seeded L at 600 mm", KITCHEN_L_DESIGN],
  ["the seeded L at 700 mm", builtDeep(KITCHEN_L_DESIGN)],
  ["a generated U at 600 mm", GENERATED_U],
  ["a generated U at 700 mm", builtDeep(GENERATED_U)],
];

function grouped(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function toTenLei(bani: number): string {
  return grouped(String(((BigInt(bani) + 999n) / 1_000n) * 10n));
}

function toThousandLei(bani: number): string {
  return grouped(String(((BigInt(bani) + 99_999n) / 100_000n) * 1000n));
}

function baniOf(text: string): number {
  return Number(text.replaceAll(" ", "")) * BANI_PER_LEU;
}

function expectedAmountCell(
  line: PricedDesign["lines"][number],
  content: Content,
): string {
  if (line.kind === "cabinet" && line.suppliedBy === "customer") {
    return content.priceBreakdown.notIncluded;
  }
  return line.amountMinor === 0
    ? content.priceBreakdown.included
    : toTenLei(line.amountMinor);
}

function expectCellsToBeThePricedLines(
  cells: readonly string[],
  priced: PricedDesign,
  content: Content,
  surface: string,
): void {
  expect([...cells].sort(), surface).toEqual(
    priced.lines.map((line) => expectedAmountCell(line, content)).sort(),
  );
  const numeric = cells.filter(
    (cell) =>
      cell !== content.priceBreakdown.included &&
      cell !== content.priceBreakdown.notIncluded,
  );
  const pricedAmounts = priced.lines
    .filter(
      (line) =>
        line.amountMinor > 0 &&
        !(line.kind === "cabinet" && line.suppliedBy === "customer"),
    )
    .map((line) => line.amountMinor)
    .sort((first, second) => first - second);

  expect(
    numeric.map(baniOf).sort((first, second) => first - second),
    surface,
  ).toEqual(pricedAmounts);
}

// ---------------------------------------------------------------------------------------------------------------
// The review screen

function reviewMarkup(
  design: Design,
  locale: CatalogueLocale,
  messages: Catalogue,
): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    createElement(PriceBookProvider, {
      root: SAMPLE_PRICE_ROOT,
      children: createElement(NextIntlClientProvider, {
        locale,
        messages,
        timeZone: "Europe/Chisinau",
        children: createElement(ConfiguratorSnapshotProvider, {
          loaded: {
            design,
            designId: "design-under-review",
            revision: "1",
            canWrite: false,
          },
          children: createElement(ReviewScreen, {
            designId: "design-under-review",
          }),
        }),
      }),
    }),
  );
  return container;
}

function textsOf(dom: ParentNode, testId: string): string[] {
  return [...dom.querySelectorAll(`[data-testid="${testId}"]`)].map(
    (element) => element.textContent,
  );
}

describe.each(CATALOGUES)("the review screen, in %s", (locale, messages) => {
  const content = contentFor(locale, messages);

  it.each(KITCHENS)(
    "paints %s: each amount cell is a priced line, the figure is the thousand round-up",
    (_name, design) => {
      const page = reviewMarkup(design, locale, messages);
      const priced = pricedOf(pricedKitchenAtPercent(design, SAMPLE_PERCENT));
      const figure = page.querySelector('[data-section="figure"]');

      expectCellsToBeThePricedLines(
        textsOf(page, "review-row-amount"),
        priced,
        content,
        "review",
      );
      expect(figure?.textContent).toContain(
        content.price.amountWithCurrency(toThousandLei(priced.totalMinor)),
      );
      expect(figure?.textContent).toContain(content.price.startingPrefix);
    },
  );

  it("paints no row in the thousand: at least one amount cell is not a whole thousand lei", () => {
    const page = reviewMarkup(KITCHEN_L_DESIGN, locale, messages);
    const numeric = textsOf(page, "review-row-amount")
      .filter((cell) => /\d/.test(cell))
      .map(baniOf);

    expect(numeric.length).toBeGreaterThan(5);
    expect(numeric.some((bani) => bani % (BANI_PER_LEU * 1000) !== 0)).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The breakdown sheet

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
});

function openBreakdown(
  design: Design,
  locale: CatalogueLocale,
  messages: Catalogue,
): HTMLElement {
  useConfiguratorStore.getState().hydrate({
    design,
    designId: "q1c-rendered-rows",
    revision: "1",
    canWrite: true,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(PriceBookProvider, {
        root: SAMPLE_PRICE_ROOT,
        children: createElement(NextIntlClientProvider, {
          locale,
          messages,
          timeZone: "Europe/Chisinau",
          children: createElement(PriceBreakdown),
        }),
      }),
    );
  });
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>(
        '[data-testid="price-breakdown-trigger"]',
      )
      ?.click();
  });
  return container;
}

describe.each(CATALOGUES)("the breakdown sheet, in %s", (locale, messages) => {
  const content = contentFor(locale, messages);

  it.each(KITCHENS)(
    "paints %s: each amount cell is a priced line, the figure is the thousand round-up",
    (_name, design) => {
      const dom = openBreakdown(design, locale, messages);
      const priced = pricedOf(pricedKitchenAtPercent(design, SAMPLE_PERCENT));

      expectCellsToBeThePricedLines(
        [
          ...textsOf(dom, "breakdown-row-amount"),
          ...textsOf(dom, "breakdown-depth-amount"),
        ],
        priced,
        content,
        "breakdown",
      );
      expect(textsOf(dom, "price-breakdown-figure")).toEqual([
        content.price.amountWithCurrency(toThousandLei(priced.totalMinor)),
      ]);
    },
  );
});
