// **The three materials the domain declares and the material tiers a book prices are one list.**
//
// This file is where they meet, and it is a test rather than a runtime check for the reason ADR 0062
// seam 1 gives: the domain imports no book, so nothing inside `materials.ts` can ask whether a tier
// exists and nothing inside `pricing/` may ask what a material is. A composition root holds both, and
// so does this file.
//
// **Falsifiable in both directions on purpose.** A fourth material with no tier renders a colour
// control nobody can price; a fourth tier with no material prices a kitchen no colour control
// offers. Two independent lists of three is ADR 0028's failure one seam over — the same shape as a
// declaration that has quietly stopped tracking what it declares — and only a sweep in both
// directions catches the second kind.
import { describe, expect, it } from "vitest";

import {
  DEFAULT_MATERIAL_ID,
  MATERIAL_IDS,
  MATERIALS,
  materialById,
} from "../../src/materials.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

const TIER_IDS = SAMPLE_PRICE_BOOK.material.tiers.map((tier) => tier.tierId);

function amountFor(materialId: string): number {
  const tier = SAMPLE_PRICE_BOOK.material.tiers.find(
    (candidate) => candidate.tierId === materialId,
  );
  if (!tier) throw new Error(`the sample book prices no "${materialId}"`);
  return tier.wholeKitchenMinor;
}

describe("the price book's material tier ids are exactly the declared materials", () => {
  it("declares a material for every tier the shipped book prices", () => {
    for (const tierId of TIER_IDS) {
      expect(() => materialById(tierId)).not.toThrow();
    }
  });

  it("prices a tier for every material the domain declares", () => {
    for (const materialId of MATERIAL_IDS) {
      expect(TIER_IDS).toContain(materialId);
    }
  });

  it("holds the two lists to the same length, so neither can grow unnoticed", () => {
    // The half the two sweeps above leave open: a duplicate tier id would satisfy both while the
    // book prices one material twice.
    expect(new Set(TIER_IDS).size).toBe(TIER_IDS.length);
    expect(TIER_IDS.length).toBe(MATERIAL_IDS.length);
  });

  it("fails when a material has no tier", () => {
    // Not a vacuous pair of sweeps: an id the book does not price is refused by the same assertion
    // the sweep above makes, so the sweep is testing something.
    expect(TIER_IDS).not.toContain("material.solid-oak");
    expect(() => materialById("material.solid-oak")).toThrow(
      /no material is declared/,
    );
  });

  it("prices the materials in the order the domain declares them", () => {
    // ADR 0071 decision 1: PAL < MDF < veneer. The order is a declared product fact, and a book
    // whose amounts contradict it is a book fault — the material list would then be sorted by
    // nothing a reader can see.
    const amounts = MATERIAL_IDS.map(amountFor);

    expect(amounts).toEqual([...amounts].sort((one, other) => one - other));
  });

  it("agrees with the book on which material an unset design is priced at", () => {
    expect(SAMPLE_PRICE_BOOK.material.defaultTierId).toBe(DEFAULT_MATERIAL_ID);
  });

  it("gives every declared material a default finish it can actually offer", () => {
    // The reset target ADR 0057 resolves to. A material whose default is not on its own palette is
    // a reset that produces an unofferable finish — which is the invariant wave 6Q enforces, made
    // impossible to write here rather than caught there.
    for (const material of MATERIALS) {
      const { colourControl, defaultFinish } = material;
      if (colourControl.shape === "ral-picker") {
        expect(defaultFinish.kind).toBe("free-colour");
        continue;
      }
      expect(defaultFinish.kind).toBe("palette-entry");
      expect(colourControl.entries.map((entry) => entry.entryId)).toContain(
        defaultFinish.kind === "palette-entry" ? defaultFinish.entryId : "",
      );
    }
  });
});
