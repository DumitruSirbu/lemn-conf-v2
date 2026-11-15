// M12 wave W3a, adversarial QA (ADR 0183 decision 4 and Amendment A; ADR 0103 decisions 2-3; ADR 0060; DEVELOPMENT-SPEC
// §5.2, §11 rows 1 and 19). The implementer's tests walk the fridge column itself; these go where the fact has to travel:
// into a neighbouring column the fridge only overhangs, through every command that republishes the column map, and
// across swept sequences of swaps and depth changes against an oracle that shares no code with the engine.
//
// The oracle for "what depth must a wall body over this have" is restated below from the declared rows alone:
//   700            where the body overlaps a `fridge-free` along the wall (ADR 0183 decision 4, the owner's number);
//   the setting    where it overlaps any other full-height member (ADR 0060 decision 2, the cabinet-depth line).
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { insertBody } from "../../src/commands/insert-body.js";
import { removePlacement } from "../../src/commands/remove-placement.js";
import { reconcileSuccessfulCommandResult } from "../../src/commands/reconcile-command-result.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import { cabinetDepthMmOf } from "../../src/design.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { toMillimetres } from "../../src/millimetres.js";
import { occupiedDepthM } from "../../src/occupied-depth.js";
import {
  derivePlacementRecords,
  recomputeVoids,
  withCurrentFullHeightMembers,
  type Column,
} from "../../src/void-engine.js";
import { WALL_FRONT_ASSEMBLY_MM } from "../../src/worktop-depth.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../../src/migrate-design.js";
import {
  generate,
  OVER_BODY_STEP_ID,
  OPENING_TOP_MM,
  placementOf,
  stepNamed,
} from "../support/over-the-fridge.js";
import { insertInto, OCCURRED_AT, resizeTo } from "../support/commands.js";
import {
  createFakeProbe,
  createFakeProbeFactory,
} from "../support/fake-probe.js";
import {
  advanceWithColumns,
  voidAt,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import {
  builtDepthMm,
  FRIDGE,
  placement,
  withoutBodies,
  worldAt,
  type Setting,
  type Tall,
} from "../support/depth-over-the-fridge-world.js";

const OVER_THE_FRIDGE_MM = 700;
const PROBE_AT = createFakeProbeFactory();
const CAP_Y0_MM = 2200;
const CAP_HEIGHT_MM = 400;
const FRIDGE_HEIGHT_MM = 1850;
const TALL_HEIGHT_MM = 2200;
const EPSILON_MM = 0.5;

const HOUSING: Tall = {
  buildId: "tall-fridge-housing",
  heightMm: 2200,
  widthMm: 600,
};
const PANTRY: Tall = { buildId: "tall-pantry", heightMm: 2200, widthMm: 600 };
const TOWER: Tall = {
  buildId: "tall-oven-tower",
  heightMm: 2200,
  widthMm: 600,
};
const REPLACEMENTS: readonly Tall[] = [HOUSING, PANTRY, TOWER];

function seatOf(finishedMm: number): number {
  return finishedMm - WALL_FRONT_ASSEMBLY_MM;
}

function at(
  id: string,
  buildId: string,
  startMm: number,
  widthMm: number,
  y0Mm: number,
  heightMm: number,
  finishedDepthMm?: number,
): DesignPlacement {
  return placement(
    id,
    buildId,
    startMm,
    widthMm,
    y0Mm,
    heightMm,
    finishedDepthMm === undefined ? undefined : seatOf(finishedDepthMm),
  );
}

function finishedDepthMm(world: KitchenWorld, placementId: string): number {
  const record = world.records.find(({ id }) => id === placementId);
  if (!record) throw new Error(`no record for ${placementId}`);
  return toMillimetres(occupiedDepthM(record));
}

function finishedDepthOfDesignMm(design: Design, placementId: string): number {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  const record = derivePlacementRecords(design, catalog).find(
    ({ id }) => id === placementId,
  );
  if (!record) throw new Error(`no record for ${placementId}`);
  return toMillimetres(occupiedDepthM(record));
}

function without(world: KitchenWorld, placementId: string): KitchenWorld {
  return withoutBodies(world, [placementId]);
}

function inserted(
  world: KitchenWorld,
  target: Parameters<typeof insertInto>[1],
  buildId: string,
): KitchenWorld {
  const result = insertInto(world, target, buildId);
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return advanceWithColumns(world, result.design, result.effect.columns);
}

/** The void at the floor of the column a removed body stood in, found by geometry: ids are regenerated on every recompute. */
function floorVoidOf(world: KitchenWorld, column: string) {
  return voidAt(world, column, 0);
}

// ---------------------------------------------------------------------------------------------------------------------
// The implementer's own residual: a neighbour the fridge only overhangs.
// ---------------------------------------------------------------------------------------------------------------------

/** A `strad` wall cabinet 350 mm wide that hangs 50 mm over the fridge's end and the rest over a pantry, so its column
 *  is lifted by the pantry whether or not the fridge stands (`hasFullHeightUnder` is `true` on both sides of any swap of
 *  the fridge) and is deep only while the fridge overlaps it. Built at 700 because the fridge overlaps it. */
function overhangingTheFridgeOnTheRight(): KitchenWorld {
  return worldAt(600, [
    at("fridge", FRIDGE.buildId, 0, 700, 0, FRIDGE_HEIGHT_MM),
    at("pantry", PANTRY.buildId, 700, 600, 0, TALL_HEIGHT_MM),
    at("cap", "wall-cabinet", 0, 700, CAP_Y0_MM, CAP_HEIGHT_MM, 700),
    at("strad", "wall-cabinet", 650, 350, CAP_Y0_MM, CAP_HEIGHT_MM, 700),
  ]);
}

/** The mirror image: the pantry on the left, the fridge on the right, `strad` hanging 50 mm over the fridge's start. */
function overhangingTheFridgeOnTheLeft(): KitchenWorld {
  return worldAt(600, [
    at("pantry", PANTRY.buildId, 0, 600, 0, TALL_HEIGHT_MM),
    at("fridge", FRIDGE.buildId, 600, 700, 0, FRIDGE_HEIGHT_MM),
    at("cap", "wall-cabinet", 600, 700, CAP_Y0_MM, CAP_HEIGHT_MM, 700),
    at("strad", "wall-cabinet", 350, 300, CAP_Y0_MM, CAP_HEIGHT_MM, 700),
  ]);
}

/** The fridge deleted and `replacement` inserted in the void it left, with whether the inserted body's span reaches under
 *  `strad` (read from the written placements, never assumed from the build id). */
function deleteThenInsert(start: KitchenWorld, replacement: Tall) {
  const fridgeColumn =
    start.records.find(({ id }) => id === "fridge")?.col ?? "";
  const withoutFridge = without(start, "fridge");
  const result = insertInto(
    withoutFridge,
    { kind: "void", id: floorVoidOf(withoutFridge, fridgeColumn).id },
    replacement.buildId,
  );
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  const placed = result.design.placements.find(
    ({ id }) => id === result.effect.placementId,
  );
  const strad = result.design.placements.find(({ id }) => id === "strad");
  if (!placed || !strad) throw new Error("placements missing");
  const reachesUnderStrad =
    Math.min(
      placed.alongMm + placed.body.widthMm / 2,
      strad.alongMm + strad.body.widthMm / 2,
    ) -
      Math.max(
        placed.alongMm - placed.body.widthMm / 2,
        strad.alongMm - strad.body.widthMm / 2,
      ) >
    EPSILON_MM;
  return {
    replaced: advanceWithColumns(
      withoutFridge,
      result.design,
      result.effect.columns,
    ),
    reachesUnderStrad,
  };
}

const OVERHANGING: readonly (readonly [string, () => KitchenWorld])[] = [
  ["on the fridge's right", overhangingTheFridgeOnTheRight],
  ["on the fridge's left", overhangingTheFridgeOnTheLeft],
];

describe("a wall body that only overhangs the fridge follows the fridge's leaving (ADR 0103 decisions 2 and 3)", () => {
  for (const [side, build] of OVERHANGING) {
    it(`starts at 700 over the fridge and the pantry, ${side}`, () => {
      const world = build();
      const strad = world.records.find(({ id }) => id === "strad");

      expect(finishedDepthMm(world, "strad")).toBe(OVER_THE_FRIDGE_MM);
      expect(world.columns.get(strad?.col ?? "")?.hasDeepWallBodyUnder).toBe(
        true,
      );
      expect(world.columns.get(strad?.col ?? "")?.hasFullHeightUnder).toBe(
        true,
      );
    });

    for (const replacement of REPLACEMENTS) {
      it(`swapping the fridge for a ${replacement.buildId} re-plans the overhanging body to the cabinet-depth line, ${side}`, () => {
        const world = build();

        const swapped = inserted(
          world,
          { kind: "placement", id: "fridge" },
          replacement.buildId,
        );
        const strad = swapped.records.find(({ id }) => id === "strad");

        // What the column now answers, so the assertion cannot be about a stale expectation.
        expect(
          swapped.columns.get(strad?.col ?? "")?.hasDeepWallBodyUnder,
        ).toBe(false);
        expect(finishedDepthMm(swapped, "cap")).toBe(600);
        expect(finishedDepthMm(swapped, "strad")).toBe(600);
      });

      // ADR 0183 dated note 2026-11-15 (W3a ruling, option a): a delete re-plans nothing (ADR 0103 d3), so an insert
      // that does not reach under `strad` leaves its recorded 700 (the documented interim), and one whose span does
      // reach under it re-plans it to the cabinet-depth line. Whether it reaches is read off the written placements.
      it(`deleting the fridge then inserting a ${replacement.buildId} where it stood re-plans the overhanging body only if the insert reaches under it, ${side}`, () => {
        const { replaced, reachesUnderStrad } = deleteThenInsert(
          build(),
          replacement,
        );

        expect(finishedDepthMm(replaced, "strad")).toBe(
          reachesUnderStrad ? 600 : OVER_THE_FRIDGE_MM,
        );
        // The body over the fridge's own column is the insert's column: always re-planned.
        expect(finishedDepthMm(replaced, "cap")).toBe(600);
      });

      it(`clears the interim on the next depth round trip, 600 to 700 to 600, after a ${replacement.buildId} replaced the fridge, ${side}`, () => {
        const { replaced } = deleteThenInsert(build(), replacement);
        let world = replaced;
        const seen: number[] = [];

        for (const cabinetDepthMm of [700, 600]) {
          const changed = setCabinetDepth({
            design: world.design,
            catalogAt: buildKitchenLBodyCatalog,
            cabinetDepthMm,
            probeAt: PROBE_AT,
            occurredAt: OCCURRED_AT,
          });
          if (!changed.ok) throw new Error(`refused: ${changed.reason.code}`);
          world = advanceWithColumns(
            { ...world, catalog: buildKitchenLBodyCatalog(cabinetDepthMm) },
            changed.design,
            changed.effect.columns,
          );
          seen.push(finishedDepthMm(world, "strad"));
        }

        expect(seen).toEqual([700, 600]);
        expect(finishedDepthMm(world, "cap")).toBe(600);
      });
    }

    it(`swap and delete-then-insert agree on the body that stays (ADR 0060 decision 3: two routes, one depth), ${side}`, () => {
      const swapped = inserted(
        build(),
        { kind: "placement", id: "fridge" },
        HOUSING.buildId,
      );
      const strad = swapped.records.find(({ id }) => id === "strad");
      const standing = finishedDepthMm(swapped, "strad");
      const vacated = without(swapped, "strad");
      const column = strad?.col ?? "";

      expect(standing).toBe(builtDepthMm(vacated, column, CAP_Y0_MM / 1000));
    });
  }

  it("reaches both branches of the delete-then-insert oracle: a fixed-width body stops short of `strad`, a flexible one reaches under it", () => {
    const reach = (replacement: Tall) =>
      deleteThenInsert(overhangingTheFridgeOnTheRight(), replacement)
        .reachesUnderStrad;

    expect(reach(HOUSING)).toBe(false);
    expect(reach(TOWER)).toBe(false);
    expect(reach(PANTRY)).toBe(true);
  });

  it("re-plans a lifted overhanging body to 700 when a fridge is inserted that overhangs it (the third clause, the reverse direction)", () => {
    const start = worldAt(600, [
      at("fridge", FRIDGE.buildId, 0, 700, 0, FRIDGE_HEIGHT_MM),
      at("pantry", PANTRY.buildId, 700, 600, 0, TALL_HEIGHT_MM),
      at("cap", "wall-cabinet", 0, 700, CAP_Y0_MM, CAP_HEIGHT_MM, 700),
      at("strad", "wall-cabinet", 650, 350, CAP_Y0_MM, CAP_HEIGHT_MM, 600),
    ]);
    const fridgeColumn =
      start.records.find(({ id }) => id === "fridge")?.col ?? "";
    const open = without(without(start, "fridge"), "cap");

    const fridgeBack = inserted(
      open,
      { kind: "void", id: floorVoidOf(open, fridgeColumn).id },
      FRIDGE.buildId,
    );

    expect(finishedDepthMm(fridgeBack, "strad")).toBe(OVER_THE_FRIDGE_MM);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The second route: every published map is current, and the stored map carries no live fact.
// ---------------------------------------------------------------------------------------------------------------------

function expectFlagsCurrent(
  published: ReadonlyMap<string, Column>,
  world: KitchenWorld,
  label: string,
): void {
  const answered = withCurrentFullHeightMembers(published, world.records);
  for (const [key, column] of published) {
    expect(column.hasDeepWallBodyUnder, `${label}: ${key} deep flag`).toBe(
      answered.get(key)?.hasDeepWallBodyUnder,
    );
    expect(column.hasFullHeightUnder, `${label}: ${key} full-height flag`).toBe(
      answered.get(key)?.hasFullHeightUnder,
    );
  }
}

function fridgeWithATwoPartNeighbourhood(): KitchenWorld {
  return worldAt(600, [
    at("pantry", PANTRY.buildId, 0, 600, 0, TALL_HEIGHT_MM),
    at("fridge", FRIDGE.buildId, 600, 700, 0, FRIDGE_HEIGHT_MM),
    at("cap", "wall-cabinet", 600, 700, CAP_Y0_MM, CAP_HEIGHT_MM, 700),
    at("pantry-two", PANTRY.buildId, 1300, 600, 0, TALL_HEIGHT_MM),
  ]);
}

describe("the deep flag takes the one route the full-height flag takes (plan risk 2)", () => {
  it("publishes a current map from an insert that divides the fridge's column", () => {
    const world = without(fridgeWithATwoPartNeighbourhood(), "cap");
    const opening = voidAt(world, "A|0.95", FRIDGE_HEIGHT_MM / 1000);

    const narrow = insertBody({
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      voids: recomputeVoids(world.records, world.columns),
      target: { kind: "void", id: opening.id },
      buildId: "wall-cabinet",
      probe: createFakeProbe({ catalog: world.catalog }),
      occurredAt: OCCURRED_AT,
    });
    if (!narrow.ok) throw new Error(`refused: ${narrow.reason.code}`);
    const after = advanceWithColumns(
      world,
      narrow.design,
      narrow.effect.columns,
    );

    expectFlagsCurrent(narrow.effect.columns, after, "insert");
    const placed = after.records.find(
      ({ id }) => id === narrow.effect.placementId,
    );
    expect(finishedDepthMm(after, placed?.id ?? "")).toBe(OVER_THE_FRIDGE_MM);
  });

  it("publishes a current map after a resize beside the fridge, and leaves the body over it at 700", () => {
    const start = without(
      worldAt(600, [
        at("fridge", FRIDGE.buildId, 0, 700, 0, FRIDGE_HEIGHT_MM),
        at("cap", "wall-cabinet", 0, 700, CAP_Y0_MM, CAP_HEIGHT_MM, 700),
        at("pantry", PANTRY.buildId, 700, 600, 0, TALL_HEIGHT_MM),
        at("funder", PANTRY.buildId, 1300, 600, 0, TALL_HEIGHT_MM),
      ]),
      "funder",
    );

    const resized = resizeTo(start, "pantry", 800);
    if (!resized.ok) throw new Error(`refused: ${resized.reason.code}`);
    const after = advanceWithColumns(
      start,
      resized.design,
      resized.effect.columns,
    );

    expectFlagsCurrent(resized.effect.columns, after, "resize");
    expect(finishedDepthMm(after, "cap")).toBe(OVER_THE_FRIDGE_MM);
    expect(
      after.columns.get(after.records.find(({ id }) => id === "cap")?.col ?? "")
        ?.hasDeepWallBodyUnder,
    ).toBe(true);
  });

  it("publishes a current map after a depth change, in both directions", () => {
    let world = fridgeWithATwoPartNeighbourhood();
    for (const cabinetDepthMm of [700, 600, 700]) {
      const changed = setCabinetDepth({
        design: world.design,
        catalogAt: buildKitchenLBodyCatalog,
        cabinetDepthMm,
        probeAt: PROBE_AT,
        occurredAt: OCCURRED_AT,
      });
      if (!changed.ok) throw new Error(`refused: ${changed.reason.code}`);
      world = advanceWithColumns(
        { ...world, catalog: buildKitchenLBodyCatalog(cabinetDepthMm) },
        changed.design,
        changed.effect.columns,
      );

      expectFlagsCurrent(
        changed.effect.columns,
        world,
        `to ${String(cabinetDepthMm)}`,
      );
      expect(finishedDepthMm(world, "cap")).toBe(OVER_THE_FRIDGE_MM);
    }
  });

  it("publishes a current map from an insert that divides a wide empty column and arrives as a fridge, flipping the flag", () => {
    const start = worldAt(600, [
      at("pantry", PANTRY.buildId, 0, 600, 0, TALL_HEIGHT_MM),
      at("wide", PANTRY.buildId, 600, 1100, 0, TALL_HEIGHT_MM),
    ]);
    const wideColumn = start.records.find(({ id }) => id === "wide")?.col ?? "";
    const open = without(start, "wide");
    expect(open.columns.get(wideColumn)?.hasDeepWallBodyUnder).toBe(false);

    const arrived = insertBody({
      design: open.design,
      catalog: open.catalog,
      columns: open.columns,
      voids: recomputeVoids(open.records, open.columns),
      target: { kind: "void", id: floorVoidOf(open, wideColumn).id },
      buildId: FRIDGE.buildId,
      probe: createFakeProbe({ catalog: open.catalog }),
      occurredAt: OCCURRED_AT,
    });
    if (!arrived.ok) throw new Error(`refused: ${arrived.reason.code}`);
    const after = advanceWithColumns(
      open,
      arrived.design,
      arrived.effect.columns,
    );

    expect(arrived.effect.columns.size).toBeGreaterThan(open.columns.size);
    expectFlagsCurrent(arrived.effect.columns, after, "fridge arrives");
    const fridgeColumn = after.records.find(
      ({ id }) => id === arrived.effect.placementId,
    )?.col;
    expect(
      arrived.effect.columns.get(fridgeColumn ?? "")?.hasFullHeightUnder,
    ).toBe(true);
  });

  it("re-answers the deep flag after a delete through the store's own reconcile seam, and never writes it to the document", () => {
    const world = fridgeWithATwoPartNeighbourhood();
    const removed = removePlacement({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: "fridge" },
      occurredAt: OCCURRED_AT,
    });
    if (!removed.ok) throw new Error("could not remove the fridge");

    const reconciled = reconcileSuccessfulCommandResult({
      result: removed,
      catalog: world.catalog,
      previousRecordedColumns: world.columns,
    });
    const capColumn = reconciled.records.find(({ id }) => id === "cap")?.col;

    expect(reconciled.columns.get(capColumn ?? "")?.hasDeepWallBodyUnder).toBe(
      false,
    );
    const stored = JSON.stringify(reconciled.design);
    expect(stored).not.toContain("hasDeepWallBodyUnder");
    expect(stored).not.toContain("hasFullHeightUnder");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// A swept model: swaps and depth changes against an oracle restated from the declared rows.
// ---------------------------------------------------------------------------------------------------------------------

type Operation =
  | { readonly kind: "swap"; readonly slot: number; readonly tall: number }
  | { readonly kind: "depth"; readonly cabinetDepthMm: Setting };

const SLOT_STARTS_MM = [0, 800, 1600] as const;
const SLOT_WIDTH_MM = 700;
const TALLS: readonly Tall[] = [FRIDGE, HOUSING, PANTRY, TOWER];

const operations: fc.Arbitrary<readonly Operation[]> = fc.array(
  fc.oneof(
    fc.record({
      kind: fc.constant("swap" as const),
      slot: fc.integer({ min: 0, max: SLOT_STARTS_MM.length - 1 }),
      tall: fc.integer({ min: 0, max: TALLS.length - 1 }),
    }),
    fc.record({
      kind: fc.constant("depth" as const),
      cabinetDepthMm: fc.constantFrom<Setting>(600, 700),
    }),
  ),
  { minLength: 1, maxLength: 14 },
);

const TALL_BUILD_IDS = new Set(TALLS.map(({ buildId }) => buildId));

/** The depth a cabinet over `start..end` must be built to, from the placements alone. `undefined` where nothing full-
 *  height stands under it (the capped arm, which this model does not ask about). */
function oracleDepthMm(
  design: Design,
  cap: DesignPlacement,
  setting: Setting,
): number | undefined {
  const spanOf = (placement: DesignPlacement) => [
    placement.alongMm - placement.body.widthMm / 2,
    placement.alongMm + placement.body.widthMm / 2,
  ];
  const [capStart = 0, capEnd = 0] = spanOf(cap);
  const under = design.placements.filter((placement) => {
    if (!TALL_BUILD_IDS.has(placement.body.buildId)) return false;
    const [start = 0, end = 0] = spanOf(placement);
    return Math.min(end, capEnd) - Math.max(start, capStart) > EPSILON_MM;
  });
  if (under.length === 0) return undefined;
  return under.some(({ body }) => body.buildId === FRIDGE.buildId)
    ? OVER_THE_FRIDGE_MM
    : setting;
}

function threeSlotKitchen(): KitchenWorld {
  const placements: DesignPlacement[] = [];
  SLOT_STARTS_MM.forEach((start, slot) => {
    const tall = slot === 0 ? FRIDGE : slot === 1 ? PANTRY : HOUSING;
    placements.push(
      at(
        `tall${String(slot)}`,
        tall.buildId,
        start,
        SLOT_WIDTH_MM,
        0,
        tall.heightMm,
      ),
      at(
        `cap${String(slot)}`,
        "wall-cabinet",
        start,
        SLOT_WIDTH_MM,
        CAP_Y0_MM,
        CAP_HEIGHT_MM,
        slot === 0 ? OVER_THE_FRIDGE_MM : 600,
      ),
    );
  });
  return worldAt(600, placements);
}

function applyOperation(
  world: KitchenWorld,
  operation: Operation,
): KitchenWorld | undefined {
  if (operation.kind === "depth") {
    const changed = setCabinetDepth({
      design: world.design,
      catalogAt: buildKitchenLBodyCatalog,
      cabinetDepthMm: operation.cabinetDepthMm,
      probeAt: PROBE_AT,
      occurredAt: OCCURRED_AT,
    });
    if (!changed.ok) return undefined;
    return advanceWithColumns(
      { ...world, catalog: buildKitchenLBodyCatalog(operation.cabinetDepthMm) },
      changed.design,
      changed.effect.columns,
    );
  }
  const target = world.design.placements.find(
    ({ alongMm, body }) =>
      TALL_BUILD_IDS.has(body.buildId) &&
      Math.abs(
        alongMm - (SLOT_STARTS_MM[operation.slot] ?? 0) - SLOT_WIDTH_MM / 2,
      ) <
        SLOT_WIDTH_MM / 2,
  );
  const tall = TALLS[operation.tall];
  if (!target || !tall) return undefined;
  const result = insertInto(
    world,
    { kind: "placement", id: target.id },
    tall.buildId,
  );
  if (!result.ok) return undefined;
  return advanceWithColumns(world, result.design, result.effect.columns);
}

describe("a wall body over any tall member is always built to what the member under it declares, across swept swaps and depth changes", () => {
  it("never leaves a cabinet over a swapped slot at a depth its column no longer answers", () => {
    let reachedSwap = 0;
    fc.assert(
      fc.property(operations, (sequence) => {
        let world = threeSlotKitchen();
        for (const operation of sequence) {
          const next = applyOperation(world, operation);
          if (!next) continue;
          world = next;
          if (operation.kind === "swap") reachedSwap += 1;
          const setting = cabinetDepthMmOf(world.design) as Setting;
          for (const cap of world.design.placements.filter(({ id }) =>
            id.startsWith("cap"),
          )) {
            const expected = oracleDepthMm(world.design, cap, setting);
            if (expected === undefined) continue;
            expect(
              finishedDepthMm(world, cap.id),
              `${JSON.stringify(operation)} -> ${cap.id} at setting ${String(setting)}`,
            ).toBe(expected);
          }
          expectFlagsCurrent(world.columns, world, JSON.stringify(operation));
        }
      }),
      { numRuns: 300, seed: 20261115 },
    );
    expect(reachedSwap).toBeGreaterThan(100);
  });
});

describe("a stored design that recorded the earlier depth over the fridge (W3a-6, ADR 0167: never re-generated)", () => {
  function storedAtTheEarlierDepth(): KitchenWorld {
    return worldAt(600, [
      at("fridge", FRIDGE.buildId, 0, 700, 0, FRIDGE_HEIGHT_MM),
      at("cap", "wall-cabinet", 0, 700, CAP_Y0_MM, CAP_HEIGHT_MM, 600),
    ]);
  }

  it("keeps its recorded 600 until something asks, and an insert into a column elsewhere does not re-plan it", () => {
    const stored = without(
      worldAt(600, [
        at("fridge", FRIDGE.buildId, 0, 700, 0, FRIDGE_HEIGHT_MM),
        at("cap", "wall-cabinet", 0, 700, CAP_Y0_MM, CAP_HEIGHT_MM, 600),
        at("elsewhere", PANTRY.buildId, 1500, 600, 0, TALL_HEIGHT_MM),
      ]),
      "elsewhere",
    );
    const elsewhereColumn = [...stored.columns.keys()].find(
      (key) => key !== stored.records.find(({ id }) => id === "fridge")?.col,
    );

    const afterAnInsert = inserted(
      stored,
      { kind: "void", id: voidAt(stored, elsewhereColumn ?? "", 0).id },
      PANTRY.buildId,
    );

    expect(finishedDepthMm(afterAnInsert, "cap")).toBe(600);
  });

  it("survives 600, 700, 600 without a refusal, ends at 700 and never below its recorded depth", () => {
    let world = storedAtTheEarlierDepth();
    const seen: number[] = [finishedDepthMm(world, "cap")];
    for (const cabinetDepthMm of [700, 600, 700, 600]) {
      const changed = setCabinetDepth({
        design: world.design,
        catalogAt: buildKitchenLBodyCatalog,
        cabinetDepthMm,
        probeAt: PROBE_AT,
        occurredAt: OCCURRED_AT,
      });
      expect(changed.ok, `to ${String(cabinetDepthMm)}`).toBe(true);
      if (!changed.ok) return;
      world = advanceWithColumns(
        { ...world, catalog: buildKitchenLBodyCatalog(cabinetDepthMm) },
        changed.design,
        changed.effect.columns,
      );
      seen.push(finishedDepthMm(world, "cap"));
    }

    expect(seen).toEqual([600, 700, 700, 700, 700]);
  });

  it("re-plans the stored 600 to 700 when the fridge itself is swapped for a fridge, so the earlier depth does not outlive the first edit beside it", () => {
    const stored = storedAtTheEarlierDepth();

    const swapped = inserted(
      stored,
      { kind: "placement", id: "fridge" },
      FRIDGE.buildId,
    );

    expect(finishedDepthMm(swapped, "cap")).toBe(OVER_THE_FRIDGE_MM);
  });
});

describe("a body over the fridge never reaches past what the model can hold", () => {
  it("is never built deeper than the machine's own clearance under it, at any setting and over any resize of its neighbours", () => {
    for (const setting of [600, 700] as const) {
      const world = worldAt(setting, [
        at("fridge", FRIDGE.buildId, 0, 700, 0, FRIDGE_HEIGHT_MM),
        at("cap", "wall-cabinet", 0, 700, CAP_Y0_MM, CAP_HEIGHT_MM),
      ]);
      const column = world.records.find(({ id }) => id === "cap")?.col ?? "";

      expect(
        builtDepthMm(without(world, "cap"), column, FRIDGE_HEIGHT_MM / 1000),
      ).toBeLessThanOrEqual(toMillimetres(world.columns.get(column)?.d ?? 0));
    }
  });
});

describe("a stored design whose over-fridge body records the earlier depth loads through the real seam (W3a-6)", () => {
  it("migrates, keeps the recorded seat and re-derives a world whose depth round trip never refuses", () => {
    const generated = generate(
      { shape: "L", widthMm: 4000, depthMm: 3400, heightMm: OPENING_TOP_MM },
      600,
    );
    if (!generated.ok) throw new Error("room not generated");
    const step = stepNamed(generated, OVER_BODY_STEP_ID);
    if (!step) throw new Error("no over-the-fridge step");
    const over = placementOf(generated.design, step);
    const stored: Design = {
      ...generated.design,
      placements: generated.design.placements.map((placement) =>
        placement.id === over.id
          ? {
              ...placement,
              body: { ...placement.body, seatDepthMm: seatOf(600) },
            }
          : placement,
      ),
    };

    const loaded = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      JSON.parse(JSON.stringify(stored)),
    );

    expect(
      loaded.placements.find(({ id }) => id === over.id)?.body.seatDepthMm,
    ).toBe(seatOf(600));
    expect(finishedDepthOfDesignMm(loaded, over.id)).toBe(600);
    for (const cabinetDepthMm of [700, 600]) {
      const changed = setCabinetDepth({
        design: loaded,
        catalogAt: buildKitchenLBodyCatalog,
        cabinetDepthMm,
        probeAt: PROBE_AT,
        occurredAt: OCCURRED_AT,
      });
      expect(changed.ok).toBe(true);
      if (changed.ok) {
        expect(finishedDepthOfDesignMm(changed.design, over.id)).toBe(
          OVER_THE_FRIDGE_MM,
        );
      }
    }
  });
});
