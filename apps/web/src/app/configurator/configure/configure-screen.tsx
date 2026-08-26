"use client";

import { CAMERA_PRESETS, type CameraPresetId } from "@lemnaria/three-adapter";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { TemporaryDevControls } from "@/components/temporary-dev-controls";
import { WebGLUnavailable } from "@/components/webgl-unavailable";
import { ro } from "@/content/ro";
import type { SceneView } from "@/scene/scene-view";
import { detectWebGLSupport } from "@/scene/webgl-support";
import { useConfiguratorStore } from "@/store/configurator-store";

import styles from "./configure.module.css";

// The canvas never renders on the server, and its bundle is only fetched on the step that needs 3D.
const KitchenCanvas = dynamic(() => import("@/scene/kitchen-canvas"), {
  ssr: false,
  loading: () => <div className={styles.loading}>{ro.configure.loading}</div>,
});

type SupportState = "probing" | "supported" | "unsupported";

export function ConfigureScreen() {
  const [support, setSupport] = useState<SupportState>("probing");
  const [presetId, setPresetId] = useState<CameraPresetId>("overview");
  const selection = useConfiguratorStore((state) => state.selection);

  useEffect(() => {
    setSupport(detectWebGLSupport() ? "supported" : "unsupported");
  }, []);

  const view = useMemo<SceneView>(
    () => ({ kind: "preset", id: presetId }),
    [presetId],
  );

  if (support === "unsupported") return <WebGLUnavailable />;

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <span className={styles.back}>{ro.configure.back}</span>
          <span className={styles.step}>{ro.configure.step}</span>
        </div>
        <div className={styles.progress} aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      </header>
      <div className={styles.stage}>
        {support === "probing" ? (
          <div className={styles.loading}>{ro.configure.loading}</div>
        ) : (
          <KitchenCanvas view={view} />
        )}
        <div
          className={styles.presets}
          role="group"
          aria-label={ro.configure.cameraGroupLabel}
        >
          {CAMERA_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.preset}
              aria-pressed={preset.id === presetId}
              onClick={() => {
                setPresetId(preset.id);
              }}
            >
              {ro.configure.cameraPresets[preset.id]}
            </button>
          ))}
        </div>
        <p className={styles.hint}>
          <span>{ro.configure.orbitHint}</span>
        </p>
        {/* TEMPORARY — removed by M4 along with the component itself. M3's four verbs have no
         *  surface until §9's panel exists; this drives them from the current selection. */}
        <TemporaryDevControls />
        {/* Test-only observability hook for the mobile picking gate (M2 §Surfaces): selection
         *  state is otherwise only visible inside the WebGL canvas, which Playwright cannot query. */}
        <span
          data-testid="selection-debug"
          data-selection-kind={selection?.kind ?? ""}
          data-selection-id={selection?.id ?? ""}
          hidden
        />
      </div>
    </main>
  );
}
