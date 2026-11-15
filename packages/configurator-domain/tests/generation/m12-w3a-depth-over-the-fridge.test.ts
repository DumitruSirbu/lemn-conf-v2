// M12 wave W3a (owner feedback 2026-11-14, item 3; ADR 0183 decisions 4-5, 7): a wall body over a freestanding fridge is
// built to the deepest declared cabinet depth, 700 mm, at every cabinet depth, and nothing else changes.
//
// **The oracle for "nothing else" is the depth rule as W2 left it** (`support/before-m12-w3a.ts`): the declaration read
// as absent, so every column answers the lifted arm. W2 generated the same kitchens with the same steps; the only thing
// W3a moves is the depth a column answers.
//
// The grid is the shape of W2's (L, straight and U rooms, round numbers); the ceilings are the three that matter to the
// cabinet over the fridge: the lowest that fits, the grid's last level and one above it. Every arm keeps a floor, so a
// grid that stopped reaching one fails instead of passing empty.
import { describe, expect, it, vi } from "vitest";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type GenerateKitchenResult,
} from "../../src/index.js";
import { toMillimetres } from "../../src/millimetres.js";
import { occupiedDepthM } from "../../src/occupied-depth.js";
import { validateDesignForCatalog } from "../../src/validate-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
} from "../../src/void-engine.js";
import { WALL_FRONT_ASSEMBLY_MM } from "../../src/worktop-depth.js";
import { beforeM12W3a } from "../support/before-m12-w3a.js";
import {
  DEPTHS_MM,
  FRIDGE_STEP_ID,
  generate,
  LOWEST_CEILING_THAT_FITS_MM,
  OPENING_TOP_MM,
  OVER_BODY_STEP_ID,
  placementOf,
  Reach,
  stepNamed,
  WALL_CABINET_BUILD_ID,
} from "../support/over-the-fridge.js";

vi.mock("../../src/wall-body-over-it.js", async (importOriginal) => {
  const { withTheDeepWallBodySwitchable } = await import(
    "../support/before-m12-w3a.js"
  );
  return withTheDeepWallBodySwitchable(await importOriginal());
});

/** The owner's number (ADR 0183 decision 4), written here as the expectation. */
const OVER_THE_FRIDGE_FINISHED_DEPTH_MM = 700;
const CEILINGS_MM = [
  LOWEST_CEILING_THAT_FITS_MM,
  OPENING_TOP_MM,
  OPENING_TOP_MM + 400,
];
const WIDTHS_MM = [2400, 3200, 4000, 4800, 5600, 6000];
const DEPTHS_ROOM_MM = [1800, 2800, 3400, 4200, 5000];
const U_WIDTHS_MM = [2400, 3200, 4800];
const U_SIDES_MM = [1800, 3400, 5000];

type Generated = Extract<GenerateKitchenResult, { ok: true }>;

function roomsAt(heightMm: number): DesignRoom[] {
  const rooms: DesignRoom[] = [];
  for (const widthMm of WIDTHS_MM) {
    for (const depthMm of DEPTHS_ROOM_MM) {
      rooms.push({ shape: "L", widthMm, depthMm, heightMm });
    }
    rooms.push({ shape: "linear", widthMm, depthMm: 3400, heightMm });
  }
  for (const widthMm of U_WIDTHS_MM) {
    for (const depthMm of U_SIDES_MM) {
      for (const wallCMm of U_SIDES_MM) {
        rooms.push({ shape: "U", widthMm, depthMm, wallCMm, heightMm });
      }
    }
  }
  return rooms;
}

/** Both generations of one room at one depth: the live rule and W2's. `undefined` where the room is not generated. */
function bothGenerations(room: DesignRoom, cabinetDepthMm: number) {
  const now = generate(room, cabinetDepthMm);
  if (!now.ok) return undefined;
  const w2 = beforeM12W3a(() => generate(room, cabinetDepthMm));
  return w2.ok ? { now, w2 } : undefined;
}

/** The placement of the cabinet generation hung over the fridge, or `undefined` where none was placed. */
function overTheFridgeOf(result: Generated): DesignPlacement | undefined {
  const step = stepNamed(result, OVER_BODY_STEP_ID);
  return step?.status === "placed"
    ? placementOf(result.design, step)
    : undefined;
}

/** The placement with the one field W3a moves taken off it, so what remains is what must be equal. */
function withoutTheSeat(placement: DesignPlacement): DesignPlacement {
  const body = { ...placement.body };
  delete body.seatDepthMm;
  return { ...placement, body };
}

function finishedDepthMmOf(design: Design, placementId: string): number {
  const record = derivePlacementRecords(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
  ).find((candidate) => candidate.id === placementId);
  if (!record) throw new Error(`no record for ${placementId}`);
  return toMillimetres(occupiedDepthM(record));
}

describe("at setting 700 a generated kitchen is byte-equal to W2's (W3a-1)", () => {
  it("is the same design and the same log, over every shape and ceiling", () => {
    const reach = new Reach();
    for (const heightMm of CEILINGS_MM) {
      for (const room of roomsAt(heightMm)) {
        const both = bothGenerations(room, 700);
        if (!both) continue;
        expect(JSON.stringify(both.now), JSON.stringify(room)).toBe(
          JSON.stringify(both.w2),
        );
        if (overTheFridgeOf(both.now))
          reach.note(`${room.shape} with a cabinet`);
      }
    }
    for (const shape of ["L", "linear", "U"]) {
      expect(reach.of(`${shape} with a cabinet`), shape).toBeGreaterThan(10);
    }
  });
});

describe("at setting 600 only a wall body over a fridge differs, and only in depth (W3a-2)", () => {
  it("moves the over-fridge cabinet to a 700 finish and leaves every other placement and the log as W2 had them", () => {
    const reach = new Reach();
    for (const heightMm of CEILINGS_MM) {
      for (const room of roomsAt(heightMm)) {
        const both = bothGenerations(room, 600);
        if (!both) continue;
        const overId = overTheFridgeOf(both.now)?.id;
        const at = JSON.stringify(room);

        expect(both.now.log, at).toEqual(both.w2.log);
        expect(both.now.design.placements, at).toHaveLength(
          both.w2.design.placements.length,
        );
        for (const [index, placement] of both.now.design.placements.entries()) {
          const before = both.w2.design.placements[index];
          if (placement.id !== overId) {
            expect(placement, `${at} ${placement.id}`).toEqual(before);
            continue;
          }
          expect(withoutTheSeat(placement), at).toEqual(
            before ? withoutTheSeat(before) : undefined,
          );
          expect(placement.body.seatDepthMm, at).toBe(
            OVER_THE_FRIDGE_FINISHED_DEPTH_MM - WALL_FRONT_ASSEMBLY_MM,
          );
          expect(before?.body.seatDepthMm, at).toBe(
            600 - WALL_FRONT_ASSEMBLY_MM,
          );
          expect(finishedDepthMmOf(both.now.design, placement.id), at).toBe(
            OVER_THE_FRIDGE_FINISHED_DEPTH_MM,
          );
          // W3a-6: never past the machine's own clearance under it, and the build is a declared size, not the 742.
          const fridgeStep = stepNamed(both.now, FRIDGE_STEP_ID);
          if (fridgeStep?.status !== "placed") throw new Error("no fridge");
          expect(
            finishedDepthMmOf(both.now.design, placement.id),
            at,
          ).toBeLessThanOrEqual(
            finishedDepthMmOf(
              both.now.design,
              placementOf(both.now.design, fridgeStep).id,
            ),
          );
          reach.note(`${room.shape} over the fridge`);
        }
        expect(both.now.design.settings, at).toEqual(both.w2.design.settings);
        expect(both.now.design.room, at).toEqual(both.w2.design.room);
      }
    }
    for (const shape of ["L", "linear", "U"]) {
      expect(reach.of(`${shape} over the fridge`), shape).toBeGreaterThan(10);
    }
  });

  it("builds the cabinet at the same finished depth at both settings, so the setting does not reach it", () => {
    const depths = new Set<number>();
    for (const cabinetDepthMm of DEPTHS_MM) {
      const room: DesignRoom = {
        shape: "L",
        widthMm: 4000,
        depthMm: 3400,
        heightMm: OPENING_TOP_MM,
      };
      const result = generate(room, cabinetDepthMm);
      if (!result.ok) throw new Error("the reference room is not generated");
      const cabinet = overTheFridgeOf(result);
      if (!cabinet) throw new Error("no cabinet over the fridge");
      expect(cabinet.body.buildId).toBe(WALL_CABINET_BUILD_ID);
      depths.add(finishedDepthMmOf(result.design, cabinet.id));
    }
    expect([...depths]).toEqual([OVER_THE_FRIDGE_FINISHED_DEPTH_MM]);
  });

  it("generates a fridge step in every room it compares, so the comparison is not about two empty kitchens", () => {
    const room: DesignRoom = {
      shape: "L",
      widthMm: 4000,
      depthMm: 3400,
      heightMm: OPENING_TOP_MM,
    };
    const result = generate(room, 600);
    expect(result.ok && stepNamed(result, FRIDGE_STEP_ID)?.status).toBe(
      "placed",
    );
  });
});

describe("a stored design that records the earlier depth loads and validates untouched (W3a-6, ADR 0167)", () => {
  it("accepts the over-fridge body recorded at 600 at setting 600, keeps its recorded depth, and answers the fridge arm", () => {
    const room: DesignRoom = {
      shape: "L",
      widthMm: 4000,
      depthMm: 3400,
      heightMm: OPENING_TOP_MM,
    };
    const recordedAtW2 = beforeM12W3a(() => generate(room, 600));
    if (!recordedAtW2.ok)
      throw new Error("the reference room is not generated");
    const cabinet = overTheFridgeOf(recordedAtW2);
    if (!cabinet) throw new Error("no cabinet over the fridge");
    expect(cabinet.body.seatDepthMm).toBe(600 - WALL_FRONT_ASSEMBLY_MM);
    const catalog = buildKitchenLBodyCatalog(600);

    const issues = validateDesignForCatalog(recordedAtW2.design, catalog);
    const records = derivePlacementRecords(recordedAtW2.design, catalog);
    const columns = deriveColumns(records, {}, recordedAtW2.design.room);

    expect(issues).toEqual([]);
    expect(finishedDepthMmOf(recordedAtW2.design, cabinet.id)).toBe(600);
    expect(
      [...columns.values()].filter((column) => column.hasDeepWallBodyUnder),
    ).toHaveLength(1);
  });
});
