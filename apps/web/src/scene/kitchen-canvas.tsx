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
