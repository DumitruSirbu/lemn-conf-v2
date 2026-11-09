// @vitest-environment happy-dom
//
// M10 Q3b, R-b's editor clause: with no active price book the settings pill, the settings sheet and the top bar's fit
// mount without throwing. There is no error boundary in the application, so a throw while rendering is the customer's
// whole page (`/d/[id]` and the share view mount both).
//
// Dev, test and e2e always seed a book, so the browser cannot reach this state; it is a DOM test by necessity.
import {
  KITCHEN_L_DESIGN,
  tierRef,
  type CatalogueAvailability,
} from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTopBarFit } from "@/app/configurator/configure/use-top-bar-fit";
import { NO_PRICE_BOOK } from "@/price/price-book-root";
import { GlobalSettings } from "@/settings/global-settings";
import { useConfiguratorStore } from "@/store/configurator-store";

import {
  mountInCatalogue,
  type MountedScreen,
} from "../support/render-with-intl";
import { ro } from "../support/romanian-content";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

const VISIBLE_SETTING_COUNT = 3;
const A_ZERO_FIGURE = /(^|[^\d])0(\s*%|\s*(MDL|lei))/u;

let screen: MountedScreen | undefined;

beforeEach(() => {
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: "q3b-no-book",
    revision: "1",
    canWrite: true,
  });
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mountSettings(root: Parameters<typeof mountInCatalogue>[2]): void {
  screen = mountInCatalogue(
    createElement(
      "main",
      null,
      createElement(GlobalSettings, { visibleCount: VISIBLE_SETTING_COUNT }),
    ),
    "ro",
    root,
  );
}

function openSheet(): void {
  act(() => {
    screen?.container
      .querySelector<HTMLButtonElement>(
        '[data-testid="global-settings-trigger"]',
      )
      ?.click();
  });
}

function all(testId: string): readonly Element[] {
  return [
    ...(screen?.container.querySelectorAll(`[data-testid="${testId}"]`) ?? []),
  ];
}

describe("the settings pill and sheet with no price book", () => {
  it("mounts the pill without throwing, naming no tier", () => {
    expect(() => {
      mountSettings(NO_PRICE_BOOK);
    }).not.toThrow();

    expect(all("global-settings-trigger")).toHaveLength(1);
  });

  it("opens a sheet whose material and hardware groups are one line each, with no option, anchor or delta", () => {
    mountSettings(NO_PRICE_BOOK);

    expect(() => {
      openSheet();
    }).not.toThrow();

    const lines = all("global-settings-prices-unavailable");
    expect(lines.map((line) => line.textContent)).toEqual([
      ro.globalSettings.pricesUnavailable,
      ro.globalSettings.pricesUnavailable,
    ]);
    expect(all("global-settings-option")).toHaveLength(0);
    expect(all("global-settings-delta")).toHaveLength(0);
    expect(all("global-settings-anchor")).toHaveLength(0);
  });

  it("keeps the depth and colour controls, and renders no zero figure anywhere on the sheet", () => {
    mountSettings(NO_PRICE_BOOK);

    openSheet();

    expect(all("global-settings-depth-option").length).toBeGreaterThan(1);
    expect(all("global-settings-colour-group")).toHaveLength(1);
    expect(all("global-settings-depth-note")[0]?.textContent).toBe(
      ro.globalSettings.pricesUnavailable,
    );
    expect(all("global-settings-figure")).toHaveLength(0);
    expect(screen?.container.textContent).not.toMatch(A_ZERO_FIGURE);
  });

  it("hides the kitchen handle row, as it does wherever availability is unknown (owner input: handle controls with no book)", () => {
    mountSettings(NO_PRICE_BOOK);

    openSheet();

    expect(all("global-settings-handle-group")).toHaveLength(0);
  });

  it("applies nothing when nothing was chosen, and refuses nothing", () => {
    mountSettings(NO_PRICE_BOOK);
    openSheet();
    const before = useConfiguratorStore.getState().design;

    act(() => {
      screen?.container
        .querySelector<HTMLButtonElement>(
          '[data-testid="global-settings-apply"]',
        )
        ?.click();
    });

    expect(useConfiguratorStore.getState().design).toBe(before);
    expect(all("global-settings-refusal")).toHaveLength(0);
  });
});

describe("the top bar's fit with no price book", () => {
  it("runs, and measures a pill that names the colour and the depth", () => {
    let seen: ReturnType<typeof useTopBarFit> | undefined;
    function Probe() {
      seen = useTopBarFit();
      return null;
    }

    expect(() => {
      screen = mountInCatalogue(createElement(Probe), "ro", NO_PRICE_BOOK);
    }).not.toThrow();

    expect(seen?.pill.settings.map((setting) => setting.key)).toEqual([
      "colour",
      "depth",
    ]);
  });
});

describe("the settings sheet under a book with a tier switched off", () => {
  const SWITCHED_OFF_MATERIAL = "material.veneer";
  const availability: CatalogueAvailability = {
    revision: "1",
    disabled: [tierRef("material", SWITCHED_OFF_MATERIAL)],
  };

  it("offers the remaining options only, and none of them blanks the others' deltas", () => {
    mountSettings({ ...SAMPLE_PRICE_ROOT, availability });

    openSheet();

    const offered = all("global-settings-option").map(
      (option) => option.querySelector("input")?.value,
    );
    expect(offered).not.toContain(SWITCHED_OFF_MATERIAL);
    expect(offered.length).toBeGreaterThan(1);
    expect(all("global-settings-delta").length).toBe(offered.length);
    expect(all("global-settings-prices-unavailable")).toHaveLength(0);
  });
});
