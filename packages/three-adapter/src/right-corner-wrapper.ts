// ADR 0132 decision 2: a U's right corner is the left corner drawn in a reflection, and the
// reflection is one wrapper group per piece, mirrored about that piece's own origin with
// `applyCornerDirection` (ADR 0129 decision 4) — never one group about the room's centre line, which
// ADR 0129 rejected because its plane would move with every resize.
//
// Which pieces are the right corner's is the domain's answer (`cornerOf`, ADR 0121), carried on every
// `PlacementRecord` as `corner` (ADR 0132 A8.4). This module reads that answer and compares no
// position of its own. Everything else in a U — wall C's own bodies included — is drawn at its world
// frame, unmirrored (Q-U5).
import type {
  DesignRoom,
  PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";

import { applyCornerDirection } from "./corner-direction.js";

export const RIGHT_CORNER_WRAPPER_NAME = "right_corner_wrapper";

const NO_RIGHT_CORNER_PIECES: ReadonlySet<string> = new Set();

/** The ids of the records that stand in the right corner. Empty for every room that is not a U:
 *  an L or a straight room has one corner, always the left (`cornerOf`'s own rule), so nothing
 *  outside a U is ever wrapped and its scene is exactly what it was before wrappers existed. */
export function rightCornerRecordIds(input: {
  readonly room: DesignRoom;
  readonly records: readonly PlacementRecord[];
}): ReadonlySet<string> {
  if (input.room.shape !== "U") return NO_RIGHT_CORNER_PIECES;

  const rightPieces = input.records.filter(
    (record) => record.corner === "right",
  );
  return new Set(rightPieces.map((record) => record.id));
}

/** Puts `body` in a wrapper mirrored in its own local X about the wrapper's origin, with the body at
 *  that origin, so the reflection's plane is the piece's own centre and does not move with the room.
 *  The caller seats the **wrapper** at the record's frame: position and yaw are the wrapper's, the
 *  mirror is applied to it first, and the body inside keeps an identity transform. */
export function wrapInRightCornerMirror(body: THREE.Group): THREE.Group {
  const wrapper = new THREE.Group();
  wrapper.name = RIGHT_CORNER_WRAPPER_NAME;
  wrapper.add(body);
  applyCornerDirection(wrapper, "right");
  return wrapper;
}
