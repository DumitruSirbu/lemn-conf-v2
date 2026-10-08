// M7B U3a slice S1 — named-room and hand-built unit coverage for `planUKitchenComposition`'s core
// run: the fridge wall and its counted placement, the back wall packed from the fridge corner with
// overflow, and the RQ9 fallback ADR 0123 asks to be kept as a declared witness even though it never
// fires on any orderable room (`u-composition.ts`'s own proof, restated in its head comment).
import { describe, expect, it } from "vitest";

import { uShellFloorRuns, type DesignWall } from "../../src/index.js";
import { absorbedByTheOwnersRuleMm } from "../support/fridge-end-leftover.js";
import {
  isLargeU,
  planUKitchenComposition,
  type UGenerationRun,
} from "../../src/generation/u-composition.js";
import {
  basesOn,
  DECLARED_COLUMNS,
  planFor,
  uRoomOverriding,
} from "../support/u-plan-fixtures.js";

describe("LARGE_U_TOTAL_MM and isLargeU", () => {
  it("reads the three entered walls, never a free-run capacity", () => {
    const atTheThreshold = uRoomOverriding({
      widthMm: 4000,
      depthMm: 3000,
      wallCMm: 3000,
    });
    const justUnder = uRoomOverriding({
      widthMm: 3999,
      depthMm: 3000,
      wallCMm: 3000,
    });

    expect(isLargeU(atTheThreshold)).toBe(true);
    expect(isLargeU(justUnder)).toBe(false);
  });
});

describe("the fridge wall (N3r 2)", () => {
  it("stands on wall B when B is wider", () => {
    const plan = planFor(uRoomOverriding({ depthMm: 3600, wallCMm: 2200 }));

    expect(basesOn(plan, "B").some((base) => base.role === "fridge")).toBe(
      true,
    );
    expect(basesOn(plan, "C").some((base) => base.role === "fridge")).toBe(
      false,
    );
  });

  it("stands on wall C when C is wider", () => {
    const plan = planFor(uRoomOverriding({ depthMm: 2200, wallCMm: 3600 }));

    expect(basesOn(plan, "C").some((base) => base.role === "fridge")).toBe(
      true,
    );
    expect(basesOn(plan, "B").some((base) => base.role === "fridge")).toBe(
      false,
    );
  });

  it("stands on wall B when the two side walls are equal", () => {
    const plan = planFor(uRoomOverriding({ depthMm: 3000, wallCMm: 3000 }));

    expect(basesOn(plan, "B").some((base) => base.role === "fridge")).toBe(
      true,
    );
  });

  it("is dropped when neither side wall holds it, and the back wall still composes", () => {
    const room = uRoomOverriding({ depthMm: 1000, wallCMm: 1000 });
    const plan = planFor(room);

    expect(plan.bases.some((base) => base.role === "fridge")).toBe(false);
    expect(plan.dropped).toContain("fridge");
    expect(plan.minimumMet).toBe(true);
  });

  // ADR 0123's declared witness: the RQ9 fallback (try the other side wall, drop only if neither
  // fits) provably never fires through `uShellFloorRuns`'s own "entered − 1000" formula — the wider
  // wall by entered length is always the wider wall by free-run capacity too, so a fabricated `runs`
  // record, not a real shell's, is the only way to exercise it.
  it("falls back to the other side wall when a hand-built run makes the wider one too short (ADR 0123)", () => {
    const room = uRoomOverriding({ depthMm: 3600, wallCMm: 2200 }); // B wider by entered length
    const runs: Readonly<Record<DesignWall, UGenerationRun>> = {
      ...uShellFloorRuns(room),
      B: { wall: "B", startMm: 900, endMm: 950 }, // fabricated: 50 mm free run, too short for the fridge
    };

    const plan = planUKitchenComposition({
      room,
      runs,
      columns: DECLARED_COLUMNS,
    });

    expect(basesOn(plan, "C").some((base) => base.role === "fridge")).toBe(
      true,
    );
    expect(basesOn(plan, "B").some((base) => base.role === "fridge")).toBe(
      false,
    );
    expect(plan.dropped).not.toContain("fridge");
  });
});

// ADR 0110 N9.2: a dropped fridge leaves its wall's free run to A4, which forbids a bare run end of
// 600 mm or more — so the wall takes door bases from its corner and the remainder (< 600 mm) stays at
// the free end. These bases stand before the sink in run order, so none is ever a drawer unit.
describe("the dropped fridge's wall (N9.2)", () => {
  const DRAWER_UNIT_BUILD_IDS = ["base-3drawer", "base-panbank"];

  it.each([
    {
      name: "2700 / 1600 / 1600: wall B, one door base filling the 600 mm run",
      room: uRoomOverriding({ widthMm: 2700, depthMm: 1600, wallCMm: 1600 }),
      wall: "B" as const,
      remainderMm: 0,
    },
    {
      name: "3000 / 1000 / 1600: wall C (the wider), one door base filling the 600 mm run",
      room: uRoomOverriding({ widthMm: 3000, depthMm: 1000, wallCMm: 1600 }),
      wall: "C" as const,
      remainderMm: 0,
    },
    {
      name: "3000 / 1690 / 1690: wall B, one door base and a 90 mm bare end",
      room: uRoomOverriding({ widthMm: 3000, depthMm: 1690, wallCMm: 1690 }),
      wall: "B" as const,
      remainderMm: 90,
    },
  ])("$name", ({ room, wall, remainderMm }) => {
    const plan = planFor(room);
    const run = uShellFloorRuns(room)[wall];
    const onWall = basesOn(plan, wall);

    expect(plan.dropped).toContain("fridge");
    expect(onWall).toHaveLength(1);
    expect(onWall[0]?.buildId).toBe("base-cabinet");
    expect(onWall[0]?.startMm).toBe(run.startMm);
    expect(plan.remainderMm[wall]).toBe(remainderMm);
  });

  it("pins the first witness's own run, 900 to 1500 mm", () => {
    const room = uRoomOverriding({
      widthMm: 2700,
      depthMm: 1600,
      wallCMm: 1600,
    });
    const onB = basesOn(planFor(room), "B");

    expect([onB[0]?.startMm, onB[0]?.endMm]).toStrictEqual([900, 1500]);
  });

  it("never makes a fridge-wall body a drawer unit, however many drawer units the room is owed", () => {
    const room = uRoomOverriding({
      widthMm: 6000,
      depthMm: 1699,
      wallCMm: 1699,
    });
    const plan = planFor(room);
    const onFridgeWall = basesOn(plan, "B");

    expect(plan.dropped).toContain("fridge");
    expect(onFridgeWall.length).toBeGreaterThan(0);
    expect(
      onFridgeWall.some((base) => DRAWER_UNIT_BUILD_IDS.includes(base.buildId)),
    ).toBe(false);
  });
});

describe("the fridge's own count from the corner (N3r 3)", () => {
  it("stands last on its wall, after door storage from the corner, at 3000 mm or less (N11.1)", () => {
    const plan = planFor(uRoomOverriding({ depthMm: 3000, wallCMm: 1200 }));
    const onB = basesOn(plan, "B");
    const fridgeIndex = onB.findIndex((base) => base.role === "fridge");
    const runB = uShellFloorRuns(plan.room).B;
    const fridge = onB[fridgeIndex];

    expect(fridgeIndex).toBe(onB.length - 1);
    // M7C wave C5 S2 (the owner's Q6): the leftover beyond the fridge, worked out from the run's end alone, goes
    // to the cabinet beside it in whole steps, and the fridge stands that far past its counted start.
    const countedStartMm = runB.startMm + fridgeIndex * 600;
    const leftoverMm = runB.endMm - (countedStartMm + 700);
    const movedMm = absorbedByTheOwnersRuleMm({
      leftoverMm,
      cabinetWidthMm: 600,
    });
    expect(fridge?.startMm).toBe(countedStartMm + movedMm);
    expect(onB[fridgeIndex - 1]?.widthMm).toBe(600 + movedMm);
    expect(runB.endMm - (fridge?.endMm ?? 0)).toBeLessThan(600);
  });

  it("stands after exactly 2 storage bases from the corner, at 3001-4000 mm", () => {
    const plan = planFor(uRoomOverriding({ depthMm: 3600, wallCMm: 1200 }));
    const onB = basesOn(plan, "B");
    const fridgeIndex = onB.findIndex((base) => base.role === "fridge");

    expect(fridgeIndex).toBe(2);
    expect(onB.slice(0, 2).every((base) => base.role === "storage")).toBe(true);
  });

  it("stands after exactly 3 storage bases from the corner, above 4000 mm", () => {
    const plan = planFor(uRoomOverriding({ depthMm: 4200, wallCMm: 1200 }));
    const onB = basesOn(plan, "B");
    const fridgeIndex = onB.findIndex((base) => base.role === "fridge");

    expect(fridgeIndex).toBe(3);
    expect(onB.slice(0, 3).every((base) => base.role === "storage")).toBe(true);
  });

  it("fills the fridge-to-free-end gap with tall-pantry columns on a long fridge wall (N3r 4, RQ13)", () => {
    const room = uRoomOverriding({ depthMm: 4200, wallCMm: 1200 });
    const plan = planFor(room);
    const onB = basesOn(plan, "B");
    const fridgeIndex = onB.findIndex((base) => base.role === "fridge");
    const afterFridge = onB.slice(fridgeIndex + 1);

    expect(afterFridge.length).toBeGreaterThan(0);
    expect(afterFridge.every((base) => base.buildId === "tall-pantry")).toBe(
      true,
    );
    // A4, as everywhere else: what the pantries cannot absorb is bare, and less than one module.
    expect(plan.remainderMm.B).toBeLessThan(600);
    expect(plan.remainderMm.B).toBeGreaterThanOrEqual(0);
  });
});

/** The item nearest the fridge corner on wall A — reading order's own first item — which sits at
 *  the *smallest* `startMm` when the fridge is on wall B (reading increases from wall A's own
 *  start) and at the *largest* `endMm` when the fridge is on wall C (reading runs the other way,
 *  the same "prefix wall reversed" shape `generation-priorities.ts` already reads a wall in for the
 *  L). Physical, `startMm`-ascending order is the wrong axis to read "first" off for a wall A whose
 *  reading direction this plan reversed. */
function firstInReadingOrderOnA(
  plan: ReturnType<typeof planFor>,
  fridgeWall: DesignWall,
) {
  const onA = basesOn(plan, "A");
  return fridgeWall === "B"
    ? onA[0]
    : onA.reduce<(typeof onA)[number] | undefined>(
        (nearest, base) =>
          nearest === undefined || base.endMm > nearest.endMm ? base : nearest,
        undefined,
      );
}

describe("the back wall packed from the fridge corner, with overflow (N3r 5)", () => {
  it("packs sink, dishwasher, preparation, hob in reading order when wall A holds all four", () => {
    const room = uRoomOverriding({
      widthMm: 6000,
      depthMm: 2400,
      wallCMm: 2200,
    });
    const capacityA = uShellFloorRuns(room).A;
    if (capacityA.endMm - capacityA.startMm < 2400) {
      throw new Error("premise: wall A must hold all four 600 mm core items");
    }

    const plan = planFor(room);
    const onA = basesOn(plan, "A");

    // The first four are the fixed core; wall A's own remainder past the hob is the A4 correction
    // (S3) — filled with storage, never asserted empty here, since that is this room's own capacity.
    expect(onA.slice(0, 4).map((base) => base.role)).toStrictEqual([
      "sink",
      "storage",
      "preparation",
      "hob",
    ]);
    expect(onA[1]?.buildId).toBe("base-dishwasher");
    expect(onA.slice(4).every((base) => base.role === "storage")).toBe(true);
  });

  it("puts the sink first in reading order on wall A, whichever side wall carries the fridge", () => {
    const withFridgeOnB = planFor(
      uRoomOverriding({ depthMm: 3600, wallCMm: 2200 }),
    );
    const withFridgeOnC = planFor(
      uRoomOverriding({ depthMm: 2200, wallCMm: 3600 }),
    );

    expect(firstInReadingOrderOnA(withFridgeOnB, "B")?.role).toBe("sink");
    expect(firstInReadingOrderOnA(withFridgeOnC, "C")?.role).toBe("sink");
  });

  it("continues round the far corner when wall A runs out, in the same reading order", () => {
    const room = uRoomOverriding();
    const capacityA = uShellFloorRuns(room).A;
    if (capacityA.endMm - capacityA.startMm >= 2400) {
      throw new Error(
        "premise: wall A must NOT hold all four 600 mm core items",
      );
    }

    const plan = planFor(room);

    expect(
      plan.bases.some((base) => base.role === "hob" && base.wall === "C"),
    ).toBe(true);
    expect(plan.dropped).not.toContain("preparation");
    expect(plan.bases.some((base) => base.buildId === "base-dishwasher")).toBe(
      true,
    );
  });

  it("drops the dishwasher first when the run still does not fit, keeping the preparation cabinet", () => {
    const room = uRoomOverriding({
      widthMm: 3600,
      depthMm: 3600,
      wallCMm: 1000,
    });
    const capacityA = uShellFloorRuns(room).A;
    const capacityFar = uShellFloorRuns(room).C;
    const combinedMm =
      capacityA.endMm -
      capacityA.startMm +
      (capacityFar.endMm - capacityFar.startMm);
    if (combinedMm < 1800 || combinedMm >= 2400) {
      throw new Error(
        `premise: this room's combined back-wall capacity must sit in [1800, 2400) to exercise the dishwasher-only drop, got ${String(combinedMm)}`,
      );
    }

    const plan = planFor(room);

    expect(plan.bases.some((base) => base.buildId === "base-dishwasher")).toBe(
      false,
    );
    expect(plan.bases.some((base) => base.role === "preparation")).toBe(true);
    expect(plan.minimumMet).toBe(true);
  });
});

describe("determinism", () => {
  it("gives the same input a byte-identical plan", () => {
    const room = uRoomOverriding();
    const first = JSON.stringify(planFor(room));
    const second = JSON.stringify(planFor(room));

    expect(second).toBe(first);
  });
});
