// ADR 0017: a catalogue entry may declare a width its builder cannot go under, and both §5.2's
// guard and §9's offer list read it.
//
// The sink base's worktop splits around a fixed 560 mm aperture; below that the two fillers invert
// and the carcass grows *taller* as it is asked to grow narrower. `refuseBuiltSize` catches the
// gross cases but accepts 550 mm, whose 10 mm error is inside `FIT_TOLERANCE_M` — which is why the
// floor is declared rather than inferred from the measurement.
import { describe, expect, it } from "vitest";

import {
  buildableSizes,
  INSERTABLE_BODY_DEFINITIONS,
  toInsertableBody,
} from "../../src/catalog.js";
import { KITCHEN_L_BODY_CATALOG } from "../../src/fixtures/kitchen-l-design.js";
import {
  evaluateInsertFit,
  openingFromVoid,
  type InsertFit,
} from "../../src/commands/insert-fit.js";
import { renderRejection } from "../../src/commands/rejection.js";
import { toMetres } from "../../src/millimetres.js";
import { offersFor, type CatalogOffer } from "../../src/queries/offers.js";
import { FIT_TOLERANCE_M, type BodyDefinition } from "../../src/void-engine.js";
import { clearBodies, insertInto } from "../support/commands.js";
import type { KitchenWorld } from "../support/kitchen-world.js";
import { createWorld, voidAt } from "../support/kitchen-world.js";
import { columnWorld } from "../support/synthetic-world.js";

const SINK_MIN_WIDTH_MM = 560;
/** §2's `MIN_W`, in millimetres — the default floor both declared floors are read against. */
const GENERAL_MIN_WIDTH_MM = 300;
/** ADR 0026: the bottle cargo's floor, the one entry that declares below the default. */
const BOTTLE_CARGO_MIN_WIDTH_MM = 200;
/** ADR 0030's amendment: the two hinged singles declare the same floor, for the same reason —
 *  a set reaching under §2's default needs a declaration to keep it. */
const ONE_DOOR_MIN_WIDTH_MM = 200;
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

  it("accepts the sink base at exactly its aperture", () => {
    const result = insertIntoBaseOpening(SINK_MIN_WIDTH_MM, "base-sink");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.placements.at(-1)?.body.widthMm).toBe(
      SINK_MIN_WIDTH_MM,
    );
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
    expect(result.reason.message.trim().length).toBeGreaterThan(0);
    expect(result.reason.message).toContain(String(SINK_MIN_WIDTH_MM));
    expect(result.reason.message).toContain("400");
  });

  // The general floor is untouched: an entry with no `minWidthMm` is still governed by §2's 300 mm,
  // and its refusal still carries the code and the size list it always did.
  it("leaves §2's MIN_WIDTH_M governing an entry that declares no minimum", () => {
    const refused = insertIntoBaseOpening(299, "base-2door");
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.reason.code).toBe("WIDTH_NOT_SUPPORTED");

    expect(insertIntoBaseOpening(300, "base-2door").ok).toBe(true);
  });
});

describe("§9's offer list and §5.2's guard read the one fact", () => {
  it("does not offer the sink base for a 400 mm or a 500 mm opening", () => {
    for (const widthMm of [400, 500]) {
      const world = baseOpeningWorld(widthMm);
      const offered = offersFor({ ...world, target: baseVoidTarget(world) });
      expect(offered.length, `${String(widthMm)} mm`).toBeGreaterThan(0);
      expect(
        offered.map((offer) => offer.buildId),
        `${String(widthMm)} mm`,
      ).not.toContain("base-sink");
    }
  });

  it("offers the sink base for a 600 mm opening", () => {
    const world = baseOpeningWorld(600);
    const offered = offersFor({ ...world, target: baseVoidTarget(world) });
    expect(offered.map((offer) => offer.buildId)).toContain("base-sink");
  });

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

  it("declares the aperture as its minimum", () => {
    expect(sink?.minWidthMm).toBe(SINK_MIN_WIDTH_MM);
  });

  // 400 is not a width this body has, so it must not reach M4 as a width chip.
  it("no longer lists 400 as a width chip", () => {
    expect(sink?.sizesMm).toEqual([600, 800]);
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
    expect([...declaredFloorsMm]).toEqual([
      ["base-1door", ONE_DOOR_MIN_WIDTH_MM],
      ["base-bottle-cargo", BOTTLE_CARGO_MIN_WIDTH_MM],
      ["base-sink", SINK_MIN_WIDTH_MM],
      ["wall-1door", ONE_DOOR_MIN_WIDTH_MM],
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
  label: "Nișă sintetică",
  nominalHeightMm: 860,
  nominalDepthMm: 580,
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

const SET_ENTIRELY_BELOW_FLOOR: BodyDefinition = {
  ...SYNTHETIC_SET_ENTRY,
  widthFlex: [450],
  sizesMm: [450],
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
  return evaluateInsertFit({ body, opening: openingFromVoid(record), column });
}

describe("R2.1: a millimetre-set body honours its own minimum width", () => {
  // The control: without a floor the branch does take the 450 mm member, which is the behaviour
  // that made the gap invisible.
  it("takes the narrower listed size when the entry declares no floor", () => {
    const fit = fitInBaseOpening(SET_WITHOUT_FLOOR, 450);
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    expect(fit.plan.widthM).toBeCloseTo(0.45, 6);
  });

  it("refuses rather than selecting a listed size below the floor", () => {
    const fit = fitInBaseOpening(SET_WITH_FLOOR, 450);
    expect(fit.ok).toBe(false);
    if (fit.ok) return;
    expect(fit.detail.code).toBe("WIDTH_TOO_LARGE");
  });

  // The refusal must name the widths the body can be *built* at, not the ones its row lists: 450
  // is not a width this entry has, so a sentence offering it would be false. The opening is 480 so
  // that a leaked 450 cannot be confused with the opening's own millimetres.
  it("names only the buildable widths in its sentence", () => {
    const fit = fitInBaseOpening(SET_WITH_FLOOR, 480);
    expect(fit.ok).toBe(false);
    if (fit.ok) return;
    const message = renderRejection(fit.detail);
    expect(message.trim().length).toBeGreaterThan(0);
    expect(message).toContain("600");
    expect(message).toContain("480");
    expect(message).not.toContain("450");
  });

  it("still selects a listed size at or above the floor", () => {
    const fit = fitInBaseOpening(SET_WITH_FLOOR, 600);
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    expect(fit.plan.widthM).toBeCloseTo(0.6, 6);
  });

  // Contradictory catalogue data: a floor above every width the entry lists. There is no width at
  // which the body can be made, so a roomy opening does not rescue it.
  it("refuses a set whose every member is below the floor, even in a wide opening", () => {
    const fit = fitInBaseOpening(SET_ENTIRELY_BELOW_FLOOR, 800);
    expect(fit.ok).toBe(false);
    if (fit.ok) return;
    expect(fit.detail).toMatchObject({
      code: "WIDTH_TOO_SMALL",
      params: { requiredMm: 500 },
    });
    expect(renderRejection(fit.detail).trim().length).toBeGreaterThan(0);
  });
});

describe("R2.1: no shipped entry's width resolution changes", () => {
  // The structural reason the filter is a no-op for every shipped row. If a future entry breaks
  // this, the behavioural sweep below stops being evidence and this test says why.
  //
  // Until ADR 0026 the reason was "no fixed-set entry declares a floor at all". `base-bottle-cargo`
  // is one that does, so the reason is now the narrower true one: no fixed-set entry has a floor
  // that removes any width from its own set. The sweep needs exactly that and nothing more.
  it("ships no millimetre set a floor of its own would narrow", () => {
    for (const [buildId, definition] of INSERTABLE_BODY_DEFINITIONS) {
      const sizesMm = definition.widthFlex;
      if (sizesMm === undefined || sizesMm === "fit") continue;
      expect(buildableSizes(definition.minWidthMm, sizesMm), buildId).toEqual(
        sizesMm,
      );
    }
  });

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
            offer.widthMm,
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

  // Named explicitly because it is the one shipped entry with a floor, and the one whose chips a
  // careless filter would eat.
  it("leaves base-sink's chips at [600, 800]", () => {
    const world = baseOpeningWorld(800);
    const offered = offersFor({ ...world, target: baseVoidTarget(world) });
    const sink = offered.find((offer) => offer.buildId === "base-sink");
    expect(sink?.sizesMm).toEqual([600, 800]);
  });
});
