"use client";

import type { CameraPresetId } from "@lemnaria/three-adapter";
import { create } from "zustand";

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
