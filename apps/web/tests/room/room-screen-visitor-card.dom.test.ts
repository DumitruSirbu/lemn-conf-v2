// @vitest-environment happy-dom
//
// **Lot 2 U15d (plan M8B Lot 2 section 14.2, U15-4): where Step 1 mounts the visitor's card.**
//
// The card's own conditions are `visitor-account-card.dom.test.ts`'s. This is the screen's half: the card is a direct
// child of `<main>`, on the shapes and the lengths form, with nothing around it inert, and it is not drawn over the
// preset wait or the composition, which carry their own foot.
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browser = vi.hoisted(() => ({
  pathname: "/ro/configurator/room",
  search: "",
  push: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => browser.pathname,
  useSearchParams: () => new URLSearchParams(browser.search),
  useRouter: () => ({
    push: browser.push,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import {
  recordEditedEditorLeft,
  recordEditorOpenedFromStepOne,
  resetStepOneAccountCardLatchForTests,
} from "@/app/configurator/configure/back-guard";
import { RoomScreen } from "@/room/room-screen";

import roMessages from "../../src/messages/ro.json";
import { flushPromises } from "../support/render-hook";

const DESIGN_ID = "abcdefghijklmnopqrstu";
const CARD = '[data-testid="visitor-account-card"]';
const SESSION_ROUTE = "/api/account/session";
const ROOM_WITH_LENGTHS =
  "shape=L&wallA=3.6&wallB=2.4&height=2.5&direction=left";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  resetAccountSessionForTests();
  resetStepOneAccountCardLatchForTests();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) =>
      input.includes(SESSION_ROUTE)
        ? Promise.resolve(
            new Response(JSON.stringify({ state: "anonymous" }), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          )
        : new Promise<Response>(() => undefined),
    ),
  );
  recordEditorOpenedFromStepOne(DESIGN_ID);
  recordEditedEditorLeft({ designId: DESIGN_ID, hasBeenEdited: true });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

async function renderStepOne(search: string): Promise<void> {
  browser.search = search;
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(RoomScreen),
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
  await flushPromises(5);
}

describe("Step 1 with the card owed to an anonymous visitor", () => {
  it.each([
    ["the shapes (1A)", ""],
    ["the lengths form (1C)", ROOM_WITH_LENGTHS],
  ])(
    "draws the card over %s, a direct child of main, and nothing is inert",
    async (_label, search) => {
      await renderStepOne(search);

      const card = container.querySelector(CARD);
      expect(card?.parentElement?.tagName).toBe("MAIN");
      expect(container.querySelector("[inert]")).toBeNull();
      expect(container.querySelector("[aria-modal]")).toBeNull();
      const continueButton = container.querySelector(
        '[data-testid="room-continue"]',
      );
      expect(continueButton).not.toBeNull();
      expect(continueButton?.closest("[inert]")).toBeNull();
    },
  );

  it("takes the card away once the continue control has begun the search for presets", async () => {
    await renderStepOne(ROOM_WITH_LENGTHS);
    expect(container.querySelector(CARD)).not.toBeNull();

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="room-continue"]')
        ?.click();
    });
    await flushPromises(3);

    expect(
      container.querySelector('[data-testid="room-presets-wait"]'),
    ).not.toBeNull();
    expect(container.querySelector(CARD)).toBeNull();
  });
});
