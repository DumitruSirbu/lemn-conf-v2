// M7B U3a AC2 — the model's seven witnesses (ADR 0110 N4′, corrected 2026-09-29 on U3a's
// stop-and-report, then again on RQ18's answer). Each room is read exactly as N4′ reads it: bodies
// per wall, from the corner outward. This file is the regression pin `docs/milestones/M7B-u-shaped-
// rooms.md` U3a-AC2 asks for; a diff here is either a rule change the architect must adjudicate, or
// a bug in this plan.
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

function uRoom(widthMm: number, depthMm: number, wallCMm: number): DesignRoom {
  return { shape: "U", widthMm, depthMm, wallCMm, heightMm: 2600 };
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
    .sort((left, right) => left.startMm - right.startMm)
    .map((base) => ({ role: base.role, buildId: base.buildId }));
}

describe("N4′'s seven witnesses (U3a AC2)", () => {
  it("2700 / 1000 / 1000: refused (minimum kitchen)", () => {
    const plan = planFor(uRoom(2700, 1000, 1000));

    expect(plan.minimumMet).toBe(false);
  });

  it("3000 / 1000 / 1000: no fridge, A: sink, base-hob-oven, no tower", () => {
    const plan = planFor(uRoom(3000, 1000, 1000));

    expect(plan.minimumMet).toBe(true);
    expect(plan.dropped).toContain("fridge");
    expect(basesOn(plan, "A")).toStrictEqual([
      { role: "sink", buildId: "base-sink" },
      { role: "hob", buildId: "base-hob-oven" },
    ]);
    expect(plan.towerPosition).toBeUndefined();
  });

  it("3600 / 2400 / 2000: B fridge (bare 100), A core, C hob + bottle (bare 100), no tower", () => {
    const plan = planFor(uRoom(3600, 2400, 2000));

    expect(basesOn(plan, "B")).toStrictEqual([
      { role: "storage", buildId: "base-cabinet" },
      { role: "fridge", buildId: "fridge-free" },
    ]);
    expect(plan.remainderMm.B).toBe(100);
    expect(basesOn(plan, "A")).toStrictEqual([
      { role: "sink", buildId: "base-sink" },
      { role: "storage", buildId: "base-dishwasher" },
      { role: "preparation", buildId: "base-3drawer" },
    ]);
    // ADR 0110 N9.3: with no tall column on the far wall and 400 mm after the hob, the bottle stands
    // directly after the hob; N4′ read C as the hob alone with 400 mm bare before that ruling.
    expect(basesOn(plan, "C")).toStrictEqual([
      { role: "hob", buildId: "base-hob-oven" },
      { role: "storage", buildId: "base-bottle-cargo" },
    ]);
    expect(plan.remainderMm.C).toBe(100);
    expect(plan.towerPosition).toBeUndefined();
  });

  it("3600 / 3500 / 2200: B 2-from-corner fridge + pantry, A core, C hob + tower at the free end", () => {
    const plan = planFor(uRoom(3600, 3500, 2200));

    expect(basesOn(plan, "B")).toStrictEqual([
      { role: "storage", buildId: "base-cabinet" },
      { role: "storage", buildId: "base-cabinet" },
      { role: "fridge", buildId: "fridge-free" },
      { role: "storage", buildId: "tall-pantry" },
    ]);
    expect(plan.fridgePosition).toBe(2);
    expect(basesOn(plan, "A")).toStrictEqual([
      { role: "sink", buildId: "base-sink" },
      { role: "storage", buildId: "base-dishwasher" },
      { role: "preparation", buildId: "base-3drawer" },
    ]);
    expect(basesOn(plan, "C")).toStrictEqual([
      { role: "hob", buildId: "base-hob-2drawer" },
      { role: "storage", buildId: "tall-oven-tower" },
    ]);
    expect(plan.towerPosition).toBe("free-end");
  });

  it("4000 / 4500 / 1200: B 3-from-corner fridge, A sink/prep/hob/bottle (dishwasher dropped), C empty", () => {
    const plan = planFor(uRoom(4000, 4500, 1200));

    expect(plan.fridgePosition).toBe(3);
    expect(plan.bases.some((base) => base.buildId === "base-dishwasher")).toBe(
      false,
    );
    expect(basesOn(plan, "A")).toStrictEqual([
      { role: "sink", buildId: "base-sink" },
      { role: "preparation", buildId: "base-3drawer" },
      { role: "hob", buildId: "base-hob-oven" },
      { role: "storage", buildId: "base-bottle-cargo" },
    ]);
    expect(plan.remainderMm.A).toBe(100);
    expect(basesOn(plan, "C")).toStrictEqual([]);
    expect(plan.remainderMm.C).toBe(200);
    expect(plan.towerPosition).toBeUndefined();
  });

  it("5000 / 4000 / 3000: large U, B 2-from-corner + pantry, A core + bottle, C tower at the free end", () => {
    const plan = planFor(uRoom(5000, 4000, 3000));

    expect(basesOn(plan, "B")).toStrictEqual([
      { role: "storage", buildId: "base-cabinet" },
      { role: "storage", buildId: "base-cabinet" },
      { role: "fridge", buildId: "fridge-free" },
      { role: "storage", buildId: "tall-pantry" },
    ]);
    expect(plan.remainderMm.B).toBe(500);
    expect(basesOn(plan, "A")).toStrictEqual([
      { role: "sink", buildId: "base-sink" },
      { role: "storage", buildId: "base-dishwasher" },
      { role: "preparation", buildId: "base-3drawer" },
      { role: "hob", buildId: "base-hob-2drawer" },
      { role: "storage", buildId: "base-bottle-cargo" },
    ]);
    expect(plan.remainderMm.A).toBe(500);
    // N4′'s prose reads wall C's own first two bases as plain "storage" — text last revised before
    // RQ18 answered where the extra drawer units stand. Under RQ18 (a) ("the far wall's first base
    // cabinets", *N3 revised* 6) these are the run's own next eligible door slots past the hob, on
    // the same footing as the far wall's counted-from-corner slots the 6000/6000/6000 witness pins
    // below. ADR 0110 N9.1 rules that these two bases are drawer units and the plan is right.
    // RQ19 (a), owner, 2026-09-29: the room gets 3 drawer cabinets (the preparation and these two),
    // and 3 cabinets are 1 pan drawer and 2 three-drawers — so nearest the hob, a panbank, then a
    // 3-drawer. Before the ruling the split was keyed on the size-derived target and gave 2 panbanks.
    expect(basesOn(plan, "C")).toStrictEqual([
      { role: "storage", buildId: "base-panbank" },
      { role: "storage", buildId: "base-3drawer" },
      { role: "storage", buildId: "tall-oven-tower" },
    ]);
    expect(plan.remainderMm.C).toBe(200);
    expect(plan.towerPosition).toBe("free-end");
  });

  it("6000 / 6000 / 6000: tie to B, 4 pantries, 5 drawer units — 2 panbank on A, 2 on C, tower at 3 from the corner", () => {
    const plan = planFor(uRoom(6000, 6000, 6000));

    expect(basesOn(plan, "B")).toStrictEqual([
      { role: "storage", buildId: "base-cabinet" },
      { role: "storage", buildId: "base-cabinet" },
      { role: "storage", buildId: "base-cabinet" },
      { role: "fridge", buildId: "fridge-free" },
      { role: "storage", buildId: "tall-pantry" },
      { role: "storage", buildId: "tall-pantry" },
      { role: "storage", buildId: "tall-pantry" },
      { role: "storage", buildId: "tall-pantry" },
    ]);
    expect(plan.remainderMm.B).toBe(0);
    expect(basesOn(plan, "A")).toStrictEqual([
      { role: "sink", buildId: "base-sink" },
      { role: "storage", buildId: "base-dishwasher" },
      { role: "preparation", buildId: "base-3drawer" },
      { role: "hob", buildId: "base-hob-2drawer" },
      { role: "storage", buildId: "base-bottle-cargo" },
      { role: "storage", buildId: "base-panbank" },
      { role: "storage", buildId: "base-panbank" },
    ]);
    expect(plan.remainderMm.A).toBe(300);
    expect(basesOn(plan, "C")).toStrictEqual([
      { role: "storage", buildId: "base-3drawer" },
      { role: "storage", buildId: "base-3drawer" },
      { role: "storage", buildId: "base-cabinet" },
      { role: "storage", buildId: "tall-oven-tower" },
      { role: "storage", buildId: "base-cabinet" },
      { role: "storage", buildId: "base-cabinet" },
      { role: "storage", buildId: "base-cabinet" },
      { role: "storage", buildId: "base-cabinet" },
    ]);
    expect(plan.remainderMm.C).toBe(200);
    expect(plan.fridgePosition).toBe(3);
    expect(plan.towerPosition).toBe(3);
    const drawerUnits = plan.bases.filter(
      (base) =>
        base.buildId === "base-3drawer" || base.buildId === "base-panbank",
    );
    expect(drawerUnits).toHaveLength(5);
  });
});
