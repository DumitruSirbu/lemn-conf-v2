"use client";

import { useCallback, useState } from "react";

import {
  savePreset,
  type PresetRefusalReason,
} from "@/persistence/preset-save-client";
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
