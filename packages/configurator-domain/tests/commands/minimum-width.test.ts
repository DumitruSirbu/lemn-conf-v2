// ADR 0017: a catalogue entry may declare a width its builder cannot go under, and both §5.2's
// guard and §9's offer list read it.
//
// The sink base's worktop splits around a fixed 560 mm aperture; below that the two fillers invert
// and the carcass grows *taller* as it is asked to grow narrower. `refuseBuiltSize` catches the
// gross cases but accepts 550 mm, whose 10 mm error is inside `FIT_TOLERANCE_M` — which is why the
// floor is declared rather than inferred from the measurement.
import { describe, expect, it } from "vitest";

import { SINK_CHIPS_MM } from "../support/width-model.js";
import { offeredIds } from "../support/offers.js";

import {
  baseFinishedDepthMm,
  INSERTABLE_BODY_DEFINITIONS,
  toInsertableBody,
} from "../../src/catalog.js";
import { WORKTOP_DEPTH_MM } from "../../src/worktop-depth.js";
import { finishesAtMm } from "../../src/occupied-depth.js";
import { KITCHEN_L_BODY_CATALOG } from "../../src/fixtures/kitchen-l-design.js";
import {
  evaluateInsertFit,
  openingFromVoid,
  type InsertFit,
} from "../../src/commands/insert-fit.js";
import { toMetres } from "../../src/millimetres.js";
import { offersFor, type CatalogOffer } from "../../src/queries/offers.js";
import { FIT_TOLERANCE_M, type BodyDefinition } from "../../src/void-engine.js";
import { clearBodies, insertInto } from "../support/commands.js";
import type { KitchenWorld } from "../support/kitchen-world.js";
import { createWorld, voidAt } from "../support/kitchen-world.js";
import { columnWorld } from "../support/synthetic-world.js";
import { DEFAULT_CABINET_DEPTH_MM } from "../../src/worktop-depth.js";

const SINK_MIN_WIDTH_MM = 560;
/** §2's `MIN_W`, in millimetres — the default floor both declared floors are read against. */
const GENERAL_MIN_WIDTH_MM = 300;
/** ADR 0026: the bottle cargo's floor, the one entry that declares below the default. */
const BOTTLE_CARGO_MIN_WIDTH_MM = 200;
/** ADR 0030's amendment: the two hinged singles declare the same floor, for the same reason —
 *  a set reaching under §2's default needs a declaration to keep it. */
const ONE_DOOR_MIN_WIDTH_MM = 200;
/** ADR 0035: the sink base's chips, stepped from its aperture to §7's ceiling rather than the
 *  `[600, 800]` list ADR 0017 left behind when it removed 400. */
const OPENING_ALONG_MM = 1000;
const OPENING_COLUMN = "A|1.00";

/** A full base/wall/top stack of the given width, so removing any one member leaves an opening of
 *  exactly that width whose free span stops at its own level rather than collapsing into one. */
function stackedColumn(widthMm: number): KitchenWorld {
  return columnWorld(OPENING_ALONG_MM, [
    { id: "s0", y0Mm: 0, heightMm: 820, widthMm },
    {
      id: "s1",
      y0Mm: 1500,
      heightMm: 700,
      buildId: "wall-2door-600",
      widthMm,
    },
    {
      id: "s2",
      y0Mm: 2200,
      heightMm: 400,
      buildId: "wall-2door-600-top",
      widthMm,
    },
  ]);
}

function baseOpeningWorld(widthMm: number): KitchenWorld {
  return clearBodies(stackedColumn(widthMm), ["s0"]);
}

function wallOpeningWorld(widthMm: number): KitchenWorld {
  return clearBodies(stackedColumn(widthMm), ["s1"]);
}

function baseVoidTarget(world: KitchenWorld) {
  return { kind: "void", id: voidAt(world, OPENING_COLUMN, 0).id } as const;
}

function insertIntoBaseOpening(widthMm: number, buildId: string) {
  const world = baseOpeningWorld(widthMm);
  return insertInto(world, baseVoidTarget(world), buildId);
}

describe("§5.2's fit path honours a body's own minimum width", () => {
  it("refuses the sink base one millimetre below its aperture", () => {
    const result = insertIntoBaseOpening(SINK_MIN_WIDTH_MM - 1, "base-sink");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("WIDTH_TOO_SMALL");
  });

  // **Back to what ADR 0017 measured, by way of two revisions.** 5C2 made `[600, 800]` a bound on the
  // `'fit'` path and this case asserted a refusal at 560; ADR 0033's amendment reads the sink as
  // cabinetry with a fixed aperture — the bowl is 560, the carcass is not — so the aperture builds
  // again, which is the width ADR 0017 chose over 550 precisely because the geometry is correct there.
  it("accepts the sink base at exactly its aperture", () => {
    const result = insertIntoBaseOpening(SINK_MIN_WIDTH_MM, "base-sink");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.placements.at(-1)?.body.widthMm).toBe(
      SINK_MIN_WIDTH_MM,
    );
  });

  // The other end of the range: a sink base stops at §7's 800 mm ceiling.
  it("refuses the sink base above §7's ceiling, naming its widths", () => {
    const result = insertIntoBaseOpening(801, "base-sink");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("WIDTH_NOT_SUPPORTED");
    expect(result.reason.params).toMatchObject({ sizesMm: SINK_CHIPS_MM });
  });

  // §11 row 5: the millimetres are in the params *and* in the sentence the panel renders verbatim.
  it("names both the minimum and the opening in its Romanian sentence", () => {
    const result = insertIntoBaseOpening(400, "base-sink");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatchObject({
      code: "WIDTH_TOO_SMALL",
      params: { requiredMm: SINK_MIN_WIDTH_MM, availableMm: 400 },
    });
  });
});

describe("§9's offer list and §5.2's guard read the one fact", () => {
  // The invariant ADR 0017 actually buys: across the whole base range, an offer is never a refusal
  // waiting to happen. Asserted as a property rather than at three hand-picked widths, because a
  // floor that only the offer list knows is a floor the next caller forgets.
  it("offers nothing across 300–800 mm that the insert command would refuse", () => {
    const widthsMm = [
      ...Array.from({ length: 51 }, (_unused, step) => 300 + step * 10),
      SINK_MIN_WIDTH_MM - 1,
      SINK_MIN_WIDTH_MM,
      SINK_MIN_WIDTH_MM + 1,
    ];
    for (const widthMm of widthsMm) {
      const world = baseOpeningWorld(widthMm);
      const target = baseVoidTarget(world);
      const offered = offersFor({ ...world, target });
      for (const offer of offered) {
        const result = insertInto(world, target, offer.buildId);
        expect(result.ok, `${String(widthMm)} mm -> ${offer.buildId}`).toBe(
          true,
        );
      }
      // ADR 0033's amendment: the sink is continuous from its aperture up, so it reaches every
      // opening at or above 560 — which is what this sweep asserted before 5C2 briefly made the chip
      // list a bound. The sweep tops out at 800, so the range's upper end is exercised by its own
      // case above rather than here.
      const offersSink = offered.some((offer) => offer.buildId === "base-sink");
      expect(offersSink, `${String(widthMm)} mm`).toBe(
        widthMm >= SINK_MIN_WIDTH_MM,
      );
    }
  });
});

describe("the sink base's catalogue widths", () => {
  const sink = INSERTABLE_BODY_DEFINITIONS.find(
    ([buildId]) => buildId === "base-sink",
  )?.[1];

  // 400 is not a width this body has, so it must not reach M4 as a width chip. ADR 0035 steps the
  // rest of the row's chips from the aperture up, and 600 is still where they start: `steppedWidths`
  // rounds the 560 mm floor **up** to the first multiple of the step.
  it("starts its chips above the aperture, never at 400", () => {
    expect(sink?.sizesMm).toEqual(SINK_CHIPS_MM);
  });

  // This asserted "`base-sink` is the only entry that declares a floor" until ADR 0026, and it was
  // right until then. There are now two, and they declare in opposite directions — so the fact
  // worth pinning is no longer "one exception" but "these two, each the way its ADR says", with
  // every other row still on §2's default.
  it("leaves every other entry's chip set on §2's general floor", () => {
    const declaredFloorsMm = new Map(
      INSERTABLE_BODY_DEFINITIONS.filter(
        ([, definition]) => definition.minWidthMm !== undefined,
      ).map(([buildId, definition]) => [buildId, definition.minWidthMm]),
    );

    // Catalogue order, which is the order §9 lists the rows in. **Two entries until 2026-08-27**:
    // ADR 0030's amendment added `base-1door` and `wall-1door` at the same 200 mm the cargo
    // declares, because a set reaching below §2's default is filtered back out again without one.
    // Still four after ADR 0035, and the hood's absence is the decision: decision 5 floors it at
    // 600, but through the **bound** rather than through `minWidthMm`. An upward `minWidthMm` claims
    // the builder is broken below it (ADR 0026 clause 2), and §7's hood builder is correct at 599 —
    // the owner simply does not sell one.
    expect([...declaredFloorsMm]).toEqual([
      ["base-cabinet", ONE_DOOR_MIN_WIDTH_MM],
      ["base-bottle-cargo", BOTTLE_CARGO_MIN_WIDTH_MM],
      ["base-sink", SINK_MIN_WIDTH_MM],
      ["wall-cabinet", ONE_DOOR_MIN_WIDTH_MM],
    ]);
    // ADR 0017 raises, ADR 0026 lowers. A floor on the wrong side of §2's default would change
    // which rejection code the customer reads, so the direction is asserted, not just the value.
    expect(SINK_MIN_WIDTH_MM).toBeGreaterThan(GENERAL_MIN_WIDTH_MM);
    expect(BOTTLE_CARGO_MIN_WIDTH_MM).toBeLessThan(GENERAL_MIN_WIDTH_MM);
    expect(ONE_DOOR_MIN_WIDTH_MM).toBeLessThan(GENERAL_MIN_WIDTH_MM);
  });
});

// R2.1 — the millimetre-set branch of `resolveWidth` reads the floor too.
//
// A `widthFlex` set takes its width from the set rather than from the opening, so before this it
// could select a listed size below the entry's own `minWidthMm` and hand the probe a width the
// builder inverts. No shipped entry combines the two — `base-sink` is the only entry declaring a
// floor and it is `'fit'` — so these use synthetic entries, and the shipped population is asserted
// unchanged below.

const definitionsByBuildId = new Map(INSERTABLE_BODY_DEFINITIONS);

const SYNTHETIC_BUILD_ID = "synthetic-set";

/** Everything a millimetre-set base entry needs, minus the widths under test. */
const SYNTHETIC_SET_ENTRY = {
  kind: "dishwasher_housing",
  band: "base",
  frameDepthMm: 580,
  canFinish: true,
  canHandle: true,
  canReplace: true,
  canDelete: true,
  fixedWidth: false,
  heightFlex: false,
  insertable: true,
  // ASCII on purpose: this entry ships in no catalogue and its label is never rendered or asserted,
  // so a Romanian one would be the only customer-shaped string in a package that publishes none.
  label: "Synthetic set entry",
  nominalHeightMm: 860,
  nominalDepthMm: 580,
  occupiedDepth: finishesAtMm(baseFinishedDepthMm(WORKTOP_DEPTH_MM)),
} as const;

const SET_WITHOUT_FLOOR: BodyDefinition = {
  ...SYNTHETIC_SET_ENTRY,
  widthFlex: [450, 600],
  sizesMm: [450, 600],
};

const SET_WITH_FLOOR: BodyDefinition = {
  ...SET_WITHOUT_FLOOR,
  minWidthMm: 500,
};

function fitInBaseOpening(
  definition: BodyDefinition,
  openingWidthMm: number,
): InsertFit {
  const world = baseOpeningWorld(openingWidthMm);
  const record = voidAt(world, OPENING_COLUMN, 0);
  const body = toInsertableBody(SYNTHETIC_BUILD_ID, definition);
  const column = world.columns.get(record.col);
  if (!body || !column) {
    throw new Error("fixture entry is not insertable in a derived column");
  }
  return evaluateInsertFit({
    body,
    opening: openingFromVoid(record),
    column,
    cabinetDepthMm: DEFAULT_CABINET_DEPTH_MM,
  });
}

describe("R2.1: a millimetre-set body honours its own minimum width", () => {
  // The refusal publishes the governing floor and available opening rather than the raw row list.
  it("publishes the governing floor and available opening", () => {
    const fit = fitInBaseOpening(SET_WITH_FLOOR, 480);
    expect(fit.ok).toBe(false);
    if (fit.ok) return;
    expect(fit.detail).toMatchObject({
      code: "WIDTH_TOO_LARGE",
      params: { requiredMm: 600, availableMm: 480 },
    });
  });

  it("still selects a listed size at or above the floor", () => {
    const fit = fitInBaseOpening(SET_WITH_FLOOR, 600);
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    expect(fit.plan.widthM).toBeCloseTo(0.6, 6);
  });
});

describe("R2.1: no shipped entry's width resolution changes", () => {
  /** §5.2's width rule as it stood before R2.1 — the reference this sweep compares against. */
  function widthMmBeforeR2(
    definition: BodyDefinition,
    openingMm: number,
  ): number {
    const flex = definition.widthFlex;
    if (flex === undefined || flex === "fit") return openingMm;
    const fitting = flex.filter(
      (size) => toMetres(size) <= toMetres(openingMm) + FIT_TOLERANCE_M,
    );
    return Math.max(...fitting);
  }

  it("resolves every offered entry to the width the old rule gave it", () => {
    for (let openingMm = 300; openingMm <= 800; openingMm += 10) {
      const openings = [
        { world: baseOpeningWorld(openingMm), y0: 0 },
        { world: wallOpeningWorld(openingMm), y0: 1.5 },
      ];
      for (const { world, y0 } of openings) {
        const target = {
          kind: "void",
          id: voidAt(world, OPENING_COLUMN, y0).id,
        } as const;
        for (const offer of offersFor({ ...world, target })) {
          const definition = definitionsByBuildId.get(offer.buildId);
          expect(definition, offer.buildId).toBeDefined();
          if (!definition) continue;
          expect(
            offer.buildsToWidthMm,
            `${String(openingMm)} mm @ ${String(y0)} -> ${offer.buildId}`,
          ).toBe(widthMmBeforeR2(definition, openingMm));
        }
      }
    }
  });
});

// The chip set §9 renders must be narrowed by the same floor §5.2's guard applies, or the panel
// offers a width the command refuses — ADR 0017's own failure, one layer up.

/** The stacked column plus one synthetic catalogue entry, with the base level cleared. */
function worldOfferingSyntheticEntry(
  openingWidthMm: number,
  definition: BodyDefinition,
): KitchenWorld {
  const catalog = new Map<string, BodyDefinition>([
    ...KITCHEN_L_BODY_CATALOG,
    [SYNTHETIC_BUILD_ID, definition],
  ]);
  const stacked = stackedColumn(openingWidthMm);
  return clearBodies(createWorld(stacked.design, catalog), ["s0"]);
}

function syntheticOfferAt(
  openingWidthMm: number,
  definition: BodyDefinition,
): CatalogOffer | undefined {
  const world = worldOfferingSyntheticEntry(openingWidthMm, definition);
  return offersFor({ ...world, target: baseVoidTarget(world) }).find(
    (offer) => offer.buildId === SYNTHETIC_BUILD_ID,
  );
}

describe("§9's width chips are narrowed by the same floor", () => {
  // The control: with no floor the entry's whole row reaches the panel.
  it("renders every listed chip for an entry with no floor", () => {
    expect(syntheticOfferAt(600, SET_WITHOUT_FLOOR)?.sizesMm).toEqual([
      450, 600,
    ]);
  });

  it("drops the chips a floored fixed-set entry cannot be built at", () => {
    expect(syntheticOfferAt(600, SET_WITH_FLOOR)?.sizesMm).toEqual([600]);
  });

  // The chips and the guard must agree the way the offer list and the guard already do: every chip
  // rendered is a width `resolveWidth` would select in an opening of that width.
  it("renders no chip the guard would refuse in an opening of that width", () => {
    const offer = syntheticOfferAt(600, SET_WITH_FLOOR);
    expect(offer).toBeDefined();
    for (const chipMm of offer?.sizesMm ?? []) {
      const fit = fitInBaseOpening(SET_WITH_FLOOR, chipMm);
      expect(fit.ok, `${String(chipMm)} mm chip`).toBe(true);
    }
  });

  it("leaves every shipped entry's chips exactly as its catalogue row lists them", () => {
    for (let openingMm = 300; openingMm <= 800; openingMm += 10) {
      const openings = [
        { world: baseOpeningWorld(openingMm), y0: 0 },
        { world: wallOpeningWorld(openingMm), y0: 1.5 },
      ];
      for (const { world, y0 } of openings) {
        const target = {
          kind: "void",
          id: voidAt(world, OPENING_COLUMN, y0).id,
        } as const;
        for (const offer of offersFor({ ...world, target })) {
          const definition = definitionsByBuildId.get(offer.buildId);
          expect(
            offer.sizesMm,
            `${String(openingMm)} mm @ ${String(y0)} -> ${offer.buildId}`,
          ).toEqual(definition?.sizesMm);
        }
      }
    }
  });

  // **ADR 0032's disabled row is gone, so the claim turns over.** That decision said a refused
  // row keeps its unnarrowed chips, because they are what *"requires more space"* means in
  // millimetres. The owner ruled on 2026-09-10 that the row itself should not be there — *"show
  // only what is possible to insert"* — so what this proves now is the absence, and the pairing
  // with the 800 mm opening above is what stops the absence from being vacuous: the same query
  // offers `base-sink` the moment its 560 mm floor is met.
  it("drops a row it refuses, rather than disabling it with its chips still on", () => {
    const world = baseOpeningWorld(400);
    const offers = offersFor({ ...world, target: baseVoidTarget(world) });

    expect(offers.length).toBeGreaterThan(0);
    expect(offeredIds(offers)).not.toContain("base-sink");
  });
});
