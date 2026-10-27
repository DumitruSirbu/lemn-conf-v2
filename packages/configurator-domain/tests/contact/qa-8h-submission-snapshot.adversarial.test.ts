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
  SubmissionDesignInvalidError,
  SubmissionFactsContradictionError,
  type Design,
  type DesignPlacement,
  type DesignWall,
  type EmptyColumn,
  type PriceBook,
  type PricedDesign,
  type PricingFailure,
  type PricingFailureCode,
  type PricingResult,
  type SubmissionSnapshotRequest,
  type SubmissionSnapshotResult,
} from "../../src/index.js";

import { boundedFailureReason } from "../../src/failure-text.js";

import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";
import {
  expectedLineAmountMinor,
  roundedToTenLei,
} from "../support/line-amounts.js";

import {
  catalogOf,
  GENERATED_KITCHENS,
  withABodyPastItsWall,
  type Kitchen,
} from "./support/submission-kitchens.js";

const ANOTHER_VERSION = "not-the-book's-version";

/** The width every handed-over cabinet is quoted at: a free anchored row steps by nothing, so it prices at zero at any
 *  width and the figure here decides nothing but that the rule is a valid one. */
const HANDED_OVER_ANCHOR_WIDTH_MM = 600;

/** The shipped book with every cabinet handed to the customer: drawn, listed, and nothing Lemnaria supplies. */
const CUSTOMER_SUPPLIES_EVERYTHING: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  cabinetRules: SAMPLE_PRICE_BOOK.cabinetRules.map(({ ruleId, buildId }) => ({
    ruleId,
    buildId,
    ...drawnButNotSupplied(HANDED_OVER_ANCHOR_WIDTH_MM),
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
  return {
    design,
    catalog: catalogOf(design),
    deepeningRows: MEASURED_DEEPENING_ROWS,
    ...terms,
  };
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

/** What `priceDesign` itself says of the same design under the same terms. */
function failureOf(design: Design, terms: Terms): PricingFailure {
  const result = priceDesign({
    ...requestFor(design, terms),
    selections: design.settings,
  });
  if (result.ok) throw new Error("expected pricing to refuse");
  return result.failure;
}

function thrownBy(act: () => unknown): Error {
  try {
    act();
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("expected a throw");
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
});

// Criterion 20 (QA finding 11, ruled): the snapshot parses what it is handed, and prices and serialises the
// parsed design. What is not a design is thrown, not refused.
describe("8H criterion 20: the snapshot holds a design, by its own check", () => {
  const MARKER = "ZZQA8H";

  function requestWith(design: unknown): SubmissionSnapshotRequest {
    return { ...requestFor(KITCHEN_L_DESIGN), design: design as Design };
  }

  const [FIRST_PLACEMENT] = KITCHEN_L_DESIGN.placements;
  if (FIRST_PLACEMENT === undefined)
    throw new Error("the seeded kitchen is empty");

  function withFirstPlacement(change: object): unknown {
    return {
      ...KITCHEN_L_DESIGN,
      placements: [
        { ...FIRST_PLACEMENT, ...change },
        ...KITCHEN_L_DESIGN.placements.slice(1),
      ],
    };
  }

  const NOT_DESIGNS: readonly (readonly [string, unknown])[] = [
    ["null", null],
    ["nothing", undefined],
    ["text", MARKER],
    [
      "the document's own text, unparsed",
      canonicalSerializeDesign(KITCHEN_L_DESIGN),
    ],
    ["a number", 7_919_000_017],
    ["an array holding a design", [KITCHEN_L_DESIGN]],
    ["an empty object", {}],
    [
      "a design with a contact stowed in it",
      { ...KITCHEN_L_DESIGN, contact: { phone: MARKER } },
    ],
    [
      "a design with a key named by the sender",
      { ...KITCHEN_L_DESIGN, [MARKER]: 1 },
    ],
    [
      "a design with a price stowed in it",
      { ...KITCHEN_L_DESIGN, totalMinor: 7_919_000_017 },
    ],
    ["a design without its room", { ...KITCHEN_L_DESIGN, room: undefined }],
    [
      "a room of an unknown shape",
      {
        ...KITCHEN_L_DESIGN,
        room: { ...KITCHEN_L_DESIGN.room, shape: MARKER },
      },
    ],
    [
      "a room with an extra key",
      {
        ...KITCHEN_L_DESIGN,
        room: { ...KITCHEN_L_DESIGN.room, [MARKER]: MARKER },
      },
    ],
    [
      "a placement whose position is text",
      withFirstPlacement({ alongMm: MARKER }),
    ],
    ["a placement on no wall", withFirstPlacement({ wall: MARKER })],
    [
      "a body with an extra key",
      withFirstPlacement({
        body: { ...FIRST_PLACEMENT.body, [MARKER]: MARKER },
      }),
    ],
    [
      "a body of no width",
      withFirstPlacement({ body: { ...FIRST_PLACEMENT.body, widthMm: 0 } }),
    ],
    [
      "a body with a fractional width",
      withFirstPlacement({ body: { ...FIRST_PLACEMENT.body, widthMm: 600.5 } }),
    ],
    [
      "settings with an extra key",
      {
        ...KITCHEN_L_DESIGN,
        settings: { ...KITCHEN_L_DESIGN.settings, [MARKER]: MARKER },
      },
    ],
    ["a timestamp that is not one", { ...KITCHEN_L_DESIGN, createdAt: MARKER }],
    [
      "placements that are not a list",
      { ...KITCHEN_L_DESIGN, placements: MARKER },
    ],
  ];

  it.each(NOT_DESIGNS)(
    "throws for %s, and returns neither a snapshot nor a refusal",
    (_name, design) => {
      expect(() => snapshotSubmission(requestWith(design))).toThrow(
        SubmissionDesignInvalidError,
      );
    },
  );

  it.each(NOT_DESIGNS)(
    "says where %s failed and holds no value and no key from it",
    (_name, design) => {
      const { message, name } = thrownBy(() =>
        snapshotSubmission(requestWith(design)),
      );

      expect(name).toBe("SubmissionDesignInvalidError");
      expect(message).toMatch(
        /^The submission's design is not a design: \d+ issue\(s\): /,
      );
      expect(message).not.toMatch(/ZZQA8H|7919000017|600\.5/);
    },
  );

  it("bounds what it says, for four hundred bodies each wrong in two places", () => {
    const design = {
      ...KITCHEN_L_DESIGN,
      placements: Array.from({ length: 400 }, (_, index) => ({
        ...FIRST_PLACEMENT,
        id: `body-${String(index)}`,
        alongMm: MARKER.repeat(500),
        [MARKER]: MARKER,
      })),
    };

    const { message } = thrownBy(() => snapshotSubmission(requestWith(design)));

    expect(message.length).toBeLessThan(400);
    expect(message).not.toContain(MARKER);
  });

  it("checks the design before anything else: a design that is not one throws though the book is wrong too", () => {
    expect(() =>
      snapshotSubmission({
        ...requestWith({ ...KITCHEN_L_DESIGN, [MARKER]: 1 }),
        pricingVersion: ANOTHER_VERSION,
      }),
    ).toThrow(SubmissionDesignInvalidError);
  });

  // The mutant the implementer's tests let live: serialising what was handed in, not what was parsed. The
  // schema reads a property wherever the object gets it; the serialiser copies own keys only. So a design
  // whose fields are inherited parses whole and serialises, unparsed, to an empty object.
  it("serialises the parsed design, not what it was handed: a design whose fields are inherited", () => {
    const inherited = Object.create(KITCHEN_L_DESIGN) as Design;

    expect(canonicalSerializeDesign(inherited)).toBe("{}");
    expect(snapshotOf(inherited).document).toBe(
      canonicalSerializeDesign(KITCHEN_L_DESIGN),
    );
  });

  it("serialises the parsed design, not what it was handed: a body whose fields are inherited", () => {
    const design: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map(
        (placement) => Object.create(placement) as DesignPlacement,
      ),
    };

    expect(snapshotOf(design).document).toBe(
      canonicalSerializeDesign(KITCHEN_L_DESIGN),
    );
  });

  it("serialises the design as it was when parsed: a field that answers differently the second time", () => {
    let reads = 0;
    const shifting = {
      ...KITCHEN_L_DESIGN,
      get presetId() {
        reads += 1;
        return reads === 1 ? null : MARKER;
      },
    };

    const { document } = snapshotOf(shifting);

    expect(document).toBe(canonicalSerializeDesign(KITCHEN_L_DESIGN));
    expect(reads).toBe(1);
  });

  it("prices the parsed design too: the price and the document are one design's", () => {
    const inherited = Object.create(KITCHEN_L_DESIGN) as Design;

    expect(snapshotOf(inherited).priced).toEqual(
      snapshotOf(KITCHEN_L_DESIGN).priced,
    );
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
        (total, line) => total + expectedLineAmountMinor(line),
        0,
      );

      expect(priced.totalMinor).toBe(sum);
      expect(Number.isSafeInteger(priced.totalMinor)).toBe(true);
      expect(
        priced.lines.every(
          (line) => line.amountMinor === expectedLineAmountMinor(line),
        ),
      ).toBe(true);
    });

    it("holds the product identity on every line but an accessory, and rounds an accessory to ten lei", () => {
      const { priced } = snapshotOf(design);

      for (const line of priced.lines) {
        if (line.kind === "accessory") {
          expect(line.amountMinor).toBe(
            roundedToTenLei(line.quantity * line.unitAmountMinor),
          );
        } else {
          expect(line.amountMinor).toBe(line.quantity * line.unitAmountMinor);
        }
      }
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
  //   cabinet.wall-cabinet  anchor 297 000 at 600 mm wide and 700 mm high, 15 000 a 50 mm step of width either way,
  //                         3 500 a 50 mm step of height, 14 000 a door leaf beyond the anchor's two
  //   hardware.standard     1 760 per hinge
  //   material.melamine     0 % of the cabinets
  // A width rounds up to the next 50 mm before it steps (ADR 0177 A-2); the door leaves follow the width as built
  // (A-3): two from 500 mm and one below. A leaf hangs on two hinges (ADR 0092 decision 2), and the hardware line is
  // rounded to ten lei. Neither cabinet stands over a sink, so no accessory is earned.
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

  it("is 531 000 minor units for a 600 mm and a 400 mm wall cabinet", () => {
    // wide    600 mm: anchor, no step, no extra leaf                                  =  297 000
    // narrow  400 mm: 297 000 - 4 steps x 15 000 - 1 leaf x 14 000 = 297 000 - 60 000 - 14 000 = 223 000
    // hinges: wide 2 leaves, narrow 1; two hinges a leaf: (4 + 2) x 1 760 = 10 560, to ten lei  =   11 000
    // material, once for the kitchen:                                                          =        0
    // sum: 297 000 + 223 000 + 11 000 + 0 =                                                    531 000
    const design = kitchenOf([
      wallCabinet("wide", 300, 600),
      wallCabinet("narrow", 800, 400),
    ]);

    const { priced } = snapshotOf(design);

    expect(priced.lines.map((line) => line.amountMinor)).toEqual([
      297_000, 223_000, 11_000, 0,
    ]);
    expect(priced.totalMinor).toBe(531_000);
  });

  it("is 531 000 minor units either side of the second door leaf, at 500 mm and 499 mm", () => {
    // at-step 500 mm: 297 000 - 2 steps x 15 000, two leaves, none extra       = 267 000
    // below   499 mm: rounds up to 500 for the step (-30 000), one leaf (-14 000) = 253 000
    //   (the retired linear book priced 499 mm at 252 700: the width term now steps by 50 mm)
    // hinges: (4 + 2) x 1 760 = 10 560, to ten lei                              =  11 000
    // sum: 267 000 + 253 000 + 11 000 + 0 =                                     531 000
    const design = kitchenOf([
      wallCabinet("at-step", 250, 500),
      wallCabinet("below", 800, 499),
    ]);

    const { priced } = snapshotOf(design);

    expect(priced.lines.map((line) => line.amountMinor)).toEqual([
      267_000, 253_000, 11_000, 0,
    ]);
    expect(priced.totalMinor).toBe(531_000);
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
      failure: failureOf(U_KITCHEN.design, CUSTOMERS_AND_UNPRICED),
    });
  });

  const WITH_A_TIER_NOT_OFFERED: Design = {
    ...U_KITCHEN.design,
    settings: { ...U_KITCHEN.design.settings, materialTierId: "material.x" },
  };

  const UNPRICEABLE: readonly (readonly [
    string,
    PricingFailureCode,
    Design,
    Terms,
  ])[] = [
    [
      "a book of another version",
      "PRICING_VERSION_MISMATCH",
      U_KITCHEN.design,
      ANOTHER_BOOKS_VERSION,
    ],
    [
      "a book with no rule for any body",
      "NO_RULE_FOR_BODY",
      U_KITCHEN.design,
      { ...SHIPPED, book: { ...SAMPLE_PRICE_BOOK, cabinetRules: [] } },
    ],
    [
      "a book in another currency",
      "INVALID_PRICE_BOOK",
      U_KITCHEN.design,
      {
        ...SHIPPED,
        book: { ...SAMPLE_PRICE_BOOK, currency: "EUR" } as unknown as PriceBook,
      },
    ],
    [
      "a design naming a tier the book does not offer",
      "UNKNOWN_TIER",
      WITH_A_TIER_NOT_OFFERED,
      SHIPPED,
    ],
  ];

  // Criterion 15: a price that cannot be computed is our fault, and its refusal says what failed.
  it.each(UNPRICEABLE)(
    "says the price failed and why, exactly as priceDesign said it, under %s",
    (_name, code, design, terms) => {
      const refusal = refusalOf(design, terms);

      expect(refusal).toEqual({
        code: "PRICING_FAILED",
        failure: failureOf(design, terms),
      });
      expect(refusal).toMatchObject({ failure: { code } });
    },
  );

  it.each(UNPRICEABLE)(
    "re-words nothing and adds nothing under %s: the failure has priceDesign's keys and no other",
    (_name, _code, design, terms) => {
      const refusal = refusalOf(design, terms);
      if (refusal.code !== "PRICING_FAILED")
        throw new Error("expected a pricing failure");

      expect(Object.keys(refusal).sort()).toEqual(["code", "failure"]);
      expect(Object.keys(refusal.failure).sort()).toEqual(
        Object.keys(failureOf(design, terms)).sort(),
      );
    },
  );

  it("hands on the very failure it was given, not a copy of it", () => {
    const pricing: PricingResult = {
      ok: false,
      failure: { code: "INVALID_PRICE_BOOK", detail: "unreadable" },
    };

    const eligibility = judgeSubmissionEligibility({
      design: KITCHEN_L_DESIGN,
      overflowingPlacementIds: [],
      pricing,
    });

    expect(
      eligibility.kind === "refused" &&
        eligibility.refusal.code === "PRICING_FAILED" &&
        eligibility.refusal.failure === pricing.failure,
    ).toBe(true);
  });

  it("carries no failure with the two refusals a customer can mend", () => {
    expect(
      Object.keys(
        refusalOf(
          withABodyPastItsWall(U_KITCHEN.design, "A"),
          ANOTHER_BOOKS_VERSION,
        ),
      ).sort(),
    ).toEqual(["code", "placementIds"]);
    expect(Object.keys(refusalOf(NO_BODIES, ANOTHER_BOOKS_VERSION))).toEqual([
      "code",
    ]);
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

// Criterion 18 (QA finding 3, ruled): the rule is still handed the fit query's answer, and throws where the
// facts it is handed cannot all be true.
describe("8H criterion 18: judgeSubmissionEligibility refuses facts that contradict each other", () => {
  const overflowing = withABodyPastItsWall(KITCHEN_L_DESIGN, "A");
  const overflowingIds = findOverflowingPlacementIds(overflowing);
  const pricing = priceDesign({
    ...requestFor(overflowing),
    selections: overflowing.settings,
  });
  const fitting = priceDesign({
    ...requestFor(KITCHEN_L_DESIGN),
    selections: KITCHEN_L_DESIGN.settings,
  });
  const UNPRICED: PricingResult = {
    ok: false,
    failure: { code: "INVALID_PRICE_BOOK", detail: "unreadable" },
  };
  const [HELD, ALSO_HELD] = KITCHEN_L_DESIGN.placements.map(({ id }) => id);
  if (HELD === undefined || ALSO_HELD === undefined) {
    throw new Error("the seeded kitchen holds two bodies");
  }

  it("prices the overflowing kitchen with its total flagged", () => {
    expect(pricing).toMatchObject({
      ok: true,
      priced: { totalIsFlagged: true },
    });
    expect(overflowingIds).toHaveLength(1);
  });

  it("throws for a kitchen whose own price says a body is past its wall, when handed no ids", () => {
    expect(() =>
      judgeSubmissionEligibility({
        design: overflowing,
        overflowingPlacementIds: [],
        pricing,
      }),
    ).toThrow(SubmissionFactsContradictionError);
  });

  it("throws for a body the design does not hold, priced or not", () => {
    for (const result of [fitting, UNPRICED]) {
      expect(() =>
        judgeSubmissionEligibility({
          design: KITCHEN_L_DESIGN,
          overflowingPlacementIds: ["no-such-body"],
          pricing: result,
        }),
      ).toThrow(SubmissionFactsContradictionError);
    }
  });

  it.each([
    [
      "a body the design holds that the price says fits",
      KITCHEN_L_DESIGN,
      [HELD],
      fitting,
    ],
    ["one body too many", overflowing, [...overflowingIds, ALSO_HELD], pricing],
    [
      "another body in place of the one past its wall",
      overflowing,
      [ALSO_HELD],
      pricing,
    ],
    [
      "a body the design does not hold beside the right one",
      overflowing,
      [...overflowingIds, "ghost"],
      pricing,
    ],
    ["an empty id", KITCHEN_L_DESIGN, [""], fitting],
  ])("throws when handed %s", (_name, design, ids, result) => {
    expect(() =>
      judgeSubmissionEligibility({
        design,
        overflowingPlacementIds: ids,
        pricing: result,
      }),
    ).toThrow(SubmissionFactsContradictionError);
  });

  it("compares sets: the same bodies in another order, or named twice, are the same facts", () => {
    const three = (["A", "B"] as const).reduce(
      (design, wall) => withABodyPastItsWall(design, wall),
      KITCHEN_L_DESIGN,
    );
    const ids = findOverflowingPlacementIds(three);
    const priced = priceDesign({
      ...requestFor(three),
      selections: three.settings,
    });
    const reversedAndRepeated = [...ids].reverse().concat(ids);

    expect(ids.length).toBeGreaterThan(1);
    expect(
      judgeSubmissionEligibility({
        design: three,
        overflowingPlacementIds: reversedAndRepeated,
        pricing: priced,
      }),
    ).toEqual({
      kind: "refused",
      refusal: { code: "BODIES_PAST_WALL", placementIds: reversedAndRepeated },
    });
  });

  it("throws before it judges: no refusal and no allowance comes back with contradicting facts", () => {
    const outcomes = [
      { design: overflowing, overflowingPlacementIds: [], pricing },
      {
        design: KITCHEN_L_DESIGN,
        overflowingPlacementIds: [HELD],
        pricing: fitting,
      },
      {
        design: { ...KITCHEN_L_DESIGN, placements: [] },
        overflowingPlacementIds: [HELD],
        pricing: UNPRICED,
      },
    ].map((facts) => thrownBy(() => judgeSubmissionEligibility(facts)).name);

    expect(outcomes).toEqual(
      outcomes.map(() => "SubmissionFactsContradictionError"),
    );
  });

  it("says which bodies it differs over, on one line and within a bound, whatever the ids hold", () => {
    const hostile = Array.from(
      { length: 300 },
      (_, index) => `ghost-${String(index)}\r\nforged line`,
    );

    const { message } = thrownBy(() =>
      judgeSubmissionEligibility({
        design: KITCHEN_L_DESIGN,
        overflowingPlacementIds: hostile,
        pricing: fitting,
      }),
    );

    expect(message).toMatch(/^The submission facts contradict each other: /);
    expect(message.length).toBeLessThan(400);
    expect(/[\r\n]/.test(message)).toBe(false);
  });

  it("names placement ids in its message and nothing else of the design or the price", () => {
    const { message } = thrownBy(() =>
      judgeSubmissionEligibility({
        design: overflowing,
        overflowingPlacementIds: [],
        pricing,
      }),
    );

    expect(message).toBe(
      `The submission facts contradict each other: the fit list and the price's own list differ over: ${overflowingIds.join(", ")}`,
    );
  });

  // QA finding 13, as built. Without a price the rule has nothing to hold the list to but the design's ids,
  // so it still believes a list naming a body that fits, and repeats an id as often as it was handed it.
  it("as built: unpriced, refuses for a body that fits when handed its id, twice if handed it twice", () => {
    expect(findOverflowingPlacementIds(KITCHEN_L_DESIGN)).toEqual([]);
    expect(
      judgeSubmissionEligibility({
        design: KITCHEN_L_DESIGN,
        overflowingPlacementIds: [HELD, HELD],
        pricing: UNPRICED,
      }),
    ).toEqual({
      kind: "refused",
      refusal: { code: "BODIES_PAST_WALL", placementIds: [HELD, HELD] },
    });
  });

  // QA finding 14, as built. The list is held to the price's own list, and nothing holds the price to the
  // design: handed another kitchen's price, the rule allows a kitchen with a body past its wall. The review
  // checks the price against its rows; `snapshotSubmission` prices the design it judges.
  it("as built: allows an overflowing kitchen when handed no ids and the price of another kitchen that fits", () => {
    expect(
      judgeSubmissionEligibility({
        design: overflowing,
        overflowingPlacementIds: [],
        pricing: fitting,
      }),
    ).toMatchObject({ kind: "allowed" });
  });

  it("cannot be made to through the snapshot, which asks the query itself", () => {
    expect(refusalOf(overflowing)).toEqual({
      code: "BODIES_PAST_WALL",
      placementIds: findOverflowingPlacementIds(overflowing),
    });
  });
});

// Ruling S-R1.4: the one shared helper that bounds a failure reason blanks line and paragraph separators as
// well as control and format characters, so nothing in a thrown message can begin a line of its own.
describe("8H ruling on failure text: no character that ends a line survives into a thrown message", () => {
  const LAST_CODE_POINT = 0x10ffff;
  const LINE_FORGING = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

  const forging = Array.from({ length: LAST_CODE_POINT + 1 }, (_, codePoint) =>
    codePoint >= 0xd800 && codePoint <= 0xdfff
      ? ""
      : String.fromCodePoint(codePoint),
  ).filter((character) => character !== "" && LINE_FORGING.test(character));

  it("sweeps every control, format, line-separator and paragraph-separator character", () => {
    expect(forging.length).toBeGreaterThan(200);
    expect(forging).toEqual(
      expect.arrayContaining([
        "\n",
        "\r",
        String.fromCodePoint(0x85),
        String.fromCodePoint(0x2028),
        String.fromCodePoint(0x2029),
        String.fromCodePoint(0x202e),
      ]),
    );
  });

  it("blanks each of them in a bounded reason", () => {
    const surviving = forging.filter((character) =>
      LINE_FORGING.test(boundedFailureReason(`before${character}after`)),
    );

    expect(surviving).toEqual([]);
  });

  it("keeps a reason one line when a placement id the caller hands in holds each of them", () => {
    const fitting = priceDesign({
      ...requestFor(KITCHEN_L_DESIGN),
      selections: KITCHEN_L_DESIGN.settings,
    });

    const forged = forging.filter((character) => {
      const { message } = thrownBy(() =>
        judgeSubmissionEligibility({
          design: KITCHEN_L_DESIGN,
          overflowingPlacementIds: [`ghost${character}forged line`],
          pricing: fitting,
        }),
      );
      return (
        LINE_FORGING.test(message) || !message.includes("ghost forged line")
      );
    });

    expect(forged).toEqual([]);
  });

  it("keeps a reason one line when the design's own placement id holds a line or paragraph separator", () => {
    const [first] = KITCHEN_L_DESIGN.placements;
    if (first === undefined) throw new Error("the seeded kitchen is empty");
    const separators = [
      String.fromCodePoint(0x2028),
      String.fromCodePoint(0x2029),
    ];

    const messages = separators.map((separator) => {
      const renamed: Design = {
        ...KITCHEN_L_DESIGN,
        placements: [
          { ...first, id: `body${separator}forged`, alongMm: 100_000 },
          ...KITCHEN_L_DESIGN.placements.slice(1),
        ],
      };
      const pricing = priceDesign({
        ...requestFor(renamed),
        selections: renamed.settings,
      });
      return thrownBy(() =>
        judgeSubmissionEligibility({
          design: renamed,
          overflowingPlacementIds: [],
          pricing,
        }),
      ).message;
    });

    expect(messages).toEqual(
      messages.map(
        () =>
          "The submission facts contradict each other: the fit list and the price's own list differ over: body forged",
      ),
    );
  });
});
