// Which stored presets a room is offered (ADR 0109 Amendment A2): the same shape, and every wall the shape has within
// `PRESET_WINDOW_MM` of the length the preset was saved in, inclusive. The corner
// direction is no criterion (the domain is canonical and the mirror is presentation, ADR 0129 D2), and neither is the
// ceiling: a lower room drops a row as a declared adaptation (Amendment B), it does not unmatch the preset.
//
// A window, not a fit: a preset in the window can still not be offered once it is adapted (ADR 0109 decision 3).
// I/O-free: the presets are handed in and come back in the order they were given, which is newest first.

import type { DesignRoomShape } from "../design.js";
import { wallsOf } from "../room/walls-of-shape.js";

import type { PresetRoom } from "./preset-candidate.js";

/** The owner's tolerance per wall (ADR 0109 Amendment A2, 2026-09-11). */
export const PRESET_WINDOW_MM = 600;

/** Whether `room` is in `saved`'s window: equal shapes, and every wall the shape has within `PRESET_WINDOW_MM` of the
 *  saved one, inclusive. A wall the shape needs and either room lacks is no match: the window fails closed. */
export function isRoomInPresetWindow(input: {
  readonly saved: PresetRoom;
  readonly room: PresetRoom;
}): boolean {
  const { saved, room } = input;
  if (saved.shape !== room.shape) return false;
  return wallKeysOf(room.shape).every((key) =>
    isWithinWindow(saved.walls[key], room.walls[key]),
  );
}

/** The presets whose window holds `room`, in the order given. Generic so a caller's own record type comes back whole. */
export function matchPresets<Preset extends PresetRoom>(
  room: PresetRoom,
  presets: readonly Preset[],
): readonly Preset[] {
  return presets.filter((preset) =>
    isRoomInPresetWindow({ saved: preset, room }),
  );
}

type WallKey = keyof PresetRoom["walls"];

const WALL_KEY_OF_WALL = { A: "aMm", B: "bMm", C: "cMm" } as const;

function wallKeysOf(shape: DesignRoomShape): readonly WallKey[] {
  return wallsOf(shape).map((wall) => WALL_KEY_OF_WALL[wall]);
}

function isWithinWindow(
  savedMm: number | undefined,
  roomMm: number | undefined,
): boolean {
  if (savedMm === undefined || roomMm === undefined) return false;
  return Math.abs(savedMm - roomMm) <= PRESET_WINDOW_MM;
}
