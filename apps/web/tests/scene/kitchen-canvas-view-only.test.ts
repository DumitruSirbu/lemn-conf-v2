// The wiring between the canvas and the stage: the editor's canvas hands the stage nothing to override, so the stage
// keeps its default (the store's selection and probe); the view-only canvas hands it `useNoEditing`. Read from the
// element tree each canvas returns, with react-three-fiber's `Canvas` and drei's controls replaced by strings.
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@react-three/fiber", () => ({
  Canvas: "canvas-stub",
  useFrame: vi.fn(),
  useThree: vi.fn(),
}));
vi.mock("@react-three/drei", () => ({ OrbitControls: "orbit-stub" }));

import KitchenCanvas, {
  ViewOnlyKitchenCanvas,
} from "../../src/scene/kitchen-canvas";
import { KitchenStage, useNoEditing } from "../../src/scene/kitchen-stage";

const VIEW = { kind: "preset", id: "overview" } as const;

/** Renders the canvas component one level, then finds the stage element inside the `Canvas` it returns. */
function stageElementOf(
  canvas: (props: { view: typeof VIEW }) => ReactElement,
): ReactElement<{ useEditing?: unknown }> {
  const wrapper = canvas({ view: VIEW }) as ReactElement<{ view: unknown }>;
  const sceneCanvas = (
    wrapper.type as (props: unknown) => ReactElement<{ children: ReactNode }>
  )(wrapper.props);
  const stage = Children.toArray(sceneCanvas.props.children).find(
    (child): child is ReactElement<{ useEditing?: unknown }> =>
      isValidElement(child) && child.type === KitchenStage,
  );
  if (stage === undefined) throw new Error("the canvas mounts no KitchenStage");
  return stage;
}

describe("which stage each canvas mounts", () => {
  it("gives the editor's canvas the stage with its default wiring", () => {
    expect(stageElementOf(KitchenCanvas).props.useEditing).toBeUndefined();
  });

  it("gives the view-only canvas the stage with nothing to edit through", () => {
    expect(stageElementOf(ViewOnlyKitchenCanvas).props.useEditing).toBe(
      useNoEditing,
    );
  });
});
