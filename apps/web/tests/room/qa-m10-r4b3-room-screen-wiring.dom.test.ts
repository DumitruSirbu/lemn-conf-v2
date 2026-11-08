// @vitest-environment happy-dom
// QA of M10 R4b3 item 2: the page's prop reaches both hooks that create a kitchen, through the real `RoomScreen`. The hooks'
// own behaviour is `stamping-new-kitchens.dom.test.ts`'s; this pins the hand-over that file never exercises, so a screen
// that stopped passing the settings to one of them would otherwise ship green.
import {
  paletteFinish,
  type NewKitchenSettings,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browser = vi.hoisted(() => ({
  pathname: "/ro/configurator/room",
  search: "",
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => browser.pathname,
  useSearchParams: () => new URLSearchParams(browser.search),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/room/use-generation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/room/use-generation")>();
  return {
    ...actual,
    useGeneration: vi.fn(actual.useGeneration),
    usePresetCopy: vi.fn(actual.usePresetCopy),
  };
});

import { RoomScreen } from "@/room/room-screen";
import { useGeneration, usePresetCopy } from "@/room/use-generation";

import roMessages from "../../src/messages/ro.json";

const SETTINGS: NewKitchenSettings = {
  materialTierId: "material.painted-mdf",
  hardwareTierId: "hardware.premium",
  cabinetDepthMm: 700,
  finish: paletteFinish("pal.alb"),
  handle: "black",
  topRowHandle: "steel",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  browser.search = "";
  vi.mocked(useGeneration).mockClear();
  vi.mocked(usePresetCopy).mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("no network in this test"))),
  );
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

function renderScreen(settings: NewKitchenSettings | undefined): void {
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(
          RoomScreen,
          settings === undefined ? {} : { newKitchenSettings: settings },
        ),
        locale: "ro",
        messages: roMessages,
      }),
    );
  });
}

describe("the room screen hands the page's settings to both creation hooks", () => {
  it("gives the generation hook the very object the page handed it, on every render", () => {
    renderScreen(SETTINGS);

    const given = vi
      .mocked(useGeneration)
      .mock.calls.map(([settings]) => settings);
    expect(given.length).toBeGreaterThan(0);
    for (const settings of given) expect(settings).toBe(SETTINGS);
  });

  it("gives the preset copy the very object the page handed it, on every render", () => {
    renderScreen(SETTINGS);

    const given = vi
      .mocked(usePresetCopy)
      .mock.calls.map(([settings]) => settings);
    expect(given.length).toBeGreaterThan(0);
    for (const settings of given) expect(settings).toBe(SETTINGS);
  });

  it("gives both hooks nothing when the page handed nothing", () => {
    renderScreen(undefined);

    for (const [settings] of vi.mocked(useGeneration).mock.calls) {
      expect(settings).toBeUndefined();
    }
    for (const [settings] of vi.mocked(usePresetCopy).mock.calls) {
      expect(settings).toBeUndefined();
    }
  });
});
