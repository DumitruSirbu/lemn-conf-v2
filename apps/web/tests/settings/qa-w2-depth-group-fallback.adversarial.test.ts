// **Adversarial QA for wave W2: the depth group's fallback, scoped rather than fixed.**
//
// The implementer disclosed that `toDepthGroupView` falls back to `DEFAULT_CABINET_DEPTH_MM` the
// same way `selectedTierIn` falls back to a group's default, and reported the depth group as
// carrying M6-AUD-012's defect unfixed. This file settles that, because the answer changes what the
// architect has to schedule.
//
// **It does not carry it, and the reason is that a tier id and a depth are validated differently.**
// A price book is not in the schema's world (ADR 0062 seam 1), so a stored `materialTierId` the book
// has withdrawn is a schema-valid document — that is precisely why M6-AUD-012 was reachable. A depth
// is in the schema's world: `DesignSettingsSchema` refuses anything outside the declared map, so the
// state the fallback exists for — a stored depth the sheet does not offer — cannot be loaded.
//
// The trap the tier group fell into is *displayed ≠ pending*. That is the property asserted here,
// over every depth a document may legally carry, rather than the fallback's presence.
//
// **What would open it** is asserted too: the moment `offeredCabinetDepthsMm` publishes fewer depths
// than the schema accepts, a valid document can name a depth the sheet does not offer, and the tier
// group's defect arrives on the depth group with no code change at all.
import {
  cabinetDepthMmOf,
  declaredCabinetDepthsMm,
  DEFAULT_CABINET_DEPTH_MM,
  DesignSchema,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  MIN_CABINET_DEPTH_MM,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  countCabinetsWearingAChosenFinish,
  type Design,
} from "@lemnaria/configurator-domain";
import { ro } from "../support/romanian-content";
import { describe, expect, it } from "vitest";

import { offerWholeKitchenTiers } from "@/price/whole-kitchen-tiers";
import {
  describeGlobalSettings,
  resolveOpeningChoice,
} from "@/settings/global-settings-model";

/** A number the wall-depth map does not declare, and the one a legacy or hand-edited document would
 *  most plausibly carry. */
const UNDECLARED_DEPTH_MM = 650;

function designWithDepth(cabinetDepthMm: number | undefined): Design {
  // The key is **removed** rather than set to `undefined` where there is no depth: `DesignSchema` is
  // a strict object and a pre-6J-a document is one that does not carry the field at all.
  const stored = KITCHEN_L_DESIGN.settings ?? {};
  return {
    ...KITCHEN_L_DESIGN,
    settings: {
      ...(stored.materialTierId === undefined
        ? {}
        : { materialTierId: stored.materialTierId }),
      ...(stored.hardwareTierId === undefined
        ? {}
        : { hardwareTierId: stored.hardwareTierId }),
      ...(cabinetDepthMm === undefined ? {} : { cabinetDepthMm }),
    },
  };
}

/** The depth the sheet paints as checked, read off the view the component renders — the same route
 *  `withdrawn-tier-recovery.test.ts` reads a tier's displayed selection by. */
function displayedDepthOf(design: Design): number {
  const priced = {
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  };
  const offer = offerWholeKitchenTiers(priced);
  const view = describeGlobalSettings({
    content: ro,
    pricing: priceDesign(priced),
    offer,
    groups: projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG),
    applied: design.settings ?? {},
    pending: resolveOpeningChoice(design.settings ?? {}, offer),
    chosenColourCount: countCabinetsWearingAChosenFinish(design),
  });
  const selected = view.depthGroup.options.filter(
    (option) => option.isSelected,
  );
  expect(selected.length).toBe(1);
  return selected[0]?.cabinetDepthMm ?? 0;
}

describe("the depth a document may legally carry", () => {
  it("is refused by the schema when the declared map does not name it", () => {
    // The gate that makes the fallback unreachable, asserted rather than assumed. If this ever
    // loosens, the sheet inherits M6-AUD-012 on the depth group without a line of it changing.
    const parsed = DesignSchema.safeParse(designWithDepth(UNDECLARED_DEPTH_MM));

    expect(parsed.success).toBe(false);
    expect(declaredCabinetDepthsMm()).not.toContain(UNDECLARED_DEPTH_MM);
  });

  it("is accepted for every depth the map declares, and for none at all", () => {
    for (const cabinetDepthMm of [...declaredCabinetDepthsMm(), undefined])
      expect(
        DesignSchema.safeParse(designWithDepth(cabinetDepthMm)).success,
        String(cabinetDepthMm),
      ).toBe(true);
  });
});

describe("the sheet's depth group, over every document the schema accepts", () => {
  it("checks the depth the design is actually built at, so no press is a no-op that looks like one", () => {
    // M6-AUD-012's shape stated as a property: the trap was *displayed ≠ pending*, so the checked
    // radio fired no change and Apply exited as unchanged. Here the two agree at every legal value.
    for (const cabinetDepthMm of [...declaredCabinetDepthsMm(), undefined]) {
      const design = designWithDepth(cabinetDepthMm);
      const label = String(cabinetDepthMm);

      expect(displayedDepthOf(design), label).toBe(cabinetDepthMmOf(design));
    }
  });

  it("leaves an unnamed depth unnamed while displaying the default it is built at", () => {
    // The pair that would look contradictory without the distinction: a pre-6J-a document carries no
    // depth, the sheet checks 600, and `resolveOpeningChoice` still writes nothing — because 600 is
    // what `cabinetDepthMmOf` already resolves it to, so applying it is not a change.
    const noDepth = designWithDepth(undefined);

    expect(displayedDepthOf(noDepth)).toBe(DEFAULT_CABINET_DEPTH_MM);
    expect(
      resolveOpeningChoice(
        noDepth.settings ?? {},
        offerWholeKitchenTiers({
          design: noDepth,
          catalog: KITCHEN_L_BODY_CATALOG,
          book: SAMPLE_PRICE_BOOK,
          pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
          selections: noDepth.settings,
        }),
      ).cabinetDepthMm,
    ).toBeUndefined();
  });
});

describe("the condition that would open the defect on this group", () => {
  it("is that the sheet offers fewer depths than the schema accepts, and today it offers all of them", () => {
    // `offeredCabinetDepthsMm` filters the declared map by `MIN_CABINET_DEPTH_MM` while
    // `DesignSettingsSchema` applies the same floor, so the two lists agree. A declared depth below
    // the floor — or any other filter added to the offer — would be schema-valid and unofferable at
    // once, which is exactly the tier group's situation.
    const offerableByTheSchema = declaredCabinetDepthsMm().filter(
      (cabinetDepthMm) => cabinetDepthMm >= MIN_CABINET_DEPTH_MM,
    );

    expect(offerableByTheSchema).toEqual(declaredCabinetDepthsMm());
    expect(declaredCabinetDepthsMm().length).toBeGreaterThan(1);
  });
});
