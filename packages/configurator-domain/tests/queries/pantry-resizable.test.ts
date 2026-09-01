// M5B wave 5B8 / ADR 0048: `tall-pantry` is the one resizable column, and its door count follows
// its width through the threshold ADR 0035 decision 4 already fixed at 500 mm.
//
// The catalogue half of the wave's criteria. Criteria 5, 6 and 7 are geometry and are asserted
// against measured bounds in `@lemnaria/three-adapter`
// (`tests/pantry-resize.test.ts`, `tests/catalog-bodies.test.ts`); criterion 8 is
// `catalog.test.ts`'s own guard, which moves the pantry from the discrete list to the stepped one.
import { describe, expect, it } from "vitest";

import type { InsertableBody } from "../../src/catalog.js";
import {
  acceptsWidthMm,
  deriveDoorCount,
  describeBodyLabelAt,
  resolveWidthRangesMm,
  toInsertableBody,
} from "../../src/catalog.js";
import { columnWidthChoices } from "../../src/commands/set-width.js";
import type { DesignPlacement } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import type { BodyDefinition } from "../../src/void-engine.js";
import { clearBodies, resizeTo } from "../support/commands.js";
import { createWorld, type KitchenWorld } from "../support/kitchen-world.js";
import { syntheticDesign } from "../support/synthetic-world.js";

const PANTRY_ID = "tall-pantry";
const APPLIANCE_COLUMN_IDS = [
  "tall-oven-tower",
  "tall-fridge-housing",
  "fridge-free",
] as const;

const seededKitchen = (): KitchenWorld =>
  createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

function definitionOf(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`no catalogue entry ${buildId}`);
  return definition;
}

/** The resolved body, because `acceptsWidthMm` and `resolveWidthRangesMm` answer about one — a
 *  declared range raised to whatever floor governs the entry, not the raw catalogue field. */
function insertableOf(buildId: string): InsertableBody {
  const body = toInsertableBody(buildId, definitionOf(buildId));
  if (!body) throw new Error(`${buildId} does not resolve an insertable body`);
  return body;
}

/** One pantry standing on its own, at the width given, so the width section can be read off it. */
function pantryWorldAt(widthMm: number): KitchenWorld {
  const placement: DesignPlacement = {
    id: "only",
    wall: "A",
    alongMm: 1200,
    y0Mm: 0,
    body: { buildId: PANTRY_ID, widthMm, heightMm: 2200 },
  };
  return createWorld(syntheticDesign([placement]), KITCHEN_L_BODY_CATALOG);
}

describe("criterion 1: the pantry's door count follows its width, at the bound's own edges", () => {
  // The threshold is `TWO_DOOR_MIN_WIDTH_MM`, untouched by this wave — the owner's 400/500 split is
  // the shipped one. What is new is that the pantry's bound *reaches* it, so 499 and 500 are widths
  // this row can actually be built at rather than numbers between two rungs of a ladder.
  it.each([
    [400, 1],
    [499, 1],
    [500, 2],
    [800, 2],
  ])("makes a %s mm pantry with %s door(s)", (widthMm, doors) => {
    expect(deriveDoorCount(widthMm)).toBe(doors);
  });

  // The boundary pairs the wave names: 399/400 and 800/801 are the bound, 499/500 the threshold
  // inside it. `acceptsWidthMm` is the one predicate the insert path and `setWidth` both read.
  it.each([
    [399, false],
    [400, true],
    [499, true],
    [500, true],
    [800, true],
    [801, false],
  ])("accepts %s mm: %s", (widthMm, accepted) => {
    expect(acceptsWidthMm(insertableOf(PANTRY_ID), widthMm)).toBe(accepted);
  });
});

describe("criterion 2: the offer label counts the doors, from `describeBodyLabelAt` alone", () => {
  it.each([
    [400, "Coloană cămară 1 ușă"],
    [499, "Coloană cămară 1 ușă"],
    [500, "Coloană cămară 2 uși"],
    [600, "Coloană cămară 2 uși"],
    [800, "Coloană cămară 2 uși"],
  ])("names a %s mm pantry %s", (widthMm, label) => {
    expect(describeBodyLabelAt(definitionOf(PANTRY_ID), widthMm)).toBe(label);
  });

  // ADR 0033's mechanism, not a second copy of it: the count in the name is the same function the
  // builder is handed. A row that appended a literal would pass the table above and fail here.
  it("appends exactly what `deriveDoorCount` answers, over the whole bound", () => {
    for (const widthMm of definitionOf(PANTRY_ID).sizesMm ?? []) {
      const doors = deriveDoorCount(widthMm);
      expect(describeBodyLabelAt(definitionOf(PANTRY_ID), widthMm)).toContain(
        `${String(doors)} `,
      );
    }
  });

  // The generic name is what a body with no settled width is called, and the row still has one.
  it("names the row itself without a count", () => {
    expect(definitionOf(PANTRY_ID).label).toBe("Coloană cămară");
  });
});

describe("criterion 3: the pantry's width section is a stepper, not chips", () => {
  // ADR 0035 decision 3's discriminator, read where the panel reads it: `minMm < maxMm` on the
  // ranges `columnWidthChoices` publishes. The panel's `isSteppedColumn` takes this exact array.
  it("publishes one continuous range, 400 to 800", () => {
    expect(resolveWidthRangesMm(insertableOf(PANTRY_ID))).toEqual([
      { minMm: 400, maxMm: 800 },
    ]);
  });

  it("publishes that range to the panel through the selected column", () => {
    const world = pantryWorldAt(600);
    const choices = columnWidthChoices({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: "only" },
    });

    expect(choices?.widthRangesMm).toEqual([{ minMm: 400, maxMm: 800 }]);
    expect(
      choices?.widthRangesMm.some((range) => range.minMm < range.maxMm),
    ).toBe(true);
  });

  // The three appliance columns are the other side of the same discriminator, and asserting them
  // here is what makes the pantry's answer a distinction rather than a constant.
  it.each(APPLIANCE_COLUMN_IDS)("leaves %s a degenerate range", (buildId) => {
    const ranges = resolveWidthRangesMm(insertableOf(buildId));

    expect(ranges.length).toBeGreaterThan(0);
    for (const range of ranges) expect(range.minMm).toBe(range.maxMm);
  });
});

describe("criterion 4: the three appliance columns are untouched", () => {
  it.each(APPLIANCE_COLUMN_IDS)(
    "keeps %s fixed at its own width",
    (buildId) => {
      const definition = definitionOf(buildId);

      expect(definition.fixedWidth).toBe(true);
      expect(definition.doorCountFollowsWidth).toBeUndefined();
    },
  );

  // §11 row 5's own shape for a column built around an appliance: every width but its own is
  // refused. Swept rather than sampled, because "fixed" is a claim about the whole continuum.
  it.each(APPLIANCE_COLUMN_IDS)(
    "refuses every other width for %s",
    (buildId) => {
      const body = insertableOf(buildId);
      const own = new Set(definitionOf(buildId).sizesMm ?? []);

      expect(own.size).toBeGreaterThan(0);
      for (let widthMm = 200; widthMm <= 900; widthMm += 1) {
        expect([buildId, widthMm, acceptsWidthMm(body, widthMm)]).toEqual([
          buildId,
          widthMm,
          own.has(widthMm),
        ]);
      }
    },
  );

  // The pantry against the same sweep, so the two answers are produced by one predicate.
  it("accepts the whole 400–800 continuum for the pantry and nothing outside it", () => {
    const body = insertableOf(PANTRY_ID);

    for (let widthMm = 200; widthMm <= 900; widthMm += 1) {
      expect([widthMm, acceptsWidthMm(body, widthMm)]).toEqual([
        widthMm,
        widthMm >= 400 && widthMm <= 800,
      ]);
    }
  });
});

describe("ADR 0048: the seeded pantry the owner actually taps", () => {
  // Report item 8 was written about `p6` — the one pantry the shipped kitchen contains — and the
  // catalogue row alone does not reach it: `resolveResizableBody` reads `fixedWidth` off the
  // **record**, so the fixture's `tall-pantry-600` had to be flipped as well (owner, 2026-09-01).
  // Asserted through the command rather than through the flag, because the flag is the mechanism
  // and the resize is the decision.
  it("resizes p6 from 600 to 500, and to each end of its bound", () => {
    for (const widthMm of [400, 500, 550]) {
      const result = resizeTo(seededKitchen(), "p6", widthMm);

      expect([widthMm, result.ok]).toEqual([widthMm, true]);
      if (!result.ok) continue;
      expect(
        result.design.placements.find((one) => one.id === "p6")?.body.widthMm,
      ).toBe(widthMm);
    }
  });

  it("publishes the 400–800 stepper on p6 rather than one fixed chip", () => {
    const world = seededKitchen();
    const choices = columnWidthChoices({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: "p6" },
    });

    expect(choices?.notResizable).toBeUndefined();
    expect(choices?.widthRangesMm).toEqual([{ minMm: 400, maxMm: 800 }]);
    expect(choices?.currentWidthMm).toBe(600);
  });

  // **The §5.4 consequence the owner accepted, exercised rather than left to be discovered.** A
  // resizable pantry is a width *donor*: shrinking it vacates a strip that becomes an empty column,
  // and that column is what funds a neighbour's growth. Both halves are asserted, because the donor
  // half is the one that is new and the recipient half is what makes it worth having.
  it("hands the width it frees to the space beside it, and takes width back from a cleared neighbour", () => {
    const shrunk = resizeTo(seededKitchen(), "p6", 400);
    expect(shrunk.ok).toBe(true);
    if (!shrunk.ok) return;

    // The 200 mm the shrink vacated is a column of its own now — the empty space §5.4 spends. The
    // pantry's own column re-keys from `B|1.80` to `B|1.70` because ADR 0031 moves the whole column
    // rather than trimming one edge of it, so the freed strip is 1.90–2.10 and keys at its centre.
    expect(shrunk.effect.columns.get("B|1.70")?.w).toBeCloseTo(0.4, 6);
    expect(shrunk.effect.columns.get("B|2.00")?.w).toBeCloseTo(0.2, 6);

    // And the reverse: clearing the fridge column next door funds a growth the load census refuses.
    const world = seededKitchen();
    expect(resizeTo(world, "p6", 800).ok).toBe(false);
    expect(resizeTo(clearBodies(world, ["p7", "p24"]), "p6", 800).ok).toBe(
      true,
    );
  });

  // The column moves as one member set (ADR 0031): the wall cabinet above the pantry was immovable
  // only because the pantry under it was, and it must follow the pantry rather than be left behind.
  it("moves p23 above it to the same width", () => {
    const result = resizeTo(seededKitchen(), "p6", 500);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const id of ["p6", "p23"]) {
      expect([
        id,
        result.design.placements.find((one) => one.id === id)?.body.widthMm,
      ]).toEqual([id, 500]);
    }
  });
});
