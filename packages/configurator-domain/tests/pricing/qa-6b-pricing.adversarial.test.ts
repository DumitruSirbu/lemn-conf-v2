// Adversarial QA for wave 6B — the price book and the pure pricing query.
//
// `price-design.test.ts` and `pricing-seams.test.ts` cover the wave's own claims. This file exists
// to look for the counterexamples they do not construct: the refusal paths that could still publish
// a partial answer, the two lookups that must differ read from the *other* direction, the amounts a
// non-integer coefficient could smuggle past `Number.isSafeInteger`, and the catalogue rows a
// customer can insert that the shipped book prices nothing for.
//
// Every amount here is read off the book under test. Nothing in this file states a figure, so no
// assertion can quietly become a commercial one (ADR 0001 decision 4).
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  cabinetHandleCount,
  widthDerivedDoorLeafCount,
} from "../../src/cabinet-handles.js";
import {
  INSERTABLE_BODY_DEFINITIONS,
  resolveCatalogEquivalent,
} from "../../src/catalog.js";
import {
  DesignSchema,
  type CabinetBody,
  type Design,
  type DesignPlacement,
} from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  amountForBody,
  pricedByWidth,
  pricedFlat,
  type CabinetPriceRule,
  type PriceBook,
} from "../../src/pricing/price-book.js";
import {
  priceDesign,
  type PriceDesignRequest,
} from "../../src/pricing/price-design.js";
import type {
  CabinetPriceLine,
  PriceLine,
  PricedDesign,
} from "../../src/pricing/price-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { projectDesignForDisplay } from "../../src/queries/design-projection.js";
import { findOverflowingPlacementIds } from "../../src/queries/overflowing-placements.js";
import { validateDesignForCatalog } from "../../src/validate-design.js";
import type { BodyCatalog, BodyDefinition } from "../../src/void-engine.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const BOOK = SAMPLE_PRICE_BOOK;

function designOf(placements: readonly DesignPlacement[]): Design {
  return { ...KITCHEN_L_DESIGN, placements: [...placements] };
}

function placedAt(
  overrides: Omit<Partial<DesignPlacement>, "body"> & {
    readonly id: string;
    readonly body?: Partial<CabinetBody>;
  },
): DesignPlacement {
  return {
    wall: "A",
    alongMm: 1300,
    y0Mm: 1500,
    ...overrides,
    body: {
      buildId: "wall-cabinet",
      widthMm: 600,
      heightMm: 700,
      ...overrides.body,
    },
  };
}

function request(
  overrides: Partial<PriceDesignRequest> = {},
): PriceDesignRequest {
  return {
    design: KITCHEN_L_DESIGN,
    catalog: CATALOG,
    book: BOOK,
    pricingVersion: BOOK.version,
    ...overrides,
  };
}

function priceOrFail(
  overrides: Partial<PriceDesignRequest> = {},
): PricedDesign {
  const result = priceDesign(request(overrides));
  if (!result.ok) {
    throw new Error(`${result.failure.code}: ${result.failure.detail}`);
  }
  return result.priced;
}

/** The failure branch, plus the two things every refusal owes: a code, and **nothing else**. A
 *  result carrying a `priced` beside a failure is the partial answer this wave forbids. */
function refusalFrom(overrides: Partial<PriceDesignRequest>) {
  const result = priceDesign(request(overrides));
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected a refusal");
  expect(result).not.toHaveProperty("priced");
  expect(Object.keys(result).sort()).toEqual(["failure", "ok"]);
  return result.failure;
}

function cabinetLinesOf(priced: PricedDesign): readonly CabinetPriceLine[] {
  return priced.lines.filter(
    (line): line is CabinetPriceLine => line.kind === "cabinet",
  );
}

function lineOfKind(priced: PricedDesign, kind: PriceLine["kind"]): PriceLine {
  const line = priced.lines.find((candidate) => candidate.kind === kind);
  if (!line) throw new Error(`no ${kind} line`);
  return line;
}

function bookWithRuleFor(
  buildId: string,
  rule: Partial<CabinetPriceRule>,
): PriceBook {
  return {
    ...BOOK,
    cabinetRules: BOOK.cabinetRules.map((candidate) =>
      candidate.buildId === buildId ? { ...candidate, ...rule } : candidate,
    ),
  };
}

function catalogWith(
  buildId: string,
  amendment: Partial<BodyDefinition>,
): BodyCatalog {
  const definition = CATALOG.get(buildId);
  if (!definition) throw new Error(`fixture has no entry "${buildId}"`);
  return new Map(CATALOG).set(buildId, { ...definition, ...amendment });
}

describe("the two lookups that must differ, read from the other direction", () => {
  // `price-design.test.ts` constructs the divergence on the handle count. This block constructs it
  // on the *rule*: a body whose own id and whose equivalent both carry a rule, so a query that read
  // the literal `buildId` for resolution would still find something and price it wrongly rather
  // than fail. That defect is invisible to a test whose seeded body has no rule of its own.
  const OWN_ID = "base-sink-800";

  it("prices through the equivalent even when the placement's own id also carries a rule", () => {
    const equivalentRule = BOOK.cabinetRules.find(
      (rule) => rule.buildId === "base-sink",
    );
    if (!equivalentRule) throw new Error("the sample book prices no base-sink");
    const bookNamingBoth: PriceBook = {
      ...BOOK,
      cabinetRules: [
        ...BOOK.cabinetRules,
        {
          ruleId: "cabinet.decoy-own-id",
          buildId: OWN_ID,
          formula: pricedFlat(equivalentRule.formula.baseMinor + 1),
        },
      ],
    };

    const priced = priceOrFail({
      design: designOf([
        placedAt({ id: "s", body: { buildId: OWN_ID, widthMm: 800 } }),
      ]),
      book: bookNamingBoth,
    });
    const line = cabinetLinesOf(priced)[0];

    expect(line?.pricedAsBuildId).toBe("base-sink");
    expect(line?.ruleId).toBe(equivalentRule.ruleId);
    expect(line?.ruleId).not.toBe("cabinet.decoy-own-id");
  });

  it("counts handles off the own row even when the equivalent's count is the larger one", () => {
    // The mirror of the corner case the wave's own suite constructs: there the body declares fewer
    // handles than its equivalent would derive, so a swapped lookup over-bills by one. Here the
    // body declares **none** — a seeded hood, whose only bars are the appliance's — and the
    // equivalent would derive two, so a swapped lookup bills hardware on a body that carries none.
    const hoodNamedAfterWallCabinet = catalogWith("hood-600", {
      catalogEquivalentId: "wall-cabinet",
    });
    const priced = priceOrFail({
      design: designOf([
        placedAt({ id: "o", body: { buildId: "hood-600", widthMm: 600 } }),
      ]),
      catalog: hoodNamedAfterWallCabinet,
      selections: { hardwareTierId: "hardware.premium" },
    });

    expect(cabinetLinesOf(priced)[0]?.pricedAsBuildId).toBe("wall-cabinet");
    expect(lineOfKind(priced, "hardware").quantity).toBe(0);
    expect(
      cabinetHandleCount({
        buildId: "wall-cabinet",
        rule: CATALOG.get("wall-cabinet")?.cabinetHandles,
        widthMm: 600,
      }),
    ).toBe(2);
  });

  it("names the equivalent, not the literal build id, when the rule is the missing one", () => {
    // A seeded body whose §7 row the book does not price. The refusal must name what it could not
    // resolve, which is the equivalent — naming the seeded id would send a reader to a row no book
    // is ever expected to hold.
    const withoutSink: PriceBook = {
      ...BOOK,
      cabinetRules: BOOK.cabinetRules.filter(
        (rule) => rule.buildId !== "base-sink",
      ),
    };

    const failure = refusalFrom({
      design: designOf([
        placedAt({ id: "s", body: { buildId: OWN_ID, widthMm: 800 } }),
      ]),
      book: withoutSink,
    });

    expect(failure).toMatchObject({
      code: "NO_RULE_FOR_BODY",
      placementId: "s",
      id: "base-sink",
    });
  });
});

describe("the shipped book prices everything a customer can stand in a design", () => {
  it("carries a rule for every insertable catalogue row", () => {
    // A §7 row with no rule is not a pricing bug the customer sees as a wrong number — it is one
    // that makes the *whole* design unpriceable the moment they insert it, because pricing fails
    // whole. Held over the shipped catalogue rather than over the fixture's placements.
    const priced = new Set(BOOK.cabinetRules.map((rule) => rule.buildId));
    const unpriced = INSERTABLE_BODY_DEFINITIONS.map(([buildId]) => buildId)
      .filter((buildId) => !priced.has(buildId))
      .sort();

    expect(unpriced).toEqual([]);
  });

  it("resolves a rule for every entry in the seeded catalogue", () => {
    const priced = new Set(BOOK.cabinetRules.map((rule) => rule.buildId));
    const unresolvable = [...CATALOG.keys()]
      .filter((buildId) => {
        const equivalent = resolveCatalogEquivalent(CATALOG, buildId)?.buildId;
        return !priced.has(equivalent ?? buildId);
      })
      .sort();

    expect(unresolvable).toEqual([]);
  });
});

describe("degenerate designs and degenerate books", () => {
  it("prices a design of nothing but empty columns as no cabinet line at all", () => {
    // `emptyColumns` are space, not bodies: the projection yields zero groups, so pricing yields
    // zero cabinet lines and still both whole-kitchen lines.
    const onlySpace: Design = {
      ...KITCHEN_L_DESIGN,
      placements: [],
      emptyColumns: [
        {
          wall: "A",
          alongMm: 600,
          widthMm: 600,
          y0Mm: 0,
          topMm: 900,
          depthMm: 600,
        },
      ],
    };

    const priced = priceOrFail({ design: onlySpace });

    expect(cabinetLinesOf(priced)).toEqual([]);
    expect(priced.lines.map((line) => line.kind)).toEqual([
      "hardware",
      "material",
    ]);
    expect(priced.totalMinor).toBe(0);
  });

  it("prices an empty design unflagged, because an empty design overflows nothing", () => {
    const priced = priceOrFail({ design: designOf([]) });

    expect(priced.totalIsFlagged).toBe(false);
    expect(priced.overflowingPlacementIds).toEqual([]);
  });

  it("prices an empty design against a book holding no cabinet rule at all", () => {
    const priced = priceOrFail({
      design: designOf([]),
      book: { ...BOOK, cabinetRules: [] },
    });

    expect(priced.lines).toHaveLength(2);
  });

  it("refuses the first placement in display order against a book with no rules", () => {
    const failure = refusalFrom({
      book: { ...BOOK, cabinetRules: [] },
    });
    const firstInDisplayOrder = projectDesignForDisplay(
      KITCHEN_L_DESIGN,
      CATALOG,
    ).flatMap((group) => group.entries)[0];

    expect(failure.code).toBe("NO_RULE_FOR_BODY");
    expect(failure.placementId).toBe(firstInDisplayOrder?.placementId);
  });

  it("refuses a rule id repeated across two different tier groups", () => {
    // `listRuleIds` spans all three collections, so a hardware tier colliding with a material one
    // is as untraceable as two cabinet rules colliding — the case the wave's own suite skips.
    const collided: PriceBook = {
      ...BOOK,
      material: {
        ...BOOK.material,
        tiers: BOOK.material.tiers.map((tier, index) =>
          index === 0
            ? { ...tier, ruleId: BOOK.hardware.tiers[0]?.ruleId ?? tier.ruleId }
            : tier,
        ),
      },
    };

    expect(refusalFrom({ book: collided }).code).toBe("INVALID_PRICE_BOOK");
  });

  it("refuses a book whose own default names no tier, with no selection to blame", () => {
    const noDefault: PriceBook = {
      ...BOOK,
      hardware: { ...BOOK.hardware, defaultTierId: "hardware.retired" },
    };

    expect(refusalFrom({ book: noDefault })).toMatchObject({
      code: "UNKNOWN_TIER",
      id: "hardware.retired",
    });
  });

  it("refuses a book whose currency is not the one every book is in", () => {
    const foreign = { ...BOOK, currency: "EUR" } as unknown as PriceBook;

    expect(refusalFrom({ book: foreign }).code).toBe("INVALID_PRICE_BOOK");
  });
});

describe("no rounding, and no float that could produce one", () => {
  it("refuses a fractional amount rather than rounding it to a whole minor unit", () => {
    const fractional = bookWithRuleFor("wall-cabinet", {
      formula: pricedByWidth({ baseMinor: 0, perWidthMillimetreMinor: 0.5 }),
    });

    expect(
      refusalFrom({
        design: designOf([placedAt({ id: "x", body: { widthMm: 575 } })]),
        book: fractional,
      }),
    ).toMatchObject({ code: "INVALID_AMOUNT", placementId: "x" });
  });

  it("refuses the fractional amount a fractional width produces, where it produces one", () => {
    // The query guards the **amount**, not the width. `DesignSchema` is what forbids a fractional
    // width, and every shipped coefficient is a multiple of 50, so a half-millimetre width happens
    // to land on a whole amount under the shipped book. An odd coefficient is where it does not,
    // and that is the case the guard has to catch.
    const oddCoefficient = bookWithRuleFor("wall-cabinet", {
      formula: pricedByWidth({ baseMinor: 0, perWidthMillimetreMinor: 301 }),
    });

    expect(
      refusalFrom({
        design: designOf([placedAt({ id: "x", body: { widthMm: 575.5 } })]),
        book: oddCoefficient,
      }).code,
    ).toBe("INVALID_AMOUNT");
    expect(
      DesignSchema.safeParse(
        designOf([placedAt({ id: "x", body: { widthMm: 575.5 } })]),
      ).success,
    ).toBe(false);
  });

  it("refuses a fractional hardware tier amount rather than a fractional handle line", () => {
    const fractionalHardware: PriceBook = {
      ...BOOK,
      hardware: {
        ...BOOK.hardware,
        tiers: BOOK.hardware.tiers.map((tier) =>
          tier.tierId === BOOK.hardware.defaultTierId
            ? { ...tier, perCabinetHandleMinor: 0.25 }
            : tier,
        ),
      },
    };

    // Named on the **tier's** rule, not merely caught later by the total's own guard: a refusal
    // that only says "the total is not exact" points at nothing anybody can fix.
    expect(refusalFrom({ book: fractionalHardware })).toMatchObject({
      code: "INVALID_AMOUNT",
      id: BOOK.hardware.defaultTierId,
    });
  });

  it("gives the same total however the placements are stored", () => {
    // Integer addition is exact, so this holds — but it is the property that fails first if an
    // amount ever becomes a float, and it is not asserted by the order tests.
    const totals = new Set<number>();
    const placements = KITCHEN_L_DESIGN.placements;
    for (let rotation = 0; rotation < placements.length; rotation += 1) {
      totals.add(
        priceOrFail({
          design: designOf([
            ...placements.slice(rotation),
            ...placements.slice(0, rotation),
          ]),
        }).totalMinor,
      );
    }

    expect(totals.size).toBe(1);
  });

  it("returns amounts that are all exact safe integers, on every line", () => {
    const priced = priceOrFail({
      selections: {
        hardwareTierId: "hardware.premium",
        materialTierId: "material.veneer",
      },
    });

    for (const line of priced.lines) {
      expect(Number.isSafeInteger(line.unitAmountMinor)).toBe(true);
      expect(Number.isSafeInteger(line.quantity)).toBe(true);
      expect(line.amountMinor).toBe(line.quantity * line.unitAmountMinor);
      expect(Number.isSafeInteger(line.amountMinor)).toBe(true);
    }
    expect(priced.totalMinor).toBe(
      [...priced.lines]
        .reverse()
        .reduce((sum, line) => sum + line.amountMinor, 0),
    );
  });

  it("answers nothing at all for a formula shape it does not implement", () => {
    // The union has grown from one shape to three and this must not have loosened: a book from
    // another source may carry a shape this build has never heard of, and it is refused rather than
    // evaluated on whichever coefficients it happens to share.
    const body = { widthMm: 600, heightMm: 700, doorLeafCount: 2 };

    expect(amountForBody(undefined, body)).toBeUndefined();
    expect(
      amountForBody(
        { shape: "per-metre" } as unknown as CabinetPriceRule["formula"],
        body,
      ),
    ).toBeUndefined();
    expect(
      amountForBody(null as unknown as CabinetPriceRule["formula"], body),
    ).toBeUndefined();
    expect(
      amountForBody(
        {
          shape: "linear-in-front-area",
          baseMinor: 1,
          perWidthMillimetreMinor: 1,
          perHeightMillimetreMinor: 1,
        } as unknown as CabinetPriceRule["formula"],
        body,
      ),
    ).toBeUndefined();
  });
});

describe("the formula holds across the whole buildable range, not at examples", () => {
  const RANGE = { min: 200, max: 800 };

  propertyTest.prop([fc.integer(RANGE)])(
    "prices a hinged wall cabinet from its coefficients at every width it can be built to",
    (widthMm) => {
      // **Was two coefficients until 2026-09-03**, when the owner ruled that another door costs
      // another handle, another set of mechanisms and more processing margin. The property is
      // unchanged in kind — every width in the range is priced by the row's own coefficients and by
      // no width row — and the door term is the count derived from the width, never a stated one.
      const rule = BOOK.cabinetRules.find(
        (candidate) => candidate.buildId === "wall-cabinet",
      );
      if (!rule) throw new Error("the sample book prices no wall-cabinet");
      const { formula } = rule;
      if (
        !("perDoorLeafMinor" in formula) ||
        !("perHeightMillimetreMinor" in formula)
      ) {
        throw new Error("the sample book no longer steps the wall cabinet");
      }
      const heightMm = 700;

      const priced = priceOrFail({
        design: designOf([placedAt({ id: "x", body: { widthMm, heightMm } })]),
      });

      expect(cabinetLinesOf(priced)[0]?.amountMinor).toBe(
        formula.baseMinor +
          formula.perWidthMillimetreMinor * widthMm +
          formula.perHeightMillimetreMinor * heightMm +
          formula.perDoorLeafMinor *
            widthDerivedDoorLeafCount({
              buildId: "wall-cabinet",
              rule: CATALOG.get("wall-cabinet")?.cabinetHandles,
              widthMm,
            }),
      );
    },
  );

  propertyTest.prop([fc.integer(RANGE), fc.integer(RANGE)])(
    "keeps the amount monotonic in width, with one jump and no dip",
    (a, b) => {
      // The step must never be a discount. Stated over an unordered pair, so a coefficient sign
      // flipped in the book is caught rather than only a threshold placed wrongly.
      const [narrow, wide] = a <= b ? [a, b] : [b, a];
      const amountAt = (widthMm: number) =>
        cabinetLinesOf(
          priceOrFail({
            design: designOf([placedAt({ id: "x", body: { widthMm } })]),
          }),
        )[0]?.amountMinor ?? Number.NaN;

      expect(amountAt(wide)).toBeGreaterThanOrEqual(amountAt(narrow));
    },
  );

  it("prices the declared minimum and maximum width, with no row for either", () => {
    for (const widthMm of [RANGE.min, RANGE.max]) {
      const priced = priceOrFail({
        design: designOf([placedAt({ id: "x", body: { widthMm } })]),
      });
      expect(cabinetLinesOf(priced)[0]?.widthMm).toBe(widthMm);
      expect(Number.isSafeInteger(cabinetLinesOf(priced)[0]?.amountMinor)).toBe(
        true,
      );
    }
  });

  it("prices a flat-rule body identically at every width, without keying on one", () => {
    const amounts = new Set<number>();
    for (const widthMm of [RANGE.min, 555, 575, 600, RANGE.max]) {
      amounts.add(
        priceOrFail({
          design: designOf([
            placedAt({
              id: "x",
              body: { buildId: "tall-oven-tower", widthMm, heightMm: 2200 },
            }),
          ]),
        }).lines[0]?.amountMinor ?? Number.NaN,
      );
    }

    expect(amounts.size).toBe(1);
  });
});

describe("the order is a function of the design, over shuffles and not rotations", () => {
  propertyTest.prop([
    fc.shuffledSubarray(KITCHEN_L_DESIGN.placements, {
      minLength: KITCHEN_L_DESIGN.placements.length,
    }),
  ])(
    "lists the same placements in the same order however they arrive",
    (shuffled) => {
      const expected = projectDesignForDisplay(KITCHEN_L_DESIGN, CATALOG)
        .flatMap((group) => group.entries)
        .map((entry) => entry.placementId);

      expect(
        cabinetLinesOf(priceOrFail({ design: designOf(shuffled) })).map(
          (line) => line.placementId,
        ),
      ).toEqual(expected);
    },
  );

  it("breaks a four-key tie by bytes, in the price lines and not only in the projection", () => {
    // `compareIds` uses `<` rather than `localeCompare`, which orders "B" before "a" where a locale
    // does the reverse. 6A pins that on the comparator; this pins it on the document the customer
    // is shown, which is the reason the criterion is recorded in this wave at all.
    const tied = designOf([placedAt({ id: "a" }), placedAt({ id: "B" })]);

    expect(
      cabinetLinesOf(priceOrFail({ design: tied })).map(
        (line) => line.placementId,
      ),
    ).toEqual(["B", "a"]);
    expect("B".localeCompare("a")).toBeGreaterThan(0);
  });

  it("rests on a uniqueness the validator grants and the schema does not", () => {
    // The comparator's last key is the placement id, so the order above is only total while ids are
    // unique. `DesignSchema` permits a duplicate; `validateDesignForCatalog` refuses it.
    const duplicated = designOf([
      placedAt({ id: "same" }),
      placedAt({ id: "same", alongMm: 2000 }),
    ]);

    expect(DesignSchema.safeParse(duplicated).success).toBe(true);
    expect(
      validateDesignForCatalog(duplicated, CATALOG).map((issue) => issue.code),
    ).toContain("DUPLICATE_PLACEMENT_ID");
  });
});

describe("fail whole, on every path", () => {
  const REFUSALS: readonly {
    readonly name: string;
    readonly overrides: Partial<PriceDesignRequest>;
    readonly code: string;
  }[] = [
    {
      name: "a book in the wrong currency",
      overrides: { book: { ...BOOK, currency: "USD" } as unknown as PriceBook },
      code: "INVALID_PRICE_BOOK",
    },
    {
      name: "a version that is not the one asked for",
      overrides: { pricingVersion: `${BOOK.version} ` },
      code: "PRICING_VERSION_MISMATCH",
    },
    {
      name: "a body the catalogue does not hold",
      overrides: {
        design: designOf([placedAt({ id: "x", body: { buildId: "nope" } })]),
      },
      code: "UNKNOWN_BODY",
    },
    {
      name: "a tier nothing offers",
      overrides: { selections: { hardwareTierId: "hardware.gone" } },
      code: "UNKNOWN_TIER",
    },
    {
      name: "a book with no rule for a placed body",
      overrides: { book: { ...BOOK, cabinetRules: [] } },
      code: "NO_RULE_FOR_BODY",
    },
  ];

  for (const refusal of REFUSALS) {
    it(`publishes no line and no total for ${refusal.name}`, () => {
      expect(refusalFrom(refusal.overrides).code).toBe(refusal.code);
    });
  }

  propertyTest.prop([
    fc.string().filter((version) => version !== SAMPLE_PRICE_BOOK.version),
  ])("requires version equality and accepts no near miss", (pricingVersion) => {
    expect(refusalFrom({ pricingVersion }).code).toBe(
      "PRICING_VERSION_MISMATCH",
    );
  });

  it("refuses a version differing only in case", () => {
    expect(
      refusalFrom({ pricingVersion: BOOK.version.toUpperCase() }).code,
    ).toBe("PRICING_VERSION_MISMATCH");
  });
});

/** Far enough along any wall that a body centred there passes its end whichever wall it stands on,
 *  and applied as a **shift** so the placements keep their relative order and the projection's line
 *  order with it. */
const PAST_EVERY_WALL_MM = 9_000;

/** The seeded kitchen with every body pushed past the end of its own wall. The overflow has to be
 *  created in the **document**, because since ADR 0069 decision 5c that is the only place pricing
 *  reads it from: `priceDesign` derives the fact and accepts no report. */
function everyBodyPastItsWall(): Design {
  return designOf(
    KITCHEN_L_DESIGN.placements.map((placement) => ({
      ...placement,
      alongMm: placement.alongMm + PAST_EVERY_WALL_MM,
    })),
  );
}

describe("an overflowing design loses nothing, even when all of it overflows", () => {
  it("prices every body when every body overflows", () => {
    const design = everyBodyPastItsWall();
    const fitting = priceOrFail();
    const overflowing = priceOrFail({ design });

    expect(overflowing.lines).toEqual(fitting.lines);
    expect(overflowing.totalMinor).toBe(fitting.totalMinor);
    expect(overflowing.totalMinor).toBeGreaterThan(0);
    expect(overflowing.totalIsFlagged).toBe(true);
    expect(cabinetLinesOf(overflowing)).toHaveLength(design.placements.length);
  });

  it("does not let the overflow change the hardware quantity", () => {
    const selections = { hardwareTierId: "hardware.premium" } as const;

    expect(
      lineOfKind(
        priceOrFail({ selections, design: everyBodyPastItsWall() }),
        "hardware",
      ).quantity,
    ).toBe(lineOfKind(priceOrFail({ selections }), "hardware").quantity);
  });

  /** The property the deleted `UNKNOWN_OVERFLOW_PLACEMENT` refusal was protecting, restated as what
   *  now makes it unrepresentable: the published set **is** the design's own, from the one query
   *  every other surface reads, so a set naming a placement the design does not contain has no way
   *  in. */
  it("publishes exactly the ids the published overflow query answers", () => {
    const design = everyBodyPastItsWall();

    expect(priceOrFail({ design }).overflowingPlacementIds).toEqual([
      ...findOverflowingPlacementIds(design),
    ]);
    expect(priceOrFail().overflowingPlacementIds).toEqual([
      ...findOverflowingPlacementIds(KITCHEN_L_DESIGN),
    ]);
  });
});

describe("no commercial figure, and no total stored", () => {
  it("exports the sample book itself, as an estimate whose amounts are provisional", () => {
    expect(BOOK.status).toBe("estimate");
    expect(BOOK.amountsProvisional).toBe(true);
    expect(priceOrFail().status).not.toBe("commercial");
  });

  it("refuses a design document carrying a total, under either field name", () => {
    for (const field of ["totalMinor", "priceMinor", "price"]) {
      expect(
        DesignSchema.safeParse({ ...KITCHEN_L_DESIGN, [field]: 1 }).success,
      ).toBe(false);
    }
  });
});
