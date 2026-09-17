// Independent adversarial QA for M7 wave 7D2. These tests deliberately work from the published
// plan, shell and log contracts instead of sharing the implementation's helpers.
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  acceptsWidthMm,
  buildKitchenLBodyCatalog,
  buildLShellDesign,
  cabinetDepthMmOf,
  canonicalSerializeDesign,
  createBodyProbeLease,
  declaredColumnSizes,
  findOverflowingPlacementIds,
  generateKitchen,
  GENERATION_PRIORITIES,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  replayGenerationLog,
  toInsertableBody,
  validateDesignForCatalog,
  type BodyMeasurement,
  type BodyProbeFactory,
  type BodyProbeRequest,
  type Design,
  type DesignRoom,
  type GenerationCommand,
  type GenerationStep,
} from "../../src/index.js";
import { narrowerEnteredWall } from "../support/entered-walls.js";
import {
  createFakeProbe,
  createFakeProbeFactory,
  createLeaseLedger,
} from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";
const CORE_ORDER = ["fridge", "sink", "preparation", "hob"] as const;

/** What `generateKitchen` reads off the catalogue and hands the planner (ADR 0110 E, wave 7D3). */
const DECLARED_COLUMNS = declaredColumnSizes(
  buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN)),
);

function generate(room: DesignRoom) {
  return generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

function successful(room: DesignRoom) {
  const result = generate(room);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`room was refused: ${result.reason.code}`);
  return result;
}

function interval(entry: {
  readonly alongMm: number;
  readonly widthMm: number;
}) {
  return {
    startMm: entry.alongMm - entry.widthMm / 2,
    endMm: entry.alongMm + entry.widthMm / 2,
  };
}

function placementInterval(placement: Design["placements"][number]) {
  return interval({
    alongMm: placement.alongMm,
    widthMm: placement.body.widthMm,
  });
}

/**
 * The wall the kitchen is laid out **against** the order it is read in: the narrower entered wall,
 * and wall B where the two are equal, because M7 wave 7D8 keyed the run onto the wider one (ADR 0120
 * Amendment E; ADR 0110 Amendment I re-points D2's reversal at it).
 *
 * Derived in `entered-walls.ts` from the two numbers the customer typed — this file works from the
 * published contracts and never from the implementation's helpers, and a reading order that asked
 * the composer which wall it reversed would agree with it whatever it reversed.
 */
function wallReadInReverse(room: DesignRoom): "A" | "B" {
  return narrowerEnteredWall(room);
}

function spatialCoreOrder(
  result: Extract<ReturnType<typeof generate>, { readonly ok: true }>,
) {
  const reversed = wallReadInReverse(result.design.room);
  return result.log.steps
    .flatMap((step) => {
      if (
        step.status !== "placed" ||
        !CORE_ORDER.includes(step.id as (typeof CORE_ORDER)[number])
      ) {
        return [];
      }
      const placement = result.design.placements.find(
        (candidate) => candidate.id === step.placementId,
      );
      if (!placement) throw new Error(`missing placement ${step.placementId}`);
      return [{ role: step.id, placement }];
    })
    .sort((left, right) => {
      if (left.placement.wall !== right.placement.wall) {
        return left.placement.wall === reversed ? -1 : 1;
      }
      return left.placement.wall === reversed
        ? right.placement.alongMm - left.placement.alongMm
        : left.placement.alongMm - right.placement.alongMm;
    })
    .map(({ role }) => role);
}

function baseSteps(steps: readonly GenerationStep[]) {
  return steps.filter((step) => !["upper", "hood"].includes(step.role));
}

function commandKey(command: GenerationCommand): string {
  return JSON.stringify(command);
}

function assertCommandAccounting(
  steps: readonly GenerationStep[],
  commands: readonly GenerationCommand[],
) {
  const inSteps = steps
    .flatMap((step) => step.commands)
    .map(commandKey)
    .sort();
  expect(inSteps).toEqual(commands.map(commandKey).sort());
}

function assertNoInteriorFloorGap(design: Design): void {
  for (const wall of ["A", "B"] as const) {
    const composed = design.placements
      .filter(
        (placement) =>
          placement.wall === wall &&
          placement.y0Mm === 0 &&
          placement.id.startsWith("n"),
      )
      .map(placementInterval);
    if (composed.length < 2) continue;
    const occupiedStart = Math.min(...composed.map((span) => span.startMm));
    const occupiedEnd = Math.max(...composed.map((span) => span.endMm));
    const interior = (design.emptyColumns ?? [])
      .filter((entry) => entry.wall === wall && entry.y0Mm === 0)
      .map(interval)
      .filter(
        (span) => span.startMm >= occupiedStart && span.endMm <= occupiedEnd,
      );
    expect(interior, `${wall} has an interior floor gap`).toEqual([]);
  }
}

describe("7D2 pure planning and exact cut transitions", () => {
  it("documents why 900 x 2160 cannot meet 7D2's two 600 mm required widths", () => {
    const room: DesignRoom = {
      shape: "L",
      widthMm: 900,
      depthMm: 2160,
      heightMm: 2200,
    };
    const runs = lShellFloorRuns(room);
    const plan = planKitchenComposition({
      columns: DECLARED_COLUMNS,
      room,
      runs,
    });
    const generated = generate(room);

    expect(runs).toEqual({
      A: { wall: "A", startMm: 900, endMm: 900 },
      B: { wall: "B", startMm: 900, endMm: 2060 },
    });
    expect(runs.B.endMm - runs.B.startMm).toBe(1160);
    expect(
      GENERATION_PRIORITIES.filter((priority) => priority.required).map(
        (priority) => priority.widthMm,
      ),
    ).toEqual([600, 600]);
    expect(plan.minimumMet).toBe(false);
    expect(plan.bases).toEqual([]);
    expect(generated.ok).toBe(false);
    expect(generated).not.toHaveProperty("design");
  });

  it.each([
    [2199, false, ["fridge", "sink", "preparation", "hob"]],
    [2200, true, ["fridge", "preparation"]],
    [2799, true, ["fridge", "preparation"]],
    [2800, true, ["fridge"]],
    [3499, true, ["fridge"]],
    [3500, true, []],
  ] as const)(
    "changes only at the declared all-on-B boundary depth %i",
    (depthMm, minimumMet, dropped) => {
      const room: DesignRoom = {
        shape: "L",
        widthMm: 900,
        depthMm,
        heightMm: 2200,
      };
      const plan = planKitchenComposition({
        columns: DECLARED_COLUMNS,
        room,
        runs: lShellFloorRuns(room),
      });
      expect(plan.minimumMet).toBe(minimumMet);
      expect(plan.dropped).toEqual(dropped);
    },
  );

  it.each([
    [{ shape: "L", widthMm: 2700, depthMm: 1699, heightMm: 2200 }, ["fridge"]],
    [{ shape: "L", widthMm: 2700, depthMm: 1700, heightMm: 2200 }, []],
    [{ shape: "L", widthMm: 3299, depthMm: 1700, heightMm: 2200 }, []],
    [{ shape: "L", widthMm: 3300, depthMm: 1700, heightMm: 2200 }, []],
  ] as const)("keeps the two-wall cut deterministic at %o", (room, dropped) => {
    const first = planKitchenComposition({
      columns: DECLARED_COLUMNS,
      room,
      runs: lShellFloorRuns(room),
    });
    const second = planKitchenComposition({
      columns: DECLARED_COLUMNS,
      room,
      runs: lShellFloorRuns(room),
    });

    expect(second).toStrictEqual(first);
    expect(first.dropped).toEqual(dropped);
    if (room.widthMm === 3299) {
      expect(
        first.bases.filter((base) => base.role === "storage"),
      ).toHaveLength(0);
    }
    if (room.widthMm === 3300) {
      expect(
        first.bases.filter((base) => base.role === "storage"),
      ).toHaveLength(1);
    }
  });

  it("reads the narrower wall from its free end and keeps the core order across fillers", () => {
    // The reference room is 3 560 × 2 800, so wall B is the narrower one and the run reads it first —
    // which is the same answer the letter used to give, now stated as the rule that produces it.
    const result = successful(KITCHEN_L_DESIGN.room);
    const reversed = wallReadInReverse(KITCHEN_L_DESIGN.room);
    const readingOrder = result.design.placements
      .filter(
        (placement) => placement.y0Mm === 0 && placement.id.startsWith("n"),
      )
      .sort((left, right) => {
        if (left.wall !== right.wall) return left.wall === reversed ? -1 : 1;
        return left.wall === reversed
          ? right.alongMm - left.alongMm
          : left.alongMm - right.alongMm;
      })
      .map((placement) => {
        const step = result.log.steps.find(
          (candidate) =>
            candidate.status === "placed" &&
            candidate.placementId === placement.id,
        );
        return step?.role;
      });

    expect(spatialCoreOrder(result)).toEqual(CORE_ORDER);
    expect(readingOrder).toEqual([
      "fridge",
      "storage",
      "storage",
      "sink",
      "preparation",
      "hob",
      "storage",
    ]);
  });

  it("allows only the ruled successful drop states and never drops the minimum pair", () => {
    const rooms = [
      { shape: "L", widthMm: 900, depthMm: 2200, heightMm: 2200 },
      { shape: "L", widthMm: 900, depthMm: 2800, heightMm: 2200 },
      { shape: "L", widthMm: 900, depthMm: 3500, heightMm: 2200 },
      { shape: "L", widthMm: 2700, depthMm: 1700, heightMm: 2599 },
      KITCHEN_L_DESIGN.room,
    ] satisfies readonly DesignRoom[];

    for (const room of rooms) {
      const result = successful(room);
      expect([[], ["fridge"], ["fridge", "preparation"]]).toContainEqual(
        result.log.plan.dropped,
      );
      expect(result.log.plan.dropped).not.toContain("sink");
      expect(result.log.plan.dropped).not.toContain("hob");
      expect(spatialCoreOrder(result)).toEqual(
        CORE_ORDER.filter((role) => !result.log.plan.dropped.includes(role)),
      );
    }
  });

  it("sweeps every one-millimetre wall value against cut, drop, storage, and remainder edges", () => {
    // The composer is swept, not the policy (M7 7A3): wall A keeps the pre-7A3 6300, and wall B runs
    // past its pre-7A3 5100 to the 6000 the policy admits since — 5101 the first admitted value,
    // 5299 / 5300 a storage edge inside that band.
    const wallAValues = [
      900, 1499, 1500, 2099, 2100, 2699, 2700, 3299, 3300, 6300,
    ];
    const wallBValues = [
      1000, 1599, 1600, 1699, 1700, 2199, 2200, 2299, 2300, 2799, 2800, 2899,
      2900, 3499, 3500, 4099, 4100, 5100, 5101, 5299, 5300, 6000,
    ];
    const failures: string[] = [];
    let checked = 0;
    const check = (room: DesignRoom) => {
      checked += 1;
      const runs = lShellFloorRuns(room);
      const plan = planKitchenComposition({
        columns: DECLARED_COLUMNS,
        room,
        runs,
      });
      const where = `${String(room.widthMm)}x${String(room.depthMm)}`;
      if (!plan.minimumMet) {
        if (plan.bases.length > 0)
          failures.push(`${where}: refused with bases`);
        return;
      }

      if (
        !["", "fridge", "fridge,preparation"].includes(plan.dropped.join(","))
      ) {
        failures.push(`${where}: dropped ${plan.dropped.join(",")}`);
      }
      if (plan.dropped.includes("sink") || plan.dropped.includes("hob")) {
        failures.push(`${where}: dropped minimum`);
      }
      if (plan.remainderMm.A > 599 || plan.remainderMm.B > 599) {
        failures.push(`${where}: remainder over 599`);
      }
      for (const wall of ["A", "B"] as const) {
        const bases = plan.bases.filter((base) => base.wall === wall);
        for (let index = 0; index < bases.length; index += 1) {
          const base = bases[index];
          const previous = bases[index - 1];
          if (!base) throw new Error("plan loop lost its current base");
          const expectedStart =
            index === 0 ? runs[wall].startMm : previous?.endMm;
          if (base.startMm !== expectedStart) {
            failures.push(`${where}:${wall}: noncontiguous plan`);
          }
        }
        const accounted =
          bases.reduce((sum, base) => sum + base.widthMm, 0) +
          plan.remainderMm[wall];
        if (accounted !== runs[wall].endMm - runs[wall].startMm) {
          failures.push(`${where}:${wall}: unaccounted width`);
        }
      }

      const reversed = wallReadInReverse(room);
      const readingCore = [
        ...plan.bases
          .filter((base) => base.wall === reversed)
          .slice()
          .reverse(),
        ...plan.bases.filter((base) => base.wall !== reversed),
      ]
        .filter((base) => base.role !== "storage")
        .map((base) => base.role);
      const expectedCore = CORE_ORDER.filter(
        (role) => !plan.dropped.includes(role),
      );
      if (readingCore.join(",") !== expectedCore.join(",")) {
        failures.push(`${where}: core order ${readingCore.join(",")}`);
      }
    };

    for (let widthMm = 900; widthMm <= 6300; widthMm += 1) {
      for (const depthMm of wallBValues) {
        check({ shape: "L", widthMm, depthMm, heightMm: 2200 });
      }
    }
    for (let depthMm = 1000; depthMm <= 6000; depthMm += 1) {
      for (const widthMm of wallAValues) {
        check({ shape: "L", widthMm, depthMm, heightMm: 2599 });
      }
    }
    expect(checked).toBe(168_832);
    expect(failures.slice(0, 20)).toEqual([]);

    const storageBefore = planKitchenComposition({
      columns: DECLARED_COLUMNS,
      room: { shape: "L", widthMm: 900, depthMm: 4099, heightMm: 2200 },
      runs: lShellFloorRuns({
        shape: "L",
        widthMm: 900,
        depthMm: 4099,
        heightMm: 2200,
      }),
    });
    const storageAt = planKitchenComposition({
      columns: DECLARED_COLUMNS,
      room: { shape: "L", widthMm: 900, depthMm: 4100, heightMm: 2200 },
      runs: lShellFloorRuns({
        shape: "L",
        widthMm: 900,
        depthMm: 4100,
        heightMm: 2200,
      }),
    });
    expect(
      storageBefore.bases.filter((base) => base.role === "storage"),
    ).toHaveLength(0);
    expect(
      storageAt.bases.filter((base) => base.role === "storage"),
    ).toHaveLength(1);
  });
});

describe("7D2 planned shell and leftover invariants", () => {
  it.each([
    { shape: "L", widthMm: 2100, depthMm: 3500, heightMm: 2200 },
    { shape: "L", widthMm: 2101, depthMm: 3501, heightMm: 2599 },
    KITCHEN_L_DESIGN.room,
    // The pre-7A3 approved corner, kept on purpose: the planner is judged, not the policy (M7 7A3).
    { shape: "L", widthMm: 6300, depthMm: 5100, heightMm: 3900 },
    // The approved corner since M7 7A3, and a room the policy admits only since then: wall B wider.
    { shape: "L", widthMm: 6000, depthMm: 6000, heightMm: 3900 },
    { shape: "L", widthMm: 2400, depthMm: 6000, heightMm: 3900 },
  ] satisfies readonly DesignRoom[])(
    "tiles every planned body boundary, with only the documented free-end merge in %o",
    (room) => {
      const plan = planKitchenComposition({
        columns: DECLARED_COLUMNS,
        room,
        runs: lShellFloorRuns(room),
      });
      expect(plan.minimumMet).toBe(true);
      const shell = buildLShellDesign({
        room,
        occurredAt: OCCURRED_AT,
        compositionPlan: { floorWidthsMm: plan.floorWidthsMm },
      });
      const floorTiles = (shell.emptyColumns ?? []).filter(
        (entry) => entry.y0Mm === 0,
      );

      for (const base of plan.bases) {
        const covering = floorTiles.filter((tile) => {
          const span = interval(tile);
          return (
            tile.wall === base.wall &&
            span.startMm === base.startMm &&
            span.endMm >= base.endMm
          );
        });
        expect(covering, `${base.id} has one shell column`).toHaveLength(1);
        const coveringTile = covering[0];
        if (!coveringTile) throw new Error(`${base.id} has no shell column`);
        const overhangMm = interval(coveringTile).endMm - base.endMm;
        expect(overhangMm).toBeGreaterThanOrEqual(0);
        expect(overhangMm).toBeLessThanOrEqual(200);
        if (overhangMm > 0) {
          expect(base.endMm).toBe(
            Math.max(
              ...plan.bases
                .filter((candidate) => candidate.wall === base.wall)
                .map((candidate) => candidate.endMm),
            ),
          );
        }
      }
    },
  );

  it("pins the reference wall-A base intervals and leaves the corner wall band empty", () => {
    const result = successful(KITCHEN_L_DESIGN.room);
    const intervalsByRole = ["sink", "preparation", "hob"].map((id) => {
      const step = result.log.steps.find(
        (candidate) => candidate.id === id && candidate.status === "placed",
      );
      if (!step || step.status !== "placed") throw new Error(`missing ${id}`);
      const placement = result.design.placements.find(
        (candidate) => candidate.id === step.placementId,
      );
      if (!placement) throw new Error(`missing ${step.placementId}`);
      return [id, placement.wall, placementInterval(placement)] as const;
    });

    expect(intervalsByRole).toEqual([
      ["sink", "A", { startMm: 900, endMm: 1500 }],
      ["preparation", "A", { startMm: 1500, endMm: 2100 }],
      ["hob", "A", { startMm: 2100, endMm: 2700 }],
    ]);
    expect(
      result.design.placements.filter(
        (placement) =>
          placement.wall === "A" &&
          placement.y0Mm === 1500 &&
          placementInterval(placement).startMm < 900,
      ),
    ).toEqual([]);
  });

  it.each([
    { shape: "L", widthMm: 2099, depthMm: 3500, heightMm: 2200 },
    { shape: "L", widthMm: 2100, depthMm: 3500, heightMm: 2200 },
    { shape: "L", widthMm: 2101, depthMm: 3501, heightMm: 2200 },
    { shape: "L", widthMm: 3561, depthMm: 2921, heightMm: 2599 },
  ] satisfies readonly DesignRoom[])(
    "keeps odd-grid loss at the free end and no empty column inside the row in %o",
    (room) => {
      const result = successful(room);
      assertNoInteriorFloorGap(result.design);
      for (const wall of ["A", "B"] as const) {
        const run = lShellFloorRuns(room)[wall];
        const plannedEnd = Math.max(
          run.startMm,
          ...result.log.plan.bases
            .filter((base) => base.wall === wall)
            .map((base) => base.endMm),
        );
        const expectedRecordedRemainder =
          result.log.plan.remainderMm[wall] -
          (result.log.plan.remainderMm[wall] % 2);
        const free = (result.design.emptyColumns ?? [])
          .filter((entry) => entry.wall === wall && entry.y0Mm === 0)
          .map(interval)
          .filter((span) => span.startMm >= plannedEnd);
        expect(
          free.reduce((sum, span) => sum + span.endMm - span.startMm, 0),
        ).toBe(expectedRecordedRemainder);
        expect(result.log.plan.remainderMm[wall]).toBeLessThanOrEqual(599);
      }
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(result.design));
      const findings = validateDesignForCatalog(result.design, catalog);
      expect(findings).toEqual([]);
      expect(findOverflowingPlacementIds(result.design)).toEqual([]);
      expect(findings.map((finding) => finding.code)).not.toContain(
        "RECORDED_SPAN_OVERLAPS_CORNER_BODY",
      );
    },
  );

  it("keeps the 7D1 no-plan reference shell byte-identical", () => {
    const shell = buildLShellDesign({
      room: KITCHEN_L_DESIGN.room,
      occurredAt: OCCURRED_AT,
    });
    const digest = createHash("sha256")
      .update(canonicalSerializeDesign(shell))
      .digest("hex");

    expect(digest).toBe(
      "8f1066f10268207a28501f6a3ba14123693d04ede27fca63b18eafc45b5d4237",
    );
  });
});

describe("7D2 command and log truth", () => {
  it.each([
    { shape: "L", widthMm: 900, depthMm: 2300, heightMm: 2200 },
    KITCHEN_L_DESIGN.room,
    // The pre-7A3 approved corner, kept on purpose: the command log is judged, not the policy (M7 7A3).
    { shape: "L", widthMm: 6300, depthMm: 5100, heightMm: 2599 },
    // The approved corner since M7 7A3, and a room the policy admits only since then: wall B wider.
    { shape: "L", widthMm: 6000, depthMm: 6000, heightMm: 2599 },
    { shape: "L", widthMm: 2400, depthMm: 6000, heightMm: 2599 },
  ] satisfies readonly DesignRoom[])(
    "accounts for every composed placement and every command exactly once in %o",
    (room) => {
      const result = successful(room);
      const core = result.log.steps.slice(0, GENERATION_PRIORITIES.length);
      expect(core.map((step) => step.id)).toEqual(CORE_ORDER);
      expect(new Set(core.map((step) => step.id)).size).toBe(CORE_ORDER.length);
      expect(new Set(result.log.steps.map((step) => step.id)).size).toBe(
        result.log.steps.length,
      );
      assertCommandAccounting(result.log.steps, result.log.commands);

      const accountedPlacementIds = result.log.steps.flatMap((step) =>
        step.status === "placed" ? [step.placementId] : [],
      );
      const composedPlacementIds = result.design.placements
        .filter((placement) => placement.id.startsWith("n"))
        .map((placement) => placement.id);
      expect(accountedPlacementIds.sort()).toEqual(composedPlacementIds.sort());
      expect(new Set(accountedPlacementIds).size).toBe(
        accountedPlacementIds.length,
      );

      const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(result.design));
      for (const step of result.log.steps) {
        if (step.status !== "placed") continue;
        const matching = result.design.placements.filter(
          (placement) => placement.id === step.placementId,
        );
        expect(matching).toHaveLength(1);
        expect(matching[0]?.body.buildId).toBe(step.buildId);
        const definition = catalog.get(step.buildId);
        const body = definition && toInsertableBody(step.buildId, definition);
        const placement = matching[0];
        if (!placement) throw new Error(`${step.id} has no placement`);
        expect(body && acceptsWidthMm(body, placement.body.widthMm)).toBe(true);
      }

      const baseInsertKeys = new Set(
        baseSteps(result.log.steps)
          .flatMap((step) => step.commands)
          .filter((command) => command.type === "insert_body")
          .map(commandKey),
      );
      const resizeKeys = new Set(
        result.log.commands
          .filter((command) => command.type === "set_width")
          .map(commandKey),
      );
      const upperInsertKeys = new Set(
        result.log.steps
          .filter((step) => ["upper", "hood"].includes(step.role))
          .flatMap((step) => step.commands)
          .map(commandKey),
      );
      const phases = result.log.commands.map((command) => {
        const key = commandKey(command);
        if (baseInsertKeys.has(key)) return 0;
        if (resizeKeys.has(key)) return 1;
        if (upperInsertKeys.has(key)) return 2;
        throw new Error(`unclassified command ${key}`);
      });
      expect(phases).toEqual([...phases].sort());

      expect(
        replayGenerationLog({
          log: result.log,
          probeAt: createFakeProbeFactory(),
        }),
      ).toStrictEqual(result.design);
    },
  );

  it("uses setWidth only for the final fit body merged with a <=200 mm free end", () => {
    // **The witness room moved and the rule did not.** This was 900 × 2300 until M7 wave 7D8 keyed
    // the run onto the wider entered wall: there the sink stood at wall B's free end and took the
    // merged opening, and now the hob does — a discrete body, which is centred rather than resized,
    // so that room issues no width command at all. 1600 × 1700 is the same shape on the other side
    // of the key: the sink is the last body on the narrower wall, wall A, with 100 mm to absorb.
    const room: DesignRoom = {
      shape: "L",
      widthMm: 1600,
      depthMm: 1700,
      heightMm: 2200,
    };
    const result = successful(room);
    const resizes = result.log.commands.filter(
      (command) => command.type === "set_width",
    );
    expect(resizes).toHaveLength(1);
    const resize = resizes[0];
    if (!resize) throw new Error("expected a free-end resize");
    const step = result.log.steps.find(
      (candidate) =>
        candidate.status === "placed" &&
        candidate.placementId === resize.placementId,
    );
    expect(step?.id).toBe("sink");
    expect(resize.widthMm).toBe(600);
    const planned = result.log.plan.bases.find((base) => base.id === step?.id);
    expect(planned).toBeDefined();
    if (!planned) return;
    expect(planned.endMm).toBe(
      Math.max(
        ...result.log.plan.bases
          .filter((base) => base.wall === planned.wall)
          .map((base) => base.endMm),
      ),
    );
    expect(result.log.plan.remainderMm[planned.wall]).toBeLessThanOrEqual(200);
    expect(
      result.design.placements.find(
        (placement) => placement.id === resize.placementId,
      )?.body.widthMm,
    ).toBe(600);
  });
});

interface InstrumentedFactory {
  readonly probeAt: BodyProbeFactory;
  readonly ledger: ReturnType<typeof createLeaseLedger>;
  readonly measuredAfterRelease: () => boolean;
}

function instrumentedFactory(
  alter: (
    request: BodyProbeRequest,
    measurement: BodyMeasurement,
  ) => BodyMeasurement = (_request, measurement) => measurement,
): InstrumentedFactory {
  const ledger = createLeaseLedger();
  let measuredAfterRelease = false;
  const probeAt: BodyProbeFactory = (cabinetDepthMm) => {
    const delegate = createFakeProbe({
      catalog: buildKitchenLBodyCatalog(cabinetDepthMm),
    });
    let released = false;
    ledger.take();
    return createBodyProbeLease(
      {
        measure(request) {
          if (released) measuredAfterRelease = true;
          return alter(request, delegate.measure(request));
        },
      },
      () => {
        released = true;
        ledger.release();
      },
    );
  };
  return { probeAt, ledger, measuredAfterRelease: () => measuredAfterRelease };
}

function expectBalanced(factory: InstrumentedFactory): void {
  expect(factory.ledger).toMatchObject({ taken: 1, released: 1 });
  expect(factory.measuredAfterRelease()).toBe(false);
}

describe("7D2 probe lifetime and refusal paths", () => {
  it("balances exactly one lease on success and minimum refusal", () => {
    const success = instrumentedFactory();
    expect(
      generateKitchen({
        room: KITCHEN_L_DESIGN.room,
        occurredAt: OCCURRED_AT,
        probeAt: success.probeAt,
      }).ok,
    ).toBe(true);
    expectBalanced(success);

    const minimum = instrumentedFactory();
    expect(
      generateKitchen({
        room: { shape: "L", widthMm: 900, depthMm: 2199, heightMm: 2200 },
        occurredAt: OCCURRED_AT,
        probeAt: minimum.probeAt,
      }).ok,
    ).toBe(false);
    expectBalanced(minimum);
  });

  it("keeps a refused sink insert atomic, returns no design, and releases once", () => {
    const rejecting = instrumentedFactory((request, measurement) =>
      request.buildId === "base-sink"
        ? { ...measurement, carcassWidthM: measurement.carcassWidthM + 0.1 }
        : measurement,
    );
    const result = generateKitchen({
      room: KITCHEN_L_DESIGN.room,
      occurredAt: OCCURRED_AT,
      probeAt: rejecting.probeAt,
    });

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("design");
    expect(result.log.steps.find((step) => step.id === "sink")).toMatchObject({
      status: "not_placed",
      reason: { code: "BUILT_SIZE_MISMATCH" },
    });
    expectBalanced(rejecting);
  });

  it("releases once when the only free-end setWidth is refused", () => {
    const rejecting = instrumentedFactory((request, measurement) =>
      request.buildId === "base-sink" && request.widthM === 0.6
        ? { ...measurement, carcassWidthM: measurement.carcassWidthM + 0.1 }
        : measurement,
    );

    expect(() =>
      generateKitchen({
        // The same room the free-end resize is witnessed at above, for the same reason it moved.
        room: { shape: "L", widthMm: 1600, depthMm: 1700, heightMm: 2200 },
        occurredAt: OCCURRED_AT,
        probeAt: rejecting.probeAt,
      }),
    ).toThrow("free-end resize refused (BUILT_SIZE_MISMATCH)");
    expectBalanced(rejecting);
  });

  it("releases once when setWidth's probe throws", () => {
    const throwing = instrumentedFactory((request, measurement) => {
      if (request.buildId === "base-sink" && request.widthM === 0.6) {
        throw new Error("resize probe boom");
      }
      return measurement;
    });

    expect(() =>
      generateKitchen({
        // The same room again, and here the move mattered to what this covers rather than only to
        // whether it passed: at 900 × 2300 the sink is now planned at its declared 600 and inserted
        // at it, so a probe that throws at 0.6 throws during the **insert** and this test would have
        // gone on passing while no longer reaching a resize at all.
        room: { shape: "L", widthMm: 1600, depthMm: 1700, heightMm: 2200 },
        occurredAt: OCCURRED_AT,
        probeAt: throwing.probeAt,
      }),
    ).toThrow("resize probe boom");
    expectBalanced(throwing);
  });

  it("releases once when an insert probe throws and when a log replays", () => {
    const throwing = instrumentedFactory(() => {
      throw new Error("insert probe boom");
    });
    expect(() =>
      generateKitchen({
        room: KITCHEN_L_DESIGN.room,
        occurredAt: OCCURRED_AT,
        probeAt: throwing.probeAt,
      }),
    ).toThrow("insert probe boom");
    expectBalanced(throwing);

    const generated = successful(KITCHEN_L_DESIGN.room);
    const replay = instrumentedFactory();
    expect(
      replayGenerationLog({
        log: generated.log,
        probeAt: replay.probeAt,
      }),
    ).toStrictEqual(generated.design);
    expectBalanced(replay);
  });
});
