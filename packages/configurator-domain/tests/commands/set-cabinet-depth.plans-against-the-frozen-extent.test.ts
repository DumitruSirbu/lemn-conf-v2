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
/** The recorded height of the dishwasher niche — the slot the defect planned into. */
const NICHE_HEIGHT_MM = 820;
/** The column's real top, which `columnExtents` carries and the placements no longer imply. */
const FROZEN_TOP_MM = 2600;

/** The two wall-A columns whose every member is a fronted wall cabinet, and their four members —
 *  the population ADR 0088's anti-invariant is measured on. Wall A is anchored at the corner and
 *  does not slide, which is why they can be read at either setting under one key. */
const WALL_MAP_KEYS: readonly string[] = ["A|0.30", "A|0.75"];
const WALL_MAP_PLACEMENT_IDS: readonly string[] = ["p8", "p10", "p15", "p16"];

/** **This suite's own pinned body, because the shipped kitchen no longer holds one** (ADR 0101
 *  decision 3, applying ADR 0093 decision 2: *"the fixture that makes a rule falsifiable is declared
 *  by the test that asserts it"*).
 *
 *  Until 2026-09-07 the witness was ADR 0058's two pinned deep tops. ADR 0101 unpinned them so the
 *  owner's three top cabinets follow the setting, and holding one of them back to feed this file
 *  would be exactly the "moved fixture" ADR 0093 refuses — the product's geometry as a function of
 *  its test coverage, with one of the owner's cabinets left wrong.
 *
 *  **Pinned deeper than anything the shipped kitchen builds at either setting** — 800 against the
 *  fridge's 742 and a 700 mm kitchen's 738 mm oven tower — so it wins its column's §3.2 MAX at
 *  *both* settings and the deep arm is a measurement rather than the zero the old assertion had to
 *  record. */
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

/** The shipped catalogue plus this suite's declared pinned row (ADR 0093 decision 2).
 *
 *  A copy of the deep top it stands in for, so it differs in exactly the two facts under test: it
 *  declares a **pin** instead of following the setting, and its seat is a literal rather than a
 *  function of `cabinetDepthMm`. It carries no `builtDepthFollowsALiftedColumn` — a pin and a lifted
 *  column are two different answers to "what decides this row's depth", and a row claiming both
 *  would be asserting nothing coherent. */
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

/** The shipped kitchen with the witness standing where `p22` does — over `tall-oven-tower-600` at
 *  `B|1.20`, the column ADR 0058's own measurement used. */
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

/** `recordsAt` and `recordedMapOf` over the witness catalogue. Two lines rather than a catalogue
 *  argument threaded through every caller above: the witness is this block's fixture and nothing
 *  else in the file plans against it. */
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
  return deriveRecordedColumns(witnessRecordsAt(design, cabinetDepthMm), {
    emptyColumns: design.emptyColumns,
    columnExtents: design.columnExtents,
  });
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

  // **The frozen operand is the map production builds, not an empty one.** `rebuildEveryBodyAt`
  // always passes `deriveRecordedColumns(heldRecords, storedFrozenMapOf(design))`, and on a
  // pre-ADR-0053 document that stored half is `{}` while the map itself is the **full derived map** —
  // one entry per column of the shipped kitchen. Handing `new Map()` in instead asserted that a merge
  // with nothing changes nothing, which no implementation of the axis split can fail; the real
  // operand makes every column take the merge's three arms and still land on the derived value.
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

  // **A pinned row's depth survives the planning map at every setting** — the axis split asserted on
  // the one kind of row that must not move at all.
  //
  // The witness is **declared here** rather than borrowed from the seeded kitchen (ADR 0101
  // decision 3), and it is pinned deep enough to win its column's §3.2 MAX at both settings, so the
  // count below is a measurement at 600 *and* at 700. The version this replaces could only record a
  // zero at 700: the shipped pins finished at 600, and the 699 mm pantry beside one of them overtook
  // it at the deeper setting.
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

  // **The other side of the same map, and the reason the witness above had to be declared**
  // (ADR 0101): the three deep tops are ordinary cabinetry now, so the planning map moves them with
  // the setting. `B|1.20`'s published depth is its oven tower's at both settings — 638 and 738 — and
  // its top cabinet is 38 mm inside that at both, which is the relationship the owner reported lost.
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
