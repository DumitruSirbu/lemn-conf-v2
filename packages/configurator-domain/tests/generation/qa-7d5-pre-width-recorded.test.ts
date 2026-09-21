// M7 wave 7D5 pre-width capture. This comparison was introduced and run while production was still
// at e808f1c, before S1 added a 300 mm bottle cabinet. Every row is a whole canonical plan: body ids,
// roles, walls, positions, widths, the cut, dropped roles, remainders and floor widths.
//
// Restated for M7 wave 7D5 S2 (owner ruling 2026-09-21, Q-H6a = A; ADR 0110 Amendment J1). The
// classifier used to allow only S1's bottle. It now allows exactly what the pan drawer does as well:
// a 600 mm `base-panbank` immediately before the hob, the hob and the bottle shifted along their wall
// by that width, and the hob's wall giving up outermost modules to pay for it. The recording is not
// re-captured (plan risk 2): it stays the pre-S1 truth, and every other field is still pinned to it.
//
// Restated again for M7 wave 7D5 S3 (owner ruling 2026-09-21, ADR 0110 Q-H5). The classifier also
// admits the threshold drawer: one 600 mm `base-3drawer` under its own id, read after the hob — in
// the bottle's place or right after the bottle — costing the hob's wall one outermost module and at
// most one tall column. The arm counts below move only by the rooms that drawer now stands in.
import { describe, expect, it } from "vitest";

import {
  BOTTLE_CARGO_BUILD_ID,
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
  assertOnlyTheBottleAndPanDrawerChanged,
  PAN_DRAWER_BODY,
  readPreWidthRunRecording,
  STORAGE_SLOT_ID,
  THRESHOLD_DRAWER_ID,
} from "../support/pre-width-run-recording.js";

const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);
const RECORDING = readPreWidthRunRecording();
const CORRUPTION_CASES: readonly (readonly [
  string,
  (plan: MutablePlan) => void,
])[] = [
  [
    "id",
    (plan: MutablePlan): void => {
      firstBase(plan).id = "corrupt";
    },
  ],
  [
    "role",
    (plan: MutablePlan): void => {
      firstBase(plan).role = "storage";
    },
  ],
  [
    "position",
    (plan: MutablePlan): void => {
      firstBase(plan).startMm += 1;
    },
  ],
  [
    "width",
    (plan: MutablePlan): void => {
      firstBase(plan).widthMm += 1;
    },
  ],
  [
    "dropped",
    (plan: MutablePlan): void => {
      plan.dropped.push("fridge");
    },
  ],
  [
    "remainder",
    (plan: MutablePlan): void => {
      plan.remainderMm.A += 1;
    },
  ],
  [
    "floor width",
    (plan: MutablePlan): void => {
      plan.floorWidthsMm.A[0] = 999;
    },
  ],
];
function roomFromKey(key: string): DesignRoom {
  const [widthMm, depthMm, heightMm] = key.split("x").map(Number);
  if (
    widthMm === undefined ||
    depthMm === undefined ||
    heightMm === undefined ||
    !Number.isInteger(widthMm) ||
    !Number.isInteger(depthMm) ||
    !Number.isInteger(heightMm)
  ) {
    throw new Error(
      `the 7D5 pre-width recording holds an invalid room key: ${key}`,
    );
  }
  return { shape: "L", widthMm, depthMm, heightMm };
}

describe("the whole plan before 7D5's width change", () => {
  it("keeps the exact pre-S1 plan for every room where S1 omits the bottle", () => {
    let exactNoBottleComparisons = 0;
    let normalizedBottleComparisons = 0;
    let panDrawerComparisons = 0;
    let panDrawerWithoutBottleComparisons = 0;
    let thresholdDrawerComparisons = 0;
    let thresholdDrawerWithoutTheBottleComparisons = 0;
    for (const [key, recorded] of RECORDING.rooms) {
      const room = roomFromKey(key);
      expect(roomKey(room)).toBe(key);
      const plan = planKitchenComposition({
        room,
        runs: lShellFloorRuns(room),
        columns: DECLARED_COLUMNS,
      });
      const composed = canonicalPlan(plan);
      const hasBottle = plan.bases.some(
        (base) => base.buildId === BOTTLE_CARGO_BUILD_ID,
      );
      const hasPanDrawer = plan.bases.some(
        (base) => base.buildId === PAN_DRAWER_BODY,
      );
      const hasThresholdDrawer = plan.bases.some(
        (base) => base.id === THRESHOLD_DRAWER_ID,
      );
      if (hasThresholdDrawer) thresholdDrawerComparisons += 1;
      if (hasThresholdDrawer && !hasBottle)
        thresholdDrawerWithoutTheBottleComparisons += 1;
      if (hasBottle || hasPanDrawer || hasThresholdDrawer) {
        if (hasBottle) normalizedBottleComparisons += 1;
        if (hasPanDrawer) panDrawerComparisons += 1;
        if (hasPanDrawer && !hasBottle) panDrawerWithoutBottleComparisons += 1;
        assertOnlyTheBottleAndPanDrawerChanged(key, room, plan, recorded);
      } else {
        exactNoBottleComparisons += 1;
        expect(composed, key).toBe(recorded);
      }
    }

    // 7D5 S2, Q-H6b / Q-H6c: the pan drawer is decided first and the bottle gives way to it and to
    // the block, so 78 rooms that stood a bottle alone now stand the pan drawer alone. They leave
    // the bottle arm (390 → 312) for the classifier's pan-drawer-without-bottle arm, and no room
    // joins or leaves the exact arm — the 90 without either are what S1 left whole.
    //
    // 7D5 S3 / Q-H5: the threshold drawer stands in 40 recorded rooms, every one beside a pan drawer
    // (the pan-drawer arm is unchanged at 210). 33 of them stand no bottle: 28 are the drawer taking
    // the bottle's place, and they leave the bottle arm (312 → 284) for the pan-drawer-without-bottle
    // arm (78 → 106); the other 5 had already lost their bottle to Q-H6c. The exact arm is unchanged.
    expect({
      exactNoBottleComparisons,
      normalizedBottleComparisons,
      panDrawerComparisons,
      panDrawerWithoutBottleComparisons,
      thresholdDrawerComparisons,
      thresholdDrawerWithoutTheBottleComparisons,
    }).toEqual({
      exactNoBottleComparisons: 90,
      normalizedBottleComparisons: 284,
      panDrawerComparisons: 210,
      panDrawerWithoutBottleComparisons: 106,
      thresholdDrawerComparisons: 40,
      thresholdDrawerWithoutTheBottleComparisons: 33,
    });
    expect(
      exactNoBottleComparisons +
        normalizedBottleComparisons +
        panDrawerWithoutBottleComparisons,
    ).toBe(RECORDING.runs);
  });

  // 7D5 S2 / Q-H6a: witnesses that the pan-drawer arm of the classifier is not vacuous. Each mutation
  // keeps both runs contiguous, so it is the pan-drawer clauses rather than the structure that reject it.
  it.each(PAN_DRAWER_CORRUPTION_CASES)(
    "rejects a pan-drawer room where %s",
    (_, rejectingClause, mutate) => {
      const { key, room, recorded, plan } =
        firstPanDrawerRoomWithASlotAfterTheHob();
      mutate(plan);

      expect(() => {
        assertOnlyTheBottleAndPanDrawerChanged(
          key,
          room,
          plan as unknown as KitchenCompositionPlan,
          recorded,
        );
      }).toThrow(rejectingClause);
    },
  );

  // 7D5 S2 / Q-H6b / Q-H6c: witnesses that the arm admitting a pan drawer without the bottle is still
  // strict. Each mutation keeps both runs contiguous — floor widths and remainder follow the module
  // removed — so the clause named is what rejects it.
  it("rejects a pan drawer without the bottle whose block lost a tall column (Q-H6c)", () => {
    const { key, room, recorded, plan } = firstRoomWhere(
      (bases) =>
        !bases.some((base) => base.id === "bottle") &&
        bases.some((base) => base.id === "pan-drawer") &&
        bases.some((base) => base.role === "storage" && isTallColumn(base)),
    );
    removeOutermostModulesOfTheHobWall(plan, 1);

    expect(() => {
      assertOnlyTheBottleAndPanDrawerChanged(
        key,
        room,
        plan as unknown as KitchenCompositionPlan,
        recorded,
      );
    }).toThrow(/tall columns kept once the pan drawer stands/);
  });

  it("rejects a bottle alone that cost the hob's wall two modules (N5b)", () => {
    const { key, room, recorded, plan } = firstRoomWhere(
      (bases) =>
        bases.some((base) => base.id === "bottle") &&
        !bases.some((base) => base.id === "pan-drawer") &&
        modulesAfterTheHob(bases) >= 2,
    );
    removeOutermostModulesOfTheHobWall(plan, 2);

    expect(() => {
      assertOnlyTheBottleAndPanDrawerChanged(
        key,
        room,
        plan as unknown as KitchenCompositionPlan,
        recorded,
      );
    }).toThrow(/modules lost/);
  });

  it("rejects a plan with neither a bottle nor a pan drawer rather than reading it", () => {
    const { key, room, recorded, plan } = firstRoomWhere(
      (bases) =>
        bases.some((base) => base.id === "bottle") &&
        !bases.some((base) => base.id === "pan-drawer"),
    );
    plan.bases = plan.bases.filter((base) => base.id !== "bottle");

    expect(() => {
      assertOnlyTheBottleAndPanDrawerChanged(
        key,
        room,
        plan as unknown as KitchenCompositionPlan,
        recorded,
      );
    }).toThrow(/bottle count/);
  });

  // 7D5 S3 / Q-H5: witnesses that the threshold-drawer arm of the classifier is not vacuous. Each
  // mutation keeps both runs contiguous, so the clause named is what rejects it.
  it.each(THRESHOLD_DRAWER_CORRUPTION_CASES)(
    "rejects a threshold-drawer room where %s",
    (_, rejectingClause, witness) => {
      const { key, room, recorded, plan } = firstRoomWhere(witness.isWanted);
      witness.mutate(plan);

      expect(() => {
        assertOnlyTheBottleAndPanDrawerChanged(
          key,
          room,
          plan as unknown as KitchenCompositionPlan,
          recorded,
        );
      }).toThrow(rejectingClause);
    },
  );

  it.each(CORRUPTION_CASES)(
    "rejects unrelated %s corruption in the bottle arm",
    (_, mutate) => {
      const [key, recorded] = [...RECORDING.rooms].find(([candidate]) => {
        const room = roomFromKey(candidate);
        return planKitchenComposition({
          room,
          runs: lShellFloorRuns(room),
          columns: DECLARED_COLUMNS,
        }).bases.some((base) => base.id === "bottle");
      }) ?? [undefined, undefined];
      if (!key || !recorded)
        throw new Error("the recording has no bottle room");
      const room = roomFromKey(key);
      const plan = structuredClone(
        planKitchenComposition({
          room,
          runs: lShellFloorRuns(room),
          columns: DECLARED_COLUMNS,
        }),
      ) as unknown as MutablePlan;
      mutate(plan);

      expect(() => {
        assertOnlyTheBottleAndPanDrawerChanged(
          key,
          room,
          plan as unknown as KitchenCompositionPlan,
          recorded,
        );
      }).toThrow();
    },
  );

  it("identifies the exact committed pre-S1 source and records every sampled plan whole", () => {
    expect(RECORDING.capturedFrom).toBe(
      "e808f1c, before M7 wave 7D5 S1; generation-priorities.ts blob 14797fb81a38a3e5169d75ec9a09913feb65ce20; body-choice.ts blob ebc70b293cb77cd70aee421999a1f7a08cd32726; whole canonical plans over the current approved L bounds",
    );
    expect(RECORDING.seed).toBe(20260919);
    expect(RECORDING.runs).toBe(480);
    expect(RECORDING.rooms.size).toBe(RECORDING.runs);
    for (const recorded of RECORDING.rooms.values()) {
      expect(recorded).toMatch(/^minimumMet=(true|false)\|cut=\d+\|dropped=/);
      expect(recorded).toContain("|remainder=");
      expect(recorded).toContain("|floorWidths=");
    }
  });
});

interface MutablePlan {
  dropped: string[];
  remainderMm: { A: number; B: number };
  floorWidthsMm: { A: number[]; B: number[] };
  bases: {
    id: string;
    role: string;
    buildId: string;
    wall: "A" | "B";
    startMm: number;
    endMm: number;
    widthMm: number;
  }[];
}

type MutableBase = MutablePlan["bases"][number];

const PAN_DRAWER_CORRUPTION_CASES: readonly (readonly [
  string,
  RegExp,
  (plan: MutablePlan) => void,
])[] = [
  [
    "the hob moved 600 mm with no pan drawer standing",
    /core geometry/,
    (plan: MutablePlan): void => {
      const panDrawer = baseWithId(plan, "pan-drawer");
      // Re-indexed from a slot the composer wrote on the same wall, so this file never spells the
      // slot-id convention itself (7D4 criterion 22's guard counts every test that does).
      const slotOnTheSameWall = plan.bases.find(
        (base) => base.wall === panDrawer.wall && STORAGE_SLOT_ID.test(base.id),
      );
      if (slotOnTheSameWall === undefined) {
        throw new Error("the witness has no slot on the pan drawer's wall");
      }
      panDrawer.id = slotOnTheSameWall.id.replace(/\d+$/, "99");
      panDrawer.buildId = "base-3drawer";
    },
  ],
  [
    "the pan drawer stands after the hob instead of before it",
    /core geometry/,
    (plan: MutablePlan): void => {
      const panDrawer = baseWithId(plan, "pan-drawer");
      const hob = baseWithRole(plan, "hob");
      const hobStartMm = hob.startMm;
      hob.startMm = panDrawer.startMm;
      hob.endMm = hob.startMm + hob.widthMm;
      panDrawer.startMm = hob.endMm;
      panDrawer.endMm = panDrawer.startMm + panDrawer.widthMm;
      expect(panDrawer.endMm).toBe(hobStartMm + hob.widthMm);
    },
  ],
  [
    "the first storage slot after the hob changed its body",
    /storage slots/,
    (plan: MutablePlan): void => {
      const hob = baseWithRole(plan, "hob");
      const slot = plan.bases
        .filter((base) => base.wall === hob.wall)
        .filter((base) => STORAGE_SLOT_ID.test(base.id))
        .sort((left, right) => left.startMm - right.startMm)[0];
      if (slot === undefined) throw new Error("the witness has no slot");
      slot.buildId =
        slot.buildId === "base-cabinet" ? "base-3drawer" : "base-cabinet";
    },
  ],
  [
    "the pan drawer is a second one",
    /pan drawer count/,
    (plan: MutablePlan): void => {
      const hob = baseWithRole(plan, "hob");
      const slot = plan.bases.find(
        (base) => base.wall === hob.wall && STORAGE_SLOT_ID.test(base.id),
      );
      if (slot === undefined) throw new Error("the witness has no slot");
      slot.buildId = PAN_DRAWER_BODY;
    },
  ],
];

interface ThresholdDrawerWitness {
  readonly isWanted: (bases: KitchenCompositionPlan["bases"]) => boolean;
  readonly mutate: (plan: MutablePlan) => void;
}

function hasThresholdDrawer(bases: KitchenCompositionPlan["bases"]): boolean {
  return bases.some((base) => base.id === THRESHOLD_DRAWER_ID);
}

function hasBottle(bases: KitchenCompositionPlan["bases"]): boolean {
  return bases.some((base) => base.id === "bottle");
}

const THRESHOLD_DRAWER_CORRUPTION_CASES: readonly (readonly [
  string,
  RegExp,
  ThresholdDrawerWitness,
])[] = [
  [
    "it wears a door body",
    /threshold drawer identity/,
    {
      isWanted: hasThresholdDrawer,
      mutate: (plan) => {
        baseWithId(plan, THRESHOLD_DRAWER_ID).buildId = "base-cabinet";
      },
    },
  ],
  [
    "a second one stands",
    /threshold drawer count/,
    {
      isWanted: hasThresholdDrawer,
      mutate: (plan) => {
        const drawer = baseWithId(plan, THRESHOLD_DRAWER_ID);
        plan.bases.push({ ...drawer });
      },
    },
  ],
  [
    "it stands before the hob instead of after it",
    /core geometry/,
    {
      isWanted: (bases) => hasThresholdDrawer(bases) && !hasBottle(bases),
      mutate: (plan) => {
        const drawer = baseWithId(plan, THRESHOLD_DRAWER_ID);
        const hob = baseWithRole(plan, "hob");
        drawer.startMm = hob.startMm;
        drawer.endMm = drawer.startMm + drawer.widthMm;
        hob.startMm = drawer.endMm;
        hob.endMm = hob.startMm + hob.widthMm;
      },
    },
  ],
  [
    "it is read after a tall column rather than the hob or the bottle",
    /threshold drawer after the hob or the bottle/,
    {
      isWanted: (bases) =>
        hasThresholdDrawer(bases) &&
        bases.some(
          (base) =>
            TALL_COLUMN.test(base.id) &&
            base.widthMm === 600 &&
            base.startMm ===
              bases.find((drawer) => drawer.id === THRESHOLD_DRAWER_ID)?.endMm,
        ),
      mutate: (plan) => {
        const drawer = baseWithId(plan, THRESHOLD_DRAWER_ID);
        const column = plan.bases.find(
          (base) => TALL_COLUMN.test(base.id) && base.startMm === drawer.endMm,
        );
        if (column === undefined) throw new Error("no column after the drawer");
        column.startMm = drawer.startMm;
        column.endMm = column.startMm + column.widthMm;
        drawer.startMm = column.endMm;
        drawer.endMm = drawer.startMm + drawer.widthMm;
      },
    },
  ],
  [
    "it cost a second tall column",
    /tall columns kept once the pan drawer stands/,
    {
      isWanted: (bases) =>
        hasThresholdDrawer(bases) &&
        hasBottle(bases) &&
        bases.filter((base) => TALL_COLUMN.test(base.id)).length >= 2,
      mutate: (plan) => {
        removeOutermostModulesOfTheHobWall(plan, 1);
      },
    },
  ],
];

const TALL_COLUMN = /^column:[AB]:\d+$/;

function firstPanDrawerRoomWithASlotAfterTheHob(): {
  readonly key: string;
  readonly room: DesignRoom;
  readonly recorded: string;
  readonly plan: MutablePlan;
} {
  for (const [key, recorded] of RECORDING.rooms) {
    const room = roomFromKey(key);
    const plan = planKitchenComposition({
      room,
      runs: lShellFloorRuns(room),
      columns: DECLARED_COLUMNS,
    });
    const hob = plan.bases.find((base) => base.role === "hob");
    const hasPanDrawer = plan.bases.some((base) => base.id === "pan-drawer");
    const hasSlotAfterTheHob = plan.bases.some(
      (base) => base.wall === hob?.wall && STORAGE_SLOT_ID.test(base.id),
    );
    if (hasPanDrawer && hasSlotAfterTheHob) {
      const mutable = structuredClone(plan) as unknown as MutablePlan;
      return { key, room, recorded, plan: mutable };
    }
  }
  throw new Error("the recording has no pan-drawer room with a storage slot");
}

/** The first recorded room whose current plan's bases satisfy `isWanted`, with a mutable copy. */
function firstRoomWhere(
  isWanted: (bases: KitchenCompositionPlan["bases"]) => boolean,
): {
  readonly key: string;
  readonly room: DesignRoom;
  readonly recorded: string;
  readonly plan: MutablePlan;
} {
  for (const [key, recorded] of RECORDING.rooms) {
    const room = roomFromKey(key);
    const plan = planKitchenComposition({
      room,
      runs: lShellFloorRuns(room),
      columns: DECLARED_COLUMNS,
    });
    if (isWanted(plan.bases)) {
      const mutable = structuredClone(plan) as unknown as MutablePlan;
      return { key, room, recorded, plan: mutable };
    }
  }
  throw new Error(
    "the 7D5 pre-width recording holds no room of the witnessed shape",
  );
}

function isTallColumn(base: { readonly buildId: string }): boolean {
  return CATALOG.get(base.buildId)?.band === "column";
}

function modulesAfterTheHob(bases: KitchenCompositionPlan["bases"]): number {
  const hob = bases.find((base) => base.role === "hob");
  return bases.filter(
    (base) =>
      base.wall === hob?.wall &&
      base.startMm >= hob.endMm &&
      base.id !== "bottle",
  ).length;
}

/** Drops the `count` outermost modules of the hob's wall and keeps the run contiguous: its floor
 *  widths lose their last entries and its remainder gains their width. */
function removeOutermostModulesOfTheHobWall(
  plan: MutablePlan,
  count: number,
): void {
  const wall = baseWithRole(plan, "hob").wall;
  const outermost = plan.bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => right.startMm - left.startMm)
    .slice(0, count);
  plan.bases = plan.bases.filter((base) => !outermost.includes(base));
  plan.floorWidthsMm[wall].splice(-count, count);
  plan.remainderMm[wall] += outermost.reduce(
    (sum, base) => sum + base.widthMm,
    0,
  );
}

function baseWithId(plan: MutablePlan, id: string): MutableBase {
  const base = plan.bases.find((candidate) => candidate.id === id);
  if (!base) throw new Error(`the mutation witness composes no ${id}`);
  return base;
}

function baseWithRole(plan: MutablePlan, role: string): MutableBase {
  const base = plan.bases.find((candidate) => candidate.role === role);
  if (!base) throw new Error(`the mutation witness composes no ${role}`);
  return base;
}

function firstBase(plan: MutablePlan): MutablePlan["bases"][number] {
  const base = plan.bases[0];
  if (!base) throw new Error("the mutation witness composes no base");
  return base;
}
