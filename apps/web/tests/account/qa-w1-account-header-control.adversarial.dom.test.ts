// @vitest-environment happy-dom
// The profile icon in the account pages' header: which pages draw it, for which sessions, where its menu opens (the
// header stands beside the page's `<main>`, so the menu is found from the document), and that the three hosts that
// already stand inside a `<main>` are left as they were.
import { ROLES } from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenScreen } from "@/account/forbidden-screen";
import { AccountNotFound } from "@/account/account-not-found";
import { AccountShell } from "@/account/account-shell";
import { AccountControl } from "@/account/session/account-control";
import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { ExportUnavailableScreen } from "@/account/profile/export-screen";
import { ProfileUnavailableScreen } from "@/account/profile/profile-form";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";

const TRIGGER = '[data-testid="top-bar-account-trigger"]';
const MENU = '[data-testid="top-bar-account-menu"]';
const CELL = '[data-testid="top-bar-account"]';
const SIGN_IN = '[data-testid="top-bar-account-sign-in"]';
const ADDRESS = "ana.client@lemnaria.md";
const SESSION_PATH = "/api/account/session";

let screen: MountedScreen | undefined;
let consoleErrors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetAccountSessionForTests();
  consoleErrors = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  expect(consoleErrors).not.toHaveBeenCalled();
  consoleErrors.mockRestore();
});

function stubSessionAnswer(
  answer: () => Promise<Response>,
): ReturnType<typeof vi.fn> {
  const fetchStub = vi.fn(answer);
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

const jsonResponse = (body: unknown, status = 200): Promise<Response> =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

const signedIn = (capabilities: readonly string[]) => ({
  state: "signed-in",
  email: ADDRESS,
  capabilities,
});

async function mountShell(
  locale: TestLocale = "ro",
  hasAccountControl = true,
): Promise<MountedScreen> {
  screen = mountInCatalogue(
    createElement(AccountShell, {
      locale,
      page: "kitchens",
      hasAccountControl,
      children: createElement("p", null, "content"),
    }),
    locale,
  );
  await flushPromises(5);
  return screen;
}

describe("the control for each kind of session, in the account header", () => {
  it("draws a visitor's sign-in as the icon, leading to the login of this language, with no menu", async () => {
    stubSessionAnswer(() => jsonResponse({ state: "anonymous" }));
    const page = await mountShell("ro");

    const link = requireIn<HTMLAnchorElement>(page.container, SIGN_IN);

    expect(link.getAttribute("href")).toBe("/ro/account/login");
    expect(link.getAttribute("data-form")).toBe("icon");
    expect(link.getAttribute("aria-label")).toBe(
      roMessages.accountControl.signIn,
    );
    expect(page.container.querySelector(TRIGGER)).toBeNull();
  });

  it.each([
    ["a failed request", () => Promise.reject(new Error("offline"))],
    ["a 503", () => jsonResponse({}, 503)],
    ["a 401", () => jsonResponse({}, 401)],
    ["a body that is not the session's shape", () => jsonResponse(["x"])],
    [
      "a signed-in body with no capabilities",
      () => jsonResponse({ state: "signed-in", email: ADDRESS }),
    ],
  ])(
    "falls back to the sign-in icon on %s, and the header stays whole",
    async (_case, answer) => {
      stubSessionAnswer(answer);
      const page = await mountShell();

      expect(page.container.querySelector(SIGN_IN)).not.toBeNull();
      expect(page.container.querySelector(TRIGGER)).toBeNull();
      expect(
        page.container.querySelector("header a[href='/ro']"),
      ).not.toBeNull();
      expect(page.container.querySelector("header nav a")).not.toBeNull();
    },
  );

  it("reserves the sign-in glyph, not words, while the session is unanswered", async () => {
    stubSessionAnswer(() => new Promise<Response>(() => undefined));
    const page = await mountShell();

    const pending = requireIn(page.container, CELL).firstElementChild;

    expect(pending?.getAttribute("data-form")).toBe("icon");
    expect(pending?.getAttribute("aria-hidden")).toBe("true");
  });

  it("gives a client the icon, with their kitchens and profile in this language's paths, and no staff area", async () => {
    stubSessionAnswer(() => jsonResponse(signedIn(ROLES.client)));
    const page = await mountShell("ru");

    click(requireIn(page.container, TRIGGER));

    const menu = requireIn(document.body, MENU);
    const hrefs = allIn<HTMLAnchorElement>(menu, "a").map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual(["/ru/account/kitchens", "/ru/account/profile"]);
    expect(menu.textContent).toContain(ruMessages.accountControl.myKitchens);
    expect(page.container.querySelector(SIGN_IN)).toBeNull();
  });

  it("gives staff the icon with the staff area and the profile, and no kitchens row, since staff have none", async () => {
    stubSessionAnswer(() => jsonResponse(signedIn(ROLES.operator)));
    const page = await mountShell();

    click(requireIn(page.container, TRIGGER));

    const menu = requireIn(document.body, MENU);
    const hrefs = allIn<HTMLAnchorElement>(menu, "a").map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toContain("/ro/account/profile");
    expect(hrefs.some((href) => href?.startsWith("/ro/staff"))).toBe(true);
    expect(hrefs).not.toContain("/ro/account/kitchens");
  });

  it("offers no staff area to an account that lists only its own sign-in details", async () => {
    stubSessionAnswer(() => jsonResponse(signedIn(["account.manage.own"])));
    const page = await mountShell();

    click(requireIn(page.container, TRIGGER));

    const hrefs = allIn<HTMLAnchorElement>(
      requireIn(document.body, MENU),
      "a",
    ).map((a) => a.getAttribute("href"));
    expect(hrefs.some((href) => href?.startsWith("/ro/staff"))).toBe(false);
  });
});

describe("the header's order and what stays operable", () => {
  it("puts the control after the wordmark and before the language link, so Tab meets it in that order", async () => {
    stubSessionAnswer(() => jsonResponse(signedIn(ROLES.client)));
    const page = await mountShell();

    const header = requireIn(page.container, "header");
    const children = [...header.children];
    const cellAt = children.findIndex((child) => child.matches(CELL));
    const navAt = children.findIndex((child) => child.tagName === "NAV");

    expect(cellAt).toBeGreaterThan(0);
    expect(navAt).toBe(cellAt + 1);
    expect(children[cellAt]?.className).toContain("navAccount");
    expect(children[0]?.tagName).toBe("A");
  });

  it("draws the control once, with one session request, whatever the number of renders", async () => {
    const fetchStub = stubSessionAnswer(() =>
      jsonResponse(signedIn(ROLES.client)),
    );
    const page = await mountShell();
    await mountShellAgain(page);

    expect(allIn(document.body, CELL)).toHaveLength(2);
    expect(
      fetchStub.mock.calls.filter(([address]) => address === SESSION_PATH),
    ).toHaveLength(1);
  });

  it("returns focus to the icon when Escape closes the menu, whether or not the press focused it", async () => {
    stubSessionAnswer(() => jsonResponse(signedIn(ROLES.client)));
    const page = await mountShell();
    const trigger = requireIn(page.container, TRIGGER);

    trigger.focus();
    click(trigger);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.querySelector(MENU)).toBeNull();
    expect(document.activeElement).toBe(trigger);

    (document.activeElement as HTMLElement).blur();
    click(trigger);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.querySelector(MENU)).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("returns focus to the icon when the Inchide button closes the menu, and lifts the inert content", async () => {
    stubSessionAnswer(() => jsonResponse(signedIn(ROLES.client)));
    const page = await mountShell();
    const trigger = requireIn(page.container, TRIGGER);
    trigger.focus();
    click(trigger);

    click(
      byWords(
        requireIn(document.body, MENU),
        "button",
        roMessages.accountControl.close,
      ),
    );

    expect(document.activeElement).toBe(trigger);
    expect(document.querySelectorAll("[inert]")).toHaveLength(0);
  });

  it("keeps the menu's own host live and the content inert, and leaves the menu's trigger aria-expanded in step", async () => {
    stubSessionAnswer(() => jsonResponse(signedIn(ROLES.client)));
    const page = await mountShell();
    const trigger = requireIn(page.container, TRIGGER);

    click(trigger);

    const main = requireIn(page.container, "main");
    const host = requireIn(document.body, MENU).parentElement;
    expect(main.contains(host)).toBe(true);
    expect(host?.hasAttribute("inert")).toBe(false);
    expect(main.querySelector(":scope > div[inert]")).not.toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens the question about every device in the same main, holding the content inert, and closes it on Anuleaza", async () => {
    stubSessionAnswer(() => jsonResponse(signedIn(ROLES.client)));
    const page = await mountShell();
    click(requireIn(page.container, TRIGGER));

    click(
      byWords(
        requireIn(document.body, MENU),
        "button",
        roMessages.accountControl.signOutEverywhere,
      ),
    );

    const dialog = requireIn(document.body, "[role=alertdialog]");
    expect(requireIn(page.container, "main").contains(dialog)).toBe(true);
    expect(document.querySelector(MENU)).toBeNull();
    expect(document.querySelectorAll("main > div[inert]")).toHaveLength(1);

    click(byWords(dialog, "button", roMessages.logoutEverywhere.cancel));
    expect(document.querySelectorAll("[inert]")).toHaveLength(0);
  });

  it("leaves for the start of the configurator after Iesi din cont, and shows the sign-in icon meanwhile", async () => {
    const assigned: string[] = [];
    vi.stubGlobal("location", {
      assign: (address: string) => assigned.push(address),
    });
    const fetchStub = vi.fn((address: string) =>
      address === "/api/account/logout"
        ? Promise.resolve(new Response(null, { status: 204 }))
        : jsonResponse(signedIn(ROLES.client)),
    );
    vi.stubGlobal("fetch", fetchStub);
    const page = await mountShell("ru");

    click(requireIn(page.container, TRIGGER));
    click(
      byWords(
        requireIn(document.body, MENU),
        "button",
        ruMessages.accountControl.signOutHere,
      ),
    );
    await flushPromises(5);

    expect(assigned).toEqual(["/ru"]);
    expect(page.container.querySelector(SIGN_IN)).not.toBeNull();
  });
});

async function mountShellAgain(first: MountedScreen): Promise<void> {
  const second = mountInCatalogue(
    createElement(AccountShell, {
      locale: "ro",
      page: "kitchens",
      hasAccountControl: true,
      children: createElement("p", null, "content"),
    }),
  );
  await flushPromises(5);
  const firstUnmount = first.unmount;
  screen = {
    container: first.container,
    unmount: () => {
      second.unmount();
      firstUnmount();
    },
  };
}

describe("the pages that must not get the control", () => {
  it.each([
    [
      "the forbidden screen",
      () => createElement(ForbiddenScreen, { locale: "ro" }),
    ],
    [
      "the 404 of an unknown account address",
      () => createElement(AccountNotFound),
    ],
    [
      "the profile's unavailable screen",
      () => createElement(ProfileUnavailableScreen, { locale: "ro" }),
    ],
    [
      "the export's unavailable screen",
      () => createElement(ExportUnavailableScreen, { locale: "ro" }),
    ],
  ])(
    "%s draws no control and asks nothing of the session endpoint",
    async (_page, element) => {
      const fetchStub = stubSessionAnswer(() =>
        jsonResponse(signedIn(ROLES.client)),
      );
      screen = mountInCatalogue(element());
      await flushPromises(5);

      expect(document.querySelector(CELL)).toBeNull();
      expect(document.querySelector(TRIGGER)).toBeNull();
      expect(document.querySelector(SIGN_IN)).toBeNull();
      expect(fetchStub).not.toHaveBeenCalled();
    },
  );
});

describe("where the menu opens, for a trigger in or out of a main", () => {
  async function mountHost(structure: {
    readonly mainsBefore: number;
    readonly isInsideMain: boolean;
    readonly mainsAfter: number;
  }): Promise<{ readonly mains: HTMLElement[] }> {
    stubSessionAnswer(() => jsonResponse(signedIn(ROLES.client)));
    const mains: HTMLElement[] = [];
    const placeMain = (): HTMLElement => {
      const main = document.createElement("main");
      main.append(document.createElement("div"));
      document.body.append(main);
      mains.push(main);
      return main;
    };
    for (let index = 0; index < structure.mainsBefore; index += 1) placeMain();
    const hostParent = structure.isInsideMain ? placeMain() : document.body;
    const mountPoint = document.createElement("div");
    hostParent.append(mountPoint);
    for (let index = 0; index < structure.mainsAfter; index += 1) placeMain();
    const mounted = mountInCatalogue(
      createElement(AccountControl, { cellClassName: "cell" }),
    );
    mountPoint.append(mounted.container);
    screen = mounted;
    await flushPromises(5);
    return { mains };
  }

  it("opens in the main that holds the trigger, even when another main comes first in the document", async () => {
    const { mains } = await mountHost({
      mainsBefore: 1,
      isInsideMain: true,
      mainsAfter: 0,
    });

    click(requireIn(document.body, TRIGGER));

    expect(mains[1]?.querySelector(MENU)).not.toBeNull();
    expect(mains[0]?.querySelector(MENU)).toBeNull();
  });

  it("opens in the document's first main for a trigger outside every main, with two on the page", async () => {
    const { mains } = await mountHost({
      mainsBefore: 0,
      isInsideMain: false,
      mainsAfter: 2,
    });

    click(requireIn(document.body, TRIGGER));

    expect(mains[0]?.querySelector(MENU)).not.toBeNull();
    expect(mains[1]?.querySelector(MENU)).toBeNull();
  });

  it("opens in the body for a document with no main, as before, and says the page behind could not go inert", async () => {
    await mountHost({ mainsBefore: 0, isInsideMain: false, mainsAfter: 0 });

    click(requireIn(document.body, TRIGGER));

    const menu = requireIn(document.body, MENU);
    expect(menu.closest("main")).toBeNull();
    expect(consoleErrors).toHaveBeenCalledOnce();
    consoleErrors.mockClear();
  });

  it("holds exactly one menu open, in one main, after the trigger is pressed twice", async () => {
    await mountHost({ mainsBefore: 0, isInsideMain: false, mainsAfter: 1 });
    const trigger = requireIn(document.body, TRIGGER);

    click(trigger);
    click(trigger);

    expect(document.querySelectorAll(MENU)).toHaveLength(1);
  });
});
