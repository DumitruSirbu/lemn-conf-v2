import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  createBodyProbeLease,
  declaredCabinetDepthsMm,
  derivePlacementRecords,
  DISHWASHER_BUILD_ID,
  findOverflowingPlacementIds,
  generateKitchen,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  PAN_DRAWER_BASE_BUILD_ID,
  replayGenerationLog,
  setCabinetDepth,
  toInsertableBody,
  validateDesignForCatalog,
  type BodyCatalog,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type BodyProbeFactory,
} from "../../src/index.js";
import { narrowerEnteredWall } from "../support/entered-walls.js";
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

type GeneratedKitchen = Extract<
  ReturnType<typeof generate>,
  { readonly ok: true }
>;

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
    // 7D5b S0b / ADR 0110 M11: S1's bottle would take the reference room's only oven tower and no pan
    // drawer depends on it, so the bottle is omitted and the tower stands at [2700, 3300]; the hob
    // carries drawers again (E4). Its width, tile and position remain the ruled 600 mm at [2100, 2700]
    // — was `base-hob-oven` beside a bottle from 7D5 S1 until M11.
    //
    // **The preparation body moved in 7D4 S2 and its position did not**: Amendment F5 makes it
    // `base-3drawer`, the cutlery reached while cutting being within reach of the preparation
    // surface. Still 600 mm at [1500, 2100] on wall A, which is 7D4's criterion 11 — this wave
    // changes a body's identity and never its width.
    expect(named).toEqual([
      ["base-sink", "A", 900, 1500],
      ["base-3drawer", "A", 1500, 2100],
      ["base-hob-2drawer", "A", 2100, 2700],
    ]);
    expect(
      result.log.plan.bases
        .filter((base) => base.id === "bottle" || base.id.startsWith("column:"))
        .map((base) => [base.buildId, base.wall, base.startMm, base.endMm]),
    ).toEqual([["tall-oven-tower", "A", 2700, 3300]]);
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

  it("plans wall A to its reachable odd-span end before allowing the final storage resize", () => {
    // Remainder exactly 200 on purpose: the resized slot ends 200 mm short of the run end, which is the
    // inclusive edge of the final fit-body resize allowance. The bottle after the hob shifts the slot
    // by 300 mm (M7 wave 7D5 S1), so the room moved from 3501 to 3801 to keep that edge. The pan drawer
    // before the hob (7D5 S2, owner ruling Q-H6a = A) then took 3801's only storage slot, so the room
    // moved again by its 600 mm, to 4401. The ceiling dropped to 2000 because at 2200 a 4401 wall A
    // stands the 7D3 tall block in the slot this test is about.
    const room: DesignRoom = {
      shape: "L",
      widthMm: 4401,
      depthMm: 1700,
      heightMm: 2000,
    };
    const result = generate(room);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(lShellFloorRuns(room).A).toMatchObject({
      startMm: 900,
      endMm: 4400,
    });
    expect(result.log.plan.remainderMm.A).toBe(200);
    // 7D5b S1 / ADR 0110 M1/M8/M9: this room holds no door slot beside the sink, so M7(e) swaps the
    // drawers — the dishwasher takes the preparation 3-drawer's module and the pan drawer carries the
    // preparation id and role (M9). The pan drawer is therefore found by its body, not by its id; its
    // span is unchanged.
    expect(
      result.log.plan.bases.find(
        (base) => base.buildId === PAN_DRAWER_BASE_BUILD_ID,
      ),
    ).toMatchObject({
      id: "preparation",
      role: "preparation",
      wall: "A",
      startMm: 2100,
      endMm: 2700,
    });
    expect(
      result.log.plan.bases.find(
        (base) => base.buildId === DISHWASHER_BUILD_ID,
      ),
    ).toMatchObject({
      id: "dishwasher",
      role: "storage",
      wall: "A",
      startMm: 1500,
      endMm: 2100,
    });
    const storage = result.log.plan.bases.find(
      (base) => base.id === "storage:A:0",
    );
    expect(storage).toMatchObject({
      role: "storage",
      widthMm: 600,
      wall: "A",
      startMm: 3600,
      endMm: 4200,
    });
    const resizes = result.log.commands.filter(
      (command) => command.type === "set_width",
    );
    expect(resizes).toHaveLength(1);
    expect(resizes[0]?.widthMm).toBe(600);
    expect(
      result.log.steps.find((step) => step.id === storage?.id)?.commands,
    ).toContainEqual(resizes[0]);
    expect(interiorFloorGaps(result.design)).toEqual([]);
    expect(findOverflowingPlacementIds(result.design)).toEqual([]);
    expect(
      replayGenerationLog({
        log: result.log,
        probeAt: createFakeProbeFactory(),
      }),
    ).toStrictEqual(result.design);
  });

  it("applies the same reachable-end derivation after wall B's even 100 mm reserve", () => {
    const room: DesignRoom = {
      shape: "L",
      widthMm: 2100,
      depthMm: 1801,
      heightMm: 2200,
    };
    const result = generate(room);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(lShellFloorRuns(room).B).toMatchObject({
      startMm: 900,
      endMm: 1700,
    });
    expect(result.log.plan.remainderMm.B).toBe(200);
    const sink = result.log.plan.bases.find((base) => base.id === "sink");
    expect(sink).toMatchObject({
      widthMm: 600,
      wall: "B",
      startMm: 900,
      endMm: 1500,
    });
    const resizes = result.log.commands.filter(
      (command) => command.type === "set_width",
    );
    expect(resizes).toHaveLength(1);
    expect(resizes[0]?.widthMm).toBe(600);
    expect(
      result.log.steps.find((step) => step.id === sink?.id)?.commands,
    ).toContainEqual(resizes[0]);
    expect(interiorFloorGaps(result.design)).toEqual([]);
    expect(findOverflowingPlacementIds(result.design)).toEqual([]);
    expect(
      replayGenerationLog({
        log: result.log,
        probeAt: createFakeProbeFactory(),
      }),
    ).toStrictEqual(result.design);
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
          // ADR 0110 Amendment E4: exactly one oven, never two and never zero. Where a tower stands
          // the hob carries drawers instead, so the count that must be 1 is the two bodies together.
          expect(
            first.design.placements.filter((placement) =>
              ["base-hob-oven", "tall-oven-tower"].includes(
                placement.body.buildId,
              ),
            ),
          ).toHaveLength(1);
          expect(coreReadingOrder(first)).toEqual(
            ["fridge", "sink", "preparation", "hob"].filter((role) =>
              first.log.steps.some(
                (step) => step.id === role && step.status === "placed",
              ),
            ),
          );
          expect(upperMismatches({ result: first, catalog })).toEqual([]);
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
          // Named approved samples, so both walls stop at the owner's 6000 mm (ADR 0120 Amendment B2).
          widthMm: fc.integer({ min: 2100, max: 6000 }),
          depthMm: fc.integer({ min: 1000, max: 6000 }),
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

  it("attempts an upper above a planned base exactly when the catalogue clears the wall row", () => {
    const l = APPROVED_ROOM_POLICY.buildableShapes.L;
    if (!l) throw new Error("approved policy has no L");
    let suppressedBases = 0;
    fc.assert(
      fc.property(
        fc.record({
          shape: fc.constant("L" as const),
          widthMm: fc.integer({ min: l.wallA.minMm, max: l.wallA.maxMm }),
          depthMm: fc.integer({ min: l.wallB.minMm, max: l.wallB.maxMm }),
          heightMm: fc.integer({ min: 2200, max: 3900 }),
        }),
        (room) => {
          const result = generate(room);
          if (!result.ok) return;
          const catalog = buildKitchenLBodyCatalog(
            cabinetDepthMmOf(result.design),
          );
          suppressedBases += basesAboveWallRow({ result, catalog }).length;
          expect(upperSuppressionMismatches({ result, catalog })).toEqual([]);
          expect(uppersOverTallBodies({ result, catalog })).toEqual([]);
        },
      ),
      { numRuns: 150 },
    );
    // Without this the property above passes vacuously in a sweep that never plans a tall body.
    expect(suppressedBases).toBeGreaterThan(0);
  });

  it("leaves the wall row above the fridge empty, reading its height off the catalogue", () => {
    const result = generate(KITCHEN_L_DESIGN.room);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(result.design));
    expect(result.log.steps.find((step) => step.id === "fridge")?.status).toBe(
      "placed",
    );
    // 7D5b S0b / ADR 0110 M11: the fridge is again not the only body the rule suppresses an upper
    // above — the reference room's oven tower is back and reaches the same wall row. The subject is
    // unchanged: the fridge's wall row stays empty, found from the declared height, never the name.
    expect(basesAboveWallRow({ result, catalog })).toEqual([
      "column:A:0",
      "fridge",
    ]);
    expect(
      result.log.steps.filter((step) => step.id.endsWith(":fridge")),
    ).toEqual([]);
    expect(
      result.log.steps.filter((step) => step.id.endsWith(":column:A:0")),
    ).toEqual([]);
    expect(uppersOverTallBodies({ result, catalog })).toEqual([]);
    expect(upperMismatches({ result, catalog })).toEqual([]);
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

/** The wall the kitchen is laid out against the reading order on — the **narrower entered wall**,
 *  and wall B where the two are equal, because M7 wave 7D8 keyed the run onto the wider one (ADR
 *  0120 Amendment E). Derived in `entered-walls.ts` from the room the design carries rather than
 *  read off the composer, so this file and it agree only if both read that rule the same way. */
function wallReadInReverse(room: DesignRoom): "A" | "B" {
  return narrowerEnteredWall(room);
}

function coreReadingOrder(
  result: Extract<ReturnType<typeof generate>, { readonly ok: true }>,
) {
  const reversed = wallReadInReverse(result.design.room);
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
        return left.placement.wall === reversed ? -1 : 1;
      }
      return left.placement.wall === reversed
        ? right.placement.alongMm - left.placement.alongMm
        : left.placement.alongMm - right.placement.alongMm;
    });
  return core.map(({ role }) => role);
}

/** ADR 0110 Amendment E7's input, read where the amendment puts it: the catalogue entry's declared
 *  height, never the role's name. A body whose declared top is above the wall row's floor has no
 *  opening up there, so no upper is owed above it. */
function basesAboveWallRow(input: {
  readonly result: GeneratedKitchen;
  readonly catalog: BodyCatalog;
}): readonly string[] {
  const floorMm = wallRowFloorMm(input.result.design);
  return input.result.log.plan.bases
    .filter((base) => declaredTopMm(input.catalog, base.buildId) > floorMm)
    .map((base) => base.id);
}

/** The bases whose upper step disagrees with the rule — attempted above a body that reaches into
 *  the wall row, or skipped above one that does not. */
function upperSuppressionMismatches(input: {
  readonly result: GeneratedKitchen;
  readonly catalog: BodyCatalog;
}): readonly string[] {
  const suppressed = new Set(basesAboveWallRow(input));
  return input.result.log.plan.bases
    .filter((base) => {
      const upperRole = base.role === "hob" ? "hood" : "upper";
      const attempted = input.result.log.steps.some(
        (step) => step.id === `${upperRole}:${base.id}`,
      );
      return attempted === suppressed.has(base.id);
    })
    .map((base) => base.id);
}

/** The placed uppers that overlap a generated body reaching into the wall row — the geometric half
 *  of the rule, asserted on the design rather than on the log. */
function uppersOverTallBodies(input: {
  readonly result: GeneratedKitchen;
  readonly catalog: BodyCatalog;
}): readonly string[] {
  const floorMm = wallRowFloorMm(input.result.design);
  const generated = input.result.log.steps.flatMap((step) =>
    step.status === "placed"
      ? input.result.design.placements.filter(
          (placement) => placement.id === step.placementId,
        )
      : [],
  );
  const tall = generated.filter(
    (placement) =>
      placement.y0Mm === 0 &&
      declaredTopMm(input.catalog, placement.body.buildId) > floorMm,
  );
  return generated
    .filter((upper) => upper.y0Mm >= floorMm)
    .filter((upper) =>
      tall.some(
        (body) => body.wall === upper.wall && overlapsAlongWall(body, upper),
      ),
    )
    .map((upper) => upper.id);
}

/** The wall row's floor as the generated design reports it — the lowest row standing off the floor
 *  — so this reads the boundary back rather than restating a generation-side constant. */
function wallRowFloorMm(design: Design): number {
  const raised = design.placements
    .map((placement) => placement.y0Mm)
    .filter((y0Mm) => y0Mm > 0);
  if (raised.length === 0) {
    throw new Error("the generated design has no row above the floor");
  }
  return Math.min(...raised);
}

function declaredTopMm(catalog: BodyCatalog, buildId: string): number {
  const nominalHeightMm = catalog.get(buildId)?.nominalHeightMm;
  if (nominalHeightMm === undefined) {
    throw new Error(`the catalogue declares no height for ${buildId}`);
  }
  return nominalHeightMm;
}

function overlapsAlongWall(
  left: DesignPlacement,
  right: DesignPlacement,
): boolean {
  const leftStartMm = left.alongMm - left.body.widthMm / 2;
  const leftEndMm = left.alongMm + left.body.widthMm / 2;
  const rightStartMm = right.alongMm - right.body.widthMm / 2;
  const rightEndMm = right.alongMm + right.body.widthMm / 2;
  return leftStartMm < rightEndMm && rightStartMm < leftEndMm;
}

/** Every base that should carry an upper, and whether the one above it is the body, wall, width and
 *  row the rule says. **What it skips is derived, not named**: a body reaching into the wall row has
 *  no opening above it, which was the fridge alone until a block stood at wall A's free end and is
 *  now whatever the catalogue declares tall (ADR 0110 Amendment E7). */
function upperMismatches(input: {
  readonly result: GeneratedKitchen;
  readonly catalog: BodyCatalog;
}) {
  const { result } = input;
  const suppressed = new Set(basesAboveWallRow(input));
  return result.log.steps
    .flatMap((step) => (step.status === "placed" ? [step] : []))
    .filter(
      (step) =>
        !suppressed.has(step.id) &&
        step.role !== "upper" &&
        step.role !== "hood",
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
