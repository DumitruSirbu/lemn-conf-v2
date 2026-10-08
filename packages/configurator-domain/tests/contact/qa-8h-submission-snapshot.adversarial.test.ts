// Wave 8H, criteria 6 and 7 as restated: the document round-trips with every optional part set and unset,
// the price is `priceDesign`'s through one call under every tier pair, a total under the shipped book is
// added up by hand, and the three refusals keep ADR 0148's order when two or three apply at once.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  canonicalSerializeDesign,
  DesignSchema,
  drawnButNotSupplied,
  findOverflowingPlacementIds,
  judgeSubmissionEligibility,
  KITCHEN_L_DESIGN,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  snapshotSubmission,
  type Design,
  type DesignPlacement,
  type DesignWall,
  type EmptyColumn,
  type PriceBook,
  type PricedDesign,
  type SubmissionSnapshotRequest,
  type SubmissionSnapshotResult,
} from "../../src/index.js";

import {
  catalogOf,
  GENERATED_KITCHENS,
  withABodyPastItsWall,
  type Kitchen,
} from "./support/submission-kitchens.js";

const ANOTHER_VERSION = "not-the-book's-version";

/** The shipped book with every cabinet handed to the customer: drawn, listed, and nothing Lemnaria supplies. */
const CUSTOMER_SUPPLIES_EVERYTHING: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  cabinetRules: SAMPLE_PRICE_BOOK.cabinetRules.map(({ ruleId, buildId }) => ({
    ruleId,
    buildId,
    ...drawnButNotSupplied(),
  })),
};

interface Terms {
  readonly book: PriceBook;
  readonly pricingVersion: string;
}

const SHIPPED: Terms = {
  book: SAMPLE_PRICE_BOOK,
  pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
};

function requestFor(
  design: Design,
  terms: Terms = SHIPPED,
): SubmissionSnapshotRequest {
  return { design, catalog: catalogOf(design), ...terms };
}

function snapshotOf(design: Design, terms: Terms = SHIPPED) {
  const result = snapshotSubmission(requestFor(design, terms));
  if (!result.ok) {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return result.snapshot;
}

function refusalOf(design: Design, terms: Terms = SHIPPED) {
  const result = snapshotSubmission(requestFor(design, terms));
  if (result.ok) throw new Error("expected a refusal");
  return result.refusal;
}

function wallsOf(design: Design): readonly DesignWall[] {
  if (design.room.shape === "U") return ["A", "B", "C"];
  return design.room.shape === "L" ? ["A", "B"] : ["A"];
}

function asStored(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

interface Variant {
  readonly name: string;
  readonly of: (design: Design) => Design;
}

const AN_EMPTY_COLUMN: EmptyColumn = {
  wall: "A",
  alongMm: 300,
  widthMm: 600,
  y0Mm: 0,
  topMm: 900,
  depthMm: 600,
};

function withEveryBody(
  design: Design,
  change: (body: DesignPlacement["body"]) => DesignPlacement["body"],
): Design {
  return {
    ...design,
    placements: design.placements.map((placement) => ({
      ...placement,
      body: change(placement.body),
    })),
  };
}

/** Every optional part of a design document, set and unset. */
const VARIANTS: readonly Variant[] = [
  { name: "as it stands", of: (design) => design },
  {
    name: "no settings at all",
    of: ({ room, presetId, placements, createdAt, updatedAt }) => ({
      room,
      presetId,
      placements,
      createdAt,
      updatedAt,
    }),
  },
  {
    name: "both tiers chosen and a kitchen colour",
    of: (design) => ({
      ...design,
      settings: {
        ...design.settings,
        materialTierId: "material.painted-mdf",
        hardwareTierId: "hardware.premium",
        finish: { kind: "free-colour", value: "#b8c4a1" },
      },
    }),
  },
  {
    name: "empty columns and column extents present and empty",
    of: (design) => ({ ...design, emptyColumns: [], columnExtents: [] }),
  },
  {
    name: "an empty column with its depth source, and one without",
    of: (design) => ({
      ...design,
      emptyColumns: [
        AN_EMPTY_COLUMN,
        { ...AN_EMPTY_COLUMN, depthFromBuildId: "base-cabinet" },
      ],
      columnExtents: [AN_EMPTY_COLUMN],
    }),
  },
  {
    name: "a finish, a handle and a seat depth on every body",
    of: (design) =>
      withEveryBody(design, (body) => ({
        ...body,
        seatDepthMm: 560,
        finish: { kind: "free-colour", value: "#102030" },
        handle: "black",
      })),
  },
  {
    name: "no finish, handle or seat depth on any body",
    of: (design) =>
      withEveryBody(design, ({ buildId, widthMm, heightMm }) => ({
        buildId,
        widthMm,
        heightMm,
      })),
  },
  { name: "a preset id", of: (design) => ({ ...design, presetId: "seeded" }) },
  { name: "no preset", of: (design) => ({ ...design, presetId: null }) },
  {
    name: "every optional key present and undefined",
    of: (design) => ({
      ...withEveryBody(design, (body) => ({
        ...body,
        seatDepthMm: undefined,
        finish: undefined,
        handle: undefined,
      })),
      emptyColumns: undefined,
      columnExtents: undefined,
    }),
  },
];

const CASES = GENERATED_KITCHENS.flatMap((kitchen) =>
  VARIANTS.map((variant) => ({
    name: `${kitchen.name}, ${variant.name}`,
    design: variant.of(kitchen.design),
  })),
);

describe("8H criterion 6: the document, with every optional part set and unset", () => {
  it("reaches kitchens of all three shapes and every variant of each", () => {
    expect(
      new Set(GENERATED_KITCHENS.map((kitchen) => kitchen.design.room.shape)),
    ).toEqual(new Set(["linear", "L", "U"]));
    expect(CASES).toHaveLength(GENERATED_KITCHENS.length * VARIANTS.length);
  });

  it("makes seven documents of the seeded kitchen, which already stands as three of the ten variants", () => {
    const documents = VARIANTS.map((variant) =>
      canonicalSerializeDesign(variant.of(KITCHEN_L_DESIGN)),
    );

    expect(VARIANTS).toHaveLength(10);
    expect(new Set(documents).size).toBe(7);
  });

  describe.each(CASES)("$name", ({ design }) => {
    it("parses as a design and serialises again to the same bytes", () => {
      const { document } = snapshotOf(design);

      const reparsed = DesignSchema.parse(JSON.parse(document));

      expect(canonicalSerializeDesign(reparsed)).toBe(document);
      expect(reparsed).toEqual(asStored(design));
    });
  });

  function reordered(value: unknown, order: readonly number[]): unknown {
    let next = 0;
    const walk = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(walk);
      if (node === null || typeof node !== "object") return node;
      const ranked = Object.entries(node).map(
        ([key, nested]) =>
          [order[next++ % order.length] ?? 0, key, walk(nested)] as const,
      );
      ranked.sort(([left], [right]) => left - right);
      return Object.fromEntries(ranked.map(([, key, nested]) => [key, nested]));
    };
    return walk(value);
  }

  propertyTest.prop([
    fc.constantFrom(...GENERATED_KITCHENS),
    fc.array(fc.nat(), { minLength: 97, maxLength: 97 }),
  ])(
    "is the same bytes however the design's keys are ordered, at every depth",
    (kitchen, order) => {
      const shuffled = reordered(kitchen.design, order) as Design;

      expect(snapshotOf(shuffled).document).toBe(
        snapshotOf(kitchen.design).document,
      );
    },
  );

  it("holds nothing but the design: no price, no book and no contact field", () => {
    const { document } = snapshotOf(KITCHEN_L_DESIGN);

    expect(Object.keys(JSON.parse(document) as object).sort()).toEqual(
      Object.keys(KITCHEN_L_DESIGN).sort(),
    );
  });

  // QA finding 11, as built: the document is the design serialised, never parsed. A value that is not a
  // design by the schema goes into the snapshot as it came, and the document then does not parse.
  it("as built: serialises a key the schema refuses, and the document no longer parses as a design", () => {
    const withAStowaway = {
      ...KITCHEN_L_DESIGN,
      contact: { phone: "069123456" },
    } as Design;

    const { document } = snapshotOf(withAStowaway);

    expect(document).toContain("069123456");
    expect(DesignSchema.safeParse(JSON.parse(document)).success).toBe(false);
  });
});

describe("8H criterion 6: the price is priceDesign's, through one call", () => {
  const TIER_PAIRS = SAMPLE_PRICE_BOOK.material.tiers.flatMap((material) =>
    SAMPLE_PRICE_BOOK.hardware.tiers.map((hardware) => ({
      materialTierId: material.tierId,
      hardwareTierId: hardware.tierId,
    })),
  );

  function pricedDirectly(design: Design): PricedDesign {
    const result = priceDesign({
      ...requestFor(design),
      selections: design.settings,
    });
    if (!result.ok) throw new Error("expected the kitchen to price");
    return result.priced;
  }

  const PRICED_CASES = GENERATED_KITCHENS.flatMap((kitchen) =>
    TIER_PAIRS.map((tiers) => ({
      name: `${kitchen.name} at ${tiers.materialTierId} and ${tiers.hardwareTierId}`,
      design: {
        ...kitchen.design,
        settings: { ...kitchen.design.settings, ...tiers },
      },
    })),
  );

  it("prices every kitchen under all nine tier pairs", () => {
    expect(TIER_PAIRS).toHaveLength(9);
    expect(PRICED_CASES).toHaveLength(GENERATED_KITCHENS.length * 9);
  });

  describe.each(PRICED_CASES)("$name", ({ design }) => {
    it("carries every line and the total exactly as priceDesign returned them", () => {
      expect(snapshotOf(design).priced).toEqual(pricedDirectly(design));
    });

    it("carries a total that is the sum of its lines, each a whole quantity of a whole amount", () => {
      const { priced } = snapshotOf(design);

      const sum = priced.lines.reduce(
        (total, line) => total + line.quantity * line.unitAmountMinor,
        0,
      );

      expect(priced.totalMinor).toBe(sum);
      expect(Number.isSafeInteger(priced.totalMinor)).toBe(true);
      expect(
        priced.lines.every(
          (line) => line.amountMinor === line.quantity * line.unitAmountMinor,
        ),
      ).toBe(true);
    });

    it("carries the book's version and what the book says of itself", () => {
      expect(snapshotOf(design).priced).toMatchObject({
        pricingVersion: SAMPLE_PRICE_BOOK.version,
        currency: SAMPLE_PRICE_BOOK.currency,
        status: SAMPLE_PRICE_BOOK.status,
        amountsProvisional: SAMPLE_PRICE_BOOK.amountsProvisional,
      });
    });
  });

  it("prices at the tiers the design names: the nine pairs give more than one total", () => {
    const totals = PRICED_CASES.filter(({ name }) =>
      name.startsWith("the seeded L"),
    ).map(({ design }) => snapshotOf(design).priced.totalMinor);

    expect(totals).toHaveLength(9);
    expect(new Set(totals).size).toBeGreaterThanOrEqual(6);
  });

  it("never carries a flagged total: a kitchen with a body past its wall has no snapshot", () => {
    const flagged = [...CASES, ...PRICED_CASES]
      .map(({ design }) => snapshotSubmission(requestFor(design)))
      .filter(
        (result) =>
          result.ok &&
          (result.snapshot.priced.totalIsFlagged ||
            result.snapshot.priced.overflowingPlacementIds.length > 0),
      );

    expect(flagged).toEqual([]);
  });

  it("answers the same twice and changes nothing it was handed", () => {
    const deeplyFrozen = <T>(value: T): T => {
      if (value !== null && typeof value === "object") {
        Object.values(value).forEach(deeplyFrozen);
        Object.freeze(value);
      }
      return value;
    };
    const request = deeplyFrozen(
      requestFor(asStored(KITCHEN_L_DESIGN) as Design, {
        ...SHIPPED,
        book: asStored(SAMPLE_PRICE_BOOK) as PriceBook,
      }),
    );

    expect(snapshotSubmission(request)).toEqual(snapshotSubmission(request));
  });
});

describe("8H criterion 6: a total under the shipped book, added up by hand", () => {
  // The shipped book's rows, read from `src/pricing/sample-price-book.ts` and restated here:
  //   cabinet.wall-cabinet  base 40 000, 300 per mm of width, 70 per mm of height, 14 000 per door leaf
  //   hardware.standard     1 760 per hinge
  //   material.melamine     0 for the whole kitchen
  // A wall cabinet carries two door leaves from 500 mm of width and one below; a leaf hangs on two hinges
  // (ADR 0092 decision 2). Neither cabinet stands over a sink, so no accessory is earned.
  const BASE = 40_000;
  const PER_WIDTH_MM = 300;
  const PER_HEIGHT_MM = 70;
  const PER_DOOR_LEAF = 14_000;
  const PER_HINGE = 1_760;
  const HEIGHT_MM = 700;

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
      body: { buildId: "wall-cabinet", widthMm, heightMm: HEIGHT_MM },
    };
  }

  function kitchenOf(placements: readonly DesignPlacement[]): Design {
    return {
      ...KITCHEN_L_DESIGN,
      settings: {
        ...KITCHEN_L_DESIGN.settings,
        materialTierId: "material.melamine",
        hardwareTierId: "hardware.standard",
      },
      placements: [...placements],
    };
  }

  it("still states the rows this sum is made from", () => {
    const rule = SAMPLE_PRICE_BOOK.cabinetRules.find(
      ({ buildId }) => buildId === "wall-cabinet",
    );
    const standard = SAMPLE_PRICE_BOOK.hardware.tiers.find(
      ({ tierId }) => tierId === "hardware.standard",
    );
    const melamine = SAMPLE_PRICE_BOOK.material.tiers.find(
      ({ tierId }) => tierId === "material.melamine",
    );

    expect(JSON.stringify(rule?.formula)).toContain(
      `"baseMinor":${String(BASE)},"perWidthMillimetreMinor":${String(PER_WIDTH_MM)}`,
    );
    expect(JSON.stringify(rule?.formula)).toContain(
      `"perHeightMillimetreMinor":${String(PER_HEIGHT_MM)}`,
    );
    expect(JSON.stringify(rule?.formula)).toContain(
      `"perDoorLeafMinor":${String(PER_DOOR_LEAF)}`,
    );
    expect(standard?.perHingeMinor).toBe(PER_HINGE);
    expect(melamine?.wholeKitchenMinor).toBe(0);
  });

  it("is 530 560 minor units for a 600 mm and a 400 mm wall cabinet", () => {
    // wide    600 mm: 40 000 + 300 x 600 + 70 x 700 + 14 000 x 2 = 40 000 + 180 000 + 49 000 + 28 000 = 297 000
    // narrow  400 mm: 40 000 + 300 x 400 + 70 x 700 + 14 000 x 1 = 40 000 + 120 000 + 49 000 + 14 000 = 223 000
    // hinges: wide 2 leaves, narrow 1; two hinges a leaf: (4 + 2) x 1 760 =                              10 560
    // material, once for the kitchen:                                                                         0
    // sum: 297 000 + 223 000 + 10 560 + 0 =                                                             530 560
    const design = kitchenOf([
      wallCabinet("wide", 300, 600),
      wallCabinet("narrow", 800, 400),
    ]);

    const { priced } = snapshotOf(design);

    expect(priced.lines.map((line) => line.amountMinor)).toEqual([
      297_000, 223_000, 10_560, 0,
    ]);
    expect(priced.totalMinor).toBe(530_560);
  });

  it("is 530 260 minor units either side of the second door leaf, at 500 mm and 499 mm", () => {
    // at-step 500 mm: 40 000 + 300 x 500 + 70 x 700 + 14 000 x 2 = 40 000 + 150 000 + 49 000 + 28 000 = 267 000
    // below   499 mm: 40 000 + 300 x 499 + 70 x 700 + 14 000 x 1 = 40 000 + 149 700 + 49 000 + 14 000 = 252 700
    // hinges: (4 + 2) x 1 760 =                                                                          10 560
    // sum: 267 000 + 252 700 + 10 560 + 0 =                                                             530 260
    const design = kitchenOf([
      wallCabinet("at-step", 250, 500),
      wallCabinet("below", 800, 499),
    ]);

    const { priced } = snapshotOf(design);

    expect(priced.lines.map((line) => line.amountMinor)).toEqual([
      267_000, 252_700, 10_560, 0,
    ]);
    expect(priced.totalMinor).toBe(530_260);
  });
});

describe("8H criterion 7: the three refusals, in ADR 0148's order, when more than one applies", () => {
  const U_KITCHEN = GENERATED_KITCHENS.find(
    (kitchen) => kitchen.design.room.shape === "U",
  );
  if (U_KITCHEN === undefined) throw new Error("no U kitchen is generated");

  const ANOTHER_BOOKS_VERSION: Terms = {
    ...SHIPPED,
    pricingVersion: ANOTHER_VERSION,
  };
  const CUSTOMERS: Terms = { ...SHIPPED, book: CUSTOMER_SUPPLIES_EVERYTHING };
  const CUSTOMERS_AND_UNPRICED: Terms = {
    ...CUSTOMERS,
    pricingVersion: ANOTHER_VERSION,
  };
  const NO_BODIES: Design = {
    ...KITCHEN_L_DESIGN,
    placements: [],
    emptyColumns: [],
    columnExtents: [],
  };

  const PAST_A_WALL = GENERATED_KITCHENS.flatMap((kitchen: Kitchen) =>
    wallsOf(kitchen.design).map((wall) => ({
      name: `${kitchen.name}, wall ${wall}`,
      wall,
      design: withABodyPastItsWall(kitchen.design, wall),
    })),
  );

  it("pushes a body past every wall each shape has", () => {
    expect(
      PAST_A_WALL.map(({ wall }) => wall)
        .sort()
        .join(""),
    ).toMatch(/^A+B+C+$/);
  });

  describe.each(PAST_A_WALL)("a body past its wall on $name", ({ design }) => {
    it.each([
      ["a price that is fine", SHIPPED],
      ["a price that cannot be computed", ANOTHER_BOOKS_VERSION],
      ["nothing Lemnaria supplies", CUSTOMERS],
      ["nothing supplied and no price", CUSTOMERS_AND_UNPRICED],
    ])(
      "comes first, beside %s, naming exactly the fit query's bodies",
      (_name, terms) => {
        const overflowing = findOverflowingPlacementIds(design);

        expect(overflowing.length).toBeGreaterThan(0);
        expect(refusalOf(design, terms)).toEqual({
          code: "BODIES_PAST_WALL",
          placementIds: overflowing,
        });
      },
    );
  });

  it.each(GENERATED_KITCHENS)(
    "says nothing is supplied for $name when every body is the customer's and the price is fine",
    ({ design }) => {
      expect(refusalOf(design, CUSTOMERS)).toEqual({ code: "NO_CABINET" });
    },
  );

  it("says nothing is supplied for a design with no body, priced or not", () => {
    expect(refusalOf(NO_BODIES)).toEqual({ code: "NO_CABINET" });
    expect(refusalOf(NO_BODIES, ANOTHER_BOOKS_VERSION)).toEqual({
      code: "NO_CABINET",
    });
  });

  // A supplier is read off a priced line; with no price there is none to read, so the rule cannot know
  // that every body is the customer's.
  it("says the price failed, not that nothing is supplied, for bodies it could not price", () => {
    expect(refusalOf(U_KITCHEN.design, CUSTOMERS_AND_UNPRICED)).toEqual({
      code: "PRICING_FAILED",
    });
  });

  it.each([
    ["another version", ANOTHER_BOOKS_VERSION],
    [
      "no rule for any body",
      { ...SHIPPED, book: { ...SAMPLE_PRICE_BOOK, cabinetRules: [] } },
    ],
    [
      "another currency",
      {
        ...SHIPPED,
        book: { ...SAMPLE_PRICE_BOOK, currency: "EUR" } as unknown as PriceBook,
      },
    ],
  ])(
    "says only that the price failed, and nothing of why, under a book with %s",
    (_name, terms) => {
      expect(refusalOf(U_KITCHEN.design, terms)).toEqual({
        code: "PRICING_FAILED",
      });
    },
  );

  it("says only that the price failed for a design naming a tier the book does not offer", () => {
    const design: Design = {
      ...U_KITCHEN.design,
      settings: { ...U_KITCHEN.design.settings, materialTierId: "material.x" },
    };

    expect(refusalOf(design)).toEqual({ code: "PRICING_FAILED" });
  });

  it("returns a refusal and no part of a snapshot", () => {
    const results: readonly SubmissionSnapshotResult[] = [
      snapshotSubmission(requestFor(NO_BODIES)),
      snapshotSubmission(requestFor(U_KITCHEN.design, ANOTHER_BOOKS_VERSION)),
      snapshotSubmission(
        requestFor(withABodyPastItsWall(U_KITCHEN.design, "C")),
      ),
    ];

    expect(results.map((result) => Object.keys(result).sort())).toEqual(
      results.map(() => ["ok", "refusal"]),
    );
  });
});

// QA finding 3, on the reading the architect is ruling. The rule is handed the fit query's answer instead
// of asking it, and a priced design carries a second copy of that answer. Nothing holds the two, or the
// design, to each other: the review does (`assertInputsAreOneDesigns`), the rule does not.
describe("8H S3, as built: judgeSubmissionEligibility believes facts that contradict each other", () => {
  const overflowing = withABodyPastItsWall(KITCHEN_L_DESIGN, "A");
  const pricing = priceDesign({
    ...requestFor(overflowing),
    selections: overflowing.settings,
  });

  it("prices the overflowing kitchen with its total flagged", () => {
    expect(pricing).toMatchObject({
      ok: true,
      priced: { totalIsFlagged: true },
    });
  });

  it("allows a kitchen whose own price says a body is past its wall, when handed no ids", () => {
    const eligibility = judgeSubmissionEligibility({
      design: overflowing,
      overflowingPlacementIds: [],
      pricing,
    });

    expect(eligibility).toMatchObject({
      kind: "allowed",
      priced: { totalIsFlagged: true },
    });
  });

  it("refuses a kitchen that fits for a body it does not hold, when handed that id", () => {
    const fitting = priceDesign({
      ...requestFor(KITCHEN_L_DESIGN),
      selections: KITCHEN_L_DESIGN.settings,
    });

    const eligibility = judgeSubmissionEligibility({
      design: KITCHEN_L_DESIGN,
      overflowingPlacementIds: ["no-such-body"],
      pricing: fitting,
    });

    expect(eligibility).toEqual({
      kind: "refused",
      refusal: { code: "BODIES_PAST_WALL", placementIds: ["no-such-body"] },
    });
  });

  it("cannot be made to through the snapshot, which asks the query itself", () => {
    expect(refusalOf(overflowing)).toEqual({
      code: "BODIES_PAST_WALL",
      placementIds: findOverflowingPlacementIds(overflowing),
    });
  });
});
