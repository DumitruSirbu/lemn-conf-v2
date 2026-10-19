// What a kitchen's card says about its cost (Lot 2 plan, criterion 20 and frame A9C).
import {
  KITCHEN_L_DESIGN,
  type PricedDesign,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { describeKitchenPrice } from "@/account/kitchens/kitchen-summary";
import { priceFloorOf } from "@/price/price-book-root";

import { CATALOGUES, contentFor } from "../support/catalogues";

describe("describeKitchenPrice: the three states of the card's price line", () => {
  const pricedFloor = priceFloorOf(KITCHEN_L_DESIGN);

  function requirePriced(): PricedDesign {
    if (pricedFloor === undefined)
      throw new Error("the shipped kitchen prices");
    return pricedFloor;
  }

  it.each(CATALOGUES)(
    "has no price when the kitchen could not be priced (%s)",
    (locale, messages) => {
      expect(
        describeKitchenPrice(undefined, contentFor(locale, messages).price),
      ).toBeUndefined();
    },
  );

  it.each(CATALOGUES)(
    "has no price, not a zero, when the kitchen holds no cabinets (%s)",
    (locale, messages) => {
      const priced = requirePriced();
      const withoutCabinets: PricedDesign = {
        ...priced,
        lines: priced.lines.filter((line) => line.kind !== "cabinet"),
      };
      expect(
        describeKitchenPrice(
          withoutCabinets,
          contentFor(locale, messages).price,
        ),
      ).toBeUndefined();
    },
  );

  it.each(CATALOGUES)(
    "has the configurator bar's own figure for a priced kitchen (%s)",
    (locale, messages) => {
      const priced = requirePriced();
      const copy = contentFor(locale, messages).price;
      const price = describeKitchenPrice(priced, copy);
      expect(price?.figure.label).toBe(copy.startingPrefix);
      expect(price?.figure.amountText).toMatch(/\d/);
      expect(price?.overflowWarning).toBeUndefined();
      expect("overflowWarning" in (price ?? {})).toBe(false);
    },
  );

  it.each(CATALOGUES)(
    "carries the overflow warning exactly when the total is flagged (%s)",
    (locale, messages) => {
      const priced = requirePriced();
      const copy = contentFor(locale, messages).price;
      const flagged = describeKitchenPrice(
        { ...priced, totalIsFlagged: true },
        copy,
      );
      const unflagged = describeKitchenPrice(
        { ...priced, totalIsFlagged: false },
        copy,
      );
      expect(flagged?.overflowWarning).toBe(copy.overflowingTotalWarning);
      expect(flagged?.overflowWarning).not.toBe("");
      expect(unflagged?.overflowWarning).toBeUndefined();
      expect(flagged?.figure).toEqual(unflagged?.figure);
    },
  );

  it("rounds the figure up to the thousand, as every other price surface does", () => {
    const priced = requirePriced();
    const [locale, messages] = CATALOGUES[0];
    const copy = contentFor(locale, messages).price;
    const justOverAThousand = describeKitchenPrice(
      { ...priced, totalMinor: 100_001 * 100 },
      copy,
    );
    expect(justOverAThousand?.figure.amountText).toContain("101 000");
  });
});
