// @vitest-environment happy-dom
//
// **The kitchen handle row through a real render path**: real React, the real store, the real price root. Only the
// copy hook is replaced. `kitchen-stage*.test.ts` mock `useMemo`, so a model that only works when memoisation is
// bypassed would pass there; here a press has to travel store -> memoised price -> rendered figure.
import {
  KITCHEN_L_DESIGN,
  type CatalogueAvailability,
} from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { PriceBookProvider } from "@/price/price-book-provider";
import type { ActivePriceBook } from "@/price/price-book-root";
import { usePricedDesign } from "@/price/use-priced-design";
import { GlobalSettings } from "@/settings/global-settings";
import { useConfiguratorStore } from "@/store/configurator-store";

import { ro } from "../support/romanian-content";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

const VISIBLE_SETTING_COUNT = 3;

let container: HTMLElement;
let root: Root;
let caseNumber = 0;

/** The bar's own source, read where the bar reads it, so a stale memo shows here as a stale number. */
function ShownTotal() {
  const pricing = usePricedDesign();
  return createElement(
    "output",
    { "data-testid": "shown-total" },
    pricing.ok ? String(pricing.priced.totalMinor) : "no price",
  );
}

function mountUnder(priceRoot: ActivePriceBook): void {
  act(() => {
    root.render(
      createElement(PriceBookProvider, {
        root: priceRoot,
        children: [
          createElement(GlobalSettings, {
            key: "settings",
            visibleCount: VISIBLE_SETTING_COUNT,
          }),
          createElement(ShownTotal, { key: "total" }),
        ],
      }),
    );
  });
}

function rootWithDisabled(
  disabled: CatalogueAvailability["disabled"],
): ActivePriceBook {
  return {
    ...SAMPLE_PRICE_ROOT,
    availability: { revision: "1", disabled },
  };
}

beforeEach(() => {
  // An applied choice is a save, and the save is a real request: held open and never answered.
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  // A fresh id per case: `hydrate` restores a write still waiting for its id, and a saved choice is one.
  caseNumber += 1;
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: `q2-kitchen-handle-row-${String(caseNumber)}`,
    revision: "1",
    canWrite: true,
  });
  container = document.createElement("main");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

function click(selector: string): void {
  const element = container.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`nothing matches ${selector}`);
  act(() => {
    element.click();
  });
}

function openSheet(): void {
  click('[data-testid="global-settings-trigger"]');
}

function handleRadio(handle: string): HTMLInputElement {
  const radio = container.querySelector<HTMLInputElement>(
    `[data-testid="global-settings-handle-group"] input[value="${handle}"]`,
  );
  if (radio === null) throw new Error(`no ${handle} option on the sheet`);
  return radio;
}

function pressHandle(handle: string): void {
  const radio = handleRadio(handle);
  act(() => {
    radio.click();
  });
}

function shownTotal(): string | null {
  return (
    container.querySelector('[data-testid="shown-total"]')?.textContent ?? null
  );
}

function storedHandle(): string | undefined {
  return useConfiguratorStore.getState().design.settings?.handle;
}

describe("choosing a kitchen handle on the sheet", () => {
  it("marks the choice and writes nothing to the design or the price until the sheet is applied", () => {
    mountUnder(SAMPLE_PRICE_ROOT);
    const totalBefore = shownTotal();
    const designBefore = useConfiguratorStore.getState().design;
    openSheet();

    pressHandle("push");

    expect(handleRadio("push").checked).toBe(true);
    expect(handleRadio("steel").checked).toBe(false);
    expect(useConfiguratorStore.getState().design).toBe(designBefore);
    expect(storedHandle()).toBeUndefined();
    expect(shownTotal()).toBe(totalBefore);
  });

  it("on apply it stores the handle and the bar's total follows in the same render", () => {
    mountUnder(SAMPLE_PRICE_ROOT);
    const totalBefore = Number(shownTotal());
    openSheet();
    pressHandle("push");

    click('[data-testid="global-settings-apply"]');

    expect(storedHandle()).toBe("push");
    expect(
      container.querySelector('[data-testid="global-settings-surface"]'),
    ).toBeNull();
    // A push-to-open kitchen bills a latch for every resolved push body (H1-b), so the total rises.
    expect(Number(shownTotal())).toBeGreaterThan(totalBefore);
  });

  it("brings the total back when the handle is chosen back to a bar", () => {
    mountUnder(SAMPLE_PRICE_ROOT);
    const totalBefore = shownTotal();
    openSheet();
    pressHandle("push");
    click('[data-testid="global-settings-apply"]');

    openSheet();
    expect(handleRadio("push").checked).toBe(true);
    pressHandle("black");
    click('[data-testid="global-settings-apply"]');

    expect(storedHandle()).toBe("black");
    expect(shownTotal()).toBe(totalBefore);
  });

  it("leaves the document as found when apply is pressed with no handle touched", () => {
    mountUnder(SAMPLE_PRICE_ROOT);
    const designBefore = useConfiguratorStore.getState().design;
    openSheet();

    click('[data-testid="global-settings-apply"]');

    expect(useConfiguratorStore.getState().design).toBe(designBefore);
    expect(storedHandle()).toBeUndefined();
  });

  it("writes nothing on cancel after a handle was chosen", () => {
    mountUnder(SAMPLE_PRICE_ROOT);
    const designBefore = useConfiguratorStore.getState().design;
    openSheet();
    pressHandle("black");

    click('[data-testid="global-settings-cancel"]');

    expect(useConfiguratorStore.getState().design).toBe(designBefore);
  });
});

describe("the handles the row offers", () => {
  it("lists all three while nothing is switched off, each worded as the panel words it", () => {
    mountUnder(SAMPLE_PRICE_ROOT);
    openSheet();

    const labels = [
      ...container.querySelectorAll(
        '[data-testid="global-settings-handle-option"]',
      ),
    ].map((option) => option.textContent);

    expect(labels).toEqual([
      ro.panel.handleLabels.steel,
      ro.panel.handleLabels.black,
      ro.panel.handleLabels.push,
    ]);
  });

  it("leaves out a handle availability has switched off", () => {
    mountUnder(rootWithDisabled([{ kind: "handle", handle: "black" }]));
    openSheet();

    const labels = [
      ...container.querySelectorAll(
        '[data-testid="global-settings-handle-option"]',
      ),
    ].map((option) => option.textContent);

    expect(labels).toEqual([
      ro.panel.handleLabels.steel,
      ro.panel.handleLabels.push,
    ]);
  });

  it("draws no handle row when every handle is switched off", () => {
    mountUnder(
      rootWithDisabled([
        { kind: "handle", handle: "steel" },
        { kind: "handle", handle: "black" },
        { kind: "handle", handle: "push" },
      ]),
    );
    openSheet();

    expect(
      container.querySelector('[data-testid="global-settings-handle-group"]'),
    ).toBeNull();
  });

  it("follows a change of availability on the next render, with no reload", () => {
    mountUnder(SAMPLE_PRICE_ROOT);
    openSheet();
    expect(handleRadio("black").checked).toBe(false);

    mountUnder(rootWithDisabled([{ kind: "handle", handle: "black" }]));

    expect(
      container.querySelector(
        '[data-testid="global-settings-handle-group"] input[value="black"]',
      ),
    ).toBeNull();
  });
});
