// @vitest-environment happy-dom
//
// **Adversarial QA of wave L3-U1, the staff frame (plan M8B Lot 3, K-12, frames S1B, S1D).**
//
// The developer's file holds the sheet's happy path. This one holds what happens around it: a sign-out that is still
// out when the sheet closes, the second dialog the sheet hands over to, a retry after a refused sign-out, the Tab ring
// across the sheet's three possible sizes, and an unmount in the middle of it all. Declared CSS (the 44 and 48 px
// targets) is checked as written in the developer's file, not here: no layout runs in this environment.
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import {
  StaffShell,
  type StaffPage,
  type StaffRole,
  type StaffShellContext,
} from "@/staff/staff-shell";

import roMessages from "../../src/messages/ro.json";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
} from "../support/render-with-intl";

const ADDRESS = "mihai.rusu@lemnaria.md";
const MENU_BUTTON = '[data-testid="staff-menu-button"]';
const SHEET = '[data-testid="staff-menu-sheet"]';
const DIALOG = '[role="alertdialog"]';
const LOGOUT_PATH = "/api/account/logout";
const STAFF_SESSION = {
  state: "signed-in",
  email: ADDRESS,
  capabilities: ["design.read.any", "account.manage.own"],
};

interface PendingLogout {
  readonly scope: unknown;
  readonly answer: (status: number) => void;
}

let screen: MountedScreen | undefined;
let assignedAddresses: string[];
let logoutRequests: PendingLogout[];

beforeEach(() => {
  resetAccountSessionForTests();
  assignedAddresses = [];
  logoutRequests = [];
  vi.stubGlobal("location", {
    assign: (address: string) => assignedAddresses.push(address),
  });
  vi.stubGlobal("fetch", vi.fn(serverThatHoldsLogouts));
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** The session route answers at once; a logout waits until the test says what the server decided. */
function serverThatHoldsLogouts(
  address: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  if (address !== LOGOUT_PATH) {
    return Promise.resolve(
      new Response(JSON.stringify(STAFF_SESSION), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }
  return new Promise((resolve) => {
    logoutRequests.push({
      scope: JSON.parse(
        typeof init?.body === "string" ? init.body : "{}",
      ) as unknown,
      answer: (status) => {
        resolve(new Response(status === 204 ? null : "{}", { status }));
      },
    });
  });
}

function contextOf(
  role: StaffRole,
  navigation: readonly StaffPage[],
): StaffShellContext {
  return { role, email: ADDRESS, navigation };
}

async function mountShell(
  context: StaffShellContext = contextOf("administrator", [
    "kitchens",
    "audit",
  ]),
): Promise<void> {
  screen = mountInCatalogue(
    createElement(StaffShell, {
      locale: "ro",
      page: "kitchens",
      context,
      children: createElement("h1", null, "the page"),
    }),
    "ro",
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

async function settle(): Promise<void> {
  await flushPromises(5);
}

function bandsBehind(dialogSelector: string): Element[] {
  const main = requireIn(container(), "main");
  return [...main.children].filter(
    (band) => band.querySelector(dialogSelector) === null,
  );
}

function openLogoutEverywhere(): void {
  const sheet = openSheet();
  click(byWords(sheet, "button", roMessages.accountControl.signOutEverywhere));
}

describe("the question 'sign out everywhere', which the sheet hands over to", () => {
  it("replaces the sheet, never stacks on it, and holds the bar and the body inert", async () => {
    await mountShell();

    openLogoutEverywhere();

    expect(allIn(container(), SHEET)).toHaveLength(0);
    expect(allIn(container(), DIALOG)).toHaveLength(1);
    const behind = bandsBehind(DIALOG);
    expect(behind.length).toBeGreaterThanOrEqual(2);
    expect(behind.map((band) => band.hasAttribute("inert"))).toEqual(
      behind.map(() => true),
    );
  });

  it("closes on one Escape, does not bring the sheet back, lifts the inertness and gives focus to the Meniu button", async () => {
    await mountShell();
    openLogoutEverywhere();
    const behind = bandsBehind(DIALOG);

    press("Escape");

    expect(allIn(container(), DIALOG)).toHaveLength(0);
    expect(allIn(container(), SHEET)).toHaveLength(0);
    expect(behind.some((band) => band.hasAttribute("inert"))).toBe(false);
    expect(document.activeElement).toBe(menuButton());
    expect(logoutRequests).toHaveLength(0);
  });

  it("closes on its cancel the same way, and the Meniu button opens the sheet again", async () => {
    await mountShell();
    openLogoutEverywhere();

    click(byWords(container(), "button", roMessages.logoutEverywhere.cancel));

    expect(allIn(container(), DIALOG)).toHaveLength(0);
    expect(document.activeElement).toBe(menuButton());
    click(menuButton());
    expect(allIn(container(), SHEET)).toHaveLength(1);
  });

  it("does not let Escape close it while the request is out, and sends one request however often confirm is pressed", async () => {
    await mountShell();
    openLogoutEverywhere();
    const confirm = byWords(
      container(),
      "button",
      roMessages.logoutEverywhere.confirm,
    );

    click(confirm);
    click(confirm);
    press("Escape");

    expect(logoutRequests.map((request) => request.scope)).toEqual([
      { scope: "everywhere" },
    ]);
    expect(allIn(container(), DIALOG)).toHaveLength(1);
  });
});

describe("'sign out here' from the sheet, while the server is slow and when it refuses", () => {
  function signOutHereRow(): HTMLButtonElement {
    return byWords<HTMLButtonElement>(
      requireIn(container(), SHEET),
      "button",
      roMessages.accountControl.signOutHere,
    );
  }

  function signOutEverywhereRow(): HTMLButtonElement {
    return byWords<HTMLButtonElement>(
      requireIn(container(), SHEET),
      "button",
      roMessages.accountControl.signOutEverywhere,
    );
  }

  it("sends one request for a double press, and marks both rows busy without taking them out of the Tab ring", async () => {
    await mountShell();
    openSheet();

    click(signOutHereRow());
    click(signOutHereRow());
    click(signOutEverywhereRow());

    expect(logoutRequests.map((request) => request.scope)).toEqual([
      { scope: "this-device" },
    ]);
    expect(signOutHereRow().getAttribute("aria-disabled")).toBe("true");
    expect(signOutEverywhereRow().getAttribute("aria-disabled")).toBe("true");
    expect(signOutHereRow().disabled).toBe(false);
    expect(allIn(container(), DIALOG)).toHaveLength(0);
  });

  it("after a refusal keeps the sheet, says so, frees both rows, and a retry sends a second request that can succeed", async () => {
    await mountShell();
    openSheet();
    click(signOutHereRow());

    logoutRequests[0]?.answer(503);
    await settle();

    expect(requireIn(container(), SHEET)).toBeDefined();
    expect(requireIn(container(), '[role="alert"]').textContent).toBe(
      roMessages.accountControl.signOutFailed,
    );
    expect(signOutHereRow().getAttribute("aria-disabled")).toBeNull();
    expect(signOutEverywhereRow().getAttribute("aria-disabled")).toBeNull();
    expect(assignedAddresses).toEqual([]);

    click(signOutHereRow());
    logoutRequests[1]?.answer(204);
    await settle();

    expect(logoutRequests).toHaveLength(2);
    expect(assignedAddresses).toEqual(["/ro"]);
  });

  it("clears the refusal's sentence the moment a retry is sent, so a stale error is not shown beside a pending one", async () => {
    await mountShell();
    openSheet();
    click(signOutHereRow());
    logoutRequests[0]?.answer(503);
    await settle();

    click(signOutHereRow());

    expect(container().querySelector('[role="alert"]')).toBeNull();
  });

  it("still leaves for the start of the configurator when the sheet was closed while the sign-out was out", async () => {
    await mountShell();
    openSheet();
    click(signOutHereRow());

    press("Escape");
    logoutRequests[0]?.answer(204);
    await settle();

    expect(container().querySelector(SHEET)).toBeNull();
    expect(assignedAddresses).toEqual(["/ro"]);
  });
});

describe("the Tab ring of the sheet, whatever it holds", () => {
  /** A browser's own Tab where the trap does not take it: the next stop in the document, no wrap. */
  function tabLikeABrowser(isBackwards: boolean): void {
    const stops = allIn(requireIn(container(), SHEET), "button, a[href]");
    const pressed = press("Tab", { shiftKey: isBackwards });
    if (pressed.defaultPrevented) return;
    const at = stops.findIndex((stop) => stop === document.activeElement);
    const next = stops[isBackwards ? at - 1 : at + 1];
    next?.focus();
  }

  /** The element holding focus after each press, each of which must still be inside the sheet. */
  function tabThrough({
    sheet,
    presses,
    isBackwards = false,
  }: {
    sheet: HTMLElement;
    presses: number;
    isBackwards?: boolean;
  }): Element[] {
    return Array.from({ length: presses }, () => {
      tabLikeABrowser(isBackwards);
      const focused = document.activeElement;
      expect(focused !== null && sheet.contains(focused)).toBe(true);
      return focused;
    }).filter((focused) => focused !== null);
  }

  it.each([
    ["no page built", [] as StaffPage[]],
    ["one page", ["kitchens"] as StaffPage[]],
    ["two pages", ["kitchens", "audit"] as StaffPage[]],
  ])(
    "with %s, Tab forward from the sheet visits every stop once per lap and never leaves the sheet",
    async (_label, navigation) => {
      await mountShell(contextOf("administrator", navigation));
      const sheet = openSheet();
      const stops = allIn(sheet, "button, a[href]");
      const visited = tabThrough({ sheet, presses: stops.length * 2 });

      expect(stops.length).toBe(navigation.length + 4);
      expect(visited.slice(0, stops.length)).toEqual(stops);
      expect(visited.slice(stops.length)).toEqual(stops);
    },
  );

  it.each([
    ["no page built", [] as StaffPage[]],
    ["two pages", ["kitchens", "audit"] as StaffPage[]],
  ])(
    "with %s, Shift+Tab visits the stops in reverse and never leaves the sheet",
    async (_label, navigation) => {
      await mountShell(contextOf("administrator", navigation));
      const sheet = openSheet();
      const stops = allIn(sheet, "button, a[href]");
      const visited = tabThrough({
        sheet,
        presses: stops.length,
        isBackwards: true,
      });

      expect(visited).toEqual([...stops].reverse());
    },
  );

  it("keeps Tab in the sheet while a sign-out is out, because the busy rows stay stops", async () => {
    await mountShell(contextOf("operator", ["kitchens"]));
    const sheet = openSheet();
    const stopsBefore = allIn(sheet, "button, a[href]").length;

    click(byWords(sheet, "button", roMessages.accountControl.signOutHere));

    expect(allIn(sheet, "button, a[href]")).toHaveLength(stopsBefore);
  });
});

describe("the frame going away while a surface is open", () => {
  it("leaves nothing inert and no Escape handler behind, so the next screen's sheet closes on one press", async () => {
    await mountShell();
    const main = requireIn(container(), "main");
    const bands = [...main.children];
    openSheet();

    screen?.unmount();
    screen = undefined;

    expect(bands.some((band) => band.hasAttribute("inert"))).toBe(false);
    document.body.replaceChildren();

    await mountShell();
    openSheet();
    press("Escape");
    expect(container().querySelector(SHEET)).toBeNull();
  });
});
