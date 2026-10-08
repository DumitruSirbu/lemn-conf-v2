// @vitest-environment happy-dom
//
// What `ConfigureScreen` itself is wired to, on the mounted screen.
//
// Two facts about this screen were held only by reading its source: that it keeps the camera in the
// store that outlives it, and that it asks for the browser-Back guard as the owner's variant alone.
// A hook driven through a probe says how the hook behaves and nothing about what the screen hands it,
// and a search of the source agrees with any spelling that keeps the searched words. So the screen is
// mounted here, with the scene and the panels stubbed out, and each wiring is observed from outside:
// a camera chip pressed and the screen remounted, and a history the guard either pushed onto or did not.
import { KITCHEN_L_DESIGN, type DesignId } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DESIGN_ID = "qa-design" as DesignId;
const EDITOR_PATHNAME = "/ro/d/qa-design";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/ro/d/qa-design",
}));

// No WebGL here and no reason to draw: everything stubbed is something neither wiring passes through.
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
  forgetEditorOrigin,
  readEditorOrigin,
  recordEditorOpenedFromStepOne,
} from "@/app/configurator/configure/back-guard";
import {
  ConfigureScreen,
  type ConfigureScreenVariant,
} from "@/app/configurator/configure/configure-screen";
import { useCameraPreset } from "@/scene/camera-preset-store";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";

const WALL_A_CHIP = roMessages.configure.cameraPresets.wallA;

let container: HTMLDivElement;
let root: Root;

function mount(variant: ConfigureScreenVariant = "owner"): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(ConfigureScreen, { variant }),
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
}

function unmount(): void {
  act(() => {
    root.unmount();
  });
  container.remove();
}

function cameraChip(label: string): HTMLButtonElement {
  const chip = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === label,
  );
  if (chip === undefined) throw new Error(`the screen draws no ${label} chip`);
  return chip;
}

beforeEach(() => {
  // Every request held open and never answered: an edited design is one the store would save.
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  window.history.replaceState(null, "", EDITOR_PATHNAME);
  forgetEditorOrigin();
  useCameraPreset.setState({ presetId: "overview" });
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: DESIGN_ID,
    revision: "1",
    canWrite: true,
  });
});

afterEach(() => {
  unmount();
  forgetEditorOrigin();
  useCameraPreset.setState({ presetId: "overview" });
});

describe("the camera the customer chose on the screen", () => {
  it("is still where they left it after the screen remounts, as a language switch remounts it", () => {
    mount();
    act(() => {
      cameraChip(WALL_A_CHIP).click();
    });
    const pressedBefore = cameraChip(WALL_A_CHIP).getAttribute("aria-pressed");

    unmount();
    mount();

    expect(pressedBefore).toBe("true");
    expect(cameraChip(WALL_A_CHIP).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("the browser-Back guard the screen asks for", () => {
  /** An edited design reached from Step 1, standing on its own editor route: every condition the guard waits
   *  for but the variant. */
  function arriveFromStepOneAndEdit(): void {
    recordEditorOpenedFromStepOne(DESIGN_ID);
    useConfiguratorStore.setState({ hasBeenEdited: true });
  }

  it("pushes its guard under the owner, so the case below is not passing on a guard that never arms", () => {
    arriveFromStepOneAndEdit();

    mount("owner");

    expect(readEditorOrigin().guardedPathname).toBe(EDITOR_PATHNAME);
  });

  it("pushes none on a shared link, whose visitor has no Step 1 to be warned about", () => {
    arriveFromStepOneAndEdit();

    mount("shared");

    expect(readEditorOrigin().guardedPathname).toBeNull();
  });
});
