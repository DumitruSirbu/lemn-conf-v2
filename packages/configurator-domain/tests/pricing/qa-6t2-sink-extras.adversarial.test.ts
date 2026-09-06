// **Adversarial QA for wave 6T2's priced extras** — what `sink-extras.test.ts` establishes with two
// sinks, sampled here across a swept count, and the book faults it does not reach.
//
// Three things are being attacked.
//
// **The per-sink count, past the case that can hide a de-duplication.** Two sinks under one host
// distinguish *per sink* from *per kitchen*; they do not distinguish it from *per sink, capped at
// two*, or from any other arithmetic that happens to answer two. A swept count does.
//
// **Every id collision, not only against a cabinet rule.** `listRuleIds` sweeps four families now,
// so an accessory id can collide with a **tier's** id or with the **other accessory's** — neither of
// which the shipped cases reach, and the second of which no other family can even express.
//
// **The zero that must never be published**, asserted as a property over every design below rather
// than at the two designs that happen to earn nothing.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import type { Design, DesignPlacement } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  ACCESSORY_IDS,
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

function quantityOf(
  priced: PricedDesign,
  accessoryId: AccessoryId,
): number | undefined {
  return accessoryLinesOf(priced).find(
    (line) => line.accessoryId === accessoryId,
  )?.quantity;
}

function rateOf(accessoryId: AccessoryId): number {
  return BOOK.accessories[accessoryId].perUnitMinor;
}

function placement(
  id: string,
  buildId: string,
  at: {
    readonly alongMm: number;
    readonly y0Mm: number;
    readonly widthMm: number;
    readonly heightMm: number;
  },
): DesignPlacement {
  return {
    id,
    wall: "A",
    alongMm: at.alongMm,
    y0Mm: at.y0Mm,
    body: { buildId, widthMm: at.widthMm, heightMm: at.heightMm },
  };
}

/** One wall cabinet wide enough to stand over every sink the sweep below places. Its span is
 *  900–2900, and each sink is placed inside it, so **all** of them resolve to this one host — which
 *  is the case a de-duplicating implementation answers `1` for however many sinks there are. */
const SHARED_HOST = placement("host", "wall-2door-800", {
  alongMm: 1_900,
  y0Mm: 1_500,
  widthMm: 2_000,
  heightMm: 700,
});

const MOST_SINKS_SWEPT = 6;

function sinksUnderTheSharedHost(count: number): readonly DesignPlacement[] {
  return Array.from({ length: count }, (_unused, index) =>
    placement(`sink-${String(index)}`, "base-sink-800", {
      alongMm: 1_000 + index * 300,
      y0Mm: 0,
      widthMm: 200,
      heightMm: 820,
    }),
  );
}

/**
 * **Owner ruling, 2026-09-04: the rule is applied once per sink and never once per kitchen**, even
 * where every rack resolves to the same wall cabinet. De-duplication was the recommendation on
 * record and the owner ruled against it.
 *
 * Swept rather than sampled at two, because two is the count a de-duplication *by host* and a cap
 * *at two* and the right rule all agree on for a design with two hosts — and the fixture that makes
 * the ruling load-bearing has **one** host and many sinks.
 */
describe("the count is the number of sinks, whatever they resolve to", () => {
  propertyTest.prop([fc.integer({ min: 1, max: MOST_SINKS_SWEPT })])(
    "bills that many covers and that many racks under one shared cabinet",
    (sinkCount) => {
      const priced = priceOrFail(
        designOf([SHARED_HOST, ...sinksUnderTheSharedHost(sinkCount)]),
      );

      expect(quantityOf(priced, "sinkProtectiveCover")).toBe(sinkCount);
      expect(quantityOf(priced, "dishDryingRack")).toBe(sinkCount);
    },
  );

  /** The amounts follow the count linearly, so nothing bulk-discounts, caps or squares it. Read as
   *  quantity times the book's own rate, never as a typed magnitude. */
  propertyTest.prop([fc.integer({ min: 1, max: MOST_SINKS_SWEPT })])(
    "charges each line its own count times the book's rate",
    (sinkCount) => {
      const priced = priceOrFail(
        designOf([SHARED_HOST, ...sinksUnderTheSharedHost(sinkCount)]),
      );

      for (const line of accessoryLinesOf(priced)) {
        expect([line.accessoryId, line.amountMinor]).toEqual([
          line.accessoryId,
          sinkCount * rateOf(line.accessoryId as AccessoryId),
        ]);
      }
    },
  );

  /** The two counts come apart the moment the sinks do not share a fate: every sink is billed a
   *  cover, and only the ones standing under a cabinet are billed a rack. */
  propertyTest.prop([
    fc.integer({ min: 1, max: 3 }),
    fc.integer({ min: 1, max: 3 }),
  ])(
    "bills a cover for every sink and a rack only for the hosted ones",
    (hosted, stranded) => {
      const strandedSinks = Array.from({ length: stranded }, (_unused, index) =>
        placement(`stranded-${String(index)}`, "base-sink-800", {
          alongMm: 4_000 + index * 300,
          y0Mm: 0,
          widthMm: 200,
          heightMm: 820,
        }),
      );
      const priced = priceOrFail(
        designOf([
          SHARED_HOST,
          ...sinksUnderTheSharedHost(hosted),
          ...strandedSinks,
        ]),
      );

      expect(quantityOf(priced, "sinkProtectiveCover")).toBe(hosted + stranded);
      expect(quantityOf(priced, "dishDryingRack")).toBe(hosted);
    },
  );
});

/**
 * **No published accessory line is ever empty**, asserted over every design this file builds rather
 * than at the two that earn nothing. A zero renders *inclus* in the breakdown, and 6B's rule holds
 * in both directions: omission never means *included*, and a zero never means *missing*.
 */
describe("a published accessory line always bills something", () => {
  const EVERY_SHAPE: readonly (readonly DesignPlacement[])[] = [
    [],
    [SHARED_HOST],
    [...sinksUnderTheSharedHost(1)],
    [SHARED_HOST, ...sinksUnderTheSharedHost(1)],
    [SHARED_HOST, ...sinksUnderTheSharedHost(4)],
    [...KITCHEN_L_DESIGN.placements],
  ];

  it.each(EVERY_SHAPE.map((placements, index) => [index, placements] as const))(
    "design %i publishes no zero-quantity and no zero-amount accessory line",
    (_index, placements) => {
      for (const line of accessoryLinesOf(priceOrFail(designOf(placements)))) {
        expect(line.quantity).toBeGreaterThan(0);
        expect(line.amountMinor).toBeGreaterThan(0);
      }
    },
  );

  /** A design with no sink publishes **no accessory line at all** — not one, not a zeroed pair. */
  it("publishes no accessory line for a kitchen holding no sink", () => {
    const noSink = placement("drawers", "base-drawer3-600", {
      alongMm: 1_300,
      y0Mm: 0,
      widthMm: 600,
      heightMm: 820,
    });

    expect(accessoryLinesOf(priceOrFail(designOf([noSink])))).toEqual([]);
  });
});

/**
 * **`listRuleIds` sweeps four families, so a collision anywhere in the book is
 * `INVALID_PRICE_BOOK`.** The shipped case collides an accessory against a cabinet rule; these are
 * the collisions it does not reach — against a **tier**, whose ids come from two other families, and
 * against the **other accessory**, which is a collision only the accessory sweep can catch at all.
 */
describe("an accessory id colliding anywhere in the book refuses it", () => {
  function withAccessoryRuleId(
    accessoryId: AccessoryId,
    ruleId: string,
  ): PriceBook {
    return {
      ...BOOK,
      accessories: {
        ...BOOK.accessories,
        [accessoryId]: { ...BOOK.accessories[accessoryId], ruleId },
      },
    };
  }

  function refusalOf(book: PriceBook): { code: string; id?: string } {
    const result = priceDesign({
      design: KITCHEN_L_DESIGN,
      catalog: CATALOG,
      book,
      pricingVersion: book.version,
    });
    if (result.ok) throw new Error("expected the book to be refused");
    return result.failure;
  }

  it.each(ACCESSORY_IDS)(
    "refuses a %s rule wearing a hardware tier's rule id",
    (accessoryId) => {
      const tier = BOOK.hardware.tiers[0];
      if (!tier) throw new Error("the book offers no hardware tier");

      expect(
        refusalOf(withAccessoryRuleId(accessoryId, tier.ruleId)),
      ).toMatchObject({ code: "INVALID_PRICE_BOOK", id: tier.ruleId });
    },
  );

  it.each(ACCESSORY_IDS)(
    "refuses a %s rule wearing a material tier's rule id",
    (accessoryId) => {
      const tier = BOOK.material.tiers[0];
      if (!tier) throw new Error("the book offers no material tier");

      expect(
        refusalOf(withAccessoryRuleId(accessoryId, tier.ruleId)),
      ).toMatchObject({ code: "INVALID_PRICE_BOOK", id: tier.ruleId });
    },
  );

  /** Two accessories sharing one id — a collision **inside** the family, which only the accessory
   *  sweep can see. Refused before any line is published, so no line traces to a rule id that names
   *  two rules. */
  it("refuses a book whose two accessories share one rule id", () => {
    const shared = BOOK.accessories.sinkProtectiveCover.ruleId;

    expect(
      refusalOf(withAccessoryRuleId("dishDryingRack", shared)),
    ).toMatchObject({ code: "INVALID_PRICE_BOOK", id: shared });
  });

  /** The refusal is a property of the **book**, not of the design: a kitchen earning no accessory at
   *  all is refused by the same collided book, because the sweep runs before any quantity is
   *  counted. */
  it("refuses the collided book even for a kitchen that earns no accessory", () => {
    const noSink = placement("drawers", "base-drawer3-600", {
      alongMm: 1_300,
      y0Mm: 0,
      widthMm: 600,
      heightMm: 820,
    });
    const tier = BOOK.hardware.tiers[0];
    if (!tier) throw new Error("the book offers no hardware tier");

    const result = priceDesign({
      design: designOf([noSink]),
      catalog: CATALOG,
      book: withAccessoryRuleId("sinkProtectiveCover", tier.ruleId),
      pricingVersion: BOOK.version,
    });

    expect(result.ok).toBe(false);
  });
});

/**
 * **Where the line order claim is actually load-bearing.** `price-design.test.ts` pins
 * placements → hardware → material → accessories on the seeded kitchen, which earns **both**
 * accessories. A design earning exactly one, and one earning none, are the shapes in which an
 * implementation that interleaved or appended conditionally would still pass that pin.
 */
describe("the line order holds however many accessories the design earns", () => {
  function kindsOf(placements: readonly DesignPlacement[]): readonly string[] {
    return priceOrFail(designOf(placements)).lines.map((line) => line.kind);
  }

  it("puts the one accessory a hostless sink earns last", () => {
    const strandedSink = placement("sink", "base-sink-800", {
      alongMm: 1_300,
      y0Mm: 0,
      widthMm: 800,
      heightMm: 820,
    });

    expect(kindsOf([strandedSink])).toEqual([
      "cabinet",
      "hardware",
      "material",
      "accessory",
    ]);
  });

  it("ends at the material line when the design earns none", () => {
    const noSink = placement("drawers", "base-drawer3-600", {
      alongMm: 1_300,
      y0Mm: 0,
      widthMm: 600,
      heightMm: 820,
    });

    expect(kindsOf([noSink])).toEqual(["cabinet", "hardware", "material"]);
  });

  /** Both accessories, in the book's own declared order — so the two lines cannot swap places
   *  between renders and a breakdown reads the same way twice. */
  it("publishes the two accessory lines in ACCESSORY_IDS' order", () => {
    const priced = priceOrFail(
      designOf([SHARED_HOST, ...sinksUnderTheSharedHost(2)]),
    );

    expect(accessoryLinesOf(priced).map((line) => line.accessoryId)).toEqual([
      ...ACCESSORY_IDS,
    ]);
  });
});

/**
 * **What moving the sink out from under its cabinet does to the total, pinned rather than left to be
 * discovered.**
 *
 * Wave 6T2 made the running total **reducible by an edit that breaks the kitchen**: pushing the sink
 * past the end of its wall takes it out from under every wall cabinet, so the rack line is legitimately
 * omitted and the figure falls by that line — while the body itself is still priced in full.
 * ADR 0065 decision 6 rejected *"excluding non-fitting bodies from the total"* on the grounds that
 * *"the price would silently drop and read as the kitchen getting cheaper at the moment part of it
 * became unbuildable"*, and this is a smaller instance of that shape arriving by a different route.
 *
 * It is **pinned, not failed**: a rack with no cabinet to hang in is a rack the customer is not
 * getting, and billing one would be the worse error. Three shipped overflow blocks changed their
 * fixture to avoid the sink for exactly this reason, and this is the assertion that makes the
 * behaviour they stepped around visible in one place.
 */
describe("a sink pushed past its wall keeps its cover and loses its rack", () => {
  const PAST_EVERY_WALL_MM = 9_000;

  function seededWithTheSinkPushedOut(): Design {
    return {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((candidate) =>
        candidate.id === "p0"
          ? { ...candidate, alongMm: candidate.alongMm + PAST_EVERY_WALL_MM }
          : candidate,
      ),
    };
  }

  it("is the seeded sink that is moved, derived rather than assumed", () => {
    const sink = KITCHEN_L_DESIGN.placements.find(
      (candidate) => candidate.id === "p0",
    );

    expect(sink?.body.buildId).toBe("base-sink-800");
  });

  it("still bills the cover, and no longer bills the rack", () => {
    const pushedOut = priceOrFail(seededWithTheSinkPushedOut());

    expect(quantityOf(pushedOut, "sinkProtectiveCover")).toBe(1);
    expect(quantityOf(pushedOut, "dishDryingRack")).toBeUndefined();
  });

  /** The cabinet line for the body that does not fit survives untouched — ADR 0065 decision 6's
   *  actual guarantee — and what the total loses is exactly one rack and nothing else. */
  it("drops exactly the rack's amount and keeps every placement line", () => {
    const seeded = priceOrFail(KITCHEN_L_DESIGN);
    const pushedOut = priceOrFail(seededWithTheSinkPushedOut());

    expect(
      pushedOut.lines.filter((line) => line.kind === "cabinet"),
    ).toHaveLength(
      seeded.lines.filter((line) => line.kind === "cabinet").length,
    );
    expect(seeded.totalMinor - pushedOut.totalMinor).toBe(
      rateOf("dishDryingRack"),
    );
  });
});
