// M7C wave C3 slice S1: the generated top row (FB-003; ADR 0110 Amendment O9).
//
// The owner's selection, verbatim: "A 400 mm push-to-open cabinet above every wall cabinet and above the
// hood, all shapes, rooms at least 2600 high; doors, not lift fronts; none above tall columns."
//
// Asked of generated kitchens of every shape and of heights either side of the 2600 line. The generated
// bodies are told apart from the shell's by id (`n…` against the shell's `p…` and `right-p…`), so the
// corner units, which carry their own top unit (C2), are never counted here.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  isPushToOpen,
  MAX_PLACEMENTS,
  replayGenerationLog,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type GenerateKitchenResult,
} from "../../src/index.js";
import { generateKitchen } from "../../src/generation/generate-kitchen.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-10-02T10:00:00.000Z";
const WALL_ROW_FLOOR_MM = 1500;
const TOP_ROW_FLOOR_MM = 2200;
const TOP_ROW_HEIGHT_MM = 400;
const TOP_ROW_MIN_ROOM_HEIGHT_MM = 2600;
const GENERATED_ID_PREFIX = "n";
const LARGE_U_TOTAL_MM = 10_000;
const HEIGHTS_MM = [2200, 2400, 2599, 2600, 2601, 3000, 3900] as const;

type Generated = Extract<GenerateKitchenResult, { ok: true }>;

function generate(room: DesignRoom): GenerateKitchenResult {
  return generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

function generatedBodies(design: Design): DesignPlacement[] {
  return design.placements.filter((placement) =>
    placement.id.startsWith(GENERATED_ID_PREFIX),
  );
}

function wallRowOf(design: Design): DesignPlacement[] {
  return generatedBodies(design).filter(
    (placement) =>
      placement.y0Mm >= WALL_ROW_FLOOR_MM && placement.y0Mm < TOP_ROW_FLOOR_MM,
  );
}

function topRowOf(design: Design): DesignPlacement[] {
  return generatedBodies(design).filter(
    (placement) => placement.y0Mm >= TOP_ROW_FLOOR_MM,
  );
}

function spanKey(placement: DesignPlacement): string {
  const halfMm = placement.body.widthMm / 2;
  return `${placement.wall}:${String(placement.alongMm - halfMm)}-${String(placement.alongMm + halfMm)}`;
}

function sortedKeys(placements: readonly DesignPlacement[]): string[] {
  return placements.map(spanKey).sort();
}

function isLargeU(room: DesignRoom): boolean {
  return (
    room.shape === "U" &&
    room.widthMm + room.depthMm + (room.wallCMm ?? 0) >= LARGE_U_TOTAL_MM
  );
}

const heightArb = fc.constantFrom(...HEIGHTS_MM);
const lRoomArb: fc.Arbitrary<DesignRoom> = fc
  .record({
    widthMm: fc.integer({ min: 1800, max: 6000 }),
    depthMm: fc.integer({ min: 1600, max: 6000 }),
    heightMm: heightArb,
    cornerDirection: fc.constantFrom("left" as const, "right" as const),
  })
  .map((fields) => ({ shape: "L" as const, ...fields }));
const uRoomArb: fc.Arbitrary<DesignRoom> = fc
  .record({
    widthMm: fc.integer({ min: 2700, max: 6000 }),
    depthMm: fc.integer({ min: 1600, max: 6000 }),
    wallCMm: fc.integer({ min: 1600, max: 6000 }),
    heightMm: heightArb,
  })
  .map((fields) => ({ shape: "U" as const, ...fields }));
const linearRoomArb: fc.Arbitrary<DesignRoom> = fc
  .record({
    widthMm: fc.integer({ min: 1200, max: 6000 }),
    heightMm: heightArb,
  })
  .map((fields) => ({ shape: "linear" as const, depthMm: 3400, ...fields }));
const anyRoomArb = fc.oneof(lRoomArb, uRoomArb, linearRoomArb);

function composedOrSkip(room: DesignRoom): Generated | undefined {
  const result = generate(room);
  return result.ok ? result : undefined;
}

function composed(room: DesignRoom): Generated {
  const result = composedOrSkip(room);
  if (result === undefined) {
    throw new Error(`${JSON.stringify(room)} did not compose`);
  }
  return result;
}

describe("a generated kitchen's top row (criterion 1)", () => {
  propertyTest.prop([anyRoomArb], { numRuns: 400 })(
    "has one 400 mm wall cabinet over exactly each wall-row body in a room 2600 high or more, and none below",
    (room) => {
      const result = composedOrSkip(room);
      if (result === undefined) return;
      const { design } = result;
      const wallRow = wallRowOf(design);
      const tops = topRowOf(design);

      if (room.heightMm < TOP_ROW_MIN_ROOM_HEIGHT_MM) {
        expect(tops).toEqual([]);
        expect(result.log.steps.some((step) => step.role === "top")).toBe(
          false,
        );
        return;
      }
      expect(sortedKeys(tops)).toEqual(sortedKeys(wallRow));
      for (const top of tops) {
        expect(top.body.buildId).toBe("wall-cabinet");
        expect(top.y0Mm).toBe(TOP_ROW_FLOOR_MM);
        expect(top.body.heightMm).toBe(TOP_ROW_HEIGHT_MM);
      }
    },
  );

  propertyTest.prop([anyRoomArb], { numRuns: 400 })(
    "never has a top step refused: every attempted top insert is placed",
    (room) => {
      const result = composedOrSkip(room);
      if (result === undefined) return;

      expect(
        result.log.steps.filter(
          (step) => step.role === "top" && step.status !== "placed",
        ),
      ).toEqual([]);
    },
  );

  it("exercises every shape and both sides of the line, so the property above is not vacuous", () => {
    const rooms: DesignRoom[] = [
      { shape: "L", widthMm: 4100, depthMm: 3300, heightMm: 2600 },
      {
        shape: "U",
        widthMm: 4000,
        depthMm: 3000,
        wallCMm: 2800,
        heightMm: 2600,
      },
      { shape: "linear", widthMm: 4200, depthMm: 3400, heightMm: 2600 },
    ];

    for (const room of rooms) {
      expect(topRowOf(composed(room).design).length).toBeGreaterThan(1);
    }
  });

  it("places a top cabinet over the hood as wide as the hood", () => {
    const { design } = composed({
      shape: "L",
      widthMm: 4100,
      depthMm: 3300,
      heightMm: 2600,
    });
    const hoods = design.placements.filter(
      (placement) => placement.body.buildId === "hood",
    );

    expect(hoods).toHaveLength(1);
    expect(topRowOf(design).map(spanKey)).toEqual(
      expect.arrayContaining(hoods.map(spanKey)),
    );
  });

  it("is logged after every upper, as top steps, and the log replays to the design", () => {
    const result = composed({
      shape: "U",
      widthMm: 4000,
      depthMm: 3000,
      wallCMm: 2800,
      heightMm: 2600,
    });
    const roles = result.log.steps.map((step) => step.role);
    const firstTop = roles.indexOf("top");

    expect(firstTop).toBeGreaterThan(roles.lastIndexOf("upper"));
    expect(roles.slice(firstTop).every((role) => role === "top")).toBe(true);
    expect(
      replayGenerationLog({
        log: result.log,
        probeAt: createFakeProbeFactory(),
      }),
    ).toStrictEqual(result.design);
  });
});

describe("what the top row must not stand over (criterion 2)", () => {
  propertyTest.prop([anyRoomArb], { numRuns: 400 })(
    "no top cabinet stands over a full-height body or the shell's own pieces",
    (room) => {
      const result = composedOrSkip(room);
      if (result === undefined) return;
      const { design } = result;
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
      const keepsOut = design.placements.filter(
        (placement) =>
          !placement.id.startsWith(GENERATED_ID_PREFIX) ||
          (catalog.get(placement.body.buildId)?.nominalHeightMm ?? 0) >
            WALL_ROW_FLOOR_MM,
      );

      for (const top of topRowOf(design)) {
        const overlapped = keepsOut.filter(
          (other) =>
            other.wall === top.wall &&
            other.y0Mm + other.body.heightMm > top.y0Mm &&
            Math.abs(other.alongMm - top.alongMm) <
              (other.body.widthMm + top.body.widthMm) / 2,
        );
        expect(overlapped.map((other) => other.id)).toEqual([]);
      }
    },
  );

  it("leaves the wall above a fridge and a tall oven without a top cabinet", () => {
    const result = composed({
      shape: "L",
      widthMm: 4100,
      depthMm: 3300,
      heightMm: 2600,
    });
    const { design } = result;
    const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
    const tall = generatedBodies(design).filter(
      (placement) =>
        (catalog.get(placement.body.buildId)?.nominalHeightMm ?? 0) >
        WALL_ROW_FLOOR_MM,
    );

    expect(tall.length).toBeGreaterThan(0);
    for (const body of tall) {
      expect(topRowOf(design).map(spanKey)).not.toContain(spanKey(body));
    }
  });

  propertyTest.prop(
    [
      fc.record({
        widthMm: fc.integer({ min: 3400, max: 6000 }),
        depthMm: fc.integer({ min: 3400, max: 6000 }),
        wallCMm: fc.integer({ min: 3400, max: 6000 }),
      }),
    ],
    { numRuns: 100 },
  )(
    "a large U's back wall carries a top cabinet over its hood and nothing else",
    (sizes) => {
      const room: DesignRoom = {
        shape: "U",
        ...sizes,
        heightMm: 2600,
      };
      if (!isLargeU(room)) return;
      const result = composedOrSkip(room);
      if (result === undefined) return;
      const hoodsOnA = result.design.placements.filter(
        (placement) =>
          placement.body.buildId === "hood" && placement.wall === "A",
      );
      const topsOnA = topRowOf(result.design).filter(
        (placement) => placement.wall === "A",
      );

      expect(sortedKeys(topsOnA)).toEqual(sortedKeys(hoodsOnA));
    },
  );
});

describe("how a top cabinet opens (criterion 3)", () => {
  it("records no handle and resolves push-to-open with no customer action", () => {
    const result = composed({
      shape: "L",
      widthMm: 4100,
      depthMm: 3300,
      heightMm: 2600,
    });
    const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(result.design));
    const tops = topRowOf(result.design);

    expect(tops.length).toBeGreaterThan(0);
    for (const top of tops) {
      expect(top.body.handle).toBeUndefined();
      expect(
        isPushToOpen({
          kitchenSettings: {},
          y0Mm: top.y0Mm,
          recordedHandle: top.body.handle,
          canHandle: catalog.get(top.body.buildId)?.canHandle === true,
        }),
      ).toBe(true);
    }
  });
});

describe("the rooms the top row leaves alone (criterion 4)", () => {
  it.each([2200, 2599])(
    "makes no top step and no top cabinet at %i mm, and does not throw",
    (heightMm) => {
      const result = composed({
        shape: "L",
        widthMm: 4100,
        depthMm: 3300,
        heightMm,
      });

      expect(topRowOf(result.design)).toEqual([]);
      expect(result.log.steps.filter((step) => step.role === "top")).toEqual(
        [],
      );
    },
  );
});

describe("the placement budget (criterion 5)", () => {
  it("keeps the largest rooms generated under MAX_PLACEMENTS", () => {
    const largest: DesignRoom[] = [
      { shape: "L", widthMm: 6000, depthMm: 6000, heightMm: 3900 },
      {
        shape: "U",
        widthMm: 6000,
        depthMm: 6000,
        wallCMm: 6000,
        heightMm: 3900,
      },
      {
        shape: "U",
        widthMm: 3300,
        depthMm: 3300,
        wallCMm: 3300,
        heightMm: 3900,
      },
      { shape: "linear", widthMm: 6000, depthMm: 3400, heightMm: 3900 },
    ];

    for (const room of largest) {
      expect(composed(room).design.placements.length).toBeLessThan(
        MAX_PLACEMENTS,
      );
    }
  });
});
