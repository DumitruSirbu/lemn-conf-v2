// M7B wave U1, AC6 — mirror equivariance under α (ADR 0132 decision 1).
//
// For a U document D, reflecting the room in `x = W/2` (`mirrorUDesign`) must reflect what the
// domain says about it: `validateDesignForCatalog(mirror(D))` is the mirror of D's findings and
// `recomputeVoids` over mirror(D) is the mirror of D's voids. Validation and voids only, never
// composition (the owner's Q-U5).
//
// **No U generator exists before U2/U3**, so "generated U designs" are fast-check's arbitrary U
// documents plus the shipped L kitchen re-stated as a U — its wall B on wall C and a copy of its
// wall-A run standing on wall B — which is the one realistic, dense U this wave can build.
//
// **Two wall-A rules are reflection-asymmetric by specification and are kept out of the arbitrary
// half, never out of the mirror:**
// - `clipEmptyColumnsAtWallEnd` clips a recorded entry past a wall's **end** and leaves one before
//   its start to the validator (ADR 0069), so on wall A a clipped end would mirror onto an
//   unclipped start. Wall-A recorded entries are generated inside `[0, W]`.
// - ADR 0046's merge is greedy from a wall's start (*"three 300s become a 600 and a 300"*), so on
//   wall A three abutting spaces merge differently from the other end. Wall-A recorded entries are
//   generated so that no two of them abut.
// Walls B and C keep both rules in full: they start at the same place, so the reflection maps one
// onto the other exactly.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import type { Design, DesignPlacement, EmptyColumn } from "../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { validateDesignForCatalog } from "../src/validate-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  projectFrozenMap,
  recomputeVoids,
  withFrozenMap,
  type VoidRecord,
} from "../src/void-engine.js";
import {
  comparableVoids,
  mirroredFindings,
  mirroredVoids,
  mirrorUDesign,
  sortedFindings,
} from "./support/mirror-u-design.js";

const catalog = buildKitchenLBodyCatalog(600);
const OCCURRED_AT = "2026-09-29T00:00:00.000Z";
const PROPERTY_RUNS = 1000;
const PROPERTY_SEED = 20260929;

function voidsOf(design: Design): readonly VoidRecord[] {
  const records = derivePlacementRecords(design, catalog);
  return recomputeVoids(records, deriveColumns(records, design, design.room));
}

function expectMirrorEquivariant(design: Design): void {
  const mirrored = mirrorUDesign(design);

  expect(sortedFindings(validateDesignForCatalog(mirrored, catalog))).toEqual(
    mirroredFindings(design, validateDesignForCatalog(design, catalog)),
  );
  expect(comparableVoids(voidsOf(mirrored))).toEqual(
    mirroredVoids(voidsOf(design), design.room.widthMm),
  );
}

/** The shipped L kitchen as a U: wall B's run moves to wall C, and wall A's run (less its corner X)
 *  is copied onto wall B, so both side walls carry bodies at the corners and in the free run. */
function shippedKitchenAsAU(): Design {
  const { room } = KITCHEN_L_DESIGN;
  const wallBRun = KITCHEN_L_DESIGN.placements.filter(
    (placement) => placement.wall === "B",
  );
  const wallARun = KITCHEN_L_DESIGN.placements.filter(
    (placement) => placement.wall === "A",
  );
  return {
    ...KITCHEN_L_DESIGN,
    room: {
      shape: "U",
      widthMm: room.widthMm,
      depthMm: room.widthMm,
      wallCMm: room.depthMm,
      heightMm: room.heightMm,
    },
    placements: [
      ...wallARun,
      ...wallBRun.map((placement) => ({ ...placement, wall: "C" as const })),
      ...wallARun
        .filter((placement) => placement.body.buildId !== "base-corner-x-900")
        .map((placement) => ({
          ...placement,
          id: `b-${placement.id}`,
          wall: "B" as const,
        })),
    ],
  };
}

/** The shipped U with some bodies cleared the way the store clears them: the columns frozen from
 *  the whole kitchen (ADR 0011 Gap D) and recorded through the production projection, so the
 *  cleared spaces survive as `emptyColumns` and `columnExtents` rather than vanishing. */
function shippedUWithCleared(clearedIds: readonly string[]): Design {
  const full = shippedKitchenAsAU();
  const frozen = deriveColumns(
    derivePlacementRecords(full, catalog),
    {},
    full.room,
  );
  const kept = {
    ...full,
    placements: full.placements.filter(
      (placement) => !clearedIds.includes(placement.id),
    ),
  };
  return withFrozenMap(
    kept,
    projectFrozenMap(frozen, derivePlacementRecords(kept, catalog)),
  );
}

/** Wall C's fridge and the unit over it, wall B's copied hood, and wall A's far-end wall unit. */
const CLEARED_ACROSS_ALL_THREE_WALLS = ["p7", "p24", "b-p13", "p14"] as const;

describe("AC6 — the shipped kitchen re-stated as a U is mirror-equivariant", () => {
  it("has voids on every wall to compare, so the property is not vacuous here", () => {
    const walls = new Set(
      voidsOf(shippedUWithCleared(CLEARED_ACROSS_ALL_THREE_WALLS)).map(
        (record) => record.wall,
      ),
    );

    expect([...walls].sort()).toEqual(["A", "B", "C"]);
  });

  it("maps validation findings and voids through the mirror, fully built", () => {
    expectMirrorEquivariant(shippedKitchenAsAU());
  });

  it("maps validation findings and voids through the mirror, with bodies cleared on all three walls", () => {
    expectMirrorEquivariant(
      shippedUWithCleared(CLEARED_ACROSS_ALL_THREE_WALLS),
    );
  });
});

// --------------------------------------------------------------------------------------------
// The arbitrary half.

const FIXTURE_BODIES = KITCHEN_L_DESIGN.placements.map((placement) => ({
  y0Mm: placement.y0Mm,
  body: placement.body,
}));

const KEY_GRID_MM = 10;
const onKeyGrid = (min: number, max: number) =>
  fc
    .integer({
      min: Math.ceil(min / KEY_GRID_MM),
      max: Math.floor(max / KEY_GRID_MM),
    })
    .map((step) => step * KEY_GRID_MM);

const uRoom = fc.record({
  widthMm: onKeyGrid(1800, 6300),
  depthMm: fc.integer({ min: 900, max: 6300 }),
  wallCMm: fc.integer({ min: 900, max: 6300 }),
  heightMm: fc.integer({ min: 2200, max: 3900 }),
});

interface Room {
  readonly widthMm: number;
  readonly depthMm: number;
  readonly wallCMm: number;
  readonly heightMm: number;
}

function placementArbitrary(room: Room) {
  return fc
    .record({
      wall: fc.constantFrom("A" as const, "B" as const, "C" as const),
      fixtureBody: fc.constantFrom(...FIXTURE_BODIES),
      alongOnA: onKeyGrid(-300, room.widthMm + 300),
      alongOnSide: fc.integer({ min: -300, max: 6600 }),
    })
    .map(({ wall, fixtureBody, alongOnA, alongOnSide }) => ({
      wall,
      alongMm: wall === "A" ? alongOnA : alongOnSide,
      y0Mm: fixtureBody.y0Mm,
      body: fixtureBody.body,
    }));
}

function recordedEntryArbitrary(room: Room) {
  return fc
    .record({
      wall: fc.constantFrom("A" as const, "B" as const, "C" as const),
      halfWidthMm: fc.integer({ min: 25, max: 450 }),
      alongOnSide: fc.integer({ min: -200, max: 6500 }),
      alongOnAFraction: fc.double({ min: 0, max: 1, noNaN: true }),
      band: fc.constantFrom(
        { y0Mm: 0, topMm: 820 },
        { y0Mm: 0, topMm: 2600 },
        { y0Mm: 1500, topMm: 2200 },
        { y0Mm: 1500, topMm: 2600 },
        { y0Mm: 2200, topMm: 2600 },
      ),
      depthMm: fc.integer({ min: 1, max: 7000 }),
      depthFromBuildId: fc.option(
        fc.constantFrom(...FIXTURE_BODIES.map(({ body }) => body.buildId)),
        { nil: undefined },
      ),
    })
    .map((entry): EmptyColumn => {
      const widthMm = entry.halfWidthMm * 2;
      const firstOnGridMm = Math.ceil(widthMm / 2 / KEY_GRID_MM) * KEY_GRID_MM;
      const lastOnGridMm =
        Math.floor((room.widthMm - widthMm / 2) / KEY_GRID_MM) * KEY_GRID_MM;
      const alongOnA =
        firstOnGridMm +
        Math.round(
          (entry.alongOnAFraction * (lastOnGridMm - firstOnGridMm)) /
            KEY_GRID_MM,
        ) *
          KEY_GRID_MM;
      return {
        wall: entry.wall,
        alongMm: entry.wall === "A" ? alongOnA : entry.alongOnSide,
        widthMm,
        y0Mm: entry.band.y0Mm,
        topMm: entry.band.topMm,
        depthMm: entry.depthMm,
        ...(entry.depthFromBuildId === undefined
          ? {}
          : { depthFromBuildId: entry.depthFromBuildId }),
      };
    });
}

const arbitraryUDesign = uRoom.chain((room) =>
  fc
    .record({
      placements: fc.array(placementArbitrary(room), { maxLength: 14 }),
      emptyColumns: fc.array(recordedEntryArbitrary(room), { maxLength: 6 }),
      columnExtents: fc.array(recordedEntryArbitrary(room), { maxLength: 4 }),
    })
    .map(
      ({ placements, emptyColumns, columnExtents }): Design => ({
        room: { shape: "U", ...room },
        presetId: null,
        placements: placements.map(
          (placement, index): DesignPlacement => ({
            id: `p${String(index)}`,
            ...placement,
          }),
        ),
        emptyColumns,
        columnExtents,
        createdAt: OCCURRED_AT,
        updatedAt: OCCURRED_AT,
      }),
    ),
);

/** Wall-A recorded entries inside `[0, W]` by construction; this rejects the ones that abut. */
function hasNoAbuttingWallARecordedEntries(design: Design): boolean {
  const onWallA = [
    ...(design.emptyColumns ?? []),
    ...(design.columnExtents ?? []),
  ]
    .filter((entry) => entry.wall === "A")
    .map((entry) => ({
      startMm: entry.alongMm - entry.widthMm / 2,
      endMm: entry.alongMm + entry.widthMm / 2,
    }));
  return onWallA.every((left) =>
    onWallA.every((right) => left === right || left.endMm !== right.startMm),
  );
}

describe("AC6 — arbitrary U documents are mirror-equivariant (property)", () => {
  propertyTest.prop([arbitraryUDesign], {
    numRuns: PROPERTY_RUNS,
    seed: PROPERTY_SEED,
  })(
    "validateDesignForCatalog and recomputeVoids commute with the mirror",
    (design) => {
      fc.pre(hasNoAbuttingWallARecordedEntries(design));
      expectMirrorEquivariant(design);
    },
  );

  propertyTest.prop([arbitraryUDesign], {
    numRuns: PROPERTY_RUNS,
    seed: PROPERTY_SEED + 1,
  })("the mirror is an involution on the stored document", (design) => {
    expect(mirrorUDesign(mirrorUDesign(design))).toEqual(design);
  });
});
