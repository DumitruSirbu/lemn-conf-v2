// M7 wave 7D5b slice S0b — the whole plan after S0b keeps the oven tower over the bottle (ADR 0110
// Amendment M11, narrowed), recorded as **S1's pre-state**. Captured from `c0018ef` plus S0b's
// uncommitted `optional-run-items.ts` (blob `7e8cbc1`), no other production file changed; read through
// `pre-tower-run-recording.ts` and decoded by the pre-width recording's `parseRecordedCanonicalPlan`.
//
// **At S0b every recorded plan is the live planner's, exactly, and that is S1's tripwire.** S1 converts
// a door cabinet, or swaps a drawer cabinet, into the dishwasher; when it lands, the exact comparisons
// below go red in the rooms it moves, and S1 restates them with a classifier, as S0b restated
// `qa-7d5b-pre-tower-recorded`. The recording is never re-captured to make that pass (plan risk 5).
//
// **Recording against recording.** The post-tower draw is the pre-tower draw — the same seed, run count
// and witnesses — so the two are compared below with no planner in the loop: they differ in exactly
// M11's rooms, by M11's change, and nowhere else. That half stays true whatever S1 later does to the
// live planner.
import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  type DesignRoom,
  type KitchenCompositionPlan,
} from "../../src/index.js";
import { canonicalPlan, roomKey } from "../support/composed-run-baseline.js";
import { parseRecordedCanonicalPlan } from "../support/pre-width-run-recording.js";
import {
  readPostTowerRunRecording,
  readPreTowerRunRecording,
  roomFromRecordedKey,
  towerOverBottleChangeBetween,
  type TowerOverBottleChange,
} from "../support/pre-tower-run-recording.js";

const DECLARED_COLUMNS = declaredColumnSizes(
  buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN)),
);
const POST_TOWER = readPostTowerRunRecording();
const PRE_TOWER = readPreTowerRunRecording();

function planFor(room: DesignRoom): KitchenCompositionPlan {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

/** Each post-tower room's change against its pre-tower recording: how many are unchanged, and which
 *  rooms changed by M11 and otherwise. */
function recordedChanges(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
) {
  const byChange: Record<TowerOverBottleChange, string[]> = {
    unchanged: [],
    "the oven tower kept over the bottle": [],
    "changed otherwise": [],
  };
  for (const [key, afterPlan] of after) {
    const beforePlan = before.get(key);
    if (beforePlan === undefined) {
      throw new Error(`the pre-tower recording holds no room ${key}`);
    }
    const change = towerOverBottleChangeBetween({
      before: beforePlan,
      after: afterPlan,
    });
    byChange[change].push(key);
  }
  return {
    unchanged: byChange.unchanged.length,
    towerKeptOverTheBottle: byChange["the oven tower kept over the bottle"],
    changedOtherwise: byChange["changed otherwise"],
  };
}

describe("the whole plan after 7D5b's tower-over-bottle change (S1's pre-state)", () => {
  it("identifies the exact source, the draw and the witnesses", () => {
    expect(POST_TOWER.capturedFrom).toBe(
      "c0018ef plus M7 wave 7D5b S0b, uncommitted, before S1; optional-run-items.ts blob 7e8cbc1368a8ba5b92a6ab33b83ae90e3f82f07e; generation-priorities.ts blob e14ae28ca3d7d6b7e28b3660e562b827cbfbdf44; no other production file differs from c0018ef; whole canonical plans over the current approved L bounds, plus the plan's witness rooms at 2600 mm",
    );
    expect(POST_TOWER.seed).toBe(20260921);
    expect(POST_TOWER.runs).toBe(480);
    expect(POST_TOWER.rooms.size).toBe(POST_TOWER.runs);
  });

  it("draws the pre-tower recording's rooms and witnesses, in the same order", () => {
    expect([...POST_TOWER.rooms.keys()]).toEqual([...PRE_TOWER.rooms.keys()]);
    expect([...POST_TOWER.witnesses.keys()]).toEqual([
      ...PRE_TOWER.witnesses.keys(),
    ]);
  });

  it("decodes every recorded plan through the shared parser", () => {
    for (const [key, canonical] of [
      ...POST_TOWER.rooms,
      ...POST_TOWER.witnesses,
    ]) {
      expect(() => parseRecordedCanonicalPlan(canonical), key).not.toThrow();
      expect(roomKey(roomFromRecordedKey(key))).toBe(key);
    }
  });

  it("keeps the exact recorded plan for every drawn room (S1 restates this for its own rooms)", () => {
    const differing = [...POST_TOWER.rooms].filter(
      ([key, recorded]) =>
        canonicalPlan(planFor(roomFromRecordedKey(key))) !== recorded,
    );

    expect(differing.map(([key]) => key)).toEqual([]);
  });

  it("keeps the exact recorded plan for every witness room (S1 restates this for its own rooms)", () => {
    for (const [key, recorded] of POST_TOWER.witnesses) {
      expect(canonicalPlan(planFor(roomFromRecordedKey(key))), key).toBe(
        recorded,
      );
    }
  });

  it("differs from the pre-tower recording in ten drawn rooms, by M11's change alone", () => {
    expect(recordedChanges(PRE_TOWER.rooms, POST_TOWER.rooms)).toEqual({
      unchanged: 470,
      towerKeptOverTheBottle: [
        "2742x3615x3899",
        "3211x3637x2823",
        "3415x3631x2208",
        "3457x3631x3899",
        "3552x2389x2427",
        "3558x3651x3515",
        "4232x1007x2363",
        "4236x1012x2209",
        "4251x1011x3895",
        "908x4309x2204",
      ],
      changedOtherwise: [],
    });
  });

  it("differs from the pre-tower recording in two witnesses, by M11's change alone", () => {
    expect(recordedChanges(PRE_TOWER.witnesses, POST_TOWER.witnesses)).toEqual({
      unchanged: 14,
      towerKeptOverTheBottle: ["3560x2920x2600", "900x4100x2600"],
      changedOtherwise: [],
    });
  });

  it("records the reference room with the tower back and 260 mm bare, as the plan's E7 states", () => {
    const reference = parseRecordedCanonicalPlan(
      POST_TOWER.witnesses.get("3560x2920x2600") ?? "",
    );

    expect(
      reference.bases
        .filter((base) => base.wall === "A")
        .map(
          (base) =>
            `${base.buildId} [${String(base.startMm)}, ${String(base.endMm)}]`,
        ),
    ).toEqual([
      "base-sink [900, 1500]",
      "base-3drawer [1500, 2100]",
      "base-hob-2drawer [2100, 2700]",
      "tall-oven-tower [2700, 3300]",
    ]);
    expect(reference.remainderMm.A).toBe(260);
  });
});
