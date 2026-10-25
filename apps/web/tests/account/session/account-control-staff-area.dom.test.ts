// @vitest-environment happy-dom
//
// The signed-in menu of the configurator's account control offers "Zona personalului" to a session that lists the staff
// capability and to nobody else (plan P-L3-9). The list is advisory: it decides what the header offers, and the server's
// gate on each staff page decides who gets in. The entry leaves for another frame, so it is a plain anchor (a full load),
// and it lives in the menu, never in the bar's cell, so the cell's width is the same for every signed-in session.
import { ROLES } from "@lemnaria/configurator-domain";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { act, createElement, createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AccountControl,
  AccountFormProbes,
  type StaffAreaEntry,
} from "@/account/session/account-control";
import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { staffPathOf } from "@/staff/staff-paths";
import { StaffShell } from "@/staff/staff-shell";

import roMessages from "../../../src/messages/ro.json";
import ruMessages from "../../../src/messages/ru.json";
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
const CELL = '[data-testid="top-bar-account"]';
const STAFF_AREA_WORDS = {
  ro: roMessages.accountControl.staffArea,
  ru: ruMessages.accountControl.staffArea,
} as const;

function signedIn(capabilities: readonly string[]): unknown {
  return { state: "signed-in", email: ADDRESS, capabilities };
}

const CLIENT = signedIn(ROLES.client);
const OPERATOR = signedIn(ROLES.operator);
const ADMINISTRATOR = signedIn(ROLES.administrator);
const UNVERIFIED_OPERATOR = signedIn(["account.manage.own"]);

let screen: MountedScreen | undefined;
let softNavigations: string[];

// The router the app would hand to a `next/link`: without one a router link does nothing on a click, so a link that
// should have been a plain anchor could not be told apart from one.
function spyRouter(): AppRouterInstance {
  const navigate = (address: string): void => {
    softNavigations.push(address);
  };
  return {
    back: () => undefined,
    forward: () => undefined,
    refresh: () => undefined,
    prefetch: () => undefined,
    push: navigate,
    replace: navigate,
    bfcacheId: "test",
  };
}

beforeEach(() => {
  resetAccountSessionForTests();
  softNavigations = [];
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function answerWith(session: unknown): void {
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
}

async function mountControl(
  session: unknown,
  options: {
    readonly locale?: TestLocale;
    readonly staffAreaEntry?: StaffAreaEntry;
  } = {},
): Promise<MountedScreen> {
  answerWith(session);
  const props =
    options.staffAreaEntry === undefined
      ? { cellClassName: "cell" }
      : { cellClassName: "cell", staffAreaEntry: options.staffAreaEntry };
  screen = mountInCatalogue(
    createElement(
      RouterContext.Provider,
      // Under Vitest `next/link` is the pages router's link, which reads this context; the application's own build
      // swaps in the app router's, which reads the other. Both are given the same spy, so a router link is caught either way.
      { value: spyRouter() as never },
      createElement(
        AppRouterContext.Provider,
        { value: spyRouter() },
        createElement("main", null, createElement(AccountControl, props)),
      ),
    ),
    options.locale ?? "ro",
  );
  await flushPromises(5);
  return screen;
}

async function openedMenuFor(
  session: unknown,
  locale: TestLocale = "ro",
): Promise<HTMLElement> {
  const page = await mountControl(session, { locale });
  click(requireIn(page.container, TRIGGER));
  return requireIn(document.body, MENU);
}

const staffAreaEntryIn = (menu: ParentNode): HTMLAnchorElement | undefined =>
  allIn<HTMLAnchorElement>(menu, "a").find((link) =>
    link.getAttribute("href")?.includes("/staff/"),
  );

describe("who is offered the way into the staff area", () => {
  it.each([
    ["an operator", OPERATOR],
    ["an administrator", ADMINISTRATOR],
  ])("%s is", async (_who, session) => {
    const menu = await openedMenuFor(session);

    expect(staffAreaEntryIn(menu)?.textContent).toBe(STAFF_AREA_WORDS.ro);
  });

  it.each([
    ["a client", CLIENT],
    [
      "a staff account that is not verified, whose list holds only its own sign-in details",
      UNVERIFIED_OPERATOR,
    ],
    ["a staff account whose list is empty", signedIn([])],
    [
      "a list with a lookalike of the capability",
      signedIn(["design.read.any "]),
    ],
    ["a list whose capability is in capitals", signedIn(["DESIGN.READ.ANY"])],
    [
      "a list whose capability is hidden behind a right-to-left override",
      signedIn(["\u202Edesign.read.any"]),
    ],
    [
      "a list with the capability inside a list",
      {
        state: "signed-in",
        email: ADDRESS,
        capabilities: [["design.read.any"]],
      },
    ],
  ])("%s is not", async (_who, session) => {
    const menu = await openedMenuFor(session);

    expect(staffAreaEntryIn(menu)).toBeUndefined();
    expect(menu.textContent).not.toContain(STAFF_AREA_WORDS.ro);
  });

  it("nobody is while the server has not answered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    screen = mountInCatalogue(
      createElement(AccountControl, { cellClassName: "cell" }),
    );
    await flushPromises(5);

    expect(document.body.textContent).not.toContain(STAFF_AREA_WORDS.ro);
    expect(document.querySelector(MENU)).toBeNull();
  });

  it("a visitor is not, and has no menu to be offered it in", async () => {
    const page = await mountControl({ state: "anonymous" });

    expect(page.container.querySelector(TRIGGER)).toBeNull();
    expect(page.container.textContent).not.toContain(STAFF_AREA_WORDS.ro);
  });

  it("nobody is when the server's answer fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 503 }))),
    );
    screen = mountInCatalogue(
      createElement(AccountControl, { cellClassName: "cell" }),
    );
    await flushPromises(5);

    expect(document.querySelector(TRIGGER)).toBeNull();
    expect(document.body.textContent).not.toContain(STAFF_AREA_WORDS.ro);
  });
});

describe("the entry", () => {
  it.each(["ro", "ru"] as const)(
    "%s: leaves for the staff area's first page in this language, named by the words, with nothing else on the anchor",
    async (locale) => {
      const menu = await openedMenuFor(OPERATOR, locale);

      const entry = staffAreaEntryIn(menu);
      expect(entry?.getAttribute("href")).toBe(`/${locale}/staff/kitchens`);
      expect(entry?.textContent).toBe(STAFF_AREA_WORDS[locale]);
      expect(entry?.hasAttribute("target")).toBe(false);
      expect(entry?.hasAttribute("rel")).toBe(false);
      expect(entry?.hasAttribute("download")).toBe(false);
    },
  );

  it.each(["ro", "ru"] as const)(
    "%s: leads where the staff frame's own link to its first page leads (one leaf module writes both)",
    async (locale) => {
      const menu = await openedMenuFor(OPERATOR, locale);

      expect(staffAreaEntryIn(menu)?.getAttribute("href")).toBe(
        staffPathOf(locale, "kitchens"),
      );
    },
  );

  it("is a full load: pressing it is left to the browser, which no router link does", async () => {
    const menu = await openedMenuFor(OPERATOR);
    const entry = staffAreaEntryIn(menu);

    const press = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      entry?.dispatchEvent(press);
    });

    expect(press.defaultPrevented).toBe(false);
    expect(softNavigations).toEqual([]);
  });

  it("is not drawn in the bar's cell, which is where the fit model measures the control", async () => {
    const page = await mountControl(OPERATOR);
    click(requireIn(page.container, TRIGGER));

    expect(staffAreaEntryIn(requireIn(page.container, CELL))).toBeUndefined();
    expect(
      staffAreaEntryIn(requireIn(document.body, MENU)),
    ).not.toBeUndefined();
  });

  it("sits after the account's own links and before the ways out, in the order Tab walks", async () => {
    const menu = await openedMenuFor(OPERATOR);

    const walked = allIn(menu, "a[href], button").map(
      (item) => item.textContent,
    );
    expect(walked).toEqual([
      roMessages.accountControl.profile,
      roMessages.accountControl.staffArea,
      roMessages.accountControl.signOutHere,
      roMessages.accountControl.signOutEverywhere,
      roMessages.accountControl.close,
    ]);
  });

  it("is a plain link: it takes focus like any link and is not disabled while a sign-out waits", async () => {
    const menu = await openedMenuFor(OPERATOR);
    const entry = staffAreaEntryIn(menu);

    act(() => {
      entry?.focus();
    });

    expect(document.activeElement).toBe(entry);
    expect(entry?.hasAttribute("aria-disabled")).toBe(false);
    expect(entry?.hasAttribute("tabindex")).toBe(false);
  });

  it("goes with the menu on Escape, which gives focus back to the icon", async () => {
    const page = await mountControl(OPERATOR);
    const trigger = requireIn(page.container, TRIGGER);
    click(trigger);
    expect(document.querySelector(MENU)).not.toBeNull();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(document.querySelector(MENU)).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("the entry in the staff area's own frame", () => {
  async function mountStaffFrame(): Promise<MountedScreen> {
    answerWith(OPERATOR);
    screen = mountInCatalogue(
      createElement(StaffShell, {
        locale: "ro",
        page: "kitchens",
        context: { role: "operator", email: ADDRESS, navigation: ["kitchens"] },
        children: createElement("h1", null, "a client's kitchen"),
      }),
    );
    await flushPromises(5);
    return screen;
  }

  it("is left out: the frame's navigation is the way around it", async () => {
    const page = await mountStaffFrame();

    click(requireIn(page.container, TRIGGER));

    const menu = requireIn(document.body, MENU);
    expect(staffAreaEntryIn(menu)).toBeUndefined();
    expect(allIn(menu, "a[href]").map((link) => link.textContent)).toEqual([
      roMessages.accountControl.profile,
    ]);
  });

  it("is left out when the host says so, and drawn when the host says nothing", async () => {
    const asked = await openedMenuFor(OPERATOR);
    expect(staffAreaEntryIn(asked)).not.toBeUndefined();
    screen?.unmount();
    document.body.replaceChildren();
    resetAccountSessionForTests();

    const page = await mountControl(OPERATOR, { staffAreaEntry: "omitted" });
    click(requireIn(page.container, TRIGGER));

    expect(staffAreaEntryIn(requireIn(document.body, MENU))).toBeUndefined();
  });
});

describe("the width of the control the top bar's fit is measured with", () => {
  const SIGNED_IN_SESSIONS = [
    ["a client", CLIENT],
    ["an operator", OPERATOR],
    ["an administrator", ADMINISTRATOR],
    ["an unverified staff account", UNVERIFIED_OPERATOR],
  ] as const;

  async function cellOf(session: unknown): Promise<string> {
    const page = await mountControl(session);
    const cell = requireIn(page.container, CELL).outerHTML;
    page.unmount();
    screen = undefined;
    document.body.replaceChildren();
    resetAccountSessionForTests();
    return cell;
  }

  // happy-dom lays nothing out, so a measured width would be zero for every session. What fixes the width is the markup
  // the stylesheet is given, and that is what is compared: if the entry (or anything else) stood in the cell, or the
  // trigger's classes differed, these would differ.
  it("is drawn from the same markup for a staff session as for a client", async () => {
    const clientCell = await cellOf(CLIENT);

    for (const [, session] of SIGNED_IN_SESSIONS) {
      expect(await cellOf(session)).toBe(clientCell);
    }
  });

  it("is the glyph in both of the fit model's probes for a staff session, as for a client", async () => {
    for (const [, session] of SIGNED_IN_SESSIONS) {
      answerWith(session);
      const text = createRef<HTMLSpanElement>();
      const icon = createRef<HTMLSpanElement>();
      screen = mountInCatalogue(
        createElement(
          "div",
          null,
          createElement(AccountControl, { cellClassName: "cell" }),
          createElement(AccountFormProbes, { textRef: text, iconRef: icon }),
        ),
      );
      await flushPromises(5);

      expect(text.current?.getAttribute("data-form")).toBe("icon");
      expect(icon.current?.getAttribute("data-form")).toBe("icon");
      screen.unmount();
      screen = undefined;
      document.body.replaceChildren();
      resetAccountSessionForTests();
    }
  });
});

describe("who the menu says is signed in (frame S1E)", () => {
  const IDENTITY_LABEL = {
    ro: roMessages.accountControl.signedInAs,
    ru: ruMessages.accountControl.signedInAs,
  } as const;

  it.each(["ro", "ru"] as const)(
    "%s: names a staff member by address above the rows, as a client is named",
    async (locale) => {
      const menu = await openedMenuFor(OPERATOR, locale);

      expect(menu.textContent).toContain(IDENTITY_LABEL[locale]);
      expect(menu.textContent).toContain(ADDRESS);
    },
  );

  it("names a staff member who may not enter the staff area too", async () => {
    const menu = await openedMenuFor(UNVERIFIED_OPERATOR);

    expect(menu.textContent).toContain(ADDRESS);
  });

  it("gives staff no row for 'my kitchens', which a staff account has none of, and a client keeps it", async () => {
    const staffMenu = await openedMenuFor(OPERATOR);
    expect(staffMenu.textContent).not.toContain(
      roMessages.accountControl.myKitchens,
    );
    screen?.unmount();
    resetAccountSessionForTests();

    const clientMenu = await openedMenuFor(CLIENT);

    expect(clientMenu.textContent).toContain(
      roMessages.accountControl.myKitchens,
    );
    expect(clientMenu.textContent).toContain(ADDRESS);
  });
});
