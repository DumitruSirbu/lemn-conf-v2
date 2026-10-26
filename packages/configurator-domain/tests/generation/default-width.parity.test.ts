// Backlog 276, M10 P1-e: every catalogue row declares the width a cabinet is quoted at, and for every row the
// generator plans, that width is the one the generator plans it at. Two sources for one figure: the catalogue's
// `defaultWidthMm` and the generator's own constants and output. The generator's side is read twice, from its
// exported constants and from the widths a swept set of generated kitchens actually stand at, so neither side is
// fed by the field under test.
import { describe, expect, it } from "vitest";

import {
  acceptsWidthMm,
  INSERTABLE_BODY_DEFINITIONS,
  resolveBuildableSizes,
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
import type { DefaultWidthSource } from "../../src/void-engine.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const OCCURRED_AT = "2026-10-26T09:00:00.000Z";
/** The fewest generated bodies a row may rest on: `base-hob-oven` stands in only the kitchens with no oven tower. */
const FLOOR_PER_ROW = 5;

function priorityWidthMm(role: GenerationCoreRole): number {
  const item = GENERATION_PRIORITIES.find(
    (candidate) => candidate.role === role,
  );
  if (!item) throw new Error(`the generator declares no ${role}`);
  return item.widthMm;
}

/** What the generator's own exported constants say each planned row is made at. */
const PLANNED_BY_CONSTANT: ReadonlyMap<string, number> = new Map([
  ["fridge-free", priorityWidthMm("fridge")],
  ["base-sink", priorityWidthMm("sink")],
  ["base-3drawer", priorityWidthMm("preparation")],
  ["base-hob-oven", priorityWidthMm("hob")],
  ["base-hob-2drawer", priorityWidthMm("hob")],
  ["base-cabinet", STORAGE_BODY_WIDTH_MM],
  ["base-dishwasher", DISHWASHER_PLANNED_WIDTH_MM],
  ["tall-pantry", STORAGE_BODY_WIDTH_MM],
]);

/** Generator rows whose width the generator takes from the catalogue or from the row beneath, so it exports no
 *  constant for them: their parity is the generated widths alone. */
const PLANNED_WITHOUT_A_CONSTANT: readonly string[] = [
  "base-bottle-cargo",
  "wall-cabinet",
];

function buildIdsWithSource(source: DefaultWidthSource): readonly string[] {
  return [...INSERTABLE_BODY_DEFINITIONS]
    .filter(([, definition]) => definition.defaultWidthSource === source)
    .map(([buildId]) => buildId);
}

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

describe("every default width says where it comes from", () => {
  it("names one of the three sources on every insertable row, and uses all three", () => {
    const sources = [...INSERTABLE_BODY_DEFINITIONS].map(
      ([, definition]) => definition.defaultWidthSource,
    );

    expect(
      sources.every(
        (source) =>
          source === "generator" ||
          source === "only-width" ||
          source === "proposed",
      ),
    ).toBe(true);
    expect(new Set(sources)).toEqual(
      new Set(["generator", "only-width", "proposed"]),
    );
  });
});

describe("a generator row's default is the width the generator plans it at (P1-e)", () => {
  const GENERATOR_ROWS = buildIdsWithSource("generator");

  it("accounts for every generator row by a constant or by its generated widths, and no other", () => {
    expect([...GENERATOR_ROWS].sort()).toEqual(
      [...PLANNED_BY_CONSTANT.keys(), ...PLANNED_WITHOUT_A_CONSTANT].sort(),
    );
  });

  it.each(GENERATOR_ROWS.filter((buildId) => PLANNED_BY_CONSTANT.has(buildId)))(
    "%s declares the width the generator's constants plan it at",
    (buildId) => {
      expect(CATALOG.get(buildId)?.defaultWidthMm).toBe(
        PLANNED_BY_CONSTANT.get(buildId),
      );
    },
  );

  it.each(GENERATOR_ROWS)(
    "%s is generated at its default width more often than at any other width, on enough bodies to say",
    (buildId) => {
      const widths = GENERATED.get(buildId) ?? [];

      expect(widths.length).toBeGreaterThanOrEqual(FLOOR_PER_ROW);
      expect(modalWidthOf(widths)).toBe(CATALOG.get(buildId)?.defaultWidthMm);
    },
  );
});

describe("a row with one width declares it, and every other generated row agrees with its default", () => {
  it.each(buildIdsWithSource("only-width"))(
    "%s is made in exactly one width and declares that width",
    (buildId) => {
      expect(resolveBuildableSizes(CATALOG, buildId)).toEqual([
        CATALOG.get(buildId)?.defaultWidthMm,
      ]);
    },
  );

  it.each(
    [...GENERATED.keys()].filter(
      (buildId) => CATALOG.get(buildId)?.insertable === true,
    ),
  )(
    "%s, wherever the generator builds it, stands mostly at its default",
    (buildId) => {
      expect(modalWidthOf(GENERATED.get(buildId) ?? [])).toBe(
        CATALOG.get(buildId)?.defaultWidthMm,
      );
    },
  );
});

describe("a row the generator never plans is a proposed default", () => {
  it("is declared proposed for every insertable row no swept kitchen contains", () => {
    const neverGenerated = [...INSERTABLE_BODY_DEFINITIONS]
      .map(([buildId]) => buildId)
      .filter((buildId) => !GENERATED.has(buildId));

    expect([...neverGenerated].sort()).toEqual([
      "open-shelf",
      "tall-fridge-housing",
      "wall-lift",
    ]);
    for (const buildId of neverGenerated) {
      expect(buildIdsWithSource("proposed"), buildId).toContain(buildId);
    }
  });
});
