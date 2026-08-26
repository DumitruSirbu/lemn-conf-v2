"use client";

import { CAMERA_PRESETS, type CameraPresetId } from "@lemnaria/three-adapter";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { EditorPanel } from "@/panel/editor-panel";
import { usePanelView } from "@/panel/use-panel-view";
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
  const panel = usePanelView();

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
      {/* On mobile this is the positioning context for the bottom sheet; on desktop it is the row
          the 420 px rail takes its space from. Which of the two happens is decided entirely in
          CSS — see `editor-panel.module.css`. */}
      <div className={styles.stage}>
        <div className={styles.viewport}>
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
          {/* Frames 2A / D2A: the nothing-selected instruction copy, and the only place it lives.
              It is hidden while the panel is open, where it would sit behind the sheet — and it is
              gated on the same `PanelView` the panel renders from, so "panel open" and "hint
              hidden" cannot answer differently on a state one of them has not considered. */}
          {panel.kind === "open" ? null : (
            <p className={styles.hint} data-testid="scene-hint">
              <span>{ro.configure.orbitHint}</span>
            </p>
          )}
        </div>
        <EditorPanel view={panel} />
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
