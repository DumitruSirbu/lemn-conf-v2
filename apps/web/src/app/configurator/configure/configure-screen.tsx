"use client";

import { CAMERA_PRESETS, type CameraPresetId } from "@lemnaria/three-adapter";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { EditorPanel } from "@/panel/editor-panel";
import { FlaggedTotalWarning } from "@/price/flagged-total-warning";
import { PriceBar } from "@/price/price-bar";
import { PriceBreakdown } from "@/price/price-breakdown";
import { usePanelView } from "@/panel/use-panel-view";
import { WebGLUnavailable } from "@/components/webgl-unavailable";
import { useContent } from "@/i18n/use-content";
import { OverflowWarning } from "@/scene/overflow-warning";
import { GlobalSettings } from "@/settings/global-settings";
import { SettingsPillMeasurement } from "@/settings/settings-pill-measurement";
import { widestCounterFor } from "@/settings/global-settings-model";
import type { SceneView } from "@/scene/scene-view";
import { detectWebGLSupport } from "@/scene/webgl-support";

import styles from "./configure.module.css";
import { SelectionDebug } from "./selection-debug";
import { useTopBarFit } from "./use-top-bar-fit";

// The canvas never renders on the server, and its bundle is only fetched on the step that needs 3D.
const KitchenCanvas = dynamic(() => import("@/scene/kitchen-canvas"), {
  ssr: false,
  loading: ConfigureLoading,
});

function ConfigureLoading() {
  const content = useContent();
  return <div className={styles.loading}>{content.configure.loading}</div>;
}

type SupportState = "probing" | "supported" | "unsupported";

export function ConfigureScreen({
  webglUnavailableTitleMobile,
}: {
  webglUnavailableTitleMobile?: string;
} = {}) {
  const ro = useContent();
  const [support, setSupport] = useState<SupportState>("probing");
  const [presetId, setPresetId] = useState<CameraPresetId>("overview");
  const panel = usePanelView();
  // The top bar's one measurement and the two decisions taken from it — how many settings the pill
  // names, and what the row gives up to leave room for them. See `use-top-bar-fit.ts`.
  const topBar = useTopBarFit();

  useEffect(() => {
    setSupport(detectWebGLSupport() ? "supported" : "unsupported");
  }, []);

  const view = useMemo<SceneView>(
    () => ({ kind: "preset", id: presetId }),
    [presetId],
  );

  if (support === "unsupported") {
    return (
      <WebGLUnavailable
        {...(webglUnavailableTitleMobile === undefined
          ? {}
          : { titleMobile: webglUnavailableTitleMobile })}
      />
    );
  }

  return (
    <main
      className={styles.screen}
      style={topBar.spacingMetrics}
      data-wordmark={topBar.isWordmarkDrawn ? "drawn" : "dropped"}
    >
      {/* Frames 2A / D2A's top bar, as **five grid items of the screen** rather than one header
          element: the settings pill, the price, the actions and the locale each have to stand in a
          different place per shell, and a grid is what lets one element do that without a second
          copy of the row in the markup (§10.1's one permitted fork, taken in CSS).

          Which element opens the row is the shell's own answer and is decided in CSS: frame 2A puts
          the back control there, frame D2A the wordmark. Both are rendered and
          `configure.module.css` hides one. */}
      <header className={styles.nav}>
        {/* Frame 2A `:483` draws the glyph alone. The word is the control's **accessible name** —
            `role="img"` over the ruled string, the pattern the step pill below already uses, because
            a `‹` read aloud is not a name. */}
        <span
          className={styles.back}
          role="img"
          aria-label={ro.configure.back}
          data-testid="top-bar-back"
        >
          ‹
        </span>
        <span className={styles.wordmark}>{ro.brand}</span>
        {/* The step, twice over and from one source (`content/ro.ts`): the pill the frames draw, and
            — as its accessible name — the sentence the caption it replaced said. "2/4" read aloud is
            two numbers and a slash, which announces less than the surface used to.

            `role="img"` over a visually hidden span, because a hidden span is a clipped one: the
            900 px containment gate reads every span in this row and fails any whose text is cut, and
            it cannot tell "deliberately hidden" from "squeezed by the price cell" — which is the
            defect it exists to catch. */}
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
      </header>
      {/* Frames D2A / 2A's settings pill, which is **also the trigger** for the sheet it names
          (ADR 0104 decision 2). A grid item of the screen rather than a child of the header, and the
          reason is stacking rather than taste: the sheet is modal on both shells, so its scrim has to
          paint above the price bar, §9's rail and the breakdown's popover, and a subtree of the
          header cannot. `configure.module.css` carries the whole stacking table.

          The item's own box — not the pill's — is what the ladder is measured against, so the pill
          can be given room it is not currently using. */}
      <div className={styles.settings} ref={topBar.settingsTrackRef}>
        <GlobalSettings visibleCount={topBar.visibleCount} />
      </div>
      {/* Drawn exactly as the reference draws it and **wired to nothing**. Locale switching is
          M6B wave 6B-i, gated on the owner's Gate O1; a caret that does nothing is the correct
          state of this control today, and a control that did something would pre-empt a ruling. */}
      <div className={styles.locale}>
        <span className={styles.localeChip} data-testid="top-bar-locale">
          <span className={styles.localeCode}>{ro.configure.locale}</span>
          <span className={styles.localeCaret} aria-hidden="true">
            ▾
          </span>
        </span>
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
          {/* The scene's bottom stack. Every child is an overlay and none takes flow height, so the
              canvas's box does not depend on what is on screen — which is the whole of wave 6M's
              revised placement (`scene/overflow-warning-layout.ts`). The warning is last so it keeps
              the scene's bottom edge, directly above the price bar.

              **The flagged total's sentence joins the stack here** on the owner's ruling of
              2026-09-09 (ADR 0104 decision 8b), which took it out of the top bar so the header keeps
              frame D2A's shape on a flagged design as well as a seeded one. */}
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
            <FlaggedTotalWarning />
            <OverflowWarning />
          </div>
        </div>
        <EditorPanel view={panel} />
        <SelectionDebug />
      </div>
      {/* Frames 2A / D2A: the bottom bar's first row on mobile, the top bar's price column on
          desktop. Placed in the grid by `configure.module.css`; which of the two it is, is decided
          there.

          The breakdown's control stands beside the figure it explains in both frames — which is also
          what makes the desktop popover a popover *anchored to the price* rather than a panel that
          happens to open near it. */}
      <div className={styles.priceRow}>
        <div className={styles.priceColumn}>
          <PriceBar />
          <PriceBreakdown />
        </div>
      </div>
      {/* Frame 2A `:515–519`'s second bottom row, and frame D2A `:567`'s CTA. **Both are drawn and
          wired to nothing** (ADR 0104 decision 6): they lead to M8's review step, which is not built
          and has no route. Not buttons, no `role`, no `tabindex` — the frames use non-interactive
          elements in both files, and an element with a control's affordances and no behaviour is
          worse than static text. */}
      <div className={styles.actions}>
        <span className={styles.backAction} data-testid="bottom-bar-back">
          {ro.configure.backAction}
        </span>
        <span className={styles.reviewCta} data-testid="review-cta">
          {ro.configure.reviewCta}
        </span>
      </div>
      {/* The hidden nodes the row's fit is measured from. They stand outside every cell they are
          about: the wordmark's probe is not in the nav, so dropping the wordmark cannot destroy the
          measurement that would put it back. */}
      <div className={styles.measure} aria-hidden="true">
        <span className={styles.wordmark} ref={topBar.wordmarkProbeRef}>
          {ro.brand}
        </span>
      </div>
      <SettingsPillMeasurement
        labels={topBar.pill.settings.map((setting) => setting.label)}
        widestCounter={widestCounterFor(topBar.pill)}
        onMeasured={topBar.onPillMeasured}
      />
    </main>
  );
}
