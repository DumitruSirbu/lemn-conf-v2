// M7 wave 7D5 pre-width capture. This comparison was introduced and run while production was still
// at e808f1c, before S1 added a 300 mm bottle cabinet. Every row is a whole canonical plan: body ids,
// roles, walls, positions, widths, the cut, dropped roles, remainders and floor widths.
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
  parseRecordedCanonicalPlan,
  readPreWidthRunRecording,
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
function moduleLine(base: {
  readonly id: string;
  readonly role: string;
  readonly buildId: string;
  readonly wall: string;
  readonly startMm: number;
  readonly endMm: number;
  readonly widthMm: number;
}): string {
  return [
    base.id,
    base.role,
    base.role === "hob" ? "<hob-body>" : base.buildId,
    base.wall,
    base.startMm,
    base.endMm,
    base.widthMm,
  ].join("~");
}

function coreIdentity(base: {
  readonly id: string;
  readonly role: string;
  readonly buildId: string;
  readonly widthMm: number;
}): string {
  return [
    base.id,
    base.role,
    base.role === "hob" ? "<hob-body>" : base.buildId,
    base.widthMm,
  ].join("~");
}

function assertOnlyTheBottleChanged(
  key: string,
  room: DesignRoom,
  plan: KitchenCompositionPlan,
  recordedCanonical: string,
): void {
  const recorded = parseRecordedCanonicalPlan(recordedCanonical);
  expect(plan.minimumMet, `${key} minimumMet`).toBe(recorded.minimumMet);
  expect(plan.dropped, `${key} dropped`).toEqual(recorded.dropped);

  const bottle = plan.bases.filter((base) => base.id === "bottle");
  expect(bottle, `${key} bottle identity`).toEqual([
    expect.objectContaining({
      id: "bottle",
      role: "storage",
      buildId: BOTTLE_CARGO_BUILD_ID,
      widthMm: 300,
    }),
  ]);

  const currentCore = plan.bases.filter((base) => base.role !== "storage");
  const recordedCore = recorded.bases.filter((base) => base.role !== "storage");
  expect(
    currentCore.map(coreIdentity).sort(),
    `${key} core identities`,
  ).toEqual(recordedCore.map(coreIdentity).sort());
  expect(currentCore.map(moduleLine), `${key} core geometry`).toEqual(
    recordedCore.map(moduleLine),
  );

  const ids = plan.bases.map((base) => base.id);
  expect(new Set(ids).size, `${key} unique ids`).toBe(ids.length);
  const runs = lShellFloorRuns(room);
  for (const wall of ["A", "B"] as const) {
    const bases = plan.bases
      .filter((base) => base.wall === wall)
      .sort((left, right) => left.startMm - right.startMm);
    let cursor = runs[wall].startMm;
    for (const base of bases) {
      expect(base.startMm, `${key} ${base.id} start`).toBe(cursor);
      expect(base.endMm - base.startMm, `${key} ${base.id} span`).toBe(
        base.widthMm,
      );
      expect(CATALOG.has(base.buildId), `${key} ${base.id} build`).toBe(true);
      if (base.role === "storage" && base.id !== "bottle") {
        expect(
          /^(storage|column):[AB]:\d+$/.test(base.id),
          `${key} ${base.id} ancillary id`,
        ).toBe(true);
      }
      cursor = base.endMm;
    }
    expect(plan.floorWidthsMm[wall], `${key} ${wall} floor widths`).toEqual(
      bases.map((base) => base.widthMm),
    );
    expect(plan.remainderMm[wall], `${key} ${wall} remainder`).toBe(
      runs[wall].endMm - cursor,
    );
  }
}

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
      if (hasBottle) {
        normalizedBottleComparisons += 1;
        assertOnlyTheBottleChanged(key, room, plan, recorded);
      } else {
        exactNoBottleComparisons += 1;
        expect(composed, key).toBe(recorded);
      }
    }

    expect(exactNoBottleComparisons).toBe(90);
    expect(normalizedBottleComparisons).toBe(390);
  });

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
        assertOnlyTheBottleChanged(
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

function firstBase(plan: MutablePlan): MutablePlan["bases"][number] {
  const base = plan.bases[0];
  if (!base) throw new Error("the mutation witness composes no base");
  return base;
}
