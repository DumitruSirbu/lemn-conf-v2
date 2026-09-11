// @vitest-environment happy-dom
//
// **The third language, driven rather than promised.**
//
// The owner's 2026-09-10 ruling is not *"make the chip open"* — it is *"in future will be also
// english and maybe other languages"*. A dropdown that works at two and quietly breaks at three
// would miss the whole of it, and "it is data-driven, so it scales" is an assertion about source
// rather than a measurement of behaviour.
//
// So this file **adds a third locale** — `routing` is replaced with a three-locale config and the
// endonym table answers for it — and then drives the real `LocaleMenu` with the real
// `useLocaleMenu` above it. Nothing between the routing config and the rendered list is stubbed, so
// what passes here is the same code path that ships. `locale-menu.dom.test.ts` drives the shipped
// two.
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppLocale } from "@/i18n/routing";

const browser = vi.hoisted(() => ({ pathname: "/ro/d/shared-kitchen" }));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => browser.pathname,
}));

/** The temporary third locale, at the one place a real one would be added. `navigation.ts` builds its
 *  `Link` from this same module, so the `/en` prefix below is next-intl's own answer and not this
 *  file's. */
vi.mock("@/i18n/routing", async () => {
  const { defineRouting } = await import("next-intl/routing");
  return {
    routing: defineRouting({
      locales: ["ro", "ru", "en"],
      defaultLocale: "ro",
      localePrefix: "always",
      localeCookie: { name: "NEXT_LOCALE", sameSite: "lax" },
    }),
  };
});

/** The endonym a real third locale would arrive with. The shipped two are read through the real
 *  table rather than restated, so this mock cannot disagree with what ships. */
vi.mock("@/i18n/locale-endonyms", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/i18n/locale-endonyms")>();
  return {
    endonymOf: (locale: string) =>
      locale === "en" ? "English" : original.endonymOf(locale as AppLocale),
  };
});

/** And the flag it would arrive with. `locale-flags.tsx` is a `Record<AppLocale, …>` for the same
 *  reason the endonym table is: a third locale cannot be added without one, which is why this mock
 *  has to exist at all. Which flag English should fly is a product decision — see the support file. */
vi.mock("@/i18n/locale-flags", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/i18n/locale-flags")>();
  const { unitedKingdomFlag } = await import("../support/english-flag");
  return {
    flagOf: (locale: string) =>
      locale === "en"
        ? unitedKingdomFlag()
        : original.flagOf(locale as AppLocale),
  };
});

import { LocaleMenu } from "@/app/configurator/configure/locale-menu";
import { endonymOf } from "@/i18n/locale-endonyms";

import roMessages from "../../src/messages/ro.json";

const THREE_LOCALES = ["ro", "ru", "en"] as const;

let container: HTMLDivElement;
let root: Root;

function render(): void {
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(LocaleMenu),
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
}

function trigger(): HTMLButtonElement {
  const chip = container.querySelector('[data-testid="top-bar-locale"]');
  if (!(chip instanceof HTMLButtonElement))
    throw new Error("no locale trigger");
  return chip;
}

function openMenu(): HTMLUListElement {
  act(() => {
    trigger().click();
  });
  const list = container.querySelector('[data-testid="top-bar-locale-list"]');
  if (!(list instanceof HTMLUListElement))
    throw new Error("the trigger opened no list");
  return list;
}

function optionFor(locale: string): HTMLAnchorElement {
  const option = container.querySelector(
    `[data-testid="top-bar-locale-option-${locale}"]`,
  );
  if (!(option instanceof HTMLAnchorElement))
    throw new Error(`the menu offers no ${locale}`);
  return option;
}

function focused(): Element {
  const element = document.activeElement;
  if (element === null) throw new Error("nothing holds focus");
  return element;
}

function pressOnFocused(key: string): void {
  act(() => {
    focused().dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

beforeEach(() => {
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

describe("a third locale, added where a real one would be added", () => {
  it("draws three items with no edit to the component", () => {
    render();
    const options = [...openMenu().querySelectorAll("a")];

    expect(options).toHaveLength(3);
    expect(options.map((option) => option.getAttribute("lang"))).toEqual([
      ...THREE_LOCALES,
    ]);
    expect(options.map((option) => option.textContent)).toEqual(
      THREE_LOCALES.map((locale) => endonymOf(locale as AppLocale)),
    );
  });

  // The third flag, for the same reason as the third endonym: a menu that drew flags for the two it
  // shipped with and a blank for the newcomer is the failure `Record<AppLocale, …>` exists to make
  // impossible, and only a third locale can demonstrate it.
  it("draws a flag of its own for each of the three, and none of them twice", () => {
    render();
    openMenu();
    const flags = THREE_LOCALES.map((locale) => {
      const flag = optionFor(locale).querySelector("svg");
      if (flag === null) throw new Error(`${locale} is offered with no flag`);
      return flag.outerHTML;
    });

    expect(new Set(flags).size).toBe(THREE_LOCALES.length);
  });

  it("points each of the three at the same page under its own prefix", () => {
    render();
    openMenu();

    for (const locale of THREE_LOCALES) {
      expect(optionFor(locale).getAttribute("href")).toBe(
        `/${locale}/d/shared-kitchen`,
      );
    }
  });

  // The guard `otherLocaleThan` used to give, kept where it belongs: two of three is the failure the
  // toggle threw to avoid, and here it simply cannot happen.
  it("marks only the language being read, and offers the other two as choices", () => {
    render();
    openMenu();
    const marked = THREE_LOCALES.filter(
      (locale) => optionFor(locale).getAttribute("aria-current") === "true",
    );

    expect(marked).toEqual(["ro"]);
    expect(optionFor("en").getAttribute("hreflang")).toBe("en");
    expect(optionFor("ru").getAttribute("hreflang")).toBe("ru");
  });

  it("walks all three with the arrows and wraps at both ends", () => {
    render();
    openMenu();

    pressOnFocused("Home");
    const walked: (Element | null)[] = [document.activeElement];
    for (let step = 1; step < THREE_LOCALES.length; step += 1) {
      pressOnFocused("ArrowDown");
      walked.push(document.activeElement);
    }

    expect(walked).toEqual(THREE_LOCALES.map((locale) => optionFor(locale)));
    pressOnFocused("ArrowDown");
    expect(document.activeElement).toBe(optionFor("ro"));
    pressOnFocused("ArrowUp");
    expect(document.activeElement).toBe(optionFor("en"));
  });

  it("reaches the third with End and comes back with Home", () => {
    render();
    openMenu();

    pressOnFocused("End");
    expect(document.activeElement).toBe(optionFor("en"));

    pressOnFocused("Home");
    expect(document.activeElement).toBe(optionFor("ro"));
  });

  it("still closes on Escape and returns focus to the trigger", () => {
    render();
    openMenu();
    pressOnFocused("End");

    pressOnFocused("Escape");

    expect(container.querySelector('[data-testid="top-bar-locale-list"]')).toBe(
      null,
    );
    expect(document.activeElement).toBe(trigger());
  });
});
