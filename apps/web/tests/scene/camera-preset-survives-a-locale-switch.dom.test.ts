// @vitest-environment happy-dom
//
// **The defect: switching language sent the camera back to the overview.**
//
// Reproduced twice on 2026-09-10 — *Perete A* → *Vedere generală*, *Стена A* → *Общий вид*. Nothing
// else on the screen moved: the design, the selection, the finish, the price and the step all
// survived, because they live in `store/configurator-store.ts`, a module-scope singleton. The camera
// lived in a `useState` inside `ConfigureScreen`, and next-intl's switch is a client-side navigation
// from `/ro/…` to `/ru/…` — the `[locale]` segment's value changes, the page subtree under it
// remounts, and every `useState` in it is initialised again.
//
// **A remount is what is driven here, rather than a navigation.** The reset had nothing to do with
// language: any remount of that subtree did it, and a case that drove the router would be asserting
// next-intl's behaviour rather than this product's. So the consumer below is unmounted and mounted
// again, which is the whole of what the locale switch did to the camera.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { useCameraPreset } from "@/scene/camera-preset-store";

const SCREEN_SOURCE = readFileSync(
  resolve(
    import.meta.dirname,
    "../../src/app/configurator/configure/configure-screen.tsx",
  ),
  "utf8",
);

let container: HTMLDivElement;
let root: Root;

/** The smallest thing that reads the camera the way the screen reads it. */
function CameraReadout() {
  const presetId = useCameraPreset((state) => state.presetId);
  return createElement("span", { "data-testid": "preset" }, presetId);
}

function mount(): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(CameraReadout));
  });
}

function unmount(): void {
  act(() => {
    root.unmount();
  });
  container.remove();
}

function readPreset(): string {
  const readout = container.querySelector('[data-testid="preset"]');
  if (readout === null) throw new Error("nothing rendered the camera");
  return readout.textContent;
}

beforeEach(() => {
  useCameraPreset.setState({ presetId: "overview" });
  mount();
});

afterEach(() => {
  unmount();
  useCameraPreset.setState({ presetId: "overview" });
});

describe("the camera the customer chose", () => {
  it("opens at the overview, which is what an untouched screen shows", () => {
    expect(readPreset()).toBe("overview");
  });

  it("is still where they left it after the subtree remounts", () => {
    act(() => {
      useCameraPreset.getState().standAt("wallA");
    });
    expect(readPreset()).toBe("wallA");

    unmount();
    mount();

    expect(readPreset()).toBe("wallA");
  });
});

describe("the screen reads the camera from outside its own tree", () => {
  // The wiring half. The case above passes whatever `ConfigureScreen` does, because it never renders
  // it — so this is what fails if the preset is moved back into the component that resets.
  it("takes the preset from the store rather than holding it in state", () => {
    expect(SCREEN_SOURCE).toContain("useCameraPreset");
    expect(SCREEN_SOURCE).not.toMatch(/useState<CameraPresetId>/);
    expect(SCREEN_SOURCE).not.toContain("setPresetId");
  });
});
