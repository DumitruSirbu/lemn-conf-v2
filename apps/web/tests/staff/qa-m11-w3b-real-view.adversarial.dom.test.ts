// @vitest-environment happy-dom
//
// W3b adversarial QA: the share view's real component, mounted as the staff 3D view mounts it (the real configure screen and
// the real language menu; only the WebGL scene is stubbed). Opening its settings and its language menu asks the server only to read who is signed in, and its language menu keeps the copy the link named on the staff path and writes nothing else.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/ro/staff/kitchens/k00000000000000000001/3d",
}));
vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/scene/kitchen-canvas", () => ({ default: () => null }));

import { SharedDesignView } from "@/app/s/[token]/shared-design-view";
import { NO_PRICE_BOOK } from "@/price/price-book-root";

import {
  all,
  mountScreen,
  one,
  openSheet,
  press,
  unmountScreen,
} from "../support/mounted-screen";

const fetched = vi.hoisted(() => ({ calls: [] as [unknown, RequestInit?][] }));

beforeEach(() => {
  fetched.calls = [];
  vi.stubGlobal("fetch", (...args: [unknown, RequestInit?]) => {
    fetched.calls.push(args);
    return new Promise<Response>(() => undefined);
  });
  window.history.replaceState(
    null,
    "",
    "/ro/staff/kitchens/k00000000000000000001/3d",
  );
});

afterEach(() => {
  unmountScreen();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(localeQuery?: { version: string }): void {
  mountScreen(
    createElement(SharedDesignView, {
      design: KITCHEN_L_DESIGN,
      ...(localeQuery === undefined ? {} : { localeQuery }),
    }),
    NO_PRICE_BOOK,
  );
}

describe("the staff 3D view's real screen", () => {
  it("asks the server only to read who is signed in, on mount, on opening the settings and on opening the language menu", () => {
    mount({ version: "current" });

    openSheet();
    press("top-bar-locale");

    const addresses = fetched.calls.map(([address]) => String(address));
    expect(new Set(addresses)).toEqual(new Set(["/api/account/session"]));
    for (const [, init] of fetched.calls) {
      expect(init?.method ?? "GET").toBe("GET");
    }
  });

  it("draws no control that goes on to the review or back to the room step", () => {
    mount({ version: "current" });

    for (const testId of ["review-cta", "top-bar-back", "bottom-bar-back"]) {
      expect(all(testId)).toEqual([]);
    }
  });

  it("keeps the named copy on the staff path in each language, as its language menu's links", () => {
    mount({ version: "sent" });

    press("top-bar-locale");

    expect(one("top-bar-locale-option-ro").getAttribute("href")).toBe(
      "/ro/staff/kitchens/k00000000000000000001/3d?version=sent",
    );
    expect(one("top-bar-locale-option-ru").getAttribute("href")).toBe(
      "/ru/staff/kitchens/k00000000000000000001/3d?version=sent",
    );
  });

  it("writes the path alone when the link named no copy", () => {
    mount();

    press("top-bar-locale");

    expect(one("top-bar-locale-option-ru").getAttribute("href")).toBe(
      "/ru/staff/kitchens/k00000000000000000001/3d",
    );
  });
});
