// Wave 6T2: the two sink extras, priced.
//
// ADR 0070 decision 4 gives a sink base an aluminium protective cover — always present, never
// toggled — and a dish drying rack in the wall cabinet above it. ADR 0092 decision 11 makes both
// `accessory` lines: book-declared, untiered, counted **per sink**, and **omitted rather than
// zeroed** where the design earns none.
//
// **The omission is the criterion this file exists for.** A zero-amount line is not the absence of a
// line: the breakdown renders a zero as *inclus*, so publishing one would tell a customer that a
// drying rack they are not getting is included in the price. 6B's rule holds in both directions —
// omission never means *included*, and a zero never means *missing*.
import { describe, expect, it } from "vitest";

import type { Design, DesignPlacement } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  ACCESSORY_IDS,
  listRuleIds,
  type AccessoryId,
  type PriceBook,
} from "../../src/pricing/price-book.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import type {
  AccessoryPriceLine,
  PricedDesign,
} from "../../src/pricing/price-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const BOOK = SAMPLE_PRICE_BOOK;

function designOf(placements: readonly DesignPlacement[]): Design {
  return { ...KITCHEN_L_DESIGN, placements: [...placements] };
}

function priceOrFail(design: Design, book: PriceBook = BOOK): PricedDesign {
  const result = priceDesign({
    design,
    catalog: CATALOG,
    book,
    pricingVersion: book.version,
  });
  if (!result.ok) throw new Error(`design refused: ${result.failure.code}`);
  return result.priced;
}

function accessoryLinesOf(priced: PricedDesign): readonly AccessoryPriceLine[] {
  return priced.lines.filter(
    (line): line is AccessoryPriceLine => line.kind === "accessory",
  );
}

function placement(
  id: string,
  buildId: string,
  at: {
    readonly wall?: "A" | "B";
    readonly alongMm: number;
    readonly y0Mm: number;
    readonly widthMm: number;
    readonly heightMm: number;
  },
): DesignPlacement {
  return {
    id,
    wall: at.wall ?? "A",
    alongMm: at.alongMm,
    y0Mm: at.y0Mm,
    body: { buildId, widthMm: at.widthMm, heightMm: at.heightMm },
  };
}

const SINK = placement("sink", "base-sink-800", {
  alongMm: 1_300,
  y0Mm: 0,
  widthMm: 800,
  heightMm: 820,
});

const WALL_CABINET_OVER_THE_SINK = placement("host", "wall-2door-800", {
  alongMm: 1_300,
  y0Mm: 1_500,
  widthMm: 800,
  heightMm: 700,
});

const NO_SINK_AT_ALL = placement("drawers", "base-drawer3-600", {
  alongMm: 1_300,
  y0Mm: 0,
  widthMm: 600,
  heightMm: 820,
});

/** The two per-unit amounts, read off the book rather than typed. They are the owner's own figures
 *  (ADR 0070 decision 4: ≈200 MDL and ≈400) and could be written as literals here, but reading them
 *  is what keeps every expectation below a statement about the *rule* — quantity times rate — rather
 *  than about the magnitude. The one place a magnitude is pinned is the `60_000` reconciliation
 *  against ADR 0070's own flat column, which is the whole point of that assertion. */
function rateOf(accessoryId: AccessoryId): number {
  return BOOK.accessories[accessoryId].perUnitMinor;
}

describe("a sink base is always billed a protective cover", () => {
  it("bills one cover for the seeded kitchen's one sink", () => {
    const cover = accessoryLinesOf(priceOrFail(KITCHEN_L_DESIGN)).find(
      (line) => line.accessoryId === "sinkProtectiveCover",
    );

    expect(cover).toMatchObject({
      kind: "accessory",
      accessoryId: "sinkProtectiveCover",
      lineId: "accessory:sinkProtectiveCover",
      ruleId: BOOK.accessories.sinkProtectiveCover.ruleId,
      quantity: 1,
      unitAmountMinor: rateOf("sinkProtectiveCover"),
      amountMinor: rateOf("sinkProtectiveCover"),
    });
  });

  /** **Never toggled** (ADR 0070 decision 4): no setting, no design field, no control. The cover is
   *  billed on a sink whose placement records a handle mode and on one that records none, and the
   *  two whole-kitchen selections move it not at all. */
  it("bills the same cover whatever the design or the caller chooses", () => {
    const amounts = [
      undefined,
      { hardwareTierId: "hardware.premium" },
      { materialTierId: "material.veneer" },
      {
        hardwareTierId: "hardware.soft-close",
        materialTierId: "material.painted-mdf",
      },
    ].map((selections) => {
      const result = priceDesign({
        design: designOf([SINK, WALL_CABINET_OVER_THE_SINK]),
        catalog: CATALOG,
        book: BOOK,
        pricingVersion: BOOK.version,
        ...(selections === undefined ? {} : { selections }),
      });
      if (!result.ok) throw new Error(`design refused: ${result.failure.code}`);
      return accessoryLinesOf(result.priced).map((line) => line.amountMinor);
    });

    expect(new Set(amounts.map((pair) => pair.join("+")))).toHaveLength(1);
  });

  it("bills no cover at all for a kitchen with no sink", () => {
    expect(accessoryLinesOf(priceOrFail(designOf([NO_SINK_AT_ALL])))).toEqual(
      [],
    );
  });
});

describe("the rack is billed only where it has somewhere to hang", () => {
  it("bills a rack for the seeded kitchen, whose sink stands under a wall cabinet", () => {
    const rack = accessoryLinesOf(priceOrFail(KITCHEN_L_DESIGN)).find(
      (line) => line.accessoryId === "dishDryingRack",
    );

    expect(rack).toMatchObject({
      accessoryId: "dishDryingRack",
      quantity: 1,
      amountMinor: rateOf("dishDryingRack"),
    });
  });

  /** **No wall cabinet above the sink means no rack line — not a zero-amount one.** This is asserted
   *  as the absence of the line rather than as an amount, because the two are exactly what must not
   *  be confused: the breakdown renders a zero as *inclus*. */
  it("publishes no rack line at all for a sink with nothing above it", () => {
    const priced = priceOrFail(designOf([SINK]));

    expect(accessoryLinesOf(priced).map((line) => line.accessoryId)).toEqual([
      "sinkProtectiveCover",
    ]);
    expect(
      priced.lines.some(
        (line) => line.kind === "accessory" && line.amountMinor === 0,
      ),
    ).toBe(false);
  });
});

/** Owner ruling, 2026-09-04, against the recommendation on record: the rule is applied **once per
 *  sink** and never once per kitchen, **even where both racks resolve to the same wall cabinet**. */
describe("two sinks are billed two covers and two racks", () => {
  const SECOND_SINK = placement("sink-b", "base-sink-800", {
    alongMm: 1_500,
    y0Mm: 0,
    widthMm: 400,
    heightMm: 820,
  });

  it("bills both extras twice under one shared wall cabinet", () => {
    const priced = priceOrFail(
      designOf([SINK, SECOND_SINK, WALL_CABINET_OVER_THE_SINK]),
    );

    expect(
      accessoryLinesOf(priced).map((line) => [
        line.accessoryId,
        line.quantity,
        line.amountMinor,
      ]),
    ).toEqual([
      ["sinkProtectiveCover", 2, 2 * rateOf("sinkProtectiveCover")],
      ["dishDryingRack", 2, 2 * rateOf("dishDryingRack")],
    ]);
  });

  it("bills two covers and one rack where only one sink has a cabinet above it", () => {
    const stranded = placement("stranded", "base-sink-800", {
      alongMm: 3_000,
      y0Mm: 0,
      widthMm: 800,
      heightMm: 820,
    });
    const priced = priceOrFail(
      designOf([SINK, stranded, WALL_CABINET_OVER_THE_SINK]),
    );

    expect(
      accessoryLinesOf(priced).map((line) => [line.accessoryId, line.quantity]),
    ).toEqual([
      ["sinkProtectiveCover", 2],
      ["dishDryingRack", 1],
    ]);
  });
});

describe("the accessory lines are book data, and the book is swept for them", () => {
  /** **`listRuleIds` sweeps the accessories**, so two rules sharing an id *anywhere* in the book is
   *  `INVALID_PRICE_BOOK` rather than a rule family nobody checked (ADR 0092 decision 11). */
  it("includes both accessory rule ids in the book's own sweep", () => {
    expect(listRuleIds(BOOK)).toEqual(
      expect.arrayContaining([
        BOOK.accessories.sinkProtectiveCover.ruleId,
        BOOK.accessories.dishDryingRack.ruleId,
      ]),
    );
    expect(new Set(listRuleIds(BOOK)).size).toBe(listRuleIds(BOOK).length);
  });

  it.each(ACCESSORY_IDS)(
    "refuses a book whose %s rule repeats a cabinet rule's id",
    (accessoryId) => {
      const firstCabinetRule = BOOK.cabinetRules[0];
      if (!firstCabinetRule) throw new Error("the book prices no cabinet");
      const collided: PriceBook = {
        ...BOOK,
        accessories: {
          ...BOOK.accessories,
          [accessoryId]: {
            ...BOOK.accessories[accessoryId],
            ruleId: firstCabinetRule.ruleId,
          },
        },
      };

      const result = priceDesign({
        design: KITCHEN_L_DESIGN,
        catalog: CATALOG,
        book: collided,
        pricingVersion: BOOK.version,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure).toMatchObject({
        code: "INVALID_PRICE_BOOK",
        id: firstCabinetRule.ruleId,
      });
    },
  );

  /** A line renders the book's own words, never a component's (ADR 0062's third prohibition). */
  it("carries the book's name and description onto the line", () => {
    for (const line of accessoryLinesOf(priceOrFail(KITCHEN_L_DESIGN))) {
      const rule = BOOK.accessories[line.accessoryId as AccessoryId];
      expect([line.name, line.description]).toEqual([
        rule.name,
        rule.description,
      ]);
    }
  });

  /** An accessory has no tier: nothing offers it at grades and no control selects it. */
  it("carries no tierId on an accessory line", () => {
    for (const line of accessoryLinesOf(priceOrFail(KITCHEN_L_DESIGN))) {
      expect("tierId" in line).toBe(false);
    }
  });

  /** A missing rule is a refusal, never a skipped line: skipping it would tell the customer they are
   *  not getting a cover they are. */
  it("refuses a book holding no rule for an accessory the design earns", () => {
    const { dishDryingRack, ...withoutTheRack } = BOOK.accessories;
    expect(dishDryingRack).toBeDefined();

    const result = priceDesign({
      design: KITCHEN_L_DESIGN,
      catalog: CATALOG,
      book: {
        ...BOOK,
        accessories: withoutTheRack as PriceBook["accessories"],
      },
      pricingVersion: BOOK.version,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toMatchObject({
      code: "INVALID_PRICE_BOOK",
      id: "dishDryingRack",
    });
  });

  /** The `null` case ADR 0062 seam 1 exists for: a book authored outside TypeScript multiplies to a
   *  perfectly exact `0`, which the breakdown renders *inclus*. Refused, naming the field. */
  it.each(ACCESSORY_IDS)(
    "refuses a %s rule whose per-unit amount is not a count of minor units",
    (accessoryId) => {
      const malformed = {
        ...BOOK,
        accessories: {
          ...BOOK.accessories,
          [accessoryId]: {
            ...BOOK.accessories[accessoryId],
            perUnitMinor: null,
          },
        },
      } as unknown as PriceBook;

      const result = priceDesign({
        design: KITCHEN_L_DESIGN,
        catalog: CATALOG,
        book: malformed,
        pricingVersion: BOOK.version,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe("INVALID_AMOUNT");
      expect(result.failure.detail).toContain("perUnitMinor");
    },
  );

  /** A line the customer would be paid to take. Every other published amount is guarded this way and
   *  an accessory is not exempt (QA 6B2). */
  it.each(ACCESSORY_IDS)("refuses a negative %s amount", (accessoryId) => {
    const negative: PriceBook = {
      ...BOOK,
      accessories: {
        ...BOOK.accessories,
        [accessoryId]: {
          ...BOOK.accessories[accessoryId],
          perUnitMinor: -1,
        },
      },
    };

    const result = priceDesign({
      design: KITCHEN_L_DESIGN,
      catalog: CATALOG,
      book: negative,
      pricingVersion: BOOK.version,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("INVALID_PRICE_BOOK");
  });
});

/**
 * **The third independent reconciliation against ADR 0070's own table** — after the hinge and drawer
 * columns, which `hardware-tier-reconciliation.test.ts` checks.
 *
 * The record publishes a flat *"Sink extras 600"*, **identical in all three tier columns**, and that
 * identity is the fact being asserted here: the extras sit **outside** the hardware tier rather than
 * inside it. `60_000` is a literal because it is the owner's own figure being reconciled against,
 * exactly as the hinge and drawer literals are.
 */
describe("the seeded design's extras total ADR 0070's flat sink column", () => {
  const ADR_0070_SINK_EXTRAS_MINOR = 60_000;

  it("bills 60 000 minor, and the same 60 000 at every hardware and material tier", () => {
    const totals = BOOK.hardware.tiers.flatMap((hardware) =>
      BOOK.material.tiers.map((material) => {
        const result = priceDesign({
          design: KITCHEN_L_DESIGN,
          catalog: CATALOG,
          book: BOOK,
          pricingVersion: BOOK.version,
          selections: {
            hardwareTierId: hardware.tierId,
            materialTierId: material.tierId,
          },
        });
        if (!result.ok)
          throw new Error(`design refused: ${result.failure.code}`);
        return accessoryLinesOf(result.priced).reduce(
          (sum, line) => sum + line.amountMinor,
          0,
        );
      }),
    );

    expect(totals).toHaveLength(9);
    expect(new Set(totals)).toEqual(new Set([ADR_0070_SINK_EXTRAS_MINOR]));
  });

  it("splits that column as one cover and one rack", () => {
    expect(rateOf("sinkProtectiveCover") + rateOf("dishDryingRack")).toBe(
      ADR_0070_SINK_EXTRAS_MINOR,
    );
  });
});
