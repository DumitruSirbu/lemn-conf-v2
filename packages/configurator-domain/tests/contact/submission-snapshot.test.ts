import { describe, expect, expectTypeOf, it } from "vitest";

import {
  canonicalSerializeDesign,
  DesignSchema,
  findOverflowingPlacementIds,
  KITCHEN_L_DESIGN,
  PRICE_BOOK_CURRENCY,
  priceDesign,
  pricedByWidth,
  snapshotSubmission,
  drawnButNotSupplied,
  type Design,
  type DesignPlacement,
  type PriceBook,
  type SubmissionRefusal,
  type SubmissionSnapshot,
  type SubmissionSnapshotRequest,
} from "../../src/index.js";

import {
  catalogOf,
  GENERATED_KITCHENS,
  placementIdOnWall,
  SAMPLE_BOOK,
  withABodyPastItsWall,
  type Kitchen,
} from "./support/submission-kitchens.js";

function requestFor(kitchen: Kitchen, book: PriceBook = SAMPLE_BOOK) {
  return {
    design: kitchen.design,
    catalog: kitchen.catalog,
    book,
    pricingVersion: book.version,
  };
}

function snapshotOf(request: SubmissionSnapshotRequest): SubmissionSnapshot {
  const result = snapshotSubmission(request);
  if (!result.ok) {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return result.snapshot;
}

function refusalOf(request: SubmissionSnapshotRequest): SubmissionRefusal {
  const result = snapshotSubmission(request);
  if (result.ok) throw new Error("expected a refusal");
  return result.refusal;
}

describe("the snapshot's document", () => {
  it("covers kitchens of every shape, so the properties below are not vacuous", () => {
    const shapes = new Set(GENERATED_KITCHENS.map((k) => k.design.room.shape));

    expect([...shapes].sort()).toEqual(["L", "U", "linear"]);
    expect(
      GENERATED_KITCHENS.every((k) => k.design.placements.length > 3),
    ).toBe(true);
  });

  describe.each(GENERATED_KITCHENS)("$name", (kitchen) => {
    it("parses as a design and serialises again to the same bytes", () => {
      const { document } = snapshotOf(requestFor(kitchen));

      const reparsed = DesignSchema.parse(JSON.parse(document));

      expect(canonicalSerializeDesign(reparsed)).toBe(document);
    });

    it("is the canonical form of the design it was taken from", () => {
      expect(snapshotOf(requestFor(kitchen)).document).toBe(
        canonicalSerializeDesign(kitchen.design),
      );
    });
  });

  it("is the same bytes however the design's keys were ordered", () => {
    const reversed = JSON.parse(
      JSON.stringify(KITCHEN_L_DESIGN, (_key, value: unknown) =>
        value !== null && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).reverse())
          : value,
      ),
    ) as Design;
    const kitchen = {
      name: "seeded",
      design: KITCHEN_L_DESIGN,
      catalog: catalogOf(KITCHEN_L_DESIGN),
    };

    expect(
      snapshotOf(requestFor({ ...kitchen, design: reversed })).document,
    ).toBe(snapshotOf(requestFor(kitchen)).document);
  });
});

describe("the snapshot's price is priceDesign's, through one call", () => {
  describe.each(GENERATED_KITCHENS)("$name", (kitchen) => {
    it("carries every line, the exact total and the book's identity as priceDesign returned them", () => {
      const direct = priceDesign({
        ...requestFor(kitchen),
        selections: kitchen.design.settings,
      });
      if (!direct.ok) throw new Error("expected the kitchen to price");

      const { priced } = snapshotOf(requestFor(kitchen));

      expect(priced).toEqual(direct.priced);
      expect(priced.totalMinor).toBe(direct.priced.totalMinor);
      expect(priced.lines.length).toBeGreaterThan(0);
      expect(priced).toMatchObject({
        currency: PRICE_BOOK_CURRENCY,
        pricingVersion: SAMPLE_BOOK.version,
        status: SAMPLE_BOOK.status,
        amountsProvisional: SAMPLE_BOOK.amountsProvisional,
      });
    });
  });

  it("prices at the whole-kitchen tier the design chose, not the book's default", () => {
    const chosen = SAMPLE_BOOK.material.tiers.find(
      (tier) => tier.tierId !== SAMPLE_BOOK.material.defaultTierId,
    );
    if (chosen === undefined)
      throw new Error("the sample book offers one material tier");
    const design: Design = {
      ...KITCHEN_L_DESIGN,
      settings: { ...KITCHEN_L_DESIGN.settings, materialTierId: chosen.tierId },
    };
    const kitchen = { name: "chosen", design, catalog: catalogOf(design) };

    const atChosen = snapshotOf(requestFor(kitchen)).priced.totalMinor;
    const atDefault = snapshotOf(
      requestFor({ ...kitchen, design: KITCHEN_L_DESIGN }),
    ).priced.totalMinor;

    expect(atChosen).not.toBe(atDefault);
  });
});

describe("the snapshot's total, added up by hand", () => {
  // The book is stated here. Two wall cabinets on wall A of the seeded room, 600 mm and 400 mm wide, both
  // fitting its 3560 mm wall. A wall cabinet carries two door leaves from 500 mm wide (one below), and a
  // leaf carries two hinges (ADR 0092 decision 2).
  const WALL_CABINET_BASE_MINOR = 10_000;
  const WALL_CABINET_PER_MM_MINOR = 20;
  const PER_HINGE_MINOR = 1_000;
  const MATERIAL_MINOR = 7_500;

  const BOOK: PriceBook = {
    version: "hand-added",
    currency: PRICE_BOOK_CURRENCY,
    status: "estimate",
    amountsProvisional: true,
    cabinetRules: [
      {
        ruleId: "cabinet.wall-cabinet",
        buildId: "wall-cabinet",
        formula: pricedByWidth({
          baseMinor: WALL_CABINET_BASE_MINOR,
          perWidthMillimetreMinor: WALL_CABINET_PER_MM_MINOR,
        }),
      },
    ],
    hardware: {
      defaultTierId: "hardware.test",
      tiers: [
        {
          tierId: "hardware.test",
          ruleId: "hardware.test",
          name: "Test",
          description: "Hinges only.",
          perHingeMinor: PER_HINGE_MINOR,
          perDrawerMinor: 50_000,
          perPushToOpenMinor: 3_000,
        },
      ],
    },
    material: {
      defaultTierId: "material.test",
      tiers: [
        {
          tierId: "material.test",
          ruleId: "material.test",
          name: "Test",
          description: "Whole kitchen.",
          wholeKitchenMinor: MATERIAL_MINOR,
        },
      ],
    },
    accessories: {
      sinkProtectiveCover: {
        ruleId: "accessory.cover",
        name: "Cover",
        description: "Per sink.",
        perUnitMinor: 100,
      },
      dishDryingRack: {
        ruleId: "accessory.rack",
        name: "Rack",
        description: "Per sink.",
        perUnitMinor: 100,
      },
    },
  };

  function wallCabinet(
    id: string,
    alongMm: number,
    widthMm: number,
  ): DesignPlacement {
    return {
      id,
      wall: "A",
      alongMm,
      y0Mm: 1500,
      body: { buildId: "wall-cabinet", widthMm, heightMm: 700 },
    };
  }

  const DESIGN: Design = {
    ...KITCHEN_L_DESIGN,
    placements: [
      wallCabinet("wide", 300, 600),
      wallCabinet("narrow", 800, 400),
    ],
  };

  it("is 53 500 minor units", () => {
    // wide    600 mm: 10 000 + 20 x 600 =               22 000
    // narrow  400 mm: 10 000 + 20 x 400 =               18 000
    // hinges: wide has 2 leaves, narrow 1; 2 hinges each: (4 + 2) x 1 000 = 6 000
    // material, once for the kitchen:                    7 500
    // sum: 22 000 + 18 000 + 6 000 + 7 500 =            53 500
    const { priced } = snapshotOf({
      design: DESIGN,
      catalog: catalogOf(DESIGN),
      book: BOOK,
      pricingVersion: BOOK.version,
    });

    expect(priced.totalMinor).toBe(53_500);
    expect(priced.lines.map((line) => line.amountMinor)).toEqual([
      22_000, 18_000, 6_000, 7_500,
    ]);
  });

  it("carries the book's version, currency and what it says of itself, unrounded", () => {
    const { priced } = snapshotOf({
      design: DESIGN,
      catalog: catalogOf(DESIGN),
      book: BOOK,
      pricingVersion: BOOK.version,
    });

    expect(priced).toMatchObject({
      pricingVersion: "hand-added",
      currency: "MDL",
      status: "estimate",
      amountsProvisional: true,
      totalIsFlagged: false,
      overflowingPlacementIds: [],
    });
    expect(priced.totalMinor % 100_000).not.toBe(0);
  });

  it("refuses a kitchen of the same two cabinets when the book hands them to the customer", () => {
    const customerBook: PriceBook = {
      ...BOOK,
      cabinetRules: [
        {
          ruleId: "cabinet.wall-cabinet",
          buildId: "wall-cabinet",
          ...drawnButNotSupplied(),
        },
      ],
    };

    expect(
      refusalOf({
        design: DESIGN,
        catalog: catalogOf(DESIGN),
        book: customerBook,
        pricingVersion: customerBook.version,
      }),
    ).toEqual({ code: "NO_CABINET" });
  });
});

describe("the snapshot's refusals", () => {
  const PAST_THE_WALL_KITCHENS = [
    { wall: "A" as const, kitchen: GENERATED_KITCHENS[4] },
    { wall: "B" as const, kitchen: GENERATED_KITCHENS[4] },
    { wall: "C" as const, kitchen: GENERATED_KITCHENS[4] },
  ];

  it.each(PAST_THE_WALL_KITCHENS)(
    "names exactly the fit query's bodies for one pushed past wall $wall",
    ({ wall, kitchen }) => {
      if (kitchen === undefined) throw new Error("the U kitchen is generated");
      const moved = withABodyPastItsWall(kitchen.design, wall);

      const refusal = refusalOf(requestFor({ ...kitchen, design: moved }));

      expect(refusal).toEqual({
        code: "BODIES_PAST_WALL",
        placementIds: findOverflowingPlacementIds(moved),
      });
      expect(refusal).toMatchObject({
        placementIds: [placementIdOnWall(kitchen.design, wall)],
      });
    },
  );

  it("names every body past its wall, on all three walls at once", () => {
    const kitchen = GENERATED_KITCHENS[4];
    if (kitchen === undefined) throw new Error("the U kitchen is generated");
    const moved = (["A", "B", "C"] as const).reduce(
      (design, wall) => withABodyPastItsWall(design, wall),
      kitchen.design,
    );

    const refusal = refusalOf(requestFor({ ...kitchen, design: moved }));

    expect(refusal).toEqual({
      code: "BODIES_PAST_WALL",
      placementIds: findOverflowingPlacementIds(moved),
    });
    expect(findOverflowingPlacementIds(moved)).toHaveLength(3);
  });

  it("refuses a design with no body as NO_CABINET", () => {
    const design: Design = { ...KITCHEN_L_DESIGN, placements: [] };

    expect(
      refusalOf(
        requestFor({ name: "empty", design, catalog: catalogOf(design) }),
      ),
    ).toEqual({
      code: "NO_CABINET",
    });
  });

  it("refuses a price that cannot be computed as PRICING_FAILED", () => {
    const kitchen = GENERATED_KITCHENS[0];
    if (kitchen === undefined) throw new Error("a kitchen is generated");

    expect(
      refusalOf({ ...requestFor(kitchen), pricingVersion: "not-this-book" }),
    ).toEqual({ code: "PRICING_FAILED" });
  });

  it("puts a body past its wall before a price that cannot be computed", () => {
    const kitchen = GENERATED_KITCHENS[4];
    if (kitchen === undefined) throw new Error("the U kitchen is generated");
    const moved = withABodyPastItsWall(kitchen.design, "A");

    expect(
      refusalOf({
        ...requestFor({ ...kitchen, design: moved }),
        pricingVersion: "not-this-book",
      }),
    ).toMatchObject({ code: "BODIES_PAST_WALL" });
  });

  it("puts a design with no body before a price that cannot be computed", () => {
    const design: Design = { ...KITCHEN_L_DESIGN, placements: [] };

    expect(
      refusalOf({
        design,
        catalog: catalogOf(design),
        book: SAMPLE_BOOK,
        pricingVersion: "not-this-book",
      }),
    ).toEqual({ code: "NO_CABINET" });
  });

  it("returns no snapshot with a refusal", () => {
    const design: Design = { ...KITCHEN_L_DESIGN, placements: [] };

    expect(
      snapshotSubmission({
        design,
        catalog: catalogOf(design),
        book: SAMPLE_BOOK,
        pricingVersion: SAMPLE_BOOK.version,
      }),
    ).not.toHaveProperty("snapshot");
  });
});

describe("the snapshot holds no contact field and no shown figure, by type", () => {
  it("declares exactly the document and the priced design", () => {
    expectTypeOf<keyof SubmissionSnapshot>().toEqualTypeOf<
      "document" | "priced"
    >();
  });

  it("takes no selections: a design's own settings are the only choice", () => {
    expectTypeOf<keyof SubmissionSnapshotRequest>().toEqualTypeOf<
      "design" | "catalog" | "book" | "pricingVersion"
    >();
  });

  it("carries no contact-like key at any depth", () => {
    const CONTACT_KEY =
      /^(phone|email|locality|channel|consent|honeypot|rounded)/i;
    const keysDeep = (value: unknown): string[] =>
      typeof value === "object" && value !== null
        ? Object.entries(value).flatMap(([key, nested]) => [
            key,
            ...keysDeep(nested),
          ])
        : [];

    const kitchen = GENERATED_KITCHENS[5];
    if (kitchen === undefined) throw new Error("a kitchen is generated");

    const keys = keysDeep(snapshotOf(requestFor(kitchen)));

    expect(keys.length).toBeGreaterThan(50);
    expect(keys.filter((key) => CONTACT_KEY.test(key))).toEqual([]);
  });
});
