// @vitest-environment happy-dom
//
// The review's scene as a client component: which canvas it mounts, the room's camera views as chips, and the
// device without WebGL. The canvas itself is a stub (happy-dom has no WebGL); that the real view-only stage selects
// nothing is `tests/scene/kitchen-stage-view-only.test.ts`.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const canvases = vi.hoisted(() => ({
  viewOnlyViews: [] as unknown[],
  editorMounts: 0,
  hasWebGL: true,
}));

vi.mock("@/scene/kitchen-canvas", () => ({
  default: () => {
    canvases.editorMounts += 1;
    return null;
  },
  ViewOnlyKitchenCanvas: (props: { view: unknown }) => {
    canvases.viewOnlyViews.push(props.view);
    return createElement("canvas", { "data-testid": "stub-canvas" });
  },
}));

const [{ ReviewScene }, { useCameraPreset }, { useConfiguratorStore }] =
  await Promise.all([
    import("@/review/review-scene"),
    import("@/scene/camera-preset-store"),
    import("@/store/configurator-store"),
  ]);

import roMessages from "../../src/messages/ro.json";

const L_CAMERA_CHIPS = 3;
const STRAIGHT_CAMERA_CHIPS = 2;

let container: HTMLDivElement;
let root: Root;

async function mountScene(): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
        children: createElement(ReviewScene, {
          support: canvases.hasWebGL ? "supported" : "unsupported",
        }),
      }),
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function chips(): HTMLButtonElement[] {
  return [
    ...container.querySelectorAll<HTMLButtonElement>('[role="group"] button'),
  ];
}

beforeEach(() => {
  canvases.viewOnlyViews = [];
  canvases.editorMounts = 0;
  canvases.hasWebGL = true;
  useConfiguratorStore.setState({ design: KITCHEN_L_DESIGN });
  useCameraPreset.setState({ presetId: "overview" });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("ReviewScene with WebGL", () => {
  it("mounts exactly one canvas, the view-only one and never the editor's", async () => {
    await mountScene();

    expect(
      container.querySelectorAll('[data-testid="stub-canvas"]'),
    ).toHaveLength(1);
    expect(canvases.editorMounts).toBe(0);
  });

  it("offers the room's camera views as chips, labelled by the editor's own leaves", async () => {
    await mountScene();

    expect(chips()).toHaveLength(L_CAMERA_CHIPS);
    expect(chips().map((chip) => chip.textContent)).toEqual(
      ["overview", "wallA", "wallB"].map(
        (id) =>
          roMessages.configure.cameraPresets[
            id as keyof typeof roMessages.configure.cameraPresets
          ],
      ),
    );
    expect(
      container.querySelector('[role="group"]')?.getAttribute("aria-label"),
    ).toBe(roMessages.configure.cameraGroupLabel);
  });

  it("marks the standing view pressed and frames it", async () => {
    await mountScene();

    expect(chips().map((chip) => chip.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    expect(canvases.viewOnlyViews.at(-1)).toEqual({
      kind: "preset",
      id: "overview",
    });
  });

  it("moves the camera by touching a chip, and the editor's remembered view moves with it", async () => {
    await mountScene();

    act(() => {
      chips()[1]?.click();
    });

    expect(useCameraPreset.getState().presetId).toBe("wallA");
    expect(chips()[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(canvases.viewOnlyViews.at(-1)).toEqual({
      kind: "preset",
      id: "wallA",
    });
  });

  it("presses the view the scene actually frames when the stored one is not this room's", async () => {
    useCameraPreset.setState({ presetId: "wallB" });
    useConfiguratorStore.setState({
      design: {
        ...KITCHEN_L_DESIGN,
        room: {
          shape: "linear",
          widthMm: 3600,
          depthMm: 600,
          heightMm: 2500,
        },
      },
    });

    await mountScene();

    expect(chips()).toHaveLength(STRAIGHT_CAMERA_CHIPS);
    expect(chips().map((chip) => chip.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
    ]);
  });
});

describe("ReviewScene's structure", () => {
  it("stands the views in a row after the picture, and draws what it is given over the picture", async () => {
    await mountScene();

    const scene = container.querySelector('[data-testid="review-scene"]');
    const [picture, views] = [...(scene?.children ?? [])];

    expect(
      picture?.querySelector('[data-testid="stub-canvas"]'),
    ).not.toBeNull();
    expect(views?.getAttribute("role")).toBe("group");
    expect(picture?.contains(views ?? null)).toBe(false);
    expect(views?.querySelectorAll("button")).toHaveLength(L_CAMERA_CHIPS);
  });
});

describe("ReviewScene without WebGL", () => {
  it("renders nothing at all: no canvas, no chips, no exit screen and no <main>", async () => {
    canvases.hasWebGL = false;

    await mountScene();

    expect(container.innerHTML).toBe("");
    expect(container.querySelector("main")).toBeNull();
  });
});
