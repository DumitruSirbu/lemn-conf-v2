// @vitest-environment happy-dom
//
// The navigation is the server's decision, handed to the frame as page codes: the frame draws exactly those, as plain
// anchors in the page's language, and the phone's "Meniu" sheet is a modal that traps Tab, closes on Escape and the
// scrim, and gives focus back to its opener. The session and logout routes are a stubbed `fetch`.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import {
  StaffForbiddenScreen,
  StaffShell,
  type StaffPage,
  type StaffRole,
  type StaffShellContext,
} from "@/staff/staff-shell";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import { declarationsFor, valuesFor } from "../support/css-declarations";
import {
  allIn,
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const STAFF_ADDRESS = "mihai.rusu@lemnaria.md";
const MENU_BUTTON = '[data-testid="staff-menu-button"]';
const SHEET = '[data-testid="staff-menu-sheet"]';
const ROLE_CHIP = '[data-testid="staff-role-chip"]';
const DESKTOP_NAV = '[data-testid="staff-nav"]';
const STAFF_SESSION = {
  state: "signed-in",
  email: STAFF_ADDRESS,
  capabilities: ["design.read.any", "account.manage.own"],
};

let screen: MountedScreen | undefined;
let assignedAddresses: string[];

beforeEach(() => {
  resetAccountSessionForTests();
  assignedAddresses = [];
  vi.stubGlobal("location", {
    assign: (address: string) => assignedAddresses.push(address),
  });
  vi.stubGlobal("fetch", vi.fn(serverAnswer));
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function serverAnswer(address: string | URL | Request): Promise<Response> {
  const path = typeof address === "string" ? address : "";
  if (path === "/api/account/logout") {
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  return Promise.resolve(
    new Response(JSON.stringify(STAFF_SESSION), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

function contextOf(
  role: StaffRole,
  navigation: readonly StaffPage[],
): StaffShellContext {
  return { role, email: STAFF_ADDRESS, navigation };
}

async function mountShell({
  locale = "ro",
  page = "kitchens",
  context = contextOf("operator", ["kitchens"]),
}: {
  locale?: TestLocale;
  page?: StaffPage;
  context?: StaffShellContext;
} = {}): Promise<void> {
  screen = mountInCatalogue(
    createElement(StaffShell, {
      locale,
      page,
      context,
      children: createElement("h1", null, "the page"),
    }),
    locale,
  );
  await flushPromises(5);
}

function container(): HTMLElement {
  if (screen === undefined) throw new Error("nothing is mounted");
  return screen.container;
}

function menuButton(): HTMLButtonElement {
  return requireIn<HTMLButtonElement>(container(), MENU_BUTTON);
}

function openSheet(): HTMLElement {
  menuButton().focus();
  click(menuButton());
  return requireIn(container(), SHEET);
}

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    (document.activeElement ?? document).dispatchEvent(event);
  });
  return event;
}

function sheetStops(): HTMLElement[] {
  return allIn(requireIn(container(), SHEET), "button, a[href]");
}

function firstAndLastStop(): { first: HTMLElement; last: HTMLElement } {
  const stops = sheetStops();
  const first = stops.at(0);
  const last = stops.at(-1);
  if (first === undefined || last === undefined) {
    throw new Error("the sheet has no stop to reach");
  }
  return { first, last };
}

describe("the frame", () => {
  it.each(LOCALES)(
    "%s: names the role the person acts under in the bar",
    async (locale) => {
      await mountShell({ locale, context: contextOf("administrator", []) });

      expect(requireIn(container(), ROLE_CHIP).textContent).toBe(
        CATALOGUES[locale].staffShell.roleAdministrator,
      );
    },
  );

  it("names an operator as an operator", async () => {
    await mountShell({ context: contextOf("operator", ["kitchens"]) });

    expect(requireIn(container(), ROLE_CHIP).textContent).toBe(
      roMessages.staffShell.roleOperator,
    );
  });

  it("is one <main> whose direct children are the bar and the body, so a dialog can make them inert", async () => {
    await mountShell();

    const main = requireIn(container(), "main");

    expect(allIn(container(), "main")).toHaveLength(1);
    expect([...main.children].map((band) => band.className)).toEqual([
      expect.stringContaining("topBar"),
      expect.stringContaining("body"),
    ]);
    expect(requireIn(container(), MENU_BUTTON).closest("main")).toBe(main);
    expect(requireIn(container(), "h1").closest("main")).toBe(main);
  });

  it("hosts the account control in its bar, which asks the server who is signed in", async () => {
    await mountShell();

    expect(
      container().querySelector('[data-testid="top-bar-account-trigger"]'),
    ).not.toBeNull();
  });

  it.each(LOCALES)(
    "%s: links the other language to the same page, as a plain anchor",
    async (locale) => {
      await mountShell({ locale, page: "kitchens" });

      const other = locale === "ro" ? "ru" : "ro";
      const link = requireIn<HTMLAnchorElement>(
        container(),
        `a[hreflang="${other}"]`,
      );

      expect(link.getAttribute("href")).toBe(`/${other}/staff/kitchens`);
      expect(link.getAttribute("lang")).toBe(other);
    },
  );
});

describe("the desktop navigation", () => {
  it.each(LOCALES)(
    "%s: lists exactly the pages the server handed it, in its order, as plain anchors in the page's language",
    async (locale) => {
      await mountShell({
        locale,
        page: "audit",
        context: contextOf("administrator", ["kitchens", "audit"]),
      });

      const nav = requireIn(container(), DESKTOP_NAV);
      const links = allIn<HTMLAnchorElement>(nav, "a");

      expect(nav.getAttribute("aria-label")).toBe(
        CATALOGUES[locale].staffShell.areaName,
      );
      expect(links.map((link) => link.textContent)).toEqual([
        CATALOGUES[locale].staffShell.navKitchens,
        CATALOGUES[locale].staffShell.navAudit,
      ]);
      expect(links.map((link) => link.getAttribute("href"))).toEqual([
        `/${locale}/staff/kitchens`,
        `/${locale}/staff/audit`,
      ]);
    },
  );

  it("marks the page being shown as the current one, and no other", async () => {
    await mountShell({
      page: "audit",
      context: contextOf("administrator", ["kitchens", "audit"]),
    });

    const current = allIn(container(), `${DESKTOP_NAV} a[aria-current]`);

    expect(current.map((link) => link.textContent)).toEqual([
      roMessages.staffShell.navAudit,
    ]);
  });

  it("gives an operator the kitchens page and nothing of the administrator's", async () => {
    await mountShell({ context: contextOf("operator", ["kitchens"]) });

    expect(
      allIn(container(), `${DESKTOP_NAV} a`).map((a) => a.textContent),
    ).toEqual([roMessages.staffShell.navKitchens]);
    expect(container().textContent).not.toContain(
      roMessages.staffShell.navAudit,
    );
  });

  it("draws no navigation landmark when no page is built, rather than an empty one", async () => {
    await mountShell({ context: contextOf("operator", []) });

    expect(container().querySelector(DESKTOP_NAV)).toBeNull();
  });
});

describe("the phone's Meniu sheet", () => {
  it("is closed until the button is pressed, and the button says so", async () => {
    await mountShell();

    expect(container().querySelector(SHEET)).toBeNull();
    expect(menuButton().getAttribute("aria-expanded")).toBe("false");
    expect(menuButton().getAttribute("aria-label")).toBe(
      roMessages.staffShell.menu,
    );
  });

  it.each(LOCALES)(
    "%s: opens a modal dialog named Meniu that holds the account, the role and the pages",
    async (locale) => {
      await mountShell({
        locale,
        context: contextOf("administrator", ["kitchens", "audit"]),
      });

      const sheet = openSheet();
      const words = CATALOGUES[locale];

      expect(sheet.getAttribute("role")).toBe("dialog");
      expect(sheet.getAttribute("aria-modal")).toBe("true");
      expect(sheet.getAttribute("aria-label")).toBe(words.staffShell.menu);
      expect(menuButton().getAttribute("aria-expanded")).toBe("true");
      expect(sheet.textContent).toContain(STAFF_ADDRESS);
      expect(sheet.textContent).toContain(
        `${words.staffShell.roleLabel} ${words.staffShell.roleAdministrator}`,
      );
      expect(
        allIn<HTMLAnchorElement>(sheet, "nav a").map((a) =>
          a.getAttribute("href"),
        ),
      ).toEqual([`/${locale}/staff/kitchens`, `/${locale}/staff/audit`]);
    },
  );

  it("holds an operator's one page and no administrator item", async () => {
    await mountShell({ context: contextOf("operator", ["kitchens"]) });

    const sheet = openSheet();

    expect(allIn(sheet, "nav a").map((a) => a.textContent)).toEqual([
      roMessages.staffShell.navKitchens,
    ]);
    expect(sheet.textContent).not.toContain(roMessages.staffShell.navAudit);
  });

  it("keeps the profile and both ways out in the sheet, which the phone's bar has no account control for", async () => {
    await mountShell();

    const sheet = openSheet();

    expect(
      byWords(sheet, "a", roMessages.accountControl.profile).getAttribute(
        "href",
      ),
    ).toBe("/ro/account/profile");
    expect(
      byWords(sheet, "button", roMessages.accountControl.signOutHere),
    ).toBeDefined();
    expect(
      byWords(sheet, "button", roMessages.accountControl.signOutEverywhere),
    ).toBeDefined();
  });

  it("lands focus on the sheet itself when it opens", async () => {
    await mountShell();

    const sheet = openSheet();

    expect(document.activeElement).toBe(sheet);
  });

  it("makes the bar and the body inert while it is open, and lifts that when it closes", async () => {
    await mountShell();
    const main = requireIn(container(), "main");
    const bands = [...main.children].filter(
      (band) =>
        band.getAttribute("role") !== "dialog" && !band.querySelector(SHEET),
    );

    openSheet();
    const whileOpen = bands.map((band) => band.hasAttribute("inert"));
    press("Escape");

    expect(bands.length).toBeGreaterThanOrEqual(2);
    expect(whileOpen).toEqual(bands.map(() => true));
    expect(bands.some((band) => band.hasAttribute("inert"))).toBe(false);
  });

  it("closes on Escape and gives focus back to the button that opened it", async () => {
    await mountShell();
    openSheet();

    press("Escape");

    expect(container().querySelector(SHEET)).toBeNull();
    expect(document.activeElement).toBe(menuButton());
  });

  it("gives focus back to the button even where a press did not focus it (Safari, Firefox)", async () => {
    await mountShell();
    click(menuButton());
    expect(document.activeElement).toBe(requireIn(container(), SHEET));

    press("Escape");

    expect(document.activeElement).toBe(menuButton());
  });

  it("closes on the scrim and on its own close button", async () => {
    await mountShell();
    openSheet();
    click(requireIn(container(), '[aria-hidden="true"][class*="dialogScrim"]'));
    expect(container().querySelector(SHEET)).toBeNull();

    openSheet();
    click(
      byWords(
        requireIn(container(), SHEET),
        "button",
        roMessages.accountControl.close,
      ),
    );

    expect(container().querySelector(SHEET)).toBeNull();
    expect(document.activeElement).toBe(menuButton());
  });

  it("keeps Tab inside: from the last stop to the first, and Shift+Tab from the first to the last", async () => {
    await mountShell({
      context: contextOf("administrator", ["kitchens", "audit"]),
    });
    openSheet();
    const { first, last } = firstAndLastStop();

    last.focus();
    const forward = press("Tab");
    const landedFirst = document.activeElement;
    first.focus();
    const backward = press("Tab", { shiftKey: true });
    const landedLast = document.activeElement;

    expect(forward.defaultPrevented).toBe(true);
    expect(landedFirst).toBe(first);
    expect(backward.defaultPrevented).toBe(true);
    expect(landedLast).toBe(last);
  });

  it("sends Shift+Tab from the sheet itself to the last stop, not out to the inert bar", async () => {
    await mountShell();
    const sheet = openSheet();
    const { last } = firstAndLastStop();

    press("Tab", { shiftKey: true });

    expect(document.activeElement).not.toBe(sheet);
    expect(document.activeElement).toBe(last);
  });

  it("leaves Tab between two stops to the browser", async () => {
    await mountShell({
      context: contextOf("administrator", ["kitchens", "audit"]),
    });
    openSheet();
    firstAndLastStop().first.focus();

    expect(press("Tab").defaultPrevented).toBe(false);
  });

  it("ends the session here and leaves for the start of the configurator once the server has said so", async () => {
    await mountShell({ locale: "ru" });
    const sheet = openSheet();

    click(byWords(sheet, "button", ruMessages.accountControl.signOutHere));
    await flushPromises(5);

    expect(assignedAddresses).toEqual(["/ru"]);
  });

  it("stays on the page and says so when the server could not end the session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((address: string) =>
        address === "/api/account/logout"
          ? Promise.resolve(new Response("{}", { status: 503 }))
          : serverAnswer(address),
      ),
    );
    await mountShell();
    const sheet = openSheet();

    click(byWords(sheet, "button", roMessages.accountControl.signOutHere));
    await flushPromises(5);

    expect(assignedAddresses).toEqual([]);
    expect(requireIn(container(), '[role="alert"]').textContent).toBe(
      roMessages.accountControl.signOutFailed,
    );
  });

  it("tells the person the session is still live when the sheet was closed while the sign-out was out and the server refused", async () => {
    let refuse: () => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((address: string) =>
        address === "/api/account/logout"
          ? new Promise<Response>((resolve) => {
              refuse = () => {
                resolve(new Response("{}", { status: 503 }));
              };
            })
          : serverAnswer(address),
      ),
    );
    await mountShell();
    click(
      byWords(openSheet(), "button", roMessages.accountControl.signOutHere),
    );

    press("Escape");
    refuse();
    await flushPromises(5);

    expect(container().querySelector(SHEET)).toBeNull();
    expect(assignedAddresses).toEqual([]);
    expect(requireIn(container(), '[role="alert"]').textContent).toBe(
      roMessages.accountControl.signOutFailed,
    );
  });

  it("shows the refusal once: in the sheet while it is open, not also behind it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((address: string) =>
        address === "/api/account/logout"
          ? Promise.resolve(new Response("{}", { status: 503 }))
          : serverAnswer(address),
      ),
    );
    await mountShell();
    click(
      byWords(openSheet(), "button", roMessages.accountControl.signOutHere),
    );
    await flushPromises(5);

    expect(allIn(container(), '[role="alert"]')).toHaveLength(1);
    expect(
      requireIn(container(), SHEET).querySelector('[role="alert"]'),
    ).not.toBeNull();
  });

  it("hands 'sign out everywhere' to the question the screen draws, which is a dialog of its own", async () => {
    await mountShell();
    const sheet = openSheet();

    click(
      byWords(sheet, "button", roMessages.accountControl.signOutEverywhere),
    );

    expect(container().querySelector(SHEET)).toBeNull();
    expect(
      byWords(container(), "button", roMessages.logoutEverywhere.confirm),
    ).toBeDefined();
  });
});

describe("the 403 inside the frame (S1D)", () => {
  async function mountForbidden({
    locale = "ro",
    context = contextOf("operator", ["kitchens"]),
  }: { locale?: TestLocale; context?: StaffShellContext } = {}): Promise<void> {
    screen = mountInCatalogue(
      createElement(StaffForbiddenScreen, { locale, page: "audit", context }),
      locale,
    );
    await flushPromises(5);
  }

  it.each(LOCALES)(
    "%s: says the person may not open the page, never that the session expired",
    async (locale) => {
      await mountForbidden({ locale });

      const words = CATALOGUES[locale];

      expect(requireIn(container(), "h1").textContent).toBe(
        words.accountForbidden.title,
      );
      expect(container().textContent).toContain(words.accountForbidden.body);
      expect(container().textContent).not.toContain(
        words.sessionExpiredSheet.title,
      );
    },
  );

  it("keeps the frame and the navigation the role does have", async () => {
    await mountForbidden();

    expect(requireIn(container(), ROLE_CHIP).textContent).toBe(
      roMessages.staffShell.roleOperator,
    );
    expect(
      allIn(container(), `${DESKTOP_NAV} a`).map((a) => a.textContent),
    ).toEqual([roMessages.staffShell.navKitchens]);
  });

  it("leads back to the first page the person can open", async () => {
    await mountForbidden();

    const way = byWords(
      container(),
      "a",
      roMessages.staffShell.backTo.replace(
        "{name}",
        roMessages.staffShell.navKitchens,
      ),
    );

    expect(way.getAttribute("href")).toBe("/ro/staff/kitchens");
  });

  it("leads back to the configurator when no staff page is built to lead to", async () => {
    await mountForbidden({ context: contextOf("operator", []) });

    const way = byWords(
      container(),
      "a",
      roMessages.accountShell.backToConfigurator,
    );

    expect(way.getAttribute("href")).toBe("/ro");
  });
});

describe("the stylesheet source declares the targets a thumb must hit (reads the CSS text; no layout runs here)", () => {
  const staffCss = readFileSync(
    join(import.meta.dirname, "../../src/staff/staff.module.css"),
    "utf8",
  );
  const accountCss = readFileSync(
    join(import.meta.dirname, "../../src/account/account.module.css"),
    "utf8",
  );
  const TOUCH_TARGET = "var(--touch-target)";

  it("declares the Meniu button at least a touch target wide and tall", () => {
    expect(valuesFor(staffCss, "menuButton", "min-width")).toEqual([
      TOUCH_TARGET,
    ]);
    expect(valuesFor(staffCss, "menuButton", "min-height")).toEqual([
      TOUCH_TARGET,
    ]);
  });

  it("declares a language link at least a touch target wide and tall", () => {
    expect(valuesFor(staffCss, "localeChip", "min-width")).toEqual([
      TOUCH_TARGET,
    ]);
    expect(valuesFor(staffCss, "localeChip", "min-height")).toEqual([
      TOUCH_TARGET,
    ]);
  });

  it("declares a navigation item and the way back at least 48 px tall", () => {
    expect(valuesFor(staffCss, "navItem", "min-height")).toEqual(["48px"]);
    expect(valuesFor(staffCss, "primaryLink", "min-height")).toEqual(["48px"]);
  });

  it("declares the sheet's rows and its close button at least 48 px tall", () => {
    expect(valuesFor(accountCss, "menuRow", "min-height")).toEqual(["48px"]);
    expect(valuesFor(accountCss, "dialogAction", "min-height")).toEqual([
      "48px",
    ]);
  });

  it("declares the Meniu button off the desktop bar and the navigation off the phone's, and not the reverse", () => {
    expect(
      declarationsFor(staffCss, "menuButton", "display").map(
        ({ media, value }) => [media, value],
      ),
    ).toEqual([
      ["", "flex"],
      ["@media (min-width: 900px)", "none"],
    ]);
    expect(
      declarationsFor(staffCss, "nav", "display").map(({ media, value }) => [
        media,
        value,
      ]),
    ).toEqual([
      ["", "none"],
      ["@media (min-width: 900px)", "block"],
    ]);
  });
});
