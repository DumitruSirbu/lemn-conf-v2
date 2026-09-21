// M7 wave 7D5b slice S0 — the whole plan before S0b keeps the oven tower over the bottle (ADR 0110
// Amendment M11). Captured from `acb7b6f` with the production tree clean; read through
// `pre-tower-run-recording.ts` and decoded by the pre-width recording's `parseRecordedCanonicalPlan`.
//
// **At S0 every recorded plan is HEAD's, exactly, and that is the tripwire.** S0b moves exactly the
// rooms where S1's bottle took the oven tower and no pan drawer stands beside it (the plan's E7: 5 260
// of 245 211 placed rooms). When S0b lands, the exact comparisons below go red in those rooms and
// nowhere else; S0b restates them with a classifier admitting exactly that change — bottle gone, the
// tower back, the hob `base-hob-2drawer` — as 7D5 S2 and S3 restated `qa-7d5-pre-width-recorded`. The
// recording itself is never re-captured to make that pass (plan risk 5).
//
// **The draw is checked for reach, not trusted for it.** A 480-room draw holds each of S0b's
// populations a handful of times, so the counts of each class are pinned below, read from the
// composer's own context at HEAD; and the plan's witness rooms are recorded whole beside the draw.
import { describe, expect, it, vi } from "vitest";

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
import {
  forgetTheLastComposition,
  lastComposition,
  whatS1sBottleCost,
} from "../support/composition-context-capture.js";
import { parseRecordedCanonicalPlan } from "../support/pre-width-run-recording.js";
import {
  readPreTowerRunRecording,
  roomFromRecordedKey,
} from "../support/pre-tower-run-recording.js";

vi.mock(
  "../../src/generation/optional-run-items.js",
  async (importOriginal) => {
    const { withTheCompositionRecorded } = await import(
      "../support/composition-context-capture.js"
    );
    return withTheCompositionRecorded(await importOriginal());
  },
);

const DECLARED_COLUMNS = declaredColumnSizes(
  buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN)),
);
const RECORDING = readPreTowerRunRecording();
const PAN_DRAWER_BODY = "base-panbank";

/** How S0b is to treat a room, read at HEAD. */
type TowerOverBottleClass =
  | "refused"
  | "S0b changes it: the bottle took the tower, no pan drawer"
  | "S0b keeps it: the bottle took the tower, a pan drawer beside it"
  | "S0b keeps it: the bottle took an outer column only"
  | "S0b keeps it: the bottle took no column";

function planFor(room: DesignRoom): KitchenCompositionPlan {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

function classOf(room: DesignRoom): TowerOverBottleClass {
  forgetTheLastComposition();
  const plan = planFor(room);
  if (!plan.minimumMet) return "refused";
  const cost = whatS1sBottleCost(lastComposition());
  if (cost === "nothing") return "S0b keeps it: the bottle took no column";
  if (cost === "an outer column") {
    return "S0b keeps it: the bottle took an outer column only";
  }
  return plan.bases.some((base) => base.buildId === PAN_DRAWER_BODY)
    ? "S0b keeps it: the bottle took the tower, a pan drawer beside it"
    : "S0b changes it: the bottle took the tower, no pan drawer";
}

function classCounts(
  keys: Iterable<string>,
): Partial<Record<TowerOverBottleClass, number>> {
  const counts: Partial<Record<TowerOverBottleClass, number>> = {};
  for (const key of keys) {
    const roomClass = classOf(roomFromRecordedKey(key));
    counts[roomClass] = (counts[roomClass] ?? 0) + 1;
  }
  return counts;
}

describe("the whole plan before 7D5b's tower-over-bottle change", () => {
  it("identifies the exact committed source, the draw and the witnesses", () => {
    expect(RECORDING.capturedFrom).toBe(
      "acb7b6f, before M7 wave 7D5b S0b; optional-run-items.ts blob 2802a074eb4f5f8c82d8e531bc4da47ce1bd7266; generation-priorities.ts blob e14ae28ca3d7d6b7e28b3660e562b827cbfbdf44; production tree clean; whole canonical plans over the current approved L bounds, plus the plan's witness rooms at 2600 mm",
    );
    expect(RECORDING.seed).toBe(20260921);
    expect(RECORDING.runs).toBe(480);
    expect(RECORDING.rooms.size).toBe(RECORDING.runs);
    expect([...RECORDING.witnesses.keys()]).toEqual([
      "3560x2920x2600",
      "900x4100x2600",
      "900x4410x2600",
      "2100x2200x2600",
      "1500x2800x2600",
      "1500x3500x2600",
      "1510x2800x2600",
      "900x3400x2600",
      "6000x1700x2600",
      "4650x1000x2600",
      "4600x5200x2600",
      "4600x5800x2600",
      "900x4700x2600",
      "900x5000x2600",
      "3600x2400x2600",
      "900x4400x2600",
    ]);
  });

  it("decodes every recorded plan through the shared parser", () => {
    const recorded = [...RECORDING.rooms, ...RECORDING.witnesses];

    for (const [key, canonical] of recorded) {
      expect(() => parseRecordedCanonicalPlan(canonical), key).not.toThrow();
      expect(roomKey(roomFromRecordedKey(key))).toBe(key);
    }
  });

  it("keeps the exact recorded plan for every drawn room (S0b restates this for its own rooms)", () => {
    const differing = [...RECORDING.rooms].filter(
      ([key, recorded]) =>
        canonicalPlan(planFor(roomFromRecordedKey(key))) !== recorded,
    );

    expect(differing.map(([key]) => key)).toEqual([]);
  });

  it("keeps the exact recorded plan for every witness room (S0b restates this for its own rooms)", () => {
    for (const [key, recorded] of RECORDING.witnesses) {
      expect(canonicalPlan(planFor(roomFromRecordedKey(key))), key).toBe(
        recorded,
      );
    }
  });

  // T1's population (changes), T2's (the pan drawer depends on the bottle), T3's (an outer column
  // only) and the rooms where the bottle cost nothing, which S0b must leave byte-identical (T5's
  // pan-drawer-first path among them), each reached by the draw. fast-check draws toward
  // the policy's bounds, so short walls and refused rooms are over-represented against the 10 mm grid.
  it("reaches every population S0b's criteria name, in the draw", () => {
    expect(classCounts(RECORDING.rooms.keys())).toEqual({
      refused: 55,
      "S0b changes it: the bottle took the tower, no pan drawer": 10,
      "S0b keeps it: the bottle took the tower, a pan drawer beside it": 9,
      "S0b keeps it: the bottle took an outer column only": 66,
      "S0b keeps it: the bottle took no column": 340,
    });
  });

  it("records S0b's named witnesses in the classes the plan puts them in", () => {
    const witnessClass = (key: string) => classOf(roomFromRecordedKey(key));

    expect({
      reference: witnessClass("3560x2920x2600"),
      narrowRun: witnessClass("900x4100x2600"),
      panDrawerDependsOnTheBottle: witnessClass("900x4410x2600"),
    }).toEqual({
      reference: "S0b changes it: the bottle took the tower, no pan drawer",
      narrowRun: "S0b changes it: the bottle took the tower, no pan drawer",
      panDrawerDependsOnTheBottle:
        "S0b keeps it: the bottle took the tower, a pan drawer beside it",
    });
  });
});
