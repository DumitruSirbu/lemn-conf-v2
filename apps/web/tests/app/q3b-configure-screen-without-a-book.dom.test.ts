// @vitest-environment happy-dom
//
// M10 Q3b, R-b's widened clause: with no active price book the whole editor (`/d/[id]`) and the share view (`/s/[token]`)
// mount the whole `ConfigureScreen` without throwing. There is no error boundary, so a throw while rendering is the
// customer's whole page. Only the WebGL scene is stubbed: the top bar's fit, the settings pill and sheet, the price bar,
// the breakdown and the panel are the real ones, each reading the root a page hands it.
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

import {
  mountInCatalogue,
  type MountedScreen,
} from "../support/render-with-intl";

const DESIGN_ID = "q3b-design" as DesignId;
const A_PRICE = /\d[\d\s]*(MDL|lei)/u;

let screen: MountedScreen | undefined;

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
  screen?.unmount();
  screen = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.each<ConfigureScreenVariant>(["owner", "shared"])(
  "the %s screen with no price book",
  (variant) => {
    function mount(): void {
      screen = mountInCatalogue(
        createElement(ConfigureScreen, { variant }),
        "ro",
        NO_PRICE_BOOK,
      );
    }

    it("mounts without throwing, and draws the settings pill", () => {
      expect(mount).not.toThrow();

      expect(
        screen?.container.querySelector(
          '[data-testid="global-settings-trigger"]',
        ),
      ).not.toBeNull();
    });

    it("draws no price figure anywhere, and no price bar", () => {
      mount();

      expect(screen?.container.textContent).not.toMatch(A_PRICE);
      expect(
        screen?.container.querySelector('[data-testid="price-bar"]'),
      ).toBeNull();
    });
  },
);
