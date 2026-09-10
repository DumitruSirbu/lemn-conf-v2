// @vitest-environment happy-dom
//
// **The locale menu, driven rather than described.**
//
// The claim the wave owes is not *"a list of languages is rendered"* — that is true of a control
// which drops the customer's kitchen on the floor. It is three claims: the language changes, the
// design does not, and neither does the place. So the real screen is rendered, through the real
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
//
// **What changed on 2026-09-10**: the owner ruled the chip a dropdown, because English and other
// languages are coming and *"the other one"* stops being a choice at three. So the claims below are
// made **over `routing.locales`** rather than over a hand-written pair — a locale added there must
// appear here with no edit to this file or to the component. `locale-menu-scales.dom.test.ts` drives
// the same menu at three.
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
import { endonymOf } from "@/i18n/locale-endonyms";
import { routing, type AppLocale } from "@/i18n/routing";

import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { requireLeafAt, type Catalogue } from "../support/catalogues";

const CATALOGUE_OF = {
  ro: roMessages,
  ru: ruMessages as Catalogue,
} as const;

type ShippedLocale = keyof typeof CATALOGUE_OF;

/** Every locale that ships, and every locale it can move to — **derived**, so a third one is swept
 *  by every case below without this array being touched. */
const SHIPPED_LOCALES: readonly ShippedLocale[] = routing.locales;
const SWITCHES: readonly (readonly [ShippedLocale, ShippedLocale])[] =
  SHIPPED_LOCALES.flatMap((from) =>
    SHIPPED_LOCALES.filter((to) => to !== from).map(
      (to) => [from, to] as const,
    ),
  );

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

function trigger(): HTMLButtonElement {
  const chip = container.querySelector('[data-testid="top-bar-locale"]');
  if (!(chip instanceof HTMLButtonElement))
    throw new Error("the top bar drew no locale trigger");
  return chip;
}

/** The trigger clicked, which is the only way a customer reaches the list. */
function openMenu(): HTMLUListElement {
  act(() => {
    trigger().click();
  });
  const list = container.querySelector('[data-testid="top-bar-locale-list"]');
  if (!(list instanceof HTMLUListElement))
    throw new Error("the trigger opened no list");
  return list;
}

function optionFor(locale: AppLocale): HTMLAnchorElement {
  const option = container.querySelector(
    `[data-testid="top-bar-locale-option-${locale}"]`,
  );
  if (!(option instanceof HTMLAnchorElement))
    throw new Error(`the menu offers no ${locale}`);
  return option;
}

/** The element the keys are sent to. Read back each time rather than held: every move re-renders the
 *  list, and a stale node would take the presses somewhere the customer is not. */
function focused(): Element {
  const element = document.activeElement;
  if (element === null) throw new Error("nothing holds focus");
  return element;
}

function localeOrThrow(candidate: ShippedLocale | undefined): ShippedLocale {
  if (candidate === undefined) throw new Error("routing declares no locales");
  return candidate;
}

function firstLocale(): ShippedLocale {
  return localeOrThrow(SHIPPED_LOCALES.at(0));
}

function lastLocale(): ShippedLocale {
  return localeOrThrow(SHIPPED_LOCALES.at(-1));
}

function attributeOf(element: Element, name: string): string {
  const value = element.getAttribute(name);
  if (value === null) throw new Error(`the element declares no ${name}`);
  return value;
}

function pressOn(element: Element, key: string): void {
  act(() => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
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

describe("the languages the menu offers", () => {
  it("offers every configured locale, in the order routing declares them", () => {
    renderAt("ro", "/ro/configurator/configure");
    const options = [...openMenu().querySelectorAll("a")];

    expect(options.map((option) => option.getAttribute("lang"))).toEqual([
      ...routing.locales,
    ]);
  });

  // **The endonym rule.** A person looking for their language cannot read the page they are on, so
  // they scan for the word *they* recognise — which means the name is never translated. Asserted from
  // both sides: the same words on each locale's render, and none of them a catalogue leaf.
  it.each(SHIPPED_LOCALES)(
    "names each language in its own language, read from %s",
    (locale) => {
      renderAt(locale, `/${locale}/configurator/configure`);
      const names = [...openMenu().querySelectorAll("a")].map(
        (option) => option.textContent,
      );

      expect(names).toEqual(SHIPPED_LOCALES.map((each) => endonymOf(each)));
    },
  );
});

describe("switching locale changes the language and nothing else", () => {
  it.each(SWITCHES)(
    "keeps %s's configure step at the same step under %s's prefix",
    (from, to) => {
      renderAt(from, `/${from}/configurator/configure`);
      openMenu();

      expect(attributeOf(optionFor(to), "href")).toBe(
        `/${to}/configurator/configure`,
      );
    },
  );

  // 6B-b's shared-design invariant, carried across the switch: the bare id is what a customer sent
  // someone, and a control that dropped it would turn a shared link into a stranger's kitchen.
  it.each(SWITCHES)(
    "keeps a shared design's own link from %s to %s",
    (from, to) => {
      renderAt(from, `/${from}/d/${SHARED_DESIGN_ID}`);
      openMenu();

      expect(attributeOf(optionFor(to), "href")).toBe(
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
  it.each(SHIPPED_LOCALES)(
    "gives %s a trigger that says what it opens, and says so only while it is open",
    (locale) => {
      renderAt(locale, `/${locale}/configurator/configure`);

      expect(trigger().getAttribute("aria-expanded")).toBe("false");
      expect(trigger().getAttribute("aria-haspopup")).toBe("true");
      expect(attributeOf(trigger(), "aria-controls")).not.toBe("");

      openMenu();
      expect(trigger().getAttribute("aria-expanded")).toBe("true");
    },
  );

  it.each(SHIPPED_LOCALES)(
    "names %s's trigger with a sentence rather than the two letters it draws",
    (locale) => {
      const catalogue = CATALOGUE_OF[locale];
      renderAt(locale, `/${locale}/configurator/configure`);
      const name = attributeOf(trigger(), "aria-label");

      expect(name).toBe(requireLeafAt(catalogue, "configure.localeMenu"));
      expect(trigger().textContent).toContain(
        requireLeafAt(catalogue, "configure.locale"),
      );
      expect(name).not.toBe(requireLeafAt(catalogue, "configure.locale"));
    },
  );

  it("labels the list by the trigger, so the list is not an unnamed group", () => {
    renderAt("ro", "/ro/configurator/configure");
    const list = openMenu();

    expect(attributeOf(list, "aria-labelledby")).toBe(
      attributeOf(trigger(), "id"),
    );
    expect(attributeOf(list, "id")).toBe(
      attributeOf(trigger(), "aria-controls"),
    );
  });

  // Not by colour alone, and not by font weight alone: the language already showing is the one the
  // accessibility tree calls current.
  it.each(SHIPPED_LOCALES)(
    "marks %s as the current language and marks no other",
    (locale) => {
      renderAt(locale, `/${locale}/configurator/configure`);
      openMenu();
      const current = SHIPPED_LOCALES.filter(
        (each) => optionFor(each).getAttribute("aria-current") === "true",
      );

      expect(current).toEqual([locale]);
    },
  );

  it.each(SWITCHES)(
    "declares from %s that %s's link leads to a document in that language",
    (from, to) => {
      renderAt(from, `/${from}/configurator/configure`);
      openMenu();

      expect(attributeOf(optionFor(to), "hreflang")).toBe(to);
    },
  );

  it("keeps every choice a link, so it is shareable and openable in a new tab", () => {
    renderAt("ro", "/ro/configurator/configure");

    for (const option of openMenu().querySelectorAll("a")) {
      expect(option.tagName).toBe("A");
      expect(option.hasAttribute("role")).toBe(false);
    }
  });

  it("hides the caret from the accessibility tree, and draws it for everyone else", () => {
    renderAt("ro", "/ro/configurator/configure");
    const caret = trigger().querySelector('[aria-hidden="true"]');

    expect(caret?.textContent).toBe("▾");
  });

  /** The owner's 2026-09-10 flag, drawn on **every** row rather than on the current one — a flag is
   *  what a language *is*, so a row without one is a language identified less well than its
   *  neighbours. Drawn rather than typed: the flag emoji are regional-indicator pairs and Windows
   *  ships no font that has them, so a customer there would read the letters *MD* where a flag
   *  belongs. `locale-flags.test.ts` holds the flags to their own countries' colours. */
  it("draws a flag beside every language, and hides it from a screen reader", () => {
    renderAt("ro", "/ro/configurator/configure");
    openMenu();

    for (const locale of SHIPPED_LOCALES) {
      const flag = optionFor(locale).querySelector("svg");

      expect(flag?.tagName.toLowerCase()).toBe("svg");
      expect(flag?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  /** And the flag adds nothing to what is *read*: the announcement is still the endonym alone, which
   *  is the whole reason the flag is hidden rather than labelled. */
  it("leaves the announced name the endonym and nothing beside it", () => {
    renderAt("ro", "/ro/configurator/configure");
    openMenu();

    for (const locale of SHIPPED_LOCALES) {
      expect(optionFor(locale).textContent).toBe(endonymOf(locale));
    }
  });
});

describe("the keyboard", () => {
  it("opens on the trigger's own activation and lands on the current language", () => {
    renderAt("ru", "/ru/configurator/configure");
    openMenu();

    expect(document.activeElement).toBe(optionFor("ru"));
  });

  it("opens downwards at the first language and upwards at the last", () => {
    renderAt("ro", "/ro/configurator/configure");

    pressOn(trigger(), "ArrowDown");
    expect(document.activeElement).toBe(optionFor(firstLocale()));

    pressOn(trigger(), "Escape");
    pressOn(trigger(), "ArrowUp");
    expect(document.activeElement).toBe(optionFor(lastLocale()));
  });

  it("walks every language with the arrows and wraps at both ends", () => {
    renderAt("ro", "/ro/configurator/configure");
    pressOn(trigger(), "ArrowDown");

    const visited: (Element | null)[] = [document.activeElement];
    for (let step = 1; step < SHIPPED_LOCALES.length; step += 1) {
      pressOn(focused(), "ArrowDown");
      visited.push(document.activeElement);
    }

    expect(visited).toEqual(SHIPPED_LOCALES.map((each) => optionFor(each)));
    // One more wraps back to the first, so the walk is a ring rather than a run that ran out.
    pressOn(focused(), "ArrowDown");
    expect(document.activeElement).toBe(optionFor(firstLocale()));
    // And upwards from the first wraps to the last, which is the other end of the same ring.
    pressOn(focused(), "ArrowUp");
    expect(document.activeElement).toBe(optionFor(lastLocale()));
  });

  it("jumps to the ends with Home and End", () => {
    renderAt("ro", "/ro/configurator/configure");
    openMenu();

    pressOn(focused(), "End");
    expect(document.activeElement).toBe(optionFor(lastLocale()));

    pressOn(focused(), "Home");
    expect(document.activeElement).toBe(optionFor(firstLocale()));
  });

  it("closes on Escape and hands focus back to the trigger it came from", () => {
    renderAt("ro", "/ro/configurator/configure");
    openMenu();

    pressOn(focused(), "Escape");

    expect(container.querySelector('[data-testid="top-bar-locale-list"]')).toBe(
      null,
    );
    expect(document.activeElement).toBe(trigger());
  });

  /**
   * **Tab closes the menu by the focus leaving it, not by the key being seen.** Driven as the focus
   * move it is: closing on `Tab`'s keydown would unmount the element the browser is about to move
   * focus *from*, and sequential navigation would restart at the top of the document.
   *
   * And it does **not** take focus back — the customer asked to leave, and pulling them to the
   * trigger would trap them on the control they were tabbing away from.
   */
  it("closes when focus leaves it, and leaves focus where it went", () => {
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    renderAt("ro", "/ro/configurator/configure");
    openMenu();
    const opened = focused();

    act(() => {
      opened.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: elsewhere }),
      );
    });

    expect(container.querySelector('[data-testid="top-bar-locale-list"]')).toBe(
      null,
    );
    expect(document.activeElement).not.toBe(trigger());
    elsewhere.remove();
  });

  it("stays open while focus moves between its own choices", () => {
    renderAt("ro", "/ro/configurator/configure");
    openMenu();

    act(() => {
      focused().dispatchEvent(
        new FocusEvent("focusout", {
          bubbles: true,
          relatedTarget: optionFor(lastLocale()),
        }),
      );
    });

    expect(
      container.querySelector('[data-testid="top-bar-locale-list"]'),
    ).not.toBe(null);
  });
});

describe("the menu closes when the customer is done with it", () => {
  it("closes when the trigger is pressed a second time", () => {
    renderAt("ro", "/ro/configurator/configure");
    openMenu();

    act(() => {
      trigger().click();
    });

    expect(container.querySelector('[data-testid="top-bar-locale-list"]')).toBe(
      null,
    );
  });

  it("closes on a pointer down anywhere outside it", () => {
    renderAt("ro", "/ro/configurator/configure");
    openMenu();

    act(() => {
      document.body.dispatchEvent(
        new Event("pointerdown", { bubbles: true, cancelable: true }),
      );
    });

    expect(container.querySelector('[data-testid="top-bar-locale-list"]')).toBe(
      null,
    );
  });

  it("stays open on a pointer down inside it, so a mis-aimed press is not a dismissal", () => {
    renderAt("ro", "/ro/configurator/configure");
    const list = openMenu();

    act(() => {
      list.dispatchEvent(
        new Event("pointerdown", { bubbles: true, cancelable: true }),
      );
    });

    expect(
      container.querySelector('[data-testid="top-bar-locale-list"]'),
    ).not.toBe(null);
  });

  it("closes when a language is chosen", () => {
    renderAt("ro", "/ro/configurator/configure");
    openMenu();

    act(() => {
      optionFor("ru").dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(container.querySelector('[data-testid="top-bar-locale-list"]')).toBe(
      null,
    );
  });
});
