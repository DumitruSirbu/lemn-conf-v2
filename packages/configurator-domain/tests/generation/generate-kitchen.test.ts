import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  createBodyProbeLease,
  declaredCabinetDepthsMm,
  derivePlacementRecords,
  findOverflowingPlacementIds,
  generateKitchen,
  KITCHEN_L_DESIGN,
  replayGenerationLog,
  setCabinetDepth,
  toInsertableBody,
  validateDesignForCatalog,
  type Design,
  type DesignRoom,
  type BodyProbeFactory,
} from "../../src/index.js";
import {
  createFakeProbe,
  createFakeProbeFactory,
  createLeaseLedger,
} from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";

function generate(room: DesignRoom) {
  return generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

describe("generateKitchen", () => {
  it("composes the reference room, its uppers and hood through a single lease", () => {
    const ledger = createLeaseLedger();
    const result = generateKitchen({
      room: KITCHEN_L_DESIGN.room,
      occurredAt: OCCURRED_AT,
      probeAt: createFakeProbeFactory({}, ledger),
    });

    expect(result.ok).toBe(true);
    expect(ledger).toMatchObject({ taken: 1, released: 1 });
    if (!result.ok) return;
    const byRole = new Map(result.log.steps.map((step) => [step.id, step]));
    for (const role of ["fridge", "sink", "preparation", "hob"]) {
      expect(byRole.get(role)?.status).toBe("placed");
    }
    const bases = result.design.placements.filter(
      (placement) => placement.y0Mm === 0,
    );
    const named = result.log.steps
      .filter((step) => step.status === "placed")
      .filter((step) => ["sink", "preparation", "hob"].includes(step.id))
      .map((step) =>
        result.design.placements.find(
          (placement) => placement.id === step.placementId,
        ),
      )
      .map(
        (placement) =>
          placement && [
            placement.body.buildId,
            placement.wall,
            placement.alongMm - placement.body.widthMm / 2,
            placement.alongMm + placement.body.widthMm / 2,
          ],
      );
    expect(named).toEqual([
      ["base-sink", "A", 900, 1500],
      ["base-cabinet", "A", 1500, 2100],
      ["base-hob-oven", "A", 2100, 2700],
    ]);
    expect(bases.length).toBeGreaterThan(4);
    expect(
      result.design.placements.some(
        (placement) => placement.body.buildId === "hood",
      ),
    ).toBe(true);
    expect(
      result.design.placements.some(
        (placement) =>
          placement.wall === "A" &&
          placement.y0Mm === 1500 &&
          placement.alongMm < 900,
      ),
    ).toBe(false);

    const placedSteps = result.log.steps.filter(
      (step) => step.status === "placed",
    );
    expect(new Set(result.log.steps.map((step) => step.id)).size).toBe(
      result.log.steps.length,
    );
    expect(result.log.steps.slice(0, 4).map((step) => step.id)).toEqual([
      "fridge",
      "sink",
      "preparation",
      "hob",
    ]);
    const firstUpperIndex = result.log.steps.findIndex((step) =>
      ["upper", "hood"].includes(step.role),
    );
    expect(firstUpperIndex).toBeGreaterThan(0);
    expect(
      result.log.steps
        .slice(firstUpperIndex)
        .every((step) => ["upper", "hood"].includes(step.role)),
    ).toBe(true);
    for (const step of placedSteps) {
      expect(
        result.design.placements.filter(
          (placement) => placement.id === step.placementId,
        ),
      ).toHaveLength(1);
    }

    const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(result.design));
    for (const step of placedSteps) {
      const placement = result.design.placements.find(
        (candidate) => candidate.id === step.placementId,
      );
      const definition = catalog.get(step.buildId);
      const insertable =
        definition && toInsertableBody(step.buildId, definition);
      expect(placement).toBeDefined();
      expect(insertable).toBeDefined();
      if (placement && insertable) {
        expect(placement.body.buildId).toBe(step.buildId);
        expect(
          insertable.definition.widthRangesMm?.some(
            ({ minMm, maxMm }) =>
              placement.body.widthMm >= minMm &&
              placement.body.widthMm <= maxMm,
          ),
        ).toBe(true);
      }
    }
  });

  it("replays the self-contained log to the exact timestamped document", () => {
    const result = generate(KITCHEN_L_DESIGN.room);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.log.occurredAt).toBe(OCCURRED_AT);
    const replayInput: Parameters<typeof replayGenerationLog>[0] = {
      log: result.log,
      probeAt: createFakeProbeFactory(),
      // @ts-expect-error — replay's shell timestamp is owned by the log, not its caller.
      occurredAt: "2030-01-01T00:00:00.000Z",
    };
    const replayed = replayGenerationLog(replayInput);
    expect(replayed).toStrictEqual(result.design);
    expect(replayed.createdAt).toBe(OCCURRED_AT);
    expect(replayed.updatedAt).toBe(OCCURRED_AT);
  });

  it("returns no design and releases its lease when the minimum cannot stand", () => {
    const ledger = createLeaseLedger();
    const result = generateKitchen({
      room: { shape: "L", widthMm: 900, depthMm: 2000, heightMm: 2200 },
      occurredAt: OCCURRED_AT,
      probeAt: createFakeProbeFactory({}, ledger),
    });

    expect(result).not.toHaveProperty("design");
    expect(result).toMatchObject({
      ok: false,
      reason: { code: "MINIMUM_NOT_MET" },
    });
    expect(ledger).toMatchObject({ taken: 1, released: 1 });
  });

  it("preserves the minimum pair as optional core roles yield across short rooms", () => {
    const full = generate(KITCHEN_L_DESIGN.room);
    const noFridge = generate({
      shape: "L",
      widthMm: 900,
      depthMm: 2800,
      heightMm: 2200,
    });
    const minimum = generate({
      shape: "L",
      widthMm: 900,
      depthMm: 2200,
      heightMm: 2200,
    });

    expect(full.ok && full.log.plan.dropped).toEqual([]);
    expect(noFridge.ok && noFridge.log.plan.dropped).toEqual(["fridge"]);
    expect(minimum.ok && minimum.log.plan.dropped).toEqual([
      "fridge",
      "preparation",
    ]);
    for (const result of [full, noFridge, minimum]) {
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.log.steps.find((step) => step.id === "sink")?.status).toBe(
        "placed",
      );
      expect(result.log.steps.find((step) => step.id === "hob")?.status).toBe(
        "placed",
      );
    }
  });

  it("keeps wall B's shallow reserve and spends it at the deepest depth", () => {
    const generated = generate(KITCHEN_L_DESIGN.room);
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const shallowBareMm = bareFloorEndMm(generated.design, "B");
    const deepest = Math.max(...declaredCabinetDepthsMm());
    const changed = setCabinetDepth({
      design: generated.design,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      cabinetDepthMm: deepest,
      occurredAt: OCCURRED_AT,
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;

    expect(shallowBareMm).toBeLessThanOrEqual(699);
    expect(bareFloorEndMm(changed.design, "B")).toBeLessThanOrEqual(599);
  });

  it("releases its only lease when a real command dependency throws", () => {
    const ledger = createLeaseLedger();
    const factory = createFakeProbeFactory({}, ledger);
    const throwingFactory = (depthMm: number) => {
      const lease = factory(depthMm);
      return {
        use: <T>(borrow: Parameters<typeof lease.use<T>>[0]): T =>
          lease.use(() =>
            borrow({
              measure: () => {
                throw new Error("probe boom");
              },
            }),
          ),
      };
    };

    expect(() =>
      generateKitchen({
        room: KITCHEN_L_DESIGN.room,
        occurredAt: OCCURRED_AT,
        probeAt: throwingFactory,
      }),
    ).toThrow("probe boom");
    expect(ledger).toMatchObject({ taken: 1, released: 1 });
  });

  it("logs a refused upper without changing the composed bases beneath it", () => {
    const ordinary = generate(KITCHEN_L_DESIGN.room);
    expect(ordinary.ok).toBe(true);
    if (!ordinary.ok) return;
    const ledger = createLeaseLedger();
    const rejectingUpperFactory: BodyProbeFactory = (cabinetDepthMm) => {
      const delegate = createFakeProbe({
        catalog: buildKitchenLBodyCatalog(cabinetDepthMm),
      });
      ledger.take();
      return createBodyProbeLease(
        {
          measure: (request) => {
            const measured = delegate.measure(request);
            return request.buildId === "wall-cabinet"
              ? { ...measured, carcassWidthM: measured.carcassWidthM + 0.1 }
              : measured;
          },
        },
        ledger.release,
      );
    };
    const rejected = generateKitchen({
      room: KITCHEN_L_DESIGN.room,
      occurredAt: OCCURRED_AT,
      probeAt: rejectingUpperFactory,
    });

    expect(rejected.ok).toBe(true);
    expect(ledger).toMatchObject({ taken: 1, released: 1 });
    if (!rejected.ok) return;
    expect(
      rejected.log.steps
        .filter((step) => step.role === "upper")
        .every(
          (step) =>
            step.status === "not_placed" &&
            step.reason.code === "BUILT_SIZE_MISMATCH",
        ),
    ).toBe(true);
    expect(
      rejected.design.placements.some(
        (placement) => placement.body.buildId === "wall-cabinet",
      ),
    ).toBe(false);
    expect(
      rejected.design.placements.filter((placement) => placement.y0Mm === 0),
    ).toStrictEqual(
      ordinary.design.placements.filter((placement) => placement.y0Mm === 0),
    );
  });

  it("returns deterministic valid kitchens over approved rooms including low ceilings", () => {
    const l = APPROVED_ROOM_POLICY.buildableShapes.L;
    if (!l) throw new Error("approved policy has no L");
    fc.assert(
      fc.property(
        fc.record({
          shape: fc.constant("L" as const),
          widthMm: fc.integer({ min: l.wallA.minMm, max: l.wallA.maxMm }),
          depthMm: fc.integer({ min: l.wallB.minMm, max: l.wallB.maxMm }),
          heightMm: fc.integer({ min: 2200, max: 2599 }),
        }),
        (room) => {
          const first = generate(room);
          const second = generate(room);
          expect(second).toStrictEqual(first);
          if (!first.ok) return;
          const catalog = buildKitchenLBodyCatalog(
            cabinetDepthMmOf(first.design),
          );
          expect(validateDesignForCatalog(first.design, catalog)).toEqual([]);
          expect(findOverflowingPlacementIds(first.design)).toEqual([]);
          expect(
            first.design.placements.every(
              (placement) =>
                placement.y0Mm + placement.body.heightMm <= room.heightMm,
            ),
          ).toBe(true);
          expect(
            first.design.placements.filter(
              (placement) => placement.body.buildId === "base-sink",
            ),
          ).toHaveLength(1);
          expect(
            first.design.placements.filter(
              (placement) => placement.body.buildId === "base-hob-oven",
            ),
          ).toHaveLength(1);
          expect(coreReadingOrder(first)).toEqual(
            ["fridge", "sink", "preparation", "hob"].filter((role) =>
              first.log.steps.some(
                (step) => step.id === role && step.status === "placed",
              ),
            ),
          );
          expect(upperMismatches(first)).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns valid minimum kitchens for at least 50 approved samples", () => {
    fc.assert(
      fc.property(
        fc.record({
          shape: fc.constant("L" as const),
          widthMm: fc.integer({ min: 2100, max: 6300 }),
          depthMm: fc.integer({ min: 1000, max: 5100 }),
          heightMm: fc.integer({ min: 2200, max: 3900 }),
        }),
        (room) => {
          const result = generate(room);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(
            result.log.steps.find((step) => step.id === "sink")?.status,
          ).toBe("placed");
          expect(
            result.log.steps.find((step) => step.id === "hob")?.status,
          ).toBe("placed");
          expect(interiorFloorGaps(result.design)).toEqual([]);
          expect(
            replayGenerationLog({
              log: result.log,
              probeAt: createFakeProbeFactory(),
            }),
          ).toStrictEqual(result.design);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("returns no design for at least 50 approved samples below the minimum", () => {
    fc.assert(
      fc.property(
        fc.record({
          shape: fc.constant("L" as const),
          widthMm: fc.constant(900),
          depthMm: fc.integer({ min: 1000, max: 2159 }),
          heightMm: fc.integer({ min: 2200, max: 3900 }),
        }),
        (room) => {
          const result = generate(room);
          expect(result.ok).toBe(false);
          expect(result).not.toHaveProperty("design");
        },
      ),
      { numRuns: 50 },
    );
  });
});

function bareFloorEndMm(
  design: Parameters<typeof derivePlacementRecords>[0],
  wall: "A" | "B",
) {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  const farthest = Math.max(
    ...derivePlacementRecords(design, catalog)
      .filter((record) => record.wall === wall && record.frame.y0 === 0)
      .map((record) =>
        Math.round(
          ((wall === "A" ? record.frame.x : record.frame.z) +
            record.frame.w / 2) *
            1000,
        ),
      ),
  );
  return (wall === "A" ? design.room.widthMm : design.room.depthMm) - farthest;
}

function interiorFloorGaps(design: Design) {
  return (design.emptyColumns ?? []).flatMap((empty) => {
    if (empty.y0Mm !== 0) return [];
    const composed = design.placements.filter(
      (placement) =>
        placement.wall === empty.wall &&
        placement.y0Mm === 0 &&
        placement.id.startsWith("n"),
    );
    if (composed.length < 2) return [];
    const left = empty.alongMm - empty.widthMm / 2;
    const right = empty.alongMm + empty.widthMm / 2;
    const first = Math.min(
      ...composed.map(
        (placement) => placement.alongMm - placement.body.widthMm / 2,
      ),
    );
    const last = Math.max(
      ...composed.map(
        (placement) => placement.alongMm + placement.body.widthMm / 2,
      ),
    );
    return left >= first && right <= last
      ? [`${empty.wall}:${String(left)}-${String(right)}`]
      : [];
  });
}

function coreReadingOrder(
  result: Extract<ReturnType<typeof generate>, { readonly ok: true }>,
) {
  const core = result.log.steps
    .flatMap((step) => (step.status === "placed" ? [step] : []))
    .filter((step) =>
      ["fridge", "sink", "preparation", "hob"].includes(step.id),
    )
    .map((step) => {
      const placement = result.design.placements.find(
        (candidate) => candidate.id === step.placementId,
      );
      if (!placement) throw new Error(`missing ${step.placementId}`);
      return { role: step.id, placement };
    })
    .sort((left, right) => {
      if (left.placement.wall !== right.placement.wall) {
        return left.placement.wall === "B" ? -1 : 1;
      }
      return left.placement.wall === "B"
        ? right.placement.alongMm - left.placement.alongMm
        : left.placement.alongMm - right.placement.alongMm;
    });
  return core.map(({ role }) => role);
}

function upperMismatches(
  result: Extract<ReturnType<typeof generate>, { readonly ok: true }>,
) {
  return result.log.steps
    .flatMap((step) => (step.status === "placed" ? [step] : []))
    .filter(
      (step) =>
        step.role !== "fridge" && step.role !== "upper" && step.role !== "hood",
    )
    .flatMap((baseStep) => {
      const upperRole = baseStep.id === "hob" ? "hood" : "upper";
      const upperStep = result.log.steps.find(
        (step) => step.id === `${upperRole}:${baseStep.id}`,
      );
      const base = result.design.placements.find(
        (placement) => placement.id === baseStep.placementId,
      );
      const upper =
        upperStep?.status === "placed"
          ? result.design.placements.find(
              (placement) => placement.id === upperStep.placementId,
            )
          : undefined;
      return base &&
        upper &&
        upper.wall === base.wall &&
        upper.alongMm === base.alongMm &&
        upper.body.widthMm === base.body.widthMm &&
        upper.y0Mm === 1500 &&
        upper.body.buildId === (baseStep.id === "hob" ? "hood" : "wall-cabinet")
        ? []
        : [baseStep.id];
    });
}
