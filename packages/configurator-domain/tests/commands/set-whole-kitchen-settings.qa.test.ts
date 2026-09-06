// Wave 6E adversarial QA: the two whole-kitchen commands, attacked at the guard the wave's own
// tests read past.
//
// `set-whole-kitchen-settings.test.ts` beside this one covers the happy paths and the two refusals
// it was written for. What is here is the counterexample search: the shapes `availableTierIds` can
// arrive in from a caller the domain does not control, the already-set path a short-circuit could
// silently take over, and the one property nothing in the wave asserts — that a design a command
// returns is a design the schema will take back.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  setHardwareTier,
  setMaterialTier,
} from "../../src/commands/set-whole-kitchen-settings.js";
import { MAX_IDENTIFIER_LENGTH } from "../../src/design-bounds.js";
import { DesignSchema } from "../../src/design.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import { OCCURRED_AT } from "../support/commands.js";

const OFFERED_MATERIALS: readonly string[] = [
  "material-standard",
  "material-premium",
];
const OFFERED_HARDWARE: readonly string[] = [
  "hardware-standard",
  "hardware-premium",
];

/** A second, later instant. The wave's own tests set every timestamp to `OCCURRED_AT`, so they
 *  cannot see a command that declines to move `updatedAt` at all. */
const LATER_OCCURRED_AT = "2026-08-26T09:30:00.000Z";

describe("the offer list is matched exactly, whatever shape it arrives in", () => {
  // `availableTierIds` is the caller's, and the caller holds a book that is versioned data authored
  // outside TypeScript (ADR 0062 seam 1). Each row is a list that looks like it offers the tier and
  // does not.
  const NEAR_MISSES: readonly (readonly [string, readonly string[]])[] = [
    ["an empty list", []],
    ["a list holding only the other command's ids", OFFERED_HARDWARE],
    ["the same id in a different case", ["MATERIAL-PREMIUM"]],
    ["the same id with a leading space", [" material-premium"]],
    ["the same id with a trailing space", ["material-premium "]],
    ["the same id with an inner space", ["material premium"]],
    ["a prefix of the id", ["material-prem"]],
    ["the id with the separator changed", ["material_premium"]],
  ];

  it.each(NEAR_MISSES)(
    "refuses the material tier when the offer is %s",
    (_shape, availableTierIds) => {
      const result = setMaterialTier({
        design: KITCHEN_L_DESIGN,
        tierId: "material-premium",
        availableTierIds,
        occurredAt: OCCURRED_AT,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.code).toBe("UNKNOWN_MATERIAL_TIER");
      expect(result.design).toBe(KITCHEN_L_DESIGN);
    },
  );

  it("refuses the hardware tier for an empty offer list", () => {
    const result = setHardwareTier({
      design: KITCHEN_L_DESIGN,
      tierId: "hardware-premium",
      availableTierIds: [],
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("UNKNOWN_HARDWARE_TIER");
    expect(result.design).toBe(KITCHEN_L_DESIGN);
  });

  // A list is not a set and nothing dedupes it. Membership is the only question asked of it, so a
  // repeated id must be one offer and not two — and must not, for instance, be counted.
  it("accepts an id the offer list holds twice, exactly once", () => {
    const result = setMaterialTier({
      design: KITCHEN_L_DESIGN,
      tierId: "material-premium",
      availableTierIds: [
        "material-premium",
        "material-standard",
        "material-premium",
      ],
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.settings).toEqual({
      cabinetDepthMm: 600,
      materialTierId: "material-premium",
    });
  });

  // The refusal is about membership and nothing else, so it must not be reachable by *adding* the
  // asked-for id to the list, nor avoidable by removing it. Swept rather than sampled, because the
  // transition is the whole guard.
  propertyTest.prop([
    fc.array(fc.string({ minLength: 1, maxLength: 24 }), { maxLength: 8 }),
    fc.string({ minLength: 1, maxLength: 24 }),
  ])(
    "succeeds exactly when the asked-for id is on the list",
    (availableTierIds, tierId) => {
      const result = setMaterialTier({
        design: KITCHEN_L_DESIGN,
        tierId,
        availableTierIds,
        occurredAt: OCCURRED_AT,
      });

      expect(result.ok).toBe(availableTierIds.includes(tierId));
    },
  );

  // A success may write the id it was handed and no transformation of it: a trimmed, lower-cased or
  // otherwise tidied id would be a tier the caller never offered, stored in a document.
  propertyTest.prop([fc.string({ minLength: 1, maxLength: 24 })])(
    "writes the offered id verbatim, never a normalised form of it",
    (tierId) => {
      const result = setMaterialTier({
        design: KITCHEN_L_DESIGN,
        tierId,
        availableTierIds: [tierId],
        occurredAt: OCCURRED_AT,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.design.settings?.materialTierId).toBe(tierId);
      expect(result.effect.materialTierId).toBe(tierId);
    },
  );
});

// Deliberately a success, matching `setFinish` — but a success that does the work, not one that
// hands the caller its own object back. A short-circuit on "already set" would pass every assertion
// the wave's own test makes and would freeze `updatedAt` on a design the customer just changed.
describe("setting the tier that is already set", () => {
  it("moves updatedAt to the new instant and returns a different object", () => {
    const first = setMaterialTier({
      design: KITCHEN_L_DESIGN,
      tierId: "material-premium",
      availableTierIds: OFFERED_MATERIALS,
      occurredAt: OCCURRED_AT,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const again = setMaterialTier({
      design: first.design,
      tierId: "material-premium",
      availableTierIds: OFFERED_MATERIALS,
      occurredAt: LATER_OCCURRED_AT,
    });

    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.design).not.toBe(first.design);
    expect(again.design.updatedAt).toBe(LATER_OCCURRED_AT);
    expect(again.design.settings).toEqual({
      cabinetDepthMm: 600,
      materialTierId: "material-premium",
    });
  });

  it("moves updatedAt for the hardware command too", () => {
    const first = setHardwareTier({
      design: KITCHEN_L_DESIGN,
      tierId: "hardware-premium",
      availableTierIds: OFFERED_HARDWARE,
      occurredAt: OCCURRED_AT,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.design.updatedAt).toBe(OCCURRED_AT);

    const again = setHardwareTier({
      design: first.design,
      tierId: "hardware-premium",
      availableTierIds: OFFERED_HARDWARE,
      occurredAt: LATER_OCCURRED_AT,
    });

    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.design).not.toBe(first.design);
    expect(again.design.updatedAt).toBe(LATER_OCCURRED_AT);
  });

  // The refusal is decided before membership, so an already-set tier is no exemption from it.
  it("still refuses an invalid timestamp", () => {
    const first = setMaterialTier({
      design: KITCHEN_L_DESIGN,
      tierId: "material-premium",
      availableTierIds: OFFERED_MATERIALS,
      occurredAt: OCCURRED_AT,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const again = setMaterialTier({
      design: first.design,
      tierId: "material-premium",
      availableTierIds: OFFERED_MATERIALS,
      occurredAt: "yesterday",
    });

    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.reason.code).toBe("INVALID_OCCURRED_AT");
    expect(again.design).toBe(first.design);
  });
});

// **The seam nothing in the wave closes.** `DesignSettingsSchema` bounds a tier id for shape —
// non-empty, at most `MAX_IDENTIFIER_LENGTH` — and is the gate both the API write path and
// `migrateDesign` pass through. The commands never ask it anything: they check membership of a list
// the caller supplies, and the caller's list comes from a price book, which ADR 0062 seam 1 makes
// versioned data authored outside TypeScript. A book declaring a tier id the schema refuses
// therefore produces a design that cannot be saved and cannot be reloaded.
describe("every design a command returns is one the schema takes back", () => {
  const UNSTORABLE_TIER_IDS: readonly (readonly [string, string])[] = [
    ["an empty id", ""],
    [
      "an id one character past the bound",
      "x".repeat(MAX_IDENTIFIER_LENGTH + 1),
    ],
  ];

  it.each(UNSTORABLE_TIER_IDS)(
    "refuses %s rather than writing a design DesignSchema rejects",
    (_shape, tierId) => {
      const result = setMaterialTier({
        design: KITCHEN_L_DESIGN,
        tierId,
        availableTierIds: [tierId],
        occurredAt: OCCURRED_AT,
      });

      if (!result.ok) return;
      expect(DesignSchema.safeParse(result.design).success).toBe(true);
    },
  );

  it("accepts an id at exactly the identifier bound", () => {
    const tierId = "x".repeat(MAX_IDENTIFIER_LENGTH);
    const result = setHardwareTier({
      design: KITCHEN_L_DESIGN,
      tierId,
      availableTierIds: [tierId],
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(DesignSchema.safeParse(result.design).success).toBe(true);
  });
});
