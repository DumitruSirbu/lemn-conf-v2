// What a preset's generated name is made of, as neutral facts. ADR 0112 Amendment A: the name is rendered per locale
// from what is stored and is never stored, and the domain publishes codes, never sentences (`materials.ts`). The
// sentence ("L-shape, 3200 x 2400 mm, white") is the app's, made from these through its message catalogue.

import type { Design, DesignRoomShape } from "../design.js";
import type { Finish } from "../materials.js";
import { resolvedDefaultFinishOf } from "../resolved-finish.js";

import { presetRoomOf } from "./preset-candidate.js";

export interface PresetNameFacts {
  readonly shape: DesignRoomShape;
  /** The walls a room of this shape has, in the order A, B, C, in millimetres: one for a straight room, two for an L,
   *  three for a U. */
  readonly wallsMm: readonly number[];
  /** The colour the kitchen wears: a palette entry the app names through its `finish.*` leaves, or a free colour's
   *  hexadecimal value. Absent when the design's material declares no default and no colour was chosen. */
  readonly finish: Finish | undefined;
}

export function presetNameFactsOf(design: Design): PresetNameFacts {
  const { shape, walls } = presetRoomOf(design);
  const wallsMm = [walls.aMm, walls.bMm, walls.cMm].filter(
    (wall): wall is number => wall !== undefined,
  );
  return { shape, wallsMm, finish: resolvedDefaultFinishOf(design) };
}
