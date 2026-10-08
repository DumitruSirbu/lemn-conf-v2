// ADR 0110 N11.8 and N11.9 — wall A's remainder in a U. The plan justifies wall A's bodies to its low
// end (the A∩B corner) whichever corner the run was packed from, so the remainder always sits at the
// high end, where every `insertBody` split already puts one (ADR 0046); then, as the plan's last step,
// a remainder of 300-599 mm takes one door base of exactly that width (RQ25, owner 2026-09-29) and
// under 300 mm stays bare.
//
// The three digests below are the ADR's own model, measured independently of this implementation
// (N11.9's table, and N11.8's for the engine band); the implementation reproduced all three. A
// difference here is a rule change to adjudicate, never a figure to tune.
import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { uShellFloorRuns, type DesignRoom } from "../../src/index.js";
import { beforeC5 } from "../support/before-c5-fridge-end-leftover.js";
import { basesOn, planFor, uRoom } from "../support/u-plan-fixtures.js";
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
    "6046ca18decf8d32d2cb5d55f5300fe56aea38236d53fe60e5a09fa47f57475c",
  gridAt2199:
    "43097f1c8ed0fe4fe6ff1a9fa37e8b470f76363c13b2e7ac999c35efa6aa9b0d",
  engineBandAt2600:
    "d4a63e4d8370211ceb80495ffeeb8f5df8ae43f7ac4a2e82d602205df6a35c08",
} as const;

/** The digests of today's plans, after the owner's Q6 (M7C wave C5 S2). */
const DIGESTS_AFTER_C5 = {
  gridAt2600:
    "4af63ed7405bdaf15452c4b8ca5db5266cffa98f2beaab7e974851dae82e1991",
  gridAt2199:
    "6e95bfb8352c99285dd26519285b587dbef648ad55d64ee1462e345d3c48195f",
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

describe("the plan's digests are the ADR's model (N11.8, N11.9)", () => {
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

/** What the grid's plans say about wall A, read off each plan against its own run. */
function censusOfTheGrid(): GridCensus {
  const fillsByWidthMm: Record<number, number> = {};
  const fillsByFridge: Record<string, number> = {};
  const drawerCabinetHistogram = [0, 0, 0, 0, 0, 0];
  const problems: string[] = [];
  let composed = 0;
  for (const room of roomsOf({ wallAMm: GRID_WALL_A_MM, heightMm: 2600 })) {
    const plan = planFor(room);
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
    if (plan.remainderMm.A >= 300) {
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

  it("has every wall-A first body at its run start, and under 300 mm bare on wall A", () => {
    expect(census.composed).toBe(86_706);
    expect(census.problems.slice(0, 10)).toStrictEqual([]);
  });

  it("fills 21 501 rooms' remainders: 7 893 at 300 mm, 6 804 at 400 mm and 6 804 at 500 mm", () => {
    expect(census.fillsByWidthMm).toStrictEqual({
      300: 7_893,
      400: 6_804,
      500: 6_804,
    });
  });

  it("fills on every U's wall A, whichever wall holds the fridge, or none (10 491 / 11 001 / 9)", () => {
    expect(census.fillsByFridge).toStrictEqual({
      C: 10_491,
      B: 11_001,
      dropped: 9,
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
    const plan = planFor(uRoom(2700, 1600, 1700));

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
    const plan = planFor(uRoom(3100, 1000, 1100));

    expect(
      basesOn(plan, "A").map(
        (base) =>
          `${base.buildId}@${String(base.startMm)}-${String(base.endMm)}`,
      ),
    ).toStrictEqual(["base-hob-oven@900-1500", "base-sink@1500-2100"]);
    expect(plan.remainderMm.A).toBe(100);
  });

  it("never puts a narrow door base on a side wall: the fill belongs to wall A alone (RQ25a)", () => {
    for (const room of roomsOf({
      wallAMm: [3000, 3900, 6000],
      heightMm: 2600,
    })) {
      const plan = planFor(room);
      for (const wall of ["B", "C"] as const) {
        const narrowDoors = basesOn(plan, wall).filter(
          (base) => base.buildId === "base-cabinet" && base.widthMm < 600,
        );

        expect(narrowDoors, `${wall} of ${JSON.stringify(room)}`).toStrictEqual(
          [],
        );
      }
    }
  });
});
