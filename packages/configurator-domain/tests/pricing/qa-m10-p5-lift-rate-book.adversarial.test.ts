// ADR 0177 A-20, adversarial: the lift and push-runner rates as a book carries them. Where the implementer's tests hold each
// refusal in isolation, these run the rate through the whole path a stored or drafted book takes: parse, JSON
// round-trip, a created class priced end to end, and a book stored before the rate existed.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { applyChanges } from "../../src/price-dashboard/apply-changes.js";
import { HARDWARE_RATE_FIELDS } from "../../src/price-dashboard/book-field-address.js";
import { MAX_PRICE_COEFFICIENT_MINOR } from "../../src/pricing/book-reading.js";
import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
import type { HardwareTier, PriceBook } from "../../src/pricing/price-book.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import { DEEPENING_ROWS } from "../price-dashboard/m2-support.js";
import {
  applied,
  change,
  createTier,
  refusalCodes,
  setRate,
  tierDraft,
} from "../price-dashboard/qa-m4-support.js";

type RateField = (typeof HARDWARE_RATE_FIELDS)[number];

const LIFT_RATE_KEYS = ["perLiftMinor"];

function withoutKeys(
  tier: HardwareTier,
  keys: readonly string[],
): HardwareTier {
  return Object.fromEntries(
    Object.entries(tier).filter(([key]) => !keys.includes(key)),
  ) as unknown as HardwareTier;
}

/** The sample book with every hardware tier stripped of the lift rate, as a version stored before that rate existed
 *  would read. */
const BOOK_WITHOUT_LIFT_RATE: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  hardware: {
    ...SAMPLE_PRICE_BOOK.hardware,
    tiers: SAMPLE_PRICE_BOOK.hardware.tiers.map((tier) =>
      withoutKeys(tier, LIFT_RATE_KEYS),
    ),
  },
};

function withFirstTierRate(field: RateField, value: unknown): unknown {
  const [first, ...rest] = SAMPLE_PRICE_BOOK.hardware.tiers;
  return {
    ...SAMPLE_PRICE_BOOK,
    hardware: {
      ...SAMPLE_PRICE_BOOK.hardware,
      tiers: [{ ...first, [field]: value }, ...rest],
    },
  };
}

function failureDetailOf(book: unknown): string {
  const parsed = parsePriceBook(book);
  if (parsed.ok) throw new Error("expected the book to be refused");
  return parsed.failure.detail;
}

describe("the sample book, as a stored version carries it", () => {
  it("survives a JSON round trip parsed whole, every tier keeping all its rates", () => {
    const stored: unknown = JSON.parse(JSON.stringify(SAMPLE_PRICE_BOOK));

    const parsed = parsePriceBook(stored);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.book).toEqual(SAMPLE_PRICE_BOOK);
    for (const tier of parsed.book.hardware.tiers) {
      for (const field of HARDWARE_RATE_FIELDS) {
        expect(typeof tier[field]).toBe("number");
      }
    }
  });

  it("states a non-zero lift rate on every tier, so a lift is never priced at nothing", () => {
    for (const tier of SAMPLE_PRICE_BOOK.hardware.tiers) {
      expect(tier.perLiftMinor).toBeGreaterThan(0);
    }
  });

  it("states a non-zero push-runner rate on every tier, so a push-to-open drawer is never priced at nothing", () => {
    for (const tier of SAMPLE_PRICE_BOOK.hardware.tiers) {
      expect(tier.perPushRunnerMinor).toBeGreaterThan(0);
    }
  });

  it("orders the tiers' push-runner rates as their hinge rates are ordered", () => {
    const tierIdsBy = (field: RateField): string[] =>
      [...SAMPLE_PRICE_BOOK.hardware.tiers]
        .sort((left, right) => left[field] - right[field])
        .map(({ tierId }) => tierId);

    expect(tierIdsBy("perPushRunnerMinor")).toEqual(tierIdsBy("perHingeMinor"));
  });
});

describe("a version stored before the push-runner rate existed", () => {
  const withoutPushRunnerRate = (lacking: readonly number[]): PriceBook => ({
    ...SAMPLE_PRICE_BOOK,
    hardware: {
      ...SAMPLE_PRICE_BOOK.hardware,
      tiers: SAMPLE_PRICE_BOOK.hardware.tiers.map((tier, index) =>
        lacking.includes(index)
          ? withoutKeys(tier, ["perPushRunnerMinor"])
          : tier,
      ),
    },
  });

  it("is refused whole by the parser, naming the tier and the field, whichever tier lacks it", () => {
    for (const lacking of [0, 1, 2]) {
      const detail = failureDetailOf(withoutPushRunnerRate([lacking]));

      expect(detail).toContain("perPushRunnerMinor");
      expect(detail).toContain(
        SAMPLE_PRICE_BOOK.hardware.tiers[lacking]?.tierId ?? "",
      );
    }
  });

  it("is refused by the whole-kitchen price with a coded failure", () => {
    const book = withoutPushRunnerRate([0, 1, 2]);

    const result = priceOneLiftKitchenWith(book);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("INVALID_PRICE_BOOK");
  });
});

describe("a version stored before the lift rate existed", () => {
  it("is refused whole by the parser, naming the tier and the field", () => {
    const detail = failureDetailOf(BOOK_WITHOUT_LIFT_RATE);

    expect(detail).toContain("perLiftMinor");
    expect(detail).toContain(SAMPLE_PRICE_BOOK.hardware.tiers[0]?.tierId ?? "");
  });

  it("is refused by the whole-kitchen price with a coded failure, never priced as a line without the lift rate", () => {
    const result = priceDesign({
      design: { ...KITCHEN_L_DESIGN, settings: { cabinetDepthMm: 600 } },
      catalog: buildKitchenLBodyCatalog(600),
      book: BOOK_WITHOUT_LIFT_RATE,
      pricingVersion: BOOK_WITHOUT_LIFT_RATE.version,
      deepeningRows: DEEPENING_ROWS,
      availability: NOTHING_DISABLED,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("INVALID_PRICE_BOOK");
  });

  it("cannot be repaired from the dashboard: no change is accepted on it, and the lift rate cannot be added to it", () => {
    // Recorded consequence, not a defect while no version has been published (A-10): a stored version without the rate
    // would be unreadable and unrepairable through a draft, so the first production version must be published with it.
    const anyEdit = setRate("hardware.standard", "perHingeMinor", 1);
    const addLift = setRate("hardware.standard", "perLiftMinor", 1);

    expect(refusalCodes(applyChanges(BOOK_WITHOUT_LIFT_RATE, [addLift]))).toBe(
      "0:FIELD_NOT_ON_RULE",
    );
    expect(applyChanges(BOOK_WITHOUT_LIFT_RATE, [anyEdit]).ok).toBe(false);
  });

  it("is refused too when only one tier of the group lacks the rate", () => {
    const [first, ...rest] = SAMPLE_PRICE_BOOK.hardware.tiers;
    if (first === undefined) throw new Error("no tier");

    for (const lacking of [0, 1, 2]) {
      const tiers = SAMPLE_PRICE_BOOK.hardware.tiers.map((tier, index) =>
        index === lacking ? withoutKeys(tier, ["perLiftMinor"]) : tier,
      );
      const book = {
        ...SAMPLE_PRICE_BOOK,
        hardware: { ...SAMPLE_PRICE_BOOK.hardware, tiers },
      };

      expect(parsePriceBook(book).ok).toBe(false);
    }
    expect(rest.length).toBeGreaterThan(0);
  });
});

describe("each rate against every value a book can carry", () => {
  const NOT_USABLE: readonly [string, unknown][] = [
    ["one past the bound", MAX_PRICE_COEFFICIENT_MINOR + 1],
    ["one past the bound, negative", -MAX_PRICE_COEFFICIENT_MINOR - 1],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["NaN", Number.NaN],
    ["a fraction", 1.5],
    ["a negative", -1],
  ];
  const NOT_A_NUMBER: readonly [string, unknown][] = [
    ["a numeric string", "100"],
    ["null", null],
    ["a boolean", true],
  ];
  const USABLE: readonly [string, number][] = [
    ["zero", 0],
    ["one", 1],
    ["the bound itself", MAX_PRICE_COEFFICIENT_MINOR],
  ];

  describe.each(HARDWARE_RATE_FIELDS)("%s", (field) => {
    it.each(NOT_USABLE)("refuses %s", (_label, value) => {
      const parsed = parsePriceBook(withFirstTierRate(field, value));

      expect(parsed.ok).toBe(false);
    });

    it.each(USABLE)("accepts %s", (_label, value) => {
      expect(parsePriceBook(withFirstTierRate(field, value)).ok).toBe(true);
    });

    it.each(NOT_A_NUMBER)(
      "is refused, by the parser for the lift and push-runner rates and by the price for the older three, when it is %s",
      (_label, value) => {
        const book = withFirstTierRate(field, value);

        if (field === "perLiftMinor" || field === "perPushRunnerMinor") {
          expect(parsePriceBook(book).ok).toBe(false);
          return;
        }
        const result = priceOneLiftKitchenWith(book);
        expect(result.ok).toBe(false);
      },
    );
  });

  it("names perLiftMinor, not another rate, in every refusal of the lift rate", () => {
    for (const [, value] of NOT_USABLE) {
      expect(
        failureDetailOf(withFirstTierRate("perLiftMinor", value)),
      ).toContain("perLiftMinor");
    }
  });

  it("names perPushRunnerMinor, not another rate, in every refusal of the push-runner rate", () => {
    for (const [, value] of NOT_USABLE) {
      expect(
        failureDetailOf(withFirstTierRate("perPushRunnerMinor", value)),
      ).toContain("perPushRunnerMinor");
    }
  });

  it("prices a kitchen of the most lifts the placement bound allows at the bound's rate, without a throw", () => {
    const MOST_PLACEMENTS = 279;
    const priced = priceDesign({
      design: {
        ...KITCHEN_L_DESIGN,
        settings: { cabinetDepthMm: 600 },
        placements: Array.from({ length: MOST_PLACEMENTS }, (_, index) => ({
          id: `lift-${String(index)}`,
          wall: "A" as const,
          alongMm: 400 + 800 * index,
          y0Mm: 1_500,
          body: { buildId: "wall-lift", widthMm: 800, heightMm: 700 },
        })),
      },
      catalog: buildKitchenLBodyCatalog(600),
      book: parsedOrThrow(withEveryRateAt(MAX_PRICE_COEFFICIENT_MINOR)),
      pricingVersion: SAMPLE_PRICE_BOOK.version,
      deepeningRows: DEEPENING_ROWS,
      availability: NOTHING_DISABLED,
    });

    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    const hardwareMinor =
      priced.priced.lines.find(({ kind }) => kind === "hardware")
        ?.amountMinor ?? 0;
    const LIFT_DOOR_HINGES = 3;
    const exactMinor =
      MOST_PLACEMENTS * (LIFT_DOOR_HINGES + 1) * MAX_PRICE_COEFFICIENT_MINOR;
    expect(hardwareMinor).toBe(Math.floor((exactMinor + 500) / 1_000) * 1_000);
  });
});

function priceOneLiftKitchenWith(book: unknown) {
  return priceDesign({
    design: {
      ...KITCHEN_L_DESIGN,
      settings: { cabinetDepthMm: 600 },
      placements: [
        {
          id: "lift",
          wall: "A",
          alongMm: 1_000,
          y0Mm: 1_500,
          body: { buildId: "wall-lift", widthMm: 600, heightMm: 700 },
        },
      ],
    },
    catalog: buildKitchenLBodyCatalog(600),
    book: book as PriceBook,
    pricingVersion: SAMPLE_PRICE_BOOK.version,
    selections: {
      hardwareTierId: SAMPLE_PRICE_BOOK.hardware.tiers[0]?.tierId ?? "",
    },
    deepeningRows: DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
  });
}

function withEveryRateAt(amountMinor: number): unknown {
  return {
    ...SAMPLE_PRICE_BOOK,
    hardware: {
      ...SAMPLE_PRICE_BOOK.hardware,
      tiers: SAMPLE_PRICE_BOOK.hardware.tiers.map((tier) => ({
        ...tier,
        perHingeMinor: amountMinor,
        perDrawerMinor: amountMinor,
        perPushToOpenMinor: amountMinor,
        perLiftMinor: amountMinor,
        perPushRunnerMinor: amountMinor,
      })),
    },
  };
}

function parsedOrThrow(book: unknown): PriceBook {
  const parsed = parsePriceBook(book);
  if (!parsed.ok) throw new Error(parsed.failure.detail);
  return parsed.book;
}

describe("a hardware tier states exactly its declared members", () => {
  const PLANTED_NEXT_TO_THE_LIFT_RATE = [
    "perFlapMinor",
    "perLiftsMinor",
    "perliftminor",
    "liftMinor",
  ];

  it.each(PLANTED_NEXT_TO_THE_LIFT_RATE)(
    "refuses a stray %s beside the rates, naming it",
    (stray) => {
      expect(
        failureDetailOf(withFirstTierRate(stray as RateField, 1)),
      ).toContain(stray);
    },
  );

  it("refuses a lift rate on a material tier, which carries only its percentage", () => {
    const [first, ...rest] = SAMPLE_PRICE_BOOK.material.tiers;
    const book = {
      ...SAMPLE_PRICE_BOOK,
      material: {
        ...SAMPLE_PRICE_BOOK.material,
        tiers: [{ ...first, perLiftMinor: 1 }, ...rest],
      },
    };

    expect(failureDetailOf(book)).toContain("perLiftMinor");
  });
});

describe("a created class, through the draft and into a kitchen's price", () => {
  const CREATED = "hardware.economy";
  const RATES = {
    perHingeMinor: 1_300,
    perDrawerMinor: 41_700,
    perPushToOpenMinor: 6_100,
    perLiftMinor: 12_550,
    perPushRunnerMinor: 52_300,
  } as const;

  function draftWith(
    rates: Readonly<Record<RateField, number>>,
  ): readonly ReturnType<typeof change>[] {
    return [
      createTier(CREATED),
      ...HARDWARE_RATE_FIELDS.map((field) =>
        setRate(CREATED, field, rates[field]),
      ),
    ];
  }

  it("is accepted with all its rates and prices a lift door at them", () => {
    const book = applied(SAMPLE_PRICE_BOOK, draftWith(RATES));
    const result = priceDesign({
      design: {
        ...KITCHEN_L_DESIGN,
        settings: { cabinetDepthMm: 600 },
        placements: [
          {
            id: "lift",
            wall: "A",
            alongMm: 1_000,
            y0Mm: 1_500,
            body: { buildId: "wall-lift", widthMm: 600, heightMm: 700 },
          },
        ],
      },
      catalog: buildKitchenLBodyCatalog(600),
      book,
      pricingVersion: book.version,
      selections: { hardwareTierId: CREATED },
      deepeningRows: DEEPENING_ROWS,
      availability: NOTHING_DISABLED,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const line = result.priced.lines.find(({ kind }) => kind === "hardware");
    const exactMinor = 3 * RATES.perHingeMinor + RATES.perLiftMinor;
    expect(line?.amountMinor).toBe(
      Math.floor((exactMinor + 500) / 1_000) * 1_000,
    );
  });

  it("is refused for each rate left unset, whatever order the others are set in", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...HARDWARE_RATE_FIELDS),
        fc.shuffledSubarray(
          Array.from(
            { length: HARDWARE_RATE_FIELDS.length - 1 },
            (_, index) => index,
          ),
          {
            minLength: HARDWARE_RATE_FIELDS.length - 1,
            maxLength: HARDWARE_RATE_FIELDS.length - 1,
          },
        ),
        (missing, order) => {
          const set = HARDWARE_RATE_FIELDS.filter((field) => field !== missing);
          const changes = [
            createTier(CREATED),
            ...order.map((position) => {
              const field = set[position];
              if (field === undefined) throw new Error("no rate");
              return setRate(CREATED, field, 1_000);
            }),
          ];

          expect(refusalCodes(applyChanges(SAMPLE_PRICE_BOOK, changes))).toBe(
            "0:CREATED_TIER_RATES_MISSING",
          );
        },
      ),
    );
  });

  it("is accepted once the lift rate is set last, after other changes to the same class", () => {
    const [creation, ...rates] = tierDraft(CREATED);
    if (creation === undefined) throw new Error("no creation");
    const withoutLift = rates.filter(
      (rate) => (rate.address as { field?: string }).field !== "perLiftMinor",
    );

    const result = applyChanges(SAMPLE_PRICE_BOOK, [
      creation,
      ...withoutLift,
      setRate(CREATED, "perLiftMinor", 0),
    ]);

    expect(result.ok).toBe(true);
  });
});
