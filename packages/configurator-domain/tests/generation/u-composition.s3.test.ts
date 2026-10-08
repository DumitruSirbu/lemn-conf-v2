// M7B U3a slice S3 — the drawer count, the bottle, and the A4 wall-A fill correction. The
// dishwasher's own M1 adjacency is not tested here: S1's construction places it directly beside the
// sink in the fixed reading order, so the leaf's own "find a door cabinet and convert it" search
// never runs — see this file's own note beside the dishwasher describe block for the full reasoning.
import { describe, expect, it } from "vitest";

import {
  basesOn,
  planFor,
  uRoomOverriding,
} from "../support/u-plan-fixtures.js";
import { isWallAFill } from "../support/u-plan-invariants.js";

/** The cabinets the drawer target counts: the hob's own drawers are not among them (RQ15). */
function drawerCabinetsOf(plan: ReturnType<typeof planFor>) {
  return plan.bases.filter(
    (base) =>
      base.buildId === "base-3drawer" || base.buildId === "base-panbank",
  );
}

describe("the drawer target N(T) (N3r 6, RQ6, RQ10)", () => {
  it("counts the preparation cabinet as the first unit, with no extra unit below the next band", () => {
    const room = uRoomOverriding({
      widthMm: 4600,
      depthMm: 1000,
      wallCMm: 1000,
    }); // T = 6600, N(T) = 3
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
    // T = 10 600, so N(T) = min(5, 3 + floor(5900 / 2000)) = 5, and the room has the door slots to reach it.
    const room = uRoomOverriding({
      widthMm: 6000,
      depthMm: 2400,
      wallCMm: 2200,
    });
    const plan = planFor(room);

    // All five stand beside a hob that has two drawers of its own: counted, the hob would leave four.
    expect(plan.bases.find((base) => base.role === "hob")?.buildId).toBe(
      "base-hob-2drawer",
    );
    expect(drawerCabinetsOf(plan)).toHaveLength(5);
  });

  it("adds extra drawer units, up to the target, once the total run passes T_min", () => {
    // A generous room with ample wall-A fill capacity for extra drawer units to land in.
    const room = uRoomOverriding({
      widthMm: 6000,
      depthMm: 2400,
      wallCMm: 2200,
    }); // T = 10 600
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
    // T = 8600, so N(T) = min(5, 3 + floor(3900 / 2000)) = 4, and no door slot stands after the hob to convert.
    const room = uRoomOverriding({
      widthMm: 4600,
      depthMm: 2000,
      wallCMm: 2000,
    });
    const plan = planFor(room);
    const hobIndex = plan.bases.findIndex((base) => base.role === "hob");

    // No throw, no refusal, and no body converted to make up the number: the preparation cabinet is the one
    // drawer cabinet, and the bottle and the tower after the hob are still themselves.
    expect(plan.minimumMet).toBe(true);
    expect(drawerCabinetsOf(plan).map((base) => base.role)).toEqual([
      "preparation",
    ]);
    expect(plan.bases.slice(hobIndex + 1).map((base) => base.buildId)).toEqual([
      "base-bottle-cargo",
      "tall-oven-tower",
    ]);
  });
});

// U3a's stop-and-report (AC2/AC3) and RQ18: extras never confine to wall A, and once RQ18 (b)
// answered, the extras split between the pan drawer and the 3-drawer rather than staying one body.
describe("extra drawer units cross the far corner and split pan/3-drawer (RQ18)", () => {
  it("never confines the extras to wall A when the target needs more than wall A can hold", () => {
    const room = uRoomOverriding({
      widthMm: 6000,
      depthMm: 6000,
      wallCMm: 6000,
    }); // T = 18 000, N(T) = 5
    const plan = planFor(room);
    const farWall =
      plan.bases.find((base) => base.role === "fridge")?.wall === "B"
        ? "C"
        : "B";

    const drawersOnFar = plan.bases.filter(
      (base) =>
        base.wall === farWall &&
        (base.buildId === "base-3drawer" || base.buildId === "base-panbank"),
    );

    expect(drawersOnFar.length).toBeGreaterThan(0);
  });

  it("never places an extra on the fridge wall — it stands before the sink in run order", () => {
    const room = uRoomOverriding({
      widthMm: 6000,
      depthMm: 6000,
      wallCMm: 6000,
    });
    const plan = planFor(room);
    const fridgeWall = plan.bases.find((base) => base.role === "fridge")?.wall;

    expect(
      basesOn(plan, fridgeWall ?? "B").some(
        (base) =>
          base.buildId === "base-3drawer" || base.buildId === "base-panbank",
      ),
    ).toBe(false);
  });

  it("takes the pan drawer first, nearest the hob, up to floor(N/2), before any 3-drawer extra", () => {
    const room = uRoomOverriding({
      widthMm: 6000,
      depthMm: 6000,
      wallCMm: 6000,
    }); // N(T) = 5
    const plan = planFor(room);
    const onA = basesOn(plan, "A").filter((base) => !isWallAFill(base));
    const hobIndex = onA.findIndex((base) => base.role === "hob");
    const afterHobOnA = onA.slice(hobIndex + 1);

    // The bottle, then the pan drawers nearest the hob (N3r 6's own table: floor(5/2) = 2 on this
    // room's own T), before any 3-drawer extra reaches wall A at all.
    expect(afterHobOnA.map((base) => base.buildId)).toStrictEqual([
      "base-bottle-cargo",
      "base-panbank",
      "base-panbank",
    ]);
  });

  it("keeps the preparation cabinet as base-3drawer, never converted to a pan drawer", () => {
    const room = uRoomOverriding({
      widthMm: 6000,
      depthMm: 6000,
      wallCMm: 6000,
    });
    const plan = planFor(room);
    const preparation = plan.bases.find((base) => base.role === "preparation");

    expect(preparation?.buildId).toBe("base-3drawer");
  });
});

describe("the plan's own position field for the fridge and the tower (AC3)", () => {
  it("reads 'free-end' for a fridge wall at or under 3000 mm entered", () => {
    const room = uRoomOverriding({ depthMm: 3000, wallCMm: 1200 });
    const plan = planFor(room);

    expect(plan.fridgePosition).toBe("free-end");
  });

  it("reads the counted-from-corner number above 3000 mm entered", () => {
    const room = uRoomOverriding({ depthMm: 3600, wallCMm: 1200 });
    const plan = planFor(room);

    expect(plan.fridgePosition).toBe(2);
  });

  it("is undefined when the fridge was dropped", () => {
    const room = uRoomOverriding({ depthMm: 1000, wallCMm: 1000 });
    const plan = planFor(room);

    expect(plan.dropped).toContain("fridge");
    expect(plan.fridgePosition).toBeUndefined();
  });

  it("reads the tower's own position, or undefined when the hob keeps its own oven", () => {
    const withTower = planFor(
      uRoomOverriding({ depthMm: 3600, wallCMm: 2200 }),
    );
    const withoutTower = planFor(
      uRoomOverriding({ widthMm: 3000, depthMm: 1000, wallCMm: 1000 }),
    );

    expect(withTower.towerPosition).not.toBeUndefined();
    expect(
      withoutTower.bases.some((base) => base.buildId === "tall-oven-tower"),
    ).toBe(false);
    expect(withoutTower.towerPosition).toBeUndefined();
  });
});

describe("the bottle, the next cabinet after the hob (N3r 7, RQ16)", () => {
  it("stands as the first item of wall A's own A4 fill, when there is one and no drawer cabinet outranks it", () => {
    // ADR 0110 N10.3 step 5 (RQ21): at 6000 / 2400 / 2200 a pan drawer takes the bottle's place, so
    // the bottle is exercised where wall A's free run holds it and no drawer cabinet is owed more.
    const room = uRoomOverriding({
      widthMm: 4000,
      depthMm: 4500,
      wallCMm: 1200,
    });
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
    const room = uRoomOverriding();
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
    const room = uRoomOverriding({
      widthMm: 6000,
      depthMm: 2400,
      wallCMm: 2200,
    });
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
    const room = uRoomOverriding();
    const plan = planFor(room);
    const sinkWall = plan.bases.find((base) => base.role === "sink")?.wall;
    const onSinkWall = basesOn(plan, sinkWall ?? "A");
    const sinkIndex = onSinkWall.findIndex((base) => base.role === "sink");

    expect(onSinkWall[sinkIndex + 1]?.buildId).toBe("base-dishwasher");
  });
});
