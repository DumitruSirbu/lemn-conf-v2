// ADR 0130 D4–D6 (wave 7J S2, criteria A6–A8): a straight kitchen composes through the same
// `generateKitchen` as an L, on one wall, with an empty prefix and no branch.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  DISHWASHER_BUILD_ID,
  findOverflowingPlacementIds,
  generateKitchen,
  replayGenerationLog,
  validateDesignForCatalog,
  wallLengthMm,
  type Design,
  type DesignPlacement,
  type DesignRoom,
} from "../../src/index.js";
import { ENGINE_ROOM_LIMITS } from "../../src/room/room-policy.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-24T11:00:00.000Z";
const WALL_ROW_Y0_MM = 1500;
const CORE_ROLES = ["fridge", "sink", "preparation", "hob"] as const;
const HOB_BUILD_IDS = new Set(["base-hob-oven", "base-hob-2drawer"]);
/** ADR 0110 E12.1's oven tower — read from `tall-end-rule.ts`, restated here rather than imported
 *  (that module is not part of this package's public barrel, the same reason the L's own suite in
 *  `generate-kitchen.test.ts` spells `"base-hob-oven"` and `"tall-oven-tower"` directly). */
const OVEN_TOWER_BUILD_ID = "tall-oven-tower";

function linearRoom(widthMm: number, heightMm = 2600): DesignRoom {
  return { shape: "linear", widthMm, depthMm: 3400, heightMm };
}

function generate(room: DesignRoom) {
  return generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

type GeneratedKitchen = Extract<ReturnType<typeof generate>, { ok: true }>;

function baseBodies(design: Design): readonly DesignPlacement[] {
  return design.placements
    .filter((placement) => placement.wall === "A" && placement.y0Mm === 0)
    .slice()
    .sort((left, right) => left.alongMm - right.alongMm);
}

function farEdgeMm(placement: DesignPlacement): number {
  return placement.alongMm + placement.body.widthMm / 2;
}

function startMm(placement: DesignPlacement): number {
  return placement.alongMm - placement.body.widthMm / 2;
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`missing ${what}`);
  return value;
}

// =================================================================================================
// A6 — composition, swept.
// =================================================================================================

describe("generateKitchen — a straight kitchen, swept over the linear range", () => {
  const linearWallA = () => {
    const bounds = ENGINE_ROOM_LIMITS.buildableShapes.linear;
    if (!bounds) throw new Error("the engine builds no linear shape");
    return bounds.wallA;
  };

  const roomArbitrary = fc.record({
    widthMm: fc.integer({ min: linearWallA().minMm, max: linearWallA().maxMm }),
    heightMm: fc.integer({ min: 2200, max: 3900 }),
  });

  // The boundaries A6 names explicitly, beside the swept sample.
  const BOUNDARY_WIDTHS_MM = [
    1200, 1799, 1800, 1899, 1900, 2499, 2500, 3699, 3700, 4000, 4001, 4899,
    4900, 5999, 6000,
  ];

  function checkedRoom(room: DesignRoom): void {
    const first = generate(room);
    const second = generate(room);
    expect(second).toStrictEqual(first);
    if (!first.ok) throw new Error(`refused at ${String(room.widthMm)} mm`);

    const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(first.design));
    expect(validateDesignForCatalog(first.design, catalog)).toEqual([]);
    expect(findOverflowingPlacementIds(first.design)).toEqual([]);

    // Nothing on wall B — D4's own consequence.
    expect(
      first.design.placements.some((placement) => placement.wall === "B"),
    ).toBe(false);

    const bases = baseBodies(first.design);
    expect(bases.length).toBeGreaterThan(0);
    const firstBase = required(bases[0], "the run's first base");
    const lastBase = required(bases.at(-1), "the run's last base");
    // The first base starts at 0 — the run's own start, no corner to clear.
    expect(startMm(firstBase)).toBe(0);
    // Bare end under 600 (D6, matching G5/G6's model).
    const bareEndMm =
      wallLengthMm("A", first.design.room) - farEdgeMm(lastBase);
    expect(bareEndMm).toBeLessThan(600);
    expect(bareEndMm).toBeGreaterThanOrEqual(0);

    // Along-run order is a subsequence of fridge → sink → preparation → hob.
    const placedCoreSteps = first.log.steps.filter(
      (step): step is Extract<typeof step, { status: "placed" }> =>
        step.status === "placed" &&
        (CORE_ROLES as readonly string[]).includes(step.id),
    );
    const placedCoreIdByPlacementId = new Map(
      placedCoreSteps.map((step) => [step.placementId, step.id]),
    );
    const spatialCoreOrder = bases
      .filter((base) => placedCoreIdByPlacementId.has(base.id))
      .map((base) => placedCoreIdByPlacementId.get(base.id));
    const readingCoreOrder = CORE_ROLES.filter((role) =>
      first.log.steps.some(
        (step) => step.id === role && step.status === "placed",
      ),
    );
    expect(spatialCoreOrder).toEqual(readingCoreOrder);

    // Exactly one oven (E4), read the same way the L's own suite reads it.
    expect(
      first.design.placements.filter((placement) =>
        ["base-hob-oven", OVEN_TOWER_BUILD_ID].includes(placement.body.buildId),
      ),
    ).toHaveLength(1);

    // An upper over every base below the wall row, a hood over the hob, none over a full-height body.
    for (const base of bases) {
      const definition = catalog.get(base.body.buildId);
      const declaredTopMm = definition?.nominalHeightMm;
      if (declaredTopMm === undefined || declaredTopMm > WALL_ROW_Y0_MM) {
        // A full-height body: no upper stands above it.
        expect(
          first.design.placements.some(
            (candidate) =>
              candidate.y0Mm === WALL_ROW_Y0_MM &&
              candidate.alongMm === base.alongMm,
          ),
        ).toBe(false);
        continue;
      }
      const upper = first.design.placements.find(
        (candidate) =>
          candidate.y0Mm === WALL_ROW_Y0_MM &&
          startMm(candidate) === startMm(base) &&
          farEdgeMm(candidate) === farEdgeMm(base),
      );
      expect(upper, base.body.buildId).toBeDefined();
      if (HOB_BUILD_IDS.has(base.body.buildId)) {
        expect(upper?.body.buildId).toBe("hood");
      }
    }

    // A dishwasher only along the wall beside the sink — the across-the-corner arm is empty by
    // construction (one wall), so abutment is the only way it can stand.
    const dishwashers = bases.filter(
      (base) => base.body.buildId === DISHWASHER_BUILD_ID,
    );
    if (dishwashers.length > 0) {
      const sink = required(
        bases.find((base) => base.body.buildId === "base-sink"),
        "a sink for the dishwasher to stand beside",
      );
      for (const dishwasher of dishwashers) {
        expect(
          farEdgeMm(dishwasher) === startMm(sink) ||
            startMm(dishwasher) === farEdgeMm(sink),
        ).toBe(true);
      }
    }

    // Any full-height block stands at the free end the layout leaves: the outermost (last, in
    // spatial order) base of the run, the same place `tallColumnItems` (`generation-priorities.ts`)
    // appends it.
    const towers = bases.filter(
      (base) =>
        base.body.buildId === OVEN_TOWER_BUILD_ID ||
        base.body.buildId === "tall-pantry",
    );
    if (towers.length > 0) {
      expect(lastBase.body.buildId).toBe(
        required(towers.at(-1), "a tower").body.buildId,
      );
    }

    // The log replays to the design.
    expect(
      replayGenerationLog({
        log: first.log,
        probeAt: createFakeProbeFactory(),
      }),
    ).toStrictEqual(first.design);
  }

  it("holds over a sweep of at least 200 samples", () => {
    fc.assert(
      fc.property(roomArbitrary, (sample) => {
        checkedRoom(linearRoom(sample.widthMm, sample.heightMm));
      }),
      { numRuns: 200 },
    );
  });

  it.each(BOUNDARY_WIDTHS_MM)("holds at the %i mm boundary", (widthMm) => {
    checkedRoom(linearRoom(widthMm));
  });
});

// =================================================================================================
// A7 — depthMm is never read by generation.
// =================================================================================================

describe("generateKitchen — depthMm is never read for a straight room", () => {
  // The plan's own criterion (§4 A7) names `depthMm ∈ {1, 3400, 6300}` as the probe set. **1 mm does
  // not hold**, and not because generation reads it: `validate-design.ts`'s `reachesPastRoomAcrossWall`
  // refuses any wall-A extent whose own physical depth exceeds `room.depthMm` — a pre-existing,
  // shape-blind rule an L room is equally bound by, unrelated to this wave. 1200 mm+ of composed
  // cabinets at their real declared depth cannot stand in a 1 mm room whatever generation reads, so a
  // depth this shallow throws before the indifference this criterion is about is ever exercised.
  // Swept here over depths that stay clear of that unrelated rule instead, which is what actually
  // proves generation's own indifference to the field.
  it("yields designs equal except room.depthMm, over 3400, 5000 and 6300", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1200, max: 6000 }), (widthMm) => {
        const results = [3400, 5000, 6300].map((depthMm) =>
          generate({ shape: "linear", widthMm, depthMm, heightMm: 2600 }),
        );
        const [first, ...rest] = results;
        if (!first?.ok) throw new Error("refused at a supposedly valid width");
        for (const result of rest) {
          if (!result.ok)
            throw new Error("refused at a supposedly valid width");
          expect(result.design).toStrictEqual({
            ...first.design,
            room: result.design.room,
          });
        }
      }),
      { numRuns: 50 },
    );
  });
});

// =================================================================================================
// A8 — witnesses, through generateKitchen. A stop condition: if these differ, stop and report.
// =================================================================================================

describe("generateKitchen — the architect's witnesses", () => {
  function coreOrderOf(result: GeneratedKitchen): readonly string[] {
    return baseBodies(result.design)
      .filter((base) => base.y0Mm === 0)
      .map((base) => base.body.buildId)
      .filter(
        (buildId) =>
          buildId !== "wall-cabinet" &&
          buildId !== "hood" &&
          buildId !== "base-panbank" &&
          buildId !== "base-bottle-cargo" &&
          buildId !== "tall-pantry",
      );
  }

  it("composes the owner's 3700 mm kitchen as G7's six bodies, bare end 0", () => {
    const result = generate(linearRoom(3700));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(coreOrderOf(result)).toEqual([
      "fridge-free",
      "base-sink",
      "base-dishwasher",
      "base-3drawer",
      "base-hob-2drawer",
      OVEN_TOWER_BUILD_ID,
    ]);
    const bases = baseBodies(result.design);
    expect(
      wallLengthMm("A", result.design.room) -
        farEdgeMm(required(bases.at(-1), "3700 mm's last base")),
    ).toBe(0);
  });

  it("leaves 6000 mm with 0 mm bare, and no room past it holds more bodies", () => {
    const at6000 = generate(linearRoom(6000));
    expect(at6000.ok).toBe(true);
    if (!at6000.ok) return;
    const bases6000 = baseBodies(at6000.design);
    expect(
      wallLengthMm("A", at6000.design.room) -
        farEdgeMm(required(bases6000.at(-1), "6000 mm's last base")),
    ).toBe(0);

    for (const widthMm of [6100, 6200, 6300]) {
      const over = generate(linearRoom(widthMm));
      expect(over.ok).toBe(true);
      if (!over.ok) continue;
      expect(baseBodies(over.design).length).toBeLessThanOrEqual(
        bases6000.length,
      );
    }
  });

  it("composes 1200 mm as a sink and a hob only, bare end 0", () => {
    const result = generate(linearRoom(1200));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(coreOrderOf(result)).toEqual(["base-sink", "base-hob-oven"]);
    const bases = baseBodies(result.design);
    expect(
      wallLengthMm("A", result.design.room) -
        farEdgeMm(required(bases.at(-1), "1200 mm's last base")),
    ).toBe(0);
  });
});
