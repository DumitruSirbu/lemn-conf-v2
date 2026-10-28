// M10 P4a: every price the application shows is read under the availability its root carries (A-17), so a kitchen naming
// a switched-off item has no price and a switched-off accessory is not billed. The root carries availability beside the
// book (R1); until P4a nothing read it.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  type CatalogueAvailability,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { priceAgainstBook, priceFloorOf } from "@/price/price-book-root";

import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

const CATALOG = buildKitchenLBodyCatalog(600);

function rootSwitchingOff(
  disabled: CatalogueAvailability["disabled"],
): typeof SAMPLE_PRICE_ROOT {
  return { ...SAMPLE_PRICE_ROOT, availability: { revision: "7", disabled } };
}

describe("a price is read under the root's availability", () => {
  const fallbackMaterial = SAMPLE_PRICE_ROOT.book.material.defaultTierId;

  it("refuses a kitchen that names a switched-off tier, with the item rather than UNKNOWN_TIER", () => {
    const priced = priceAgainstBook(
      rootSwitchingOff([{ kind: "material", tierId: fallbackMaterial }]),
      KITCHEN_L_DESIGN,
      CATALOG,
    );

    expect(priced).toMatchObject({
      ok: false,
      failure: {
        code: "REPLACEMENT_REQUIRED",
        items: [{ kind: "material", tierId: fallbackMaterial }],
      },
    });
  });

  it("gives a stored kitchen's card no price while it names a switched-off item", () => {
    const root = rootSwitchingOff([
      { kind: "material", tierId: fallbackMaterial },
    ]);

    expect(priceFloorOf(root, KITCHEN_L_DESIGN)).toBeUndefined();
    expect(priceFloorOf(SAMPLE_PRICE_ROOT, KITCHEN_L_DESIGN)).toBeDefined();
  });

  it("does not bill a switched-off accessory, and bills it again when it is switched on", () => {
    const off = priceAgainstBook(
      rootSwitchingOff([{ kind: "accessory", accessoryId: "dishDryingRack" }]),
      KITCHEN_L_DESIGN,
      CATALOG,
    );
    const on = priceAgainstBook(SAMPLE_PRICE_ROOT, KITCHEN_L_DESIGN, CATALOG);

    const accessoryIds = (result: typeof on) =>
      result.ok
        ? result.priced.lines.flatMap((line) =>
            line.kind === "accessory" ? [line.accessoryId] : [],
          )
        : [];
    expect(accessoryIds(off)).toEqual(["sinkProtectiveCover"]);
    expect(accessoryIds(on)).toEqual(["sinkProtectiveCover", "dishDryingRack"]);
  });
});
