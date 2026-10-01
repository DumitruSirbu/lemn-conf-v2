// M7 wave 7A3 slice S1, criterion 14 — the recorded draw and the approved policy are separate, and a
// tidy-up that "removes the duplication" between them reddens here.
//
// **The separation is made observable rather than read off the source.** The approved policy is
// replaced, for this file only, by one that disagrees with the recorded rectangle on all six bounds.
// If `recordedLRoom` still draws exactly the rooms both recordings are keyed by, it cannot be reading
// the policy by any import route: the double is installed on the policy's own module, which
// `src/index.ts` re-exports. `approvedLRoom` is swept under the same double so the disagreement is
// shown to have taken effect — without that, a double that never reached the support module would
// leave the first test green over nothing (ADR 0121 decision 4: the expected side is the recording
// file, never the arbitrary's own output).
import { fc } from "@fast-check/vitest";
import { describe, expect, it, vi } from "vitest";

import type { DesignRoom } from "../../src/index.js";
import type * as ApprovedRoomPolicyModule from "../../src/room/approved-room-policy.js";
import {
  approvedLRoom,
  BASELINE_RUNS,
  BASELINE_SEED,
  readComposedRunBaseline,
  recordedLRoom,
  roomKey,
} from "./composed-run-baseline.js";

const DISAGREEING_POLICY_BOUNDS = vi.hoisted(() => ({
  wallA: { minMm: 1000, maxMm: 5000 },
  wallB: { minMm: 1100, maxMm: 4000 },
  height: { minMm: 2300, maxMm: 3000 },
}));

vi.mock("../../src/room/approved-room-policy.js", async (importOriginal) => {
  const original = await importOriginal<typeof ApprovedRoomPolicyModule>();
  const policy = original.APPROVED_ROOM_POLICY;
  const l = policy.buildableShapes.L;
  if (!l) throw new Error("the approved policy states no L to replace");
  return {
    ...original,
    APPROVED_ROOM_POLICY: {
      ...policy,
      buildableShapes: {
        ...policy.buildableShapes,
        L: {
          ...l,
          wallA: DISAGREEING_POLICY_BOUNDS.wallA,
          wallB: DISAGREEING_POLICY_BOUNDS.wallB,
        },
      },
      heightBounds: DISAGREEING_POLICY_BOUNDS.height,
    },
  };
});

const RECORDED_KEYS = [...readComposedRunBaseline().rooms.keys()].sort();

function drawnKeys(arbitrary: fc.Arbitrary<DesignRoom>): string[] {
  const keys: string[] = [];
  fc.assert(
    fc.property(arbitrary, (room) => {
      keys.push(roomKey(room));
    }),
    { numRuns: BASELINE_RUNS, seed: BASELINE_SEED },
  );
  return keys.sort();
}

function isInsideTheDisagreeingPolicy(key: string): boolean {
  const [widthMm, depthMm, heightMm] = key.split("x").map(Number);
  const { wallA, wallB, height } = DISAGREEING_POLICY_BOUNDS;
  return (
    isWithin(widthMm, wallA) &&
    isWithin(depthMm, wallB) &&
    isWithin(heightMm, height)
  );
}

function isWithin(
  valueMm: number | undefined,
  bounds: { readonly minMm: number; readonly maxMm: number },
): boolean {
  return (
    valueMm !== undefined && valueMm >= bounds.minMm && valueMm <= bounds.maxMm
  );
}

describe("the recorded draw does not follow the approved policy", () => {
  it("draws exactly the rooms the recording is keyed by while the policy disagrees on every bound", () => {
    expect(drawnKeys(recordedLRoom())).toEqual(RECORDED_KEYS);
  });

  it("lets the policy-backed draw follow the disagreeing policy, so the first test is not vacuous", () => {
    const approvedKeys = drawnKeys(approvedLRoom());

    expect(
      approvedKeys.filter((key) => !isInsideTheDisagreeingPolicy(key)),
    ).toEqual([]);
    expect(
      RECORDED_KEYS.filter((key) => !isInsideTheDisagreeingPolicy(key)).length,
    ).toBeGreaterThan(0);
  });
});
