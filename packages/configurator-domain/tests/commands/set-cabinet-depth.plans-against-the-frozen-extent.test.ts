// Wave 6K-i — **a depth change plans against the frozen extent, and re-derives only the depth**
// ([ADR 0088](../../../../docs/decisions/0088-a-depth-change-plans-against-the-frozen-extent-and-re-derives-only-the-depth.md),
// decision 1 as
// [ADR 0090](../../../../docs/decisions/0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md)
// decision 6 amends it).
//
// `rebuildEveryBodyAt` used to build its planning map with `deriveColumns(records, {}, room)`. The
// `{}` forced §3.2's depth MAX to be re-taken at the new setting, which is right, and discarded
// `top`, `regions` and `w` with it — the facts ADR 0011 Gap D froze *because the placements no longer
// imply them*. Two ordinary deletes then left the shipped kitchen unable to change its own depth.
//
// **No store and no fake frozen map.** The refusal is `evaluateInsertFit`'s and reproduces in this
// package alone, which is what discharges ADR 0079's hedged attribution.
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
import { occupiedDepthOfEntryM } from "../../src/occupied-depth.js";
import { toMetres } from "../../src/millimetres.js";
import {
  deriveColumnKeyAt,
  deriveColumns,
  deriveColumnsOverFrozenExtents,
  deriveRecordedColumns,
  derivePlacementRecords,
  projectFrozenMap,
  withFrozenMap,
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
/** The recorded height of the dishwasher niche — the slot the defect planned into. */
const NICHE_HEIGHT_MM = 820;
/** The column's real top, which `columnExtents` carries and the placements no longer imply. */
const FROZEN_TOP_MM = 2600;

/** The two wall-A columns whose every member is a fronted wall cabinet, and their four members —
 *  the population ADR 0088's anti-invariant is measured on. Wall A is anchored at the corner and
 *  does not slide, which is why they can be read at either setting under one key. */
const WALL_MAP_KEYS: readonly string[] = ["A|0.30", "A|0.75"];
const WALL_MAP_PLACEMENT_IDS: readonly string[] = ["p8", "p10", "p15", "p16"];

/** ADR 0058's two pinned rows: a declared `finishesAtMm`, so no setting moves them. */
const PINNED_BUILD_IDS: readonly string[] = [
  "wall-2door-600-deep-top",
  "wall-2door-700-over-fridge",
];
const PINNED_FINISH_MM = 600;

/** ADR 0088's own reproduction: `A|2.00` still holds the dishwasher niche, and its recorded top is
 *  the fact no surviving placement implies. */
function withTheNicheColumnPartlyCleared(): Design {
  return afterDeleting(DELETED_IDS);
}

/** The shipped kitchen with `B|1.20`'s two members gone, so the document carries a genuine
 *  member-less column. The two deletes above leave `A|2.00` occupied, which is the whole point of
 *  them — `emptyColumns` stays empty and the member-less half needs its own input. */
function withTheOvenTowerColumnCleared(): Design {
  return afterDeleting(["p5", "p22"]);
}

/** The shipped kitchen after a set of ordinary deletes, **with the frozen map the product would
 *  carry**.
 *
 *  Built the way the store builds it rather than hand-written: `publishedColumns` returns the frozen
 *  map unchanged on a delete (ADR 0011 Gap D) and `projectFrozenMap` writes the surviving extents
 *  out, so the document that reaches `setCabinetDepth` records `A|2.00` at `topMm` 2600 with one
 *  820 mm member in it. Hand-writing the entry would be asserting about a document the product does
 *  not produce. */
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

/** The records a wall-A column is planned against at a given setting.
 *
 *  **The fixture carries no recorded seat on any placement**, which is what lets this stand in for
 *  `planningDesign`'s own records without repeating its seat-clearing, and wall A is anchored at the
 *  corner so nothing on it slides either. Both facts are asserted below rather than assumed. */
function recordsAt(
  design: Design,
  cabinetDepthMm: number,
): readonly PlacementRecord[] {
  return derivePlacementRecords(
    { ...design, settings: { ...design.settings, cabinetDepthMm } },
    buildKitchenLBodyCatalog(cabinetDepthMm),
  );
}

/** The frozen map the document records, restored as `deriveColumns` restores it.
 *
 *  **Pre-slide, and paired with pre-slide records**, so the two operands share one key space. ADR
 *  0090 decision 2's move is `frozenExtentsSlidAlongTheWall`'s and is measured in
 *  `set-cabinet-depth.frozen-map.test.ts`; what is under test here is the merge that reads them,
 *  which is a field selection between two extents under one key and is indifferent to which key
 *  space they share. The command-level assertions above run through the real slide. */
function recordedMapOf(
  design: Design,
  cabinetDepthMm: number,
): ReadonlyMap<string, Column> {
  return deriveRecordedColumns(recordsAt(design, cabinetDepthMm), {
    emptyColumns: design.emptyColumns,
    columnExtents: design.columnExtents,
  });
}

function depthMm(column: Column | undefined): number {
  if (!column) throw new Error("no such column");
  return Math.round(column.d * 1000);
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
    // The collapse the defect produced: 2600 → 820, the recorded height of the one member left.
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

  // **What this can catch, named rather than implied.** It iterates the *derived* map's keys, so a
  // full revert of the axis split — both operands becoming the same call — satisfies it trivially.
  // It cannot fail for the reason this wave exists; the reproduction above is what does that. What
  // it does catch is a merge that corrupts a depth on its way through, which is a real and separate
  // failure: ADR 0088 decision 3 requires the value and not merely the rule, and `toBe` on the raw
  // float is that requirement rather than a tolerance.
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

  // **The anti-invariant, measured rather than argued** (ADR 0088 decision 1). Restoring the stored
  // map wholesale — `deriveColumns(records, stored, room)`, which is `addStoredColumnExtents`
  // replacing the derived column outright — plans the *600 mm* kitchen's wall carcass inside a
  // 700 mm kitchen. That is ADR 0077 decision 8's defect verbatim and wave 6K-h's fix undone.
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

  it("plans exactly as it does today on a document that carries no frozen map", () => {
    const records = recordsAt(KITCHEN_L_DESIGN, DEEP_MM);

    // The pre-ADR-0053 document the loader still accepts: no `emptyColumns`, no `columnExtents`.
    expect(KITCHEN_L_DESIGN.emptyColumns).toBeUndefined();
    expect(KITCHEN_L_DESIGN.columnExtents).toBeUndefined();
    expect(
      deriveColumnsOverFrozenExtents(records, new Map(), KITCHEN_L_DESIGN.room),
    ).toStrictEqual(deriveColumns(records, {}, KITCHEN_L_DESIGN.room));
  });

  // **How far a pinned row is reachable through this map, measured per setting rather than summed.**
  // A pinned row appears in the planning map only where it wins its column's §3.2 MAX, and on the
  // shipped fixture that is true at 600 and false at 700 — the 699 mm pantry beside
  // `wall-2door-600-deep-top` overtakes its fixed 600 at the deeper setting. Summing the two settings
  // let the 700 arm contribute nothing with nothing saying so, so both counts are pinned as the
  // measured fact and the deep arm's zero is an assertion rather than a gap.
  //
  // `wall-2door-700-over-fridge` never wins a MAX at either setting, so it is not reachable through
  // this map at all. It is **not** reached for here: the `occupiedDepthOfEntryM` assertion below
  // covers both rows off their own declarations, and that holds independently of this wave.
  it("keeps a pinned row at 600 wherever the new map reaches one", () => {
    const design = withTheNicheColumnPartlyCleared();
    const pinnedSourceCountBySetting = new Map<number, number>();

    for (const cabinetDepthMm of DECLARED_MM) {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      for (const buildId of PINNED_BUILD_IDS) {
        const definition = catalog.get(buildId);
        if (!definition) throw new Error(`${buildId} left the catalogue`);
        expect(
          Math.round(occupiedDepthOfEntryM({ buildId, definition }) * 1000),
          `${buildId} at ${String(cabinetDepthMm)}`,
        ).toBe(PINNED_FINISH_MM);
      }

      const planned = deriveColumnsOverFrozenExtents(
        recordsAt(design, cabinetDepthMm),
        recordedMapOf(design, cabinetDepthMm),
        design.room,
      );
      let reached = 0;
      for (const column of planned.values()) {
        if (!PINNED_BUILD_IDS.includes(column.depthFromBuildId ?? "")) continue;
        reached += 1;
        expect(
          depthMm(column),
          `${column.key} at ${String(cabinetDepthMm)}`,
        ).toBe(PINNED_FINISH_MM);
      }
      pinnedSourceCountBySetting.set(cabinetDepthMm, reached);
    }

    // Non-vacuity at the shallow setting, and the deep setting's zero pinned as what it is.
    expect(pinnedSourceCountBySetting.get(SHALLOW_MM)).toBeGreaterThanOrEqual(
      1,
    );
    expect(pinnedSourceCountBySetting.get(DEEP_MM)).toBe(0);
  });

  // **ADR 0052's ceiling and ADR 0069's wall-end bound are asserted in
  // `qa-6k-i-planning-map.adversarial.test.ts`, not here.** A test on this fixture would run its
  // loop body zero times — every planned column is occupied — and pass by doing nothing, which is
  // the defect class this milestone keeps closing. That file guards `memberLess.length > 0` and
  // asserts the far edge against the wall's own length rather than the width cap alone.
});

describe("restoring the member-less half changes no placement", () => {
  // `rebuildEveryBodyAt` looks a column up only for a placement, so this must be true — and it is
  // asserted rather than assumed, because it is the cheapest way to catch a merge that reaches the
  // rebuild loop by a route nobody intended.
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
