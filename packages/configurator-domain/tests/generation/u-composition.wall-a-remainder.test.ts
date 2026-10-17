// ADR 0110 N11.8 and N11.9 — wall A's remainder in a U. The composer justifies wall A's bodies to its low
// end (the A∩B corner) whichever corner the run was packed from, so the remainder always sits at the
// high end, where every `insertBody` split already puts one (ADR 0046). N11.9 then gave a remainder of
// 300-599 mm one door base of exactly that width (RQ25, owner 2026-09-29); ADR 0167 D7 moved that fill out of
// the composer into the general pass over every wall and lowered its floor to the catalogue's narrowest
// cabinet, so a remainder of 200 mm or more takes it (`filledPlanFor`) and only one under 200 mm stays bare.
//
// The three digests below are the composer's plans. They were the ADR's own model, measured independently of
// this implementation (N11.9's table, and N11.8's for the engine band). The grid digests are restated by
// ADR 0167 D7: each is the ADR's digest with wall A's fill taken out, which is what the composer now plans,
// derived by running this file's digest at the commit before ADR 0167's pass with the fill's base left
// out of each wall's bodies (the engine band has no wall-A remainder of 300 or more, so its digest is
// unchanged). A difference here is a rule change to adjudicate, never a figure to tune.
import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { uShellFloorRuns, type DesignRoom } from "../../src/index.js";
import { beforeC5 } from "../support/before-c5-fridge-end-leftover.js";
import {
  basesOn,
  FILL_FLOOR_MM,
  filledPlanFor,
  planFor,
  uRoom,
} from "../support/u-plan-fixtures.js";
import { isWallAFill } from "../support/u-plan-invariants.js";

// M7C wave C5 S2: the digests below are the ADR's model as it stood before the owner's Q6 gave the leftover
// beyond a U's end fridge to the cabinet inboard of it, so each is reproduced with the planner asked as it
// stood before that rule (`beforeC5`); the current plan's own digests follow them.
vi.mock(
  "../../src/generation/fridge-end-leftover.js",
  async (importOriginal) => {
    const { withTheFridgeEndLeafSwitchable } = await import(
      "../support/before-c5-fridge-end-leftover.js"
    );
    return withTheFridgeEndLeafSwitchable(await importOriginal());
  },
);

const GRID_STEP_MM = 100;
const RECORDED_DIGESTS = {
  gridAt2600:
    "9e1c0fc8e0c839409372cdc3d38327a44556ca6f49b92fc943075bd606b4e626",
  gridAt2199:
    "47a5e1727966066d93c562d4ca4c683b0a2e4c9036d2633f8121446222983d65",
  engineBandAt2600:
    "d4a63e4d8370211ceb80495ffeeb8f5df8ae43f7ac4a2e82d602205df6a35c08",
} as const;

/** The digests of today's composer plans, after the owner's Q6 (M7C wave C5 S2) and without wall A's fill
 *  (ADR 0167 D7, derived as above). */
const DIGESTS_AFTER_C5 = {
  gridAt2600:
    "cd83822d9a007b82701d35589e8bd6d4bd4329943e2161d1f98a39d66f474fbc",
  gridAt2199:
    "74fde07cd107cdd836393ed0c709234f73c4830c753813b7a3f42de85803e613",
  engineBandAt2600:
    "6ffe7f39b0db5061c133b5189abcaf412c2dbc429a0bf3e1915fa50bd3fd32e1",
} as const;

function range(fromMm: number, toMm: number, stepMm: number): number[] {
  const values: number[] = [];
  for (let valueMm = fromMm; valueMm <= toMm; valueMm += stepMm) {
    values.push(valueMm);
  }
  return values;
}

/** Every room of a sweep, in its fixed order. */
function roomsOf(sweep: {
  readonly wallAMm: readonly number[];
  readonly heightMm: number;
}): readonly DesignRoom[] {
  const sideWallsMm = range(1000, 6000, GRID_STEP_MM);
  return sweep.wallAMm.flatMap((widthMm) =>
    sideWallsMm.flatMap((depthMm) =>
      sideWallsMm.map((wallCMm) =>
        uRoom(widthMm, depthMm, wallCMm, sweep.heightMm),
      ),
    ),
  );
}

const GRID_WALL_A_MM = range(2700, 6000, GRID_STEP_MM);
const ENGINE_BAND_WALL_A_MM = range(1800, 2699, 50);

/** N11.5's id-free format: per room, whether it composes and each wall's bodies as
 *  `buildId@start-end` in along-wall order. */
function digestOf(rooms: readonly DesignRoom[]): string {
  const hash = createHash("sha256");
  for (const room of rooms) {
    const plan = planFor(room);
    const walls = (["A", "B", "C"] as const).map((wall) =>
      basesOn(plan, wall)
        .map(
          (base) =>
            `${base.buildId}@${String(base.startMm)}-${String(base.endMm)}`,
        )
        .join(","),
    );
    hash.update(
      `${String(room.widthMm)}/${String(room.depthMm)}/${String(room.wallCMm)}|${String(plan.minimumMet)}|${walls.join("|")}\n`,
    );
  }
  return hash.digest("hex");
}

describe("the composer's digests are the ADR's model without wall A's fill (N11.8; N11.9 is ADR 0167 D7's)", () => {
  it("over the approved grid at 2600 mm", () => {
    const rooms = roomsOf({ wallAMm: GRID_WALL_A_MM, heightMm: 2600 });

    expect(beforeC5(() => digestOf(rooms))).toBe(RECORDED_DIGESTS.gridAt2600);
    expect(digestOf(rooms)).toBe(DIGESTS_AFTER_C5.gridAt2600);
  });

  it("over the approved grid at 2199 mm, below the column", () => {
    const rooms = roomsOf({ wallAMm: GRID_WALL_A_MM, heightMm: 2199 });

    expect(beforeC5(() => digestOf(rooms))).toBe(RECORDED_DIGESTS.gridAt2199);
    expect(digestOf(rooms)).toBe(DIGESTS_AFTER_C5.gridAt2199);
  });

  it("over the engine band A 1800-2699, where wall A's remainder is under 300 mm", () => {
    const rooms = roomsOf({ wallAMm: ENGINE_BAND_WALL_A_MM, heightMm: 2600 });

    expect(beforeC5(() => digestOf(rooms))).toBe(
      RECORDED_DIGESTS.engineBandAt2600,
    );
    expect(digestOf(rooms)).toBe(DIGESTS_AFTER_C5.engineBandAt2600);
  });
});

interface GridCensus {
  readonly composed: number;
  readonly fillsByWidthMm: Readonly<Record<number, number>>;
  readonly fillsByFridge: Readonly<Record<string, number>>;
  readonly drawerCabinetHistogram: readonly number[];
  readonly problems: readonly string[];
}

/** What the grid's filled plans say about wall A, read off each plan against its own run. */
function censusOfTheGrid(): GridCensus {
  const fillsByWidthMm: Record<number, number> = {};
  const fillsByFridge: Record<string, number> = {};
  const drawerCabinetHistogram = [0, 0, 0, 0, 0, 0];
  const problems: string[] = [];
  let composed = 0;
  for (const room of roomsOf({ wallAMm: GRID_WALL_A_MM, heightMm: 2600 })) {
    const plan = filledPlanFor(room);
    if (!plan.minimumMet) continue;
    composed += 1;
    const key = `${String(room.widthMm)}/${String(room.depthMm)}/${String(room.wallCMm)}`;
    const runA = uShellFloorRuns(room).A;
    const onWallA = basesOn(plan, "A");
    const drawerCabinets = plan.bases.filter(
      (base) =>
        base.buildId === "base-3drawer" || base.buildId === "base-panbank",
    ).length;
    drawerCabinetHistogram[drawerCabinets] =
      (drawerCabinetHistogram[drawerCabinets] ?? 0) + 1;
    const narrowDrawerUnits = plan.bases.filter(
      (base) =>
        (base.buildId === "base-3drawer" || base.buildId === "base-panbank") &&
        base.widthMm < 600,
    );
    if (narrowDrawerUnits.length > 0) {
      problems.push(`${key}: the fill became a drawer unit`);
    }
    if (onWallA[0]?.startMm !== runA.startMm) {
      problems.push(`${key}: wall A's first body is not at its run start`);
    }
    if (plan.remainderMm.A >= FILL_FLOOR_MM) {
      problems.push(
        `${key}: wall A leaves ${String(plan.remainderMm.A)} mm bare`,
      );
    }
    const fill = onWallA.find(isWallAFill);
    if (fill === undefined) continue;
    fillsByWidthMm[fill.widthMm] = (fillsByWidthMm[fill.widthMm] ?? 0) + 1;
    const fridgeWall =
      plan.bases.find((base) => base.role === "fridge")?.wall ?? "dropped";
    fillsByFridge[fridgeWall] = (fillsByFridge[fridgeWall] ?? 0) + 1;
    if (fill.endMm !== runA.endMm || plan.remainderMm.A !== 0) {
      problems.push(`${key}: the fill is not at wall A's high end, flush`);
    }
  }
  return {
    composed,
    fillsByWidthMm,
    fillsByFridge,
    drawerCabinetHistogram,
    problems,
  };
}

describe("wall A's remainder over the approved grid at 2600 mm (N11.8, N11.9)", () => {
  const census = censusOfTheGrid();

  it("has every wall-A first body at its run start, and under 200 mm bare on wall A", () => {
    expect(census.composed).toBe(86_706);
    expect(census.problems.slice(0, 10)).toStrictEqual([]);
  });

  // 21 501 rooms at 300-500 mm, as N11.9 filled them from 300 mm, and 21 231 at 200 mm, which the 200 mm floor
  // (ADR 0167 D2) now fills; the grid's remainders on wall A are 200 mm or 300-500 mm and nothing else (measured at the commit before the pass).
  it("fills 42 732 rooms' remainders: 21 231 at 200 mm, 7 893 at 300 mm, 6 804 at 400 mm and 6 804 at 500 mm", () => {
    expect(census.fillsByWidthMm).toStrictEqual({
      200: 21_231,
      300: 7_893,
      400: 6_804,
      500: 6_804,
    });
  });

  it("fills on every U's wall A, whichever wall holds the fridge, or none (20 700 / 21 535 / 497)", () => {
    expect(census.fillsByFridge).toStrictEqual({
      C: 20_700,
      B: 21_535,
      dropped: 497,
    });
  });

  it("leaves the drawer histogram where N10.5 recorded it, and never turns the fill into a drawer unit", () => {
    expect(census.drawerCabinetHistogram).toStrictEqual([
      4_968, 27_118, 13_172, 14_572, 9_937, 16_939,
    ]);
  });
});

describe("wall A's witnesses (N11.8, N11.9)", () => {
  it("2700 / 1600 / 1700: the sink at A 900-1500, then a 300 mm door base at 1500-1800, none bare", () => {
    const plan = filledPlanFor(uRoom(2700, 1600, 1700));

    expect(
      basesOn(plan, "A").map(
        (base) =>
          `${base.buildId}@${String(base.startMm)}-${String(base.endMm)}`,
      ),
    ).toStrictEqual(["base-sink@900-1500", "base-cabinet@1500-1800"]);
    expect(plan.remainderMm.A).toBe(0);
    expect(plan.floorWidthsMm.A).toStrictEqual([600, 300]);
  });

  it("3100 / 1000 / 1100: the hob at 900-1500 and the sink at 1500-2100, and the 100 mm stays bare", () => {
    const plan = filledPlanFor(uRoom(3100, 1000, 1100));

    expect(
      basesOn(plan, "A").map(
        (base) =>
          `${base.buildId}@${String(base.startMm)}-${String(base.endMm)}`,
      ),
    ).toStrictEqual(["base-hob-oven@900-1500", "base-sink@1500-2100"]);
    expect(plan.remainderMm.A).toBe(100);
  });

  // RQ25a scoped the fill to wall A alone; ADR 0167 D1 supersedes that for generated kitchens, so this witness now
  // holds the side walls to the same rule as wall A: one door base of exactly the remainder, or none under 200 mm.
  it("fills a side wall's remainder of 200 mm or more with one door base of exactly that width, like wall A (ADR 0167 D1)", () => {
    let sideWallFills = 0;
    for (const room of roomsOf({
      wallAMm: [3000, 3900, 6000],
      heightMm: 2600,
    })) {
      const composed = planFor(room);
      const filled = filledPlanFor(room);
      if (!composed.minimumMet) continue;
      const composedIds = new Set(composed.bases.map((base) => base.id));
      for (const wall of ["B", "C"] as const) {
        const added = basesOn(filled, wall).filter(
          (base) => !composedIds.has(base.id),
        );
        const bareMm = composed.remainderMm[wall];
        const expected =
          bareMm >= FILL_FLOOR_MM
            ? [{ buildId: "base-cabinet", widthMm: bareMm }]
            : [];

        expect(
          added.map(({ buildId, widthMm }) => ({ buildId, widthMm })),
          `${wall} of ${JSON.stringify(room)}`,
        ).toStrictEqual(expected);
        expect(filled.remainderMm[wall]).toBe(
          bareMm >= FILL_FLOOR_MM ? 0 : bareMm,
        );
        sideWallFills += added.length;
      }
    }

    expect(sideWallFills).toBeGreaterThan(0);
  });
});
