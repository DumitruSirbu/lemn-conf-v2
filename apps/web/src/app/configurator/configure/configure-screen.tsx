"use client";

import { CAMERA_PRESETS, type CameraPresetId } from "@lemnaria/three-adapter";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { EditorPanel } from "@/panel/editor-panel";
import { PriceBar } from "@/price/price-bar";
import { PriceBreakdown } from "@/price/price-breakdown";
import { usePanelView } from "@/panel/use-panel-view";
import { WebGLUnavailable } from "@/components/webgl-unavailable";
import { ro } from "@/content/ro";
import { OverflowWarning } from "@/scene/overflow-warning";
import { GlobalSettings } from "@/settings/global-settings";
import type { SceneView } from "@/scene/scene-view";
import { detectWebGLSupport } from "@/scene/webgl-support";

import styles from "./configure.module.css";
import { SelectionDebug } from "./selection-debug";

// The canvas never renders on the server, and its bundle is only fetched on the step that needs 3D.
const KitchenCanvas = dynamic(() => import("@/scene/kitchen-canvas"), {
  ssr: false,
  loading: () => <div className={styles.loading}>{ro.configure.loading}</div>,
});

type SupportState = "probing" | "supported" | "unsupported";

export function ConfigureScreen() {
  const [support, setSupport] = useState<SupportState>("probing");
  const [presetId, setPresetId] = useState<CameraPresetId>("overview");
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
      {/* The refreshed frames 2A / D2A: **one row**, replacing the caption-over-progress-bar the
          earlier export drew. The four progress segments are gone from the reference entirely and
          from here with them; the step they encoded is now the pill.

          Which element opens the row is the shell's own answer and is decided in CSS, as §10.1's
          one permitted fork requires: frame 2A puts the back control there, frames D2A–D2C put the
          wordmark. Both are rendered and `configure.module.css` hides one — a markup fork would be
          a second copy of the row to keep in step. */}
      <header className={styles.header}>
        <span className={styles.back}>{ro.configure.back}</span>
        <span className={styles.wordmark}>{ro.brand}</span>
        {/* The step, twice over and from one source (`content/ro.ts`): the pill the frames draw, and
            — as its accessible name — the sentence the caption it replaced said. "2/4" read aloud is
            two numbers and a slash, which announces less than the surface used to.

            `role="img"` over a visually hidden span, because a hidden span is a clipped one: the
            900 px gate in `settings-strip-containment.desktop.e2e.spec.ts` reads every span in this
            header and fails any whose text is cut, and it cannot tell "deliberately hidden" from
            "squeezed by the price cell" — which is the defect it exists to catch. */}
        <span
          className={styles.stepPill}
          role="img"
          aria-label={ro.configure.step}
          data-testid="top-bar-step"
        >
          {ro.configure.stepPill}
        </span>
        <span className={styles.title} data-testid="top-bar-title">
          {ro.configure.title}
        </span>
        {/* Drawn exactly as the reference draws it and **wired to nothing**. Locale switching is
            M6B wave 6B-i, gated on the owner's Gate O1; a caret that does nothing is the correct
            state of this control today, and a control that did something would pre-empt a ruling. */}
        <span className={styles.locale} data-testid="top-bar-locale">
          <span className={styles.localeCode}>{ro.configure.locale}</span>
          <span className={styles.localeCaret} aria-hidden="true">
            ▾
          </span>
        </span>
      </header>
      {/* Frames 2E / D2E: the material and hardware chips and the control that opens them — a strip
          under the header on mobile, part of the top bar on desktop. A band of the screen's own grid
          rather than a child of the header, because the sheet it opens is modal on both shells: the
          scrim and the popover have to paint above the price bar and §9's rail, and a subtree of the
          header cannot (`configure.module.css` lifts this band, and says so there). */}
      <div className={styles.settingsRow}>
        <GlobalSettings />
      </div>
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
          {/* The scene's bottom stack. Both children are overlays and neither takes flow height, so
              the canvas's box does not depend on whether either is on screen — which is the whole of
              wave 6M's revised placement (`scene/overflow-warning-layout.ts`). The warning is last so
              it keeps the scene's bottom edge, directly above the price bar, with the hint above it
              rather than inside it. */}
          <div className={styles.sceneFooter}>
            {/* Frames 2A / D2A: the nothing-selected instruction copy, and the only place it lives.
                It is hidden while the panel is open, where it would sit behind the sheet — and it is
                gated on the same `PanelView` the panel renders from, so "panel open" and "hint
                hidden" cannot answer differently on a state one of them has not considered. */}
            {panel.kind === "open" ? null : (
              <p className={styles.hint} data-testid="scene-hint">
                <span>{ro.configure.orbitHint}</span>
              </p>
            )}
            <OverflowWarning />
          </div>
        </div>
        <EditorPanel view={panel} />
        <SelectionDebug />
      </div>
      {/* Frames 2A / D2A: the bottom bar on mobile, the top bar's figure on desktop. Placed in the
          grid by `configure.module.css`; which of the two it is, is decided there.

          The breakdown's control stands beside the figure it explains, in both frames — which is
          also what makes the desktop popover a popover *anchored to the price* rather than a panel
          that happens to open near it. */}
      <div className={styles.priceRow}>
        <PriceBar />
        <PriceBreakdown />
      </div>
    </main>
  );
}
