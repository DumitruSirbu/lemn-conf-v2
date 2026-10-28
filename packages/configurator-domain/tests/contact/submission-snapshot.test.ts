import { describe, expect, expectTypeOf, it } from "vitest";

import {
  canonicalSerializeDesign,
  DesignSchema,
  findOverflowingPlacementIds,
  judgeSubmissionEligibility,
  KITCHEN_L_DESIGN,
  PRICE_BOOK_CURRENCY,
  priceDesign,
  snapshotSubmission,
  drawnButNotSupplied,
  type Design,
  type DesignPlacement,
  type PriceBook,
  type PricedDesign,
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
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";
import { NOTHING_DISABLED } from "../support/availability.js";

function requestFor(kitchen: Kitchen, book: PriceBook = SAMPLE_BOOK) {
  return {
    design: kitchen.design,
    catalog: kitchen.catalog,
    book,
    pricingVersion: book.version,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
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
  // leaf carries two hinges (ADR 0092 decision 2). The material is dearer than the reference by a quarter.
  const ANCHOR_WIDTH_MM = 600;
  const WALL_CABINET_ANCHOR_MINOR = 22_000;
  const WALL_CABINET_PER_STEP_MINOR = 1_000;
  const PER_HINGE_MINOR = 1_000;
  const UPGRADE_PERCENT = 25;

  const BOOK: PriceBook = {
    version: "hand-added",
    currency: PRICE_BOOK_CURRENCY,
    status: "estimate",
    amountsProvisional: true,
    cabinetRules: [
      {
        ruleId: "cabinet.wall-cabinet",
        buildId: "wall-cabinet",
        formula: {
          shape: "anchored-width",
          anchorWidthMm: ANCHOR_WIDTH_MM,
          anchorMinor: WALL_CABINET_ANCHOR_MINOR,
          perStepWiderMinor: WALL_CABINET_PER_STEP_MINOR,
          perStepNarrowerMinor: WALL_CABINET_PER_STEP_MINOR,
        },
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
      defaultTierId: "material.reference",
      tiers: [
        {
          tierId: "material.reference",
          ruleId: "material.reference",
          name: "Reference",
          description: "The reference.",
          percentOfCabinets: 0,
        },
        {
          tierId: "material.upgrade",
          ruleId: "material.upgrade",
          name: "Upgrade",
          description: "A quarter more on the cabinets.",
          percentOfCabinets: UPGRADE_PERCENT,
        },
      ],
    },
    depthRule: { deepCabinetPercent: 0 },
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
    settings: {
      ...KITCHEN_L_DESIGN.settings,
      materialTierId: "material.upgrade",
    },
    placements: [
      wallCabinet("wide", 300, 600),
      wallCabinet("narrow", 800, 400),
    ],
  };

  const requestForBook = (book: PriceBook): SubmissionSnapshotRequest => ({
    design: DESIGN,
    catalog: catalogOf(DESIGN),
    book,
    pricingVersion: book.version,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
  });

  it("is 57 000 minor units", () => {
    // wide    600 mm: the anchor =                                            22 000
    // narrow  400 mm: four 50 mm steps narrower, 22 000 - 4 x 1 000 =        18 000
    // hinges: wide has 2 leaves, narrow 1; 2 hinges each: (4 + 2) x 1 000 =   6 000
    // material at 25 %, each cabinet rounded to 10 lei on its own, half up:
    //   wide   22 000 x 1.25 = 27 500, a tie, up to 28 000, so +6 000
    //   narrow 18 000 x 1.25 = 22 500, a tie, up to 23 000, so +5 000
    //   the material line: 6 000 + 5 000 =                                   11 000
    // sum: 22 000 + 18 000 + 6 000 + 11 000 =                                57 000
    const { priced } = snapshotOf(requestForBook(BOOK));

    expect(priced.totalMinor).toBe(57_000);
    expect(priced.lines.map((line) => line.amountMinor)).toEqual([
      22_000, 18_000, 6_000, 11_000,
    ]);
  });

  it("carries the book's version, currency and what it says of itself, unrounded", () => {
    const { priced } = snapshotOf(requestForBook(BOOK));

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
          ...drawnButNotSupplied(ANCHOR_WIDTH_MM),
        },
      ],
    };

    expect(refusalOf(requestForBook(customerBook))).toEqual({
      code: "NO_CABINET",
    });
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
});

describe("the snapshot holds no contact field and no shown figure, by type", () => {
  it("declares exactly the document and the priced design", () => {
    expectTypeOf<keyof SubmissionSnapshot>().toEqualTypeOf<
      "document" | "priced"
    >();
  });

  it("takes no selections: a design's own settings are the only choice", () => {
    expectTypeOf<keyof SubmissionSnapshotRequest>().toEqualTypeOf<
      | "design"
      | "catalog"
      | "book"
      | "pricingVersion"
      | "deepeningRows"
      | "availability"
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

describe("a snapshot taken before the cut-over is read back as stored (P3-c, ADR 0154 decision 8)", () => {
  // A snapshot is kept for good and nothing re-prices it. This one is a stored price from the retired book's era,
  // written as JSON so that nothing here can type it into today's shape: a flat material line, lines that are not
  // whole tens of lei, and a total that is the book's own exact sum.
  const STORED_BEFORE_THE_CUT_OVER = `{
    "currency": "MDL",
    "pricingVersion": "sample-2026-09",
    "status": "estimate",
    "amountsProvisional": true,
    "lines": [
      { "lineId": "placement:p0:cabinet", "kind": "cabinet", "ruleId": "cabinet.base-sink", "placementId": "p0",
        "buildId": "base-sink-800", "pricedAsBuildId": "base-sink", "label": "base-sink", "widthMm": 800,
        "suppliedBy": "manufacturer", "quantity": 1, "unitAmountMinor": 486000, "amountMinor": 486000 },
      { "lineId": "kitchen:hardware", "kind": "hardware", "ruleId": "hardware.standard", "tierId": "hardware.standard",
        "name": "Standard", "description": "d", "quantity": 1, "unitAmountMinor": 450240, "amountMinor": 450240 },
      { "lineId": "kitchen:material", "kind": "material", "ruleId": "material.painted-mdf", "tierId": "material.painted-mdf",
        "name": "MDF", "description": "d", "quantity": 1, "unitAmountMinor": 900000, "amountMinor": 900000 }
    ],
    "totalMinor": 1836240,
    "overflowingPlacementIds": [],
    "totalIsFlagged": false
  }`;

  it("keeps the stored total and every stored line byte for byte through the eligibility rule, never recomputing them", () => {
    const stored = JSON.parse(STORED_BEFORE_THE_CUT_OVER) as PricedDesign;

    const eligibility = judgeSubmissionEligibility({
      design: KITCHEN_L_DESIGN,
      overflowingPlacementIds: [],
      pricing: { ok: true, priced: stored },
    });

    expect(eligibility.kind).toBe("allowed");
    if (eligibility.kind !== "allowed") return;
    expect(eligibility.priced).toBe(stored);
    expect(JSON.stringify(eligibility.priced)).toBe(
      JSON.stringify(JSON.parse(STORED_BEFORE_THE_CUT_OVER)),
    );
    expect(eligibility.priced.totalMinor).toBe(1_836_240);
    expect(eligibility.priced.totalMinor % 1_000).not.toBe(0);
  });

  it("is a price the book of today would not have produced, which is the point: the stored figure is not the current book's", () => {
    const stored = JSON.parse(STORED_BEFORE_THE_CUT_OVER) as PricedDesign;
    const seeded = GENERATED_KITCHENS.find(
      (kitchen) => kitchen.name === "the seeded L",
    );
    if (seeded === undefined) throw new Error("the seeded kitchen is listed");

    const today = snapshotOf(requestFor(seeded)).priced;

    expect(today.totalMinor).not.toBe(stored.totalMinor);
  });
});

describe("the snapshot holds a design, by its own parse", () => {
  const KITCHEN = {
    name: "seeded",
    design: KITCHEN_L_DESIGN,
    catalog: catalogOf(KITCHEN_L_DESIGN),
  };
  const throwsFor = (design: unknown) => () =>
    snapshotSubmission({ ...requestFor(KITCHEN), design: design as Design });

  it("names the shape of what failed and no value", () => {
    const secret = "SECRET-ROOM-VALUE";

    expect(throwsFor({ ...KITCHEN_L_DESIGN, room: secret })).not.toThrow(
      secret,
    );
    expect(throwsFor({ ...KITCHEN_L_DESIGN, room: secret })).toThrow("room");
  });
});
