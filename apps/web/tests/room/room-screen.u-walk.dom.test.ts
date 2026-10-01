// @vitest-environment happy-dom
//
// **The screen's `policy` reaches the URL parse**, proved by walking a U from 1A to 1D to 1F through the
// real `RoomScreen` under the approved policy, with a policy that states no U as the contrast (ADR
// 0116). The invariant: the cards, *Continuă*, the URL parse and the draft's own canonical query all
// read the one policy the screen is handed, so a screen that builds a U reaches 1D and one that does
// not stays at 1C.
//
// The mocks are `room-composition.dom.test.ts`'s and stand for the same reasons: `next/navigation` one
// layer down, the adapter's `makeKit`/`createBodyProbe`/`disposeKit` only (so the composition runs the
// domain's real `generateKitchen` against a fake probe), and the hand-off's network write held open.
import type { BodyProbe } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browser = vi.hoisted(() => ({
  pathname: "/ro/configurator/room",
  search: "",
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

vi.mock("@lemnaria/three-adapter", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/three-adapter")>();
  return {
    ...actual,
    makeKit: (options: { cabinetDepthMm?: number }) => ({
      cabinetDepthMm: options.cabinetDepthMm,
      builders: { "kitchen-l": () => ({}) },
    }),
    createBodyProbe: (kit: { cabinetDepthMm?: number }): BodyProbe =>
      createFakeBodyProbe({ cabinetDepthMm: kit.cabinetDepthMm ?? 600 }),
    disposeKit: () => undefined,
  };
});

import { APPROVED_ROOM_POLICY } from "@lemnaria/configurator-domain";

import { RoomScreen } from "@/room/room-screen";

import roMessages from "../../src/messages/ro.json";
import { createFakeBodyProbe } from "../support/fake-body-probe";
import { policyWithoutU } from "../support/policy-without-u";

const A_U = { wallA: "4.5", wallB: "3.01", wallC: "3.62", height: "2.6" };
const A_U_QUERY = `shape=U&wallA=${A_U.wallA}&wallB=${A_U.wallB}&wallC=${A_U.wallC}&height=${A_U.height}`;
const RUN_TIMEOUT_MS = 3000;
const POLL_MS = 5;

let container: HTMLDivElement;
let root: Root;

function render(search: string, policy = APPROVED_ROOM_POLICY): void {
  browser.search = search;
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(RoomScreen, { policy }),
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
}

function maybeAt(testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

function elementAt(testId: string): HTMLElement {
  const found = maybeAt(testId);
  if (found === null) throw new Error(`the screen draws no ${testId}`);
  return found;
}

function substate(): string | null {
  return (
    container
      .querySelector("main[data-room-substate]")
      ?.getAttribute("data-room-substate") ?? null
  );
}

function typeInto(field: string, text: string): void {
  act(() => {
    const control = elementAt(`room-length-${field}`);
    Reflect.set(HTMLInputElement.prototype, "value", text, control);
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function waitUntil(settled: () => boolean, what: string): Promise<void> {
  for (let waited = 0; waited < RUN_TIMEOUT_MS; waited += POLL_MS) {
    if (settled()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    });
  }
  throw new Error(`the composition never ${what}`);
}

beforeEach(() => {
  browser.search = "";
  browser.push.mockClear();
  browser.replace.mockClear();
  // Held open, as `room-composition.dom.test.ts` holds it: the hand-off's write is not this file's.
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

describe("a U through the real screen under the approved policy, 1A to 1D to 1F", () => {
  it("walks 1A, 1B, 1D and 1F, and composes a kitchen that names all three walls", async () => {
    // 1A: no shape named; the U card is offered because the policy builds it.
    render("");
    expect(substate()).toBe("1A");
    expect(maybeAt("room-shape-card-U")).not.toBeNull();

    // 1B: a U named and no length. No corner toggle, and Continue is not active.
    render("shape=U");
    expect(substate()).toBe("1B");
    expect(maybeAt("room-corner")).toBeNull();

    // Typing the four lengths makes the draft a room the approved policy accepts, and Continue leads
    // on. Under a policy that states no U it never would (asserted last).
    typeInto("wallA", "4500");
    typeInto("wallB", "3010");
    typeInto("wallC", "3620");
    typeInto("height", "2600");
    const continueButton = elementAt("room-continue");
    expect(continueButton.getAttribute("aria-disabled")).not.toBe("true");
    expect((continueButton as HTMLButtonElement).disabled).toBe(false);

    // 1D: the same U as a URL. The parse is judged against the screen's policy, so it is 1D and not
    // 1C's *shape not buildable*.
    render(A_U_QUERY);
    expect(substate()).toBe("1D");

    // 1F: Continue composes, and the summary and the aside carry wall C.
    typeInto("wallA", "4500");
    act(() => {
      elementAt("room-continue").click();
    });
    await waitUntil(
      () =>
        maybeAt("room-compose-notice")?.getAttribute("data-compose-phase") ===
        "composed",
      "resolved its rows",
    );
    const summary = elementAt("room-compose-summary").textContent;
    for (const millimetres of ["4500", "3010", "3620", "2600"]) {
      expect(summary).toContain(millimetres);
    }
    expect(elementAt("room-plan-label-C").textContent).toContain("3620");
    expect(maybeAt("room-corner")).toBeNull();
  });

  it("stays at 1C under a policy that states no U for the very same URL, so the walk above is the policy's doing", () => {
    render(A_U_QUERY, policyWithoutU());

    expect(substate()).toBe("1C");
  });
});
