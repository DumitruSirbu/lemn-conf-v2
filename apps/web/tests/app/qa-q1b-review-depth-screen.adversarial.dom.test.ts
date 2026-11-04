// @vitest-environment happy-dom
//
// Adversarial QA for Q1b on the rendered review screen. At 700 mm, whatever percentage the book states (0 included), the
// whole-kitchen list holds the depth row right after the material row, with the scope words under its label alone, and
// the amounts the screen prints are the priced lines' amounts, one for each line the total counts. At the default depth
// the screen is its golden's markup, byte for byte (written by 0abdd0d2's screen; its row amounts were regenerated for the
// owner ruling of 2026-10-28, M10 Q1c, which shows a line to the ten lei, the markup being otherwise the base's).
import {
  KITCHEN_L_DESIGN,
  MAX_DEEP_CABINET_PERCENT,
  SAMPLE_PRICE_BOOK,
  type Design,
  type PriceLine,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

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
import { ConfiguratorSnapshotProvider } from "@/store/configurator-snapshot";

import {
  CATALOGUES,
  contentFor,
  type Catalogue,
  type CatalogueLocale,
} from "../support/catalogues";
import {
  builtDeep,
  depthLineOf,
  pricedKitchenAtPercent,
  pricedOf,
  printedAmountOf,
  required,
  sumOfLines,
} from "../support/deep-priced-kitchens";
import roMessages from "../../src/messages/ro.json";
import { ro } from "../support/romanian-content";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

const DEEP_KITCHEN: Design = builtDeep(KITCHEN_L_DESIGN);
const MATERIAL_KEY = "kitchen:material";

function renderedUnder(
  design: Design,
  deepCabinetPercent: number,
  locale: CatalogueLocale = "ro",
  messages: Catalogue = roMessages,
): HTMLElement {
  const root = {
    ...SAMPLE_PRICE_ROOT,
    book: { ...SAMPLE_PRICE_BOOK, depthRule: { deepCabinetPercent } },
  };
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    createElement(PriceBookProvider, {
      root,
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

function amountOf(row: Element): string {
  return (
    row.querySelector('[data-testid="review-row-amount"]')?.textContent ?? ""
  );
}

function nameOf(row: Element): string {
  const label = row.querySelector('[data-testid="review-row-label"]');
  return (
    label?.querySelector('[data-testid="review-row-name"]')?.textContent ??
    label?.textContent ??
    ""
  );
}

function wholeKitchenRowsOf(page: HTMLElement): Element[] {
  return [
    ...page.querySelectorAll(
      '[data-testid="review-whole-kitchen"] [data-testid="review-row"]',
    ),
  ];
}

/** The lines the whole-kitchen list holds, in the order it must read them: the depth line right after the material one. */
function expectedWholeKitchenLines(lines: readonly PriceLine[]): PriceLine[] {
  const unplaced = lines.filter((line) => line.kind !== "cabinet");
  const withoutDepth = unplaced.filter((line) => line.kind !== "depth");
  const depth = unplaced.filter((line) => line.kind === "depth");
  const materialAt = withoutDepth.findIndex(
    (line) => line.lineId === MATERIAL_KEY,
  );
  return [
    ...withoutDepth.slice(0, materialAt + 1),
    ...depth,
    ...withoutDepth.slice(materialAt + 1),
  ];
}

describe.each(CATALOGUES)(
  "the review screen at 700 mm, in %s",
  (locale, messages) => {
    const content: Content = contentFor(locale, messages);

    it.each([0, 1, 12, 99, MAX_DEEP_CABINET_PERCENT])(
      "lists the whole-kitchen lines in order with the depth line after the material one, under a book stating %i %%",
      (percent) => {
        const page = renderedUnder(DEEP_KITCHEN, percent, locale, messages);
        const priced = pricedOf(pricedKitchenAtPercent(DEEP_KITCHEN, percent));
        const rows = wholeKitchenRowsOf(page);
        const expected = expectedWholeKitchenLines(priced.lines);

        expect(rows.map(amountOf)).toEqual(
          expected.map((line) => printedAmountOf(line, content)),
        );
        const names = rows.map(nameOf);
        const depthAt = names.indexOf(
          content.priceBreakdown.depthLine(
            depthLineOf(priced).depthMm,
            percent,
          ),
        );
        const materialAt = expected.findIndex(
          (line) => line.lineId === MATERIAL_KEY,
        );

        expect(depthAt).toBe(materialAt + 1);
        expect(names.filter((name) => name === names[depthAt])).toHaveLength(1);
      },
    );

    it("prints each line the total counts once, and the priced amounts add to the stored total", () => {
      const page = renderedUnder(DEEP_KITCHEN, 12, locale, messages);
      const priced = pricedOf(pricedKitchenAtPercent(DEEP_KITCHEN, 12));
      const printed = [
        ...page.querySelectorAll('[data-testid="review-row"]'),
      ].map(amountOf);

      expect([...printed].sort()).toEqual(
        priced.lines.map((line) => printedAmountOf(line, content)).sort(),
      );
      expect(sumOfLines(priced)).toBe(priced.totalMinor);
    });

    it("sets the scope words under the depth label and under no other whole-kitchen label", () => {
      const page = renderedUnder(DEEP_KITCHEN, 12, locale, messages);
      const withFacts = wholeKitchenRowsOf(page).filter(
        (row) => row.querySelector('[data-testid="review-row-facts"]') !== null,
      );

      expect(withFacts).toHaveLength(1);
      expect(
        withFacts[0]?.querySelector('[data-testid="review-row-facts"]')
          ?.textContent,
      ).toBe(content.priceBreakdown.depthLineScope);
      expect(nameOf(required(withFacts[0], "the row with facts"))).toBe(
        content.priceBreakdown.depthLine(700, 12),
      );
    });

    it("prints the depth row at 0 % as a row that is there and reads the published word for nothing to add", () => {
      const page = renderedUnder(DEEP_KITCHEN, 0, locale, messages);
      const depthRow = wholeKitchenRowsOf(page).find((row) =>
        nameOf(row).includes(content.priceBreakdown.depthLine(700, 0)),
      );

      expect(depthRow).toBeDefined();
      expect(amountOf(required(depthRow, "the depth row"))).toBe(
        content.priceBreakdown.included,
      );
    });
  },
);

describe("the review screen at the default depth", () => {
  it("renders the golden markup byte for byte (classes stripped; 0abdd0d2's screen, amounts regenerated for Q1c)", () => {
    const page = renderedUnder(KITCHEN_L_DESIGN, 12);
    const markup = page.innerHTML
      .replace(/ class="[^"]*"/g, "")
      .replace(/></g, ">\n<");

    expect(markup).toBe(
      readFileSync(
        join(
          import.meta.dirname,
          "../review/fixtures/review-screen-default-depth.golden.html",
        ),
        "utf8",
      ),
    );
  });

  it("prints no depth words and no scope facts in the whole-kitchen list", () => {
    const page = renderedUnder(KITCHEN_L_DESIGN, 12);

    expect(
      page.querySelector(
        '[data-testid="review-whole-kitchen"] [data-testid="review-row-facts"]',
      ),
    ).toBeNull();
    expect(page.textContent).not.toContain(ro.priceBreakdown.depthLineScope);
    expect(page.textContent).not.toContain(
      ro.priceBreakdown.depthLine(700, 12),
    );
  });
});
