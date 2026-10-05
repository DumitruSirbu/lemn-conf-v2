// ADR 0101 attacked at its guard: the lifted arm of `columnBuildDepthMm` is an identity on its input, so everything
// rests on `hasFullHeightUnder` (`band === "column"` on the same wall with a positive along-wall overlap, in
// `void-engine.ts`) and on the three deep tops satisfying it. Covers the overlap boundary, the band as a declaration
// rather than a measured height, the same-wall restriction, the three tops' steps at both declared depths, and
// ADR 0102's open product question, characterised so nobody fixes it by accident.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  columnBuildDepthMm,
  depthFollowsSetting,
} from "../src/cabinet-depth-rule.js";
import { setCabinetDepth } from "../src/commands/set-cabinet-depth.js";
import { removePlacement } from "../src/commands/remove-placement.js";
import type { Design, DesignPlacement } from "../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { toMillimetres } from "../src/millimetres.js";
import {
  occupiedDepthM,
  occupiedDepthOfEntryM,
} from "../src/occupied-depth.js";
import {
  declaredCabinetDepthsMm,
  WALL_FRONT_ASSEMBLY_MM,
} from "../src/worktop-depth.js";
import {
  derivePlacementRecords,
  type BodyCatalog,
  type BodyDefinition,
} from "../src/void-engine.js";
import { insertInto, OCCURRED_AT } from "./support/commands.js";
import { createFakeProbeFactory } from "./support/fake-probe.js";
import { createWorld, type KitchenWorld } from "./support/kitchen-world.js";

/** The three placements ADR 0101 is about, each named with the column it hangs over. */
const DEEP_TOPS = [
  {
    placementId: "p22",
    columnPlacementId: "p5",
    buildId: "wall-2door-600-deep-top",
  },
  {
    placementId: "p23",
    columnPlacementId: "p6",
    buildId: "wall-2door-600-deep-top",
  },
  {
    placementId: "p24",
    columnPlacementId: "p7",
    buildId: "wall-2door-700-over-fridge",
  },
] as const;

/** ADR 0101's measured table: how far the column beneath stands proud of the top above it. 38 mm behind the oven
 *  tower's handles, one millimetre behind the top at the pantry (the flush relationship the owner reported as right),
 *  and the fridge's manufactured 742 less the line. */
const STEPS_MM = {
  600: { p22: 38, p23: -1, p24: 142 },
  700: { p22: 38, p23: -1, p24: 42 },
} as const;

/** §5.2's head-clearance cap as the finished depth of a capped wall body: ADR 0028's map, written here as data rather
 *  than read from the module under test. */
const CAPPED_FINISHED_DEPTH_MM = { 600: 330, 700: 400 } as const;

const PROBE_AT = createFakeProbeFactory();

/** A catalogue row by id, refusing rather than answering `undefined`: a missing row would make
 *  every assertion below silently about nothing. */
function catalogEntry(catalog: BodyCatalog, buildId: string): BodyDefinition {
  const definition = catalog.get(buildId);
  if (!definition) throw new Error(`the catalogue holds no ${buildId}`);
  return definition;
}

function design(placements: readonly DesignPlacement[]): Design {
  return {
    room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
    presetId: null,
    placements: [...placements],
    createdAt: OCCURRED_AT,
    updatedAt: OCCURRED_AT,
  };
}

/** A wall body over whatever is placed below it, at whichever along-wall coordinate is asked for —
 *  which is what makes the overlap the variable the sweep below moves. */
function stackedWorld(
  below: readonly DesignPlacement[],
  wallAlongMm: number,
  wall: "A" | "B" = "A",
): KitchenWorld {
  const wallBody: DesignPlacement = {
    id: "w0",
    wall,
    alongMm: wallAlongMm,
    y0Mm: 1500,
    body: { buildId: "wall-2door-600", widthMm: 600, heightMm: 700 },
  };
  return createWorld(design([...below, wallBody]), KITCHEN_L_BODY_CATALOG);
}

/** Whether the column `w0` itself stands in has a full-height member under it, asked through `w0`'s record: a design
 *  holding a column places it in a column of its own, which trivially answers `true`, so a map-wide `some` would be
 *  green for every case below. */
function liftedForTheWallBody(world: KitchenWorld): boolean {
  const record = world.records.find((candidate) => candidate.id === "w0");
  if (!record) throw new Error("the fixture placed no wall body");
  const column = world.columns.get(record.col);
  if (!column) throw new Error(`no column ${record.col}`);
  return column.hasFullHeightUnder;
}

/** The depth `insertBody` plans for a wall carcass replacing `w0`, as a **finished** depth: the
 *  recorded seat plus ADR 0036's front assembly, which is what the two arms of `columnBuildDepthMm`
 *  answer in. */
function plannedFinishedDepthMm(world: KitchenWorld): number {
  const result = insertInto(
    world,
    { kind: "placement", id: "w0" },
    "wall-cabinet",
  );
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  const placed = result.design.placements.find(
    (placement) => placement.id === result.effect.placementId,
  );
  if (!placed) throw new Error("the insert placed nothing");
  return (placed.body.seatDepthMm ?? 0) + WALL_FRONT_ASSEMBLY_MM;
}

/** A 600 mm full-height column standing at 1000 mm along its wall, so it spans 1000–1600. */
function tallColumnAt(alongMm: number, wall: "A" | "B" = "A"): DesignPlacement {
  return {
    id: `c${String(alongMm)}${wall}`,
    wall,
    alongMm,
    y0Mm: 0,
    body: { buildId: "tall-pantry-600", widthMm: 600, heightMm: 2200 },
  };
}

describe("the lifted arm's guard: what counts as standing under an opening", () => {
  // `overlapsAlongWall` is a strict `>` over a nanometre epsilon, so a wall body that merely adjoins a column keeps the
  // cap and one that overhangs it by a millimetre loses it. Every offset up to a total overhang is swept, so the answer
  // cannot flicker inside the range.
  propertyTest.prop([fc.integer({ min: 1, max: 600 })])(
    "lifts the cap for any positive overhang, however small",
    (overlapMm) => {
      // `c1000` spans 1000–1600; the wall body spans `1600 − overlapMm` to `2200 − overlapMm`.
      const world = stackedWorld([tallColumnAt(1000)], 1600 - overlapMm);

      expect({ overlapMm, lifted: liftedForTheWallBody(world) }).toEqual({
        overlapMm,
        lifted: true,
      });
    },
  );

  // Sharing a module line is not standing under something: a head-clearance rule, not "is there a tall unit nearby".
  it.each([
    { what: "flush to the column's right-hand face", alongMm: 1600 },
    { what: "flush to the column's left-hand face", alongMm: 400 },
  ])("caps a wall body merely adjoining a column, $what", ({ alongMm }) => {
    const world = stackedWorld([tallColumnAt(1000)], alongMm);

    expect(liftedForTheWallBody(world)).toBe(false);
    expect(plannedFinishedDepthMm(world)).toBe(CAPPED_FINISHED_DEPTH_MM[600]);
  });

  // The band is a declaration, not a measured height (ADR 0058 decision 2), read both ways round: a wall body as tall
  // as a column does not lift the cap, and the 1850 mm freestanding fridge does.
  it("reads the declared band and not the frame's height", () => {
    const tallWallBody: DesignPlacement = {
      id: "notacolumn",
      wall: "A",
      alongMm: 1000,
      y0Mm: 0,
      // A wall entry, given a column's height by the placement. `band` still says `wall`.
      body: { buildId: "wall-2door-600", widthMm: 600, heightMm: 2200 },
    };
    const shortColumn: DesignPlacement = {
      id: "fridge",
      wall: "A",
      alongMm: 1000,
      y0Mm: 0,
      body: { buildId: "fridge-free-700", widthMm: 700, heightMm: 1850 },
    };

    const overATallWallBody = stackedWorld([tallWallBody], 1000);
    const overAShortColumn = stackedWorld([shortColumn], 1000);

    expect({
      overATallWallBody: liftedForTheWallBody(overATallWallBody),
      overAShortColumn: liftedForTheWallBody(overAShortColumn),
    }).toEqual({ overATallWallBody: false, overAShortColumn: true });
  });

  // `isFullHeightUnder` asks each record on its own, with no accumulation, so a base cabinet with a wall cabinet on top
  // keeps the cap however tall the pair is (a person still leans over the worktop between them); a predicate written
  // against a measured frame top would get this wrong.
  it("does not lift the cap for two part-height bodies stacked to a column's height", () => {
    const base: DesignPlacement = {
      id: "base",
      wall: "A",
      alongMm: 1000,
      y0Mm: 0,
      body: { buildId: "base-drawer2-600", widthMm: 600, heightMm: 820 },
    };
    const middle: DesignPlacement = {
      id: "middle",
      wall: "A",
      alongMm: 1000,
      y0Mm: 820,
      body: { buildId: "wall-2door-600", widthMm: 600, heightMm: 680 },
    };

    const world = stackedWorld([base, middle], 1000);

    expect(liftedForTheWallBody(world)).toBe(false);
    expect(plannedFinishedDepthMm(world)).toBe(CAPPED_FINISHED_DEPTH_MM[600]);
  });

  // The same-wall clause of `isFullHeightUnder`, deliberate and today unreachable: both walls originate at (0, 0, 0),
  // so a wall-B body in the inside corner stands physically over a wall-A run and is capped anyway. Characterised, not
  // approved: the arm would answer differently the day a wall-B column exceeds the map row with no wall-B column of its
  // own, and the comment on the clause asks for a revisit then.
  it("does not lift a wall-B opening from a wall-A column standing under it", () => {
    const world = stackedWorld([tallColumnAt(0, "A")], 0, "B");

    expect(liftedForTheWallBody(world)).toBe(false);
    expect(plannedFinishedDepthMm(world)).toBe(CAPPED_FINISHED_DEPTH_MM[600]);
  });

  // The two arms must stay two different answers at the other declared depth, or the exclusion
  // `seeded-equivalent-depth-agreement` grants is an exclusion from nothing.
  it.each(declaredCabinetDepthsMm())(
    "answers the cabinet-depth line where it is lifted and the map row where it is not, at %i mm",
    (cabinetDepthMm) => {
      expect({
        lifted: columnBuildDepthMm({
          cabinetDepthMm,
          hasFullHeightUnder: true,
        }),
        capped: columnBuildDepthMm({
          cabinetDepthMm,
          hasFullHeightUnder: false,
        }),
      }).toEqual({
        lifted: cabinetDepthMm,
        capped:
          CAPPED_FINISHED_DEPTH_MM[
            cabinetDepthMm as keyof typeof CAPPED_FINISHED_DEPTH_MM
          ],
      });
    },
  );
});

describe("the three deep tops, measured against the columns they hang over", () => {
  function measuredAt(cabinetDepthMm: number) {
    const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
    const records = derivePlacementRecords(
      cabinetDepthMm === 600 ? KITCHEN_L_DESIGN : deepened(cabinetDepthMm),
      catalog,
    );
    const finishedMm = (placementId: string): number => {
      const record = records.find((candidate) => candidate.id === placementId);
      if (!record) throw new Error(`no record for ${placementId}`);
      return Math.round(toMillimetres(occupiedDepthM(record)));
    };
    return finishedMm;
  }

  function deepened(cabinetDepthMm: number): Design {
    const result = setCabinetDepth({
      design: KITCHEN_L_DESIGN,
      catalogAt: buildKitchenLBodyCatalog,
      cabinetDepthMm,
      probeAt: PROBE_AT,
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) throw new Error("the depth change was refused");
    return result.design;
  }

  // All three finish on the cabinet-depth line at both declared depths (600 in a 600 mm kitchen, 700 in a 700 mm one).
  // Asked of the placement and of the catalogue entry in one assertion, because they are two numbers reached by two
  // routes and only their agreement is the ruling: after a depth change the placement carries a rebuilt `seatDepthMm`
  // and would keep reading 700 even if the entry were re-pinned at 600, while a design loaded at 700 with no stored
  // seat gets the entry's declaration (ADR 0079 decision 10's pairing invariant).
  it.each(declaredCabinetDepthsMm())(
    "finishes every deep top on the cabinet-depth line at %i mm, by both routes",
    (cabinetDepthMm) => {
      const finishedMm = measuredAt(cabinetDepthMm);
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);

      expect(
        DEEP_TOPS.map(({ placementId, buildId }) => ({
          placementId,
          placedMm: finishedMm(placementId),
          declaredMm: Math.round(
            toMillimetres(
              occupiedDepthOfEntryM({
                buildId,
                definition: catalogEntry(catalog, buildId),
              }),
            ),
          ),
        })),
      ).toEqual(
        DEEP_TOPS.map(({ placementId }) => ({
          placementId,
          placedMm: cabinetDepthMm,
          declaredMm: cabinetDepthMm,
        })),
      );
    },
  );

  // ADR 0101's step table, re-measured: the difference is between the columns, not the tops. The expectations are data
  // above, so a wave that moved all three together cannot pass by moving the expectation with them.
  it.each(declaredCabinetDepthsMm())(
    "leaves each column standing its own declared step proud of its top at %i mm",
    (cabinetDepthMm) => {
      const finishedMm = measuredAt(cabinetDepthMm);
      const expected = STEPS_MM[cabinetDepthMm as keyof typeof STEPS_MM];

      expect(
        DEEP_TOPS.map(({ placementId, columnPlacementId }) => ({
          placementId,
          stepMm: finishedMm(columnPlacementId) - finishedMm(placementId),
        })),
      ).toEqual(
        DEEP_TOPS.map(({ placementId }) => ({
          placementId,
          stepMm: expected[placementId],
        })),
      );
    },
  );
});

describe("ADR 0101 decision 3: the pinned arm survives with no shipped population", () => {
  // If a row ever declares `pinned` again, the suites re-founded on declared witnesses silently lean on the demo
  // kitchen again, the "moved fixture" ADR 0093 refuses.
  it.each(declaredCabinetDepthsMm())(
    "leaves no entry in the shipped catalogue declaring a pin at %i mm",
    (cabinetDepthMm) => {
      const pinned = [...buildKitchenLBodyCatalog(cabinetDepthMm)]
        .filter(
          ([, definition]) =>
            definition.depthRule !== undefined &&
            !depthFollowsSetting(definition.depthRule) &&
            definition.depthRule.follows === "pinned",
        )
        .map(([buildId]) => buildId);

      expect(pinned).toEqual([]);
    },
  );

  // Not merely unpopulated but still answering, which keeps it a mechanism a future entry can use, not dead code.
  it("still answers a pin's own finished depth", () => {
    const pinnedAtEightHundred = {
      follows: "pinned",
      pinnedFinishedDepthMm: 800,
      alongWallPositionFollows: "base-formula",
    } as const;

    expect(depthFollowsSetting(pinnedAtEightHundred)).toBe(false);
    expect(pinnedAtEightHundred.pinnedFinishedDepthMm).toBe(800);
  });
});

describe("ADR 0102's open product question, characterised and deliberately not fixed", () => {
  // Asserts today's behaviour, which the owner has not ruled on: deleting the full-height column beneath a deep top and
  // then changing the depth rebuilds that top from 600 mm finished to 400 mm (`p23`'s seat goes 561 -> 361). The rule
  // producing it is ADR 0028 decision 5's and is correct; whether it is the product the owner wants is open (ADR 0102,
  // *Not decided here*). Pinned so it cannot change unnoticed. Do not "fix" this test: if the owner rules the top
  // should hold its depth when its column goes, that ruling lands here.
  it.each(declaredCabinetDepthsMm())(
    "rebuilds a deep top at the capped depth once its column is deleted, at %i mm",
    (cabinetDepthMm) => {
      const removed = removePlacement({
        design: KITCHEN_L_DESIGN,
        catalog: KITCHEN_L_BODY_CATALOG,
        target: { kind: "placement", id: "p6" },
        occurredAt: OCCURRED_AT,
      });
      if (!removed.ok) throw new Error("the fixture could not delete p6");

      const changed = setCabinetDepth({
        design: removed.design,
        catalogAt: buildKitchenLBodyCatalog,
        cabinetDepthMm,
        probeAt: PROBE_AT,
        occurredAt: OCCURRED_AT,
      });
      if (!changed.ok) throw new Error("the depth change was refused");

      const orphaned = changed.design.placements.find(
        (placement) => placement.id === "p23",
      );
      const stillOverAColumn = changed.design.placements.find(
        (placement) => placement.id === "p22",
      );

      expect({
        p23SeatMm: orphaned?.body.seatDepthMm,
        p22SeatMm: stillOverAColumn?.body.seatDepthMm,
      }).toEqual({
        // The wall map's row, less the front assembly: 291 at 600 and 361 at 700.
        p23SeatMm:
          CAPPED_FINISHED_DEPTH_MM[
            cabinetDepthMm as keyof typeof CAPPED_FINISHED_DEPTH_MM
          ] - WALL_FRONT_ASSEMBLY_MM,
        // Its neighbour still has the oven tower under it, which makes this a consequence of the deletion and not of
        // the depth change.
        p22SeatMm: cabinetDepthMm - WALL_FRONT_ASSEMBLY_MM,
      });
    },
  );
});
