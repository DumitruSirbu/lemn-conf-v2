// @vitest-environment happy-dom
//
// M12 W4.1, adversarial: the staff entry is the menu's last row behind a divider. What that move must not disturb is
// tested from the outside: each role's rows in order, the divider as something nobody reaches or hears, the Tab ring
// the dialog traps, a client's markup, the staff frame's own menu, and the two catalogues' words.
import { ROLES } from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AccountControl,
  type StaffAreaEntry,
} from "@/account/session/account-control";
import { resetAccountSessionForTests } from "@/account/session/use-account-session";

import roMessages from "../../../src/messages/ro.json";
import ruMessages from "../../../src/messages/ru.json";
import { APPROVED_ROMANIAN_MESSAGES } from "../../support/approved-romanian-messages";
import { flushPromises } from "../../support/render-hook";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../../support/render-with-intl";

const ADDRESS = "mihai.rusu@lemnaria.md";
const TRIGGER = '[data-testid="top-bar-account-trigger"]';
const MENU = '[data-testid="top-bar-account-menu"]';
const ROWS = '[class*="menuRows"]';
const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;

const signedIn = (capabilities: readonly string[]): unknown => ({
  state: "signed-in",
  email: ADDRESS,
  capabilities,
});
const CLIENT = signedIn(ROLES.client);
const OPERATOR = signedIn(ROLES.operator);
const ADMINISTRATOR = signedIn(ROLES.administrator);

let screen: MountedScreen | undefined;

beforeEach(() => {
  resetAccountSessionForTests();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

async function openMenu(
  session: unknown,
  options: { locale?: TestLocale; staffAreaEntry?: StaffAreaEntry } = {},
): Promise<HTMLElement> {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(session), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    ),
  );
  const props =
    options.staffAreaEntry === undefined
      ? { cellClassName: "cell" }
      : { cellClassName: "cell", staffAreaEntry: options.staffAreaEntry };
  screen = mountInCatalogue(
    createElement("main", null, createElement(AccountControl, props)),
    options.locale ?? "ro",
  );
  await flushPromises(5);
  click(requireIn(screen.container, TRIGGER));
  return requireIn(document.body, MENU);
}

/** One word per child of the rows container, so an inserted or reordered child shows in a plain array. */
function shapeOfRows(menu: HTMLElement): string[] {
  return [...requireIn(menu, ROWS).children].map((row) =>
    row.getAttribute("aria-hidden") === "true"
      ? `${row.tagName.toLowerCase()}[aria-hidden]`
      : `${row.tagName.toLowerCase()}:${row.textContent}`,
  );
}

function press(
  target: HTMLElement,
  key: string,
  modifiers: { shiftKey?: boolean } = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function focusOn(element: HTMLElement): void {
  act(() => {
    element.focus();
  });
}

const stopsOf = (menu: HTMLElement): HTMLElement[] =>
  allIn(menu, "a[href], button");

describe.each([
  ["an operator", OPERATOR],
  ["an administrator", ADMINISTRATOR],
])("%s: the rows in the order the owner gave", (_who, session) => {
  it.each(["ro", "ru"] as const)(
    "%s: profile, both sign-outs, a divider, then the entry, with nothing else among the rows",
    async (locale) => {
      const words = CATALOGUES[locale].accountControl;

      const menu = await openMenu(session, { locale });

      expect(shapeOfRows(menu)).toEqual([
        `a:${words.profile}`,
        `button:${words.signOutHere}`,
        `button:${words.signOutEverywhere}`,
        "span[aria-hidden]",
        `a:${words.staffArea}`,
      ]);
    },
  );

  it("keeps the Close button below the rows, outside them", async () => {
    const menu = await openMenu(session);

    const rows = requireIn(menu, ROWS);
    const close = allIn(menu, "button").find(
      (button) => button.textContent === roMessages.accountControl.close,
    );
    expect(close).toBeDefined();
    expect(rows.contains(close ?? null)).toBe(false);
    expect(
      rows.compareDocumentPosition(close ?? rows) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("the divider", () => {
  it("is one element, empty, hidden from the accessibility tree, and no kind of control", async () => {
    const menu = await openMenu(OPERATOR);

    const dividers = [...requireIn(menu, ROWS).children].filter(
      (row) => row.getAttribute("aria-hidden") === "true",
    );
    expect(dividers).toHaveLength(1);
    const [divider] = dividers;
    expect(divider?.childNodes).toHaveLength(0);
    expect(divider?.textContent).toBe("");
    for (const attribute of ["tabindex", "role", "href", "aria-label"]) {
      expect(divider?.hasAttribute(attribute)).toBe(false);
    }
    expect(divider?.matches("a, button, input, select, textarea")).toBe(false);
  });

  it("is not read as a row: the rows an assistive technology can walk are the four, and no empty name is among them", async () => {
    const menu = await openMenu(OPERATOR);

    const visibleToAssistiveTech = [...requireIn(menu, ROWS).children].filter(
      (row) => row.getAttribute("aria-hidden") !== "true",
    );
    expect(visibleToAssistiveTech).toHaveLength(4);
    for (const row of visibleToAssistiveTech) {
      expect(row.textContent.trim()).not.toBe("");
    }
  });

  it("is not a stop in the dialog's Tab ring: Tab from the second sign-out lands on the entry, and from the entry on Close", async () => {
    const menu = await openMenu(OPERATOR);
    const [profile, signOutHere, signOutEverywhere, entry, close] =
      stopsOf(menu);
    expect(stopsOf(menu)).toHaveLength(5);
    expect(entry?.textContent).toBe(roMessages.accountControl.staffArea);
    expect(entry?.previousElementSibling?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(signOutEverywhere?.nextElementSibling).toBe(
      entry?.previousElementSibling,
    );
    expect([profile, signOutHere, signOutEverywhere]).not.toContain(undefined);
    if (profile === undefined || entry === undefined || close === undefined) {
      throw new Error("the menu has fewer than five Tab stops");
    }

    // The ring is the dialog's own: it wraps from Close to the first stop and from the first stop back to Close, and the
    // browser is left to move everywhere else (no preventDefault), which can only reach the divider if it is a stop.
    focusOn(close);
    const wrapForwards = press(close, "Tab");
    expect(wrapForwards.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(profile);

    const wrapBackwards = press(profile, "Tab", {
      shiftKey: true,
    });
    expect(wrapBackwards.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);

    focusOn(entry);
    expect(press(entry, "Tab").defaultPrevented).toBe(false);
    expect(press(entry, "Tab", { shiftKey: true }).defaultPrevented).toBe(
      false,
    );
  });

  it("is not a stop for Tab from the dialog itself either: the first Tab lands on Profil, the first Shift+Tab on Close", async () => {
    const menu = await openMenu(OPERATOR);
    const stops = stopsOf(menu);

    // Opening focuses the dialog container, which is on none of the stops.
    expect(document.activeElement).toBe(menu);
    press(menu, "Tab");
    expect(document.activeElement).toBe(stops[0]);

    focusOn(menu);
    press(menu, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(stops.at(-1));
  });

  it("has no arrow-key roving to skip it: the arrow keys neither move focus nor are taken from the page", async () => {
    const menu = await openMenu(OPERATOR);
    const stops = stopsOf(menu);

    for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
      for (const stop of stops) {
        focusOn(stop);
        const event = press(stop, key);
        expect(event.defaultPrevented, `${key} on ${stop.textContent}`).toBe(
          false,
        );
        expect(document.activeElement).toBe(stop);
      }
    }
  });
});

describe("a client", () => {
  it("meets the rows and the markup it met before: kitchens, profile, both sign-outs, no divider, no entry", async () => {
    const menu = await openMenu(CLIENT);

    expect(shapeOfRows(menu)).toEqual([
      `a:${roMessages.accountControl.myKitchens}`,
      `a:${roMessages.accountControl.profile}`,
      `button:${roMessages.accountControl.signOutHere}`,
      `button:${roMessages.accountControl.signOutEverywhere}`,
    ]);
    expect(allIn(menu, '[class*="menuDivider"]')).toHaveLength(0);
    expect(
      allIn(menu, "a[href]").map((a) => a.getAttribute("href")),
    ).not.toEqual(expect.arrayContaining([expect.stringContaining("/staff")]));
  });

  it("has every direct child of the rows as a link or a button, the shape the stylesheet's row rules were written for", async () => {
    const menu = await openMenu(CLIENT);

    for (const row of requireIn(menu, ROWS).children) {
      expect(row.matches("a[href], button")).toBe(true);
      expect(row.querySelector('[aria-hidden="true"]')?.className).toMatch(
        /menuRowMark/,
      );
    }
  });

  it.each([
    [
      "a staff account without the capability",
      signedIn(["account.manage.own"]),
    ],
    ["an empty list", signedIn([])],
    ["a lookalike capability", signedIn(["design.read.any "])],
  ])("%s gets no divider either", async (_who, session) => {
    const menu = await openMenu(session);

    expect(allIn(menu, '[class*="menuDivider"]')).toHaveLength(0);
    expect(requireIn(menu, ROWS).lastElementChild?.tagName).toBe("BUTTON");
  });
});

describe("the staff frame's own menu (staffAreaEntry omitted)", () => {
  it.each(["ro", "ru"] as const)(
    "%s: stays profile and the two sign-outs, with no divider and no entry",
    async (locale) => {
      const words = CATALOGUES[locale].accountControl;

      const menu = await openMenu(OPERATOR, {
        locale,
        staffAreaEntry: "omitted",
      });

      expect(shapeOfRows(menu)).toEqual([
        `a:${words.profile}`,
        `button:${words.signOutHere}`,
        `button:${words.signOutEverywhere}`,
      ]);
      expect(menu.textContent).not.toContain(words.staffArea);
      expect(
        allIn(menu, '[aria-hidden="true"]').map((n) => n.className),
      ).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/menuDivider/)]),
      );
    },
  );
});

describe("the words", () => {
  it("name the entry apart from the staff frame in both languages, and leave every other accountControl leaf as it was", () => {
    for (const locale of ["ro", "ru"] as const) {
      const catalogue = CATALOGUES[locale];
      expect(catalogue.accountControl.staffArea).not.toBe(
        catalogue.staffShell.areaName,
      );
    }
    // The approved Romanian wording is the copy lock's to hold: the catalogue must still say what it says.
    const locked = APPROVED_ROMANIAN_MESSAGES.accountControl;
    expect(roMessages.accountControl).toMatchObject({
      staffArea: "Panoul de administrare",
      profile: locked.profile,
      myKitchens: locked.myKitchens,
      signOutHere: locked.signOutHere,
      signOutEverywhere: locked.signOutEverywhere,
      close: locked.close,
    });
    expect(ruMessages.accountControl).toMatchObject({
      staffArea: "Панель администрирования",
      profile: "Профиль",
      myKitchens: "Мои кухни",
      signOutHere: "Выйти из аккаунта",
      signOutEverywhere: "Выйти на всех устройствах",
      close: "Закрыть",
    });
  });

  it("show no trace of the old Romanian or Russian name anywhere in the menu's markup", async () => {
    for (const locale of ["ro", "ru"] as const) {
      const menu = await openMenu(OPERATOR, { locale });
      const old = CATALOGUES[locale].staffShell.areaName;

      expect(menu.textContent).not.toContain(old);
      expect(menu.innerHTML).not.toContain(old);
      screen?.unmount();
      document.body.replaceChildren();
      resetAccountSessionForTests();
    }
  });
});
