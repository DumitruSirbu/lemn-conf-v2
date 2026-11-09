// @vitest-environment happy-dom
//
// With no active price book the settings pill, the settings sheet and the top bar's fit mount without throwing. There
// is no error boundary in the application, so a throw while rendering is the customer's whole page (`/d/[id]` and the
// share view mount both). Its sibling `qa-m10-q3b-no-book.adversarial.dom.test.ts` applies changes and scans every
// label; this one pins what mounts and what the sheet shows.
//
// Dev, test and e2e always seed a book, so the browser cannot reach this state; it is a DOM test by necessity.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTopBarFit } from "@/app/configurator/configure/use-top-bar-fit";
import { NO_PRICE_BOOK } from "@/price/price-book-root";
import { useConfiguratorStore } from "@/store/configurator-store";

import { A_ZERO_WITH_A_UNIT } from "../support/figures-in-text";
import {
  all,
  mountScreen,
  mountSettings,
  openSheet,
  press,
  unmountScreen,
  within,
} from "../support/mounted-screen";
import { ro } from "../support/romanian-content";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import { switchedOffTiers } from "../support/tier-offer-world";

const SWITCHED_OFF_MATERIAL = "material.veneer";

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
  unmountScreen();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the settings pill and sheet with no price book", () => {
  it("mounts the pill without throwing", () => {
    expect(() => mountSettings(NO_PRICE_BOOK)).not.toThrow();

    expect(all("global-settings-trigger")).toHaveLength(1);
  });

  it("opens a sheet whose material and hardware groups are one line each", () => {
    mountSettings(NO_PRICE_BOOK);

    expect(() => {
      openSheet();
    }).not.toThrow();

    expect(
      all("global-settings-prices-unavailable").map((line) => line.textContent),
    ).toEqual([
      ro.globalSettings.pricesUnavailable,
      ro.globalSettings.pricesUnavailable,
    ]);
  });

  it("offers no option, anchor or delta in those groups", () => {
    mountSettings(NO_PRICE_BOOK);

    openSheet();

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
    expect(within().textContent).not.toMatch(A_ZERO_WITH_A_UNIT);
  });

  it("shows the kitchen handle row with every handle, since nothing is switched off", () => {
    mountSettings(NO_PRICE_BOOK);

    openSheet();

    expect(all("global-settings-handle-group")).toHaveLength(1);
    expect(all("global-settings-handle-option")).toHaveLength(3);
  });

  it("applies nothing when nothing was chosen, and refuses nothing", () => {
    mountSettings(NO_PRICE_BOOK);
    openSheet();
    const before = useConfiguratorStore.getState().design;

    press("global-settings-apply");

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

    expect(() =>
      mountScreen(createElement(Probe), NO_PRICE_BOOK),
    ).not.toThrow();

    expect(seen?.pill.settings.map((setting) => setting.key)).toEqual([
      "colour",
      "depth",
    ]);
  });
});

describe("the settings sheet under a book with a tier switched off", () => {
  it("offers the remaining options only, and none of them blanks the others' deltas", () => {
    mountSettings({
      ...SAMPLE_PRICE_ROOT,
      availability: switchedOffTiers({ material: [SWITCHED_OFF_MATERIAL] }),
    });

    openSheet();

    const offered = all("global-settings-option").map(
      (option) => option.querySelector("input")?.value,
    );
    expect(offered).not.toContain(SWITCHED_OFF_MATERIAL);
    expect(offered.length).toBeGreaterThan(1);
    expect(all("global-settings-delta")).toHaveLength(offered.length);
    expect(all("global-settings-prices-unavailable")).toHaveLength(0);
  });
});
