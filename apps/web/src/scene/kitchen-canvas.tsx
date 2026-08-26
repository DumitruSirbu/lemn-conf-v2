"use client";

import {
  CAMERA_FIELD_OF_VIEW_DEGREES,
  MAX_DEVICE_PIXEL_RATIO,
  RENDERER_PARAMETERS,
  type FinishKey,
} from "@lemnaria/three-adapter";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

import { KitchenStage } from "./kitchen-stage";
import type { SceneView } from "./scene-view";

export interface KitchenCanvasProps {
  view: SceneView;
  finish?: FinishKey;
  /** `always` only for the capture harness, which needs frames without a gesture to drive them. */
  frameloop?: "demand" | "always";
  onSettled?: () => void;
}

/**
 * One renderer for the whole editor session. Frames are drawn on demand outside active gestures,
 * and the device pixel ratio is capped and allowed to regress under load.
 */
export default function KitchenCanvas({
  view,
  finish,
  frameloop = "demand",
  onSettled,
}: KitchenCanvasProps) {
  return (
    <Canvas
      onCreated={({ gl }) => {
        stopTouchFromAlsoClicking(gl.domElement);
      }}
      frameloop={frameloop}
      dpr={[1, MAX_DEVICE_PIXEL_RATIO]}
      performance={{ min: 0.5 }}
      gl={RENDERER_PARAMETERS}
      camera={{
        fov: CAMERA_FIELD_OF_VIEW_DEGREES,
        near: 0.01,
        far: 500,
        position: [3, 2.2, 4],
      }}
    >
      <KitchenStage
        view={view}
        {...(finish ? { finish } : {})}
        {...(onSettled ? { onSettled } : {})}
      />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </Canvas>
  );
}

/**
 * Stops a touch on the scene from *also* arriving as a mouse click on whatever the DOM has put
 * under the finger by the time the browser dispatches it.
 *
 * A touch produces `pointerdown`/`pointerup` — which is what react-three-fiber picks with — and
 * then, for the benefit of listeners that only understand a mouse, the browser synthesises
 * `mousedown`/`mouseup`/`click` at the same point. Those are hit-tested when they are dispatched,
 * not when the finger landed, and by then picking has already opened §9's sheet over the bottom
 * ~78 dvh of a 390 x 844 viewport. Measured, not theorised: one tap that selected the fridge
 * arrived as `touchend` on the canvas and then as `click` on `finish-white`, and applied a finish
 * nobody chose. The milestone's "the sheet never steals or leaks pointer events into the canvas"
 * is exactly this, in the direction nobody expected it from.
 *
 * Cancelling `touchend` is the fix at the source: the specification says a cancelled touch produces
 * no compatibility mouse events, and this canvas has no use for them — it is driven by pointer
 * events and already declares `touch-action: none`. Nothing a mouse does is affected, because a
 * real mouse never produces a `touchend`.
 *
 * The listener must be non-passive, or `preventDefault` is ignored, so it is attached to the
 * element rather than through React's delegated (and passive-by-default) touch handlers.
 */
function stopTouchFromAlsoClicking(canvas: HTMLCanvasElement): void {
  canvas.addEventListener(
    "touchend",
    (event) => {
      event.preventDefault();
    },
    { passive: false },
  );
}
