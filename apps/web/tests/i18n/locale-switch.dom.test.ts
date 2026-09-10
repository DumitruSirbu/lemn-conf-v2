// @vitest-environment happy-dom
//
// **The locale switcher, driven rather than described.**
//
// The claim the wave owes is not *"a link to the other locale is rendered"* — that is true of a
// control which drops the customer's kitchen on the floor. It is three claims: the language changes,
// the design does not, and neither does the place. So the real screen is rendered, through the real
// store, on both sides of the switch, and what is compared is what the two renders say about one
// design.
//
// **It declares its own DOM environment**, for a reason that is the whole point of the file rather
// than a convenience: zustand's `useStore` hands `getInitialState()` to React as the *server*
// snapshot, so `renderToStaticMarkup` draws the seeded fixture whatever has been loaded since. A
// test of "the design survives" written as a static render would have asserted the seed against
// itself and passed.
//
// The store is deliberately **not** mocked. It is a module singleton, which is exactly why a
// client-side locale change keeps the design — the module is not re-evaluated, so the design outlives
// the render that showed it. A mocked store would make that property this file's own invention.
import {
  KITCHEN_L_DESIGN,
  OVERFLOWING_KITCHEN_L_DESIGN,
  type Design,
  type DesignId,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The address bar, as the one thing a test render cannot supply for itself: `usePathname` answers
 *  `null` outside a router, and keeping the path it is handed is the switcher's whole job. */
const browser = vi.hoisted(() => ({ pathname: "/ro/configurator/configure" }));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => browser.pathname,
}));

// The scene, which has no WebGL here and no reason to be drawn: the screen's `probing` branch would
// otherwise replace the whole surface with the unsupported notice and there would be no top bar to
// read. Everything the claims below rest on — the top bar, the price bar, the overflow sentence —
// stays real.
vi.mock("@/scene/webgl-support", () => ({ detectWebGLSupport: () => true }));
vi.mock("@/scene/kitchen-canvas", () => ({ default: () => null }));
vi.mock("@/panel/editor-panel", () => ({ EditorPanel: () => null }));
vi.mock("@/price/price-breakdown", () => ({ PriceBreakdown: () => null }));
vi.mock("@/settings/global-settings", () => ({ GlobalSettings: () => null }));
vi.mock("@/app/configurator/configure/selection-debug", () => ({
  SelectionDebug: () => null,
}));
vi.mock("@/panel/use-panel-view", () => ({
  usePanelView: () => ({ kind: "closed" }),
}));

import { ConfigureScreen } from "@/app/configurator/configure/configure-screen";
import { otherLocaleThan } from "@/i18n/use-locale-switch";
import { routing } from "@/i18n/routing";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { requireLeafAt, type Catalogue } from "../support/catalogues";

const CATALOGUE_OF = {
  ro: roMessages,
  ru: ruMessages as Catalogue,
} as const;

type ShippedLocale = keyof typeof CATALOGUE_OF;

/** A locale and the one the chip offers from it — the whole of a two-locale toggle. */
const SWITCHES = [
  ["ro", "ru"],
  ["ru", "ro"],
] as const satisfies readonly (readonly [ShippedLocale, ShippedLocale])[];

const SHARED_DESIGN_ID = "shared-kitchen" as DesignId;
const SHARED_REVISION = "1";

let container: HTMLDivElement;
let root: Root;

/** The screen as a customer who followed a shared link sees it: the design loaded through the
 *  store's own load path, and the scene mounted — the overflow marks are the scene's, so the
 *  sentence that names them waits for it. */
function loadSharedDesign(design: Design): void {
  useConfiguratorStore.getState().hydrate({
    design,
    designId: SHARED_DESIGN_ID,
    revision: SHARED_REVISION,
    canWrite: true,
  });
  useConfiguratorStore.setState({ isBodyProbeAttached: true });
}

function renderAt(locale: ShippedLocale, pathname: string): string {
  browser.pathname = pathname;
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(ConfigureScreen),
        locale,
        messages: CATALOGUE_OF[locale],
        timeZone: "Europe/Chisinau",
      }),
    );
  });
  return container.innerHTML;
}

function localeChip(): HTMLAnchorElement {
  const chip = container.querySelector('[data-testid="top-bar-locale"]');
  if (!(chip instanceof HTMLAnchorElement))
    throw new Error("the top bar drew no locale link");
  return chip;
}

function attributeOf(element: Element, name: string): string {
  const value = element.getAttribute(name);
  if (value === null) throw new Error(`the locale link declares no ${name}`);
  return value;
}

beforeEach(() => {
  loadSharedDesign(OVERFLOWING_KITCHEN_L_DESIGN);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("the locale a two-locale toggle offers", () => {
  it("is the other one, from either side", () => {
    for (const [from, to] of SWITCHES) expect(otherLocaleThan(from)).toBe(to);
  });

  // **The guard that makes the toggle an argument rather than an assumption.** The mockups draw the
  // chip closed in every frame and never draw it open, so with two locales the simpler control is
  // the right one. A third locale makes "the other one" meaningless, and this is where that has to
  // be noticed — `otherLocaleThan` throws rather than silently offering two languages of three.
  it("has no answer where there is no single other locale, and says so", () => {
    expect(routing.locales).toHaveLength(2);
    expect(() => otherLocaleThan("de")).toThrow(/2 other locales/);
  });
});

describe("switching locale changes the language and nothing else", () => {
  it.each(SWITCHES)(
    "keeps %s's configure step at the same step under the other prefix",
    (from, to) => {
      renderAt(from, `/${from}/configurator/configure`);

      expect(attributeOf(localeChip(), "href")).toBe(
        `/${to}/configurator/configure`,
      );
    },
  );

  // 6B-b's shared-design invariant, carried across the switch: the bare id is what a customer sent
  // someone, and a control that dropped it would turn a shared link into a stranger's kitchen.
  it.each(SWITCHES)(
    "keeps a shared design's own link from %s to the other locale",
    (from, to) => {
      renderAt(from, `/${from}/d/${SHARED_DESIGN_ID}`);

      expect(attributeOf(localeChip(), "href")).toBe(
        `/${to}/d/${SHARED_DESIGN_ID}`,
      );
    },
  );

  it("draws the same design in the other language, not a fresh one", () => {
    const romanian = renderAt("ro", `/ro/d/${SHARED_DESIGN_ID}`);
    const russian = renderAt("ru", `/ru/d/${SHARED_DESIGN_ID}`);

    // The language moved: the top bar's own title is a different word on each side.
    expect(romanian).toContain(
      requireLeafAt(CATALOGUE_OF.ro, "configure.title"),
    );
    expect(russian).toContain(
      requireLeafAt(CATALOGUE_OF.ru, "configure.title"),
    );
    expect(russian).not.toContain(
      requireLeafAt(CATALOGUE_OF.ro, "configure.title"),
    );

    // The design did not. The loaded kitchen overflows and the seeded fixture does not, so this
    // sentence is on both screens only because both are showing the loaded design — and it is each
    // locale's own sentence, so neither render is the other one relabelled.
    expect(romanian).toContain(
      requireLeafAt(CATALOGUE_OF.ro, "configure.overflowWarning"),
    );
    expect(russian).toContain(
      requireLeafAt(CATALOGUE_OF.ru, "configure.overflowWarning"),
    );
    expect(useConfiguratorStore.getState().designId).toBe(SHARED_DESIGN_ID);
    expect(useConfiguratorStore.getState().design).toBe(
      OVERFLOWING_KITCHEN_L_DESIGN,
    );
  });

  it("says nothing about an overflow on a design that has none, so the check above is not free", () => {
    loadSharedDesign(KITCHEN_L_DESIGN);

    expect(renderAt("ro", `/ro/d/${SHARED_DESIGN_ID}`)).not.toContain(
      requireLeafAt(CATALOGUE_OF.ro, "configure.overflowWarning"),
    );
  });
});

describe("the control a screen reader and a keyboard get", () => {
  it.each(SWITCHES)(
    "is a link, so %s's chip is focusable and activable without script",
    (from) => {
      renderAt(from, `/${from}/configurator/configure`);
      const chip = localeChip();

      expect(chip.tagName).toBe("A");
      expect(chip.hasAttribute("tabindex")).toBe(false);
      expect(chip.hasAttribute("role")).toBe(false);
    },
  );

  it.each(SWITCHES)(
    "names %s's own language and the one it leads to, never the two letters alone",
    (from, to) => {
      const catalogue = CATALOGUE_OF[from];
      renderAt(from, `/${from}/configurator/configure`);
      const chip = localeChip();
      const name = attributeOf(chip, "aria-label");

      expect(name).toBe(requireLeafAt(catalogue, "configure.localeSwitch"));
      // The visible two letters are what the frames draw, and they are not the name: `RO` read
      // aloud names neither the language of the page nor the language the link leads to, and which
      // of the two the chip shows would otherwise be carried by its colour alone.
      expect(chip.textContent).toContain(
        requireLeafAt(catalogue, "configure.locale"),
      );
      expect(name).not.toBe(requireLeafAt(catalogue, "configure.locale"));
      expect(attributeOf(chip, "hreflang")).toBe(to);
    },
  );

  it("hides the caret from the accessibility tree, and draws it for everyone else", () => {
    renderAt("ro", "/ro/configurator/configure");
    const caret = localeChip().querySelector('[aria-hidden="true"]');

    expect(caret?.textContent).toBe("▾");
  });
});
