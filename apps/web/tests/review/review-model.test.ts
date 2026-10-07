// What the review prints: criteria 3, 4, 6 and 7, and the states in which it prints nothing.
// Where an expectation reaches for `ro.`, the claim is that the model asked the right leaf (engineering-conventions,
// *Localised copy* point 7, question 3); the wording itself is the copy lock's.
import {
  KITCHEN_L_DESIGN,
  type Design,
  type PricedDesign,
  type PricingResult,
  type WholeKitchenPriceLine,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { PriceBreakdownDivergenceError } from "@/price/price-breakdown-model";
import {
  describeReview,
  MissingWholeKitchenTierError,
  REVIEW_READING_ORDER,
  type AvailableReview,
  type ReviewView,
} from "@/review/review-model";

import { CATALOGUES, contentFor, translatorFor } from "../support/catalogues";
import {
  generatePricedKitchen,
  priceAndProject,
  type PricedKitchen,
} from "../support/generated-kitchens";
import { SUM_CLAIM_WORDS } from "../support/ruled-price-copy";
import { ro } from "../support/romanian-content";

const SEEDED = priceAndProject(KITCHEN_L_DESIGN);

function reviewViewOf(kitchen: PricedKitchen): ReviewView {
  return describeReview({
    content: ro,
    design: kitchen.design,
    pricing: kitchen.pricing,
    groups: kitchen.groups,
  });
}

function availableReviewOf(kitchen: PricedKitchen): AvailableReview {
  const view = reviewViewOf(kitchen);
  if (view.kind !== "available")
    throw new Error("expected a reviewable kitchen");
  return view;
}

function pricedOf(kitchen: PricedKitchen): PricedDesign {
  if (!kitchen.pricing.ok) throw new Error("expected a priced kitchen");
  return kitchen.pricing.priced;
}

function withPriced(
  kitchen: PricedKitchen,
  change: Partial<PricedDesign>,
): PricedKitchen {
  return {
    ...kitchen,
    pricing: { ok: true, priced: { ...pricedOf(kitchen), ...change } },
  };
}

function composedKitchenIn(room: Design["room"]): PricedKitchen {
  const generated = generatePricedKitchen(room);
  if (generated.kind !== "composed") {
    throw new Error(`${JSON.stringify(room)} was expected to compose`);
  }
  return generated.kitchen;
}

/** Rounded up to the thousand MDL and grouped with a space; the price bar's rule written a second time. */
function roundedUpMdl(totalMinor: number): number {
  return Math.ceil(totalMinor / 100_000) * 1000;
}

function groupedMdl(mdl: number): string {
  return String(mdl).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function numbersIn(text: string): readonly number[] {
  return [...text.matchAll(/\d+/g)].map((match) => Number(match[0]));
}

const STRAIGHT_ROOM: Design["room"] = {
  shape: "linear",
  widthMm: 4210,
  depthMm: 3400,
  heightMm: 2600,
};
const L_ROOM: Design["room"] = {
  shape: "L",
  widthMm: 3560,
  depthMm: 2830,
  heightMm: 2600,
};
const RIGHT_HAND_L_ROOM: Design["room"] = {
  ...L_ROOM,
  cornerDirection: "right",
};
const U_ROOM: Design["room"] = {
  shape: "U",
  widthMm: 4480,
  depthMm: 2950,
  wallCMm: 3130,
  heightMm: 2600,
};

describe("the figure (criterion 3)", () => {
  const KITCHENS = [
    SEEDED,
    composedKitchenIn(STRAIGHT_ROOM),
    composedKitchenIn(L_ROOM),
    composedKitchenIn(U_ROOM),
  ];

  it.each(KITCHENS.map((kitchen, index) => [index, kitchen] as const))(
    "is the priced total rounded up as the price bar rounds it (kitchen %i)",
    (_index, kitchen) => {
      const { totalMinor } = pricedOf(kitchen);

      expect(availableReviewOf(kitchen).figure).toEqual({
        label: ro.price.startingPrefix,
        amountText: ro.price.amountWithCurrency(
          groupedMdl(roundedUpMdl(totalMinor)),
        ),
      });
    },
  );

  it("follows the priced total when the rows disagree with it, so it is no sum of the rows", () => {
    const rowSumMdl = pricedOf(SEEDED).lines.reduce(
      (sum, line) => sum + roundedUpMdl(line.amountMinor),
      0,
    );
    const farFromTheRows = pricedOf(SEEDED).totalMinor + 7_300_000;
    const moved = withPriced(SEEDED, { totalMinor: farFromTheRows });

    expect(availableReviewOf(moved).figure.amountText).toBe(
      ro.price.amountWithCurrency(groupedMdl(roundedUpMdl(farFromTheRows))),
    );
    expect(availableReviewOf(moved).wholeKitchenRows).toEqual(
      availableReviewOf(SEEDED).wholeKitchenRows,
    );
    expect(roundedUpMdl(pricedOf(SEEDED).totalMinor)).not.toBe(rowSumMdl);
  });

  it("is never below the exact total and less than a step above it", () => {
    for (const kitchen of KITCHENS) {
      const shownMdl = numbersIn(
        availableReviewOf(kitchen).figure.amountText.replaceAll(" ", ""),
      )[0];
      const exactMdl = pricedOf(kitchen).totalMinor / 100;

      expect(shownMdl).toBeGreaterThanOrEqual(exactMdl);
      expect(shownMdl).toBeLessThan(exactMdl + 1000);
      expect((shownMdl ?? 1) % 1000).toBe(0);
    }
  });

  it("labels no row, heading or the figure as a total", () => {
    for (const kitchen of KITCHENS) {
      const review = availableReviewOf(kitchen);
      const printed = [
        review.figure.label,
        review.settingsRow.heading,
        ...review.groups.flatMap((group) => [
          group.heading,
          ...group.rows.map((row) => row.label),
        ]),
        ...review.wholeKitchenRows.map((row) => row.label),
      ];

      for (const text of printed) expect(text).not.toMatch(SUM_CLAIM_WORDS);
    }
  });

  it("carries the overflow warning with the total, and only when the total is flagged", () => {
    const flagged = withPriced(SEEDED, { totalIsFlagged: true });
    const unflagged = withPriced(SEEDED, { totalIsFlagged: false });

    expect(availableReviewOf(flagged).overflowWarning).toBe(
      ro.price.overflowingTotalWarning,
    );
    expect(availableReviewOf(unflagged)).not.toHaveProperty("overflowWarning");
  });
});

describe("the room line (criterion 4)", () => {
  function roomLineOf(room: Design["room"]): string {
    return availableReviewOf(composedKitchenIn(room)).roomLine;
  }

  function bodyCountOf(room: Design["room"]): number {
    return composedKitchenIn(room).design.placements.length;
  }

  it("names one length for a straight room, not its drawn depth, then the body count", () => {
    expect(numbersIn(roomLineOf(STRAIGHT_ROOM))).toEqual([
      STRAIGHT_ROOM.widthMm,
      bodyCountOf(STRAIGHT_ROOM),
    ]);
  });

  it("names two lengths for an L, then the body count", () => {
    expect(numbersIn(roomLineOf(L_ROOM))).toEqual([
      L_ROOM.widthMm,
      L_ROOM.depthMm,
      bodyCountOf(L_ROOM),
    ]);
  });

  it("names three lengths for a U, then the body count", () => {
    expect(numbersIn(roomLineOf(U_ROOM))).toEqual([
      U_ROOM.widthMm,
      U_ROOM.depthMm,
      U_ROOM.wallCMm,
      bodyCountOf(U_ROOM),
    ]);
  });

  it("writes lengths in whole millimetres with no group separator", () => {
    expect(roomLineOf(L_ROOM)).toContain("3560");
    expect(roomLineOf(L_ROOM)).not.toMatch(/\d[.,\s]\d{3}\b/);
  });

  describe.each(CATALOGUES)("in %s", (locale, messages) => {
    const translate = translatorFor(locale, messages);
    const cornerWords = [
      translate("review.roomLine.cornerLeft"),
      translate("review.roomLine.cornerRight"),
    ];

    const content = contentFor(locale, messages);

    function roomLineIn(room: Design["room"]): string {
      const kitchen = composedKitchenIn(room);
      const view = describeReview({
        content,
        design: kitchen.design,
        pricing: kitchen.pricing,
        groups: kitchen.groups,
      });
      if (view.kind !== "available") throw new Error("expected a review");
      return view.roomLine;
    }

    it("states the corner side for an L, and the other side for a right-hand L", () => {
      const left = roomLineIn(L_ROOM);
      const right = roomLineIn(RIGHT_HAND_L_ROOM);

      expect(left).toContain(cornerWords[0]);
      expect(left).not.toContain(cornerWords[1]);
      expect(right).toContain(cornerWords[1]);
      expect(right).not.toContain(cornerWords[0]);
    });

    it("states no corner side for a straight room or a U", () => {
      for (const room of [STRAIGHT_ROOM, U_ROOM]) {
        for (const word of cornerWords) {
          expect(roomLineIn(room)).not.toContain(word);
        }
      }
    });
  });
});

describe("the review's fixed sections (criteria 6 and 7)", () => {
  const review = availableReviewOf(SEEDED);

  it("takes its title from the review's own leaf", () => {
    expect(review.title).toBe(ro.review.title);
  });

  it("labels the estimate a starting price, rounded up, not an offer, subject to measurement", () => {
    expect(review.figure.label).toBe(ro.price.startingPrefix);
    expect(review.disclaimer).toEqual({
      rounding: ro.review.roundedUpNote,
      notice: ro.priceBreakdown.note,
    });
  });

  it("returns the not-included slot from the approved breakdown disclaimer alone", () => {
    expect(review.notIncluded).toEqual({
      lines: [ro.priceBreakdown.disclaimer],
    });
  });

  it("lays the not-included slot out before the call to action", () => {
    expect(REVIEW_READING_ORDER.indexOf("notIncluded")).toBeGreaterThanOrEqual(
      0,
    );
    expect(REVIEW_READING_ORDER.indexOf("notIncluded")).toBeLessThan(
      REVIEW_READING_ORDER.indexOf("callToAction"),
    );
  });

  it("places every section the model returns, once, so a new section must choose its position", () => {
    const returned = Object.keys(review).filter(
      (key) => key !== "kind" && key !== "overflowWarning",
    );

    expect([...returned].sort()).toEqual(
      REVIEW_READING_ORDER.filter((section) => section !== "callToAction")
        .slice()
        .sort(),
    );
    expect(new Set(REVIEW_READING_ORDER).size).toBe(
      REVIEW_READING_ORDER.length,
    );
  });

  it("names the applied material and hardware from the priced tier lines", () => {
    const tierLine = (kind: WholeKitchenPriceLine["kind"]) => {
      const line = pricedOf(SEEDED).lines.find(
        (candidate): candidate is WholeKitchenPriceLine =>
          candidate.kind === kind,
      );
      if (line === undefined) throw new Error(`no ${kind} line`);
      return ro.bookText(line.name, line.nameKey);
    };

    expect(review.settingsRow).toEqual({
      heading: ro.globalSettings.title,
      settings: [
        ro.globalSettings.pillMaterial(tierLine("material")),
        ro.globalSettings.pillHardware(
          ro.priceBreakdown.wholeKitchenCategories.hardware,
          tierLine("hardware"),
        ),
      ],
    });
  });

  it("refuses to name a setting the priced design carries no tier line for", () => {
    const withoutHardware = withPriced(SEEDED, {
      lines: pricedOf(SEEDED).lines.filter((line) => line.kind !== "hardware"),
    });

    expect(() => reviewViewOf(withoutHardware)).toThrow(
      MissingWholeKitchenTierError,
    );
  });
});

describe("when there is nothing to review", () => {
  const EMPTY_KITCHEN = priceAndProject({
    ...KITCHEN_L_DESIGN,
    placements: [],
    emptyColumns: [],
    columnExtents: [],
  });

  it("is unavailable for a kitchen that could not be priced", () => {
    const failed: PricingResult = {
      ok: false,
      failure: { code: "INVALID_PRICE_BOOK", detail: "unreadable" },
    };

    expect(reviewViewOf({ ...SEEDED, pricing: failed })).toEqual({
      kind: "unavailable",
    });
  });

  it("is unavailable, and does not throw, for a kitchen with no body", () => {
    expect(EMPTY_KITCHEN.groups).toEqual([]);
    expect(reviewViewOf(EMPTY_KITCHEN)).toEqual({ kind: "unavailable" });
  });

  it("refuses, as the breakdown does, a priced body that no group holds", () => {
    expect(() => reviewViewOf({ ...SEEDED, groups: [] })).toThrow(
      PriceBreakdownDivergenceError,
    );
  });
});
