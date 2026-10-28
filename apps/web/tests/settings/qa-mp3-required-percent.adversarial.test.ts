// @vitest-environment happy-dom
//
// Adversarial QA for the MP-3 fix round on the settings sheet: the depth note's percent now comes from
// `requireDeepCabinetPercent` (price-book-root), the one place that knows the no-book error. A missing book is raised,
// never answered with a 0 % that would say the depth is free, and the error is the one the tier offer raises (the
// behaviour the sheet had before the move). `GlobalSettings` calls the tier offer first and both raise the identical
// error, so a mount cannot tell which one threw: the function is attacked directly as well.
import { fc } from "@fast-check/vitest";
import {
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  KITCHEN_L_DESIGN,
  MAX_DEEP_CABINET_PERCENT,
} from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NO_PRICE_BOOK,
  NO_PRICE_BOOK_DETAIL,
  requireDeepCabinetPercent,
  UnreadablePriceBookError,
} from "@/price/price-book-root";
import { GlobalSettings } from "@/settings/global-settings";
import { useConfiguratorStore } from "@/store/configurator-store";

import { rootPublishingDeepCabinetPercent } from "../support/book-with-deep-cabinet-percent";
import {
  mountInCatalogue,
  type MountedScreen,
} from "../support/render-with-intl";
import { ro } from "../support/romanian-content";

const SWEEP_SEED = 20_261_029;
const VISIBLE_SETTING_COUNT = 3;

let screen: MountedScreen | undefined;

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function hydrateAt(cabinetDepthMm: number): void {
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  useConfiguratorStore.getState().hydrate({
    design: {
      ...KITCHEN_L_DESIGN,
      settings: { ...KITCHEN_L_DESIGN.settings, cabinetDepthMm },
    },
    designId: "qa-mp3-required-percent",
    revision: "1",
    canWrite: true,
  });
}

function noteOnTheSheet(
  root: Parameters<typeof mountInCatalogue>[2],
): string | null {
  screen = mountInCatalogue(
    createElement(
      "main",
      null,
      createElement(GlobalSettings, { visibleCount: VISIBLE_SETTING_COUNT }),
    ),
    "ro",
    root,
  );
  act(() => {
    screen?.container
      .querySelector<HTMLButtonElement>(
        '[data-testid="global-settings-trigger"]',
      )
      ?.click();
  });
  return (
    screen.container.querySelector('[data-testid="global-settings-depth-note"]')
      ?.textContent ?? null
  );
}

describe("requireDeepCabinetPercent", () => {
  it("raises the no-book error, with the fixed detail, rather than answering 0", () => {
    expect(() => requireDeepCabinetPercent(NO_PRICE_BOOK)).toThrow(
      new UnreadablePriceBookError(NO_PRICE_BOOK_DETAIL),
    );
    expect(() => requireDeepCabinetPercent({ kind: "none" })).toThrow(
      "No price book could be read: No price book is active",
    );
  });

  it("answers each book's own percent across the rule's whole range, 0 included", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_DEEP_CABINET_PERCENT }),
        (percent) => {
          expect(
            requireDeepCabinetPercent(
              rootPublishingDeepCabinetPercent(percent),
            ),
          ).toBe(percent);
        },
      ),
      { seed: SWEEP_SEED, numRuns: 120 },
    );
  });

  it("tells two books apart: the percent is read per call, not remembered", () => {
    const first = rootPublishingDeepCabinetPercent(12);
    const second = rootPublishingDeepCabinetPercent(35);

    expect([
      requireDeepCabinetPercent(first),
      requireDeepCabinetPercent(second),
      requireDeepCabinetPercent(first),
    ]).toEqual([12, 35, 12]);
  });
});

describe("the settings sheet's depth note", () => {
  it.each([DEFAULT_CABINET_DEPTH_MM, DEEP_CABINET_DEPTH_MM])(
    "names 700 mm and the opened book's percent whichever depth the kitchen is built at (%i mm), at 0, 1 and the cap",
    (builtAt) => {
      for (const percent of [0, 1, 12, MAX_DEEP_CABINET_PERCENT]) {
        hydrateAt(builtAt);

        const note = noteOnTheSheet(rootPublishingDeepCabinetPercent(percent));

        expect(note).toBe(
          ro.globalSettings.depthNotePriced(DEEP_CABINET_DEPTH_MM, percent),
        );
        screen?.unmount();
        screen = undefined;
      }
    },
  );

  it("still refuses to open without a book, with the same error as before the move", () => {
    hydrateAt(DEFAULT_CABINET_DEPTH_MM);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => noteOnTheSheet(NO_PRICE_BOOK)).toThrow(
      new UnreadablePriceBookError(NO_PRICE_BOOK_DETAIL),
    );
  });
});
