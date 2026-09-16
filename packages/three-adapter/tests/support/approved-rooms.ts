// Test-only. The owner-approved room policy, the seeded design's room and records, and a
// `fast-check` arbitrary over the whole policy box — declared once for the suites that sweep rooms.
//
// **Why it exists.** M7 wave 7H made the drawn room and the camera functions of `DesignRoom`, and
// five files grew the same twenty-line preamble to test that: the `buildableShapes.L` unwrap, the
// three bound pairs, `KITCHEN_L_DESIGN.room`, its derived records, a `roomOf` helper and a
// four-line arbitrary. They agreed only because they were written in the same week. That is the
// failure ADR 0083 decision 10 settled for the overflowing fixture — *one declared fixture, not six
// hand-built copies* — and the same one this wave closed twice on the e2e side.
//
// **What is deliberately not here: the sampling.** Each file names the rooms its own claim is about
// — a corner-and-one-millimetre-inside sweep for the resize ledger, a shallow/deep pair for the
// camera's clearance, the seeded triple everywhere — and lifting those into a shared list would
// make one file's sampling quietly answer for another's. Only the policy, the seed and the
// generator are common, and `POLICY_BOX_CORNERS` is offered as a building block rather than as a
// sample set.
import {
  APPROVED_ROOM_POLICY,
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import { fc } from "@fast-check/vitest";

import { required } from "./required.js";

const L_BOUNDS = required(
  APPROVED_ROOM_POLICY.buildableShapes.L,
  "the approved L bounds",
);

/** ADR 0108 Amendment B's owner-approved bounds: 900–6300 along wall A, 1000–5100 along wall B,
 *  2200–3900 high. Read from the policy rather than restated, so a wave that moves one moves every
 *  sweep with it. */
export const APPROVED_WALL_A = L_BOUNDS.wallA;
export const APPROVED_WALL_B = L_BOUNDS.wallB;
export const APPROVED_HEIGHT = APPROVED_ROOM_POLICY.heightBounds;

/** 3560 x 2920 x 2600 — and **not** the shell the reference builder draws, which is a separate
 *  number this wave stopped it disagreeing with. A `fast-check` sweep over the policy box will
 *  essentially never generate this triple, so a file that cares about it must name it. */
export const SEEDED_ROOM = KITCHEN_L_DESIGN.room;

export const SEEDED_RECORDS = derivePlacementRecords(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);

export function roomOf(
  widthMm: number,
  depthMm: number,
  heightMm: number,
): DesignRoom {
  return { shape: "L", widthMm, depthMm, heightMm };
}

/** The eight corners of the policy box. A building block: a sweep that only ever sees random rooms
 *  reaches a corner about never, and a corner is where an arithmetic goes degenerate if it is going
 *  to. Files compose their own sample sets from this and whatever else their claim needs. */
export const POLICY_BOX_CORNERS: readonly DesignRoom[] = [
  APPROVED_WALL_A.minMm,
  APPROVED_WALL_A.maxMm,
].flatMap((widthMm) =>
  [APPROVED_WALL_B.minMm, APPROVED_WALL_B.maxMm].flatMap((depthMm) =>
    [APPROVED_HEIGHT.minMm, APPROVED_HEIGHT.maxMm].map((heightMm) =>
      roomOf(widthMm, depthMm, heightMm),
    ),
  ),
);

/** Any room the owner approved. **Integers, because `widthMm` is one**: a generator that produced
 *  fractional millimetres would be sweeping rooms no document can hold. */
export const anyApprovedRoom = fc.record({
  shape: fc.constant("L" as const),
  widthMm: fc.integer({
    min: APPROVED_WALL_A.minMm,
    max: APPROVED_WALL_A.maxMm,
  }),
  depthMm: fc.integer({
    min: APPROVED_WALL_B.minMm,
    max: APPROVED_WALL_B.maxMm,
  }),
  heightMm: fc.integer({
    min: APPROVED_HEIGHT.minMm,
    max: APPROVED_HEIGHT.maxMm,
  }),
});
