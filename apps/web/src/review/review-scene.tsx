"use client";

import { cameraPresetsForRoom } from "@lemnaria/three-adapter";
import dynamic from "next/dynamic";
import { useMemo } from "react";

import styles from "@/app/d/[id]/review/review.module.css";
import { useContent } from "@/i18n/use-content";
import { useCameraPreset } from "@/scene/camera-preset-store";
import { presetForRoom, type SceneView } from "@/scene/scene-view";
import { useWebGLSupport } from "@/scene/webgl-support";
import { useConfiguratorStore } from "@/store/configurator-store";

// The view-only canvas, fetched on the screen that shows it and never rendered on the server.
const ViewOnlyKitchenCanvas = dynamic(
  () =>
    import("@/scene/kitchen-canvas").then(
      (canvasModule) => canvasModule.ViewOnlyKitchenCanvas,
    ),
  { ssr: false, loading: SceneLoading },
);

/**
 * The kitchen as the review shows it: the editor's scene, orbitable and with the room's own camera views as
 * chips, that selects nothing and edits nothing. It draws the design the session store holds, so the screen that
 * places it hydrates the store first. It neither orbits nor selects: the views change by the chips. A device
 * without WebGL gets nothing from it: the screen answers for that with the editor's exit.
 *
 * The view is the editor's remembered one (`useCameraPreset`): one camera for one customer, so a language switch
 * does not send the review back to the overview either.
 */
export function ReviewScene() {
  const content = useContent();
  const room = useConfiguratorStore((state) => state.design.room);
  const presetId = useCameraPreset((state) => state.presetId);
  const standAt = useCameraPreset((state) => state.standAt);
  const support = useWebGLSupport();

  const view = useMemo<SceneView>(
    () => ({ kind: "preset", id: presetId }),
    [presetId],
  );
  const cameraPresets = useMemo(() => cameraPresetsForRoom(room), [room]);
  // The stored id may be one this room has outgrown; the button pressed is the one the scene actually frames.
  const resolvedPresetId = useMemo(
    () => presetForRoom(presetId, room).id,
    [presetId, room],
  );

  if (support === "unsupported") return null;

  return (
    <div className={styles.sceneFill} data-testid="review-scene">
      {support === "probing" ? (
        <div className={styles.sceneLoading}>{content.configure.loading}</div>
      ) : (
        <ViewOnlyKitchenCanvas view={view} />
      )}
      <div
        className={styles.presets}
        role="group"
        aria-label={content.configure.cameraGroupLabel}
      >
        {cameraPresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={styles.preset}
            aria-pressed={preset.id === resolvedPresetId}
            onClick={() => {
              standAt(preset.id);
            }}
          >
            {content.configure.cameraPresets[preset.id]}
          </button>
        ))}
      </div>
    </div>
  );
}

function SceneLoading() {
  return (
    <div className={styles.sceneLoading}>{useContent().configure.loading}</div>
  );
}
