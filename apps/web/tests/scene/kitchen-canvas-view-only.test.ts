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
  VIEW_ONLY_TOUCH_ACTION,
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

interface SceneCanvasElement {
  readonly props: {
    readonly children: ReactNode;
    readonly onCreated: (state: { gl: { domElement: unknown } }) => void;
  };
}

function sceneCanvasOf(
  canvas: (props: { view: typeof VIEW }) => ReactElement,
): SceneCanvasElement {
  const wrapper = canvas({ view: VIEW }) as ReactElement<{ view: unknown }>;
  return (wrapper.type as (props: unknown) => SceneCanvasElement)(
    wrapper.props,
  );
}

function childTypes(canvas: SceneCanvasElement): unknown[] {
  return Children.toArray(canvas.props.children).flatMap((child) =>
    isValidElement(child) ? [child.type] : [],
  );
}

function createdCanvasElement() {
  return {
    style: { touchAction: "" },
    addEventListener: vi.fn(),
  };
}

describe("what each canvas does with a touch and a drag", () => {
  it("mounts orbit controls on the editor's canvas, which is what turns a drag into a camera move", () => {
    expect(childTypes(sceneCanvasOf(KitchenCanvas))).toContain("orbit-stub");
  });

  it("mounts no orbit controls on the view-only canvas, so a drag has nothing to move", () => {
    expect(childTypes(sceneCanvasOf(ViewOnlyKitchenCanvas))).not.toContain(
      "orbit-stub",
    );
  });

  it("declares a vertical pan and a pinch for the page on the view-only canvas, and nothing else", () => {
    const element = createdCanvasElement();

    sceneCanvasOf(ViewOnlyKitchenCanvas).props.onCreated({
      gl: { domElement: element },
    });

    expect(VIEW_ONLY_TOUCH_ACTION).toBe("pan-y pinch-zoom");
    expect(element.style.touchAction).toBe("pan-y pinch-zoom");
    expect(element.addEventListener).not.toHaveBeenCalled();
  });

  it("keeps cancelling the editor canvas's touchend, non-passively (ADR 0023)", () => {
    const element = createdCanvasElement();

    sceneCanvasOf(KitchenCanvas).props.onCreated({
      gl: { domElement: element },
    });

    expect(element.addEventListener).toHaveBeenCalledWith(
      "touchend",
      expect.any(Function),
      { passive: false },
    );
    expect(element.style.touchAction).toBe("");
  });
});
