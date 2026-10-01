// M7 wave 7A3 criteria 8 and 9 — the rooms the owner's 6000 mm ruling admits, named and sized.
//
// Moving wall B's approved maximum from 5100 to 6000 (ADR 0120 Amendment B2, ADR 0124) lets a
// customer reach a band nothing had composed before. The plan measured it as uniformly the "big room,
// everything fits" regime, and that uniformity is what makes it safe to admit — which an aggregate
// over the whole policy would hide (ADR 0121 decision 5). So the band is swept on its own and its
// structure asserted, beside the kept band it has to stay inside.
//
// **The bands are spelled, not read from the policy.** They are the two sides of one change: the
// kept band is what the pre-7A3 policy and the current one both accept, and the admitted band is
// what only the current one does. A policy that moved again would not move what 7A3 admitted.
//
// Swept on the plan's own grid and ceiling — 25 mm, 2600 mm — through `planKitchenComposition`.
import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  type DesignRoom,
  type KitchenCompositionPlan,
} from "../../src/index.js";

const GRID_STEP_MM = 25;
const SWEPT_HEIGHT_MM = 2600;
const HOB_WITH_OVEN = "base-hob-oven";

const WALL_A_MIN_MM = 900;
const RULED_WALL_MAX_MM = 6000;
const WALL_B_MIN_MM = 1000;
/** Wall B's approved maximum before M7 7A3. */
const PRE_7A3_WALL_B_MAX_MM = 5100;

const DECLARED_COLUMNS = declaredColumnSizes(
  buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN)),
);

interface Band {
  readonly wallBMinMm: number;
  readonly wallBMaxMm: number;
}

const KEPT_BAND: Band = {
  wallBMinMm: WALL_B_MIN_MM,
  wallBMaxMm: PRE_7A3_WALL_B_MAX_MM,
};

/** Wall B 5101–6000; the first grid value in it is 5125. */
const ADMITTED_BAND: Band = {
  wallBMinMm: PRE_7A3_WALL_B_MAX_MM + GRID_STEP_MM,
  wallBMaxMm: RULED_WALL_MAX_MM,
};

interface BandSweep {
  readonly rooms: number;
  readonly thrown: readonly string[];
  readonly plans: readonly KitchenCompositionPlan[];
}

function sweep(band: Band): BandSweep {
  const thrown: string[] = [];
  const plans: KitchenCompositionPlan[] = [];
  let rooms = 0;
  for (const room of roomsIn(band)) {
    rooms += 1;
    try {
      plans.push(planFor(room));
    } catch (error) {
      thrown.push(`${roomKeyOf(room)}: ${String(error)}`);
    }
  }
  return { rooms, thrown, plans };
}

function roomsIn(band: Band): DesignRoom[] {
  const rooms: DesignRoom[] = [];
  for (
    let widthMm = WALL_A_MIN_MM;
    widthMm <= RULED_WALL_MAX_MM;
    widthMm += GRID_STEP_MM
  ) {
    for (
      let depthMm = band.wallBMinMm;
      depthMm <= band.wallBMaxMm;
      depthMm += GRID_STEP_MM
    ) {
      rooms.push({ shape: "L", widthMm, depthMm, heightMm: SWEPT_HEIGHT_MM });
    }
  }
  return rooms;
}

function planFor(room: DesignRoom): KitchenCompositionPlan {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

function roomKeyOf(room: DesignRoom): string {
  return `${String(room.widthMm)}x${String(room.depthMm)}`;
}

function buildIdsOf(plan: KitchenCompositionPlan): string[] {
  return plan.bases.map((base) => base.buildId);
}

function composedPlansOf(sweepOf: BandSweep): KitchenCompositionPlan[] {
  return sweepOf.plans.filter((plan) => plan.minimumMet);
}

const ADMITTED = sweep(ADMITTED_BAND);
const KEPT = sweep(KEPT_BAND);

describe("the wall B band M7 7A3 admits, swept on its own", () => {
  it("sweeps the 7 380 rooms the plan sized, and every one composes without throwing", () => {
    const notComposing = ADMITTED.plans
      .filter((plan) => !plan.minimumMet)
      .map((plan) => roomKeyOf(plan.room));

    expect({
      rooms: ADMITTED.rooms,
      thrown: ADMITTED.thrown.slice(0, 5),
      notComposing: notComposing.slice(0, 5),
    }).toEqual({ rooms: 7380, thrown: [], notComposing: [] });
  });

  it("drops no core role in any of them", () => {
    const dropping = ADMITTED.plans
      .filter((plan) => plan.dropped.length > 0)
      .map((plan) => `${roomKeyOf(plan.room)} ${plan.dropped.join(",")}`);

    expect(dropping.slice(0, 5)).toEqual([]);
  });

  it("never composes the hob with an oven, which the kept band composes in some rooms", () => {
    const withAnOvenHob = (sweepOf: BandSweep): number =>
      composedPlansOf(sweepOf).filter((plan) =>
        buildIdsOf(plan).includes(HOB_WITH_OVEN),
      ).length;

    expect(withAnOvenHob(ADMITTED)).toBe(0);
    // Without this the zero above could be a sweep that never composes a hob body of that name at all.
    expect(withAnOvenHob(KEPT)).toBeGreaterThan(0);
  });

  it("produces no build id the kept band does not already produce", () => {
    const keptBuildIds = new Set(composedPlansOf(KEPT).flatMap(buildIdsOf));
    const admittedBuildIds = new Set(
      composedPlansOf(ADMITTED).flatMap(buildIdsOf),
    );

    expect(KEPT.thrown).toEqual([]);
    expect(admittedBuildIds.size).toBeGreaterThan(0);
    expect(
      [...admittedBuildIds].filter((buildId) => !keptBuildIds.has(buildId)),
    ).toEqual([]);
  });
});
