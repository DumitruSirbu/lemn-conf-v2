// M7 waves 7D2/7A2 adversarial QA — the planner and shell must share the whole-mm reachable end.
import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  findOverflowingPlacementIds,
  generateKitchen,
  lShellFloorRuns,
  replayGenerationLog,
  validateDesignForCatalog,
  type Design,
  type DesignRoom,
  type DesignWall,
} from "../../src/index.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-13T00:00:00.000Z";
const FLOOR_RUN_START_MM = 900;
const WALL_B_DEPTH_RESERVE_MM = 100;

function generate(room: DesignRoom) {
  return generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

function physicalFloorEndMm(room: DesignRoom, wall: DesignWall): number {
  return wall === "A" ? room.widthMm : room.depthMm - WALL_B_DEPTH_RESERVE_MM;
}

function independentlyReachableEndMm(
  room: DesignRoom,
  wall: DesignWall,
): number {
  const physicalEndMm = physicalFloorEndMm(room, wall);
  return physicalEndMm - ((physicalEndMm - FLOOR_RUN_START_MM) % 2);
}

function floorIntervals(design: Design, wall: DesignWall) {
  const placed = design.placements
    .filter((placement) => placement.wall === wall && placement.y0Mm === 0)
    .map((placement) => ({
      startMm: placement.alongMm - placement.body.widthMm / 2,
      endMm: placement.alongMm + placement.body.widthMm / 2,
    }));
  const empty = (design.emptyColumns ?? [])
    .filter((column) => column.wall === wall && column.y0Mm === 0)
    .map((column) => ({
      startMm: column.alongMm - column.widthMm / 2,
      endMm: column.alongMm + column.widthMm / 2,
    }));
  return [...placed, ...empty];
}

function pointIsCovered(design: Design, wall: DesignWall, pointMm: number) {
  return floorIntervals(design, wall).some(
    ({ startMm, endMm }) => startMm <= pointMm && pointMm <= endMm,
  );
}

function interiorFloorGaps(design: Design): string[] {
  return (design.emptyColumns ?? []).flatMap((empty) => {
    if (empty.y0Mm !== 0) return [];
    const composed = design.placements.filter(
      (placement) =>
        placement.wall === empty.wall &&
        placement.y0Mm === 0 &&
        placement.id.startsWith("n"),
    );
    if (composed.length < 2) return [];
    const emptyStart = empty.alongMm - empty.widthMm / 2;
    const emptyEnd = empty.alongMm + empty.widthMm / 2;
    const composedStart = Math.min(
      ...composed.map(
        (placement) => placement.alongMm - placement.body.widthMm / 2,
      ),
    );
    const composedEnd = Math.max(
      ...composed.map(
        (placement) => placement.alongMm + placement.body.widthMm / 2,
      ),
    );
    return emptyStart >= composedStart && emptyEnd <= composedEnd
      ? [`${empty.wall}:${String(emptyStart)}-${String(emptyEnd)}`]
      : [];
  });
}

function expectGridSafeGeneration(room: DesignRoom): void {
  const result = generate(room);
  expect(result.ok).toBe(true);
  if (!result.ok) return;

  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(result.design));
  expect(validateDesignForCatalog(result.design, catalog)).toEqual([]);
  expect(findOverflowingPlacementIds(result.design)).toEqual([]);
  expect(interiorFloorGaps(result.design)).toEqual([]);
  expect(
    replayGenerationLog({
      log: result.log,
      probeAt: createFakeProbeFactory(),
    }),
  ).toStrictEqual(result.design);

  for (const wall of ["A", "B"] as const) {
    const run = lShellFloorRuns(room)[wall];
    const reachableEndMm = independentlyReachableEndMm(room, wall);
    expect(run).toStrictEqual({
      wall,
      startMm: FLOOR_RUN_START_MM,
      endMm: reachableEndMm,
    });
    expect(
      floorIntervals(result.design, wall).every(
        ({ endMm }) => endMm <= reachableEndMm,
      ),
    ).toBe(true);

    const physicalEndMm = physicalFloorEndMm(room, wall);
    if (physicalEndMm - reachableEndMm === 1) {
      expect(pointIsCovered(result.design, wall, reachableEndMm + 0.5)).toBe(
        false,
      );
    }

    const widthsOnWall = (result.design.emptyColumns ?? [])
      .filter((column) => column.wall === wall)
      .map((column) => column.widthMm);
    expect(widthsOnWall.every((widthMm) => widthMm <= 800)).toBe(true);

    const resizesOnWall = result.log.commands.filter((command) => {
      if (command.type !== "set_width") return false;
      const placement = result.design.placements.find(
        (candidate) => candidate.id === command.placementId,
      );
      return placement?.wall === wall;
    });
    if (resizesOnWall.length > 0) {
      expect(result.log.plan.remainderMm[wall]).toBeGreaterThan(0);
      expect(result.log.plan.remainderMm[wall]).toBeLessThanOrEqual(200);
    }
    if (result.log.plan.remainderMm[wall] > 200) {
      expect(resizesOnWall).toEqual([]);
    }
  }

  const centresMm = [
    ...result.design.placements.map((placement) => placement.alongMm),
    ...(result.design.emptyColumns ?? []).map((column) => column.alongMm),
    ...(result.design.columnExtents ?? []).map((column) => column.alongMm),
  ];
  expect(centresMm.every(Number.isInteger)).toBe(true);
}

function inclusiveRange(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

describe("generateKitchen — odd and even reachable endpoints", () => {
  it.each([
    [{ shape: "L", widthMm: 3501, depthMm: 1700, heightMm: 2200 }, "A"],
    [{ shape: "L", widthMm: 2100, depthMm: 1801, heightMm: 2200 }, "B"],
  ] as const)(
    "leaves the unrecordable millimetre empty in the required witness %#",
    (room, oddWall) => {
      expect(
        physicalFloorEndMm(room, oddWall) -
          independentlyReachableEndMm(room, oddWall),
      ).toBe(1);
      expectGridSafeGeneration(room);
    },
  );

  it("sweeps odd and even endpoints around every high-risk planning transition", () => {
    const rooms: DesignRoom[] = [
      ...[
        ...inclusiveRange(2080, 2120),
        ...inclusiveRange(2680, 2720),
        ...inclusiveRange(3480, 3520),
      ].map((widthMm) => ({
        shape: "L" as const,
        widthMm,
        depthMm: 1700,
        heightMm: 2200,
      })),
      ...[
        ...inclusiveRange(1580, 1620),
        ...inclusiveRange(1680, 1720),
        ...inclusiveRange(1780, 1820),
        ...inclusiveRange(2180, 2220),
      ].map((depthMm) => ({
        shape: "L" as const,
        widthMm: 2100,
        depthMm,
        heightMm: 3900,
      })),
    ];
    const thrown: string[] = [];
    let oddA = 0;
    let evenA = 0;
    let oddB = 0;
    let evenB = 0;

    for (const room of rooms) {
      if (room.widthMm % 2 === 0) evenA += 1;
      else oddA += 1;
      if (room.depthMm % 2 === 0) evenB += 1;
      else oddB += 1;
      try {
        expectGridSafeGeneration(room);
      } catch (error) {
        thrown.push(
          `${String(room.widthMm)}x${String(room.depthMm)}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    expect(thrown).toEqual([]);
    expect(oddA).toBeGreaterThan(0);
    expect(evenA).toBeGreaterThan(0);
    expect(oddB).toBeGreaterThan(0);
    expect(evenB).toBeGreaterThan(0);
    expect(rooms.length).toBeGreaterThanOrEqual(250);
  });
});
