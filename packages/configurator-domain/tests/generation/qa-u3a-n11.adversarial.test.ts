// M7B U3a adversarial QA, round 2 — ADR 0110 N11 (U3a review round 1, with RQ23's answer), held by
// the rules in `tests/support/u-plan-invariants.ts` and by witnesses at the boundaries each ruling
// turns on:
// - N11.1: a free-end fridge's remainder lies beyond it and stays bare, at 1 / 399 / 400 / 599 mm;
//   the counted fridge's pantry gap at 398 / 400 / 598 / 600 mm.
// - N11.2 with RQ23: 598 / 600 / 898 / 900 mm after a wall-A hob, where the far wall can absorb a
//   drawer and where it cannot (RQ21 against RQ23).
// - N11.3: the sink never leaves wall A — `minimumMet` agrees with ADR 0108 H3's predicate in both
//   directions over the engine band (A from 1800), and at freeA 599 / 600.
// - N11.4: heights 2199 / 2200, door bases in the fridge gap below the column.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { uShellFloorRuns, type DesignWall } from "../../src/index.js";
import {
  holdsTheMinimumKitchen,
  uPlanFindings,
  type URuns,
} from "../support/u-plan-invariants.js";
import { planFor, uRoom } from "../support/u-plan-fixtures.js";

/** A wall's bodies from its corner, as `buildId@start-end`. */
function bodiesOn(
  plan: ReturnType<typeof planFor>,
  wall: DesignWall,
): readonly string[] {
  return plan.bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm)
    .map(
      (base) => `${base.buildId}@${String(base.startMm)}-${String(base.endMm)}`,
    );
}

const WALL_A_CORE = [
  "base-sink@900-1500",
  "base-dishwasher@1500-2100",
  "base-3drawer@2100-2700",
  "base-hob-2drawer@2700-3300",
];

/** Engine band: wall A from 1800 (below the approved 2700), heights from under the column. */
const engineRoomArb = fc
  .tuple(
    fc.oneof(
      fc.integer({ min: 1800, max: 6000 }),
      fc.constantFrom(2399, 2400, 2401, 2999, 3000),
    ),
    fc.oneof(
      fc.integer({ min: 1000, max: 6000 }),
      fc.constantFrom(1599, 1600, 1701, 2099, 2100, 2299, 2300, 3000, 3001),
    ),
    fc.oneof(
      fc.integer({ min: 1000, max: 6000 }),
      fc.constantFrom(1599, 1600, 1701, 2099, 2100, 2299, 2300, 3000, 3001),
    ),
    fc.constantFrom(2000, 2199, 2200, 2600, 3900),
  )
  .map(([widthMm, depthMm, wallCMm, heightMm]) =>
    uRoom(widthMm, depthMm, wallCMm, heightMm),
  );

describe("N11 over the engine band (ADR 0110 N11.1-N11.4)", () => {
  propertyTest.prop([engineRoomArb], { numRuns: 2000 })(
    "keeps every rule, and composes exactly when ADR 0108 H3 holds",
    (room) => {
      const runs = uShellFloorRuns(room);
      const plan = planFor(room, runs);
      const context = { room, runs, plan };

      expect(plan.minimumMet).toBe(holdsTheMinimumKitchen(context));
      expect(uPlanFindings(context)).toStrictEqual([]);
    },
  );
});

describe("N11.3: the sink never leaves wall A", () => {
  it("refuses freeA 599 (2399 / 3000 / 3000) and composes freeA 600 with the sink at 900-1500", () => {
    expect(planFor(uRoom(2399, 3000, 3000)).minimumMet).toBe(false);

    const plan = planFor(uRoom(2400, 3000, 3000));

    expect(bodiesOn(plan, "A")).toStrictEqual(["base-sink@900-1500"]);
    expect(bodiesOn(plan, "C")).toStrictEqual([
      "base-dishwasher@900-1500",
      "base-3drawer@1500-2100",
      "base-hob-oven@2100-2700",
    ]);
    // B's free run is 900-2900: two cabinets and the fridge reach 2800, and the owner's Q6 (M7C wave C5 S2)
    // gives the 100 mm beyond the fridge to the cabinet beside it, so the fridge stands at 2200-2900.
    expect(bodiesOn(plan, "B")).toStrictEqual([
      "base-cabinet@900-1500",
      "base-cabinet@1500-2200",
      "fridge-free@2200-2900",
    ]);
  });

  it("refuses freeA 600 when the far wall holds under 600 (2400 / 1599 / 1599)", () => {
    expect(planFor(uRoom(2400, 1599, 1599)).minimumMet).toBe(false);
  });

  it("composes freeA 600 with a far wall of exactly 600 (2400 / 1600 / 1600): sink on A, hob on C", () => {
    const plan = planFor(uRoom(2400, 1600, 1600));

    expect(bodiesOn(plan, "A")).toStrictEqual(["base-sink@900-1500"]);
    expect(bodiesOn(plan, "C")).toStrictEqual(["base-hob-oven@900-1500"]);
    expect(plan.dropped).toStrictEqual(["fridge", "preparation"]);
  });
});

describe("N11.1: a free-end fridge's remainder lies beyond it, bare", () => {
  // Hand-built fridge wall B: its run is the 700 mm fridge plus `remainderMm`, so remainders the
  // shell's whole-millimetre ends cannot reach (1, 399, 599) are hit exactly. B is entered at 2000,
  // so the fridge stands at the free end; C at 1900 keeps B the wider wall.
  const runsWithFridgeRemainder = (remainderMm: number): URuns => ({
    A: { wall: "A", startMm: 900, endMm: 3300 },
    B: { wall: "B", startMm: 900, endMm: 1600 + remainderMm },
    C: { wall: "C", startMm: 900, endMm: 1800 },
  });

  it.each([1, 399, 400, 599])(
    "stands the fridge at 900-1600 with %i mm bare beyond it and nothing there",
    (remainderMm) => {
      const room = uRoom(4200, 2000, 1900);
      const runs = runsWithFridgeRemainder(remainderMm);

      const plan = planFor(room, runs);

      expect(bodiesOn(plan, "B")).toStrictEqual(["fridge-free@900-1600"]);
      expect(plan.remainderMm.B).toBe(remainderMm);
      expect(plan.fridgePosition).toBe("free-end");
      expect(uPlanFindings({ room, runs, plan })).toStrictEqual([]);
    },
  );

  it.each([
    [2098, ["fridge-free@900-1600"], 398],
    [2100, ["fridge-free@900-1600"], 400],
    [2298, ["fridge-free@900-1600"], 598],
    [2300, ["base-cabinet@900-1500", "fridge-free@1500-2200"], 0],
  ] as const)(
    "on shell runs, a %i mm fridge wall reads %j with %i mm bare at the free end",
    (sideMm, expected, bareMm) => {
      const plan = planFor(uRoom(3600, sideMm, sideMm));

      expect(bodiesOn(plan, "B")).toStrictEqual(expected);
      expect(plan.remainderMm.B).toBe(bareMm);
    },
  );
});

describe("the counted fridge's gap at the pantry's bounds (N3r 4, N11.4)", () => {
  it.each([
    [3298, 2600, [], 398],
    [3300, 2600, ["tall-pantry@2800-3200"], 0],
    [3498, 2600, ["tall-pantry@2800-3398"], 0],
    [3500, 2600, ["tall-pantry@2800-3400"], 0],
    [3500, 2200, ["tall-pantry@2800-3400"], 0],
    [3500, 2199, ["base-cabinet@2800-3400"], 0],
    [3498, 2199, [], 598],
  ] as const)(
    "B %i mm at h %i: past the fridge %j, %i mm bare",
    (depthMm, heightMm, beyond, bareMm) => {
      const plan = planFor(uRoom(3600, depthMm, 3200, heightMm));

      expect(bodiesOn(plan, "B")).toStrictEqual([
        "base-cabinet@900-1500",
        "base-cabinet@1500-2100",
        "fridge-free@2100-2800",
        ...beyond,
      ]);
      expect(plan.remainderMm.B).toBe(bareMm);
    },
  );

  it("N11.5's witness 3600 / 3500 / 2200: a door past the fridge and no tower at 2199, a pantry and the tower at 2200", () => {
    const low = planFor(uRoom(3600, 3500, 2200, 2199));
    const high = planFor(uRoom(3600, 3500, 2200, 2200));

    expect(bodiesOn(low, "B").at(-1)).toBe("base-cabinet@2800-3400");
    expect(low.bases.some((base) => base.buildId === "tall-oven-tower")).toBe(
      false,
    );
    expect(bodiesOn(high, "B").at(-1)).toBe("tall-pantry@2800-3400");
    expect(bodiesOn(high, "C")).toStrictEqual([
      "base-hob-2drawer@900-1500",
      "tall-oven-tower@1500-2100",
    ]);
  });
});

describe("N11.2 with RQ23: the space after a wall-A hob, where the far wall can take a drawer", () => {
  // 4400 / 4400 side walls: C holds drawer extras before its tower, so the room's count does not
  // fall when the bottle pushes one round the corner; only wall A's own count decides.
  it.each([
    [4799, ["base-bottle-cargo@3300-3600"]],
    [4800, ["base-panbank@3300-3900"]],
    [5099, ["base-panbank@3300-3900"]],
    [5100, ["base-bottle-cargo@3300-3600", "base-panbank@3600-4200"]],
  ] as const)("wall A %i mm reads hob, then %j", (widthMm, afterTheHob) => {
    const plan = planFor(uRoom(widthMm, 4400, 4400));

    expect(bodiesOn(plan, "A")).toStrictEqual([...WALL_A_CORE, ...afterTheHob]);
  });

  it("4800 / 4400 / 4400 is N11.5's witness: the drawer by the hob, C gives up a pan drawer and keeps its tower", () => {
    const plan = planFor(uRoom(4800, 4400, 4400));

    expect(bodiesOn(plan, "C")).toStrictEqual([
      "base-panbank@900-1500",
      "base-3drawer@1500-2100",
      "base-3drawer@2100-2700",
      "tall-oven-tower@2700-3300",
      "base-cabinet@3300-3900",
    ]);
  });
});

describe("RQ21 against RQ23 at 1200 mm after a wall-A hob", () => {
  it("5400 / 3400 / 3400: the far wall takes the displaced drawer, so the bottle stays (RQ23)", () => {
    const plan = planFor(uRoom(5400, 3400, 3400));

    expect(bodiesOn(plan, "A")).toStrictEqual([
      ...WALL_A_CORE,
      "base-bottle-cargo@3300-3600",
      "base-panbank@3600-4200",
      // The 300 mm at 4200-4500 stays bare in the composer; ADR 0167 D7's general pass fills it.
    ]);
    expect(bodiesOn(plan, "C")).toStrictEqual([
      "base-panbank@900-1500",
      "base-3drawer@1500-2100",
      "base-3drawer@2100-2700",
      "tall-oven-tower@2700-3300",
    ]);
  });

  it("5400 / 2000 / 2000: nothing can take the displaced drawer, so the bottle drops (RQ21)", () => {
    const plan = planFor(uRoom(5400, 2000, 2000));

    expect(bodiesOn(plan, "A")).toStrictEqual([
      ...WALL_A_CORE,
      "base-panbank@3300-3900",
      "base-3drawer@3900-4500",
    ]);
  });
});
