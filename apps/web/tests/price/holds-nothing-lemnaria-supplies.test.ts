// The question the review asks beside `holdsNoCabinets`: is anything in this priced design Lemnaria's to supply.
// Decided on each line's published supplier, never on an amount (ADR 0107 decision 2).
import {
  KITCHEN_L_DESIGN,
  type PricedDesign,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  holdsNoCabinets,
  holdsNothingLemnariaSupplies,
} from "@/price/starting-price";

import { priceAndProject } from "../support/generated-kitchens";
import {
  customerSuppliedIds,
  emptied,
  keepingOnly,
} from "../support/review-edits";

function pricedOf(design: typeof KITCHEN_L_DESIGN): PricedDesign {
  const { pricing } = priceAndProject(design);
  if (!pricing.ok) throw new Error("expected a priced kitchen");
  return pricing.priced;
}

const SEEDED = pricedOf(KITCHEN_L_DESIGN);
const SUPPLIED = customerSuppliedIds(SEEDED);
const SOLD_ID = KITCHEN_L_DESIGN.placements.find(
  ({ id }) => !SUPPLIED.has(id),
)?.id;

describe("holdsNothingLemnariaSupplies", () => {
  it("is false for the seeded kitchen, which sells most of what it draws", () => {
    expect(SUPPLIED.size).toBeGreaterThan(0);
    expect(holdsNothingLemnariaSupplies(SEEDED)).toBe(false);
  });

  it("is true for a kitchen of bodies the customer supplies alone", () => {
    const supplied = pricedOf(keepingOnly(KITCHEN_L_DESIGN, SUPPLIED));

    expect(holdsNoCabinets(supplied)).toBe(false);
    expect(holdsNothingLemnariaSupplies(supplied)).toBe(true);
  });

  it("is true for a kitchen with no body, which holds nothing to supply either", () => {
    const empty = pricedOf(emptied(KITCHEN_L_DESIGN));

    expect(holdsNoCabinets(empty)).toBe(true);
    expect(holdsNothingLemnariaSupplies(empty)).toBe(true);
  });

  it("is false once one body is sold, however many are supplied beside it", () => {
    expect(SOLD_ID).toBeDefined();
    const mixed = pricedOf(
      keepingOnly(KITCHEN_L_DESIGN, new Set([...SUPPLIED, SOLD_ID ?? ""])),
    );

    expect(holdsNothingLemnariaSupplies(mixed)).toBe(false);
  });

  it("reads the supplier and not the amount: sold bodies priced at zero are still sold", () => {
    const free: PricedDesign = {
      ...SEEDED,
      lines: SEEDED.lines.map((line) =>
        line.kind === "cabinet" && line.suppliedBy !== "customer"
          ? { ...line, unitAmountMinor: 0, amountMinor: 0 }
          : line,
      ),
    };

    expect(holdsNothingLemnariaSupplies(free)).toBe(false);
  });

  it("is true for supplied bodies whatever their amount says", () => {
    const supplied = pricedOf(keepingOnly(KITCHEN_L_DESIGN, SUPPLIED));
    const priced: PricedDesign = {
      ...supplied,
      lines: supplied.lines.map((line) =>
        line.kind === "cabinet"
          ? { ...line, unitAmountMinor: 50_000, amountMinor: 50_000 }
          : line,
      ),
    };

    expect(holdsNothingLemnariaSupplies(priced)).toBe(true);
  });

  it("leaves holdsNoCabinets as it was: false for a kitchen of supplied bodies", () => {
    expect(
      holdsNoCabinets(pricedOf(keepingOnly(KITCHEN_L_DESIGN, SUPPLIED))),
    ).toBe(false);
  });
});
