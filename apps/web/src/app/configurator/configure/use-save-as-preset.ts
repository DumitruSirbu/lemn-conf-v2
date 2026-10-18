"use client";

import { useCallback, useEffect, useState } from "react";

import {
  savePreset,
  type PresetRefusalReason,
} from "@/persistence/preset-save-client";
import { matchesMedia } from "@/lib/matches-media";
import { captureSceneImage } from "@/scene/capture-scene-image";
import {
  hasUnsavedEdit,
  useConfiguratorStore,
  type ConfiguratorState,
} from "@/store/configurator-store";

/**
 * Whether the design on screen is the one the server holds, which is the only kitchen a preset may be made of (ADR 0112
 * decision 3; ADR 0158: never shown as saved while the tab holds a write).
 * - `ready`: nothing waits to be written and the revision is the server's own.
 * - `waiting`: an edit is queued, in flight or backing off. The save coalescer sends it and this does not, so there is
 *   one save path; the dialog waits for it.
 * - `blocked`: a save was refused for good (a conflict, a stop or a lost credential), so waiting would never end.
 */
export type PresetSaveReadiness = "ready" | "waiting" | "blocked";

export function presetSaveReadinessOf(
  state: Pick<
    ConfiguratorState,
    "design" | "savedDesign" | "saveStatus" | "revision" | "designId"
  >,
): PresetSaveReadiness {
  if (
    state.saveStatus === "conflict" ||
    state.saveStatus === "stopped" ||
    state.saveStatus === "unauthorized"
  ) {
    return "blocked";
  }
  const isSettled =
    !hasUnsavedEdit(state) &&
    state.saveStatus === "idle" &&
    state.revision !== null &&
    state.designId !== null;
  return isSettled ? "ready" : "waiting";
}

/** What the dialog reports under its field. `notSaved` is the dialog's own, for a design that cannot be written. */
export type PresetSaveMessage = PresetRefusalReason | "notSaved";

export type PresetSavePhase =
  | { readonly kind: "idle" }
  | { readonly kind: "sending" }
  | { readonly kind: "saved" }
  | { readonly kind: "refused"; readonly reason: PresetRefusalReason };

/** How long the saved notice stays readable before the dialog closes by itself. */
export const SAVED_NOTICE_VISIBLE_MS = 1000;

/** How long the dialog then takes to fade out before it closes (`Presete.dc.html#3t-saved`). None under reduced motion. */
export const SAVED_NOTICE_FADE_MS = 200;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export interface PresetSave {
  readonly phase: PresetSavePhase;
  readonly readiness: PresetSaveReadiness;
  /** What a save may be pressed for now. */
  readonly canSubmit: boolean;
  readonly submit: (typedName: string) => void;
}

/** The dialog's work: capture the scene, then ask the route to keep the stored kitchen. It sends nothing while the
 *  design is not the stored one, and the revision it names is read at the moment of sending. */
export function usePresetSave(): PresetSave {
  const readiness = useConfiguratorStore(presetSaveReadinessOf);
  const [phase, setPhase] = useState<PresetSavePhase>({ kind: "idle" });

  const submit = useCallback((typedName: string) => {
    setPhase({ kind: "sending" });
    void saveWhatIsStored(typedName).then(setPhase);
  }, []);

  const canSubmit =
    readiness === "ready" && phase.kind !== "sending" && phase.kind !== "saved";
  return { phase, readiness, canSubmit, submit };
}

async function saveWhatIsStored(typedName: string): Promise<PresetSavePhase> {
  const image = await captureOrNothing();
  if (image === undefined) return refused("failed");
  // Read after the capture: the editor is modal but a background save may have landed or failed meanwhile.
  const state = useConfiguratorStore.getState();
  if (
    presetSaveReadinessOf(state) !== "ready" ||
    state.designId === null ||
    state.revision === null
  ) {
    return { kind: "idle" };
  }
  const name = typedName.trim();
  const outcome = await savePreset({
    designId: state.designId,
    revision: state.revision,
    name: name === "" ? undefined : name,
    image,
  });
  return outcome.kind === "saved" ? { kind: "saved" } : refused(outcome.reason);
}

async function captureOrNothing() {
  try {
    return await captureSceneImage();
  } catch {
    return undefined;
  }
}

function refused(reason: PresetRefusalReason): PresetSavePhase {
  return { kind: "refused", reason };
}

/**
 * Closes the dialog once the saved notice has been on screen for `SAVED_NOTICE_VISIBLE_MS` and has then faded for
 * `SAVED_NOTICE_FADE_MS`; the result is true during that fade. A refusal never closes it, and both timers die with the
 * dialog, so a manual close first leaves nothing to fire. Under reduced motion there is no fade: it closes at the end of
 * the visible time.
 */
export function useCloseAfterSavedNotice(
  phase: PresetSavePhase,
  close: () => void,
): boolean {
  const isSaved = phase.kind === "saved";
  const [isFading, setFading] = useState(false);

  useEffect(() => {
    if (!isSaved) return undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const fadeTimer = setTimeout(() => {
      if (matchesMedia(REDUCED_MOTION_QUERY)) {
        close();
        return;
      }
      setFading(true);
      closeTimer = setTimeout(close, SAVED_NOTICE_FADE_MS);
    }, SAVED_NOTICE_VISIBLE_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(closeTimer);
    };
  }, [isSaved, close]);

  return isFading;
}
