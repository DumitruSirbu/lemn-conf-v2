// @vitest-environment happy-dom
// The account shell's profile icon is opt-in, and its menu opens in the page's `<main>` although the header is outside it.
import { ROLES } from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountShell, type AccountShellProps } from "@/account/account-shell";
import { resetAccountSessionForTests } from "@/account/session/use-account-session";

import roMessages from "../../src/messages/ro.json";
import { flushPromises } from "../support/render-hook";
import {
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
} from "../support/render-with-intl";

const TRIGGER = '[data-testid="top-bar-account-trigger"]';
const MENU = '[data-testid="top-bar-account-menu"]';
const CELL = '[data-testid="top-bar-account"]';
const ADDRESS = "ana.client@lemnaria.md";

let screen: MountedScreen | undefined;

beforeEach(() => {
  resetAccountSessionForTests();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function answerWithSession(session: unknown): void {
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

const CLIENT_SESSION = {
  state: "signed-in",
  email: ADDRESS,
  capabilities: ROLES.client,
};

async function mountShell(options: {
  readonly hasAccountControl?: boolean;
}): Promise<MountedScreen> {
  const children = createElement(
    "p",
    { "data-testid": "page-content" },
    "content",
  );
  const props: AccountShellProps =
    options.hasAccountControl === undefined
      ? { locale: "ro", page: "kitchens", children }
      : {
          locale: "ro",
          page: "kitchens",
          hasAccountControl: options.hasAccountControl,
          children,
        };
  screen = mountInCatalogue(createElement(AccountShell, props));
  await flushPromises(5);
  return screen;
}

describe("the profile icon in the account header", () => {
  it("stands in the header, beside the language link, for a signed-in client", async () => {
    answerWithSession(CLIENT_SESSION);
    const page = await mountShell({ hasAccountControl: true });

    const header = requireIn(page.container, "header");

    expect(header.querySelector(TRIGGER)).not.toBeNull();
    expect(header.querySelector("nav a")?.textContent).toContain("RU");
    expect(page.container.querySelector("main " + TRIGGER)).toBeNull();
  });

  it("is absent, with no session request made, unless the page asks for it", async () => {
    answerWithSession(CLIENT_SESSION);
    const page = await mountShell({});

    expect(page.container.querySelector(CELL)).toBeNull();
    expect(page.container.querySelector(TRIGGER)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("opens its menu in the page's <main>, which is where the screen goes inert from", async () => {
    answerWithSession(CLIENT_SESSION);
    const page = await mountShell({ hasAccountControl: true });

    click(requireIn(page.container, TRIGGER));

    const main = requireIn(page.container, "main");
    const menu = requireIn(document.body, MENU);
    expect(main.contains(menu)).toBe(true);
    expect(menu.textContent).toContain(ADDRESS);
  });

  it("makes the page's content inert while the menu is open and lifts it on close, without an inert warning", async () => {
    answerWithSession(CLIENT_SESSION);
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const page = await mountShell({ hasAccountControl: true });
    const card = requireIn(page.container, "main > div");

    click(requireIn(page.container, TRIGGER));

    expect(card.hasAttribute("inert")).toBe(true);
    expect(errors).not.toHaveBeenCalled();

    click(
      byWords(
        requireIn(document.body, MENU),
        "button",
        roMessages.accountControl.close,
      ),
    );
    expect(card.hasAttribute("inert")).toBe(false);
  });

  it("shows a client the way back to their kitchens and their profile, and the way out", async () => {
    answerWithSession(CLIENT_SESSION);
    const page = await mountShell({ hasAccountControl: true });

    click(requireIn(page.container, TRIGGER));

    const menu = requireIn(document.body, MENU);
    const copy = roMessages.accountControl;
    expect(menu.textContent).toContain(copy.myKitchens);
    expect(menu.textContent).toContain(copy.profile);
    expect(menu.textContent).toContain(copy.signOutHere);
  });

  it("reserves the glyph, not the sign-in words, while the answer is awaited, so the header does not move when it arrives", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    const page = await mountShell({ hasAccountControl: true });

    const pending = requireIn(page.container, CELL).firstElementChild;

    expect(pending?.getAttribute("data-form")).toBe("icon");
  });
});
