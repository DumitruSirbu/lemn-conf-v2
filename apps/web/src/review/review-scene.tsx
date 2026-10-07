"use client";

import { cameraPresetsForRoom } from "@lemnaria/three-adapter";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { WebGLUnavailable } from "@/components/webgl-unavailable";
import { useContent } from "@/i18n/use-content";
import { useCameraPreset } from "@/scene/camera-preset-store";
import { presetForRoom, type SceneView } from "@/scene/scene-view";
import { detectWebGLSupport } from "@/scene/webgl-support";
import { useConfiguratorStore } from "@/store/configurator-store";

/** The class names the screen that places the scene gives it; the scene draws no layout of its own. */
export interface ReviewSceneClassNames {
  readonly viewport?: string;
  readonly presets?: string;
  readonly preset?: string;
  readonly loading?: string;
}

// The view-only canvas, fetched on the screen that shows it and never rendered on the server.
const ViewOnlyKitchenCanvas = dynamic(
  () =>
    import("@/scene/kitchen-canvas").then(
      (canvasModule) => canvasModule.ViewOnlyKitchenCanvas,
    ),
  { ssr: false, loading: SceneLoading },
);

type SupportState = "probing" | "supported" | "unsupported";

/**
 * The kitchen as the review shows it: the editor's scene, orbitable and with the room's own camera views as
 * chips, that selects nothing and edits nothing. It draws the design the session store holds, so the screen that
 * places it hydrates the store first. A device without WebGL gets the editor's own exit.
 *
 * The view is the editor's remembered one (`useCameraPreset`): one camera for one customer, so a language switch
 * does not send the review back to the overview either.
 */
export function ReviewScene({
  classNames = {},
}: {
  classNames?: ReviewSceneClassNames;
}) {
  const content = useContent();
  const room = useConfiguratorStore((state) => state.design.room);
  const presetId = useCameraPreset((state) => state.presetId);
  const standAt = useCameraPreset((state) => state.standAt);
  const [support, setSupport] = useState<SupportState>("probing");

  useEffect(() => {
    setSupport(detectWebGLSupport() ? "supported" : "unsupported");
  }, []);

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

  if (support === "unsupported") return <WebGLUnavailable />;

  return (
    <div className={classNames.viewport} data-testid="review-scene">
      {support === "probing" ? (
        <div className={classNames.loading}>{content.configure.loading}</div>
      ) : (
        <ViewOnlyKitchenCanvas view={view} />
      )}
      <div
        className={classNames.presets}
        role="group"
        aria-label={content.configure.cameraGroupLabel}
      >
        {cameraPresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={classNames.preset}
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
  return <div>{useContent().configure.loading}</div>;
}
