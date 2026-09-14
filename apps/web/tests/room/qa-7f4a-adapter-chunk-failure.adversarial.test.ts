// @vitest-environment happy-dom
//
// **Adversarial QA for M7 wave 7F4a — the dynamic import itself fails.**
//
// Criterion 35 covers a `generateKitchen` that refuses and one that throws. Neither reaches the
// failure that a browser produces most often: `await import("@lemnaria/three-adapter")` **rejecting**.
// A deploy invalidates the chunk a loaded page is still holding a URL for, and the next tap on
// *Continuă* gets a network error rather than a module — the failure the whole `try` in
// `composeKitchen` is wrapped around, and the only one of the three where the `catch` runs before a
// kit or a log has ever existed.
//
// **The adapter is mocked with a factory that throws**, which is what makes the rejection real rather
// than simulated: the module never resolves, exactly as a failed chunk fetch never resolves. That is
// also why this is its own file — the mock is module-wide and cannot be armed per test — and why
// `tests/support/fake-body-probe.ts` is not imported here: it reaches for `isCatalogBuildId` from the
// same package and would fail to load with it.
import { NextIntlClientProvider } from "next-intl";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browser = vi.hoisted(() => ({
  pathname: "/ro/configurator/room",
  search: "shape=L&wallA=4.2&wallB=3&height=2.5&direction=left",
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => browser.pathname,
  useSearchParams: () => new URLSearchParams(browser.search),
  useRouter: () => ({
    push: browser.push,
    replace: browser.replace,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@lemnaria/three-adapter", () => {
  throw new Error(
    "Loading chunk @lemnaria/three-adapter failed (missing: /_next/static/chunks/three-adapter.js)",
  );
});

import { RoomScreen } from "@/room/room-screen";

import roMessages from "../../src/messages/ro.json";

const RUN_TIMEOUT_MS = 3000;
const POLL_MS = 5;

let container: HTMLDivElement;
let root: Root;

function render(): void {
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(RoomScreen),
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
      }) as ReactElement,
    );
  });
}

function maybeAt(testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

function elementAt(testId: string): HTMLElement {
  const element = maybeAt(testId);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`the screen draws no ${testId}`);
  }
  return element;
}

function composePhase(): string | null {
  return (
    maybeAt("room-compose-notice")?.getAttribute("data-compose-phase") ?? null
  );
}

async function settleFailure(): Promise<void> {
  for (let waited = 0; waited < RUN_TIMEOUT_MS; waited += POLL_MS) {
    if (composePhase() === "failed") return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    });
  }
  throw new Error("the composition never reported its failure");
}

beforeEach(() => {
  browser.push.mockClear();
  browser.replace.mockClear();
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

describe("the adapter chunk cannot be fetched (criterion 35)", () => {
  it("shows the failure state, draws no row, and lets the customer back to the fields", async () => {
    render();

    act(() => {
      elementAt("room-continue").click();
    });
    // The pending list is on the glass first, exactly as it is for a run that will succeed: the
    // import is awaited *after* the entry into composition, so the customer never sees a dead tap.
    expect(elementAt("room-compose-rows").children).toHaveLength(5);
    await settleFailure();

    expect(elementAt("room-compose-notice").textContent).toContain(
      roMessages.room.compose.failed,
    );
    // A run that never had a log may not claim anything about fit, so the list goes rather than
    // freezing at *se calculează* — five rows stuck pending would be a lie about a run that is over.
    expect(maybeAt("room-compose-rows")).toBe(null);

    act(() => {
      elementAt("room-compose-back").click();
    });

    expect(maybeAt("room-fields")).not.toBe(null);
    expect(maybeAt("room-compose")).toBe(null);
  });

  it("navigates nowhere beyond the departure the tap already owed", async () => {
    render();

    act(() => {
      elementAt("room-continue").click();
    });
    const pushesFromTheDeparture = browser.push.mock.calls.length;
    await settleFailure();

    expect(browser.push).toHaveBeenCalledTimes(pushesFromTheDeparture);
    expect(browser.search).toBe(
      "shape=L&wallA=4.2&wallB=3&height=2.5&direction=left",
    );
  });
});
