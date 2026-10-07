// M7 wave 7D5b slice S0b — the whole plan after S0b keeps the oven tower over the bottle (ADR 0110
// Amendment M11, narrowed), recorded as **S1's pre-state**. Captured from `c0018ef` plus S0b's
// uncommitted `optional-run-items.ts` (blob `7e8cbc1`), no other production file changed; read through
// `pre-tower-run-recording.ts` and decoded by the pre-width recording's `parseRecordedCanonicalPlan`.
//
// **Restated for S1 (ADR 0110 Amendment M1, M2, M7(e), M8, M9), in the form S0b restated
// `qa-7d5b-pre-tower-recorded`.** At S0b every recorded plan was the live planner's exactly. S1 adds the
// dishwasher beside the sink, so a recorded room now equals the live plan, or differs from it by exactly
// one of S1's changes, each generated from the recorded plan by `dishwasherChangeBetween` and compared
// whole:
//
// - **M1**: one composed 600 mm door slot beside the sink — on its wall, or across the corner — is
//   re-identified in place as `dishwasher / storage / base-dishwasher`;
// - **(e)**: with no such slot, the preparation 3-drawer beside the sink is re-identified as the
//   dishwasher and the pan drawer beyond it takes id and role `preparation`, keeping its body — two
//   modules, in place;
// - **M2**: the threshold drawer the recording holds is gone, because *D* no longer counts the converted
//   module, and in its place either one more pantry column stands at the block's end or the bottle is
//   back — with the leaf's M1 or (e) on top.
//
// The recording is never re-captured to make this pass (plan risk 5). **The S0b tree itself is still
// asserted exactly**: the planner with S1's leaf switched off (`beforeS1`) must reproduce every recorded
// plan byte for byte, which is what every pre-state model in 7D5b's other suites rests on.
//
// **Restated for S2 (ADR 0110 Amendment M7 (b), (d), (c), M10).** The S1 classes above are now read
// from **S1's plan** — the planner with the leaf on and S2's trades switched off (`withS1Alone`) — because
// the live planner also trades a dishwasher in where S1 placed none. The live planner is compared with
// S1's below, room by room, by `dishwasherTradeBetween`: it equals S1's plan or differs by exactly one
// trade.
//
// **Recording against recording.** The post-tower draw is the pre-tower draw — the same seed, run count
// and witnesses — so the two are compared below with no planner in the loop: they differ in exactly
// M11's rooms, by M11's change, and nowhere else. That half stays true whatever S1 does to the live
// planner.
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
  withS1Alone,
} from "../support/composition-context-capture.js";
import { parseRecordedCanonicalPlan } from "../support/pre-width-run-recording.js";
import {
  dishwasherChangeBetween,
  dishwasherTradeBetween,
  readPostTowerRunRecording,
  readPreTowerRunRecording,
  roomFromRecordedKey,
  towerOverBottleChangeBetween,
  type CornerEnds,
  type DishwasherChange,
  type DishwasherTrade,
  type TowerOverBottleChange,
} from "../support/pre-tower-run-recording.js";
import { thePlannerBeforeC5 } from "../support/before-c5-fridge-end-leftover.js";

// M7C wave C5 S1: the tests here that compare with a recording of an earlier planner ask the planner as it stood
// before the leftover beside an end fridge was absorbed into the cabinet inboard of it (`fridge-end-leftover.ts`),
// by `thePlannerBeforeC5()`; the rest of the file runs on the shipped planner. The rule's own figures are
// `fridge-end-leftover.rooms.test.ts`'s.
vi.mock(
  "../../src/generation/fridge-end-leftover.js",
  async (importOriginal) => {
    const { withTheFridgeEndLeafSwitchable } = await import(
      "../support/before-c5-fridge-end-leftover.js"
    );
    return withTheFridgeEndLeafSwitchable(await importOriginal());
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
const POST_TOWER = readPostTowerRunRecording();
const PRE_TOWER = readPreTowerRunRecording();

function planFor(room: DesignRoom): KitchenCompositionPlan {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

function cornerEndsOf(room: DesignRoom): CornerEnds {
  const runs = lShellFloorRuns(room);
  return { A: runs.A.startMm, B: runs.B.startMm };
}

/** Each recorded room's S1 change: S1's plan — the leaf on, S2's trades off — against the plan
 *  recorded after S0b. */
function changesAgainstTheRecording(
  recorded: ReadonlyMap<string, string>,
): ReadonlyMap<string, DishwasherChange> {
  return new Map(
    [...recorded].map(([key, before]) => {
      const room = roomFromRecordedKey(key);
      const change = dishwasherChangeBetween({
        before,
        after: withS1Alone(() => canonicalPlan(planFor(room))),
        cornerEndMm: cornerEndsOf(room),
      });
      return [key, change];
    }),
  );
}

/** Each recorded room's S2 trade: the live plan against S1's. */
function tradesAgainstS1(
  recorded: ReadonlyMap<string, string>,
): ReadonlyMap<string, DishwasherTrade> {
  return new Map(
    [...recorded.keys()].map((key) => {
      const room = roomFromRecordedKey(key);
      const trade = dishwasherTradeBetween({
        afterS1: withS1Alone(() => canonicalPlan(planFor(room))),
        live: canonicalPlan(planFor(room)),
      });
      return [key, trade];
    }),
  );
}

function countsOf<Change extends string>(
  changes: ReadonlyMap<string, Change>,
): Partial<Record<Change, number>> {
  const counts: Partial<Record<Change, number>> = {};
  for (const change of changes.values()) {
    counts[change] = (counts[change] ?? 0) + 1;
  }
  return counts;
}

function roomsWith<Change extends string>(
  changes: ReadonlyMap<string, Change>,
  wanted: Change,
): readonly string[] {
  return [...changes]
    .filter(([, change]) => change === wanted)
    .map(([key]) => key);
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

  it("is reproduced byte for byte, in every drawn room and witness, by the planner with S1's leaf switched off", () => {
    thePlannerBeforeC5();
    const recorded = [...POST_TOWER.rooms, ...POST_TOWER.witnesses];

    const differing = recorded.filter(
      ([key, plan]) =>
        beforeS1(() => canonicalPlan(planFor(roomFromRecordedKey(key)))) !==
        plan,
    );

    expect(recorded).toHaveLength(496);
    expect(differing.map(([key]) => key)).toEqual([]);
  });

  it("differs from S1's planner in 277 drawn rooms, each by one of S1's changes alone, and equals it in the other 203", () => {
    thePlannerBeforeC5();
    const changes = changesAgainstTheRecording(POST_TOWER.rooms);

    expect(countsOf(changes)).toEqual({
      unchanged: 203,
      "M1: a door cabinet on the sink's wall converted": 2,
      "M1: a door cabinet across the corner converted": 184,
      "(e): the preparation 3-drawer converted, its role onto the pan drawer": 76,
      "M2: the threshold drawer gone, one more column": 6,
      "M2: the threshold drawer gone, the bottle back": 9,
    });
  });

  it("names the drawn rooms of S1's rarer classes: M1 on the sink's wall and both M2 re-plans", () => {
    thePlannerBeforeC5();
    const changes = changesAgainstTheRecording(POST_TOWER.rooms);

    expect({
      sameWall: roomsWith(
        changes,
        "M1: a door cabinet on the sink's wall converted",
      ),
      columnBack: roomsWith(
        changes,
        "M2: the threshold drawer gone, one more column",
      ),
      bottleBack: roomsWith(
        changes,
        "M2: the threshold drawer gone, the bottle back",
      ),
    }).toEqual({
      sameWall: ["2148x2505x2614", "2649x2285x2210"],
      columnBack: [
        "4818x5492x2814",
        "4960x5530x2841",
        "5074x5390x2200",
        "5302x5033x2210",
        "5412x4824x3342",
        "5481x5046x3900",
      ],
      bottleBack: [
        "4673x5994x3562",
        "4875x6000x3894",
        "4936x5988x3891",
        "5099x5902x2481",
        "5142x5991x3337",
        "5903x4897x3163",
        "5988x5265x2613",
        "5992x5027x2408",
        "5992x5078x2632",
      ],
    });
  });

  it("puts every witness in the class the plan names it for, and leaves the ones S1 does not reach exactly as recorded", () => {
    expect(
      Object.fromEntries(changesAgainstTheRecording(POST_TOWER.witnesses)),
    ).toEqual({
      "3560x2920x2600": "M1: a door cabinet across the corner converted",
      "900x4100x2600": "unchanged",
      "900x4410x2600":
        "(e): the preparation 3-drawer converted, its role onto the pan drawer",
      "2100x2200x2600": "M1: a door cabinet on the sink's wall converted",
      "1500x2800x2600": "M1: a door cabinet across the corner converted",
      "1500x3500x2600": "unchanged",
      "1510x2800x2600": "M1: a door cabinet across the corner converted",
      "900x3400x2600":
        "(e): the preparation 3-drawer converted, its role onto the pan drawer",
      "6000x1700x2600":
        "(e): the preparation 3-drawer converted, its role onto the pan drawer",
      "4650x1000x2600": "unchanged",
      "4600x5200x2600": "M2: the threshold drawer gone, one more column",
      "4600x5800x2600": "M2: the threshold drawer gone, the bottle back",
      "900x4700x2600": "unchanged",
      "900x5000x2600": "unchanged",
      "3600x2400x2600": "M1: a door cabinet across the corner converted",
      "900x4400x2600": "unchanged",
    });
  });

  it("differs live from S1's plan in 56 drawn rooms, each by one of S2's trades alone: 34 (b) and 22 (c)", () => {
    const trades = tradesAgainstS1(POST_TOWER.rooms);

    expect(countsOf(trades)).toEqual({
      unchanged: 424,
      "(b): one pantry column traded": 34,
      "(c): the oven tower traded, the hob given its oven": 22,
    });
  });

  it("puts every witness S2 reaches in its trade: (b) 900 x 5000, (d) 900 x 4700, (c) 900 x 4100, 4650 x 1000 and 900 x 4400", () => {
    expect(Object.fromEntries(tradesAgainstS1(POST_TOWER.witnesses))).toEqual({
      "3560x2920x2600": "unchanged",
      "900x4100x2600": "(c): the oven tower traded, the hob given its oven",
      "900x4410x2600": "unchanged",
      "2100x2200x2600": "unchanged",
      "1500x2800x2600": "unchanged",
      "1500x3500x2600": "unchanged",
      "1510x2800x2600": "unchanged",
      "900x3400x2600": "unchanged",
      "6000x1700x2600": "unchanged",
      "4650x1000x2600": "(c): the oven tower traded, the hob given its oven",
      "4600x5200x2600": "unchanged",
      "4600x5800x2600": "unchanged",
      "900x4700x2600": "(d): the bottle traded",
      "900x5000x2600": "(b): one pantry column traded",
      "3600x2400x2600": "unchanged",
      "900x4400x2600": "(c): the oven tower traded, the hob given its oven",
    });
  });

  // Omission, not displacement (S1 criterion 2): a live plan with no dishwasher is the recorded plan,
  // and a live plan that differs from the recorded one holds exactly one dishwasher.
  it("changes a recorded room exactly where the live plan holds one dishwasher", () => {
    const mismatched = [...POST_TOWER.rooms, ...POST_TOWER.witnesses]
      .map(([key, recorded]) => {
        const live = planFor(roomFromRecordedKey(key));
        const dishwashers = live.bases.filter(
          (base) => base.buildId === "base-dishwasher",
        ).length;
        const isChanged = canonicalPlan(live) !== recorded;
        return { key, dishwashers, isChanged };
      })
      .filter(
        ({ dishwashers, isChanged }) =>
          dishwashers > 1 || isChanged !== (dishwashers === 1),
      )
      .map(({ key }) => key);

    expect(mismatched).toEqual([]);
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

// The S1 classifier is only worth what it refuses. Each case below is cut from a witness's recorded
// post-S0b plan by string edits alone — never from the live planner — so these test the classifier and
// stay green whatever S1 later does. The admitted edit is S1's change spelled by hand; each mutant is
// that edit with one thing more wrong than S1 allows, and must read "changed otherwise".
describe("the dishwasher classifier refuses every change beyond S1's", () => {
  const DISHWASHER = "dishwasher~storage~base-dishwasher";

  it.each([
    ["1500x2800x2600", "M1: a door cabinet across the corner converted"],
    ["2100x2200x2600", "M1: a door cabinet on the sink's wall converted"],
  ] as const)(
    "admits %s's door slot at the corner re-identified in place, as %s",
    (key, change) => {
      const before = recordedWitness(POST_TOWER, key);

      expect(classify(key, withTheCornerSlotAs(before, DISHWASHER))).toBe(
        change,
      );
    },
  );

  it("admits 900 x 3400's preparation 3-drawer as the dishwasher and its pan drawer as the preparation, as (e)", () => {
    expect(classify("900x3400x2600", drawerSwapOf900x3400())).toBe(
      "(e): the preparation 3-drawer converted, its role onto the pan drawer",
    );
  });

  it("admits 4600 x 5200 with the threshold drawer gone, one more pantry and the corner slot converted, as M2", () => {
    expect(classify("4600x5200x2600", columnBackOf4600x5200())).toBe(
      "M2: the threshold drawer gone, one more column",
    );
  });

  it("admits 4600 x 5800 with the bottle back in the threshold drawer's place and 300 mm bare, as M2", () => {
    expect(classify("4600x5800x2600", bottleBackOf4600x5800())).toBe(
      "M2: the threshold drawer gone, the bottle back",
    );
  });

  it.each([
    [
      "the dishwasher given the slot's own storage id, so D would still count it",
      "1500x2800x2600",
      (before: string) =>
        withTheCornerSlotAs(
          before,
          `${slotIdAtTheCorner(before, "A")}~storage~base-dishwasher`,
        ),
    ],
    [
      "the dishwasher carrying the preparation role",
      "1500x2800x2600",
      (before: string) =>
        withTheCornerSlotAs(before, "dishwasher~preparation~base-dishwasher"),
    ],
    [
      "the dishwasher 10 mm wider than its module",
      "2100x2200x2600",
      (before: string) =>
        edited(
          withTheCornerSlotAs(before, DISHWASHER),
          `${DISHWASHER}~A~900~1500~600`,
          `${DISHWASHER}~A~900~1510~610`,
        ),
    ],
    [
      "a door slot converted that the fridge, not the sink, faces across the corner",
      "1500x3500x2600",
      (before: string) => withTheCornerSlotAs(before, DISHWASHER),
    ],
    [
      "the drawer slot after the hob converted instead of a module beside the sink",
      "6000x1700x2600",
      (before: string) =>
        edited(
          before,
          `${slotIdAtTheFreeEndOf(before, "A")}~storage~base-3drawer~A~3600`,
          `${DISHWASHER}~A~3600`,
        ),
    ],
    [
      "a lone preparation 3-drawer converted with no pan drawer to take its role (4650 x 1000)",
      "4650x1000x2600",
      (before: string) =>
        edited(
          before,
          "preparation~preparation~base-3drawer~A~2200",
          `${DISHWASHER}~A~2200`,
        ),
    ],
  ])("refuses %s", (_what, key, mutate) => {
    const before = recordedWitness(POST_TOWER, key);

    expect(classify(key, mutate(before))).toBe("changed otherwise");
  });

  it.each([
    [
      "the rejected model: the 3-drawer converted and the pan drawer left as it was",
      () =>
        edited(
          drawerSwapOf900x3400(),
          "preparation~preparation~base-panbank",
          "pan-drawer~storage~base-panbank",
        ),
    ],
    [
      "the preparation role left on a base-dishwasher",
      () =>
        edited(
          recordedWitness(POST_TOWER, "900x3400x2600"),
          "preparation~preparation~base-3drawer",
          "preparation~preparation~base-dishwasher",
        ),
    ],
    [
      "the pan drawer's body changed to a 3-drawer as it takes the preparation role",
      () =>
        edited(
          drawerSwapOf900x3400(),
          "preparation~preparation~base-panbank",
          "preparation~preparation~base-3drawer",
        ),
    ],
  ])("refuses 900 x 3400 with %s", (_what, mutate) => {
    expect(classify("900x3400x2600", mutate())).toBe("changed otherwise");
  });

  // M1 comes first: where a door slot faces the sink, (e) may not take the drawer cabinet instead.
  it("refuses the drawer swap where M1's door slot was free (4600 x 5200, threshold drawer kept)", () => {
    const mutant = edited(
      edited(
        recordedWitness(POST_TOWER, "4600x5200x2600"),
        "preparation~preparation~base-3drawer",
        DISHWASHER,
      ),
      "pan-drawer~storage~base-panbank",
      "preparation~preparation~base-panbank",
    );

    expect(classify("4600x5200x2600", mutant)).toBe("changed otherwise");
  });

  it.each([
    [
      "the regained column an oven tower rather than a pantry",
      () =>
        edited(
          columnBackOf4600x5200(),
          "column:B:2~storage~tall-pantry",
          "column:B:2~storage~tall-oven-tower",
        ),
    ],
    [
      "the threshold drawer gone and nothing in its place, 600 mm left bare",
      () =>
        edited(
          edited(
            columnBackOf4600x5200(),
            "|column:B:2~storage~tall-pantry~B~4500~5100~600",
            "",
          ),
          "remainder=0/0|floorWidths=600,600,600,600,600,700/600,600,600,600,600,600,600",
          "remainder=0/600|floorWidths=600,600,600,600,600,700/600,600,600,600,600,600",
        ),
    ],
    [
      "the threshold drawer re-planned away with no dishwasher to take it out of D",
      () =>
        edited(
          columnBackOf4600x5200(),
          `${DISHWASHER}~A~900`,
          `${slotIdAtTheCorner(recordedWitness(POST_TOWER, "4600x5200x2600"), "A")}~storage~base-cabinet~A~900`,
        ),
    ],
  ])("refuses 4600 x 5200 with %s", (_what, mutate) => {
    expect(classify("4600x5200x2600", mutate())).toBe("changed otherwise");
  });

  it("refuses 4600 x 5800 with the bottle back and the threshold drawer's remainder kept, so the block reaches past the wall", () => {
    const mutant = edited(
      bottleBackOf4600x5800(),
      "remainder=0/300",
      "remainder=0/0",
    );

    expect(classify("4600x5800x2600", mutant)).toBe("changed otherwise");
  });

  it("admits the reference room with its corner slot on wall B converted, and refuses it with both slots there converted", () => {
    const before = recordedWitness(POST_TOWER, "3560x2920x2600");
    const [cornerSlot] = slotsOn(before, "B");
    if (!cornerSlot) missingSlot("B");
    const admitted = edited(
      before,
      `${cornerSlot.id}~storage~base-cabinet~B~900`,
      `${DISHWASHER}~B~900`,
    );

    expect(classify("3560x2920x2600", admitted)).toBe(
      "M1: a door cabinet across the corner converted",
    );
    expect(
      classify("3560x2920x2600", withEverySlotOn(before, "B", DISHWASHER)),
    ).toBe("changed otherwise");
  });
});

function classify(key: string, after: string): DishwasherChange {
  return dishwasherChangeBetween({
    before: recordedWitness(POST_TOWER, key),
    after,
    cornerEndMm: cornerEndsOf(roomFromRecordedKey(key)),
  });
}

function recordedWitness(recording: typeof POST_TOWER, key: string): string {
  const recorded = recording.witnesses.get(key);
  if (recorded === undefined) {
    throw new Error(`the 7D5b tower recording holds no witness ${key}`);
  }
  return recorded;
}

/** `canonical` with `from` replaced once by `to`; throws where `from` is absent, so no mutant is
 *  silently the admitted plan. */
function edited(canonical: string, from: string, to: string): string {
  if (!canonical.includes(from)) {
    throw new Error(`the plan holds no ${from}`);
  }
  return canonical.replace(from, to);
}

/** The composed slot at the corner end of `wall`, found by the predicate and its id read off the plan
 *  (7D4 criterion 22), and never spelled here. */
function slotIdAtTheCorner(canonical: string, wall: "A" | "B"): string {
  return slotsOn(canonical, wall)[0]?.id ?? missingSlot(wall);
}

function slotIdAtTheFreeEndOf(canonical: string, wall: "A" | "B"): string {
  return slotsOn(canonical, wall).at(-1)?.id ?? missingSlot(wall);
}

function slotsOn(canonical: string, wall: "A" | "B") {
  return parseRecordedCanonicalPlan(canonical)
    .bases.filter((base) => isComposedStorageSlot(base) && base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm);
}

function missingSlot(wall: string): never {
  throw new Error(`the plan has no composed slot on wall ${wall}`);
}

function withTheCornerSlotAs(canonical: string, identity: string): string {
  return edited(
    canonical,
    `${slotIdAtTheCorner(canonical, "A")}~storage~base-cabinet~A~900`,
    `${identity}~A~900`,
  );
}

function withEverySlotOn(
  canonical: string,
  wall: "A" | "B",
  identity: string,
): string {
  return slotsOn(canonical, wall).reduce(
    (plan, slot) =>
      edited(
        plan,
        `${slot.id}~storage~base-cabinet~${wall}~${String(slot.startMm)}`,
        `${identity}~${wall}~${String(slot.startMm)}`,
      ),
    canonical,
  );
}

function drawerSwapOf900x3400(): string {
  return edited(
    edited(
      recordedWitness(POST_TOWER, "900x3400x2600"),
      "preparation~preparation~base-3drawer",
      "dishwasher~storage~base-dishwasher",
    ),
    "pan-drawer~storage~base-panbank",
    "preparation~preparation~base-panbank",
  );
}

/** E3's witness, spelled from the recording: the drawer [3300, 3900] gone, the tower and pantry slid
 *  600 mm in, a second pantry at [4500, 5100], and the corner slot the dishwasher. */
function columnBackOf4600x5200(): string {
  const before = recordedWitness(POST_TOWER, "4600x5200x2600");
  return edited(
    withTheCornerSlotAs(before, "dishwasher~storage~base-dishwasher"),
    "threshold-drawer~storage~base-3drawer~B~3300~3900~600|column:B:0~storage~tall-oven-tower~B~3900~4500~600|column:B:1~storage~tall-pantry~B~4500~5100~600",
    "column:B:0~storage~tall-oven-tower~B~3300~3900~600|column:B:1~storage~tall-pantry~B~3900~4500~600|column:B:2~storage~tall-pantry~B~4500~5100~600",
  );
}

/** E3's second witness: the bottle at [3300, 3600], the block slid 300 mm in, 300 mm bare — which is
 *  too wide to merge into the outer pantry (600 + 300 > 800). */
function bottleBackOf4600x5800(): string {
  const before = recordedWitness(POST_TOWER, "4600x5800x2600");
  return edited(
    edited(
      withTheCornerSlotAs(before, "dishwasher~storage~base-dishwasher"),
      "remainder=0/0|floorWidths=600,600,600,600,600,700/600,600,600,600,600,600,600,600",
      "remainder=0/300|floorWidths=600,600,600,600,600,700/600,600,600,600,300,600,600,600",
    ),
    "threshold-drawer~storage~base-3drawer~B~3300~3900~600|column:B:0~storage~tall-oven-tower~B~3900~4500~600|column:B:1~storage~tall-pantry~B~4500~5100~600|column:B:2~storage~tall-pantry~B~5100~5700~600",
    "bottle~storage~base-bottle-cargo~B~3300~3600~300|column:B:0~storage~tall-oven-tower~B~3600~4200~600|column:B:1~storage~tall-pantry~B~4200~4800~600|column:B:2~storage~tall-pantry~B~4800~5400~600",
  );
}
