import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { StaffKitchenDetail } from "@lemnaria/persistence";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { estimatesOfKitchen } from "@/lib/server/staff/staff-kitchen-estimates";
import { NO_PRICE_BOOK, priceFloorOf } from "@/price/price-book-root";
import type { PriceBookRoot } from "@/price/price-book-root";

import { SAMPLE_PRICE_ROOT } from "../../../support/sample-price-root";

const served = vi.hoisted(() => ({ root: undefined as unknown }));

vi.mock("@/lib/server/active-price-book", () => ({
  readActivePriceBook: () => Promise.resolve(served.root),
}));

/**
 * The two totals of the kitchen page. The sent one is read from what was stored with the request and never priced again;
 * the current one is priced now under the active book and availability, and a refusal travels as its code.
 */

const STORED_TOTAL = { totalMinor: 1_234_500, currency: "MDL" } as const;
const FALLBACK_MATERIAL = SAMPLE_PRICE_ROOT.book.material.defaultTierId;

function aKitchen(
  overrides: Partial<StaffKitchenDetail> = {},
): StaffKitchenDetail {
  return {
    id: "kitchenid000000000001",
    name: null,
    revision: "3",
    isChangedSinceSeen: false,
    design: KITCHEN_L_DESIGN,
    isSent: true,
    isHidden: false,
    sentAt: new Date("2026-10-18T09:00:00.000Z"),
    updatedAt: new Date("2026-10-19T12:00:00.000Z"),
    client: null,
    request: null,
    sentTotal: STORED_TOTAL,
    asSent: null,
    status: null,
    notes: [],
    notesTruncated: false,
    ...overrides,
  };
}

function rootSwitchingOff(
  disabled: Extract<
    PriceBookRoot,
    { kind: "active" }
  >["availability"]["disabled"],
): PriceBookRoot {
  return { ...SAMPLE_PRICE_ROOT, availability: { revision: "7", disabled } };
}

beforeEach(() => {
  served.root = SAMPLE_PRICE_ROOT;
});

describe("the sent estimate", () => {
  it("is the stored total and currency byte for byte, whatever the book now prices the kitchen at", async () => {
    const { sentEstimate, currentEstimate } =
      await estimatesOfKitchen(aKitchen());

    expect(sentEstimate).toEqual(STORED_TOTAL);
    expect(currentEstimate).not.toEqual(STORED_TOTAL);
  });

  it("is null for a kitchen whose request stored no total, as an intent request does", async () => {
    const { sentEstimate } = await estimatesOfKitchen(
      aKitchen({ sentTotal: null }),
    );

    expect(sentEstimate).toBeNull();
  });

  it("is not moved by a publish: the same stored total answers under a different book", async () => {
    const before = await estimatesOfKitchen(aKitchen());
    served.root = NO_PRICE_BOOK;

    const after = await estimatesOfKitchen(aKitchen());

    expect(after.sentEstimate).toEqual(before.sentEstimate);
  });

  it("carries no member of the stored snapshot beyond the total and the currency", async () => {
    const withMore = {
      ...STORED_TOTAL,
      lines: ["LEAK"],
    } as unknown as StaffKitchenDetail["sentTotal"];

    const { sentEstimate } = await estimatesOfKitchen(
      aKitchen({ sentTotal: withMore }),
    );

    expect(Object.keys(sentEstimate ?? {}).sort()).toEqual([
      "currency",
      "totalMinor",
    ]);
  });
});

describe("the current estimate", () => {
  it("is the kitchen priced now under the active book", async () => {
    const expected = priceFloorOf(SAMPLE_PRICE_ROOT, KITCHEN_L_DESIGN);

    const { currentEstimate } = await estimatesOfKitchen(aKitchen());

    expect(expected).toBeDefined();
    expect(currentEstimate).toEqual({
      totalMinor: expected?.totalMinor,
      currency: expected?.currency,
    });
  });

  it("is the pricing's own code when the kitchen names an item availability switched off", async () => {
    served.root = rootSwitchingOff([
      { kind: "material", tierId: FALLBACK_MATERIAL },
    ]);

    const { currentEstimate, sentEstimate } =
      await estimatesOfKitchen(aKitchen());

    expect(currentEstimate).toEqual({ refused: "REPLACEMENT_REQUIRED" });
    expect(sentEstimate).toEqual(STORED_TOTAL);
  });

  it("is refused INVALID_PRICE_BOOK when no book is active, and never a zero", async () => {
    served.root = NO_PRICE_BOOK;

    const { currentEstimate } = await estimatesOfKitchen(aKitchen());

    expect(currentEstimate).toEqual({ refused: "INVALID_PRICE_BOOK" });
  });

  it("is refused UNKNOWN_BODY for a document this build cannot read, which the pricing has no code for", async () => {
    const { currentEstimate } = await estimatesOfKitchen(
      aKitchen({ design: null }),
    );

    expect(currentEstimate).toEqual({ refused: "UNKNOWN_BODY" });
  });

  it("is refused UNKNOWN_BODY for a document whose depth the catalogue cannot be built at", async () => {
    const unbuildable = {
      ...KITCHEN_L_DESIGN,
      settings: { ...KITCHEN_L_DESIGN.settings, cabinetDepthMm: 1 },
    } as typeof KITCHEN_L_DESIGN;

    const { currentEstimate } = await estimatesOfKitchen(
      aKitchen({ design: unbuildable }),
    );

    expect(currentEstimate).toEqual({ refused: "UNKNOWN_BODY" });
  });
});
