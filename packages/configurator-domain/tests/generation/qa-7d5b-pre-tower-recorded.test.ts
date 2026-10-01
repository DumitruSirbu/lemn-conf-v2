// M7 wave 7D5b slice S0 — the whole plan before S0b keeps the oven tower over the bottle (ADR 0110
// Amendment M11). Captured from `acb7b6f` with the production tree clean; read through
// `pre-tower-run-recording.ts` and decoded by the pre-width recording's `parseRecordedCanonicalPlan`.
//
// **At S0 every recorded plan was HEAD's, exactly, and that was the tripwire.** S0b moves exactly the
// rooms where S1's bottle took the oven tower and no pan drawer stands beside it (the plan's E7: 5 260
// of 245 211 placed rooms). **Restated for S0b (ADR 0110 Amendment M11, narrowed), in the form 7D5 S2
// and S3 restated `qa-7d5-pre-width-recorded`:** a recorded room now either equals the current plan, or
// differs from it by M11's change and nothing else — the bottle's module becomes the block's innermost
// column, a 600 mm oven tower where the bottle started; the hob `base-hob-oven` → `base-hob-2drawer`;
// that wall's floor width 300 → 600 and its remainder 300 mm smaller. The classifier is
// `towerOverBottleChangeBetween` (`pre-tower-run-recording.ts`), which S0b's post-tower recording is
// read through as well. The recording itself is never re-captured to make this pass (plan risk 5).
//
// **Restated for S1 (ADR 0110 Amendment M1, M2, M7(e)).** S1 adds the dishwasher to the live plan, so the
// plan these comparisons hold against HEAD's recording is **S0b's**: the planner with S1's leaf switched
// off (`beforeS1`), itself proved byte for byte against the post-tower recording by
// `qa-7d5b-post-tower-recorded`. How S1 then differs from S0b is that file's classifier, not this one's.
//
// **The draw is checked for reach, not trusted for it.** A 480-room draw holds each of S0b's
// populations a handful of times, so the counts of each class are pinned below, read from the
// composer's own context at HEAD; and the plan's witness rooms are recorded whole beside the draw.
import { describe, expect, it, vi } from "vitest";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  isComposedStorageSlot,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  type DesignRoom,
  type KitchenCompositionPlan,
} from "../../src/index.js";
import { canonicalPlan, roomKey } from "../support/composed-run-baseline.js";
import {
  beforeS1,
  forgetTheLastComposition,
  lastComposition,
  whatS1sBottleCost,
} from "../support/composition-context-capture.js";
import { parseRecordedCanonicalPlan } from "../support/pre-width-run-recording.js";
import {
  readPostTowerRunRecording,
  readPreTowerRunRecording,
  roomFromRecordedKey,
  towerOverBottleChangeBetween,
  type TowerOverBottleChange,
  type TowerRunRecording,
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
vi.mock(
  "../../src/generation/dishwasher-beside-the-sink.js",
  async (importOriginal) => {
    const { withTheDishwasherLeafSwitchable } = await import(
      "../support/composition-context-capture.js"
    );
    return withTheDishwasherLeafSwitchable(await importOriginal());
  },
);

const DECLARED_COLUMNS = declaredColumnSizes(
  buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN)),
);
const RECORDING = readPreTowerRunRecording();
const PAN_DRAWER_BODY = "base-panbank";

/** How S0b is to treat a room. The cost of S1's bottle is a counterfactual asked of the composer's
 *  context, so it reads the same before and after S0b; the pan drawer is read off S0b's plan, and S0b
 *  neither adds nor removes one. */
type TowerOverBottleClass =
  | "refused"
  | "S0b changes it: the bottle took the tower, no pan drawer"
  | "S0b keeps it: the bottle took the tower, a pan drawer beside it"
  | "S0b keeps it: the bottle took an outer column only"
  | "S0b keeps it: the bottle took no column";

/** S0b's plan: the planner with S1's leaf switched off. */
function planAfterS0bFor(room: DesignRoom): KitchenCompositionPlan {
  return beforeS1(() =>
    planKitchenComposition({
      room,
      runs: lShellFloorRuns(room),
      columns: DECLARED_COLUMNS,
    }),
  );
}

function classOf(room: DesignRoom): TowerOverBottleClass {
  forgetTheLastComposition();
  const plan = planAfterS0bFor(room);
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

function changesAgainstTheRecording(
  recorded: ReadonlyMap<string, string>,
): ReadonlyMap<string, TowerOverBottleChange> {
  return new Map(
    [...recorded].map(([key, before]) => [
      key,
      towerOverBottleChangeBetween({
        before,
        after: canonicalPlan(planAfterS0bFor(roomFromRecordedKey(key))),
      }),
    ]),
  );
}

function countsOf(
  changes: ReadonlyMap<string, TowerOverBottleChange>,
): Partial<Record<TowerOverBottleChange, number>> {
  const counts: Partial<Record<TowerOverBottleChange, number>> = {};
  for (const change of changes.values()) {
    counts[change] = (counts[change] ?? 0) + 1;
  }
  return counts;
}

function roomsWith(
  changes: ReadonlyMap<string, TowerOverBottleChange>,
  wanted: TowerOverBottleChange,
): readonly string[] {
  return [...changes]
    .filter(([, change]) => change === wanted)
    .map(([key]) => key);
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

  it("S0b changes exactly ten drawn rooms, each by M11's change alone, and keeps the other 470 exactly", () => {
    const changes = changesAgainstTheRecording(RECORDING.rooms);

    expect(countsOf(changes)).toEqual({
      unchanged: 470,
      "the oven tower kept over the bottle": 10,
    });
    expect(roomsWith(changes, "the oven tower kept over the bottle")).toEqual([
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
    ]);
  });

  it("S0b changes exactly two witness rooms, the reference room and 900 x 4100, each by M11's change alone", () => {
    const changes = changesAgainstTheRecording(RECORDING.witnesses);

    expect(countsOf(changes)).toEqual({
      unchanged: 14,
      "the oven tower kept over the bottle": 2,
    });
    expect(roomsWith(changes, "the oven tower kept over the bottle")).toEqual([
      "3560x2920x2600",
      "900x4100x2600",
    ]);
  });

  // The classifier reads the recorded plan alone; the capture reads the composer. The two must name
  // the same rooms, or the classifier admits a change the rule never made (or misses one it did).
  it("names as changed exactly the recorded rooms the composer puts in S0b's class", () => {
    const recorded = new Map([...RECORDING.rooms, ...RECORDING.witnesses]);
    const changed = roomsWith(
      changesAgainstTheRecording(recorded),
      "the oven tower kept over the bottle",
    );
    const inS0bsClass = [...recorded.keys()].filter(
      (key) =>
        classOf(roomFromRecordedKey(key)) ===
        "S0b changes it: the bottle took the tower, no pan drawer",
    );

    expect(changed).toEqual(inS0bsClass);
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

// The classifier is only worth what it refuses. Each mutant is the reference room's post-S0b plan as the
// post-tower recording holds it, or 900 x 4410's, with one thing more wrong than M11 allows, and each
// must read "changed otherwise" against the recorded pre-S0b plan. Both sides are recordings, so these
// test the classifier alone and stay green whatever the live planner does.
describe("the tower-over-bottle classifier refuses every change beyond M11's", () => {
  const REFERENCE_KEY = "3560x2920x2600";
  const PAN_DRAWER_KEY = "900x4410x2600";
  const referenceBefore = recordedWitness(RECORDING, REFERENCE_KEY);
  const referenceAfter = recordedWitness(
    readPostTowerRunRecording(),
    REFERENCE_KEY,
  );

  it("admits the reference room's recorded post-S0b plan, so the refusals below are not vacuous", () => {
    expect(
      towerOverBottleChangeBetween({
        before: referenceBefore,
        after: referenceAfter,
      }),
    ).toBe("the oven tower kept over the bottle");
  });

  it.each([
    [
      "a core role moved as well: the sink 10 mm along its wall",
      "sink~sink~base-sink~A~900~1500~600",
      "sink~sink~base-sink~A~910~1510~600",
    ],
    [
      "the hob kept its oven beside the tower",
      "hob~hob~base-hob-2drawer~",
      "hob~hob~base-hob-oven~",
    ],
    [
      "a pantry column restored in the tower's place",
      "~tall-oven-tower~",
      "~tall-pantry~",
    ],
    [
      "the tower started 10 mm past the bottle's start",
      "column:A:0~storage~tall-oven-tower~A~2700~3300~600",
      "column:A:0~storage~tall-oven-tower~A~2710~3310~600",
    ],
    [
      "the remainder left as it was with the bottle",
      "remainder=260/20",
      "remainder=560/20",
    ],
    [
      "the other wall's remainder moved too",
      "remainder=260/20",
      "remainder=260/0",
    ],
  ])("refuses the reference room with %s", (_what, from, to) => {
    const mutant = referenceAfter.replace(from, to);

    expect(mutant).not.toBe(referenceAfter);
    expect(
      towerOverBottleChangeBetween({ before: referenceBefore, after: mutant }),
    ).toBe("changed otherwise");
  });

  // The slot is found by the predicate and its id read off the recorded plan, never spelled here (7D4
  // criterion 22: the id convention is named in `src` and nowhere a test decides anything).
  it("refuses the reference room with a storage slot on the other wall re-bodied", () => {
    const slot = parseRecordedCanonicalPlan(referenceAfter).bases.find(
      (base) => isComposedStorageSlot(base) && base.wall === "B",
    );
    if (!slot) throw new Error("the reference room has no slot on wall B");
    const spelled = `${slot.id}~${slot.role}~${slot.buildId}~`;
    const mutant = referenceAfter.replace(
      spelled,
      `${slot.id}~${slot.role}~base-3drawer~`,
    );

    expect(slot.buildId).toBe("base-cabinet");
    expect(mutant).not.toBe(referenceAfter);
    expect(
      towerOverBottleChangeBetween({ before: referenceBefore, after: mutant }),
    ).toBe("changed otherwise");
  });

  it("refuses the reference room with a second column added after the tower", () => {
    const mutant = `${referenceAfter}|column:A:1~storage~tall-pantry~A~3300~3900~600`;

    expect(
      towerOverBottleChangeBetween({ before: referenceBefore, after: mutant }),
    ).toBe("changed otherwise");
  });

  // What S0b would make of 900 x 4410 with the pan-drawer condition dropped: the core alone, so the
  // pan drawer goes with the bottle and the tower returns. The owner ruled the pan drawer wins there.
  it("refuses 900 x 4410 losing its pan drawer with the bottle, even though the tower and the hob read as M11's", () => {
    const mutant = [
      "minimumMet=true|cut=4|dropped=|remainder=0/310|floorWidths=/700,600,600,600,600",
      "fridge~fridge~fridge-free~B~900~1600~700",
      "sink~sink~base-sink~B~1600~2200~600",
      "preparation~preparation~base-3drawer~B~2200~2800~600",
      "hob~hob~base-hob-2drawer~B~2800~3400~600",
      "column:B:0~storage~tall-oven-tower~B~3400~4000~600",
    ].join("|");

    expect(
      towerOverBottleChangeBetween({
        before: recordedWitness(RECORDING, PAN_DRAWER_KEY),
        after: mutant,
      }),
    ).toBe("changed otherwise");
  });
});

function recordedWitness(recording: TowerRunRecording, key: string): string {
  const recorded = recording.witnesses.get(key);
  if (recorded === undefined) {
    throw new Error(`the 7D5b tower recording holds no witness ${key}`);
  }
  return recorded;
}
