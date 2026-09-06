"use client";

import type { Finish } from "@lemnaria/configurator-domain";
import { STAGE_BACKGROUND } from "@lemnaria/three-adapter";
import { useCallback, useMemo, useRef, useState } from "react";

import KitchenCanvas from "@/scene/kitchen-canvas";
import type { SceneView } from "@/scene/scene-view";

/** Frames to let settle after the camera lands, so the capture never reads a half-composited buffer. */
const FRAMES_BEFORE_READY = 5;

export interface SceneShotProps {
  width: number;
  height: number;
  position: [number, number, number];
  target: [number, number, number];
  finish: Finish;
}

/**
 * Internal verification surface, not a customer feature: it reproduces one reference render under
 * exactly the conditions `preset-shots.html` pinned, with no chrome to crop out. Nothing links to
 * it and it is excluded from indexing.
 */
export function SceneShot({
  width,
  height,
  position,
  target,
  finish,
}: SceneShotProps) {
  const [isReady, setReady] = useState(false);
  const hasArmed = useRef(false);

  const view = useMemo<SceneView>(
    () => ({ kind: "fixed", position, target }),
    [position, target],
  );

  const handleSettled = useCallback(() => {
    if (hasArmed.current) return;
    hasArmed.current = true;
    let remaining = FRAMES_BEFORE_READY;
    const tick = () => {
      remaining -= 1;
      if (remaining > 0) {
        requestAnimationFrame(tick);
        return;
      }
      setReady(true);
    };
    requestAnimationFrame(tick);
  }, []);

  return (
    <div
      data-testid="scene-shot"
      data-ready={isReady ? "true" : "false"}
      style={{
        width,
        height,
        background: STAGE_BACKGROUND,
        overflow: "hidden",
      }}
    >
      <KitchenCanvas
        view={view}
        finish={finish}
        frameloop="always"
        onSettled={handleSettled}
      />
    </div>
  );
}
