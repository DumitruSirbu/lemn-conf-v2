// @vitest-environment happy-dom
//
// M10 wave Q4 (frames C5A / C5AD): the closable note above the price of a kitchen already sent. The editor is mounted for
// real, with the scene and the panels stubbed, over a `fetch` that answers the price-notice `GET` and records every
// request, so "reads the one answer", "writes nothing" and "never on the share view" are observed and not inferred.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/scene/kitchen-canvas", () => ({ default: () => null }));
vi.mock("@/panel/editor-panel", () => ({ EditorPanel: () => null }));
vi.mock("@/price/price-breakdown", () => ({ PriceBreakdown: () => null }));
vi.mock("@/settings/global-settings", () => ({ GlobalSettings: () => null }));
vi.mock("@/app/configurator/configure/selection-debug", () => ({
  SelectionDebug: () => null,
}));
vi.mock("@/panel/use-panel-view", () => ({
  usePanelView: () => ({ kind: "closed" }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/ro/d/abcdefghijklmnopqrstu",
}));

import {
  ConfigureScreen,
  type ConfigureScreenVariant,
} from "@/app/configurator/configure/configure-screen";
import { useCameraPreset } from "@/scene/camera-preset-store";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import {
  SAMPLE_PRICE_ROOT,
  underSamplePriceBook,
} from "../support/sample-price-root";

const DESIGN_ID = "abcdefghijklmnopqrstu";
const NOTE = '[data-testid="sent-kitchen-note"]';
const CLOSE = '[data-testid="sent-kitchen-note-close"]';
const PAGE_PAIR = {
  versionId: SAMPLE_PRICE_ROOT.versionId,
  availabilityRevision: SAMPLE_PRICE_ROOT.availability.revision,
};

let container: HTMLDivElement;
let root: Root;
let requests: { method: string; address: string }[];

function answerPriceNotice({ isSent }: { isSent: boolean }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((address: string, init?: RequestInit) => {
      requests.push({ method: init?.method ?? "GET", address });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            kind: "active-version",
            isSent,
            current: PAGE_PAIR,
            pricesChanged: false,
            replacementsRequired: [],
            removedAccessories: [],
          }),
          { status: 200 },
        ),
      );
    }),
  );
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 5; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

async function mountEditor(
  variant: ConfigureScreenVariant = "owner",
): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      underSamplePriceBook(
        createElement(NextIntlClientProvider, {
          children: createElement(ConfigureScreen, { variant }),
          locale: "ro",
          messages: roMessages,
          timeZone: "Europe/Chisinau",
        }),
      ),
    );
  });
  await settle();
}

function unmountEditor(): void {
  act(() => {
    root.unmount();
  });
  container.remove();
}

function note(): HTMLElement | null {
  return container.querySelector<HTMLElement>(NOTE);
}

function closeButton(): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(CLOSE);
  if (button === null) throw new Error("the note draws no close control");
  return button;
}

beforeEach(() => {
  requests = [];
  useCameraPreset.setState({ presetId: "overview" });
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: DESIGN_ID,
    revision: "1",
    canWrite: true,
  });
});

afterEach(() => {
  unmountEditor();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  useCameraPreset.setState({ presetId: "overview" });
});

describe("a kitchen the customer has already sent", () => {
  it("shows the approved sentence above the price, in the scene's bottom stack", async () => {
    answerPriceNotice({ isSent: true });

    await mountEditor();

    expect(note()?.textContent).toContain(roMessages.sentKitchenNote.body);
    expect(note()?.getAttribute("role")).toBe("note");
    expect(closeButton().getAttribute("aria-label")).toBe(
      roMessages.sentKitchenNote.close,
    );
  });

  it("asks for the answer once: the note reads the notice hook and issues no request of its own", async () => {
    answerPriceNotice({ isSent: true });

    await mountEditor();

    expect(requests).toEqual([
      {
        method: "GET",
        address: `/api/designs/${DESIGN_ID}/price-notice`,
      },
    ]);
  });

  it("leaves the price and the camera controls working while the note is up", async () => {
    answerPriceNotice({ isSent: true });
    await mountEditor();
    const chip = [...container.querySelectorAll("button")].find(
      (button) =>
        button.textContent === roMessages.configure.cameraPresets.wallA,
    );

    act(() => {
      chip?.click();
    });

    expect(note()).not.toBeNull();
    expect(chip?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[data-testid="price-bar"]')).not.toBeNull();
  });

  it("is gone when it is closed, and the close writes nothing", async () => {
    answerPriceNotice({ isSent: true });
    await mountEditor();

    act(() => {
      closeButton().click();
    });
    await settle();

    expect(note()).toBeNull();
    expect(requests.map(({ method }) => method)).toEqual(["GET"]);
    expect(container.querySelector('[data-testid="price-bar"]')).not.toBeNull();
  });

  it("is back on the next view, because closing it was that view's own", async () => {
    answerPriceNotice({ isSent: true });
    await mountEditor();
    act(() => {
      closeButton().click();
    });

    unmountEditor();
    await mountEditor();

    expect(note()).not.toBeNull();
  });
});

describe("a kitchen that is not sent, or a view that never asked", () => {
  it("draws no note for a kitchen not yet sent", async () => {
    answerPriceNotice({ isSent: false });

    await mountEditor();

    expect(note()).toBeNull();
  });

  it("draws no note on the share view, which sends no request either", async () => {
    answerPriceNotice({ isSent: true });

    await mountEditor("shared");

    expect(note()).toBeNull();
    expect(requests).toEqual([]);
  });

  it("draws no note while the answer has not arrived", async () => {
    vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));

    await mountEditor();

    expect(note()).toBeNull();
  });
});
