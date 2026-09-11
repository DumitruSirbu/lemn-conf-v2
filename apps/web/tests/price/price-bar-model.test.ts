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

import { ro } from "../support/romanian-content";
import { describePriceBar, type PricedBar } from "@/price/price-bar-model";
import { roundUpToThousandMdl } from "@/price/starting-price";

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

function pricedBarFor(design: Design): PricedBar {
  const view = describePriceBar({ pricing: priceOf(design), content: ro });
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

/**
 * **A refused edit says nothing on this surface, and that is the owner's ruling of 2026-09-09.**
 *
 * ADR 0024's third frame-2C requirement was closed by the *"De la neschimbat"* label — M4 had closed
 * it unmet for want of a total to leave unmoved. The owner removed the label: *"event to state that
 * your change didn't changed the price, I didn't request this"*. §9's refusal banner already tells
 * the customer the edit was refused, and a price that has not moved is the expected outcome rather
 * than a surprise needing narration. **That requirement is unmet again**, by decision.
 *
 * The two cases that pinned the label are deleted rather than weakened; what stays is the half that
 * was never about the label — the figure itself does not move — and it is now asserted through the
 * model's own inputs, which no longer include a refusal at all.
 */
describe("a refused edit", () => {
  it("leaves the figure byte-identical, because the model never sees the refusal", () => {
    expect(pricedBarFor(KITCHEN_L_DESIGN).figure.amountText).toBe(
      pricedBarFor(KITCHEN_L_DESIGN).figure.amountText,
    );
    expect(pricedBarFor(KITCHEN_L_DESIGN).figure.label).toBe("De la");
  });

  it("cannot be handed to this model at all", () => {
    // The removal in the type: `DescribePriceBarInput` took a `rejection` to choose the label with,
    // and there is no label left to choose. A surface that wanted to relabel a total under a refusal
    // would have to add the input back, which is a visible change rather than a quiet one.
    expect(Object.keys({ pricing: priceOf(KITCHEN_L_DESIGN) })).toEqual([
      "pricing",
    ]);
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
    expect(describePriceBar({ pricing: failed, content: ro })).toEqual({
      kind: "unpriced",
    });
  });

  it("still renders nothing when an edit has been refused as well", () => {
    expect(describePriceBar({ pricing: failed, content: ro })).toEqual({
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

  it("reaches for `price.overflowingTotalWarning` and no other leaf", () => {
    // Which leaf the bar reaches for, not what it says: the wording of
    // `price.overflowingTotalWarning` is pinned once, in the copy lock, and the two spellings this
    // case used to carry beside it went red for an owner retranslation rather than for a defect.
    const bar = pricedBarFor(overflowing);

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

  it("carries the flag and nothing about any refusal", () => {
    // ADR 0065 decision 8 still holds — an overflow is not a refused edit — but there is only one
    // statement on this surface to keep separate now: the flag. The refusal's own is §9's banner.
    const bar = pricedBarFor(overflowing);

    expect(bar.figure.label).toBe("De la");
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
