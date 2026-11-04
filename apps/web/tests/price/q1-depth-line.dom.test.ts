// @vitest-environment happy-dom
//
// **M10 Q1-b: the depth line's percentage is the published rule's value, and the amount is the priced line's.**
//
// The sheet is mounted under two books that differ only in `depthRule.deepCabinetPercent`, with figures the sample does
// not use, so a percentage written into the component, the model or the copy cannot satisfy both. The amount beside it
// is read back from the priced result through the same rounding helper the model uses; nothing here recomputes it.
// At 600 mm the line does not exist (P2-c).
import {
  buildKitchenLBodyCatalog,
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  type Design,
} from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { PriceBookProvider } from "@/price/price-book-provider";
import { priceAgainstBook } from "@/price/price-book-root";
import { PriceBreakdown } from "@/price/price-breakdown";
import { describeLineAmount } from "@/price/starting-price";
import { useConfiguratorStore } from "@/store/configurator-store";

import { rootPublishingDeepCabinetPercent } from "../support/book-with-deep-cabinet-percent";
import { ro } from "../support/romanian-content";

const FIRST_PUBLISHED_PERCENT = 7;
const SECOND_PUBLISHED_PERCENT = 23;

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
});

function designBuiltAt(cabinetDepthMm: number): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, cabinetDepthMm },
  };
}

/** The open breakdown of a kitchen built at `cabinetDepthMm`, under a book publishing `deepCabinetPercent`. */
function openBreakdown(cabinetDepthMm: number, deepCabinetPercent: number) {
  const design = designBuiltAt(cabinetDepthMm);
  useConfiguratorStore.getState().hydrate({
    design,
    designId: "q1-depth-line",
    revision: "1",
    canWrite: true,
  });
  const priceBook = rootPublishingDeepCabinetPercent(deepCabinetPercent);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(PriceBookProvider, {
        root: priceBook,
        children: createElement(PriceBreakdown),
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
  const priced = priceAgainstBook(
    priceBook,
    design,
    buildKitchenLBodyCatalog(cabinetDepthMm),
  );
  if (!priced.ok) throw new Error("the fixture kitchen should price");
  return { priced: priced.priced, dom: container };
}

function textOf(dom: HTMLElement, testId: string): string | undefined {
  return (
    dom.querySelector(`[data-testid="${testId}"]`)?.textContent ?? undefined
  );
}

describe("the depth line in the customer breakdown (Q1-b)", () => {
  it.each([FIRST_PUBLISHED_PERCENT, SECOND_PUBLISHED_PERCENT])(
    "words the published %i %% and no other figure",
    (published) => {
      const { dom } = openBreakdown(DEEP_CABINET_DEPTH_MM, published);

      expect(textOf(dom, "breakdown-depth-label")).toBe(
        ro.priceBreakdown.depthLine(DEEP_CABINET_DEPTH_MM, published),
      );
      expect(textOf(dom, "breakdown-depth-label")).toContain(
        `${String(published)} %`,
      );
      expect(textOf(dom, "breakdown-depth-label")).not.toContain(
        String(SAMPLE_PRICE_BOOK.depthRule.deepCabinetPercent),
      );
    },
  );

  it("shows both published values distinctly: the two books give two different lines", () => {
    const first = openBreakdown(DEEP_CABINET_DEPTH_MM, FIRST_PUBLISHED_PERCENT);
    const firstLabel = textOf(first.dom, "breakdown-depth-label");
    act(() => {
      root?.unmount();
    });
    first.dom.remove();
    const second = openBreakdown(
      DEEP_CABINET_DEPTH_MM,
      SECOND_PUBLISHED_PERCENT,
    );

    expect(textOf(second.dom, "breakdown-depth-label")).not.toBe(firstLabel);
  });

  it("prints the priced depth line's own amount and the scope words", () => {
    const { priced, dom } = openBreakdown(
      DEEP_CABINET_DEPTH_MM,
      SECOND_PUBLISHED_PERCENT,
    );
    const line = priced.lines.find((candidate) => candidate.kind === "depth");

    expect(line?.amountMinor).toBeGreaterThan(0);
    expect(textOf(dom, "breakdown-depth-amount")).toBe(
      describeLineAmount(line?.amountMinor ?? Number.NaN),
    );
    expect(textOf(dom, "breakdown-depth-scope")).toBe(
      ro.priceBreakdown.depthLineScope,
    );
  });

  it("is printed right after the material row, beside it", () => {
    const { dom } = openBreakdown(
      DEEP_CABINET_DEPTH_MM,
      FIRST_PUBLISHED_PERCENT,
    );
    const section = dom.querySelector(
      '[data-testid="price-breakdown-whole-kitchen"]',
    );
    const rows = Array.from(section?.children ?? []).map(
      (row) => row.getAttribute("data-testid") ?? "",
    );
    const depthAt = rows.indexOf("breakdown-depth-row");

    expect(depthAt).toBeGreaterThan(0);
    expect(rows[depthAt - 1]).toBe("breakdown-row");
    expect(
      section?.children[depthAt - 1]?.textContent.startsWith(
        ro.priceBreakdown.wholeKitchenCategories.material,
      ),
    ).toBe(true);
  });

  it("has no depth line at 600 mm (P2-c)", () => {
    const { dom } = openBreakdown(
      DEFAULT_CABINET_DEPTH_MM,
      SECOND_PUBLISHED_PERCENT,
    );

    expect(dom.querySelector('[data-testid="breakdown-depth-row"]')).toBeNull();
    expect(dom.textContent).not.toContain(ro.priceBreakdown.depthLineScope);
  });
});
