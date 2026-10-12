// @vitest-environment happy-dom
//
// The picture alone, which the review and the confirmation both mount: the view-only canvas at the view it is given once
// WebGL is known to be there, and what the caller drew in its place while it is being asked and where it is missing.
// The canvas is a stub (happy-dom has no WebGL).
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const canvases = vi.hoisted(() => ({ views: [] as unknown[] }));

vi.mock("@/scene/kitchen-canvas", () => ({
  default: () => null,
  ViewOnlyKitchenCanvas: (props: { view: unknown }) => {
    canvases.views.push(props.view);
    return createElement("canvas", { "data-testid": "stub-canvas" });
  },
}));

import { KitchenPicture } from "@/review/review-scene";
import type { SceneView } from "@/scene/scene-view";
import type { WebGLSupportState } from "@/scene/webgl-support";

import roMessages from "../../src/messages/ro.json";

const WALL_A_VIEW: SceneView = { kind: "preset", id: "wallA" };

let container: HTMLDivElement;
let root: Root;

async function mountPicture(support: WebGLSupportState): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
        children: createElement(KitchenPicture, {
          support,
          view: WALL_A_VIEW,
          fallback: createElement("p", { "data-testid": "fallback" }),
        }),
      }),
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  canvases.views = [];
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("KitchenPicture", () => {
  it("mounts the view-only canvas at the view it is given when WebGL is there, and not the fallback", async () => {
    await mountPicture("supported");

    expect(
      container.querySelectorAll('[data-testid="stub-canvas"]'),
    ).toHaveLength(1);
    expect(canvases.views.at(-1)).toEqual(WALL_A_VIEW);
    expect(container.querySelector('[data-testid="fallback"]')).toBeNull();
  });

  it.each(["probing", "unsupported"] as const)(
    "draws the fallback and no canvas while WebGL is %s",
    async (support) => {
      await mountPicture(support);

      expect(
        container.querySelector('[data-testid="fallback"]'),
      ).not.toBeNull();
      expect(container.querySelector('[data-testid="stub-canvas"]')).toBeNull();
      expect(canvases.views).toEqual([]);
    },
  );
});
