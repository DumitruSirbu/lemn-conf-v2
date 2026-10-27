// **Wave H2 QA (M10): a kitchen stamped at 700 mm is generated, built and probed at 700 mm.**
//
// H2 replaced the shell's module-level 600 with the depth the request stamps (`shell-design.ts`, `generate-kitchen.ts`).
// The implementer's checks are forward-only (a 700 kitchen validates, and 700 is refused where 600 is). This file
// attacks the same change from four independent sides:
//
// 1. The older implementation of the same rule. `setCabinetDepth` already moves a 600 kitchen to 700. A shell built
//    natively at 700 must be the shell that command makes: same structural pieces to the millimetre, same free ground
//    (union of the recorded columns per wall, row and clearance), in both directions, for all three shapes.
// 2. Plan geometry read off the built bodies' frames, not off the validator: no two bodies' footprints intersect,
//    every body stands inside the room, and the depth a body is built to is the one the declared catalogue gives it.
// 3. The policy edge. 700 must succeed exactly where 600 does, and the edge is where the 100 mm of extra corner reach
//    bites, so the walls are swept in 10 mm steps from each approved minimum.
// 4. The run functions keep their old reading when called without a depth, and move when called with one.
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildLinearShellDesign,
  buildLShellDesign,
  buildUShellDesign,
  cabinetDepthMmOf,
  fatalDesignValidationIssues,
  generateKitchen,
  lShellFloorRuns,
  replayGenerationLog,
  setCabinetDepth,
  uShellFloorRuns,
  validateDesignForCatalog,
  validateRoomInput,
  type Design,
  type DesignRoom,
  type DesignWall,
  type PlacementRecord,
  type RoomInput,
} from "../../src/index.js";
import { isLargeU } from "../../src/generation/run-layout.js";
import { MIN_WIDTH_M } from "../../src/void-engine.js";
import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { derivePlacementRecords } from "../../src/void-engine.js";
import { wallDepthMmForWorktop } from "../../src/worktop-depth.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-10-27T09:30:00.000Z";
const SHALLOW_MM = 600;
const DEEP_MM = 700;

function roomOf(input: RoomInput): DesignRoom | undefined {
  const result = validateRoomInput(input, APPROVED_ROOM_POLICY);
  return result.ok ? result.room : undefined;
}

function roomsOf(inputs: readonly RoomInput[]): DesignRoom[] {
  return inputs.flatMap((input) => roomOf(input) ?? []);
}

const SHELL_ROOMS: readonly DesignRoom[] = roomsOf([
  ...[1200, 1800, 2600, 3333, 4800, 6000].flatMap((wallAMm) =>
    [2200, 2600, 3900].map(
      (heightMm): RoomInput => ({ shape: "linear", wallAMm, heightMm }),
    ),
  ),
  ...[900, 1300, 2000, 3600, 6000].flatMap((wallAMm) =>
    [1000, 1500, 3000, 6000].flatMap((wallBMm) =>
      (["left", "right"] as const).map(
        (cornerDirection): RoomInput => ({
          shape: "L",
          wallAMm,
          wallBMm,
          heightMm: 2600,
          cornerDirection,
        }),
      ),
    ),
  ),
  ...[2700, 3100, 4200, 6000].flatMap((wallAMm) =>
    [1000, 1700, 3600, 6000].flatMap((wallBMm) =>
      [1000, 2400, 6000].map(
        (wallCMm): RoomInput => ({
          shape: "U",
          wallAMm,
          wallBMm,
          wallCMm,
          heightMm: 2600,
          cornerDirection: "left",
        }),
      ),
    ),
  ),
]);

function shellOf(room: DesignRoom, cabinetDepthMm?: number): Design {
  const input = {
    room,
    occurredAt: OCCURRED_AT,
    ...(cabinetDepthMm === undefined
      ? {}
      : { newKitchenSettings: { cabinetDepthMm } }),
  };
  if (room.shape === "linear") return buildLinearShellDesign(input);
  if (room.shape === "L") return buildLShellDesign(input);
  return buildUShellDesign(input);
}

function movedTo(design: Design, cabinetDepthMm: number): Design | undefined {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: createFakeProbeFactory(),
    occurredAt: OCCURRED_AT,
  });
  return result.ok ? result.design : undefined;
}

/** The ground the design records as free, per wall, row, ceiling and clearance: merged runs of [start, end). */
function freeGroundOf(design: Design): Record<string, [number, number][]> {
  const byKey = new Map<string, [number, number][]>();
  for (const column of design.emptyColumns ?? []) {
    const key = `${column.wall}|${String(column.y0Mm)}-${String(column.topMm)}|${String(column.depthMm)}`;
    const half = column.widthMm / 2;
    byKey.set(key, [
      ...(byKey.get(key) ?? []),
      [column.alongMm - half, column.alongMm + half],
    ]);
  }
  return Object.fromEntries(
    [...byKey.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, spans]) => [key, mergedSpans(spans)]),
  );
}

function mergedSpans(spans: readonly [number, number][]): [number, number][] {
  const sorted = [...spans].sort((left, right) => left[0] - right[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && start <= last[1])
      last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function structuralPiecesOf(design: Design) {
  return design.placements
    .map((placement) => ({
      id: placement.id,
      wall: placement.wall,
      alongMm: placement.alongMm,
      y0Mm: placement.y0Mm,
      buildId: placement.body.buildId,
      widthMm: placement.body.widthMm,
      heightMm: placement.body.heightMm,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

describe("a shell built at 700 mm is the shell `setCabinetDepth` makes from the 600 mm one (the older rule)", () => {
  it("has the same structural pieces to the millimetre, and the same free ground, in every swept room", () => {
    let compared = 0;
    for (const room of SHELL_ROOMS) {
      const viaCommand = movedTo(shellOf(room), DEEP_MM);
      if (viaCommand === undefined) continue;
      const native = shellOf(room, DEEP_MM);

      expect(cabinetDepthMmOf(native), JSON.stringify(room)).toBe(DEEP_MM);
      expect(structuralPiecesOf(native), JSON.stringify(room)).toEqual(
        structuralPiecesOf(viaCommand),
      );
      expect(freeGroundOf(native), JSON.stringify(room)).toEqual(
        freeGroundOf(viaCommand),
      );
      compared += 1;
    }

    expect(compared).toBeGreaterThan(SHELL_ROOMS.length * 0.8);
  });

  it("is also what moving a native 700 mm shell back to 600 mm gives: the 600 mm shell", () => {
    let compared = 0;
    for (const room of SHELL_ROOMS) {
      const back = movedTo(shellOf(room, DEEP_MM), SHALLOW_MM);
      if (back === undefined) continue;
      const native = shellOf(room);

      expect(structuralPiecesOf(back), JSON.stringify(room)).toEqual(
        structuralPiecesOf(native),
      );
      expect(freeGroundOf(back), JSON.stringify(room)).toEqual(
        freeGroundOf(native),
      );
      compared += 1;
    }

    expect(compared).toBeGreaterThan(SHELL_ROOMS.length * 0.8);
  });

  it("equals the command's shell column for column in the free ground, so no sliver stands beside a deeper base corner", () => {
    const narrowestInsertableMm = Math.min(
      ...[...buildKitchenLBodyCatalog(DEEP_MM).values()]
        .filter((definition) => definition.insertable === true)
        .map((definition) => definition.minWidthMm ?? MIN_WIDTH_M * 1000),
    );
    const spanWidthsOf = (design: Design) =>
      Object.values(freeGroundOf(design)).flatMap((spans) =>
        spans.map(([start, end]) => end - start),
      );
    let compared = 0;
    for (const room of SHELL_ROOMS) {
      const viaCommand = movedTo(shellOf(room), DEEP_MM);
      if (viaCommand === undefined) continue;
      const native = shellOf(room, DEEP_MM);

      expect(freeGroundOf(native), JSON.stringify(room)).toEqual(
        freeGroundOf(viaCommand),
      );
      const narrow = (design: Design) =>
        spanWidthsOf(design).filter(
          (widthMm) => widthMm < narrowestInsertableMm,
        );
      expect(
        narrow(native).length,
        `${JSON.stringify(room)}: a depth must not add a free span no body fits`,
      ).toBeLessThanOrEqual(narrow(shellOf(room)).length);
      compared += 1;
    }

    expect(narrowestInsertableMm).toBeGreaterThan(0);
    expect(compared).toBeGreaterThan(SHELL_ROOMS.length * 0.8);
  });

  it("keeps a large U's back wall tiled over the corner bases at both depths, from the corner to the room's far end", () => {
    const largeUs = SHELL_ROOMS.filter(
      (room) => room.shape === "U" && isLargeU(room),
    );
    for (const room of largeUs) {
      for (const cabinetDepthMm of [SHALLOW_MM, DEEP_MM]) {
        const spans = Object.entries(
          freeGroundOf(shellOf(room, cabinetDepthMm)),
        )
          .filter(([key]) => key.startsWith("A|1500-"))
          .flatMap(([, wallRowSpans]) => wallRowSpans);

        expect(spans.length, JSON.stringify(room)).toBeGreaterThan(0);
        expect(Math.min(...spans.map(([start]) => start))).toBe(0);
        expect(Math.max(...spans.map(([, end]) => end))).toBe(room.widthMm);
      }
    }

    expect(largeUs.length).toBeGreaterThan(5);
  });

  it("records the clearances the declared depths give: a wall unit's 400 and a base run deeper than at 600", () => {
    for (const room of SHELL_ROOMS) {
      const shallow = shellOf(room);
      const deep = shellOf(room, DEEP_MM);
      const depthsOf = (design: Design, y0Mm: number) =>
        new Set(
          (design.emptyColumns ?? [])
            .filter((column) => column.y0Mm === y0Mm)
            .map((column) => column.depthMm),
        );

      expect([...depthsOf(deep, 1500)], JSON.stringify(room)).toSatisfy(
        (depths: number[]) =>
          depths.every((depth) => depth === wallDepthMmForWorktop(DEEP_MM)),
      );
      expect([...depthsOf(shallow, 1500)], JSON.stringify(room)).toSatisfy(
        (depths: number[]) =>
          depths.every((depth) => depth === wallDepthMmForWorktop(SHALLOW_MM)),
      );
      const baseDeep = Math.min(...depthsOf(deep, 0));
      const baseShallow = Math.min(...depthsOf(shallow, 0));
      if (Number.isFinite(baseDeep) && Number.isFinite(baseShallow)) {
        expect(baseDeep - baseShallow, JSON.stringify(room)).toBe(
          DEEP_MM - SHALLOW_MM,
        );
      }
    }
  });
});

describe("700 succeeds exactly where 600 does, down to the policy edge", () => {
  const EDGE_ROOMS: readonly DesignRoom[] = roomsOf([
    ...range(1100, 1700, 10).map(
      (wallAMm): RoomInput => ({ shape: "linear", wallAMm, heightMm: 2600 }),
    ),
    ...range(900, 2400, 60).flatMap((wallAMm) =>
      range(1000, 2500, 60).flatMap((wallBMm) =>
        (["left", "right"] as const).map(
          (cornerDirection): RoomInput => ({
            shape: "L",
            wallAMm,
            wallBMm,
            heightMm: wallBMm % 120 === 0 ? 2200 : 2600,
            cornerDirection,
          }),
        ),
      ),
    ),
    ...range(2700, 3100, 40).flatMap((wallAMm) =>
      range(1000, 1700, 100).flatMap((wallBMm) =>
        range(1000, 1700, 100).map(
          (wallCMm): RoomInput => ({
            shape: "U",
            wallAMm,
            wallBMm,
            wallCMm,
            heightMm: 2600,
            cornerDirection: "left",
          }),
        ),
      ),
    ),
  ]);

  function generatedAt(room: DesignRoom, cabinetDepthMm: number) {
    return generateKitchen({
      room,
      occurredAt: OCCURRED_AT,
      probeAt: createFakeProbeFactory(),
      newKitchenSettings: { cabinetDepthMm },
    });
  }

  it("agrees on every room within a few hundred millimetres of each approved minimum", () => {
    const disagreements: string[] = [];
    const refused: string[] = [];
    const accepted = { linear: 0, L: 0, U: 0 };
    for (const room of EDGE_ROOMS) {
      const shallow = generatedAt(room, SHALLOW_MM);
      const deep = generatedAt(room, DEEP_MM);
      if (shallow.ok !== deep.ok) disagreements.push(JSON.stringify(room));
      if (deep.ok) accepted[room.shape] += 1;
      else refused.push(JSON.stringify(room));
    }

    expect(disagreements).toEqual([]);
    expect(
      refused,
      "a room the approved policy admits must generate at 700 mm",
    ).toEqual([]);
    expect(accepted.linear).toBeGreaterThan(10);
    expect(accepted.L).toBeGreaterThan(10);
    expect(accepted.U).toBeGreaterThan(10);
  });

  it("builds a validator-clean, replayable 700 mm design in each accepted edge room", () => {
    for (const room of EDGE_ROOMS) {
      const deep = generatedAt(room, DEEP_MM);
      if (!deep.ok) continue;
      const issues = validateDesignForCatalog(
        deep.design,
        buildKitchenLBodyCatalog(DEEP_MM),
      );

      expect(issues, JSON.stringify(room)).toEqual([]);
      expect(
        replayGenerationLog({
          log: JSON.parse(JSON.stringify(deep.log)) as typeof deep.log,
          probeAt: createFakeProbeFactory(),
        }),
        JSON.stringify(room),
      ).toEqual(deep.design);
    }
  });
});

function range(from: number, to: number, step: number): number[] {
  const values: number[] = [];
  for (let value = from; value <= to; value += step) values.push(value);
  return values;
}

describe("the bodies of a generated 700 mm kitchen stand where the plan says (footprints read off the frames)", () => {
  const GENERATED_ROOMS: readonly DesignRoom[] = roomsOf([
    ...[1800, 2400, 3300, 4500, 6000].flatMap((wallAMm) =>
      [2200, 2600, 3900].map(
        (heightMm): RoomInput => ({ shape: "linear", wallAMm, heightMm }),
      ),
    ),
    ...[1500, 2400, 3600, 5100, 6000].flatMap((wallAMm) =>
      [1200, 2000, 3000, 4500].flatMap((wallBMm) =>
        [2200, 2600, 3900].flatMap((heightMm) =>
          (["left", "right"] as const).map(
            (cornerDirection): RoomInput => ({
              shape: "L",
              wallAMm,
              wallBMm,
              heightMm,
              cornerDirection,
            }),
          ),
        ),
      ),
    ),
    ...[3000, 4200, 6000].flatMap((wallAMm) =>
      [1500, 2400, 3600].flatMap((wallBMm) =>
        [1500, 2600, 3600].map(
          (wallCMm): RoomInput => ({
            shape: "U",
            wallAMm,
            wallBMm,
            wallCMm,
            heightMm: 2600,
            cornerDirection: "left",
          }),
        ),
      ),
    ),
  ]);

  function generatedAt(
    room: DesignRoom,
    cabinetDepthMm: number,
  ): Design | undefined {
    const result = generateKitchen({
      room,
      occurredAt: OCCURRED_AT,
      probeAt: createFakeProbeFactory(),
      newKitchenSettings: { cabinetDepthMm },
    });
    return result.ok ? result.design : undefined;
  }

  function generatedDesigns(cabinetDepthMm: number): Design[] {
    return GENERATED_ROOMS.flatMap(
      (room) => generatedAt(room, cabinetDepthMm) ?? [],
    );
  }

  interface Footprint {
    readonly id: string;
    readonly wall: DesignWall;
    readonly x0: number;
    readonly x1: number;
    readonly z0: number;
    readonly z1: number;
    readonly y0: number;
    readonly y1: number;
  }

  function footprintOf(record: PlacementRecord): Footprint {
    const { frame } = record;
    const quarterTurn = Math.abs(Math.sin(frame.ry)) > 0.5;
    const halfW = (quarterTurn ? frame.d : frame.w) / 2;
    const halfD = (quarterTurn ? frame.w : frame.d) / 2;
    return {
      id: record.id,
      wall: record.wall,
      x0: frame.x - halfW,
      x1: frame.x + halfW,
      z0: frame.z - halfD,
      z1: frame.z + halfD,
      y0: frame.y0,
      y1: frame.y0 + frame.h,
    };
  }

  const EPSILON_M = 0.0005;

  function intersecting(left: Footprint, right: Footprint): boolean {
    const overlap = (a0: number, a1: number, b0: number, b1: number) =>
      Math.min(a1, b1) - Math.max(a0, b0) > EPSILON_M;
    return (
      overlap(left.x0, left.x1, right.x0, right.x1) &&
      overlap(left.z0, left.z1, right.z0, right.z1) &&
      overlap(left.y0, left.y1, right.y0, right.y1)
    );
  }

  function intersectionsIn(design: Design): string[] {
    const records = derivePlacementRecords(
      design,
      buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
    ).map(footprintOf);
    const found: string[] = [];
    records.forEach((left, index) => {
      for (const right of records.slice(index + 1)) {
        if (intersecting(left, right)) found.push(`${left.id} x ${right.id}`);
      }
    });
    return found;
  }

  it("has no two bodies intersecting at 600 mm (calibrates the footprint reading against the shipped depth)", () => {
    const designs = generatedDesigns(SHALLOW_MM);

    expect(designs.length).toBeGreaterThan(40);
    for (const design of designs) {
      expect(intersectionsIn(design), JSON.stringify(design.room)).toEqual([]);
    }
  });

  it("has no two bodies intersecting at 700 mm", () => {
    const designs = generatedDesigns(DEEP_MM);

    expect(designs.length).toBeGreaterThan(40);
    for (const design of designs) {
      expect(intersectionsIn(design), JSON.stringify(design.room)).toEqual([]);
    }
  });

  it("reports no validator issue of any severity at 700 mm that it does not report at 600 mm", () => {
    const issueCodesAt = (design: Design) =>
      validateDesignForCatalog(
        design,
        buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
      ).map((issue) => issue.code);

    let compared = 0;
    for (const room of GENERATED_ROOMS) {
      const shallow = generatedAt(room, SHALLOW_MM);
      const deep = generatedAt(room, DEEP_MM);
      expect(deep === undefined, JSON.stringify(room)).toBe(
        shallow === undefined,
      );
      if (shallow === undefined || deep === undefined) continue;

      expect(
        fatalDesignValidationIssues(
          validateDesignForCatalog(deep, buildKitchenLBodyCatalog(DEEP_MM)),
        ),
      ).toEqual([]);
      expect(issueCodesAt(deep), JSON.stringify(room)).toEqual(
        issueCodesAt(shallow),
      );
      compared += 1;
    }

    expect(compared).toBeGreaterThan(40);
  });

  it("seats every body at the depth `setCabinetDepth` seats the same build id at 700 mm, and at 600 mm natively", () => {
    const seatsByBuildId = (design: Design) => {
      const seats = new Map<string, Set<number | undefined>>();
      for (const placement of design.placements) {
        const known = seats.get(placement.body.buildId) ?? new Set();
        known.add(placement.body.seatDepthMm);
        seats.set(placement.body.buildId, known);
      }
      return seats;
    };
    let compared = 0;
    for (const room of GENERATED_ROOMS) {
      const native = generatedAt(room, DEEP_MM);
      const shallow = generatedAt(room, SHALLOW_MM);
      const moved =
        shallow === undefined ? undefined : movedTo(shallow, DEEP_MM);
      if (native === undefined || moved === undefined) continue;
      const nativeSeats = seatsByBuildId(native);
      const movedSeats = seatsByBuildId(moved);
      for (const [buildId, seats] of nativeSeats) {
        const counterpart = movedSeats.get(buildId);
        if (counterpart === undefined || seats.has(undefined)) continue;
        expect([...seats].sort(), `${JSON.stringify(room)} ${buildId}`).toEqual(
          [...counterpart].sort(),
        );
      }
      compared += 1;
    }

    expect(compared).toBeGreaterThan(40);
  });

  it("stands every footprint inside the room", () => {
    for (const design of generatedDesigns(DEEP_MM)) {
      const { widthMm } = design.room;
      const depthMm = Math.max(design.room.depthMm, design.room.wallCMm ?? 0);
      const records = derivePlacementRecords(
        design,
        buildKitchenLBodyCatalog(DEEP_MM),
      );
      for (const footprint of records.map(footprintOf)) {
        const tolerance = EPSILON_M;
        expect(footprint.x0, footprint.id).toBeGreaterThanOrEqual(-tolerance);
        expect(footprint.x1, footprint.id).toBeLessThanOrEqual(
          widthMm / 1000 + tolerance,
        );
        expect(footprint.z0, footprint.id).toBeGreaterThanOrEqual(-tolerance);
        expect(footprint.z1, footprint.id).toBeLessThanOrEqual(
          depthMm / 1000 + tolerance,
        );
      }
    }
  });
});

describe("the probe is leased at the stamped depth and at no other", () => {
  it.each([SHALLOW_MM, DEEP_MM])(
    "leases only %i mm, in generation and in replay, in every shape",
    (cabinetDepthMm) => {
      for (const room of GENERATED_SAMPLE) {
        const leased: number[] = [];
        const inner = createFakeProbeFactory();
        const probeAt = (depthMm: number) => {
          leased.push(depthMm);
          return inner(depthMm);
        };
        const result = generateKitchen({
          room,
          occurredAt: OCCURRED_AT,
          probeAt,
          newKitchenSettings: { cabinetDepthMm },
        });
        if (!result.ok) throw new Error(`room refused: ${result.reason.code}`);
        replayGenerationLog({ log: result.log, probeAt });

        expect(leased.length, room.shape).toBeGreaterThanOrEqual(2);
        expect(new Set(leased), room.shape).toEqual(new Set([cabinetDepthMm]));
      }
    },
  );
});

const GENERATED_SAMPLE: readonly DesignRoom[] = roomsOf([
  { shape: "linear", wallAMm: 3300, heightMm: 2600 },
  {
    shape: "L",
    wallAMm: 3600,
    wallBMm: 3000,
    heightMm: 2600,
    cornerDirection: "left",
  },
  {
    shape: "U",
    wallAMm: 4200,
    wallBMm: 3600,
    wallCMm: 3000,
    heightMm: 2600,
    cornerDirection: "left",
  },
]);

describe("the exported floor runs read at 600 mm when no depth is passed, and at the depth when one is", () => {
  const LU_ROOMS = SHELL_ROOMS.filter((room) => room.shape !== "linear");

  it("answers the same with the depth omitted as with 600 passed, for every L and U", () => {
    for (const room of LU_ROOMS) {
      if (room.shape === "L") {
        expect(lShellFloorRuns(room), JSON.stringify(room)).toEqual(
          lShellFloorRuns(room, SHALLOW_MM),
        );
      } else {
        expect(uShellFloorRuns(room), JSON.stringify(room)).toEqual(
          uShellFloorRuns(room, SHALLOW_MM),
        );
      }
    }
  });

  it("starts a 700 mm run where the 700 mm shell's free ground starts, on every wall that has one", () => {
    for (const room of LU_ROOMS) {
      const runs =
        room.shape === "L"
          ? lShellFloorRuns(room, DEEP_MM)
          : uShellFloorRuns(room, DEEP_MM);
      const ground = freeGroundOf(shellOf(room, DEEP_MM));
      for (const run of Object.values(runs)) {
        if (run.endMm <= run.startMm) continue;
        const floorKey = Object.keys(ground).find((key) =>
          key.startsWith(`${run.wall}|0-`),
        );
        const spans = floorKey === undefined ? [] : (ground[floorKey] ?? []);
        const first = spans[0];
        if (first === undefined) continue;
        expect(first[0], `${JSON.stringify(room)} wall ${run.wall}`).toBe(
          run.startMm,
        );
      }
    }
  });
});
