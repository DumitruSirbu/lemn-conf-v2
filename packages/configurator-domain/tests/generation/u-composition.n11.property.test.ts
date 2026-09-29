// M7B U3a — ADR 0110 N11's properties, AC1 (f), (c)(iii), (g) and (h). Each is swept over a range
// and each is held to a rule restated from the record (N11.1-N11.4, RQ23, ADR 0108 H3), never read
// back from `u-composition.ts`: the fridge's place, the bottle against the drawers on wall A, the
// sink on wall A, and no generated tall column in a room lower than the column.
//
// A property over a range can pass by landing only on rooms the change did not touch, so every
// sweep below counts the arms it branches on and holds each at 1 or more (or at the floor AC1
// names): a free-end fridge with 400-599 mm beyond it, the four N11.2 bands, a sink refused for
// want of room on wall A, a fridge gap filled with door bases.
import { fc, test as propertyTest } from "@fast-check/vitest";
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
import {
  fridgeWallFindings,
  fridgeWallOf,
  isTheBottleNotOwedToADrawerArm,
  uPlanFindings,
} from "../support/u-plan-invariants.js";

const RUNS = 300;
const DECLARED = declaredColumnSizes(
  buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN)),
);

const MODULE_MM = 600;
const COLUMN_HEIGHT_MM = 2200;
/** ADR 0110 E3 clause 4: "the engine limits … admit 860 mm" — the top of the base row. */
const ENGINE_HEIGHT_FLOOR_MM = 860;
const TALL_COLUMN_BUILD_IDS = ["tall-pantry", "tall-oven-tower"];

function uRoom(
  widthMm: number,
  depthMm: number,
  wallCMm: number,
  heightMm = 2600,
): DesignRoom {
  return { shape: "U", widthMm, depthMm, wallCMm, heightMm };
}

function planWithRuns(room: DesignRoom) {
  const runs = uShellFloorRuns(room);
  const plan = planUKitchenComposition({ room, runs, columns: DECLARED });
  return { room, runs, plan };
}

type Planned = ReturnType<typeof planWithRuns>;
type PlannedBase = Planned["plan"]["bases"][number];

function basesOn(planned: Planned, wall: DesignWall): readonly PlannedBase[] {
  return planned.plan.bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm);
}

function isDrawerExtra(base: PlannedBase): boolean {
  return (
    (base.buildId === "base-3drawer" || base.buildId === "base-panbank") &&
    base.role !== "preparation"
  );
}

function runLengthMm(planned: Planned, wall: DesignWall): number {
  return planned.runs[wall].endMm - planned.runs[wall].startMm;
}

const sideWallArb = fc.oneof(
  fc.integer({ min: 1000, max: 6000 }),
  fc.constantFrom(1699, 1700, 2999, 3000, 3001, 3999, 4000, 4001),
);

const approvedRoomArb = fc
  .tuple(
    fc.integer({ min: 2700, max: 6000 }),
    sideWallArb,
    sideWallArb,
    fc.constantFrom(2200, 2600, 3900),
  )
  .map(([widthMm, depthMm, wallCMm, heightMm]) =>
    uRoom(widthMm, depthMm, wallCMm, heightMm),
  );

// ---------------------------------------------------------------------------------------------
// (f) The fridge's place — N11.1
// ---------------------------------------------------------------------------------------------

function fridgeWallArmsOf(planned: Planned): readonly string[] {
  const { plan, room } = planned;
  const fridge = plan.bases.find((base) => base.role === "fridge");
  if (fridge === undefined) return ["dropped"];
  if (plan.fridgePosition !== "free-end") return ["counted"];
  const beyondMm = plan.remainderMm[fridgeWallOf(room)];
  if (beyondMm >= 400) return ["free-end, 400-599 bare beyond"];
  return beyondMm > 0 ? ["free-end, 1-399 bare beyond"] : ["free-end, flush"];
}

/** A on two lengths (the fridge wall does not depend on it), and both side walls in 100 mm steps. */
function fridgeWallGridRooms(): readonly DesignRoom[] {
  const rooms: DesignRoom[] = [];
  for (const widthMm of [2700, 4500]) {
    for (let depthMm = 1000; depthMm <= 6000; depthMm += 100) {
      for (let wallCMm = 1000; wallCMm <= 6000; wallCMm += 100) {
        rooms.push(uRoom(widthMm, depthMm, wallCMm));
      }
    }
  }
  return rooms;
}

function sideWallLeadingGapFindings(planned: Planned): readonly string[] {
  return (["B", "C"] as const).flatMap((wall) => {
    const first = basesOn(planned, wall)[0];
    return first !== undefined && first.startMm !== planned.runs[wall].startMm
      ? [
          `${wall}: ${String(first.startMm - planned.runs[wall].startMm)} mm bare at the corner`,
        ]
      : [];
  });
}

function fridgePlaceFindingsOf(room: DesignRoom): readonly string[] {
  const planned = planWithRuns(room);
  if (!planned.plan.minimumMet) return [];
  return [
    ...fridgeWallFindings(planned),
    ...sideWallLeadingGapFindings(planned),
  ];
}

describe("the fridge's place (N11.1, AC1 f)", () => {
  propertyTest.prop([approvedRoomArb], { numRuns: RUNS })(
    "stands after door storage from the corner with the bare remainder beyond it, or after its counted bases with only pantries beyond",
    (room) => {
      expect(fridgePlaceFindingsOf(room)).toStrictEqual([]);
    },
  );

  it("visits every arm of the rule, and holds it in each, over the side walls' whole range", () => {
    const rooms = fridgeWallGridRooms();
    const armCounts = new Map<string, number>();
    const failing: string[] = [];
    for (const room of rooms) {
      const planned = planWithRuns(room);
      if (!planned.plan.minimumMet) continue;
      for (const arm of fridgeWallArmsOf(planned)) {
        armCounts.set(arm, (armCounts.get(arm) ?? 0) + 1);
      }
      if (fridgePlaceFindingsOf(room).length > 0)
        failing.push(JSON.stringify(room));
    }

    expect(armCounts.get("free-end, 400-599 bare beyond") ?? 0).toBeGreaterThan(
      0,
    );
    expect(armCounts.get("free-end, 1-399 bare beyond") ?? 0).toBeGreaterThan(
      0,
    );
    expect(armCounts.get("free-end, flush") ?? 0).toBeGreaterThan(0);
    expect(armCounts.get("counted") ?? 0).toBeGreaterThan(0);
    expect(armCounts.get("dropped") ?? 0).toBeGreaterThan(0);
    expect(failing).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// (c)(iii) The bottle on wall A against the drawers — N11.2 as the owner's RQ23 answer narrowed it
// ---------------------------------------------------------------------------------------------

/** How much of wall A's run stands free after the hob, read from the hob's own far edge in run
 *  direction: wall A runs from the fridge corner, so a fridge on B reads it upward, one on C downward. */
function freeAfterTheHobOnWallAMm(planned: Planned): number | undefined {
  const hob = planned.plan.bases.find((base) => base.role === "hob");
  if (hob === undefined || hob.wall !== "A") return undefined;
  const runA = planned.runs.A;
  return fridgeWallOf(planned.room) === "B"
    ? runA.endMm - hob.endMm
    : hob.startMm - runA.startMm;
}

/** The four bands of N11.2's table plus the band that keeps its bottle, as RQ23 left them. */
type BottleBand = "600" | "700-800" | "900-1100" | "1200-1400" | "1800";

function bottleBandOf(freeMm: number): BottleBand | undefined {
  if (freeMm === 600) return "600";
  if (freeMm >= 700 && freeMm <= 800) return "700-800";
  if (freeMm >= 900 && freeMm <= 1100) return "900-1100";
  if (freeMm >= 1200 && freeMm <= 1400) return "1200-1400";
  return freeMm === 1800 ? "1800" : undefined;
}

/** The bottle yields where dropping it lets wall A hold a drawer it otherwise could not (the drawer
 *  takes the place, owner N11.2) and stands where a drawer still follows it (RQ23), and never stands
 *  over a whole free module that a drawer could have used: 600-899 mm free means no bottle and a
 *  drawer on A, 900-1100 mm means the bottle stands, and a bottle with no drawer after it on A has
 *  under 600 mm free in all. */
function checkTheBottleAndTheDrawersOnWallA(room: DesignRoom): void {
  const planned = planWithRuns(room);
  const freeMm = freeAfterTheHobOnWallAMm(planned);
  if (!planned.plan.minimumMet || freeMm === undefined) return;
  const onWallA = basesOn(planned, "A");
  const bottle = onWallA.find((base) => base.buildId === "base-bottle-cargo");
  const drawersOnWallA = onWallA.filter(isDrawerExtra).length;
  const label = `${JSON.stringify(room)} (${String(freeMm)} mm free after the hob)`;

  if (freeMm >= MODULE_MM && freeMm < MODULE_MM + DECLARED.bottleWidthMm) {
    expect(bottle, label).toBeUndefined();
    expect(drawersOnWallA, label).toBeGreaterThanOrEqual(1);
  }
  if (freeMm >= 900 && freeMm <= 1100) {
    expect(bottle, label).toBeDefined();
  }
  if (bottle !== undefined && drawersOnWallA === 0) {
    expect(freeMm, label).toBeLessThan(MODULE_MM);
  }
}

/** A in 100 mm steps, so every free-after-the-hob width from 0 up appears; the side walls in 500 mm
 *  steps, which is enough to vary who takes the extras that go round the corner. */
function wallAHobGridRooms(): readonly DesignRoom[] {
  const rooms: DesignRoom[] = [];
  for (let widthMm = 2700; widthMm <= 6000; widthMm += 100) {
    for (let depthMm = 1000; depthMm <= 6000; depthMm += 500) {
      for (let wallCMm = 1000; wallCMm <= 6000; wallCMm += 500) {
        rooms.push(uRoom(widthMm, depthMm, wallCMm));
      }
    }
  }
  return rooms;
}

/** Wall A between 4700 and 5500 mm, where the width after a full core's hob runs from 500 to 1300 mm
 *  and so crosses the bands, with the side walls free. */
const bottleBandsRoomArb = fc
  .tuple(
    fc.integer({ min: 4700, max: 5500 }),
    sideWallArb,
    sideWallArb,
    fc.constantFrom(2200, 2600, 3900),
  )
  .map(([widthMm, depthMm, wallCMm, heightMm]) =>
    uRoom(widthMm, depthMm, wallCMm, heightMm),
  );

describe("the bottle and the drawers on wall A (N11.2, RQ23, AC1 c iii)", () => {
  propertyTest.prop([approvedRoomArb], { numRuns: RUNS })(
    "the bottle yields only to a drawer wall A could otherwise not hold, and stands over no free module",
    checkTheBottleAndTheDrawersOnWallA,
  );

  propertyTest.prop([bottleBandsRoomArb], { numRuns: RUNS })(
    "the same, drawn where wall A's free width after the hob crosses N11.2's bands",
    checkTheBottleAndTheDrawersOnWallA,
  );

  it("visits each band, dropping the bottle in the 600 and 700-800 mm bands and keeping it in the 900-1100 mm band", () => {
    const bandCounts = new Map<
      BottleBand,
      { total: number; withBottle: number }
    >();
    for (const room of wallAHobGridRooms()) {
      const planned = planWithRuns(room);
      const freeMm = freeAfterTheHobOnWallAMm(planned);
      const band = freeMm === undefined ? undefined : bottleBandOf(freeMm);
      if (!planned.plan.minimumMet || band === undefined) continue;
      const counts = bandCounts.get(band) ?? { total: 0, withBottle: 0 };
      counts.total += 1;
      counts.withBottle += planned.plan.bases.some(
        (base) => base.buildId === "base-bottle-cargo",
      )
        ? 1
        : 0;
      bandCounts.set(band, counts);
      checkTheBottleAndTheDrawersOnWallA(room);
    }

    expect(bandCounts.get("600")?.total ?? 0).toBeGreaterThanOrEqual(1);
    expect(bandCounts.get("600")?.withBottle).toBe(0);
    expect(bandCounts.get("700-800")?.total ?? 0).toBeGreaterThanOrEqual(1);
    expect(bandCounts.get("700-800")?.withBottle).toBe(0);
    expect(bandCounts.get("900-1100")?.total ?? 0).toBeGreaterThanOrEqual(1);
    expect(bandCounts.get("900-1100")?.withBottle).toBe(
      bandCounts.get("900-1100")?.total,
    );
    expect(bandCounts.get("1200-1400")?.withBottle ?? 0).toBeGreaterThanOrEqual(
      1,
    );
    expect(bandCounts.get("1800")?.withBottle ?? 0).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------------------------
// (g) The sink stands on wall A — N11.3, ADR 0108 H3
// ---------------------------------------------------------------------------------------------

/** ADR 0108 H3, restated: `freeA ≥ 1200`, or `freeA ≥ 600` and the far wall's free run is at least
 *  600. The far wall is the narrower side wall, and C on a tie (the fridge takes the wider, B on a
 *  tie). */
function holdsTheMinimumKitchenH3(planned: Planned): boolean {
  const { room } = planned;
  const farWall: DesignWall = room.depthMm >= (room.wallCMm ?? 0) ? "C" : "B";
  const freeAMm = runLengthMm(planned, "A");
  const freeFarMm = runLengthMm(planned, farWall);
  return (
    freeAMm >= 2 * MODULE_MM || (freeAMm >= MODULE_MM && freeFarMm >= MODULE_MM)
  );
}

function checkH3AndTheSinkOnWallA(room: DesignRoom): void {
  const planned = planWithRuns(room);

  expect(planned.plan.minimumMet, JSON.stringify(room)).toBe(
    holdsTheMinimumKitchenH3(planned),
  );
  if (planned.plan.minimumMet) {
    const sink = planned.plan.bases.find((base) => base.role === "sink");
    expect(sink?.wall, JSON.stringify(room)).toBe("A");
  }
}

const engineBandRoomArb = fc
  .tuple(
    fc.integer({ min: 1800, max: 3100 }),
    sideWallArb,
    sideWallArb,
    fc.constantFrom(2200, 2600, 3900),
  )
  .map(([widthMm, depthMm, wallCMm, heightMm]) =>
    uRoom(widthMm, depthMm, wallCMm, heightMm),
  );

/** A across the engine band with the boundaries at 1 mm (freeA 599/600 and 1199/1200), the side walls
 *  at the far wall's own 1599/1600 boundary and on a tie. */
function engineBandGridRooms(): readonly DesignRoom[] {
  const wallAValuesMm = new Set<number>();
  for (let widthMm = 1800; widthMm <= 3100; widthMm += 50)
    wallAValuesMm.add(widthMm);
  for (let widthMm = 2390; widthMm <= 2410; widthMm += 1)
    wallAValuesMm.add(widthMm);
  for (let widthMm = 2990; widthMm <= 3010; widthMm += 1)
    wallAValuesMm.add(widthMm);
  const sideValuesMm = [1000, 1500, 1599, 1600, 2000, 3000, 4000, 6000];
  return [...wallAValuesMm].flatMap((widthMm) =>
    sideValuesMm.flatMap((depthMm) =>
      sideValuesMm.map((wallCMm) => uRoom(widthMm, depthMm, wallCMm)),
    ),
  );
}

describe("the sink stands on wall A, and the plan meets H3 exactly (N11.3, AC1 g)", () => {
  propertyTest.prop([engineBandRoomArb], { numRuns: RUNS })(
    "composes if and only if ADR 0108 H3's predicate holds, and always with the sink on A",
    checkH3AndTheSinkOnWallA,
  );

  it("sweeps at least 200 rooms, 50 of them with under 600 mm free on A, and reaches both H3 outcomes", () => {
    const rooms = engineBandGridRooms();
    let withUnder600FreeOnA = 0;
    let acceptedThroughTheFarWall = 0;
    let refusedForTheFarWall = 0;
    let acceptedOnAAlone = 0;
    for (const room of rooms) {
      const planned = planWithRuns(room);
      const freeAMm = runLengthMm(planned, "A");
      if (freeAMm < MODULE_MM) withUnder600FreeOnA += 1;
      const isBetween = freeAMm >= MODULE_MM && freeAMm < 2 * MODULE_MM;
      if (isBetween && planned.plan.minimumMet) acceptedThroughTheFarWall += 1;
      if (isBetween && !planned.plan.minimumMet) refusedForTheFarWall += 1;
      if (freeAMm >= 2 * MODULE_MM && planned.plan.minimumMet)
        acceptedOnAAlone += 1;
      checkH3AndTheSinkOnWallA(room);
    }

    expect(rooms.length).toBeGreaterThanOrEqual(200);
    expect(withUnder600FreeOnA).toBeGreaterThanOrEqual(50);
    expect(acceptedThroughTheFarWall).toBeGreaterThanOrEqual(1);
    expect(refusedForTheFarWall).toBeGreaterThanOrEqual(1);
    expect(acceptedOnAAlone).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------------------------
// (h) No tall column in a room lower than it — N11.4, E3 clause 4
// ---------------------------------------------------------------------------------------------

const anyHeightArb = fc.oneof(
  fc.integer({ min: ENGINE_HEIGHT_FLOOR_MM, max: COLUMN_HEIGHT_MM - 1 }),
  fc.constantFrom(COLUMN_HEIGHT_MM - 1, COLUMN_HEIGHT_MM, 2600, 3900),
);

const heightSweptRoomArb = fc
  .tuple(
    fc.integer({ min: 2700, max: 6000 }),
    sideWallArb,
    sideWallArb,
    anyHeightArb,
  )
  .map(([widthMm, depthMm, wallCMm, heightMm]) =>
    uRoom(widthMm, depthMm, wallCMm, heightMm),
  );

function tallColumnsIn(planned: Planned): readonly PlannedBase[] {
  return planned.plan.bases.filter((base) =>
    TALL_COLUMN_BUILD_IDS.includes(base.buildId),
  );
}

function checkNoTallColumnInALowRoomAndEveryEndBare(room: DesignRoom): void {
  const planned = planWithRuns(room);
  if (!planned.plan.minimumMet) return;
  const label = JSON.stringify(room);

  if (room.heightMm < COLUMN_HEIGHT_MM) {
    expect(
      tallColumnsIn(planned).map((base) => base.id),
      label,
    ).toStrictEqual([]);
  }
  for (const wall of ["A", "B", "C"] as const) {
    expect(
      planned.plan.remainderMm[wall],
      `${wall} ${label}`,
    ).toBeGreaterThanOrEqual(0);
    expect(planned.plan.remainderMm[wall], `${wall} ${label}`).toBeLessThan(
      MODULE_MM,
    );
  }
  expect(
    uPlanFindings({ room, runs: planned.runs, plan: planned.plan }),
    label,
  ).toStrictEqual([]);
}

function heightGridRooms(): readonly DesignRoom[] {
  const heightsMm = [
    ENGINE_HEIGHT_FLOOR_MM,
    1500,
    2000,
    2199,
    2200,
    2600,
    3900,
  ];
  const rooms: DesignRoom[] = [];
  for (const heightMm of heightsMm) {
    for (const widthMm of [2700, 3600, 4500, 6000]) {
      for (let depthMm = 1000; depthMm <= 6000; depthMm += 250) {
        for (let wallCMm = 1000; wallCMm <= 6000; wallCMm += 250) {
          rooms.push(uRoom(widthMm, depthMm, wallCMm, heightMm));
        }
      }
    }
  }
  return rooms;
}

function fridgeGapDoorBasesIn(planned: Planned): readonly PlannedBase[] {
  return planned.plan.bases.filter((base) => base.id.startsWith("fridge-gap:"));
}

describe("no generated tall column stands in a room lower than the column (N11.4, AC1 h)", () => {
  propertyTest.prop([heightSweptRoomArb], { numRuns: RUNS })(
    "a room lower than 2200 mm has no pantry and no tower, every end is under 600 mm bare, and the plan keeps every other rule",
    checkNoTallColumnInALowRoomAndEveryEndBare,
  );

  it("fills a low room's fridge gap with door bases, and a tall-enough room's with pantries, over the whole grid", () => {
    let lowRoomsWithADoorBaseGap = 0;
    let tallRoomsWithAPantryGap = 0;
    for (const room of heightGridRooms()) {
      const planned = planWithRuns(room);
      if (!planned.plan.minimumMet) continue;
      const gapBases = fridgeGapDoorBasesIn(planned);
      if (room.heightMm < COLUMN_HEIGHT_MM && gapBases.length > 0) {
        lowRoomsWithADoorBaseGap += 1;
        expect(
          gapBases.every(
            (base) =>
              base.buildId === "base-cabinet" && base.widthMm === MODULE_MM,
          ),
          JSON.stringify(room),
        ).toBe(true);
      }
      if (
        room.heightMm >= COLUMN_HEIGHT_MM &&
        gapBases.some((base) => base.buildId === "tall-pantry")
      ) {
        tallRoomsWithAPantryGap += 1;
      }
      checkNoTallColumnInALowRoomAndEveryEndBare(room);
    }

    expect(lowRoomsWithADoorBaseGap).toBeGreaterThanOrEqual(1);
    expect(tallRoomsWithAPantryGap).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------------------------
// The bottle is not dropped while the far wall can take the drawer — N11.2, RQ23, RQ21
// ---------------------------------------------------------------------------------------------

/** A in 100 mm steps and both side walls in 200 mm steps: the arm needs a wall-A hob with 1200 mm or
 *  more free after it, and the far wall's width decides whether it can take the displaced drawer. */
function bottleNotOwedGridRooms(): readonly DesignRoom[] {
  const rooms: DesignRoom[] = [];
  for (let widthMm = 2700; widthMm <= 6000; widthMm += 100) {
    for (let depthMm = 1000; depthMm <= 6000; depthMm += 200) {
      for (let wallCMm = 1000; wallCMm <= 6000; wallCMm += 200) {
        rooms.push(uRoom(widthMm, depthMm, wallCMm));
      }
    }
  }
  return rooms;
}

describe("the bottle is not dropped while the far wall can take the drawer (N11.2, RQ23, RQ21)", () => {
  it("finds no plain door base on the far wall wherever a room at N(T) has no bottle over 1200 mm free after a wall-A hob", () => {
    let roomsInTheArm = 0;
    const failing: string[] = [];
    for (const room of bottleNotOwedGridRooms()) {
      const { runs, plan } = planWithRuns(room);
      if (
        !plan.minimumMet ||
        !isTheBottleNotOwedToADrawerArm({ room, runs, plan })
      ) {
        continue;
      }
      roomsInTheArm += 1;
      if (uPlanFindings({ room, runs, plan }).length > 0)
        failing.push(JSON.stringify(room));
    }

    expect(roomsInTheArm).toBeGreaterThanOrEqual(300);
    expect(failing).toStrictEqual([]);
  });
});
