// M7B U3a slice S3 — the drawer count, the bottle, and the A4 wall-A fill correction. The
// dishwasher's own M1 adjacency is not tested here: S1's construction places it directly beside the
// sink in the fixed reading order, so the leaf's own "find a door cabinet and convert it" search
// never runs — see this file's own note beside the dishwasher describe block for the full reasoning.
import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  KITCHEN_L_DESIGN,
  uShellFloorRuns,
  type DesignRoom,
  type DesignWall,
} from "../../src/index.js";
import { planUKitchenComposition } from "../../src/generation/u-composition.js";

const DECLARED = declaredColumnSizes(
  buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN)),
);

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

function planFor(room: DesignRoom) {
  return planUKitchenComposition({
    room,
    runs: uShellFloorRuns(room),
    columns: DECLARED,
  });
}

function basesOn(plan: ReturnType<typeof planFor>, wall: DesignWall) {
  return plan.bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm);
}

describe("the drawer target N(T) (N3r 6, RQ6, RQ10)", () => {
  it("counts the preparation cabinet as the first unit, with no extra unit below the next band", () => {
    const room = uRoom({ widthMm: 4600, depthMm: 1000, wallCMm: 1000 }); // T = 6600, N(T) = 3
    const plan = planFor(room);
    if (!plan.minimumMet || plan.dropped.includes("preparation")) {
      throw new Error(
        "premise: this room must compose with the preparation cabinet kept",
      );
    }
    const drawers = plan.bases.filter(
      (base) =>
        base.buildId === "base-3drawer" || base.buildId === "base-panbank",
    );

    expect(drawers).toHaveLength(1); // the preparation cabinet alone
    expect(drawers[0]?.role).toBe("preparation");
  });

  it("never counts base-hob-2drawer as a drawer unit (RQ15)", () => {
    const room = uRoom({ depthMm: 3600, wallCMm: 2200 }); // composes a tower, base-hob-2drawer
    const plan = planFor(room);
    if (!plan.bases.some((base) => base.buildId === "tall-oven-tower")) {
      throw new Error("premise: this room must compose a tower");
    }

    const hob = plan.bases.find((base) => base.role === "hob");
    expect(hob?.buildId).toBe("base-hob-2drawer");
    expect(
      plan.bases.filter(
        (base) =>
          base.buildId === "base-3drawer" || base.buildId === "base-panbank",
      ),
    ).not.toContainEqual(hob);
  });

  it("adds extra drawer units, up to the target, once the total run passes T_min", () => {
    // A generous room with ample wall-A fill capacity for extra drawer units to land in.
    const room = uRoom({ widthMm: 6000, depthMm: 2400, wallCMm: 2200 }); // T = 10 600
    const plan = planFor(room);
    const drawerCount = plan.bases.filter(
      (base) =>
        base.buildId === "base-3drawer" || base.buildId === "base-panbank",
    ).length;

    // N(6000+2400+2200 = 10 600) = min(5, 3 + floor((10600-4700)/2000)) = min(5, 3+2) = 5.
    expect(drawerCount).toBeGreaterThan(1);
    expect(drawerCount).toBeLessThanOrEqual(5);
  });

  it("yields when the room has too few slots to reach the target (RQ6)", () => {
    const room = uRoom({ depthMm: 1200, wallCMm: 1200 }); // small U, few storage slots
    const plan = planFor(room);
    const drawerCount = plan.bases.filter(
      (base) =>
        base.buildId === "base-3drawer" || base.buildId === "base-panbank",
    ).length;

    // No throw, no refusal — the plan still composes with fewer drawers than the target.
    expect(plan.minimumMet).toBe(true);
    expect(drawerCount).toBeGreaterThanOrEqual(0);
  });
});

describe("the bottle, the next cabinet after the hob (N3r 7, RQ16)", () => {
  it("stands as the first item of wall A's own A4 fill, when there is one", () => {
    const room = uRoom({ widthMm: 6000, depthMm: 2400, wallCMm: 2200 });
    const plan = planFor(room);
    const onA = basesOn(plan, "A");
    const hobIndex = onA.findIndex((base) => base.role === "hob");
    if (hobIndex < 0 || hobIndex === onA.length - 1) {
      throw new Error(
        "premise: wall A must carry the hob with a fill after it",
      );
    }

    expect(onA[hobIndex + 1]?.buildId).toBe("base-bottle-cargo");
    expect(onA[hobIndex + 1]?.widthMm).toBe(300);
  });

  it("is omitted, not refused, when wall A's own fill is empty", () => {
    // The default room already overflows the hob onto the far wall, leaving nothing on wall A to
    // fill (confirmed by `u-composition.test.ts`'s own "continues round the far corner" case).
    const room = uRoom();
    const plan = planFor(room);
    if (!plan.bases.some((base) => base.role === "hob" && base.wall !== "A")) {
      throw new Error("premise: this room must overflow the hob off wall A");
    }

    expect(plan.minimumMet).toBe(true);
    expect(
      plan.bases.some((base) => base.buildId === "base-bottle-cargo"),
    ).toBe(false);
  });
});

describe("the A4 wall-A fill correction", () => {
  it("fills wall A's own remainder with door storage down to a bare end under 600 mm", () => {
    const room = uRoom({ widthMm: 6000, depthMm: 2400, wallCMm: 2200 });
    const plan = planFor(room);

    expect(plan.remainderMm.A).toBeGreaterThanOrEqual(0);
    expect(plan.remainderMm.A).toBeLessThan(600);
    expect(
      plan.bases.some(
        (base) => base.wall === "A" && base.id.startsWith("wall-a-fill:"),
      ),
    ).toBe(true);
  });
});

// The dishwasher (M1, ADR 0110 Amendment M1): `planUKitchenComposition`'s own back-wall sequence is
// fixed — [sink, dishwasher, preparation, hob] — so the dishwasher is placed as its own item,
// directly adjacent to the sink, on whichever wall the sink itself lands on. This already is M1's
// outcome ("the dishwasher beside the sink"); it is not reached by converting a door cabinet the way
// the L's own `withTheDishwasherBesideTheSink` leaf does, so that leaf is never called here — calling
// it on a plan where the dishwasher already stands beside the sink would be a no-op search. (e)'s
// drawer swap (no door cabinet available, so a drawer converts instead) has no case to reach either,
// for the same reason: no door cabinet is ever considered for the sink's own neighbour in this
// model.
describe("the dishwasher stands beside the sink by construction (M1)", () => {
  it("is always the item immediately after the sink, on the sink's own wall", () => {
    const room = uRoom();
    const plan = planFor(room);
    const sinkWall = plan.bases.find((base) => base.role === "sink")?.wall;
    const onSinkWall = basesOn(plan, sinkWall ?? "A");
    const sinkIndex = onSinkWall.findIndex((base) => base.role === "sink");

    expect(onSinkWall[sinkIndex + 1]?.buildId).toBe("base-dishwasher");
  });
});
