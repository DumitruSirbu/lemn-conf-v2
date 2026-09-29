// M7B U3a slice S1 — named-room and hand-built unit coverage for `planUKitchenComposition`'s core
// run: the fridge wall and its counted placement, the back wall packed from the fridge corner with
// overflow, and the RQ9 fallback ADR 0123 asks to be kept as a declared witness even though it never
// fires on any orderable room (`u-composition.ts`'s own proof, restated in its head comment).
import { describe, expect, it } from "vitest";

import {
  uShellFloorRuns,
  type DesignRoom,
  type DesignWall,
} from "../../src/index.js";
import {
  LARGE_U_TOTAL_MM,
  isLargeU,
  planUKitchenComposition,
  type UGenerationRun,
} from "../../src/generation/u-composition.js";

function uRoom(overrides: Partial<DesignRoom> = {}): DesignRoom {
  return {
    shape: "U",
    widthMm: 3600,
    depthMm: 2400,
    wallCMm: 2200,
    heightMm: 2600,
    ...overrides,
  };
}

function runsOf(
  room: DesignRoom,
): Readonly<Record<DesignWall, UGenerationRun>> {
  return uShellFloorRuns(room);
}

function planFor(room: DesignRoom) {
  return planUKitchenComposition({ room, runs: runsOf(room) });
}

function basesOn(plan: ReturnType<typeof planFor>, wall: DesignWall) {
  return plan.bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm);
}

describe("LARGE_U_TOTAL_MM and isLargeU", () => {
  it("is the owner's 10 m threshold", () => {
    expect(LARGE_U_TOTAL_MM).toBe(10_000);
  });

  it("reads the three entered walls, never a free-run capacity", () => {
    const atTheThreshold = uRoom({
      widthMm: 4000,
      depthMm: 3000,
      wallCMm: 3000,
    });
    const justUnder = uRoom({ widthMm: 3999, depthMm: 3000, wallCMm: 3000 });

    expect(isLargeU(atTheThreshold)).toBe(true);
    expect(isLargeU(justUnder)).toBe(false);
  });
});

describe("the fridge wall (N3r 2)", () => {
  it("stands on wall B when B is wider", () => {
    const plan = planFor(uRoom({ depthMm: 3600, wallCMm: 2200 }));

    expect(basesOn(plan, "B").some((base) => base.role === "fridge")).toBe(
      true,
    );
    expect(basesOn(plan, "C").some((base) => base.role === "fridge")).toBe(
      false,
    );
  });

  it("stands on wall C when C is wider", () => {
    const plan = planFor(uRoom({ depthMm: 2200, wallCMm: 3600 }));

    expect(basesOn(plan, "C").some((base) => base.role === "fridge")).toBe(
      true,
    );
    expect(basesOn(plan, "B").some((base) => base.role === "fridge")).toBe(
      false,
    );
  });

  it("stands on wall B when the two side walls are equal", () => {
    const plan = planFor(uRoom({ depthMm: 3000, wallCMm: 3000 }));

    expect(basesOn(plan, "B").some((base) => base.role === "fridge")).toBe(
      true,
    );
  });

  it("is dropped when neither side wall holds it, and the back wall still composes", () => {
    const room = uRoom({ depthMm: 1000, wallCMm: 1000 });
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
    const room = uRoom({ depthMm: 3600, wallCMm: 2200 }); // B wider by entered length
    const runs: Readonly<Record<DesignWall, UGenerationRun>> = {
      ...runsOf(room),
      B: { wall: "B", startMm: 900, endMm: 950 }, // fabricated: 50 mm free run, too short for the fridge
    };

    const plan = planUKitchenComposition({ room, runs });

    expect(basesOn(plan, "C").some((base) => base.role === "fridge")).toBe(
      true,
    );
    expect(basesOn(plan, "B").some((base) => base.role === "fridge")).toBe(
      false,
    );
    expect(plan.dropped).not.toContain("fridge");
  });
});

describe("the fridge's own count from the corner (N3r 3)", () => {
  it("stands at the free end with no cabinets from the corner, at 3000 mm or less", () => {
    const plan = planFor(uRoom({ depthMm: 3000, wallCMm: 1200 }));
    const onB = basesOn(plan, "B");
    const fridgeIndex = onB.findIndex((base) => base.role === "fridge");

    expect(fridgeIndex).toBe(onB.length - 1);
    expect(onB[fridgeIndex]?.endMm).toBe(
      runsOf(planFor(uRoom({ depthMm: 3000, wallCMm: 1200 })).room).B.endMm,
    );
  });

  it("stands after exactly 2 storage bases from the corner, at 3001-4000 mm", () => {
    const plan = planFor(uRoom({ depthMm: 3600, wallCMm: 1200 }));
    const onB = basesOn(plan, "B");
    const fridgeIndex = onB.findIndex((base) => base.role === "fridge");

    expect(fridgeIndex).toBe(2);
    expect(onB.slice(0, 2).every((base) => base.role === "storage")).toBe(true);
  });

  it("stands after exactly 3 storage bases from the corner, above 4000 mm", () => {
    const plan = planFor(uRoom({ depthMm: 4200, wallCMm: 1200 }));
    const onB = basesOn(plan, "B");
    const fridgeIndex = onB.findIndex((base) => base.role === "fridge");

    expect(fridgeIndex).toBe(3);
    expect(onB.slice(0, 3).every((base) => base.role === "storage")).toBe(true);
  });

  it("leaves the fridge-to-free-end gap as remainderMm on a long fridge wall, unfilled by S1", () => {
    const room = uRoom({ depthMm: 4200, wallCMm: 1200 });
    const plan = planFor(room);
    const onB = basesOn(plan, "B");
    const lastMm = onB.at(-1)?.endMm ?? 0;

    expect(plan.remainderMm.B).toBe(runsOf(room).B.endMm - lastMm);
    expect(plan.remainderMm.B).toBeGreaterThan(0);
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
    const room = uRoom({ widthMm: 6000, depthMm: 2400, wallCMm: 2200 });
    const capacityA = uShellFloorRuns(room).A;
    if (capacityA.endMm - capacityA.startMm < 2400) {
      throw new Error("premise: wall A must hold all four 600 mm core items");
    }

    const plan = planFor(room);
    const onA = basesOn(plan, "A");

    expect(onA.map((base) => base.role)).toStrictEqual([
      "sink",
      "storage",
      "preparation",
      "hob",
    ]);
    expect(onA[1]?.buildId).toBe("base-dishwasher");
  });

  it("puts the sink first in reading order on wall A, whichever side wall carries the fridge", () => {
    const withFridgeOnB = planFor(uRoom({ depthMm: 3600, wallCMm: 2200 }));
    const withFridgeOnC = planFor(uRoom({ depthMm: 2200, wallCMm: 3600 }));

    expect(firstInReadingOrderOnA(withFridgeOnB, "B")?.role).toBe("sink");
    expect(firstInReadingOrderOnA(withFridgeOnC, "C")?.role).toBe("sink");
  });

  it("continues round the far corner when wall A runs out, in the same reading order", () => {
    const room = uRoom();
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
    const room = uRoom({ widthMm: 3600, depthMm: 3600, wallCMm: 1000 });
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
    const room = uRoom();
    const first = JSON.stringify(planFor(room));
    const second = JSON.stringify(planFor(room));

    expect(second).toBe(first);
  });
});
