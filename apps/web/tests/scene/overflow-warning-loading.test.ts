// The band on the **screen**, in the state where the scene is not there yet.
//
// `overflow-warning.test.ts` drives the component's own gate. This file drives the state that gate
// exists for, through the real `ConfigureScreen`: `support` starts at `"probing"` — `detectWebGLSupport`
// runs in an effect, and a static render runs no effects — so the screen renders `ro.configure.loading`
// where the canvas will go, `KitchenStage` has not mounted, and nothing is marked. That is exactly the
// window a customer resuming a stored overflowing design sits in while the `ssr: false` 3D chunk is
// fetched, and it is seconds long on a cold mobile connection rather than one frame.
//
// The screen's other four surfaces are stubbed. They are not under test here and each reads store
// slices this file has no reason to model; what is under test is which of the viewport's own children
// render while the scene is absent, and those — the loading placeholder, the camera chips, the hint
// and the band — are all real.
// `OVERFLOWING_KITCHEN_L_DESIGN` is the **one declared** overflow fixture (ADR 0083 decision 10):
// the seeded kitchen with one body a millimetre past the end of wall B, positioned relative to the
// room so a wall moving cannot silently stop it overflowing. It was hand-built in six test files
// and agreed everywhere only because the six were written together. Aliased to the local name the
// cases below already use.
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  OVERFLOWING_KITCHEN_L_DESIGN as OVERFLOWING_DESIGN,
  type Design,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { ro } from "../support/romanian-content";

const store = vi.hoisted(() => ({
  design: undefined as Design | undefined,
  isBodyProbeAttached: false,
}));

// **Three slices rather than two since ADR 0104.** The screen itself now reads the price book — the
// settings pill's labels and the row's fit are decided above `GlobalSettings`, in the component that
// owns the grid — and the flagged total's sentence stands in the scene's own stack beside the band
// under test. Both need a catalogue to price against and a last refusal to label with.
vi.mock("@/store/configurator-store", () => ({
  useConfiguratorStore: (selector: (state: unknown) => unknown) =>
    selector({
      design: store.design,
      catalog: KITCHEN_L_BODY_CATALOG,
      lastRejection: null,
      isBodyProbeAttached: store.isBodyProbeAttached,
    }),
}));

vi.mock("@/panel/editor-panel", () => ({ EditorPanel: () => null }));
vi.mock("@/price/price-bar", () => ({ PriceBar: () => null }));
vi.mock("@/price/price-breakdown", () => ({ PriceBreakdown: () => null }));
vi.mock("@/settings/global-settings", () => ({
  GlobalSettings: () => null,
}));
vi.mock("@/app/configurator/configure/selection-debug", () => ({
  SelectionDebug: () => null,
}));
vi.mock("@/panel/use-panel-view", () => ({
  usePanelView: () => ({ kind: "closed" }),
}));

const { ConfigureScreen } = await import(
  "@/app/configurator/configure/configure-screen"
);

function renderScreen(): string {
  return renderToStaticMarkup(createElement(ConfigureScreen));
}

beforeEach(() => {
  store.design = OVERFLOWING_DESIGN;
  store.isBodyProbeAttached = false;
});

describe("the screen while the 3D chunk is still being fetched", () => {
  it("is really in the loading state, so the assertions below are not vacuous", () => {
    const markup = renderScreen();

    expect(markup).toContain(ro.configure.loading);
    expect(markup).not.toContain("<canvas");
  });

  it("does not tell the customer about marked cabinets while nothing is marked", () => {
    // The defect: "Dulapurile **marcate** depășesc…" over a loading placeholder, with no marks on
    // screen for the whole of the fetch. Remove the gate in `overflow-warning.tsx` and this goes red.
    const markup = renderScreen();

    expect(markup).not.toContain(ro.configure.overflowWarning);
  });

  it("still mounts the live region the sentence will arrive into", () => {
    const markup = renderScreen();

    expect(markup).toContain('data-testid="scene-overflow-region"');
  });

  it("says nothing about an overflow on a design that has none either", () => {
    // The other half of the truth table, so the test above cannot pass merely because the sentence is
    // never rendered by this screen at all.
    store.design = KITCHEN_L_DESIGN;

    expect(renderScreen()).not.toContain(ro.configure.overflowWarning);
  });
});
