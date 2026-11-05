// A count the usage read answers must equal `usesItem` over the designs that are saved, for any items, any designs and any
// active book. The probes are built on the server; a reader that evaluates them over real designs (the walked ones through
// their own predicate, the two SQL ones through a model of their condition) is held against the domain's predicate at the
// design's own depth. The model of the two SQL conditions is a model, not the SQL: the live reader test runs the SQL.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  cabinetDepthMmOf,
  distinctItemsInOrder,
  type ItemRef,
} from "@lemnaria/configurator-domain";

import { countItemUsage } from "@/lib/server/price-dashboard/item-usage-read";

import {
  aBookRecipe,
  aDesignRecipe,
  bookOf,
  designOf,
  HARDWARE_TIERS,
  LINKED_IDS,
  MATERIAL_TIERS,
  oracleCount,
  readerOver,
  ROW_WITH_SEEDED_EQUIVALENT,
  ROWS,
  someItems,
  TIER_THE_BOOK_LACKS,
} from "../../../support/usage-parity-model";

// ---------------------------------------------------------------------------------------------------------------------

describe("the generators", () => {
  const recipes = fc.sample(aDesignRecipe, { numRuns: 400, seed: 7 });

  it("reach a 700 mm kitchen, a kitchen that names no tier, and one whose tier the book lacks", () => {
    const designs = recipes.map(designOf);

    expect(designs.some((design) => cabinetDepthMmOf(design) === 700)).toBe(
      true,
    );
    expect(
      designs.some((design) => design.settings?.materialTierId === undefined),
    ).toBe(true);
    expect(
      designs.some(
        (design) => design.settings?.materialTierId === TIER_THE_BOOK_LACKS,
      ),
    ).toBe(true);
  });

  it("have a row that a seeded body is priced as, so a linked accessory can be earned through an equivalent", () => {
    expect(ROW_WITH_SEEDED_EQUIVALENT).toBeDefined();
    expect(ROWS).toContain(ROW_WITH_SEEDED_EQUIVALENT);
  });
});

describe("the count of an item, whatever the items, the designs and the active book", () => {
  it("is the number of saved designs usesItem says use it, one entry per distinct item in the domain's order", async () => {
    const tally = {
      positive: 0,
      zero: 0,
      deep: 0,
      fallbackOfNamelessDesign: 0,
      linked: 0,
    };

    await fc.assert(
      fc.asyncProperty(
        fc.array(aDesignRecipe, { maxLength: 8 }),
        aBookRecipe,
        someItems,
        async (designRecipes, bookRecipe, items) => {
          const designs = designRecipes.map(designOf);
          const book = bookOf(bookRecipe);

          const { usage } = await countItemUsage(items, {
            stores: { usage: readerOver(designs) },
            book,
          });

          const distinct = distinctItemsInOrder(items);
          expect(usage.map(({ item }) => item)).toEqual(distinct);
          for (const { item, designCount } of usage) {
            const expected = oracleCount(designs, item, book);
            fc.pre(expected !== undefined);
            expect(designCount, JSON.stringify(item)).toBe(expected);
            if (designCount > 0) tally.positive += 1;
            else tally.zero += 1;
            if (
              item.kind === "accessory" &&
              LINKED_IDS.some((id) => id === item.accessoryId) &&
              designCount > 0
            ) {
              tally.linked += 1;
            }
            if (
              (item.kind === "material" || item.kind === "hardware") &&
              designCount > 0 &&
              designs.some(
                (design) =>
                  design.settings?.[
                    item.kind === "material"
                      ? "materialTierId"
                      : "hardwareTierId"
                  ] === undefined,
              )
            ) {
              tally.fallbackOfNamelessDesign += 1;
            }
          }
          if (designs.some((design) => cabinetDepthMmOf(design) === 700)) {
            tally.deep += 1;
          }
        },
      ),
      { numRuns: 600, seed: 20_261_105 },
    );

    expect(tally.positive).toBeGreaterThan(0);
    expect(tally.zero).toBeGreaterThan(0);
    expect(tally.deep).toBeGreaterThan(0);
    expect(tally.linked).toBeGreaterThan(0);
    expect(tally.fallbackOfNamelessDesign).toBeGreaterThan(0);
  });

  it("counts a 700 mm kitchen for the linked accessory of a row it places, as a 600 mm one is", async () => {
    const row = ROW_WITH_SEEDED_EQUIVALENT;
    if (row === undefined) throw new Error("no seeded equivalent");
    const book = bookOf({
      materialDefault: MATERIAL_TIERS[0] ?? "",
      hardwareDefault: HARDWARE_TIERS[0] ?? "",
      linked: [{ id: "linked-a", row }],
    });
    const designs = [600 as const, 700 as const].map((depthMm) =>
      designOf({
        depthMm,
        hasSettings: true,
        materialTierId: undefined,
        hardwareTierId: undefined,
        kitchenFinish: undefined,
        kitchenHandle: undefined,
        cabinetFinish: undefined,
        removedPlacementIds: [],
      }),
    );
    const item: ItemRef = { kind: "accessory", accessoryId: "linked-a" };

    const {
      usage: [usage],
    } = await countItemUsage([item], {
      stores: { usage: readerOver(designs) },
      book,
    });

    expect(oracleCount(designs, item, book)).toBe(2);
    expect(usage?.designCount).toBe(2);
  });
});
