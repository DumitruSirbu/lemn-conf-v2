// `priceFloorOf` prices a stored kitchen for the account's card "as the editor's bar prices it" (Lot 2 U6, one price-book
// module). The claim is equality with the editor's own path: the store's catalogue at the document's cabinet depth,
// priced by `priceAgainstBook` (what `usePricedDesign` returns). A card that disagreed with the bar would show two
// different numbers for one kitchen.
import { fc } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { priceAgainstBook, priceFloorOf } from "@/price/price-book-root";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import { createConfiguratorStore } from "@/store/configurator-store";

import { ARMS, composedKitchensOf } from "../support/swept-kitchens";

/** What the editor's price hook reads: the store's design and the catalogue the store derives for it. */
function editorPricingOf(design: Design) {
  const store = createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
  });
  const { design: held, catalog } = store.getState();
  return priceAgainstBook(SAMPLE_PRICE_ROOT, held, catalog);
}

describe("priceFloorOf agrees with the editor's price hook", () => {
  it("on the shipped kitchen", () => {
    const editor = editorPricingOf(KITCHEN_L_DESIGN);
    expect(editor.ok).toBe(true);
    expect(priceFloorOf(SAMPLE_PRICE_ROOT, KITCHEN_L_DESIGN)).toEqual(
      editor.ok ? editor.priced : undefined,
    );
  });

  it.each(ARMS.map((arm) => [arm.name, arm] as const))(
    "on every kitchen the %s arm's room sweep composes",
    (_, arm) => {
      const kitchens = composedKitchensOf(arm);
      expect(kitchens.length).toBeGreaterThan(0);
      for (const { design } of kitchens) {
        const editor = editorPricingOf(design);
        expect(priceFloorOf(SAMPLE_PRICE_ROOT, design)).toEqual(
          editor.ok ? editor.priced : undefined,
        );
      }
    },
  );

  it("at the document's own cabinet depth, not a default one", () => {
    const deeper: Design = {
      ...KITCHEN_L_DESIGN,
      settings: { ...KITCHEN_L_DESIGN.settings, cabinetDepthMm: 700 },
    };
    const editor = editorPricingOf(deeper);
    expect(editor.ok).toBe(true);
    expect(priceFloorOf(SAMPLE_PRICE_ROOT, deeper)).toEqual(
      editor.ok ? editor.priced : undefined,
    );
  });

  it("with the document's own whole-kitchen selections", () => {
    const priced = priceFloorOf(SAMPLE_PRICE_ROOT, KITCHEN_L_DESIGN);
    expect(priced).toBeDefined();
    fc.assert(
      fc.property(fc.constantFrom(...ARMS), (arm) => {
        const [first] = composedKitchensOf(arm);
        if (first === undefined) return;
        expect(priceFloorOf(SAMPLE_PRICE_ROOT, first.design)?.totalMinor).toBe(
          first.pricing.ok ? first.pricing.priced.totalMinor : undefined,
        );
      }),
      { numRuns: 8 },
    );
  });
});

describe("priceFloorOf gives no figure when no honest one exists", () => {
  it("for a cabinet depth the catalogue cannot be built at (defence in depth: the schema refuses it on the wire)", () => {
    for (const cabinetDepthMm of [0, 1, 549, 550, 650, 5000]) {
      const design = {
        ...KITCHEN_L_DESIGN,
        settings: { ...KITCHEN_L_DESIGN.settings, cabinetDepthMm },
      } as Design;
      expect(
        priceFloorOf(SAMPLE_PRICE_ROOT, design),
        String(cabinetDepthMm),
      ).toBeUndefined();
    }
  });

  it("for a document the pricing refuses (a tier the book does not know)", () => {
    const design = {
      ...KITCHEN_L_DESIGN,
      settings: {
        ...KITCHEN_L_DESIGN.settings,
        materialTierId: "no-such-tier",
      },
    } as Design;
    expect(priceFloorOf(SAMPLE_PRICE_ROOT, design)).toBeUndefined();
  });

  it("is a pure function of the document: a second call gives an equal answer and leaves the document untouched", () => {
    const snapshot = structuredClone(KITCHEN_L_DESIGN);
    expect(priceFloorOf(SAMPLE_PRICE_ROOT, KITCHEN_L_DESIGN)).toEqual(
      priceFloorOf(SAMPLE_PRICE_ROOT, KITCHEN_L_DESIGN),
    );
    expect(KITCHEN_L_DESIGN).toEqual(snapshot);
  });
});
