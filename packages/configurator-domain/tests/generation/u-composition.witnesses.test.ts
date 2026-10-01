// M7B U3a AC2 — the model's seven witnesses (ADR 0110 N4′, corrected 2026-09-29 on U3a's
// stop-and-report, then again on RQ18's answer, and once more by N10.6: only 5000 / 4000 / 3000
// moved), the six rooms N10.6 adds, and the rooms ADR 0110 N11.5 moves or pins. Each room is read
// exactly as N4′ and N10.6 read it: bodies per wall, from the corner outward. The N11.5 rows also
// pin every body's start and end, because comparing `(role, buildId)` alone is how N11.1's fridge
// moving by up to 599 mm passed unseen. This file is the regression pin `docs/milestones/M7B-u-shaped-
// rooms.md` U3a-AC2 asks for; a diff here is either a rule change the architect must adjudicate, or
// a bug in this plan.
import { describe, expect, it } from "vitest";

import {
  type DesignWall,
  type UKitchenCompositionPlan,
} from "../../src/index.js";
import { basesOn, planFor, uRoom } from "../support/u-plan-fixtures.js";

function positionedBasesOn(plan: UKitchenCompositionPlan, wall: DesignWall) {
  return basesOn(plan, wall).map((base) => ({
    role: base.role,
    buildId: base.buildId,
    startMm: base.startMm,
    endMm: base.endMm,
  }));
}

function body(
  buildId: string,
  startMm: number,
  endMm: number,
  role = "storage",
) {
  return { role, buildId, startMm, endMm };
}

function rolesAndBuildIdsOn(plan: UKitchenCompositionPlan, wall: DesignWall) {
  return basesOn(plan, wall).map((base) => ({
    role: base.role,
    buildId: base.buildId,
  }));
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
    expect(rolesAndBuildIdsOn(plan, "A")).toStrictEqual([
      { role: "sink", buildId: "base-sink" },
      { role: "hob", buildId: "base-hob-oven" },
    ]);
    expect(plan.towerPosition).toBeUndefined();
  });

  it("3600 / 2400 / 2000: B fridge (bare 100), A core, C hob + bottle (bare 100), no tower", () => {
    const plan = planFor(uRoom(3600, 2400, 2000));

    expect(rolesAndBuildIdsOn(plan, "B")).toStrictEqual([
      { role: "storage", buildId: "base-cabinet" },
      { role: "fridge", buildId: "fridge-free" },
    ]);
    expect(plan.remainderMm.B).toBe(100);
    expect(rolesAndBuildIdsOn(plan, "A")).toStrictEqual([
      { role: "sink", buildId: "base-sink" },
      { role: "storage", buildId: "base-dishwasher" },
      { role: "preparation", buildId: "base-3drawer" },
    ]);
    // ADR 0110 N9.3: with no tall column on the far wall and 400 mm after the hob, the bottle stands
    // directly after the hob; N4′ read C as the hob alone with 400 mm bare before that ruling.
    expect(rolesAndBuildIdsOn(plan, "C")).toStrictEqual([
      { role: "hob", buildId: "base-hob-oven" },
      { role: "storage", buildId: "base-bottle-cargo" },
    ]);
    expect(plan.remainderMm.C).toBe(100);
    expect(plan.towerPosition).toBeUndefined();
  });

  it('3600 / 3500 / 2200: B 2-from-corner fridge + pantry, A core, C hob + tower at the free end (RQ20\'s "without bottle" case)', () => {
    const plan = planFor(uRoom(3600, 3500, 2200));

    expect(rolesAndBuildIdsOn(plan, "B")).toStrictEqual([
      { role: "storage", buildId: "base-cabinet" },
      { role: "storage", buildId: "base-cabinet" },
      { role: "fridge", buildId: "fridge-free" },
      { role: "storage", buildId: "tall-pantry" },
    ]);
    expect(plan.fridgePosition).toBe(2);
    expect(rolesAndBuildIdsOn(plan, "A")).toStrictEqual([
      { role: "sink", buildId: "base-sink" },
      { role: "storage", buildId: "base-dishwasher" },
      { role: "preparation", buildId: "base-3drawer" },
    ]);
    expect(rolesAndBuildIdsOn(plan, "C")).toStrictEqual([
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
    expect(rolesAndBuildIdsOn(plan, "A")).toStrictEqual([
      { role: "sink", buildId: "base-sink" },
      { role: "preparation", buildId: "base-3drawer" },
      { role: "hob", buildId: "base-hob-oven" },
      { role: "storage", buildId: "base-bottle-cargo" },
    ]);
    expect(plan.remainderMm.A).toBe(100);
    expect(rolesAndBuildIdsOn(plan, "C")).toStrictEqual([]);
    expect(plan.remainderMm.C).toBe(200);
    expect(plan.towerPosition).toBeUndefined();
  });

  it("5000 / 4000 / 3000: large U, B 2-from-corner + pantry, A core + a pan drawer and no bottle, C two drawers + tower at the free end", () => {
    const plan = planFor(uRoom(5000, 4000, 3000));

    expect(rolesAndBuildIdsOn(plan, "B")).toStrictEqual([
      { role: "storage", buildId: "base-cabinet" },
      { role: "storage", buildId: "base-cabinet" },
      { role: "fridge", buildId: "fridge-free" },
      { role: "storage", buildId: "tall-pantry" },
    ]);
    expect(plan.remainderMm.B).toBe(500);
    // ADR 0110 N10.6 (RQ21): wall A holds either the bottle or a 600 mm pan drawer after the hob, and
    // a drawer cabinet outranks the bottle, so the bottle drops and the room gets a fourth drawer
    // cabinet: the preparation, this pan drawer, and wall C's two.
    expect(rolesAndBuildIdsOn(plan, "A")).toStrictEqual([
      { role: "sink", buildId: "base-sink" },
      { role: "storage", buildId: "base-dishwasher" },
      { role: "preparation", buildId: "base-3drawer" },
      { role: "hob", buildId: "base-hob-2drawer" },
      { role: "storage", buildId: "base-panbank" },
    ]);
    expect(plan.remainderMm.A).toBe(200);
    // RQ19 (a): 4 drawer cabinets are 2 pan drawers and 2 three-drawers; the pan drawers stand
    // nearest the hob in run order, so wall A's and wall C's first.
    expect(rolesAndBuildIdsOn(plan, "C")).toStrictEqual([
      { role: "storage", buildId: "base-panbank" },
      { role: "storage", buildId: "base-3drawer" },
      { role: "storage", buildId: "tall-oven-tower" },
    ]);
    expect(plan.remainderMm.C).toBe(200);
    expect(plan.towerPosition).toBe("free-end");
  });

  it("6000 / 6000 / 6000: tie to B, 4 pantries, 5 drawer units — 2 panbank on A, 2 on C, tower at 3 from the corner", () => {
    // ADR 0110 N11.2 first moved this room (the bottle dropped for a third drawer on A); the owner's
    // RQ23 answer, "Bottle + drawers", put it back: 1800 mm free after the hob leaves wall A two
    // drawers behind the bottle. Pinned with positions under N11.2's own describe below.
    const plan = planFor(uRoom(6000, 6000, 6000));

    expect(rolesAndBuildIdsOn(plan, "B")).toStrictEqual([
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
    expect(rolesAndBuildIdsOn(plan, "A")).toStrictEqual([
      { role: "sink", buildId: "base-sink" },
      { role: "storage", buildId: "base-dishwasher" },
      { role: "preparation", buildId: "base-3drawer" },
      { role: "hob", buildId: "base-hob-2drawer" },
      { role: "storage", buildId: "base-bottle-cargo" },
      { role: "storage", buildId: "base-panbank" },
      { role: "storage", buildId: "base-panbank" },
      // ADR 0110 N11.9 (RQ25): the 300 mm that stood bare takes a door base.
      { role: "storage", buildId: "base-cabinet" },
    ]);
    expect(plan.remainderMm.A).toBe(0);
    expect(rolesAndBuildIdsOn(plan, "C")).toStrictEqual([
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

describe("ADR 0110 N10.6's six added witnesses (U3a AC2)", () => {
  it("3000 / 4500 / 4500: RQ20, RQ19 (b) and RQ19 (a) together — hob, bottle, two drawers, then the tower", () => {
    const plan = planFor(uRoom(3000, 4500, 4500));

    expect(rolesAndBuildIdsOn(plan, "A")).toStrictEqual([
      { role: "sink", buildId: "base-sink" },
      { role: "storage", buildId: "base-dishwasher" },
    ]);
    expect(plan.remainderMm.A).toBe(0);
    expect(rolesAndBuildIdsOn(plan, "C")).toStrictEqual([
      { role: "preparation", buildId: "base-3drawer" },
      { role: "hob", buildId: "base-hob-2drawer" },
      { role: "storage", buildId: "base-bottle-cargo" },
      { role: "storage", buildId: "base-panbank" },
      { role: "storage", buildId: "base-3drawer" },
      { role: "storage", buildId: "tall-oven-tower" },
    ]);
    expect(plan.remainderMm.C).toBe(200);
  });

  it("2700 / 4000 / 4000: RQ19 (b) where the bottle cannot also fit — the drawer stands between the hob and the tower", () => {
    const plan = planFor(uRoom(2700, 4000, 4000));

    expect(rolesAndBuildIdsOn(plan, "C")).toStrictEqual([
      { role: "storage", buildId: "base-dishwasher" },
      { role: "preparation", buildId: "base-3drawer" },
      { role: "hob", buildId: "base-hob-2drawer" },
      { role: "storage", buildId: "base-panbank" },
      { role: "storage", buildId: "tall-oven-tower" },
    ]);
    expect(plan.remainderMm.C).toBe(0);
  });

  it("2700 / 3700 / 3700: RQ20 where the bottle fits — it stands directly after the hob and the tower follows", () => {
    const plan = planFor(uRoom(2700, 3700, 3700));

    expect(rolesAndBuildIdsOn(plan, "C")).toStrictEqual([
      { role: "storage", buildId: "base-dishwasher" },
      { role: "preparation", buildId: "base-3drawer" },
      { role: "hob", buildId: "base-hob-2drawer" },
      { role: "storage", buildId: "base-bottle-cargo" },
      { role: "storage", buildId: "tall-oven-tower" },
    ]);
    expect(plan.remainderMm.C).toBe(0);
  });

  it("4200 / 3400 / 3400: a back-wall hob's extras stand before the tower, which then stands at 3 bodies although n is 2", () => {
    const plan = planFor(uRoom(4200, 3400, 3400));

    expect(rolesAndBuildIdsOn(plan, "A")).toStrictEqual([
      { role: "sink", buildId: "base-sink" },
      { role: "storage", buildId: "base-dishwasher" },
      { role: "preparation", buildId: "base-3drawer" },
      { role: "hob", buildId: "base-hob-2drawer" },
    ]);
    expect(plan.remainderMm.A).toBe(0);
    const onC = rolesAndBuildIdsOn(plan, "C");
    expect(onC).toStrictEqual([
      { role: "storage", buildId: "base-panbank" },
      { role: "storage", buildId: "base-panbank" },
      { role: "storage", buildId: "base-3drawer" },
      { role: "storage", buildId: "tall-oven-tower" },
    ]);
    expect(onC.findIndex((base) => base.buildId === "tall-oven-tower")).toBe(3);
    expect(plan.towerPosition).toBe(2);
    expect(plan.remainderMm.C).toBe(0);
  });

  it("4800 / 1000 / 1000: RQ21 on wall A with no tower — the pan drawer stands where the bottle stood", () => {
    const plan = planFor(uRoom(4800, 1000, 1000));

    expect(plan.dropped).toContain("fridge");
    expect(rolesAndBuildIdsOn(plan, "A")).toStrictEqual([
      { role: "sink", buildId: "base-sink" },
      { role: "storage", buildId: "base-dishwasher" },
      { role: "preparation", buildId: "base-3drawer" },
      { role: "hob", buildId: "base-hob-oven" },
      { role: "storage", buildId: "base-panbank" },
    ]);
    expect(plan.remainderMm.A).toBe(0);
    expect(plan.towerPosition).toBeUndefined();
  });

  it("3600 / 2800 / 2800: the pantry outranks the drawer and the bottle (N3r 6) — hob, tower, pantry", () => {
    const plan = planFor(uRoom(3600, 2800, 2800));

    expect(rolesAndBuildIdsOn(plan, "C")).toStrictEqual([
      { role: "hob", buildId: "base-hob-2drawer" },
      { role: "storage", buildId: "tall-oven-tower" },
      { role: "storage", buildId: "tall-pantry" },
    ]);
    expect(plan.remainderMm.C).toBe(0);
  });
});

describe("ADR 0110 N11.1: a free-end fridge stands right after its door storage, the remainder beyond it (U3a AC2)", () => {
  it("3600 / 2400 / 2000: B is door base 900-1500 and fridge 1500-2200, with 100 mm bare beyond; A and C unchanged", () => {
    const plan = planFor(uRoom(3600, 2400, 2000));

    expect(positionedBasesOn(plan, "B")).toStrictEqual([
      body("base-cabinet", 900, 1500),
      body("fridge-free", 1500, 2200, "fridge"),
    ]);
    expect(plan.remainderMm.B).toBe(100);
    expect(positionedBasesOn(plan, "A")).toStrictEqual([
      body("base-sink", 900, 1500, "sink"),
      body("base-dishwasher", 1500, 2100),
      body("base-3drawer", 2100, 2700, "preparation"),
    ]);
    expect(positionedBasesOn(plan, "C")).toStrictEqual([
      body("base-hob-oven", 900, 1500, "hob"),
      body("base-bottle-cargo", 1500, 1800),
    ]);
  });

  it("3600 / 2800 / 2800: B is door base 900-1500 and fridge 1500-2200, with 500 mm bare and no pantry beyond it; C unchanged", () => {
    const plan = planFor(uRoom(3600, 2800, 2800));

    expect(positionedBasesOn(plan, "B")).toStrictEqual([
      body("base-cabinet", 900, 1500),
      body("fridge-free", 1500, 2200, "fridge"),
    ]);
    expect(plan.remainderMm.B).toBe(500);
    expect(positionedBasesOn(plan, "C")).toStrictEqual([
      body("base-hob-2drawer", 900, 1500, "hob"),
      body("tall-oven-tower", 1500, 2100),
      body("tall-pantry", 2100, 2700),
    ]);
  });

  it("4000 / 2000 / 2000: B is the fridge alone at 900-1600, with 300 mm bare beyond it", () => {
    const plan = planFor(uRoom(4000, 2000, 2000));

    expect(positionedBasesOn(plan, "B")).toStrictEqual([
      body("fridge-free", 900, 1600, "fridge"),
    ]);
    expect(plan.remainderMm.B).toBe(300);
  });
});

describe("ADR 0110 N11.2 with RQ23: the drawer takes the hob's place where the bottle would leave wall A none, and the bottle stands where a drawer follows it (U3a AC2)", () => {
  const A_UP_TO_THE_HOB = [
    body("base-sink", 900, 1500, "sink"),
    body("base-dishwasher", 1500, 2100),
    body("base-3drawer", 2100, 2700, "preparation"),
    body("base-hob-2drawer", 2700, 3300, "hob"),
  ];

  it("4800 / 4400 / 4400, exactly 600 mm after the hob: the pan drawer stands at 3300-3900 and the bottle is dropped (owner)", () => {
    const plan = planFor(uRoom(4800, 4400, 4400));

    expect(positionedBasesOn(plan, "A")).toStrictEqual([
      ...A_UP_TO_THE_HOB,
      body("base-panbank", 3300, 3900),
    ]);
    expect(plan.remainderMm.A).toBe(0);
    expect(positionedBasesOn(plan, "C")).toStrictEqual([
      body("base-panbank", 900, 1500),
      body("base-3drawer", 1500, 2100),
      body("base-3drawer", 2100, 2700),
      body("tall-oven-tower", 2700, 3300),
      body("base-cabinet", 3300, 3900),
    ]);
    expect(plan.remainderMm.C).toBe(400);
  });

  it("4900 / 4000 / 4000, 700 mm after the hob: the pan drawer takes 3300-3900, no bottle, 100 mm bare", () => {
    const plan = planFor(uRoom(4900, 4000, 4000));

    expect(positionedBasesOn(plan, "A")).toStrictEqual([
      ...A_UP_TO_THE_HOB,
      body("base-panbank", 3300, 3900),
    ]);
    expect(plan.remainderMm.A).toBe(100);
  });

  it("5100 / 2000 / 2000, 900 mm after the hob: the bottle stands, then the pan drawer", () => {
    const plan = planFor(uRoom(5100, 2000, 2000));

    expect(positionedBasesOn(plan, "A")).toStrictEqual([
      ...A_UP_TO_THE_HOB,
      body("base-bottle-cargo", 3300, 3600),
      body("base-panbank", 3600, 4200),
    ]);
    expect(plan.remainderMm.A).toBe(0);
  });

  it("5400 / 3400 / 3400, 1200 mm after the hob: the bottle stands, then a pan drawer (RQ23: bottle + drawers)", () => {
    const plan = planFor(uRoom(5400, 3400, 3400));

    expect(positionedBasesOn(plan, "A")).toStrictEqual([
      ...A_UP_TO_THE_HOB,
      body("base-bottle-cargo", 3300, 3600),
      body("base-panbank", 3600, 4200),
      // ADR 0110 N11.9 (RQ25): the 300 mm that stood bare takes a door base.
      body("base-cabinet", 4200, 4500),
    ]);
    expect(plan.remainderMm.A).toBe(0);
    expect(positionedBasesOn(plan, "C")).toStrictEqual([
      body("base-panbank", 900, 1500),
      body("base-3drawer", 1500, 2100),
      body("base-3drawer", 2100, 2700),
      body("tall-oven-tower", 2700, 3300),
    ]);
  });

  it("6000 / 6000 / 6000, 1800 mm after the hob: the bottle stands, then two pan drawers, with a 300 mm door base at wall A's high end (RQ23, N11.9)", () => {
    const plan = planFor(uRoom(6000, 6000, 6000));

    expect(positionedBasesOn(plan, "A")).toStrictEqual([
      ...A_UP_TO_THE_HOB,
      body("base-bottle-cargo", 3300, 3600),
      body("base-panbank", 3600, 4200),
      body("base-panbank", 4200, 4800),
      // ADR 0110 N11.9 (RQ25): the 300 mm that stood bare takes a door base.
      body("base-cabinet", 4800, 5100),
    ]);
    expect(plan.remainderMm.A).toBe(0);
    expect(positionedBasesOn(plan, "C")).toStrictEqual([
      body("base-3drawer", 900, 1500),
      body("base-3drawer", 1500, 2100),
      body("base-cabinet", 2100, 2700),
      body("tall-oven-tower", 2700, 3300),
      body("base-cabinet", 3300, 3900),
      body("base-cabinet", 3900, 4500),
      body("base-cabinet", 4500, 5100),
      body("base-cabinet", 5100, 5700),
    ]);
    expect(plan.remainderMm.C).toBe(200);
  });
});

describe("ADR 0110 N11.3: the sink never leaves wall A (U3a AC2)", () => {
  it("2399 / 3000 / 3000, 599 mm free on A: refused, minimumMet false", () => {
    const plan = planFor(uRoom(2399, 3000, 3000));

    expect(plan.minimumMet).toBe(false);
    expect(plan.bases).toStrictEqual([]);
  });

  it("2400 / 3000 / 3000, 600 mm free on A: the sink stands at 900-1500, and the rest of the core is on C", () => {
    const plan = planFor(uRoom(2400, 3000, 3000));

    expect(plan.minimumMet).toBe(true);
    expect(positionedBasesOn(plan, "A")).toStrictEqual([
      body("base-sink", 900, 1500, "sink"),
    ]);
    expect(positionedBasesOn(plan, "C")).toStrictEqual([
      body("base-dishwasher", 900, 1500),
      body("base-3drawer", 1500, 2100, "preparation"),
      body("base-hob-oven", 2100, 2700, "hob"),
    ]);
    expect(positionedBasesOn(plan, "B")).toStrictEqual([
      body("base-cabinet", 900, 1500),
      body("base-cabinet", 1500, 2100),
      body("fridge-free", 2100, 2800, "fridge"),
    ]);
  });
});

describe("ADR 0110 N11.4: a room lower than the column takes door bases in the fridge gap (U3a AC2)", () => {
  const FRIDGE_WALL_UP_TO_THE_GAP = [
    body("base-cabinet", 900, 1500),
    body("base-cabinet", 1500, 2100),
    body("fridge-free", 2100, 2800, "fridge"),
  ];

  it("3600 / 3500 / 2200 at 2199 mm: a door base stands at 2800-3400, and no tall column stands anywhere", () => {
    const plan = planFor(uRoom(3600, 3500, 2200, 2199));

    expect(positionedBasesOn(plan, "B")).toStrictEqual([
      ...FRIDGE_WALL_UP_TO_THE_GAP,
      body("base-cabinet", 2800, 3400),
    ]);
    expect(positionedBasesOn(plan, "C")).toStrictEqual([
      body("base-hob-oven", 900, 1500, "hob"),
      body("base-panbank", 1500, 2100),
    ]);
    expect(plan.towerPosition).toBeUndefined();
  });

  it("3600 / 3500 / 2200 at 2200 mm: the pantry stands at 2800-3400 and the tower on C, as in N4′", () => {
    const plan = planFor(uRoom(3600, 3500, 2200, 2200));

    expect(positionedBasesOn(plan, "B")).toStrictEqual([
      ...FRIDGE_WALL_UP_TO_THE_GAP,
      body("tall-pantry", 2800, 3400),
    ]);
    expect(positionedBasesOn(plan, "C")).toStrictEqual([
      body("base-hob-2drawer", 900, 1500, "hob"),
      body("tall-oven-tower", 1500, 2100),
    ]);
    expect(plan.towerPosition).toBe("free-end");
  });
});
