// Backlog 276, M10 P1-e: every catalogue row declares the width a cabinet is quoted at, and for every row the
// generator plans, that width is the one the generator plans it at. Two sources for one figure: the catalogue's
// `defaultWidthMm` and the generator's own constants and output. The generator's side is read twice, from its
// exported constants and from the widths a swept set of generated kitchens actually stand at, so neither side is
// fed by the field under test.
import { describe, expect, it } from "vitest";

import {
  acceptsWidthMm,
  INSERTABLE_BODY_DEFINITIONS,
  toInsertableBody,
} from "../../src/catalog.js";
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  DISHWASHER_PLANNED_WIDTH_MM,
  generateKitchen,
  GENERATION_PRIORITIES,
  KITCHEN_L_DESIGN,
  STORAGE_BODY_WIDTH_MM,
  type DesignRoom,
  type GenerationCoreRole,
} from "../../src/index.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const OCCURRED_AT = "2026-10-26T09:00:00.000Z";
/** The fewest generated bodies a row may rest on: `base-hob-oven` stands in only the kitchens with no oven tower. */
const FLOOR_PER_ROW = 5;

/** Rows whose default the owner still confirms (backlog 276, plan OQ-8): the one place they are listed. It holds
 *  the three rows the generator never builds, which the last tests below require to be here, and the three the
 *  backlog names although the generator does plan them (`base-panbank`, `hood`, `tall-pantry`, whose default is
 *  the generator's width and may still be 800 for the pantry). */
const PROPOSED_DEFAULT_WIDTH_BUILD_IDS: readonly string[] = [
  "base-panbank",
  "wall-lift",
  "open-shelf",
  "hood",
  "tall-pantry",
  "tall-fridge-housing",
];

function priorityWidthMm(role: GenerationCoreRole): number {
  const item = GENERATION_PRIORITIES.find(
    (candidate) => candidate.role === role,
  );
  if (!item) throw new Error(`the generator declares no ${role}`);
  return item.widthMm;
}

/** What the generator's own constants say each planned row is made at. `base-panbank`, the pantry and the tower are
 *  one storage module wide by the generator's comments, which the generated widths below hold to. */
const PLANNED_BY_CONSTANT: readonly (readonly [string, number])[] = [
  ["fridge-free", priorityWidthMm("fridge")],
  ["base-sink", priorityWidthMm("sink")],
  ["base-3drawer", priorityWidthMm("preparation")],
  ["base-hob-oven", priorityWidthMm("hob")],
  ["base-hob-2drawer", priorityWidthMm("hob")],
  ["base-cabinet", STORAGE_BODY_WIDTH_MM],
  ["base-panbank", STORAGE_BODY_WIDTH_MM],
  ["base-dishwasher", DISHWASHER_PLANNED_WIDTH_MM],
  ["tall-pantry", STORAGE_BODY_WIDTH_MM],
  ["tall-oven-tower", STORAGE_BODY_WIDTH_MM],
];

function insertableRows(): readonly (readonly [string, number | undefined])[] {
  return [...INSERTABLE_BODY_DEFINITIONS].map(([buildId, definition]) => [
    buildId,
    definition.defaultWidthMm,
  ]);
}

function sweptRooms(): readonly DesignRoom[] {
  const wallsA = [3000, 3600, 4200, 4800, 5400, 6000];
  const wallsB = [2100, 2600, 3000, 3500, 4000, 5000];
  const lRooms = wallsA.flatMap((widthMm) =>
    wallsB.map(
      (depthMm): DesignRoom => ({
        shape: "L",
        widthMm,
        depthMm,
        heightMm: 2600,
      }),
    ),
  );
  const straight = [2400, 3000, 3600, 4200, 4800, 5400, 6000].map(
    (widthMm): DesignRoom => ({
      shape: "linear",
      widthMm,
      depthMm: 3400,
      heightMm: 2600,
    }),
  );
  const uRooms = [3600, 4800, 6000].flatMap((widthMm) =>
    [2400, 3000, 4200].flatMap((depthMm) =>
      [2200, 3000, 4200].map(
        (wallCMm): DesignRoom => ({
          shape: "U",
          widthMm,
          depthMm,
          wallCMm,
          heightMm: 2600,
        }),
      ),
    ),
  );
  return [...lRooms, ...straight, ...uRooms];
}

/** Every width each row was generated at, over the swept rooms: the walls, the uppers, the top row and the columns. */
function generatedWidthsByRow(): ReadonlyMap<string, readonly number[]> {
  const widths = new Map<string, number[]>();
  for (const room of sweptRooms()) {
    const result = generateKitchen({
      room,
      occurredAt: OCCURRED_AT,
      probeAt: createFakeProbeFactory(),
    });
    if (!result.ok) continue;
    for (const placement of result.design.placements) {
      const known = widths.get(placement.body.buildId) ?? [];
      widths.set(placement.body.buildId, [...known, placement.body.widthMm]);
    }
  }
  return widths;
}

function modalWidthOf(widths: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const width of widths) counts.set(width, (counts.get(width) ?? 0) + 1);
  const [modal] =
    [...counts].sort(([, left], [, right]) => right - left)[0] ?? [];
  if (modal === undefined) throw new Error("no widths to take a mode of");
  return modal;
}

const GENERATED = generatedWidthsByRow();

describe("every insertable row declares the width it is quoted at", () => {
  it("lists sixteen rows, so the sweeps below are not vacuous", () => {
    expect(insertableRows()).toHaveLength(16);
  });

  it.each(insertableRows())(
    "%s declares a default width",
    (_buildId, defaultWidthMm) => {
      expect(defaultWidthMm).toBeGreaterThan(0);
    },
  );

  it.each(insertableRows())(
    "%s can be built at the width it declares",
    (buildId, defaultWidthMm) => {
      const definition = CATALOG.get(buildId);
      const body = definition && toInsertableBody(buildId, definition);
      if (!body || defaultWidthMm === undefined) {
        throw new Error(`${buildId} is not an insertable row with a default`);
      }

      expect(acceptsWidthMm(body, defaultWidthMm)).toBe(true);
      expect(defaultWidthMm % 50).toBe(0);
    },
  );

  it("declares the same default in the catalogue at every cabinet depth", () => {
    for (const depthMm of [600, 700]) {
      const atDepth = buildKitchenLBodyCatalog(depthMm);
      for (const [buildId, defaultWidthMm] of insertableRows()) {
        expect(
          atDepth.get(buildId)?.defaultWidthMm,
          `${buildId} at ${String(depthMm)}`,
        ).toBe(defaultWidthMm);
      }
    }
  });
});

describe("the default width is the width the generator plans each of its rows at (P1-e)", () => {
  it.each(PLANNED_BY_CONSTANT)(
    "%s declares the width the generator's constants plan it at",
    (buildId, plannedMm) => {
      expect(CATALOG.get(buildId)?.defaultWidthMm).toBe(plannedMm);
    },
  );

  it.each(PLANNED_BY_CONSTANT)(
    "%s is generated at its default width more often than at any other width, on enough bodies to say",
    (buildId) => {
      const widths = GENERATED.get(buildId) ?? [];

      expect(widths.length).toBeGreaterThanOrEqual(FLOOR_PER_ROW);
      expect(modalWidthOf(widths)).toBe(CATALOG.get(buildId)?.defaultWidthMm);
    },
  );

  it("generates the bottle cargo, the hood and the wall cabinet at their defaults too", () => {
    for (const buildId of ["base-bottle-cargo", "hood", "wall-cabinet"]) {
      const widths = GENERATED.get(buildId) ?? [];

      expect(widths.length, buildId).toBeGreaterThanOrEqual(FLOOR_PER_ROW);
      expect(modalWidthOf(widths), buildId).toBe(
        CATALOG.get(buildId)?.defaultWidthMm,
      );
    }
  });
});

describe("a row the generator never plans is a proposed default, and listed once", () => {
  const NEVER_GENERATED = [...INSERTABLE_BODY_DEFINITIONS]
    .map(([buildId]) => buildId)
    .filter((buildId) => !GENERATED.has(buildId));

  it("names the rows no swept kitchen contains", () => {
    expect(NEVER_GENERATED.sort()).toEqual(
      ["open-shelf", "tall-fridge-housing", "wall-lift"].sort(),
    );
  });

  it("lists every never-generated row as proposed, so none is a default nobody has confirmed", () => {
    for (const buildId of NEVER_GENERATED) {
      expect(PROPOSED_DEFAULT_WIDTH_BUILD_IDS, buildId).toContain(buildId);
    }
  });

  it("lists as proposed only rows that exist", () => {
    for (const buildId of PROPOSED_DEFAULT_WIDTH_BUILD_IDS) {
      expect(CATALOG.get(buildId)?.insertable, buildId).toBe(true);
    }
  });
});
