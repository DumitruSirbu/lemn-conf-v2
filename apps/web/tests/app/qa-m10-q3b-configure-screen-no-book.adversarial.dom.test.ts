// @vitest-environment happy-dom
//
// The whole `ConfigureScreen` (owner and shared) with no price book: the sheet opened inside the screen, and the top
// bar's fit measured at a narrow and a wide track. Its sibling `q3b-configure-screen-without-a-book.dom.test.ts` only
// mounts the screen. Happy-dom has no layout, so layout is stubbed here (a label is 7 px a character, the track is the
// width under test) and the same hook the browser runs chooses a rung; a rung that draws a zero, a NaN or a bare
// counter is a failure.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { createElement } from "react";
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
import { NO_PRICE_BOOK, type PriceBookRoot } from "@/price/price-book-root";
import { useConfiguratorStore } from "@/store/configurator-store";

import {
  AN_AMOUNT,
  A_ZERO_WITH_A_UNIT,
  occurrencesOf,
} from "../support/figures-in-text";
import {
  all,
  mountScreen,
  one,
  openSheet,
  unmountScreen,
  within,
} from "../support/mounted-screen";
import { ro } from "../support/romanian-content";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

const DESIGN_ID = "q3b-qa-design";
const CHARACTER_PX = 7;
const FLOOR_TRACK_PX = 1;
const NARROW_TRACK_PX = 70;
const WIDE_TRACK_PX = 1400;
const SETTINGS_COUNT = 2;
const FIXED_PART_PX: Readonly<Record<string, number>> = {
  swatch: 16,
  separator: 1,
  counter: 14,
  caret: 7,
};

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

function hydrateAs(
  variant: ConfigureScreenVariant,
  settings: NonNullable<typeof KITCHEN_L_DESIGN.settings>,
): void {
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  window.history.replaceState(null, "", "/ro/d/q3b-qa-design");
  useConfiguratorStore.getState().hydrate({
    design: { ...KITCHEN_L_DESIGN, settings },
    designId: `${DESIGN_ID}-${String((hydrations += 1))}`,
    revision: "1",
    // A share link opens read-only: its viewer holds no write credential.
    canWrite: variant === "owner",
  });
}

afterEach(() => {
  unmountScreen();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(
  variant: ConfigureScreenVariant,
  root: PriceBookRoot,
  settings: NonNullable<typeof KITCHEN_L_DESIGN.settings> = {
    cabinetDepthMm: 600,
  },
): void {
  hydrateAs(variant, settings);
  mountScreen(createElement(ConfigureScreen, { variant }), root);
}

describe("the owner screen with no price book and the sheet opened", () => {
  it("says prices are unavailable three times inside the sheet", () => {
    mount("owner", NO_PRICE_BOOK);

    openSheet();

    expect(
      occurrencesOf(
        ro.globalSettings.pricesUnavailable,
        one("global-settings-surface").textContent,
      ),
    ).toBe(3);
  });

  it("shows the kitchen handle row", () => {
    mount("owner", NO_PRICE_BOOK);

    openSheet();

    expect(all("global-settings-handle-group")).toHaveLength(1);
  });

  it("draws no price, no zero figure and no price bar", () => {
    mount("owner", NO_PRICE_BOOK);

    openSheet();

    expect(within().textContent).not.toMatch(AN_AMOUNT);
    expect(within().textContent).not.toMatch(A_ZERO_WITH_A_UNIT);
    expect(all("price-bar")).toHaveLength(0);
  });

  it("is not a screen that merely failed to draw: under a book it draws a price and no unavailable line", () => {
    mount("owner", SAMPLE_PRICE_ROOT);

    openSheet();

    expect(within().textContent).toMatch(AN_AMOUNT);
    expect(within().textContent).not.toContain(
      ro.globalSettings.pricesUnavailable,
    );
  });
});

describe("the shared screen with no price book", () => {
  it("draws the pill, disabled as a read-only viewer's always is", () => {
    mount("shared", NO_PRICE_BOOK);

    expect(all("global-settings-trigger")[0]?.hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("draws no price and no zero figure", () => {
    mount("shared", NO_PRICE_BOOK);

    expect(within().textContent).not.toMatch(AN_AMOUNT);
    expect(within().textContent).not.toMatch(A_ZERO_WITH_A_UNIT);
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
      "settles on a valid rung at a %s track: a named label, and a counter that counts what is hidden",
      (_name, trackPx) => {
        stubLayout(trackPx);

        mount(variant, NO_PRICE_BOOK);

        const named = all("global-settings-pill-label");
        const counter = all("global-settings-pill-count")[0];
        expect(named.length).toBeGreaterThanOrEqual(1);
        expect(named.length).toBeLessThanOrEqual(SETTINGS_COUNT);
        if (named.length === SETTINGS_COUNT) expect(counter).toBeUndefined();
        else
          expect(counter?.textContent).toBe(
            `+${String(SETTINGS_COUNT - named.length)}`,
          );
      },
    );

    it.each([
      ["narrow", NARROW_TRACK_PX],
      ["wide", WIDE_TRACK_PX],
    ])("draws no zero in the pill at a %s track", (_name, trackPx) => {
      stubLayout(trackPx);

      mount(variant, NO_PRICE_BOOK);

      const pill = all("global-settings-trigger")[0];
      expect(pill?.textContent).not.toMatch(A_ZERO_WITH_A_UNIT);
      expect(pill?.textContent).not.toContain("+0");
      expect(pill?.getAttribute("aria-label")).not.toBe("");
    });

    it("names more at the wide track than at the narrow one, so the stub is really driving the hook", () => {
      stubLayout(NARROW_TRACK_PX);
      mount(variant, NO_PRICE_BOOK);
      const atNarrow = all("global-settings-pill-label").length;
      unmountScreen();

      stubLayout(WIDE_TRACK_PX);
      mount(variant, NO_PRICE_BOOK);
      const atWide = all("global-settings-pill-label").length;

      expect(atNarrow).toBeLessThan(atWide);
    });

    it("draws a named label at the floor even when the kitchen's free colour is nameless", () => {
      stubLayout(FLOOR_TRACK_PX);

      mount(variant, NO_PRICE_BOOK, {
        cabinetDepthMm: 600,
        materialTierId: "material.painted-mdf",
      });

      const named = all("global-settings-pill-label");
      expect(named.length).toBeGreaterThanOrEqual(1);
      for (const label of named) expect(label.textContent).not.toBe("");
    });
  },
);
