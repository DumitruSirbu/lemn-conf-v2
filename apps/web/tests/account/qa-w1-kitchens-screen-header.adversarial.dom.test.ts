// @vitest-environment happy-dom
// The kitchens page's three frames (the list, the failed list, the screen the server gate draws when it cannot read the
// session) carry the profile icon; the forbidden screen, which replaces the page, does not.
import { ROLES } from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInOutcome } from "@/account/account-answer";
import { resetAccountSessionForTests } from "@/account/session/use-account-session";

import { wireKitchen, wirePage } from "../support/account-kitchens-wire";
import { flushPromises } from "../support/render-hook";
import {
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
} from "../support/render-with-intl";

const sendSignedInRequest = vi.hoisted(() => vi.fn());
const leaveFor = vi.hoisted(() => vi.fn());

vi.mock("@/account/send-account-request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/account/send-account-request")>()),
  sendSignedInRequest,
}));
vi.mock("@/account/on-signed-in", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/account/on-signed-in")>()),
  leaveFor,
}));

const { KitchensScreen, KitchensUnavailableScreen } = await import(
  "@/account/kitchens/kitchens-screen"
);

const TRIGGER = '[data-testid="top-bar-account-trigger"]';
const MENU = '[data-testid="top-bar-account-menu"]';
const CELL = '[data-testid="top-bar-account"]';
const SIGN_IN = '[data-testid="top-bar-account-sign-in"]';

let screen: MountedScreen | undefined;
let fetchStub: ReturnType<typeof vi.fn>;
let consoleErrors: ReturnType<typeof vi.spyOn>;
let listAnswer: SignedInOutcome | Promise<SignedInOutcome>;

beforeEach(() => {
  resetAccountSessionForTests();
  leaveFor.mockReset();
  listAnswer = {
    kind: "received",
    body: wirePage([wireKitchen(1, { name: "Casa 1" })], { total: 1 }),
  };
  sendSignedInRequest
    .mockReset()
    .mockImplementation(() => Promise.resolve(listAnswer));
  fetchStub = vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          state: "signed-in",
          email: "ana@lemnaria.md",
          capabilities: ROLES.client,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ),
  );
  vi.stubGlobal("fetch", fetchStub);
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

async function mountKitchens(): Promise<MountedScreen> {
  screen = mountInCatalogue(createElement(KitchensScreen, { locale: "ro" }));
  await flushPromises(6);
  return screen;
}

describe("the profile icon across the kitchens page's frames", () => {
  it.each([
    ["a list that failed to load", { kind: "unavailable" } as SignedInOutcome],
    [
      "a list that could not be reached",
      { kind: "unanswered" } as SignedInOutcome,
    ],
    [
      "an empty list",
      { kind: "received", body: wirePage([], { total: 0 }) } as SignedInOutcome,
    ],
  ])("keeps the icon in the header over %s", async (_case, answer) => {
    listAnswer = answer;
    const page = await mountKitchens();

    expect(
      requireIn(page.container, "header").querySelector(TRIGGER),
    ).not.toBeNull();
  });

  it("draws the icon on the screen the gate draws when it cannot read the session, with no list request", async () => {
    screen = mountInCatalogue(
      createElement(KitchensUnavailableScreen, { locale: "ro" }),
    );
    await flushPromises(6);

    expect(
      requireIn(screen.container, "header").querySelector(TRIGGER),
    ).not.toBeNull();
    expect(sendSignedInRequest).not.toHaveBeenCalled();
  });

  it("draws the forbidden screen with no icon, and no menu left open, when the list answers forbidden", async () => {
    listAnswer = { kind: "forbidden" };
    const page = await mountKitchens();

    expect(page.container.querySelector(CELL)).toBeNull();
    expect(page.container.querySelector(TRIGGER)).toBeNull();
    expect(page.container.querySelector(`header ${SIGN_IN}`)).toBeNull();
  });

  it("lifts the inert hold and removes the menu when the list turns forbidden while the menu is open", async () => {
    let answerList: (outcome: SignedInOutcome) => void = () => undefined;
    listAnswer = new Promise<SignedInOutcome>((resolve) => {
      answerList = resolve;
    });
    const page = await mountKitchens();
    click(requireIn(page.container, TRIGGER));
    expect(document.querySelector(MENU)).not.toBeNull();

    answerList({ kind: "forbidden" });
    await flushPromises(6);

    expect(document.querySelector(MENU)).toBeNull();
    expect(document.querySelectorAll("[inert]")).toHaveLength(0);
  });

  it("opens the menu in the page's main over the list, and the card behind it is inert until the menu closes", async () => {
    const page = await mountKitchens();

    click(requireIn(page.container, TRIGGER));

    const main = requireIn(page.container, "main");
    expect(main.contains(requireIn(document.body, MENU))).toBe(true);
    expect(main.querySelectorAll(":scope > [inert]").length).toBeGreaterThan(0);
  });
});
