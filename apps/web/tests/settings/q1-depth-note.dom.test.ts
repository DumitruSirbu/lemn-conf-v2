// @vitest-environment happy-dom
//
// **M10 Q1-b, the settings half: the depth control's note names the published percentage.**
//
// Two books that differ only in `depthRule.deepCabinetPercent`, with figures the sample does not use. The note is the
// priced sentence for the deep depth whichever depth is selected, and the retired note is nowhere on the sheet.
import {
  KITCHEN_L_DESIGN,
  DEEP_CABINET_DEPTH_MM,
} from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { PriceBookProvider } from "@/price/price-book-provider";
import { GlobalSettings } from "@/settings/global-settings";
import { useConfiguratorStore } from "@/store/configurator-store";

import { rootPublishingDeepCabinetPercent } from "../support/book-with-deep-cabinet-percent";
import { ro } from "../support/romanian-content";

const FIRST_PUBLISHED_PERCENT = 7;
const SECOND_PUBLISHED_PERCENT = 23;
const VISIBLE_SETTING_COUNT = 3;

let container: HTMLElement | undefined;
let root: Root | undefined;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
});

function openSettingsPublishing(deepCabinetPercent: number): HTMLElement {
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: "q1-depth-note",
    revision: "1",
    canWrite: true,
  });
  container = document.createElement("main");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(PriceBookProvider, {
        root: rootPublishingDeepCabinetPercent(deepCabinetPercent),
        children: createElement(GlobalSettings, {
          visibleCount: VISIBLE_SETTING_COUNT,
        }),
      }),
    );
  });
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>(
        '[data-testid="global-settings-trigger"]',
      )
      ?.click();
  });
  return container;
}

function depthNoteOf(dom: HTMLElement): string | undefined {
  return (
    dom.querySelector('[data-testid="global-settings-depth-note"]')
      ?.textContent ?? undefined
  );
}

describe("the settings depth note (Q1-b)", () => {
  it.each([FIRST_PUBLISHED_PERCENT, SECOND_PUBLISHED_PERCENT])(
    "states the published %i %% for the deep depth",
    (published) => {
      const dom = openSettingsPublishing(published);

      expect(depthNoteOf(dom)).toBe(
        ro.globalSettings.depthNotePriced(DEEP_CABINET_DEPTH_MM, published),
      );
      expect(depthNoteOf(dom)).toContain(`${String(published)} %`);
    },
  );

  it("says the depth does not change the price when the rule publishes 0 %", () => {
    const dom = openSettingsPublishing(0);

    expect(depthNoteOf(dom)).toBe(
      ro.globalSettings.depthNotePriced(DEEP_CABINET_DEPTH_MM, 0),
    );
    expect(depthNoteOf(dom)).not.toContain("0 %");
  });

  it("no longer renders the retired note", () => {
    const dom = openSettingsPublishing(FIRST_PUBLISHED_PERCENT);

    expect(dom.textContent).not.toContain(ro.globalSettings.depthNote);
  });
});
