"use client";

import type { DesignRoom, DesignWall } from "@lemnaria/configurator-domain";
import {
  cameraPresetsForRoom,
  cutawayWallsFor,
  type CameraPreset,
  type CameraPresetId,
} from "@lemnaria/three-adapter";
import { create } from "zustand";

import { presetForRoom } from "./scene-view";

/** §6.4's opening view, and the one the customer has not chosen yet. */
const DEFAULT_CAMERA_PRESET: CameraPresetId = "overview";

/** Where the camera stands, and the one command that moves it. */
interface CameraPresetState {
  readonly presetId: CameraPresetId;
  readonly standAt: (presetId: CameraPresetId) => void;
}

/**
 * **Which camera preset the scene is standing at, held outside React's tree.**
 *
 * `ConfigureScreen` kept this in `useState` until 2026-09-11, and switching language sent the
 * customer back to the overview from wherever they were looking: *Perete A* → *Vedere generală*,
 * *Стена A* → *Общий вид*. next-intl's switch is a client-side navigation from `/ro/…` to `/ru/…`,
 * so the `[locale]` segment's value changes, the page subtree under it remounts, and every
 * `useState` in that subtree is initialised again. The design, the selection, the finish, the price
 * and the step all survived the same navigation because `store/configurator-store.ts` is a
 * module-scope singleton; the camera was the one piece of state that was not, and it was the one
 * piece that reset.
 *
 * **A store of its own rather than a field on the configurator store**, which is the seam the two
 * belong on either side of: the camera is not part of the design. It is never saved, never
 * hydrated, never carried by a shared link, and no domain command moves it — putting it beside the
 * records would offer it to `hydrate` and to the save coalescer, which is exactly the drift that
 * seam exists to prevent.
 */
export const useCameraPreset = create<CameraPresetState>((set) => ({
  presetId: DEFAULT_CAMERA_PRESET,
  standAt: (presetId) => {
    set({ presetId });
  },
}));

export interface ViewShowingWallInput {
  readonly wall: DesignWall;
  /** The remembered view, which may be one this room has outgrown (`presetForRoom`'s fallback applies). */
  readonly standingAt: CameraPresetId;
  readonly room: DesignRoom;
  readonly cabinetDepthMm: number;
}

/**
 * The view an arrival with a body on `wall` should stand at, so that the body is in sight: the scene does not select
 * a body on a wall the eye cuts away (ADR 0132 A8.3). If the view the customer last stood at already shows the wall
 * it is kept; if not, the wall's own view; if that one cuts it too, the first of the room's views, in their order,
 * that does not. `null` when no view serves, which the caller treats as nothing to select.
 *
 * Decided from each view's eye and `cutawayWallsFor`, both as the scene calls them, so it needs no scene.
 */
export function viewShowingWall(
  input: ViewShowingWallInput,
): CameraPresetId | null {
  const { wall, standingAt, room, cabinetDepthMm } = input;
  const cutsTheWall = (view: CameraPreset) =>
    cutawayWallsFor(view.position, room, cabinetDepthMm).includes(wall);

  const standing = presetForRoom(standingAt, room);
  if (!cutsTheWall(standing)) return standing.id;

  const views = cameraPresetsForRoom(room);
  const own = views.find((view) => view.id === `wall${wall}`);
  if (own !== undefined && !cutsTheWall(own)) return own.id;
  return views.find((view) => !cutsTheWall(view))?.id ?? null;
}
