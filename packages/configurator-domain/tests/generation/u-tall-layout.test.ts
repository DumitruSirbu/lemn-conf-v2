// M7B U3a slice S2 — named-room unit coverage for the tall layout and the one oven: the fridge-wall
// pantry gap at every size (N3r 4, RQ13), the far wall's tower at its count from the corner or at
// its own free end (N3r 10, RQ5, RQ17), no pantry on a large U's far wall, and exactly one oven.
//
// Several cases below search a small swept band for a room with the geometry the rule under test
// needs, rather than a single hand-picked room: the fridge, the corner reach and the 100 mm reserve
// interact enough that a single guessed dimension is fragile, while a short, bounded search over the
// same production code is not — and every search throws with its own band if it finds nothing, so a
// premise failure reads as itself rather than as a silent pass.
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

function ovenBearingBases(plan: ReturnType<typeof planFor>) {
  return plan.bases.filter(
    (base) =>
      base.buildId === "tall-oven-tower" || base.buildId === "base-hob-oven",
  );
}

/** The fridge wall's own gap after a counted fridge, or `undefined` when the fridge was dropped or
 *  stands at the free end — there the bare remainder beyond it is never a gap to fill (ADR 0110
 *  N11.1). */
function fridgeGapMm(
  room: DesignRoom,
  plan: ReturnType<typeof planFor>,
): number | undefined {
  const fridgeWall: DesignWall =
    room.depthMm >= (room.wallCMm ?? 0) ? "B" : "C";
  const fridgeEndMm = basesOn(plan, fridgeWall).find(
    (base) => base.role === "fridge",
  )?.endMm;
  if (fridgeEndMm === undefined || plan.fridgePosition === "free-end") {
    return undefined;
  }
  return uShellFloorRuns(room)[fridgeWall].endMm - fridgeEndMm;
}

function roomWithGapIn(minMm: number, maxMm: number): DesignRoom {
  // wall C stays the shortest possible side wall throughout, so wall B — whose own entered length
  // this sweeps — is always the fridge wall and the gap varies with it alone.
  for (let depthMm = 1700; depthMm <= 6000; depthMm += 1) {
    const room = uRoom({ depthMm, wallCMm: 1000 });
    const gap = fridgeGapMm(room, planFor(room));
    if (gap !== undefined && gap >= minMm && gap <= maxMm) return room;
  }
  throw new Error(
    `premise: no room in the swept band gave a fridge-wall gap in [${String(minMm)}, ${String(maxMm)}]`,
  );
}

describe("the fridge-to-free-end gap (N3r 4, RQ13)", () => {
  it("stays bare under 400 mm", () => {
    const room = roomWithGapIn(0, 399);
    const plan = planFor(room);

    expect(
      basesOn(plan, "B").some((base) => base.buildId === "tall-pantry"),
    ).toBe(false);
  });

  it("takes one pantry at its own width for a 400-599 mm gap", () => {
    const room = roomWithGapIn(400, 599);
    const plan = planFor(room);
    const gap = fridgeGapMm(room, plan) ?? 0;
    const pantries = basesOn(plan, "B").filter(
      (base) => base.buildId === "tall-pantry",
    );

    expect(pantries).toHaveLength(1);
    expect(pantries[0]?.widthMm).toBe(gap);
    expect(plan.remainderMm.B).toBe(0);
  });

  it("fills a large gap with 600 mm pantries, the outermost widened to absorb the remainder", () => {
    const room = uRoom({ depthMm: 4700, wallCMm: 1200 }); // n = 3, a generous gap follows
    const plan = planFor(room);
    const pantries = basesOn(plan, "B").filter(
      (base) => base.buildId === "tall-pantry",
    );

    expect(pantries.length).toBeGreaterThan(1);
    expect(pantries.slice(0, -1).every((base) => base.widthMm === 600)).toBe(
      true,
    );
    expect(pantries.at(-1)?.widthMm).toBeGreaterThanOrEqual(600);
    expect(pantries.at(-1)?.widthMm).toBeLessThanOrEqual(800);
    expect(plan.remainderMm.B).toBeLessThan(600);
  });

  it("has no pantry gap on the fridge wall when the fridge was dropped", () => {
    const room = uRoom({ depthMm: 1000, wallCMm: 1000 });
    const plan = planFor(room);

    expect(plan.dropped).toContain("fridge");
    expect(plan.bases.some((base) => base.buildId === "tall-pantry")).toBe(
      false,
    );
  });
});

describe("the far wall's tower (N3r 10, RQ5)", () => {
  it("stands at its own free end on a far wall of 3000 mm or less, remainder bare beyond it", () => {
    const room = uRoom({ depthMm: 3600, wallCMm: 2200 }); // B fridge wall, C far wall ≤ 3000
    const plan = planFor(room);
    const onFar = basesOn(plan, "C");
    const towerIndex = onFar.findIndex(
      (base) => base.buildId === "tall-oven-tower",
    );
    if (towerIndex < 0) {
      throw new Error("premise: this far wall must compose a tower");
    }

    const lastEndMm = onFar.at(-1)?.endMm ?? 0;
    expect(uShellFloorRuns(room).C.endMm - lastEndMm).toBeLessThan(600);
  });

  it("stands after n counted bases from the corner on a far wall over 3000 mm", () => {
    const room = uRoom({ depthMm: 4600, wallCMm: 3600 }); // B fridge wall, C far wall > 3000 (n = 2)
    const plan = planFor(room);
    const onFar = basesOn(plan, "C");
    const towerIndex = onFar.findIndex(
      (base) => base.buildId === "tall-oven-tower",
    );
    if (towerIndex < 0) {
      throw new Error("premise: this far wall must compose a tower");
    }

    // Everything before the tower is a core role from the back wall's overflow or a plain counted
    // door base — never a pantry or the tower itself standing early.
    expect(
      onFar
        .slice(0, towerIndex)
        .every((base) => base.buildId !== "tall-pantry"),
    ).toBe(true);
    // ADR 0110 N10.3 step 4: `n` is a floor, so a drawer extra may stand before the tower and push it
    // to a third body. The tower still reports the category `n` (N3r 10).
    expect(towerIndex).toBeLessThanOrEqual(3);
    expect(plan.towerPosition).toBe(2);
  });

  it("stands with a bare remainder when a lone tower cannot merge with the free end (RQ17)", () => {
    // A room engineered so the far wall's own free-end block is exactly one leftover module with a
    // remainder that cannot merge into the door column's own bound — the same E6.2 dead end
    // `tall-end-rule.test.ts` witnesses for the L, reached here through a real U room.
    let found: { room: DesignRoom; remainderMm: number } | undefined;
    for (let wallCMm = 1600; wallCMm <= 2900 && !found; wallCMm += 1) {
      const room = uRoom({ depthMm: 4700, wallCMm });
      const plan = planFor(room);
      const onFar = basesOn(plan, "C");
      const tower = onFar.find((base) => base.buildId === "tall-oven-tower");
      if (!tower) continue;
      const isLoneTower =
        onFar.filter((base) => base.startMm >= tower.startMm).length === 1;
      if (isLoneTower && plan.remainderMm.C > 0) {
        found = { room, remainderMm: plan.remainderMm.C };
      }
    }
    if (!found) {
      throw new Error(
        "premise: no room in the swept band produced a lone tower with a bare remainder",
      );
    }

    expect(found.remainderMm).toBeGreaterThan(0);
    expect(found.remainderMm).toBeLessThan(600);
  });

  it("generates no pantry on a large U's far wall, though the fridge wall may still carry one", () => {
    const room = uRoom({ widthMm: 4000, depthMm: 4200, wallCMm: 3600 }); // total ≥ 10 000
    const plan = planFor(room);

    expect(
      basesOn(plan, "C").some((base) => base.buildId === "tall-pantry"),
    ).toBe(false);
  });
});

describe("exactly one oven (N3r 9, E4)", () => {
  it("keeps base-hob-oven and no tower when no tower stands", () => {
    const room = uRoom({ depthMm: 1500, wallCMm: 1000 }); // small U, no room for a tower
    const plan = planFor(room);
    if (plan.bases.some((base) => base.buildId === "tall-oven-tower")) {
      throw new Error("premise: this room must compose no tower");
    }

    expect(ovenBearingBases(plan)).toHaveLength(1);
    expect(plan.bases.find((base) => base.role === "hob")?.buildId).toBe(
      "base-hob-oven",
    );
  });

  it("swaps the hob to base-hob-2drawer wherever a tower stands", () => {
    const room = uRoom({ depthMm: 3600, wallCMm: 2200 });
    const plan = planFor(room);
    if (!plan.bases.some((base) => base.buildId === "tall-oven-tower")) {
      throw new Error("premise: this room must compose a tower");
    }

    expect(plan.bases.find((base) => base.role === "hob")?.buildId).toBe(
      "base-hob-2drawer",
    );
    expect(ovenBearingBases(plan)).toHaveLength(1);
  });
});
