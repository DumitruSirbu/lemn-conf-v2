// @vitest-environment happy-dom
//
// With no active price book the whole editor (`/d/[id]`) and the share view (`/s/[token]`) mount the whole
// `ConfigureScreen` without throwing. There is no error boundary, so a throw while rendering is the customer's whole
// page. Only the WebGL scene is stubbed: the top bar's fit, the settings pill and sheet, the price bar, the breakdown
// and the panel are the real ones, each reading the root a page hands it. Its sibling
// `qa-m10-q3b-configure-screen-no-book.adversarial.dom.test.ts` opens the sheet and drives the top bar's fit; this one
// only mounts.
//
// Dev, test and e2e always seed a book, so a browser cannot reach this state; a DOM mount is the only way to prove it.
import { KITCHEN_L_DESIGN, type DesignId } from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/ro/d/q3b-design",
}));
vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/scene/kitchen-canvas", () => ({ default: () => null }));

import {
  ConfigureScreen,
  type ConfigureScreenVariant,
} from "@/app/configurator/configure/configure-screen";
import { NO_PRICE_BOOK } from "@/price/price-book-root";
import { useConfiguratorStore } from "@/store/configurator-store";

import { AN_AMOUNT } from "../support/figures-in-text";
import {
  all,
  mountScreen,
  unmountScreen,
  within,
} from "../support/mounted-screen";

const DESIGN_ID = "q3b-design" as DesignId;

beforeEach(() => {
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  window.history.replaceState(null, "", "/ro/d/q3b-design");
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: DESIGN_ID,
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

describe.each<ConfigureScreenVariant>(["owner", "shared"])(
  "the %s screen with no price book",
  (variant) => {
    function mount(): void {
      mountScreen(createElement(ConfigureScreen, { variant }), NO_PRICE_BOOK);
    }

    it("mounts without throwing, and draws the settings pill", () => {
      expect(mount).not.toThrow();

      expect(all("global-settings-trigger")).toHaveLength(1);
    });

    it("draws no price figure anywhere", () => {
      mount();

      expect(within().textContent).not.toMatch(AN_AMOUNT);
    });

    it("draws no price bar", () => {
      mount();

      expect(all("price-bar")).toHaveLength(0);
    });
  },
);
