// @vitest-environment happy-dom
//
// Q1b-a on the screen: at 700 mm the review lists the depth line between the material row and what follows it,
// worded with the percent of the book the price was computed from, and at 600 mm it lists none. The scene, the locale
// menu and the editor's exit screen are stubs, as in the review screen's own test.
import {
  DEEP_CABINET_DEPTH_MM,
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  type Design,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
import { PriceBookProvider } from "@/price/price-book-provider";
import { ConfiguratorSnapshotProvider } from "@/store/configurator-snapshot";

import roMessages from "../../src/messages/ro.json";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import { ro } from "../support/romanian-content";

const DEEP_KITCHEN: Design = {
  ...KITCHEN_L_DESIGN,
  settings: {
    ...KITCHEN_L_DESIGN.settings,
    cabinetDepthMm: DEEP_CABINET_DEPTH_MM,
  },
};

function renderedUnder(
  design: Design,
  deepCabinetPercent: number,
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
        locale: "ro",
        messages: roMessages,
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

function wholeKitchenLabelsOf(page: HTMLElement): string[] {
  const list = page.querySelector('[data-testid="review-whole-kitchen"]');
  return [
    ...(list?.querySelectorAll('[data-testid="review-row-label"]') ?? []),
  ].map(
    (label) =>
      label.querySelector('[data-testid="review-row-name"]')?.textContent ??
      label.textContent,
  );
}

describe("the review screen's depth row", () => {
  it("is listed at 700 mm directly after the material row, with the percent of the book the price came from", () => {
    const labels = wholeKitchenLabelsOf(renderedUnder(DEEP_KITCHEN, 12));
    const depthLabel = ro.priceBreakdown.depthLine(DEEP_CABINET_DEPTH_MM, 12);
    const depthAt = labels.indexOf(depthLabel);

    expect(depthAt).toBeGreaterThan(0);
    expect(labels[depthAt - 1]).toContain(
      ro.priceBreakdown.wholeKitchenCategories.material,
    );
  });

  it("shows each published percent: two different values give two different lines", () => {
    const seven = wholeKitchenLabelsOf(renderedUnder(DEEP_KITCHEN, 7));
    const twenty = wholeKitchenLabelsOf(renderedUnder(DEEP_KITCHEN, 20));

    expect(seven).toContain(
      ro.priceBreakdown.depthLine(DEEP_CABINET_DEPTH_MM, 7),
    );
    expect(twenty).toContain(
      ro.priceBreakdown.depthLine(DEEP_CABINET_DEPTH_MM, 20),
    );
    expect(seven).not.toEqual(twenty);
  });

  it("sets the scope words under the depth label at 700 mm, and prints them nowhere at the default depth", () => {
    const scope = ro.priceBreakdown.depthLineScope;
    const deep = renderedUnder(DEEP_KITCHEN, 12);
    const depthRow = [
      ...deep.querySelectorAll('[data-testid="review-whole-kitchen"] li'),
    ].find((row) => row.textContent.includes(String(DEEP_CABINET_DEPTH_MM)));

    expect(
      depthRow?.querySelector('[data-testid="review-row-facts"]')?.textContent,
    ).toBe(scope);
    expect(renderedUnder(KITCHEN_L_DESIGN, 12).textContent).not.toContain(
      scope,
    );
  });

  it("is absent at the default depth, where no cabinet deepens", () => {
    const labels = wholeKitchenLabelsOf(renderedUnder(KITCHEN_L_DESIGN, 12));

    expect(labels.length).toBeGreaterThan(0);
    expect(
      labels.some((label) => label.includes(String(DEEP_CABINET_DEPTH_MM))),
    ).toBe(false);
  });
});
