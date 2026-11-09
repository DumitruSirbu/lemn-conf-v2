// M10 P4a QA: what the whole-kitchen tier offer does while a tier is switched off (A-17).
//
// P4a handed Q3 two gaps, pinned with `it.fails`: one switched-off tier blanked every delta, and a switched-off tier was
// still in `tierIds`. Q3b closed both (the marker came off, the assertions did not move), so they are plain tests now.
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  type CatalogueAvailability,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  offerWholeKitchenTiers,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";
import { NOTHING_DISABLED } from "../support/availability";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";

const FALLBACK_MATERIAL = SAMPLE_PRICE_BOOK.material.defaultTierId;
const A_MATERIAL_THE_KITCHEN_DID_NOT_CHOOSE = "material.veneer";

function offerUnder(
  availability: CatalogueAvailability,
): WholeKitchenTierOffer {
  return offerWholeKitchenTiers({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability,
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK.version,
    selections: KITCHEN_L_DESIGN.settings,
  });
}

function aMaterialSwitchedOff(tierId: string): CatalogueAvailability {
  return { revision: "1", disabled: [{ kind: "material", tierId }] };
}

function deltasOf(
  offer: WholeKitchenTierOffer,
): readonly (number | undefined)[] {
  return [...offer.material.tiers, ...offer.hardware.tiers].map(
    (tier) => tier.deltaMinor,
  );
}

describe("the tier offer under availability", () => {
  it("measures every delta when nothing is switched off, so the gaps below are the switch's doing", () => {
    expect(deltasOf(offerUnder(NOTHING_DISABLED))).not.toContain(undefined);
  });

  it("one switched-off tier the kitchen did not choose blanks no delta of the other group", () => {
    const offer = offerUnder(
      aMaterialSwitchedOff(A_MATERIAL_THE_KITCHEN_DID_NOT_CHOOSE),
    );
    const stillOffered = offer.hardware.tiers.map((tier) => tier.deltaMinor);

    expect(stillOffered).not.toContain(undefined);
  });

  it("a switched-off tier is not in tierIds, the list a command takes as availableTierIds", () => {
    const offer = offerUnder(
      aMaterialSwitchedOff(A_MATERIAL_THE_KITCHEN_DID_NOT_CHOOSE),
    );

    expect(offer.material.tierIds).not.toContain(
      A_MATERIAL_THE_KITCHEN_DID_NOT_CHOOSE,
    );
  });

  it("keeps the fallback tier's own switch-off from hiding the offer, only its deltas", () => {
    const offer = offerUnder(aMaterialSwitchedOff(FALLBACK_MATERIAL));

    expect(offer.material.tierIds.length).toBeGreaterThan(1);
    expect(offer.hardware.tiers.length).toBeGreaterThan(1);
  });
});
