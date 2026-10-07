"use client";

// The review's links open the editor with `?select={placementId}` (a body to select) or `?settings=open` (the
// settings sheet). Each parameter is acted on once and leaves the URL at its own outcome, never before: until
// then a reload starts the same arrival again. The screen only exists after the owned load answered, so neither
// is acted on for a browser the gate refused, and not at all in the share view.
import { isDragGesture } from "@lemnaria/three-adapter";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import { useCameraPreset, viewOfWall } from "@/scene/camera-preset-store";
import type { WebGLSupportState } from "@/scene/webgl-support";
import { useConfiguratorStore } from "@/store/configurator-store";

const SELECT_PARAMETER = "select";
const SETTINGS_PARAMETER = "settings";
const SETTINGS_TRIGGER = '[data-testid="global-settings-trigger"]';

/** What the hook keeps between effect runs. Refs, so a remount (StrictMode's, Fast Refresh's) does not decide twice. */
interface ArrivalMemory {
  /** The `select` value already decided, so it is not decided again while the parameter stays on the URL. */
  readonly decidedBody: RefObject<string | null>;
  /** The body chosen and not yet selected, waiting for the scene. */
  readonly bodyToSelect: RefObject<string | null>;
  readonly hasHandledSettings: RefObject<boolean>;
}

/**
 * `select`: the camera stands at the body's own wall view, then the body is selected. In a U the scene deselects a
 * body on a wall the eye cuts away, from its first frame and through the ease from its framing position, so the
 * body is selected when the scene rests (`onSceneSettled`). Four outcomes take the parameter off: it is selected
 * at rest; the customer acts first (a tap on the scene, which `watchForTheCustomersTap` sees); the design does not
 * hold the body; no scene will exist on this device. Other rooms cut nothing, so the body is selected at once.
 *
 * `settings=open` needs the answer about write access, because the sheet's trigger is off until it comes: while it
 * is awaited nothing is pressed and the parameter stays. Writable, the trigger is pressed if it is enabled at that
 * moment; otherwise the sheet is not opened and the editor's own notice says why. The parameter leaves either way.
 *
 * A parameter is taken off with `replaceState` over the same entry and its own state, so the history gains nothing
 * (Back from an editor reached through the review returns to the review) and the guard's marker survives.
 */
export function useHonourArrival({
  isOwner,
  support,
  settingsTrackRef,
}: {
  readonly isOwner: boolean;
  readonly support: WebGLSupportState;
  readonly settingsTrackRef: RefObject<HTMLElement | null>;
}): { readonly onSceneSettled: () => void } {
  const searchParams = useSearchParams();
  const canWrite = useConfiguratorStore((state) => state.canWrite);
  const memory: ArrivalMemory = {
    decidedBody: useRef<string | null>(null),
    bodyToSelect: useRef<string | null>(null),
    hasHandledSettings: useRef(false),
  };
  // The state arms the watch below; the ref says what was chosen. The watch is set up by an effect that owns its
  // cleanup, so mount, cleanup, mount leaves it armed.
  const [isAwaitingScene, setIsAwaitingScene] = useState(false);

  const endSelection = useCallback(() => {
    memory.bodyToSelect.current = null;
    setIsAwaitingScene(false);
    removeParameter(SELECT_PARAMETER);
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    const arrival = new URLSearchParams(searchParams);
    chooseSelection(arrival.get(SELECT_PARAMETER), memory, () => {
      setIsAwaitingScene(true);
    });
    handleSettings(arrival.get(SETTINGS_PARAMETER), {
      canWrite,
      track: settingsTrackRef.current,
      hasHandled: memory.hasHandledSettings,
    });
  }, [isOwner, searchParams, canWrite, settingsTrackRef]);

  useEffect(() => {
    if (!isAwaitingScene) return;
    if (support === "unsupported") {
      endSelection();
      return;
    }
    if (support !== "supported") return;
    return watchForTheCustomersTap(endSelection);
  }, [isAwaitingScene, support, endSelection]);

  const onSceneSettled = useCallback(() => {
    const placementId = memory.bodyToSelect.current;
    if (placementId === null) return;
    useConfiguratorStore
      .getState()
      .select({ kind: "placement", id: placementId });
    endSelection();
  }, [endSelection]);

  return { onSceneSettled };
}

/** Decides a `select` value once: stands at its wall's view and either selects at once, waits for the scene, or
 *  ends because there is nothing to select. */
function chooseSelection(
  value: string | null,
  memory: ArrivalMemory,
  awaitScene: () => void,
): void {
  if (value === null || memory.decidedBody.current === value) return;
  memory.decidedBody.current = value;
  const placementId = standAtWallOf(value);
  if (placementId === null) {
    removeParameter(SELECT_PARAMETER);
    return;
  }
  memory.bodyToSelect.current = placementId;
  if (willSceneCutWalls()) {
    awaitScene();
    return;
  }
  useConfiguratorStore
    .getState()
    .select({ kind: "placement", id: placementId });
  memory.bodyToSelect.current = null;
  removeParameter(SELECT_PARAMETER);
}

function handleSettings(
  value: string | null,
  context: {
    readonly canWrite: ReturnType<
      typeof useConfiguratorStore.getState
    >["canWrite"];
    readonly track: HTMLElement | null;
    readonly hasHandled: RefObject<boolean>;
  },
): void {
  if (value === null || context.hasHandled.current) return;
  if (value === "open") {
    if (context.canWrite === "checking") return;
    if (context.canWrite === true) pressSettingsTrigger(context.track);
  }
  context.hasHandled.current = true;
  removeParameter(SETTINGS_PARAMETER);
}

/**
 * Stands the camera at the named body's own wall view and returns the body to select; `null` for a body the design
 * does not hold. The remembered view becomes the one stood at.
 */
function standAtWallOf(placementId: string): string | null {
  const { records, design } = useConfiguratorStore.getState();
  const record = records.find((candidate) => candidate.id === placementId);
  if (record === undefined) return null;
  const view = viewOfWall(record.wall, design.room);
  if (view === null) return null;
  useCameraPreset.getState().standAt(view);
  return placementId;
}

/** Only a U's scene cuts a wall away (`cutawayWallsFor`), so only there can it undo a selection. */
function willSceneCutWalls(): boolean {
  return useConfiguratorStore.getState().design.room.shape === "U";
}

/** Presses the settings trigger if it is enabled now; a disabled button ignores a click, and the press is not
 *  retried. */
function pressSettingsTrigger(track: HTMLElement | null): void {
  const trigger = track?.querySelector<HTMLButtonElement>(SETTINGS_TRIGGER);
  if (trigger !== null && trigger !== undefined && !trigger.disabled)
    trigger.click();
}

/** Takes one parameter off the URL, over the current entry and its own state; nothing happens if it is not there. */
function removeParameter(name: string): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(name)) return;
  url.searchParams.delete(name);
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

/**
 * Calls `onTap` when the customer taps the scene, and returns the way to stop watching. A tap is the one thing that
 * can select or clear anything before the scene rests, so it tells the customer's act from the arrival's write and
 * from the scene's deselect on a cut wall (no pointer gesture, and it needs a selection a pending arrival has not
 * made). A tap is a press and a release on the canvas that `isDragGesture` does not call an orbit, seen in the
 * capture phase so it is known before the scene acts on the same tap. One press position serves all pointers, so a
 * two-finger pinch could read as a tap: recorded, not handled.
 */
function watchForTheCustomersTap(onTap: () => void): () => void {
  let pressedAt: { x: number; y: number } | null = null;
  const isOnTheScene = (event: Event) =>
    event.target instanceof HTMLCanvasElement;
  const press = (event: PointerEvent) => {
    pressedAt = isOnTheScene(event)
      ? { x: event.clientX, y: event.clientY }
      : null;
  };
  const release = (event: PointerEvent) => {
    const start = pressedAt;
    pressedAt = null;
    if (start === null || !isOnTheScene(event)) return;
    if (!isDragGesture(start, { x: event.clientX, y: event.clientY })) onTap();
  };
  document.addEventListener("pointerdown", press, true);
  document.addEventListener("pointerup", release, true);
  return () => {
    document.removeEventListener("pointerdown", press, true);
    document.removeEventListener("pointerup", release, true);
  };
}
