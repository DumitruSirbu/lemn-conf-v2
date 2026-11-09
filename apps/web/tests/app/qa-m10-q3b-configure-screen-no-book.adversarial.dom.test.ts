// @vitest-environment happy-dom
//
// M10 Q3b adversarial QA, R-b's widened clause, through the WHOLE `ConfigureScreen` (owner and shared) with the sheet
// opened and the top bar's fit measured at a narrow and a wide track. The implementer's screen test mounts the screen
// and looks at the trigger; it never opens the sheet inside the screen, and happy-dom has no layout, so the fit hook
// runs on zero widths there. Here layout is stubbed (a label is 7 px a character, the track is the width under test)
// so the same hook the browser runs chooses a rung, and a rung that draws a zero, a NaN or a bare counter is a finding.
import { KITCHEN_L_DESIGN, type DesignId } from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/ro/d/q3b-qa-design",
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
import { ro } from "../support/romanian-content";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

const DESIGN_ID = "q3b-qa-design" as DesignId;
const A_PRICE = /\d[\d\s]*(MDL|lei)/u;
const A_ZERO_FIGURE = /(^|[^\d])[+-]?0(\s*%|\s*(MDL|lei))|NaN|undefined/u;
const CHARACTER_PX = 7;
const NARROW_TRACK_PX = 70;
const WIDE_TRACK_PX = 1400;
const FIXED_PART_PX: Readonly<Record<string, number>> = {
  swatch: 16,
  separator: 1,
  counter: 14,
  caret: 7,
};

let screen: MountedScreen | undefined;
let trackWidthPx = WIDE_TRACK_PX;
let hydrations = 0;

class ImmediateResizeObserver {
  constructor(private readonly callback: () => void) {}
  observe(): void {
    this.callback();
  }
  unobserve(): void {
    return undefined;
  }
  disconnect(): void {
    return undefined;
  }
}

function widthOf(element: Element): number {
  const part = element.getAttribute("data-probe");
  if (part === "label") return element.textContent.length * CHARACTER_PX;
  if (part !== null) return FIXED_PART_PX[part] ?? 0;
  const isSettingsTrack =
    element.querySelector(':scope > [data-testid="global-settings"]') !== null;
  return isSettingsTrack ? trackWidthPx : 0;
}

function stubLayout(trackPx: number): void {
  trackWidthPx = trackPx;
  vi.stubGlobal("ResizeObserver", ImmediateResizeObserver);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      return { width: widthOf(this) } as DOMRect;
    },
  );
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    () =>
      ({
        paddingLeft: "0px",
        paddingRight: "0px",
        borderLeftWidth: "0px",
        borderRightWidth: "0px",
        columnGap: "10px",
      }) as CSSStyleDeclaration,
  );
}

function hydrateAs(variant: ConfigureScreenVariant): void {
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  window.history.replaceState(null, "", "/ro/d/q3b-qa-design");
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: `${DESIGN_ID}-${String((hydrations += 1))}`,
    revision: "1",
    // A share link opens read-only: its viewer holds no write credential.
    canWrite: variant === "owner",
  });
}

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(
  variant: ConfigureScreenVariant,
  root: Parameters<typeof mountInCatalogue>[2],
): MountedScreen {
  hydrateAs(variant);
  screen = mountInCatalogue(
    createElement(ConfigureScreen, { variant }),
    "ro",
    root,
  );
  return screen;
}

function within(): HTMLElement {
  if (screen === undefined) throw new Error("nothing is mounted");
  return screen.container;
}

function all(testId: string): HTMLElement[] {
  return [
    ...within().querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`),
  ];
}

function openTheSheet(): void {
  act(() => {
    all("global-settings-trigger")[0]?.click();
  });
}

describe("the owner screen with no price book and the sheet opened", () => {
  it("draws the sheet with the unavailable line three times, no price, no zero figure and no handle row", () => {
    mount("owner", NO_PRICE_BOOK);

    openTheSheet();

    const surface = all("global-settings-surface")[0];
    expect(surface).toBeDefined();
    const line = ro.globalSettings.pricesUnavailable;
    expect((surface?.textContent ?? "").split(line).length - 1).toBe(3);
    expect(all("global-settings-handle-group")).toHaveLength(0);
    expect(within().textContent).not.toMatch(A_PRICE);
    expect(within().textContent).not.toMatch(A_ZERO_FIGURE);
    expect(all("price-bar")).toHaveLength(0);
  });

  it("is not a screen that merely failed to draw: under a book the same screen draws a price and no unavailable line", () => {
    mount("owner", SAMPLE_PRICE_ROOT);
    openTheSheet();

    expect(within().textContent).toMatch(A_PRICE);
    expect(within().textContent).not.toContain(
      ro.globalSettings.pricesUnavailable,
    );
  });
});

describe("the shared screen with no price book", () => {
  it("draws the pill, disabled as a read-only viewer's always is, with no price and no zero figure", () => {
    mount("shared", NO_PRICE_BOOK);

    const trigger = all("global-settings-trigger")[0];
    expect(trigger).toBeDefined();
    expect(trigger?.hasAttribute("disabled")).toBe(true);
    expect(within().textContent).not.toMatch(A_PRICE);
    expect(within().textContent).not.toMatch(A_ZERO_FIGURE);
    expect(all("price-bar")).toHaveLength(0);
  });
});

describe.each<ConfigureScreenVariant>(["owner", "shared"])(
  "the %s screen's top bar fit with no price book",
  (variant) => {
    it.each([
      ["narrow", NARROW_TRACK_PX],
      ["wide", WIDE_TRACK_PX],
    ])(
      "settles on a valid rung at a %s track: whole labels, a counter that counts what is hidden, no zero",
      (_name, trackPx) => {
        stubLayout(trackPx);

        mount(variant, NO_PRICE_BOOK);

        const named = all("global-settings-pill-label");
        const counter = all("global-settings-pill-count")[0];
        const settingsCount = 2;
        expect(named.length).toBeGreaterThanOrEqual(1);
        expect(named.length).toBeLessThanOrEqual(settingsCount);
        if (named.length === settingsCount) expect(counter).toBeUndefined();
        else
          expect(counter?.textContent).toBe(
            `+${String(settingsCount - named.length)}`,
          );
        const pillText = all("global-settings-trigger")[0]?.textContent ?? "";
        expect(pillText).not.toMatch(A_ZERO_FIGURE);
        expect(pillText).not.toContain("+0");
      },
    );

    it("names more at the wide track than at the narrow one, so the stub is really driving the hook", () => {
      stubLayout(NARROW_TRACK_PX);
      mount(variant, NO_PRICE_BOOK);
      const atNarrow = all("global-settings-pill-label").length;
      screen?.unmount();

      stubLayout(WIDE_TRACK_PX);
      mount(variant, NO_PRICE_BOOK);
      const atWide = all("global-settings-pill-label").length;

      expect(atNarrow).toBeLessThan(atWide);
    });

    it("keeps a non-empty accessible name at a narrow track, with no zero in it", () => {
      stubLayout(NARROW_TRACK_PX);
      mount(variant, NO_PRICE_BOOK);

      const accessibleName =
        all("global-settings-trigger")[0]?.getAttribute("aria-label") ?? "";

      expect(accessibleName).not.toBe("");
      expect(accessibleName).not.toMatch(A_ZERO_FIGURE);
    });
  },
);
