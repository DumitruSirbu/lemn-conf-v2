// @vitest-environment happy-dom
//
// M10 wave Q3c, the mount: what `ConfigureScreen` hands the price-notice hook, observed on the mounted screen. The hook's
// own tests pass `isOwner` themselves, so the screen's `variant === "owner"` is held nowhere else. The share view
// mounts this same screen (`shared-design-view.tsx`), so the worst case is staged on purpose: the store claims it may
// write and holds a real-looking id, and only the variant says this is not the owner's.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/ro/d/abcdefghijklmnopqrstu",
}));
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

import {
  ConfigureScreen,
  type ConfigureScreenVariant,
} from "@/app/configurator/configure/configure-screen";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import {
  SAMPLE_PRICE_ROOT,
  underSamplePriceBook,
} from "../support/sample-price-root";

const DESIGN_ID = "abcdefghijklmnopqrstu";
const NOTICE_ADDRESS = `/api/designs/${DESIGN_ID}/price-notice`;
const PAGE_PAIR = {
  versionId: SAMPLE_PRICE_ROOT.versionId,
  availabilityRevision: SAMPLE_PRICE_ROOT.availability.revision,
};

interface Request {
  readonly method: string;
  readonly address: string;
  readonly body: unknown;
}

let requests: Request[];
let container: HTMLDivElement;
let root: Root;

function stubNetwork(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((address: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push({
        method,
        address,
        body:
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      if (address === NOTICE_ADDRESS) return Promise.resolve(noticeResponse());
      if (address === `${NOTICE_ADDRESS}/acknowledge`) {
        return Promise.resolve(
          new Response(JSON.stringify({ acknowledged: PAGE_PAIR })),
        );
      }
      return new Promise<Response>(() => undefined);
    }),
  );
}

function noticeResponse(): Response {
  return new Response(
    JSON.stringify({
      kind: "active-version",
      isSent: false,
      current: PAGE_PAIR,
      pricesChanged: true,
      replacementsRequired: [],
      removedAccessories: [],
    }),
  );
}

function mount(variant: ConfigureScreenVariant): void {
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
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 5; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

function noticeRequests(): Request[] {
  return requests.filter(({ address }) => address.includes("price-notice"));
}

function banner(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-testid="price-notice"]');
}

beforeEach(() => {
  requests = [];
  stubNetwork();
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: DESIGN_ID,
    revision: "1",
    canWrite: true,
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

describe("the editor's mount of the price notice", () => {
  it("asks once and draws C1 on the owner's screen, and acknowledges the page's pair", async () => {
    mount("owner");
    await settle();

    expect(noticeRequests().map(({ method }) => method)).toEqual(["GET"]);
    expect(banner()).not.toBe(null);

    act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="price-notice-acknowledge"]')
        ?.click();
    });
    await settle();

    expect(noticeRequests().filter(({ method }) => method === "POST")).toEqual([
      {
        method: "POST",
        address: `${NOTICE_ADDRESS}/acknowledge`,
        body: PAGE_PAIR,
      },
    ]);
    expect(banner()).toBe(null);
  });

  it("asks nothing and draws nothing on the share view, though the store says it may write under a real-looking id", async () => {
    mount("shared");
    await settle();

    expect(noticeRequests()).toEqual([]);
    expect(banner()).toBe(null);
  });

  it.each(["checking", "check-failed", false] as const)(
    "asks nothing on the owner's screen while canWrite is %s",
    async (canWrite) => {
      act(() => {
        useConfiguratorStore.setState({ canWrite });
      });

      mount("owner");
      await settle();

      expect(noticeRequests()).toEqual([]);
    },
  );

  it("keeps the region mounted for the announcement whether or not there is a notice", async () => {
    act(() => {
      useConfiguratorStore.setState({ canWrite: false });
    });

    mount("owner");
    await settle();

    expect(
      container.querySelector('[data-testid="price-notice-region"]'),
    ).not.toBe(null);
    expect(
      container
        .querySelector('[data-testid="price-notice-region"]')
        ?.getAttribute("role"),
    ).toBe("status");
  });
});
