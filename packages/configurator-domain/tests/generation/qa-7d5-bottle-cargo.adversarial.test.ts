// M7 wave 7D5 S1 — the bottle cargo is optional to the core kitchen. This file derives the
// pre-S1 core-selection answer from run capacities and the public priority list; it does not ask the
// S1 implementation whether omitting the cargo was necessary.
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  buildLShellDesign,
  cabinetDepthMmOf,
  declaredColumnSizes,
  generateKitchen,
  GENERATION_PRIORITIES,
  isComposedStorageSlot,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  wallLengthMm,
  type DesignRoom,
  type DesignWall,
  type GenerationCoreRole,
  type GenerationRun,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
} from "../../src/index.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import { facesOf, openingIntervalOf } from "../support/shell-design.js";

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";
const GRID_STEP_MM = 10;
const BOTTLE_WIDTH_MM = 300;
const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);

function planFor(room: DesignRoom): KitchenCompositionPlan {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

function runWidth(run: GenerationRun): number {
  return Math.max(0, run.endMm - run.startMm);
}

function preferredCutAcrossTheCorner(
  widthsMm: readonly number[],
  capacities: { readonly prefix: number; readonly suffix: number },
  preferredCut: number,
): number | undefined {
  return Array.from({ length: widthsMm.length + 1 }, (_, cut) => cut)
    .filter((cut) => {
      const prefix = widthsMm
        .slice(0, cut)
        .reduce((sum, widthMm) => sum + widthMm, 0);
      const suffix = widthsMm
        .slice(cut)
        .reduce((sum, widthMm) => sum + widthMm, 0);
      return prefix <= capacities.prefix && suffix <= capacities.suffix;
    })
    .sort((left, right) => {
      const leftDistance = Math.abs(left - preferredCut);
      const rightDistance = Math.abs(right - preferredCut);
      return leftDistance === rightDistance
        ? left - right
        : leftDistance - rightDistance;
    })[0];
}

function capacitiesByReadingRole(room: DesignRoom): {
  readonly prefix: number;
  readonly suffix: number;
} {
  const runs = lShellFloorRuns(room);
  const { prefix, suffix } = readingWallsOf(room);
  return {
    prefix: runWidth(runs[prefix]),
    suffix: runWidth(runs[suffix]),
  };
}

const CORE_ATTEMPTS = [
  GENERATION_PRIORITIES,
  GENERATION_PRIORITIES.filter((item) => item.role !== "fridge"),
  GENERATION_PRIORITIES.filter(
    (item) => item.role !== "fridge" && item.role !== "preparation",
  ),
] as const;

type CoreAttempt = (typeof CORE_ATTEMPTS)[number];

function preferredCutOf(kept: CoreAttempt): number {
  return kept[0]?.role === "fridge" ? 1 : 0;
}

function expectedPreS1Core(room: DesignRoom): {
  readonly minimumMet: boolean;
  readonly dropped: readonly GenerationCoreRole[];
  readonly kept?: CoreAttempt;
  readonly cut?: number;
} {
  const capacities = capacitiesByReadingRole(room);
  for (const kept of CORE_ATTEMPTS) {
    const cut = preferredCutAcrossTheCorner(
      kept.map((item) => item.widthMm),
      capacities,
      preferredCutOf(kept),
    );
    if (cut === undefined) continue;
    const keptRoles = new Set(kept.map((item) => item.role));
    return {
      minimumMet: true,
      dropped: GENERATION_PRIORITIES.filter(
        (item) => !keptRoles.has(item.role),
      ).map((item) => item.role),
      kept,
      cut,
    };
  }
  return {
    minimumMet: false,
    dropped: GENERATION_PRIORITIES.map((item) => item.role),
  };
}

function firstUnconditionalBottleAttempt(
  room: DesignRoom,
): { readonly kept: CoreAttempt; readonly cut: number } | undefined {
  const capacities = capacitiesByReadingRole(room);
  for (const kept of CORE_ATTEMPTS) {
    const cut = preferredCutAcrossTheCorner(
      [...kept.map((item) => item.widthMm), BOTTLE_WIDTH_MM],
      capacities,
      preferredCutOf(kept),
    );
    if (cut !== undefined) return { kept, cut };
  }
  return undefined;
}

function alongTheWall(
  plan: KitchenCompositionPlan,
  wall: DesignWall,
): readonly PlannedGenerationBase[] {
  return plan.bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm);
}

function readingWallsOf(room: DesignRoom): {
  readonly prefix: DesignWall;
  readonly suffix: DesignWall;
} {
  const prefix: DesignWall =
    wallLengthMm("B", room) > wallLengthMm("A", room) ? "A" : "B";
  return { prefix, suffix: prefix === "A" ? "B" : "A" };
}

function inReadingOrder(
  plan: KitchenCompositionPlan,
): readonly PlannedGenerationBase[] {
  const { prefix, suffix } = readingWallsOf(plan.room);
  return [
    ...[...alongTheWall(plan, prefix)].reverse(),
    ...alongTheWall(plan, suffix),
  ];
}

/** Every kept core role whose planned wall is not the side of the pre-S1 cut it belongs to:
 *  `kept.slice(0, cut)` reads on the prefix wall and `kept.slice(cut)` on the suffix wall. */
function coreRolesOffTheirPreS1Wall(
  plan: KitchenCompositionPlan,
  preS1: { readonly kept: CoreAttempt; readonly cut: number },
): readonly string[] {
  const { prefix, suffix } = readingWallsOf(plan.room);
  return preS1.kept.flatMap((item, index) => {
    const expectedWall = index < preS1.cut ? prefix : suffix;
    const actualWalls = plan.bases
      .filter((base) => base.role === item.role)
      .map((base) => base.wall);
    return actualWalls.length === 1 && actualWalls[0] === expectedWall
      ? []
      : [
          `${item.role} on ${actualWalls.join("+") || "none"}, not ${expectedWall}`,
        ];
  });
}

describe("7D5 S1 — the conditional bottle cargo", () => {
  it("preserves every pre-S1 kitchen and core role across the approved 10 mm rectangle", () => {
    const l = APPROVED_ROOM_POLICY.buildableShapes.L;
    if (!l) throw new Error("the approved policy declares no L room");
    const census = {
      swept: 0,
      placed: 0,
      bottleIncluded: 0,
      bottleOmitted: 0,
      omittedForCoreRole: 0,
      omittedForRefusal: 0,
      omittedForReCut: 0,
      wrongCore: [] as string[],
      wrongOrder: [] as string[],
      coreOffItsWall: [] as string[],
      duplicateBottle: [] as string[],
      includedByArm: { aWider: 0, bWider: 0, equal: 0 },
    };

    for (
      let widthMm = l.wallA.minMm;
      widthMm <= l.wallA.maxMm;
      widthMm += GRID_STEP_MM
    ) {
      for (
        let depthMm = l.wallB.minMm;
        depthMm <= l.wallB.maxMm;
        depthMm += GRID_STEP_MM
      ) {
        census.swept += 1;
        const room: DesignRoom = {
          shape: "L",
          widthMm,
          depthMm,
          heightMm: 2600,
        };
        const expected = expectedPreS1Core(room);
        const plan = planFor(room);
        const key = `${String(widthMm)}x${String(depthMm)}`;
        if (
          plan.minimumMet !== expected.minimumMet ||
          plan.dropped.join(",") !== expected.dropped.join(",")
        ) {
          census.wrongCore.push(key);
        }
        if (!plan.minimumMet) continue;
        census.placed += 1;
        if (expected.kept !== undefined && expected.cut !== undefined) {
          const offTheirWall = coreRolesOffTheirPreS1Wall(plan, {
            kept: expected.kept,
            cut: expected.cut,
          });
          if (offTheirWall.length > 0) {
            census.coreOffItsWall.push(`${key}: ${offTheirWall.join("; ")}`);
          }
        }

        const reading = inReadingOrder(plan);
        // The stable composition id is the key and the catalogue id is the thing asserted. Asking
        // the exported build-id constant to identify both would let a wrong constant and a wrong
        // composer agree with each other (ADR 0121 decision 3(b)).
        const bottles = reading.filter((base) => base.id === "bottle");
        if (bottles.length > 1) census.duplicateBottle.push(key);
        if (bottles.length === 1) {
          census.bottleIncluded += 1;
          const hobAt = reading.findIndex((base) => base.role === "hob");
          const bottleAt = reading.findIndex((base) => base.id === "bottle");
          if (bottleAt !== hobAt + 1) census.wrongOrder.push(key);
          if (widthMm > depthMm) census.includedByArm.aWider += 1;
          else if (depthMm > widthMm) census.includedByArm.bWider += 1;
          else census.includedByArm.equal += 1;
          continue;
        }

        census.bottleOmitted += 1;
        const unconditional = firstUnconditionalBottleAttempt(room);
        if (unconditional === undefined) {
          census.omittedForRefusal += 1;
        } else if (unconditional.kept.length < (expected.kept?.length ?? 0)) {
          census.omittedForCoreRole += 1;
        } else if (unconditional.cut !== expected.cut) {
          // ADR 0120 Amendment E: the same core fits with the bottle only across a different cut,
          // which would move a core role to the other wall.
          census.omittedForReCut += 1;
        } else {
          census.wrongCore.push(
            `${key}: bottle omitted although the same core fits`,
          );
        }
      }
    }

    const { includedByArm, ...totals } = census;
    expect(totals).toEqual({
      swept: 256_011,
      placed: 245_211,
      bottleIncluded: 220_266,
      bottleOmitted: 24_945,
      omittedForCoreRole: 15_445,
      omittedForRefusal: 4_545,
      omittedForReCut: 4_955,
      wrongCore: [],
      wrongOrder: [],
      coreOffItsWall: [],
      duplicateBottle: [],
    });
    expect(includedByArm.aWider).toBeGreaterThan(0);
    expect(includedByArm.bWider).toBeGreaterThan(0);
    expect(includedByArm.equal).toBeGreaterThan(0);
  }, 20_000);

  it.each([
    { shape: "L", widthMm: 6000, depthMm: 4700, heightMm: 2600 },
    { shape: "L", widthMm: 4700, depthMm: 6000, heightMm: 2600 },
    { shape: "L", widthMm: 6000, depthMm: 6000, heightMm: 2600 },
  ] as const)(
    "keeps the bottle out of composed-storage identity in %o",
    (room) => {
      const plan = planFor(room);
      const bottle = plan.bases.find((base) => base.id === "bottle");

      expect(bottle).toMatchObject({
        id: "bottle",
        role: "storage",
        buildId: "base-bottle-cargo",
        widthMm: 300,
      });
      expect(bottle ? isComposedStorageSlot(bottle) : undefined).toBe(false);
    },
  );

  it.each([
    { shape: "L", widthMm: 1500, depthMm: 2800, heightMm: 2600 },
    { shape: "L", widthMm: 2861, depthMm: 2849, heightMm: 2600 },
    { shape: "L", widthMm: 2956, depthMm: 2824, heightMm: 2600 },
  ] as const)(
    "omits the bottle rather than moving the sink off the wider wall in %o",
    (room) => {
      const widerWall: DesignWall =
        wallLengthMm("B", room) > wallLengthMm("A", room) ? "B" : "A";

      const plan = planFor(room);

      expect(plan.bases.find((base) => base.role === "sink")?.wall).toBe(
        widerWall,
      );
      expect(plan.bases.some((base) => base.id === "bottle")).toBe(false);
    },
  );

  it("places the 300 mm cargo through a 350 mm merged opening at the same start", () => {
    const room: DesignRoom = {
      shape: "L",
      widthMm: 1850,
      depthMm: 1600,
      heightMm: 2600,
    };
    const plan = planFor(room);
    expect(plan.floorWidthsMm.A).toEqual([600, 300]);
    expect(plan.remainderMm.A).toBe(50);

    const shell = buildLShellDesign({
      room,
      occurredAt: OCCURRED_AT,
      compositionPlan: { floorWidthsMm: plan.floorWidthsMm },
    });
    const coveringOpening = facesOf(shell).voids.find((opening) => {
      if (opening.wall !== "A" || Math.round(opening.y0 * 1000) !== 0)
        return false;
      const interval = openingIntervalOf(opening);
      return interval.startMm === 1500 && interval.endMm === 1850;
    });
    expect(coveringOpening).toBeDefined();

    const result = generateKitchen({
      room,
      occurredAt: OCCURRED_AT,
      probeAt: createFakeProbeFactory(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason.code);
    const cargo = result.design.placements.find(
      (placement) => placement.body.buildId === "base-bottle-cargo",
    );
    expect(cargo).toMatchObject({ wall: "A", alongMm: 1650 });
    expect(cargo?.body.widthMm).toBe(300);
    expect(result.log.steps.find((step) => step.id === "bottle")).toMatchObject(
      { status: "placed", buildId: "base-bottle-cargo" },
    );
  });

  // The merge cap is inclusive: a 300 mm tile plus a 500 mm run-end remainder is one 800 mm
  // (`MAX_EMPTY_COLUMN_WIDTH_MM`) opening at the bottle's start, so the bottle is inserted into an
  // opening wider than itself. The non-merging neighbour is 502, not 501: the floor run's planned end
  // moves in 2 mm steps (3501 x 1700 plans the same 500 mm remainder as 3500 x 1700), so a 501 mm
  // remainder is unreachable through a room. Both mirrors, so no wall letter decides it.
  it.each([
    {
      name: "wall A, remainder 500 merges into one 800 mm opening",
      room: { shape: "L", widthMm: 3500, depthMm: 1700, heightMm: 2600 },
      wall: "A",
      bottleStartMm: 2700,
      remainderMm: 500,
      trailingOpenings: [{ startMm: 2700, endMm: 3500 }],
    },
    {
      name: "wall A, remainder 502 stays a separate opening",
      room: { shape: "L", widthMm: 3502, depthMm: 1700, heightMm: 2600 },
      wall: "A",
      bottleStartMm: 2700,
      remainderMm: 502,
      trailingOpenings: [
        { startMm: 2700, endMm: 3000 },
        { startMm: 3000, endMm: 3502 },
      ],
    },
    {
      name: "wall B, remainder 500 merges into one 800 mm opening",
      room: { shape: "L", widthMm: 1500, depthMm: 4300, heightMm: 2600 },
      wall: "B",
      bottleStartMm: 3400,
      remainderMm: 500,
      trailingOpenings: [{ startMm: 3400, endMm: 4200 }],
    },
    {
      name: "wall B, remainder 502 stays a separate opening",
      room: { shape: "L", widthMm: 1500, depthMm: 4302, heightMm: 2600 },
      wall: "B",
      bottleStartMm: 3400,
      remainderMm: 502,
      trailingOpenings: [
        { startMm: 3400, endMm: 3700 },
        { startMm: 3700, endMm: 4202 },
      ],
    },
  ] as const)(
    "places the last-on-its-wall cargo at its planned start and 300 mm, $name",
    ({ room, wall, bottleStartMm, remainderMm, trailingOpenings }) => {
      const plan = planFor(room);
      const bottle = plan.bases.find((base) => base.id === "bottle");
      const lastEndOnWall = Math.max(
        ...plan.bases
          .filter((base) => base.wall === wall)
          .map((base) => base.endMm),
      );
      expect(bottle).toMatchObject({ wall, startMm: bottleStartMm });
      expect(bottle?.endMm).toBe(lastEndOnWall);
      expect(plan.remainderMm[wall]).toBe(remainderMm);

      const shell = buildLShellDesign({
        room,
        occurredAt: OCCURRED_AT,
        compositionPlan: { floorWidthsMm: plan.floorWidthsMm },
      });
      const floorOpeningsFromTheBottle = facesOf(shell)
        .voids.filter(
          (opening) =>
            opening.wall === wall && Math.round(opening.y0 * 1000) === 0,
        )
        .map(openingIntervalOf)
        .filter((interval) => interval.startMm >= bottleStartMm)
        .sort((left, right) => left.startMm - right.startMm);
      expect(floorOpeningsFromTheBottle).toEqual(trailingOpenings);

      const result = generateKitchen({
        room,
        occurredAt: OCCURRED_AT,
        probeAt: createFakeProbeFactory(),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.reason.code);
      const cargo = result.design.placements.find(
        (placement) => placement.body.buildId === "base-bottle-cargo",
      );
      expect(cargo).toMatchObject({
        wall,
        alongMm: bottleStartMm + BOTTLE_WIDTH_MM / 2,
      });
      expect(cargo?.body.widthMm).toBe(BOTTLE_WIDTH_MM);
      expect(
        result.log.steps.find((step) => step.id === "bottle"),
      ).toMatchObject({ status: "placed", buildId: "base-bottle-cargo" });
    },
  );
});

describe("7D5 S1 criterion 1 — the bottle follows the hob in the reading order on the reversed wall", () => {
  // Criterion 1's discriminating population is the hob on the wall laid out in reverse, where the
  // reading order runs against the spatial one: the bottle *after* the hob stands on the hob's
  // corner side. The approved policy never composes the hob onto that wall (`qa-7d8-the-run-follows-
  // the-wider-wall`, 7b), so the runs are declared here, as 7b declares them, over real rooms whose
  // narrower entered wall is the reversed one. Both mirrors are swept so no wall letter decides it.
  //
  // The reversed wall holds the whole core (2 500 mm) with room for the 300 mm bottle; the other
  // wall cannot hold the bottle. Keeping every core role where it stands without the bottle and
  // appending the bottle on the hob's corner side refuses nothing and moves no core role.
  const REVERSED_WALL_HOLDS_CORE_AND_BOTTLE = [
    {
      name: "wall A read in reverse",
      room: { shape: "L", widthMm: 1500, depthMm: 4000, heightMm: 2600 },
      runs: {
        A: { wall: "A", startMm: 900, endMm: 3900 },
        B: { wall: "B", startMm: 900, endMm: 1150 },
      },
      reversedWall: "A",
    },
    {
      name: "wall B read in reverse",
      room: { shape: "L", widthMm: 4000, depthMm: 1500, heightMm: 2600 },
      runs: {
        A: { wall: "A", startMm: 900, endMm: 1150 },
        B: { wall: "B", startMm: 1000, endMm: 4000 },
      },
      reversedWall: "B",
    },
  ] as const satisfies readonly {
    readonly name: string;
    readonly room: DesignRoom;
    readonly runs: Readonly<Record<DesignWall, GenerationRun>>;
    readonly reversedWall: DesignWall;
  }[];

  function planOnDeclaredRuns(
    room: DesignRoom,
    runs: Readonly<Record<DesignWall, GenerationRun>>,
  ): KitchenCompositionPlan {
    return planKitchenComposition({ room, runs, columns: DECLARED_COLUMNS });
  }

  it.each(REVERSED_WALL_HOLDS_CORE_AND_BOTTLE)(
    "stands the bottle against the hob's corner side, $name",
    ({ room, runs, reversedWall }) => {
      const plan = planOnDeclaredRuns(room, runs);
      const hob = plan.bases.find((base) => base.role === "hob");
      const bottle = plan.bases.find((base) => base.id === "bottle");

      expect(plan.dropped).toEqual([]);
      expect(hob?.wall).toBe(reversedWall);
      expect(bottle).toMatchObject({
        wall: reversedWall,
        buildId: "base-bottle-cargo",
        widthMm: BOTTLE_WIDTH_MM,
      });
      // Laid out in reverse, *after* the hob is towards the corner: the bottle ends where the hob
      // starts. A rule written for the non-reversed wall would put it at the hob's free-end side.
      expect(bottle?.endMm).toBe(hob?.startMm);
    },
  );

  it.each([
    ...REVERSED_WALL_HOLDS_CORE_AND_BOTTLE,
    {
      // 7b's declared arm: the other wall *can* hold the bottle, and the reversed wall also leaves
      // storage between the hob and the corner.
      name: "wall A read in reverse, with storage between the hob and the corner",
      room: { shape: "L", widthMm: 1500, depthMm: 4000, heightMm: 2600 },
      runs: {
        A: { wall: "A", startMm: 900, endMm: 4600 },
        B: { wall: "B", startMm: 900, endMm: 1400 },
      },
      reversedWall: "A",
    },
  ] as const)(
    "reads the bottle immediately after the hob and nowhere else, $name",
    ({ room, runs }) => {
      const reading = inReadingOrder(planOnDeclaredRuns(room, runs));
      const hobAt = reading.findIndex((base) => base.role === "hob");

      expect(reading.filter((base) => base.id === "bottle")).toHaveLength(1);
      expect(reading[hobAt + 1]?.id).toBe("bottle");
    },
  );
});
