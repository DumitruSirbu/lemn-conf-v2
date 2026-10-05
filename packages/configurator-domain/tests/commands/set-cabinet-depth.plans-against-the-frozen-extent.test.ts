// A depth change plans against the frozen extent and re-derives only the depth (ADR 0088 decision 1, as ADR 0090
// decision 6 amends it): the planning map re-takes §3.2's depth MAX at the new setting but keeps the `top`, `regions`
// and `w` that ADR 0011 Gap D froze because the placements no longer imply them. No store and no fake frozen map: the
// refusal is `evaluateInsertFit`'s and reproduces in this package alone.
import { describe, expect, it } from "vitest";

import {
  wallCarcassDepthMm,
  wallCarcassSeatDepthMm,
} from "../../src/catalog.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import type { Design } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { pinnedAtFinishedDepthMm } from "../../src/cabinet-depth-rule.js";
import { occupiedDepthOfEntryM } from "../../src/occupied-depth.js";
import { WALL_FRONT_ASSEMBLY_MM } from "../../src/worktop-depth.js";
import { toMetres } from "../../src/millimetres.js";
import {
  deriveColumnKeyAt,
  deriveColumns,
  deriveColumnsOverFrozenExtents,
  deriveRecordedColumns,
  derivePlacementRecords,
  projectFrozenMap,
  withFrozenMap,
  type BodyCatalog,
  type BodyDefinition,
  type Column,
  type PlacementRecord,
} from "../../src/void-engine.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-06T10:00:00.000Z";
const SHALLOW_MM = 600;
const DEEP_MM = 700;
const DECLARED_MM = [SHALLOW_MM, DEEP_MM] as const;

/** The column ADR 0088 measures, and the member the two deletes leave standing. */
const NICHE_COLUMN_KEY = "A|2.00";
const NICHE_ID = "p1";
/** `open-shelf-600` at `y0` 1500 and `wall-2door-600-top` at `y0` 2200 — the two ordinary deletes. */
const DELETED_IDS: readonly string[] = ["p12", "p18"];

/** §7's base body reaches the worktop line; the seeded niche records the carcass without it. */
const BASE_BODY_HEIGHT_MM = 860;
/** The recorded height of the dishwasher niche. */
const NICHE_HEIGHT_MM = 820;
/** The column's real top, which `columnExtents` carries and the placements no longer imply. */
const FROZEN_TOP_MM = 2600;

/** The two wall-A columns whose every member is a fronted wall cabinet, and their four members. Wall A is anchored
 *  at the corner and does not slide, so they read under one key at either setting. */
const WALL_MAP_KEYS: readonly string[] = ["A|0.30", "A|0.75"];
const WALL_MAP_PLACEMENT_IDS: readonly string[] = ["p8", "p10", "p15", "p16"];

/** This suite's own pinned body, because the shipped kitchen no longer holds one (ADR 0101 decision 3, ADR 0093
 *  decision 2). Pinned deeper than anything the shipped kitchen builds at either setting (800 against the fridge's
 *  742 and a 700 mm kitchen's 738 mm oven tower), so it wins its column's §3.2 MAX at both settings. */
const WITNESS_PINNED_BUILD_ID = "pinned-deep-top-witness";
const WITNESS_PINNED_FINISH_MM = 800;
/** The placement the witness stands in for: `p22`, over `tall-oven-tower-600` at `B|1.20`. */
const WITNESS_PLACEMENT_ID = "p22";
/** The shipped row the witness is a copy of, so it differs from a real deep top in its declaration
 *  and its depth alone. */
const DEEP_TOP_BUILD_ID = "wall-2door-600-deep-top";

/** ADR 0088's own reproduction: `A|2.00` still holds the dishwasher niche, and its recorded top is
 *  the fact no surviving placement implies. */
function withTheNicheColumnPartlyCleared(): Design {
  return afterDeleting(DELETED_IDS);
}

/** The shipped kitchen with `B|1.20`'s two members gone, so the document carries a genuine member-less column; the
 *  two deletes above leave `A|2.00` occupied, so `emptyColumns` stays empty there. */
function withTheOvenTowerColumnCleared(): Design {
  return afterDeleting(["p5", "p22"]);
}

/** The shipped kitchen after ordinary deletes, with the frozen map the product would carry: `publishedColumns` returns
 *  it unchanged on a delete (ADR 0011 Gap D) and `projectFrozenMap` writes the surviving extents out. A hand-written
 *  entry would assert about a document the product does not produce. */
function afterDeleting(placementIds: readonly string[]): Design {
  const catalog = buildKitchenLBodyCatalog(SHALLOW_MM);
  const beforeTheDeletes = deriveColumns(
    derivePlacementRecords(KITCHEN_L_DESIGN, catalog),
    {},
    KITCHEN_L_DESIGN.room,
  );
  const cleared: Design = {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.filter(
      (placement) => !placementIds.includes(placement.id),
    ),
  };
  return withFrozenMap(
    cleared,
    projectFrozenMap(
      beforeTheDeletes,
      derivePlacementRecords(cleared, catalog),
    ),
  );
}

function changeTo(design: Design, cabinetDepthMm: number) {
  return setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: createFakeProbeFactory(),
    occurredAt: OCCURRED_AT,
  });
}

function deepenedDesign(design: Design, cabinetDepthMm: number): Design {
  const result = changeTo(design, cabinetDepthMm);
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result.design;
}

function seatMm(design: Design, placementId: string): number | undefined {
  const placement = design.placements.find(
    (candidate) => candidate.id === placementId,
  );
  if (!placement) throw new Error(`no placement ${placementId}`);
  return placement.body.seatDepthMm;
}

/** The records a wall-A column is planned against at a given setting. The fixture carries no recorded seat, which
 *  lets this stand in for `planningDesign`'s records without repeating its seat-clearing, and wall A does not slide;
 *  both facts are asserted below. */
function recordsAt(
  design: Design,
  cabinetDepthMm: number,
): readonly PlacementRecord[] {
  return derivePlacementRecords(
    { ...design, settings: { ...design.settings, cabinetDepthMm } },
    buildKitchenLBodyCatalog(cabinetDepthMm),
  );
}

/** The frozen map the document records, restored as `deriveColumns` restores it. Pre-slide and paired with pre-slide
 *  records so the operands share one key space: the slide is measured in `set-cabinet-depth.frozen-map.test.ts` (ADR
 *  0090 decision 2); only the merge that reads them is under test here. */
function recordedMapOf(
  design: Design,
  cabinetDepthMm: number,
): ReadonlyMap<string, Column> {
  return deriveRecordedColumns(
    recordsAt(design, cabinetDepthMm),
    {
      emptyColumns: design.emptyColumns,
      columnExtents: design.columnExtents,
    },
    toMetres(design.room.widthMm),
  );
}

function depthMm(column: Column | undefined): number {
  if (!column) throw new Error("no such column");
  return Math.round(column.d * 1000);
}

/** The shipped catalogue plus this suite's declared pinned row (ADR 0093 decision 2): a copy of the deep top that
 *  declares a pin instead of following the setting, with a literal seat. It carries no
 *  `builtDepthFollowsALiftedColumn`, since a pin and a lifted column are different answers to what decides a depth. */
function catalogWithThePinnedWitness(cabinetDepthMm: number): BodyCatalog {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
  const deepTop = catalog.get(DEEP_TOP_BUILD_ID);
  if (!deepTop) throw new Error("the catalogue lost its deep top row");
  const witness: BodyDefinition = {
    ...deepTop,
    frameDepthMm: WITNESS_PINNED_FINISH_MM - WALL_FRONT_ASSEMBLY_MM,
    depthRule: pinnedAtFinishedDepthMm(
      WITNESS_PINNED_FINISH_MM,
      "base-formula",
    ),
    builtDepthFollowsALiftedColumn: false,
  };
  return new Map([...catalog, [WITNESS_PINNED_BUILD_ID, witness]]);
}

/** The shipped kitchen with the witness standing where `p22` does, over `tall-oven-tower-600` at `B|1.20`. */
function withThePinnedWitness(): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.map((placement) =>
      placement.id === WITNESS_PLACEMENT_ID
        ? {
            ...placement,
            body: { ...placement.body, buildId: WITNESS_PINNED_BUILD_ID },
          }
        : placement,
    ),
  };
}

/** `recordsAt` over the witness catalogue; the witness is this block's fixture and nothing else plans against it. */
function witnessRecordsAt(
  design: Design,
  cabinetDepthMm: number,
): readonly PlacementRecord[] {
  return derivePlacementRecords(
    { ...design, settings: { ...design.settings, cabinetDepthMm } },
    catalogWithThePinnedWitness(cabinetDepthMm),
  );
}

function witnessRecordedMapOf(
  design: Design,
  cabinetDepthMm: number,
): ReadonlyMap<string, Column> {
  return deriveRecordedColumns(
    witnessRecordsAt(design, cabinetDepthMm),
    {
      emptyColumns: design.emptyColumns,
      columnExtents: design.columnExtents,
    },
    toMetres(design.room.widthMm),
  );
}

describe("the reproduction ADR 0088 measured", () => {
  it("records the column's real top after the two deletes, which is the fact the plan needs", () => {
    const cleared = withTheNicheColumnPartlyCleared();

    const niche = (cleared.columnExtents ?? []).find(
      (extent) => extent.wall === "A" && extent.alongMm === 2000,
    );

    expect(niche).toMatchObject({
      wall: "A",
      alongMm: 2000,
      widthMm: 600,
      y0Mm: 0,
      topMm: FROZEN_TOP_MM,
      depthFromBuildId: "base-dishwasher-600",
    });
  });

  it.each(DECLARED_MM)(
    "succeeds at %i mm and rebuilds the niche to the worktop line",
    (cabinetDepthMm) => {
      const result = changeTo(
        withTheNicheColumnPartlyCleared(),
        cabinetDepthMm,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const niche = result.design.placements.find(
        (placement) => placement.id === NICHE_ID,
      );
      expect(niche?.body.heightMm).toBe(BASE_BODY_HEIGHT_MM);
    },
  );

  it("carries the recorded top rather than the surviving member's, on the column that refused", () => {
    const result = changeTo(withTheNicheColumnPartlyCleared(), DEEP_MM);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const niche = result.effect.columns.get(NICHE_COLUMN_KEY);
    // The failure mode: the top collapsing to the one surviving member's recorded height.
    expect(niche?.top).not.toBeCloseTo(toMetres(NICHE_HEIGHT_MM), 6);
    expect(niche?.top).toBeCloseTo(toMetres(FROZEN_TOP_MM), 6);
  });
});

describe("the axis split, asserted directly rather than through its symptom", () => {
  it.each(DECLARED_MM)(
    "carries every stored top, floor and width into the planning map at %i mm",
    (cabinetDepthMm) => {
      const design = withTheNicheColumnPartlyCleared();
      const frozen = recordedMapOf(design, cabinetDepthMm);
      const stored = [
        ...(design.emptyColumns ?? []),
        ...(design.columnExtents ?? []),
      ];

      const planned = deriveColumnsOverFrozenExtents(
        recordsAt(design, cabinetDepthMm),
        frozen,
        design.room,
      );

      // Non-vacuity: the document really does record extents the placements no longer imply.
      expect(stored.length).toBeGreaterThan(0);
      expect(frozen.size).toBeGreaterThanOrEqual(stored.length);
      for (const entry of stored) {
        const key = deriveColumnKeyAt(entry.wall, toMetres(entry.alongMm));
        const column = planned.get(key);
        expect(column, key).toBeDefined();
        expect(column?.top, key).toBeCloseTo(toMetres(entry.topMm), 6);
        expect(
          Math.min(...(column?.regions ?? []).map(([floorM]) => floorM)),
          key,
        ).toBeCloseTo(toMetres(entry.y0Mm), 6);
        expect(column?.w, key).toBeCloseTo(toMetres(entry.widthMm), 6);
      }
    },
  );

  // This iterates the derived map's keys, so a full revert of the axis split satisfies it trivially; it catches a merge
  // corrupting a depth on the way through. ADR 0088 decision 3 requires the value, and `toBe` on the raw float is that
  // requirement rather than a tolerance.
  it.each(DECLARED_MM)(
    "leaves no merged column's depth diverging from the derived one at %i mm",
    (cabinetDepthMm) => {
      const design = withTheNicheColumnPartlyCleared();
      const records = recordsAt(design, cabinetDepthMm);
      const derived = deriveColumns(records, {}, design.room);

      const planned = deriveColumnsOverFrozenExtents(
        records,
        recordedMapOf(design, cabinetDepthMm),
        design.room,
      );

      expect([...derived.keys()].length).toBeGreaterThan(0);
      for (const [key, column] of derived) {
        expect(planned.get(key)?.d, key).toBe(column.d);
        expect(planned.get(key)?.depthFromBuildId, key).toBe(
          column.depthFromBuildId,
        );
      }
    },
  );

  // The anti-invariant (ADR 0088 decision 1): restoring the stored map wholesale, `deriveColumns(records, stored,
  // room)`, plans the 600 mm kitchen's wall carcass inside a 700 mm kitchen (ADR 0077 decision 8).
  it("refuses the wholesale restore, per column, at the deeper setting", () => {
    const design = withTheNicheColumnPartlyCleared();
    const records = recordsAt(design, DEEP_MM);
    const wholesale = deriveColumns(
      records,
      {
        emptyColumns: design.emptyColumns,
        columnExtents: design.columnExtents,
      },
      design.room,
    );

    const planned = deriveColumnsOverFrozenExtents(
      records,
      recordedMapOf(design, DEEP_MM),
      design.room,
    );

    for (const key of WALL_MAP_KEYS) {
      expect(depthMm(wholesale.get(key)), key).toBe(
        wallCarcassDepthMm(SHALLOW_MM),
      );
      expect(depthMm(planned.get(key)), key).toBe(wallCarcassDepthMm(DEEP_MM));
    }
  });

  it("plans each of the four wall bodies at the deeper kitchen's carcass, per arm", () => {
    const deepened = deepenedDesign(withTheNicheColumnPartlyCleared(), DEEP_MM);

    for (const id of WALL_MAP_PLACEMENT_IDS) {
      expect(seatMm(deepened, id), id).toBe(wallCarcassSeatDepthMm(DEEP_MM));
    }
  });

  // The frozen operand is the map production builds, not an empty one: `rebuildEveryBodyAt` passes
  // `deriveRecordedColumns(heldRecords, storedFrozenMapOf(design))`, a full derived map even when the stored half is
  // `{}`. An empty `new Map()` asserts that a merge with nothing changes nothing, which no implementation can fail.
  it("plans exactly as it does today on a document that carries no frozen map", () => {
    const records = recordsAt(KITCHEN_L_DESIGN, DEEP_MM);
    const frozen = recordedMapOf(KITCHEN_L_DESIGN, DEEP_MM);

    // The pre-ADR-0053 document the loader still accepts: no `emptyColumns`, no `columnExtents`.
    expect(KITCHEN_L_DESIGN.emptyColumns).toBeUndefined();
    expect(KITCHEN_L_DESIGN.columnExtents).toBeUndefined();
    // Non-vacuity, and the whole point of the operand: the map production hands in is populated.
    expect(frozen.size).toBeGreaterThan(0);
    expect(
      deriveColumnsOverFrozenExtents(records, frozen, KITCHEN_L_DESIGN.room),
    ).toStrictEqual(deriveColumns(records, {}, KITCHEN_L_DESIGN.room));
  });

  // The axis split on the one kind of row that must not move at all, declared here rather than borrowed from the seeded
  // kitchen (ADR 0101 decision 3) and pinned deep enough to win its column's §3.2 MAX at both settings, so the count
  // below is a measurement at 600 and at 700.
  it("publishes a pinned row at its declared depth at every setting", () => {
    const design = withThePinnedWitness();
    const reachedBySetting = new Map<number, number>();

    for (const cabinetDepthMm of DECLARED_MM) {
      const definition = catalogWithThePinnedWitness(cabinetDepthMm).get(
        WITNESS_PINNED_BUILD_ID,
      );
      if (!definition) throw new Error("the witness left its catalogue");
      expect(
        Math.round(
          occupiedDepthOfEntryM({
            buildId: WITNESS_PINNED_BUILD_ID,
            definition,
          }) * 1000,
        ),
        `the entry at ${String(cabinetDepthMm)}`,
      ).toBe(WITNESS_PINNED_FINISH_MM);

      const planned = deriveColumnsOverFrozenExtents(
        witnessRecordsAt(design, cabinetDepthMm),
        witnessRecordedMapOf(design, cabinetDepthMm),
        design.room,
      );
      let reached = 0;
      for (const column of planned.values()) {
        if (column.depthFromBuildId !== WITNESS_PINNED_BUILD_ID) continue;
        reached += 1;
        expect(
          depthMm(column),
          `${column.key} at ${String(cabinetDepthMm)}`,
        ).toBe(WITNESS_PINNED_FINISH_MM);
      }
      reachedBySetting.set(cabinetDepthMm, reached);
    }

    // Non-vacuity at both settings: a map that stopped reaching the pinned row would otherwise pass
    // this test by finding nothing to check.
    for (const cabinetDepthMm of DECLARED_MM) {
      expect(
        reachedBySetting.get(cabinetDepthMm),
        `columns sourced from the witness at ${String(cabinetDepthMm)}`,
      ).toBe(1);
    }
  });

  // The deep tops are ordinary cabinetry (ADR 0101), so the planning map moves them with the setting.
  it.each(DECLARED_MM)(
    "moves a deep top with the setting through the same map, at %i mm",
    (cabinetDepthMm) => {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      const deepTop = catalog.get(DEEP_TOP_BUILD_ID);
      if (!deepTop) throw new Error("the catalogue lost its deep top row");

      expect(
        Math.round(
          occupiedDepthOfEntryM({
            buildId: DEEP_TOP_BUILD_ID,
            definition: deepTop,
          }) * 1000,
        ),
      ).toBe(cabinetDepthMm);
    },
  );

  // The member-less ceiling and wall-end bound are asserted in `qa-6k-i-planning-map.adversarial.test.ts`, not here:
  // every planned column on this fixture is occupied, so a loop body would run zero times.
});

describe("restoring the member-less half changes no placement", () => {
  // `rebuildEveryBodyAt` looks a column up only for a placement, so this must hold; it is the cheapest way to catch a
  // merge that reaches the rebuild loop by an unintended route.
  it.each(DECLARED_MM)(
    "writes byte-identical placements with and without the empty half at %i mm",
    (cabinetDepthMm) => {
      const withSpaces = withTheOvenTowerColumnCleared();
      const withoutSpaces: Design = { ...withSpaces };
      delete withoutSpaces.emptyColumns;

      // Non-vacuity: the document really does carry member-less columns to leave out.
      expect((withSpaces.emptyColumns ?? []).length).toBeGreaterThan(0);
      expect(
        deepenedDesign(withSpaces, cabinetDepthMm).placements,
      ).toStrictEqual(deepenedDesign(withoutSpaces, cabinetDepthMm).placements);
    },
  );
});
