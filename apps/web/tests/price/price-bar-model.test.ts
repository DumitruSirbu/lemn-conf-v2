// Wave 6C's three states, each asserted on the value the bar renders from.
//
// Every fixture is priced through the real query against the real sample book: a hand-built
// `PricingResult` would let this file agree with itself about a total the application never
// produces.
import {
  findOverflowingPlacementIds,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  declaresASink,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  type Design,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { ro } from "@/content/ro";
import { describePriceBar, type PricedBar } from "@/price/price-bar-model";
import { roundUpToThousandMdl } from "@/price/starting-price";

import { REFUSAL } from "../support/selection-meta";

/** Far enough past wall A's end that no rounding of the body's own half-width could hide it. */
const PAST_THE_WALL_END_MM = 500;

function priceOf(design: Design): PricingResult {
  return priceDesign({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
  });
}

/**
 * The body pushed past the wall's end: the first on wall A that **holds no sink**.
 *
 * **The exclusion is wave 6T2's and is not cosmetic.** Wall A's first placement is `p0`, the seeded
 * kitchen's sink, standing under `p11`; pushing it past the wall's end takes it out from under every
 * wall cabinet, so the design legitimately stops earning a drying rack and the total legitimately
 * falls. This block asserts that an overflowing design's total is **not reduced**, and a fixture that
 * also moved an accessory would fail it for a reason that is not the defect it guards.
 */
function firstPlacementIdOnWallAWithNoSink(): string {
  const placement = KITCHEN_L_DESIGN.placements.find(
    (candidate) =>
      candidate.wall === "A" &&
      !declaresASink(KITCHEN_L_BODY_CATALOG.get(candidate.body.buildId)),
  );
  if (!placement) throw new Error("the seeded design has no wall A placement");
  return placement.id;
}

const OVERFLOWING_ID = firstPlacementIdOnWallAWithNoSink();

function movePastWallEnd(design: Design): Design {
  return {
    ...design,
    placements: design.placements.map((placement) =>
      placement.id === OVERFLOWING_ID
        ? {
            ...placement,
            alongMm: design.room.widthMm + PAST_THE_WALL_END_MM,
          }
        : placement,
    ),
  };
}

function withoutTheOverflowingBody(design: Design): Design {
  return {
    ...design,
    placements: design.placements.filter(
      (placement) => placement.id !== OVERFLOWING_ID,
    ),
  };
}

function pricedBarFor(
  design: Design,
  rejection: Parameters<typeof describePriceBar>[0]["rejection"] = null,
): PricedBar {
  const view = describePriceBar({ pricing: priceOf(design), rejection });
  if (view.kind !== "priced") throw new Error("expected a priced bar");
  return view;
}

describe("the seeded design, priced and shown", () => {
  it("carries the De la prefix and a rounded figure", () => {
    const bar = pricedBarFor(KITCHEN_L_DESIGN);

    expect(bar.figure.label).toBe(ro.price.startingPrefix);
    expect(bar.figure.label).toBe("De la");
    expect(bar.figure.amountText).toMatch(/^[\d ]+ MDL$/);
  });

  it("reports nothing to flag, so no warning is rendered", () => {
    expect(findOverflowingPlacementIds(KITCHEN_L_DESIGN)).toEqual([]);
    expect(pricedBarFor(KITCHEN_L_DESIGN).overflowWarning).toBeUndefined();
  });
});

// ADR 0024's third frame-2C requirement, which M4 closed unmet for want of a total to leave unmoved
// and M5 wave 5E still carries.
describe("a refused edit", () => {
  it("leaves the figure byte-identical", () => {
    expect(pricedBarFor(KITCHEN_L_DESIGN, REFUSAL).figure.amountText).toBe(
      pricedBarFor(KITCHEN_L_DESIGN).figure.amountText,
    );
  });

  it("labels the figure unchanged while the rejection stands", () => {
    expect(ro.price.startingPrefixUnchanged).toBe("De la neschimbat");
    expect(pricedBarFor(KITCHEN_L_DESIGN, REFUSAL).figure.label).toBe(
      "De la neschimbat",
    );
    expect(pricedBarFor(KITCHEN_L_DESIGN, REFUSAL).figure.label).toBe(
      ro.price.startingPrefixUnchanged,
    );
  });

  it("drops the unchanged label the moment nothing is refused", () => {
    expect(pricedBarFor(KITCHEN_L_DESIGN, null).figure.label).toBe("De la");
  });
});

describe("a pricing failure", () => {
  const failed = priceDesign({
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: `${SAMPLE_PRICE_BOOK_VERSION}-not-this-one`,
  });

  it("is a failure of the real query, not a fixture", () => {
    expect(failed.ok).toBe(false);
  });

  it("renders no figure at all — not a zero, not a stale one, not a dash", () => {
    // `toEqual` on the whole view rather than a field: the criterion is about what is *absent*, so
    // an assertion that only checked a `kind` would pass with a zero sitting beside it.
    expect(describePriceBar({ pricing: failed, rejection: null })).toEqual({
      kind: "unpriced",
    });
  });

  it("still renders nothing when an edit has been refused as well", () => {
    expect(describePriceBar({ pricing: failed, rejection: REFUSAL })).toEqual({
      kind: "unpriced",
    });
  });
});

// ADR 0065 decision 6.
describe("an overflowing design", () => {
  const overflowing = movePastWallEnd(KITCHEN_L_DESIGN);

  it("is the fixture this block claims, derived rather than assumed", () => {
    expect(findOverflowingPlacementIds(overflowing)).toEqual([OVERFLOWING_ID]);
  });

  it("shows its total, flagged with the owner's own sentence", () => {
    const bar = pricedBarFor(overflowing);

    expect(ro.price.overflowingTotalWarning).toBe(
      "Prețul include și dulapuri ce depășesc mărimea peretelui și necesită ajustări",
    );
    expect(bar.overflowWarning).toBe(
      "Prețul include și dulapuri ce depășesc mărimea peretelui și necesită ajustări",
    );
    expect(bar.overflowWarning).toBe(ro.price.overflowingTotalWarning);
  });

  it("is neither suppressed nor reduced — the body that does not fit is still priced", () => {
    expect(pricedBarFor(overflowing).figure.amountText).toBe(
      pricedBarFor(KITCHEN_L_DESIGN).figure.amountText,
    );

    const withBody = priceOf(overflowing);
    const withoutBody = priceOf(withoutTheOverflowingBody(overflowing));
    if (!withBody.ok || !withoutBody.ok) throw new Error("expected two prices");
    expect(withBody.priced.totalMinor).toBeGreaterThan(
      withoutBody.priced.totalMinor,
    );
  });

  it("keeps the flag and the rejection label as two separate statements", () => {
    // ADR 0065 decision 8: an overflow is not a refused edit. Both can be true at once, and each
    // still says its own thing.
    const bar = pricedBarFor(overflowing, REFUSAL);

    expect(bar.figure.label).toBe("De la neschimbat");
    expect(bar.overflowWarning).toBe(ro.price.overflowingTotalWarning);
  });
});

// The mockups' disclaimer — wave 6D's — is what carries this; wave 6C's job is not to contradict it.
describe("rounded lines and a rounded total need not sum", () => {
  it("has a real case, and wave 6C's surface makes no claim about it", () => {
    const priced = priceOf(KITCHEN_L_DESIGN);
    if (!priced.ok) throw new Error("expected the seeded design to price");

    const roundedLineSumMdl = priced.priced.lines.reduce(
      (sum, line) => sum + roundUpToThousandMdl(line.amountMinor),
      0,
    );
    expect(roundedLineSumMdl).not.toBe(
      roundUpToThousandMdl(priced.priced.totalMinor),
    );

    // The bar renders exactly three strings, and none of them is a line amount: the total, its
    // ruled label, and — when there is one — ADR 0065's warning. There is nothing here for a
    // customer to add up, so nothing here can claim a sum.
    const bar = pricedBarFor(KITCHEN_L_DESIGN);
    expect(Object.keys(bar).sort()).toEqual(["figure", "kind"]);
    expect(Object.keys(bar.figure).sort()).toEqual(["amountText", "label"]);
  });
});
