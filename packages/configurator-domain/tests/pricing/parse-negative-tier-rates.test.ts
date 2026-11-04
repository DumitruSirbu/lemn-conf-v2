// A tier's rate and an accessory's price are never below zero, as a cabinet's amounts are, so a draft cannot publish a
// version that `applyChanges` would refuse to restore.
import { describe, expect, it } from "vitest";

import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
import type { HardwareTier, PriceBook } from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

const HARDWARE_RATES = [
  "perHingeMinor",
  "perDrawerMinor",
  "perPushToOpenMinor",
  "perLiftMinor",
  "perPushRunnerMinor",
] as const;

function withHardwareRate(
  field: (typeof HARDWARE_RATES)[number],
  amount: number,
): PriceBook {
  const [first, ...rest] = SAMPLE_PRICE_BOOK.hardware.tiers;
  if (first === undefined) throw new Error("the sample book has no tier");
  return {
    ...SAMPLE_PRICE_BOOK,
    hardware: {
      ...SAMPLE_PRICE_BOOK.hardware,
      tiers: [{ ...first, [field]: amount }, ...rest],
    },
  };
}

describe("the book parser and negative tier and accessory amounts", () => {
  it("accepts the sample book, a control for every refusal below", () => {
    expect(parsePriceBook(SAMPLE_PRICE_BOOK).ok).toBe(true);
  });

  it.each(HARDWARE_RATES)(
    "refuses a hardware tier's %s below zero",
    (field) => {
      const result = parsePriceBook(withHardwareRate(field, -1));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe("INVALID_PRICE_BOOK");
      expect(result.failure.detail).toContain(field);
    },
  );

  it.each(HARDWARE_RATES.filter((field) => field !== "perPushRunnerMinor"))(
    "accepts a hardware tier's %s at zero",
    (field) => {
      expect(parsePriceBook(withHardwareRate(field, 0)).ok).toBe(true);
    },
  );

  it("refuses a hardware tier's perPushRunnerMinor at zero, naming it, since a free push runner bills nothing", () => {
    const result = parsePriceBook(withHardwareRate("perPushRunnerMinor", 0));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("INVALID_PRICE_BOOK");
    expect(result.failure.detail).toContain("perPushRunnerMinor");
  });

  it.each(["sinkProtectiveCover", "dishDryingRack"] as const)(
    "refuses the %s price below zero and accepts it at zero",
    (accessoryId) => {
      const priced = (perUnitMinor: number): PriceBook => ({
        ...SAMPLE_PRICE_BOOK,
        accessories: {
          ...SAMPLE_PRICE_BOOK.accessories,
          [accessoryId]: {
            ...SAMPLE_PRICE_BOOK.accessories[accessoryId],
            perUnitMinor,
          },
        },
      });

      expect(parsePriceBook(priced(-1)).ok).toBe(false);
      expect(parsePriceBook(priced(0)).ok).toBe(true);
    },
  );
});

describe("the book parser and a hardware tier that states no lift rate", () => {
  function withoutLiftRate(tierIndex: number): PriceBook {
    return {
      ...SAMPLE_PRICE_BOOK,
      hardware: {
        ...SAMPLE_PRICE_BOOK.hardware,
        tiers: SAMPLE_PRICE_BOOK.hardware.tiers.map((tier, index) =>
          index === tierIndex
            ? (Object.fromEntries(
                Object.entries(tier).filter(([key]) => key !== "perLiftMinor"),
              ) as unknown as HardwareTier)
            : tier,
        ),
      },
    };
  }

  it.each(SAMPLE_PRICE_BOOK.hardware.tiers.map((_, index) => index))(
    "refuses the book when tier %i carries no perLiftMinor, naming the field",
    (tierIndex) => {
      const result = parsePriceBook(withoutLiftRate(tierIndex));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe("INVALID_PRICE_BOOK");
      expect(result.failure.detail).toContain("perLiftMinor");
    },
  );

  it.each([null, "20000", true])(
    "refuses a perLiftMinor of %j, which is not a number",
    (declared) => {
      const result = parsePriceBook(
        withHardwareRate("perLiftMinor", declared as unknown as number),
      );

      expect(result.ok).toBe(false);
    },
  );

  it("does not ask a material tier for a lift rate", () => {
    expect(parsePriceBook(SAMPLE_PRICE_BOOK).ok).toBe(true);
    expect(
      Object.keys(SAMPLE_PRICE_BOOK.material.tiers[0] ?? {}),
    ).not.toContain("perLiftMinor");
  });
});

describe("the book parser and tier and accessory amounts that are not whole", () => {
  it.each(HARDWARE_RATES)("refuses a hardware tier's %s of 12.5", (field) => {
    const result = parsePriceBook(withHardwareRate(field, 12.5));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("INVALID_PRICE_BOOK");
    expect(result.failure.detail).toContain(field);
  });

  it("refuses a hardware rate of NaN", () => {
    const result = parsePriceBook(
      withHardwareRate("perHingeMinor", Number.NaN),
    );

    expect(result.ok).toBe(false);
  });

  it("refuses an accessory price of 12.5", () => {
    const book: PriceBook = {
      ...SAMPLE_PRICE_BOOK,
      accessories: {
        ...SAMPLE_PRICE_BOOK.accessories,
        sinkProtectiveCover: {
          ...SAMPLE_PRICE_BOOK.accessories.sinkProtectiveCover,
          perUnitMinor: 12.5,
        },
      },
    };

    expect(parsePriceBook(book).ok).toBe(false);
  });

  it("refuses a material tier's percentage of 12.5", () => {
    const [first, ...rest] = SAMPLE_PRICE_BOOK.material.tiers;
    if (first === undefined) throw new Error("the sample book has no tier");
    const book: PriceBook = {
      ...SAMPLE_PRICE_BOOK,
      material: {
        ...SAMPLE_PRICE_BOOK.material,
        tiers: [{ ...first, percentOfCabinets: 12.5 }, ...rest],
      },
    };

    expect(parsePriceBook(book).ok).toBe(false);
  });

  it("accepts a rate of negative zero, which restoring emits as 0", () => {
    expect(parsePriceBook(withHardwareRate("perHingeMinor", -0)).ok).toBe(true);
  });
});
