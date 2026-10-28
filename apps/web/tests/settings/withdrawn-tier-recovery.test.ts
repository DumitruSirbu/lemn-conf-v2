// **The displayed fallback has to be the one a single press stores** (M6-AUD-012).
//
// A design carrying a tier the book has since withdrawn cannot be priced, and this sheet is the one
// control that can put it right. It already rendered the group's default as checked — `selectedTierIn`
// resolves an unoffered id to it — but the sheet opened on the stored id copied verbatim, so:
//
//   - the default radio was already checked, and tapping it fired no change;
//   - *Aplică* compared the still-withdrawn pending id against the identical applied id and exited
//     as unchanged;
//   - pricing stayed unavailable, and the only escape was to pick another tier and come back.
//
// Verified in a browser against a real document holding `materialTierId: "material.withdrawn"`.
//
// The fix is `resolveOpeningChoice`: the sheet opens on what it displays. What this file has to hold
// is **both** halves of that — the recovery, and the invariant it must not buy the recovery with:
// *cancel writes nothing, and apply writes only what changed*. Seeding the book's defaults into a
// document that had deliberately chosen nothing would close the defect and open a worse one.
import { SAMPLE_DEEP_CABINET_PERCENT } from "../support/sample-deep-cabinet-percent";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  countCabinetsWearingAChosenFinish,
  type Design,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { ro } from "../support/romanian-content";
import { describe, expect, it } from "vitest";

import {
  offerWholeKitchenTiers,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";
import {
  describeGlobalSettings,
  resolveOpeningChoice,
  type WholeKitchenGroupKey,
} from "@/settings/global-settings-model";
import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";

const WITHDRAWN_TIER_ID = "material.withdrawn";
const WITHDRAWN_HARDWARE_TIER_ID = "hardware.withdrawn";

const MATERIAL_TIER_IDS = SAMPLE_PRICE_BOOK.material.tiers.map(
  (tier) => tier.tierId,
);
const HARDWARE_TIER_IDS = SAMPLE_PRICE_BOOK.hardware.tiers.map(
  (tier) => tier.tierId,
);

function pricingOf(design: Design): PricingResult {
  return priceDesign({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
}

function offerOf(design: Design): WholeKitchenTierOffer {
  return offerWholeKitchenTiers({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
}

/** The tier the sheet paints as checked, read off the same view the component renders. */
function displayedTierIn(design: Design, key: WholeKitchenGroupKey): string {
  const opening = resolveOpeningChoice(design.settings ?? {}, offerOf(design));
  const view = describeGlobalSettings({
    deepCabinetPercent: SAMPLE_DEEP_CABINET_PERCENT,
    content: ro,
    pricing: pricingOf(design),
    offer: offerOf(design),
    groups: projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG),
    applied: design.settings ?? {},
    pending: opening,
    chosenColourCount: countCabinetsWearingAChosenFinish(design),
  });
  const group = view.groups.find((one) => one.key === key);
  if (!group) throw new Error(`no ${key} group was described`);
  const selected = group.options.filter((option) => option.isSelected);
  expect(selected.length, key).toBe(1);
  return selected[0]?.tierId ?? "";
}

/** One press of *Aplică*, exactly as `applyPending` performs it: the resolved opening choice, and
 *  nothing the customer did not touch. */
function applyWithoutTouchingARadio(design: Design) {
  const store = createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
  });
  const opening = resolveOpeningChoice(design.settings ?? {}, offerOf(design));
  const outcome = store.getState().applyWholeKitchenSettings({
    ...(opening.materialTierId === undefined
      ? {}
      : { materialTierId: opening.materialTierId }),
    ...(opening.hardwareTierId === undefined
      ? {}
      : { hardwareTierId: opening.hardwareTierId }),
    ...(opening.cabinetDepthMm === undefined
      ? {}
      : { cabinetDepthMm: opening.cabinetDepthMm }),
    availableMaterialTierIds: MATERIAL_TIER_IDS,
    availableHardwareTierIds: HARDWARE_TIER_IDS,
  });
  return { outcome, stored: store.getState().design };
}

const WITHDRAWN_IN: Readonly<Record<WholeKitchenGroupKey, Design>> = {
  material: {
    ...KITCHEN_L_DESIGN,
    settings: { materialTierId: WITHDRAWN_TIER_ID },
  },
  hardware: {
    ...KITCHEN_L_DESIGN,
    settings: { hardwareTierId: WITHDRAWN_HARDWARE_TIER_ID },
  },
};

describe("a document holding a tier the book no longer offers", () => {
  it("cannot be priced, in either group — so this is the state the recovery is for", () => {
    for (const key of ["material", "hardware"] as const)
      expect(pricingOf(WITHDRAWN_IN[key]).ok, key).toBe(false);
  });

  it("opens the sheet on the tier it displays, not on the id the document carries", () => {
    for (const key of ["material", "hardware"] as const) {
      const design = WITHDRAWN_IN[key];
      const opening = resolveOpeningChoice(
        design.settings ?? {},
        offerOf(design),
      );
      const openingTierId =
        key === "material" ? opening.materialTierId : opening.hardwareTierId;

      expect(openingTierId, key).toBe(displayedTierIn(design, key));
      expect(openingTierId, key).toBe(SAMPLE_PRICE_BOOK[key].defaultTierId);
    }
  });

  it("stores the displayed tier on one press, with no radio touched, and prices again", () => {
    for (const key of ["material", "hardware"] as const) {
      const design = WITHDRAWN_IN[key];
      const displayed = displayedTierIn(design, key);
      const { outcome, stored } = applyWithoutTouchingARadio(design);

      expect(outcome.committed, key).toBe(true);
      const storedTierId =
        key === "material"
          ? stored.settings?.materialTierId
          : stored.settings?.hardwareTierId;
      expect(storedTierId, key).toBe(displayed);
      // The whole point of the recovery: the document is priceable again, so the bar and the
      // deltas come back.
      expect(pricingOf(stored).ok, key).toBe(true);
    }
  });
});

describe("the invariant the recovery must not buy itself with", () => {
  it("leaves a document that names no tier exactly as it found it", () => {
    // The trap: seeding an absent choice with the book's default would make one press of *Aplică*
    // on an untouched sheet stamp defaults into a document that deliberately chose nothing.
    const untouched: Design = { ...KITCHEN_L_DESIGN, settings: {} };
    const opening = resolveOpeningChoice({}, offerOf(untouched));

    expect(opening.materialTierId).toBeUndefined();
    expect(opening.hardwareTierId).toBeUndefined();

    const { outcome, stored } = applyWithoutTouchingARadio(untouched);

    expect(outcome.committed).toBe(true);
    expect(stored).toBe(untouched);
    expect(stored.updatedAt).toBe(untouched.updatedAt);
  });

  it("leaves a document holding an offered tier exactly as it found it", () => {
    for (const materialTierId of MATERIAL_TIER_IDS) {
      const design: Design = {
        ...KITCHEN_L_DESIGN,
        settings: { materialTierId },
      };
      const { outcome, stored } = applyWithoutTouchingARadio(design);

      expect(outcome.committed, materialTierId).toBe(true);
      expect(stored.updatedAt, materialTierId).toBe(design.updatedAt);
      expect(stored.settings?.materialTierId, materialTierId).toBe(
        materialTierId,
      );
    }
  });
});
