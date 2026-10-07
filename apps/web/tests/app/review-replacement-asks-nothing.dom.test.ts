// @vitest-environment happy-dom
//
// E3a (M8 8D second fix round): when the review replaces a stale clean copy of a design, it must send no request, and
// that includes the one the *editor's* write-access probe sends whenever the store says `"checking"`. A client
// navigation from the editor mounts the review's page while the editor's tree is still mounted, so the replacement is
// written while the probe's effect is watching `canWrite`. The probe is mounted here for real (`HydrateAndConfigure`)
// with only the editor's screen stubbed, then the review replaces the copy.
//
// What this cannot see: Next's own order of unmounting and mounting; that both trees are alive at the moment of the
// replacement is the assumption, and it is the case that hurts.
import {
  KITCHEN_L_DESIGN,
  type Design,
  type DesignId,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/configurator/configure/configure-screen", () => ({
  ConfigureScreen: () => null,
}));
vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/review/review-scene", () => ({ ReviewScene: () => null }));
vi.mock("@/app/configurator/configure/locale-menu", () => ({
  LocaleMenu: () => null,
}));
vi.mock("@/components/webgl-unavailable", () => ({
  WebGLUnavailable: () => createElement("main"),
}));

import { HydrateAndConfigure } from "@/app/d/[id]/hydrate-and-configure";
import { HydrateAndReview } from "@/app/d/[id]/review/hydrate-and-review";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";

const DESIGN_ID = "design-in-two-tabs" as DesignId;
const OTHER_ID = "another-design" as DesignId;

let container: HTMLDivElement;
let root: Root;
const requests: string[] = [];

function newerCopy(): Design {
  return { ...KITCHEN_L_DESIGN, presetId: "saved-in-another-tab" };
}

function bothScreens(pageDesign: Design, pageRevision: string) {
  return createElement(NextIntlClientProvider, {
    locale: "ro",
    messages: roMessages,
    timeZone: "Europe/Chisinau",
    children: createElement(
      Fragment,
      null,
      createElement(HydrateAndConfigure, {
        design: KITCHEN_L_DESIGN,
        designId: DESIGN_ID,
        revision: "4",
      }),
      createElement(HydrateAndReview, {
        design: pageDesign,
        designId: DESIGN_ID,
        revision: pageRevision,
      }),
    ),
  });
}

function mountTheEditorAlone(): void {
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
        children: createElement(HydrateAndConfigure, {
          design: KITCHEN_L_DESIGN,
          designId: DESIGN_ID,
          revision: "4",
        }),
      }),
    );
  });
}

async function letTheEditorsProbeAnswer(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

beforeEach(async () => {
  requests.length = 0;
  vi.stubGlobal("fetch", (url: string) => {
    requests.push(url);
    return Promise.resolve(
      new Response(
        JSON.stringify({
          design: KITCHEN_L_DESIGN,
          revision: "4",
          canWrite: true,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  });
  useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  // The editor has loaded the design and its probe has answered: this browser may write it.
  mountTheEditorAlone();
  await letTheEditorsProbeAnswer();
  requests.length = 0;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

describe("the editor has answered for this browser", () => {
  it("holds the answer before the review arrives, so the test starts from the real state", () => {
    expect(useConfiguratorStore.getState().canWrite).toBe(true);
  });
});

describe("the review replaces the editor's stale clean copy of the same design", () => {
  it("sends no request while the editor's probe is still mounted", async () => {
    act(() => {
      root.render(bothScreens(newerCopy(), "5"));
    });
    await letTheEditorsProbeAnswer();

    expect(useConfiguratorStore.getState().revision).toBe("5");
    expect(requests).toEqual([]);
  });

  it("carries the answer about write access over, as it was, at the moment of the replacement", () => {
    act(() => {
      root.render(bothScreens(newerCopy(), "5"));
    });

    expect(useConfiguratorStore.getState().canWrite).toBe(true);
  });
});

describe("what a replacement does not carry over", () => {
  it("resets the answer when the page is a different design's", () => {
    act(() => {
      root.render(
        createElement(NextIntlClientProvider, {
          locale: "ro",
          messages: roMessages,
          timeZone: "Europe/Chisinau",
          children: createElement(HydrateAndReview, {
            design: newerCopy(),
            designId: OTHER_ID,
            revision: "1",
          }),
        }),
      );
    });

    expect(useConfiguratorStore.getState()).toMatchObject({
      designId: OTHER_ID,
      canWrite: "checking",
    });
  });

  it("leaves the answer 'checking' for a store that held none for this design", () => {
    act(() => {
      root.unmount();
    });
    useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
    root = createRoot(container);

    act(() => {
      root.render(
        createElement(NextIntlClientProvider, {
          locale: "ro",
          messages: roMessages,
          timeZone: "Europe/Chisinau",
          children: createElement(HydrateAndReview, {
            design: KITCHEN_L_DESIGN,
            designId: DESIGN_ID,
            revision: "4",
          }),
        }),
      );
    });

    expect(useConfiguratorStore.getState().canWrite).toBe("checking");
    expect(requests).toEqual([]);
  });
});
