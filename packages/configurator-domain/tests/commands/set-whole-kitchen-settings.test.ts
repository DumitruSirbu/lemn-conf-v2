// Wave 6E's two commands, and the container they write into.
//
// The tier ids here are the caller's, not the book's: the domain imports no price book (ADR 0062
// seam 1), so what makes an id "available" in these tests is that it is on the list handed in.
import { describe, expect, it } from "vitest";

import {
  setGlobalFinish,
  setHardwareTier,
  setMaterialTier,
} from "../../src/commands/set-whole-kitchen-settings.js";
import { DesignSchema } from "../../src/design.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import { freeColourFinish, paletteFinish } from "../../src/materials.js";
import { OCCURRED_AT } from "../support/commands.js";
import {
  kitchenMadeOf,
  REFUSED_FINISH_CASES,
  UNDECLARED_MATERIAL_ID,
} from "../support/finishes-the-schema-refuses.js";

const OFFERED_MATERIALS: readonly string[] = [
  "material-standard",
  "material-premium",
];
const OFFERED_HARDWARE: readonly string[] = [
  "hardware-standard",
  "hardware-premium",
];

const base = {
  design: KITCHEN_L_DESIGN,
  occurredAt: OCCURRED_AT,
} as const;

describe("setMaterialTier", () => {
  it("records the tier in the settings container and moves updatedAt", () => {
    const result = setMaterialTier({
      ...base,
      tierId: "material-premium",
      availableTierIds: OFFERED_MATERIALS,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.settings).toEqual({
      cabinetDepthMm: 600,
      materialTierId: "material-premium",
    });
    expect(result.design.updatedAt).toBe(OCCURRED_AT);
    expect(result.design.createdAt).toBe(KITCHEN_L_DESIGN.createdAt);
    // Wave 6Q-b: the effect carries ADR 0057's reset count. These tier ids are the caller's book's
    // and name no material this product declares, so nothing resolves against them (ADR 0078
    // decision 3) — `tests/commands/material-finish-reset.test.ts` is where a non-zero count lives.
    expect(result.effect).toEqual({
      type: "material_tier_set",
      materialTierId: "material-premium",
      resolvedFinishCount: 0,
    });
  });

  it("leaves the hardware key and every other field alone", () => {
    const withHardware = setHardwareTier({
      ...base,
      tierId: "hardware-premium",
      availableTierIds: OFFERED_HARDWARE,
    });
    expect(withHardware.ok).toBe(true);
    if (!withHardware.ok) return;

    const result = setMaterialTier({
      design: withHardware.design,
      occurredAt: OCCURRED_AT,
      tierId: "material-premium",
      availableTierIds: OFFERED_MATERIALS,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.settings).toEqual({
      cabinetDepthMm: 600,
      hardwareTierId: "hardware-premium",
      materialTierId: "material-premium",
    });
    expect(result.design.placements).toBe(KITCHEN_L_DESIGN.placements);
    expect(result.design.room).toBe(KITCHEN_L_DESIGN.room);
    expect(result.design.presetId).toBe(KITCHEN_L_DESIGN.presetId);
  });

  it("replaces the tier that is already there rather than adding beside it", () => {
    const first = setMaterialTier({
      ...base,
      tierId: "material-standard",
      availableTierIds: OFFERED_MATERIALS,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = setMaterialTier({
      design: first.design,
      occurredAt: OCCURRED_AT,
      tierId: "material-premium",
      availableTierIds: OFFERED_MATERIALS,
    });

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.design.settings).toEqual({
      cabinetDepthMm: 600,
      materialTierId: "material-premium",
    });
  });

  // A silently-ignored unknown tier looks identical to a broken control — `set-appearance.ts`'s own
  // stated reason for refusing rather than no-opping.
  it("refuses a tier the caller's book does not offer, untouched", () => {
    const result = setMaterialTier({
      ...base,
      tierId: "material-withdrawn",
      availableTierIds: OFFERED_MATERIALS,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("UNKNOWN_MATERIAL_TIER");
    expect(result.design).toBe(KITCHEN_L_DESIGN);
  });

  // An offered id the *document* cannot hold refuses under the same per-group code, deliberately:
  // from the customer's side a tier that cannot be stored is a tier that is not available, and a
  // third code would need a sentence that is really developer text about a malformed book.
  // QA's `set-whole-kitchen-settings.qa.test.ts` pins the invariant this protects; what is pinned
  // here is which code the customer is shown for it.
  it("refuses an offered id the schema will not store, under the same code", () => {
    const result = setMaterialTier({
      ...base,
      tierId: "",
      availableTierIds: [""],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("UNKNOWN_MATERIAL_TIER");
    expect(result.design).toBe(KITCHEN_L_DESIGN);
  });

  it("refuses a timestamp it would otherwise write into updatedAt", () => {
    const result = setMaterialTier({
      design: KITCHEN_L_DESIGN,
      occurredAt: "yesterday",
      tierId: "material-premium",
      availableTierIds: OFFERED_MATERIALS,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("INVALID_OCCURRED_AT");
    expect(result.design).toBe(KITCHEN_L_DESIGN);
  });
});

describe("setHardwareTier", () => {
  it("records the tier under its own key and publishes its own effect", () => {
    const result = setHardwareTier({
      ...base,
      tierId: "hardware-premium",
      availableTierIds: OFFERED_HARDWARE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.settings).toEqual({
      cabinetDepthMm: 600,
      hardwareTierId: "hardware-premium",
    });
    expect(result.effect).toEqual({
      type: "hardware_tier_set",
      hardwareTierId: "hardware-premium",
    });
  });

  it("leaves a material already chosen exactly where it was", () => {
    const withMaterial = setMaterialTier({
      ...base,
      tierId: "material-premium",
      availableTierIds: OFFERED_MATERIALS,
    });
    expect(withMaterial.ok).toBe(true);
    if (!withMaterial.ok) return;

    const result = setHardwareTier({
      design: withMaterial.design,
      occurredAt: OCCURRED_AT,
      tierId: "hardware-standard",
      availableTierIds: OFFERED_HARDWARE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.settings?.materialTierId).toBe("material-premium");
    expect(result.design.settings?.hardwareTierId).toBe("hardware-standard");
  });

  it("refuses a tier the caller's book does not offer, untouched", () => {
    const result = setHardwareTier({
      ...base,
      tierId: "hardware-withdrawn",
      availableTierIds: OFFERED_HARDWARE,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("UNKNOWN_HARDWARE_TIER");
    expect(result.design).toBe(KITCHEN_L_DESIGN);
  });

  // The two commands must not be able to accept each other's ids: that is the whole point of taking
  // the list, and of there being two codes rather than one.
  it("refuses a material tier id", () => {
    const result = setHardwareTier({
      ...base,
      tierId: "material-premium",
      availableTierIds: OFFERED_HARDWARE,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("UNKNOWN_HARDWARE_TIER");
  });
});

// Wave 6D's rule: the ruled copy is pinned by a **literal**, never by a composed assertion. A copy
// edit that was not ruled fails here rather than silently shipping.
// `setFinish`'s twin one scope up (ADR 0078 decisions 3 and 6, the architect's ruling): a value
// `FinishSchema` refuses is refused on any material, declared or not, and a schema-valid finish of
// either kind still lands on an undeclared one. Without the first half this command returns, as a
// success, a `settings.finish` the write seam refuses whole.
describe("setGlobalFinish and a value FinishSchema refuses", () => {
  it.each(REFUSED_FINISH_CASES)(
    "refuses %s on %s, returning the design it was given",
    (_finishName, _materialName, materialId, finish) => {
      const design = kitchenMadeOf(materialId);
      const snapshot = JSON.stringify(design);

      const result = setGlobalFinish({
        design,
        finish,
        occurredAt: OCCURRED_AT,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.code).toBe("FINISH_NOT_OFFERED");
      expect(result.reason.params).toEqual({});
      expect(result.design).toBe(design);
      expect(JSON.stringify(design)).toBe(snapshot);
    },
  );

  it.each([
    ["a free colour", freeColourFinish("#b8c4a1")],
    ["a PAL decor", paletteFinish("pal.antracit")],
    ["a veneer wood", paletteFinish("veneer.nuc")],
  ])("still records %s on an undeclared material", (_, finish) => {
    const result = setGlobalFinish({
      design: kitchenMadeOf(UNDECLARED_MATERIAL_ID),
      finish,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.settings?.finish).toEqual(finish);
    expect(result.effect).toEqual({ type: "global_finish_set", finish });
    expect(DesignSchema.safeParse(result.design).success).toBe(true);
  });

  it("still records a free colour on the picker's own material", () => {
    const finish = freeColourFinish("#b8c4a1");

    const result = setGlobalFinish({
      design: kitchenMadeOf("material.painted-mdf"),
      finish,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.settings?.finish).toEqual(finish);
  });
});

describe("the two refusals' ruled sentences", () => {
  it("says the material is gone and what to do about it", () => {
    const result = setMaterialTier({
      ...base,
      tierId: "material-withdrawn",
      availableTierIds: OFFERED_MATERIALS,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toEqual({
      code: "UNKNOWN_MATERIAL_TIER",
      params: {},
    });
  });

  it("says the hardware is gone and what to do about it", () => {
    const result = setHardwareTier({
      ...base,
      tierId: "hardware-withdrawn",
      availableTierIds: OFFERED_HARDWARE,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toEqual({
      code: "UNKNOWN_HARDWARE_TIER",
      params: {},
    });
  });
});
