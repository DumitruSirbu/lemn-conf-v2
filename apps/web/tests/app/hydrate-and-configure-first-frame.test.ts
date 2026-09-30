// @vitest-environment happy-dom
//
// The **browser's** ordering: a client render of `HydrateAndConfigure` has written the session store
// before `ConfigureScreen` reads it. A `window` is what makes this a browser render — the same
// component writes nothing on the server (ADR 0133 decision 4), which `tests/app/
// server-render-isolation.test.ts` owns under the node environment.
import {
  KITCHEN_L_DESIGN,
  type Design,
  type DesignId,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const firstFrame = vi.hoisted(() => ({
  readDesign: (): Design => {
    throw new Error("store reader was not installed");
  },
  design: undefined as Design | undefined,
}));

vi.mock("@/app/configurator/configure/configure-screen", () => ({
  ConfigureScreen: () => {
    firstFrame.design = firstFrame.readDesign();
    return null;
  },
}));

const [{ HydrateAndConfigure }, { useConfiguratorStore }] = await Promise.all([
  import("@/app/d/[id]/hydrate-and-configure"),
  import("@/store/configurator-store"),
]);

describe("HydrateAndConfigure first frame", () => {
  it("should hydrate the requested design before the editor renders", () => {
    // Arrange
    const loaded: Design = {
      ...structuredClone(KITCHEN_L_DESIGN),
      presetId: "recipe-loaded-from-step-one",
      room: {
        shape: "L",
        widthMm: 3600,
        depthMm: 2400,
        heightMm: 2500,
      },
    };
    useConfiguratorStore.setState({
      design: KITCHEN_L_DESIGN,
      designId: null,
      revision: null,
    });
    firstFrame.readDesign = () => useConfiguratorStore.getState().design;
    firstFrame.design = undefined;

    // Act
    renderToStaticMarkup(
      createElement(HydrateAndConfigure, {
        design: loaded,
        designId: "created-design" as DesignId,
        revision: "2",
      }),
    );

    // Assert
    expect(firstFrame.design).toBe(loaded);
    expect(firstFrame.design).not.toBe(KITCHEN_L_DESIGN);
    expect(useConfiguratorStore.getState()).toMatchObject({
      design: loaded,
      designId: "created-design",
      revision: "2",
    });
  });
});
